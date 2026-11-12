// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import migration001Sql from "../../supabase/migrations/001_initial_schema.sql?raw";
import migration002Sql from "../../supabase/migrations/002_v2_schema.sql?raw";
import migration003Sql from "../../supabase/migrations/003_connection_secrets.sql?raw";
import migration004Sql from "../../supabase/migrations/004_byok_secrets.sql?raw";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

async function asRole<T>(
  db: PGlite,
  role: "anon" | "authenticated" | "service_role",
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    if (userId) {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role }),
      ]);
    } else {
      await tx.query(`select set_config('request.jwt.claims', '', true)`);
    }
    return fn(tx);
  });
}

describe("migration 004: BYOK secrets lock-down & entitlement self-upgrade prevention", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create schema if not exists auth;
      create table if not exists auth.users (
        id uuid primary key,
        email text
      );
      create or replace function auth.uid() returns uuid as $$
        select nullif(
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
          ''
        )::uuid;
      $$ language sql stable;

      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then
          create role anon nologin noinherit;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then
          create role authenticated nologin noinherit;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then
          create role service_role nologin bypassrls;
        end if;
      end $$;
    `);

    await db.exec(migration001Sql);
    await db.exec(migration002Sql);
    await db.exec(migration003Sql);

    // Default Supabase schema grants
    await db.exec(`
      grant usage on schema public to anon, authenticated, service_role;
      grant select, insert, update, delete on all tables in schema public to authenticated;
    `);

    // Apply migration 004
    await db.exec(migration004Sql);

    // Grant service_role access to newly created tables and auth schema
    await db.exec(`
      grant usage on schema auth to service_role;
      grant all on all tables in schema auth to service_role;
      grant all on all tables in schema public to service_role;
    `);

    await db.query(`insert into auth.users (id, email) values ($1, 'a@simple.test')`, [USER_A]);
    await db.query(`insert into auth.users (id, email) values ($1, 'b@simple.test')`, [USER_B]);
  }, 20_000);

  afterAll(async () => {
    await db.close();
  });

  it("prevents authenticated clients from reading, inserting, or modifying byok_secrets", async () => {
    // 1. Authenticated user cannot read byok_secrets
    await expect(
      asRole(db, "authenticated", USER_A, async (tx) => {
        return tx.query(`select * from byok_secrets`);
      })
    ).rejects.toThrow(/permission denied/i);

    // 2. Authenticated user cannot insert into byok_secrets
    await expect(
      asRole(db, "authenticated", USER_A, async (tx) => {
        return tx.query(
          `insert into byok_secrets (user_id, provider, encrypted_secret, preview)
           values ($1, 'groq', 'v1:fake:cipher', 'gsk_••••1234')`,
          [USER_A]
        );
      })
    ).rejects.toThrow(/permission denied/i);
  });

  it("allows service_role to manage byok_secrets with cascade delete on user removal", async () => {
    // 1. service_role inserts encrypted secret
    await asRole(db, "service_role", null, async (tx) => {
      await tx.query(
        `insert into byok_secrets (user_id, provider, encrypted_secret, preview)
         values ($1, 'groq', 'v1:realiv:realciphertext', 'gsk_••••7890')`,
        [USER_A]
      );

      const check = await tx.query<{ preview: string }>(
        `select preview from byok_secrets where user_id = $1`,
        [USER_A]
      );
      expect(check.rows).toHaveLength(1);
      expect(check.rows[0]?.preview).toBe("gsk_••••7890");
    });

    // 2. Cascade delete on auth.users delete
    await asRole(db, "service_role", null, async (tx) => {
      await tx.query(`delete from profile where user_id = $1`, [USER_A]);
      await tx.query(`delete from auth.users where id = $1`, [USER_A]);
      const check = await tx.query(`select * from byok_secrets where user_id = $1`, [USER_A]);
      expect(check.rows).toHaveLength(0);
    });
  });

  it("enforces that authenticated clients cannot self-upgrade entitlements", async () => {
    // Client cannot UPDATE entitlements table
    await asRole(db, "authenticated", USER_B, async (tx) => {
      const upd = await tx.query(
        `update entitlements set plan = 'pro', active_app_limit = 25, monthly_credit_limit = 2000
         where user_id = $1 returning *`,
        [USER_B]
      );
      // RLS policy on entitlements is select-only; update produces 0 rows or fails
      expect(upd.rows).toHaveLength(0);
    });

    // Verify plan remains 'free'
    await asRole(db, "authenticated", USER_B, async (tx) => {
      const ent = await tx.query<{ plan: string }>(
        `select plan from entitlements where user_id = $1`,
        [USER_B]
      );
      expect(ent.rows[0]?.plan).toBe("free");
    });
  });
});
