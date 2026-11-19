import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration001Sql from "../../supabase/migrations/001_initial_schema.sql?raw";
import migration002Sql from "../../supabase/migrations/002_v2_schema.sql?raw";
import { APP_COLUMNS } from "../../supabase/functions/invites/handler.ts";

describe("invites DB column contract — apps table columns in real Postgres", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();

    // Setup minimal Supabase auth schema
    await db.exec(`
      create schema if not exists auth;
      create table if not exists auth.users (
        id uuid primary key default gen_random_uuid(),
        email text,
        created_at timestamptz default now()
      );
      create or replace function auth.uid()
      returns uuid
      language sql
      stable
      as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
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
    `);

    // Run Migrations 001 and 002
    await db.exec(migration001Sql);
    await db.exec(migration002Sql);
  });

  it("selects ${APP_COLUMNS} cleanly from apps", async () => {
    const testUserId = "33333333-3333-4333-8333-333333333333";
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [testUserId, "owner@example.com"]);

    await db.query(
      `insert into apps (id, user_id, name, icon, manifest) values ($1, $2, $3, $4, $5)`,
      [
        "44444444-4444-4444-8444-444444444444",
        testUserId,
        "Test Utility",
        "star",
        JSON.stringify({ schema_version: 2, title: "Test Utility", description: "Useful tool" }),
      ]
    );

    // This MUST succeed with APP_COLUMNS
    const res = await db.query(`select ${APP_COLUMNS} from apps where id = $1`, [
      "44444444-4444-4444-8444-444444444444",
    ]);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      name: "Test Utility",
      icon: "star",
    });

    // Querying "description" as a root column fails because no migration added it
    await expect(
      db.query(`select id, user_id, name, icon, description from apps where id = $1`, [
        "44444444-4444-4444-8444-444444444444",
      ])
    ).rejects.toThrow(/column.*description.*does not exist/i);
  });
});
