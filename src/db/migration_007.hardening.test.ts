import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration001Sql from "../../supabase/migrations/001_initial_schema.sql?raw";
import migration002Sql from "../../supabase/migrations/002_v2_schema.sql?raw";
import migration006Sql from "../../supabase/migrations/006_realtime.sql?raw";
import migration007Sql from "../../supabase/migrations/007_hardening.sql?raw";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const EDITOR_ID = "22222222-2222-4222-8222-222222222222";
const APP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

async function asUser<T>(
  db: PGlite,
  role: string,
  userId: string | null,
  fn: (tx: { query: PGlite["query"] }) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.exec(`set local role ${role};`);
    if (userId) {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true);`, [userId]);
    }
    return await fn(tx);
  });
}

describe("Postgres Migration 007 — Security Hardening (RLS, RPC & Schema)", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();

    // Supabase Auth & Role harness
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

    // Run migrations 001, 002, 006, 007
    await db.exec(migration001Sql);
    await db.exec(migration002Sql);
    await db.exec(migration006Sql);
    await db.exec(migration007Sql);

    // Standard Supabase grants
    await db.exec(`
      grant usage on schema public to anon, authenticated;
      grant all on all tables in schema public to anon, authenticated;
    `);

    // Seed users
    await db.query(`insert into auth.users (id, email) values ($1, 'owner@simple.test')`, [OWNER_ID]);
    await db.query(`insert into auth.users (id, email) values ($1, 'editor@simple.test')`, [EDITOR_ID]);

    // Seed owner's app
    await db.query(
      `insert into apps (id, user_id, name, icon, manifest) values ($1, $2, 'Owner Tool', '🚀', '{"schema_version":2}'::jsonb)`,
      [APP_ID, OWNER_ID]
    );

    // Add EDITOR_ID as editor in app_members
    await db.query(
      `insert into app_members (app_id, user_id, role) values ($1, $2, 'editor')`,
      [APP_ID, EDITOR_ID]
    );
  });

  it("(a) allows owner to update apps, but forbids editors from updating apps", async () => {
    // 1. Owner can update name
    await asUser(db, "authenticated", OWNER_ID, async (tx) => {
      const upd = await tx.query(`update apps set name = 'Renamed by Owner' where id = $1 returning id`, [APP_ID]);
      expect(upd.rows).toHaveLength(1);
    });

    // 2. Editor cannot update apps (RLS matches 0 rows)
    await asUser(db, "authenticated", EDITOR_ID, async (tx) => {
      const upd = await tx.query(`update apps set name = 'Hacked by Editor' where id = $1 returning id`, [APP_ID]);
      expect(upd.rows).toHaveLength(0);
    });

    // Verify name remains as set by Owner
    const check = await db.query<{ name: string }>(`select name from apps where id = $1`, [APP_ID]);
    expect(check.rows[0]?.name).toBe("Renamed by Owner");

    // 3. Editor CAN still write to app_data
    await asUser(db, "authenticated", EDITOR_ID, async (tx) => {
      const ins = await tx.query(
        `insert into app_data (app_id, key, value) values ($1, 'counter', '42'::jsonb) returning id`,
        [APP_ID]
      );
      expect(ins.rows).toHaveLength(1);
    });
  });

  it("(b) revokes execution of is_app_member and has_app_role from anon role", async () => {
    await db.exec(`set role anon;`);
    try {
      await expect(
        db.query(`select is_app_member($1, $2)`, [APP_ID, OWNER_ID])
      ).rejects.toThrow(/permission denied for function is_app_member/i);

      await expect(
        db.query(`select has_app_role($1, array['owner'], $2)`, [APP_ID, OWNER_ID])
      ).rejects.toThrow(/permission denied for function has_app_role/i);
    } finally {
      await db.exec(`reset role;`);
    }
  });

  it("(c) drops byo_api_key column from profile", async () => {
    await expect(
      db.query(`select byo_api_key from profile`)
    ).rejects.toThrow(/column.*byo_api_key.*does not exist/i);
  });
});
