// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import migration001Sql from "../../supabase/migrations/001_initial_schema.sql?raw";
import migration002Sql from "../../supabase/migrations/002_v2_schema.sql?raw";
import migration003Sql from "../../supabase/migrations/003_connection_secrets.sql?raw";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const CONN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

describe("migration 003: connection_secrets isolation & cascade", () => {
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

    // Simulate default Supabase schema grants prior to migration 003
    await db.exec(`
      grant usage on schema public to anon, authenticated, service_role;
      grant select, insert, update, delete on all tables in schema public to authenticated;
    `);

    await db.exec(migration003Sql);

    // Ensure service_role retains full access on newly created table
    await db.exec(`
      grant all on all tables in schema public to service_role;
    `);

    await db.query(`insert into auth.users (id, email) values ($1, 'a@simple.test')`, [USER_A]);
    await db.query(`insert into auth.users (id, email) values ($1, 'b@simple.test')`, [USER_B]);

    // Seed a connection + encrypted secret as service_role
    await asRole(db, "service_role", null, async (tx) => {
      await tx.query(
        `insert into connections (id, user_id, connector_id, label, server_url, secret_ref, allowed_tools)
         values ($1, $2, 'home_assistant', 'Home HA', 'https://ha.example.com/mcp', $3, array['light.toggle'])`,
        [CONN_A, USER_A, `enc:v1:${CONN_A}`],
      );
      await tx.query(
        `insert into connection_secrets (connection_id, user_id, auth_header_name, encrypted_secret)
         values ($1, $2, 'Authorization', 'v1:iv_base64:ciphertext_base64')`,
        [CONN_A, USER_A],
      );
    });
  }, 20_000);

  afterAll(async () => {
    await db.close();
  });

  it("allows owner to read connection metadata without exposing secrets", async () => {
    await asRole(db, "authenticated", USER_A, async (tx) => {
      const res = await tx.query<{
        id: string;
        connector_id: string;
        secret_ref: string;
        allowed_tools: string[];
      }>(`select id, connector_id, secret_ref, allowed_tools from connections where id = $1`, [CONN_A]);

      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]).toEqual({
        id: CONN_A,
        connector_id: "home_assistant",
        secret_ref: `enc:v1:${CONN_A}`,
        allowed_tools: ["light.toggle"],
      });
    });

    await asRole(db, "authenticated", USER_B, async (tx) => {
      const res = await tx.query(`select id from connections`);
      expect(res.rows).toHaveLength(0);
    });
  });

  it("denies all SELECT/INSERT/UPDATE/DELETE on connection_secrets to authenticated owner, other users, and anon", async () => {
    // Owner (User A) cannot read or tamper with connection_secrets
    await expect(
      asRole(db, "authenticated", USER_A, (tx) =>
        tx.query(`select encrypted_secret from connection_secrets`),
      ),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      asRole(db, "authenticated", USER_A, (tx) =>
        tx.query(
          `insert into connection_secrets (connection_id, user_id, encrypted_secret) values ($1, $2, 'forged')`,
          [CONN_A, USER_A],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      asRole(db, "authenticated", USER_A, (tx) =>
        tx.query(`update connection_secrets set encrypted_secret = 'tampered' where connection_id = $1`, [CONN_A]),
      ),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      asRole(db, "authenticated", USER_A, (tx) =>
        tx.query(`delete from connection_secrets where connection_id = $1`, [CONN_A]),
      ),
    ).rejects.toThrow(/permission denied/i);

    // Other authenticated user (User B)
    await expect(
      asRole(db, "authenticated", USER_B, (tx) =>
        tx.query(`select * from connection_secrets`),
      ),
    ).rejects.toThrow(/permission denied/i);

    // Anonymous role
    await expect(
      asRole(db, "anon", null, (tx) =>
        tx.query(`select * from connection_secrets`),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("cascades delete from connections to connection_secrets", async () => {
    await asRole(db, "authenticated", USER_A, async (tx) => {
      const del = await tx.query(`delete from connections where id = $1 returning id`, [CONN_A]);
      expect(del.rows).toHaveLength(1);
    });

    await asRole(db, "service_role", null, async (tx) => {
      const rem = await tx.query(`select connection_id from connection_secrets where connection_id = $1`, [CONN_A]);
      expect(rem.rows).toHaveLength(0);
    });
  });
});
