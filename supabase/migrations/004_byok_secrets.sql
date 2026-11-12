-- Simple v2 — Schema Migration 004: Server-side BYOK (Bring Your Own Key) secrets
-- Additive migration only. Preserves all existing tables and data.
-- Adheres to Constraint #5 ("All secrets stay server-side") with AES-GCM-256 encrypted storage.

create table if not exists byok_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'groq',
  encrypted_secret text not null,
  preview text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_byok_secrets_user
  on byok_secrets (user_id);

drop trigger if exists byok_secrets_updated_at on byok_secrets;
create trigger byok_secrets_updated_at
  before update on byok_secrets
  for each row execute function handle_updated_at();

-- Strict lock-down: RLS enabled with ZERO client (anon/authenticated) policies.
-- Only service_role (Edge Functions: manage-byok, generate-app, run-llm-action) can read/write secrets.
alter table byok_secrets enable row level security;

revoke all on table byok_secrets from public, anon, authenticated;

