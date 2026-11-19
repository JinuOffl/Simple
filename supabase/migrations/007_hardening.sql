-- Simple v2 — Migration 007: Security Hardening
-- (a) Replace policy "apps update owner or editor" with owner-only update (editors keep app_data write)
-- (b) Revoke execute on is_app_member and has_app_role from public & anon
-- (c) Drop deprecated plaintext byo_api_key column from profile

-- ─── 1. Owner-only app manifest updates ───────────────────────────────────────
drop policy if exists "apps update owner or editor" on apps;
drop policy if exists "apps update owner" on apps;

create policy "apps update owner" on apps
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── 2. Revoke execute on membership helpers from anon & public ───────────────
revoke execute on function is_app_member(uuid, uuid) from public, anon;
grant execute on function is_app_member(uuid, uuid) to authenticated, service_role;

revoke execute on function has_app_role(uuid, text[], uuid) from public, anon;
grant execute on function has_app_role(uuid, text[], uuid) to authenticated, service_role;

-- ─── 3. Remove deprecated plaintext BYOK column ───────────────────────────────
alter table if exists profile
  drop column if exists byo_api_key;
