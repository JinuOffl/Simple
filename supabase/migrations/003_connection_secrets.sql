-- Simple v2 — Schema Migration 003: Server-side MCP connection secrets
-- Additive migration only. Keeps all v1 & v2 tables and data intact.
-- Satisfies Constraint #5 ("All secrets stay server-side") without requiring Supabase Vault extension.

create table if not exists connection_secrets (
  connection_id uuid primary key references connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  auth_header_name text not null default 'Authorization',
  encrypted_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_connection_secrets_user
  on connection_secrets (user_id, connection_id);

drop trigger if exists connection_secrets_updated_at on connection_secrets;
create trigger connection_secrets_updated_at
  before update on connection_secrets
  for each row execute function handle_updated_at();

-- Strict lock-down: RLS enabled with ZERO client (anon/authenticated) policies.
-- Only service_role (Edge Functions: manage-connection & run-mcp-action) can read or write secrets.
alter table connection_secrets enable row level security;

revoke all on table connection_secrets from public, anon, authenticated;

