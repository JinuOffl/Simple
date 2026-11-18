import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration001Sql from "../../supabase/migrations/001_initial_schema.sql?raw";
import migration002Sql from "../../supabase/migrations/002_v2_schema.sql?raw";
import migration005Sql from "../../supabase/migrations/005_refund_credits.sql?raw";

const USER_A = "11111111-1111-4111-8111-111111111111";

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

describe("Postgres Migration 005 — refund_credits function", () => {
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
    await db.exec(migration005Sql);

    await db.query(`insert into auth.users (id, email) values ($1, $2);`, [
      USER_A,
      "user_a@test.local",
    ]);
  });

  afterAll(async () => {
    await db.close();
  });

  it("decrements credits_used, never drops below zero, and logs refund in usage_ledger", async () => {
    // 1. Consume 15 credits
    const consumeRes = await db.query<{ credits_used: number; remaining_credits: number }>(
      `select * from consume_credits($1, $2, $3, $4);`,
      [USER_A, 15, "generate_app", "generation"]
    );
    expect(consumeRes.rows[0].credits_used).toBe(15);

    // 2. Refund 10 credits
    const refundRes = await db.query<{
      refunded: boolean;
      credits_used: number;
      remaining_credits: number;
    }>(
      `select * from refund_credits($1, $2, $3);`,
      [USER_A, 10, "generate_app"]
    );
    expect(refundRes.rows[0].refunded).toBe(true);
    expect(refundRes.rows[0].credits_used).toBe(5);

    // 3. Refund 10 more credits (should cap at 0, never negative)
    const refundRes2 = await db.query<{
      refunded: boolean;
      credits_used: number;
      remaining_credits: number;
    }>(
      `select * from refund_credits($1, $2, $3);`,
      [USER_A, 10, "generate_app"]
    );
    expect(refundRes2.rows[0].credits_used).toBe(0);

    // 4. Verify usage_ledger has refund rows with credits_charged = 0 and metadata {"refund": 10}
    const ledger = await db.query<{ credits_charged: number; metadata: any }>(
      `select credits_charged, metadata from usage_ledger where user_id = $1 and credit_cost_class = 'refund' order by created_at desc;`,
      [USER_A]
    );
    expect(ledger.rows.length).toBeGreaterThanOrEqual(2);
    expect(ledger.rows[0].credits_charged).toBe(0);
    expect(ledger.rows[0].metadata).toEqual({ refund: 10 });
  });

  it("revokes execution from authenticated role (security definer internal only)", async () => {
    let errorCaught: Error | null = null;
    try {
      await asUser(db, USER_A, async (tx) => {
        await tx.query(`select * from refund_credits($1, 5, 'generate_app');`, [USER_A]);
      });
    } catch (err) {
      errorCaught = err as Error;
    }
    expect(errorCaught).not.toBeNull();
    expect(errorCaught?.message).toMatch(/permission denied for function refund_credits/i);
  });
});
