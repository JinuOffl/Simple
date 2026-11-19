import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration001Sql from "../../supabase/migrations/001_initial_schema.sql?raw";
import migration002Sql from "../../supabase/migrations/002_v2_schema.sql?raw";
import migration006Sql from "../../supabase/migrations/006_realtime.sql?raw";

describe("Postgres Migration 006 — Realtime publication & replica identity", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();

    // Supabase auth/roles setup
    await db.exec(`
      do $$
      begin
        if not exists (select from pg_roles where rolname = 'anon') then
          create role anon nologin;
        end if;
        if not exists (select from pg_roles where rolname = 'authenticated') then
          create role authenticated nologin;
        end if;
        if not exists (select from pg_roles where rolname = 'service_role') then
          create role service_role nologin;
        end if;
      end
      $$;

      create schema if not exists auth;
      create table if not exists auth.users (
        id uuid primary key,
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
    `);

    await db.exec(migration001Sql);
    await db.exec(migration002Sql);
  });

  afterAll(async () => {
    await db.close();
  });

  it("executes migration 006 cleanly on PGlite where supabase_realtime does not exist", async () => {
    await expect(db.exec(migration006Sql)).resolves.not.toThrow();

    // Verify app_data has replica identity full ('f')
    const res = await db.query<{ relreplident: string }>(`
      select relreplident
      from pg_class
      where relname = 'app_data' and relnamespace = 'public'::regnamespace;
    `);

    expect(res.rows.length).toBe(1);
    expect(res.rows[0].relreplident).toBe("f"); // 'f' = FULL
  });
});
