import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration001Sql from "../../supabase/migrations/001_initial_schema.sql?raw";
import migration002Sql from "../../supabase/migrations/002_v2_schema.sql?raw";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const LEGACY_APP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

async function asUser<T>(
  db: PGlite,
  userId: string,
  fn: (tx: { query: PGlite["query"] }) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated;`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true);`, [userId]);
    return await fn(tx);
  });
}

async function expectUserQueryError(
  db: PGlite,
  userId: string,
  sql: string,
  params: unknown[],
  expectedPattern: RegExp
): Promise<void> {
  let caught: Error | null = null;
  try {
    await asUser(db, userId, async (tx) => {
      await tx.query(sql, params);
    });
  } catch (err) {
    caught = err instanceof Error ? err : new Error(String(err));
  }
  expect(caught).not.toBeNull();
  expect(caught?.message).toMatch(expectedPattern);
}

describe("Postgres Migration 002 — schema, 2-user RLS, atomic credits, sleeping", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();

    // Minimal Supabase Auth & Role harness inside real PostgreSQL
    await db.exec(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then
          create role anon nologin noinherit;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then
          create role authenticated nologin noinherit;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then
          create role service_role nologin noinherit bypassrls;
        end if;
      end $$;

      create schema if not exists auth;
      create table if not exists auth.users (
        id uuid primary key,
        email text unique
      );
      create or replace function auth.uid()
      returns uuid
      language sql
      stable
      as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
    `);

    // 1. Run v1 initial schema
    await db.exec(migration001Sql);

    // 2. Seed pre-migration v1 user + app + app_data to verify backfill & zero data loss
    await db.query(`insert into auth.users (id, email) values ($1, 'a@simple.test')`, [USER_A]);
    await db.query(
      `insert into apps (id, user_id, name, icon, manifest) values ($1, $2, 'Legacy Clock', '🕰️', '{"app_id":"legacy","name":"Legacy Clock","icon":"🕰️","permissions":[],"components":[],"actions":[]}'::jsonb)`,
      [LEGACY_APP_ID, USER_A]
    );
    await db.query(
      `insert into app_data (app_id, key, value) values ($1, 'tz', '"UTC"'::jsonb)`,
      [LEGACY_APP_ID]
    );

    // 3. Apply v2 migration 002 on top of live v1 state
    await db.exec(migration002Sql);

    // 4. Grant Supabase schema/table API privileges to authenticated role so RLS governs access
    await db.exec(`
      grant usage on schema public to anon, authenticated;
      grant select, insert, update, delete on all tables in schema public to authenticated;
      grant select on templates to anon;
    `);

    // 5. Seed second user AFTER migration 002 to exercise signup entitlement trigger too
    await db.query(`insert into auth.users (id, email) values ($1, 'b@simple.test')`, [USER_B]);
  });

  afterAll(async () => {
    await db.close();
  });

  it("preserves legacy v1 rows and backfills v2 columns, app_members, and entitlements", async () => {
    const appRes = await db.query<{
      schema_version: number;
      status: string;
      is_shared: boolean;
    }>(`select schema_version, status, is_shared from apps where id = $1`, [LEGACY_APP_ID]);
    expect(appRes.rows[0]).toEqual({
      schema_version: 1,
      status: "active",
      is_shared: false,
    });

    const memberRes = await db.query<{ role: string }>(
      `select role from app_members where app_id = $1 and user_id = $2`,
      [LEGACY_APP_ID, USER_A]
    );
    expect(memberRes.rows[0]?.role).toBe("owner");

    const entA = await db.query<{ plan: string; active_app_limit: number; monthly_credit_limit: number }>(
      `select plan, active_app_limit, monthly_credit_limit from entitlements where user_id = $1`,
      [USER_A]
    );
    const entB = await db.query<{ plan: string; active_app_limit: number; monthly_credit_limit: number }>(
      `select plan, active_app_limit, monthly_credit_limit from entitlements where user_id = $1`,
      [USER_B]
    );
    expect(entA.rows[0]).toEqual({ plan: "free", active_app_limit: 3, monthly_credit_limit: 100 });
    expect(entB.rows[0]).toEqual({ plan: "free", active_app_limit: 3, monthly_credit_limit: 100 });
  });

  it("enforces two-user RLS isolation across apps, app_data, collection_records, connections, and usage", async () => {
    await asUser(db, USER_A, async (tx) => {
      await tx.query(
        `insert into connections (user_id, connector_id, label, server_url, allowed_tools) values ($1, 'home_assistant', 'My HA', 'https://ha.example.com/mcp', array['light.toggle'])`,
        [USER_A]
      );
      await tx.query(
        `insert into collection_records (app_id, collection_name, owner_id, is_shared, data) values ($1, 'notes', $2, false, '{"note":"secret"}'::jsonb)`,
        [LEGACY_APP_ID, USER_A]
      );
      await tx.query(
        `insert into generation_jobs (user_id, app_id, prompt, state) values ($1, $2, 'make clock', 'DONE')`,
        [USER_A, LEGACY_APP_ID]
      );
    });

    // User B cannot see or update User A's rows
    await asUser(db, USER_B, async (tx) => {
      const apps = await tx.query(`select id from apps where id = $1`, [LEGACY_APP_ID]);
      expect(apps.rows).toHaveLength(0);

      const appData = await tx.query(`select key from app_data where app_id = $1`, [LEGACY_APP_ID]);
      expect(appData.rows).toHaveLength(0);

      const conns = await tx.query(`select id from connections`);
      expect(conns.rows).toHaveLength(0);

      const jobs = await tx.query(`select id from generation_jobs`);
      expect(jobs.rows).toHaveLength(0);

      const records = await tx.query(`select id from collection_records`);
      expect(records.rows).toHaveLength(0);

      const entA = await tx.query(`select user_id from entitlements where user_id = $1`, [USER_A]);
      expect(entA.rows).toHaveLength(0);

      const upd = await tx.query(`update apps set name = 'Hacked' where id = $1 returning id`, [LEGACY_APP_ID]);
      expect(upd.rows).toHaveLength(0);
    });

    // User B cannot insert app_data into User A's app
    await expectUserQueryError(
      db,
      USER_B,
      `insert into app_data (app_id, key, value) values ($1, 'evil', 'true'::jsonb)`,
      [LEGACY_APP_ID],
      /row-level security/i
    );
  });

  it("blocks clients from self-upgrading entitlements, forging ledger entries, or calling credit RPCs", async () => {
    await asUser(db, USER_A, async (tx) => {
      const res = await tx.query(
        `update entitlements set plan = 'pro', monthly_credit_limit = 99999 where user_id = $1 returning plan`,
        [USER_A]
      );
      expect(res.rows).toHaveLength(0);
    });

    await expectUserQueryError(
      db,
      USER_A,
      `insert into usage_ledger (user_id, action_kind, credit_cost_class, credits_charged) values ($1, 'llm_call', 'runtime_llm', 0)`,
      [USER_A],
      /row-level security/i
    );

    await expectUserQueryError(
      db,
      USER_A,
      `select * from consume_credits($1, 0, 'llm_call', 'runtime_llm')`,
      [USER_A],
      /permission denied/i
    );

    await expectUserQueryError(
      db,
      USER_A,
      `select * from enforce_active_limit($1)`,
      [USER_A],
      /permission denied/i
    );

    const verifyPlan = await db.query<{ plan: string; monthly_credit_limit: number }>(
      `select plan, monthly_credit_limit from entitlements where user_id = $1`,
      [USER_A]
    );
    expect(verifyPlan.rows[0]).toEqual({ plan: "free", monthly_credit_limit: 100 });
  });

  it("allows viewer read on shared app/records while forbidding viewer writes", async () => {
    await db.query(
      `insert into app_members (app_id, user_id, role) values ($1, $2, 'viewer') on conflict (app_id, user_id) do update set role = 'viewer'`,
      [LEGACY_APP_ID, USER_B]
    );
    await db.query(
      `insert into collection_records (app_id, collection_name, owner_id, is_shared, data) values ($1, 'notes', $2, true, '{"note":"shared"}'::jsonb)`,
      [LEGACY_APP_ID, USER_A]
    );

    await asUser(db, USER_B, async (tx) => {
      const sharedApp = await tx.query<{ id: string }>(`select id from apps where id = $1`, [LEGACY_APP_ID]);
      expect(sharedApp.rows).toHaveLength(1);

      const sharedNotes = await tx.query<{ is_shared: boolean }>(
        `select is_shared from collection_records where app_id = $1`,
        [LEGACY_APP_ID]
      );
      expect(sharedNotes.rows).toHaveLength(1);
      expect(sharedNotes.rows[0]?.is_shared).toBe(true);

      const appUpd = await tx.query(`update apps set name = 'Renamed by viewer' where id = $1 returning id`, [
        LEGACY_APP_ID,
      ]);
      expect(appUpd.rows).toHaveLength(0);
    });

    await expectUserQueryError(
      db,
      USER_B,
      `insert into collection_records (app_id, collection_name, owner_id, is_shared, data) values ($1, 'notes', $2, true, '{"note":"viewer write"}'::jsonb)`,
      [LEGACY_APP_ID, USER_B],
      /row-level security/i
    );
  });

  it("consume_credits enforces quota atomically, rolls expired month period, and records ledger", async () => {
    const r1 = await db.query<{
      allowed: boolean;
      remaining_credits: number;
      credits_used: number;
      monthly_credit_limit: number;
    }>(
      `select * from consume_credits($1, 5, 'generate_app', 'generation', $2, '{"source":"test"}'::jsonb)`,
      [USER_A, LEGACY_APP_ID]
    );
    expect(r1.rows[0]).toEqual({
      allowed: true,
      remaining_credits: 95,
      credits_used: 5,
      monthly_credit_limit: 100,
    });

    // Reject overdraft without modifying credits_used or adding ledger row
    const rOver = await db.query<{
      allowed: boolean;
      remaining_credits: number;
      credits_used: number;
    }>(`select * from consume_credits($1, 96, 'llm_call', 'runtime_llm', $2)`, [USER_A, LEGACY_APP_ID]);
    expect(rOver.rows[0]?.allowed).toBe(false);
    expect(rOver.rows[0]?.credits_used).toBe(5);
    expect(rOver.rows[0]?.remaining_credits).toBe(95);

    const ledgerRows = await db.query<{ credits_charged: number; credit_cost_class: string }>(
      `select credits_charged, credit_cost_class from usage_ledger where user_id = $1`,
      [USER_A]
    );
    expect(ledgerRows.rows).toEqual([{ credits_charged: 5, credit_cost_class: "generation" }]);

    // Negative charge must raise
    await expect(
      db.query(`select * from consume_credits($1, -5, 'llm_call', 'runtime_llm')`, [USER_A])
    ).rejects.toThrow(/non-negative/i);

    // Expired billing month resets credits_used automatically
    await db.query(
      `update entitlements set period_start = now() - interval '35 days' where user_id = $1`,
      [USER_A]
    );
    const rRoll = await db.query<{ allowed: boolean; credits_used: number; remaining_credits: number }>(
      `select * from consume_credits($1, 2, 'llm_call', 'runtime_llm', $2)`,
      [USER_A, LEGACY_APP_ID]
    );
    expect(rRoll.rows[0]?.allowed).toBe(true);
    expect(rRoll.rows[0]?.credits_used).toBe(2);
    expect(rRoll.rows[0]?.remaining_credits).toBe(98);
  });

  it("sleeps excess apps on limit instead of deleting rows and guards waking past limit", async () => {
    // USER_B starts with 0 apps and free limit = 3
    for (let i = 1; i <= 4; i++) {
      await asUser(db, USER_B, async (tx) => {
        await tx.query(
          `insert into apps (user_id, name, icon, manifest, updated_at, created_at)
           values ($1, $2, '📱', '{"schema_version":2,"app_id":"a","name":"App","icon":"📱","screens":[]}'::jsonb, now() + ($3 || ' seconds')::interval, now() + ($3 || ' seconds')::interval)`,
          [USER_B, `App ${i}`, String(i * 10)]
        );
      });
    }

    // All 4 rows exist (NOTHING deleted); oldest 1 became sleeping while 3 remain active
    const allApps = await db.query<{ id: string; name: string; status: string }>(
      `select id, name, status from apps where user_id = $1 order by created_at asc`,
      [USER_B]
    );
    expect(allApps.rows).toHaveLength(4);
    expect(allApps.rows.filter((a) => a.status === "active")).toHaveLength(3);
    expect(allApps.rows.filter((a) => a.status === "sleeping")).toHaveLength(1);
    expect(allApps.rows[0]?.status).toBe("sleeping");

    const sleepingAppId = allApps.rows[0]!.id;
    const activeAppId = allApps.rows[1]!.id;

    // Cannot wake App 1 while 3 others are active
    await expectUserQueryError(
      db,
      USER_B,
      `update apps set status = 'active' where id = $1`,
      [sleepingAppId],
      /ACTIVE_APP_LIMIT_REACHED/
    );

    // Putting App 2 to sleep frees a slot cleanly, allowing App 1 to wake
    await asUser(db, USER_B, async (tx) => {
      await tx.query(`update apps set status = 'sleeping' where id = $1`, [activeAppId]);
      await tx.query(`update apps set status = 'active' where id = $1`, [sleepingAppId]);
    });

    const afterSwap = await db.query<{ id: string; status: string }>(
      `select id, status from apps where user_id = $1`,
      [USER_B]
    );
    expect(afterSwap.rows.find((a) => a.id === sleepingAppId)?.status).toBe("active");
    expect(afterSwap.rows.find((a) => a.id === activeAppId)?.status).toBe("sleeping");

    // Simulate plan downgrade or enforce_active_limit to 2 apps: keeps all 4 rows, sleeps 2
    await db.query(`update entitlements set plan = 'free', active_app_limit = 2 where user_id = $1`, [
      USER_B,
    ]);
    const enforced = await db.query<{ slept_count: number; active_count: number; active_app_limit: number }>(
      `select * from enforce_active_limit($1)`,
      [USER_B]
    );
    expect(enforced.rows[0]).toEqual({ slept_count: 1, active_count: 2, active_app_limit: 2 });

    const afterDowngrade = await db.query<{ status: string }>(
      `select status from apps where user_id = $1`,
      [USER_B]
    );
    expect(afterDowngrade.rows).toHaveLength(4);
    expect(afterDowngrade.rows.filter((a) => a.status === "sleeping")).toHaveLength(2);
  });

  it("forbids editors from transferring app ownership via apps.user_id update", async () => {
    await db.query(
      `insert into app_members (app_id, user_id, role) values ($1, $2, 'editor') on conflict (app_id, user_id) do update set role = 'editor'`,
      [LEGACY_APP_ID, USER_B]
    );

    await expectUserQueryError(
      db,
      USER_B,
      `update apps set user_id = $1 where id = $2`,
      [USER_B, LEGACY_APP_ID],
      /APP_OWNER_IMMUTABLE/
    );
  });
});
