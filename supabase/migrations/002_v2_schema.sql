-- Simple v2 — Schema Migration 002: V2 tables, entitlements, atomic credits, sleeping, & RLS
-- Additive migration only. Preserves 001_initial_schema.sql and all existing v1 user data.
-- Note: pgvector (`templates.embedding`) and Supabase Vault (`vault.secrets`) are deferred to Phase 3/4.

-- ─── 1. Templates table (must precede apps.template_id FK) ────────────────────

create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  icon text not null,
  category text not null default 'general',
  tags text[] not null default '{}',
  manifest jsonb not null,
  created_at timestamptz not null default now()
);

-- ─── 2. Extend apps with v2 columns (safe defaults for existing v1 rows) ───────

alter table apps
  add column if not exists schema_version int not null default 1,
  add column if not exists status text not null default 'active',
  add column if not exists template_id uuid references templates(id) on delete set null,
  add column if not exists is_shared boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'apps_status_check' and conrelid = 'apps'::regclass
  ) then
    alter table apps
      add constraint apps_status_check check (status in ('active', 'sleeping'));
  end if;
end $$;

create index if not exists idx_apps_user_status_order
  on apps (user_id, status, pinned_order, updated_at desc);

-- ─── 3. App members & invites ──────────────────────────────────────────────────

create table if not exists app_members (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique(app_id, user_id)
);

create index if not exists idx_app_members_user on app_members (user_id, app_id);

-- Backfill existing apps so every legacy owner has an explicit app_members row
insert into app_members (app_id, user_id, role)
select id, user_id, 'owner'
from apps
on conflict (app_id, user_id) do nothing;

create table if not exists app_invites (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  code text unique not null,
  role text not null check (role in ('editor', 'viewer')),
  created_by uuid not null references auth.users(id) on delete cascade,
  max_uses int not null default 10 check (max_uses > 0),
  uses int not null default 0 check (uses >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ─── 4. Collection records (relational/list app data) ──────────────────────────

create table if not exists collection_records (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  collection_name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  is_shared boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_collection_records_lookup
  on collection_records (app_id, collection_name, owner_id);

drop trigger if exists collection_records_updated_at on collection_records;
create trigger collection_records_updated_at
  before update on collection_records
  for each row execute function handle_updated_at();

-- ─── 5. Connections (MCP servers — secret_ref reserved for Vault later) ────────

create table if not exists connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connector_id text not null,
  label text not null,
  server_url text not null,
  allowed_tools text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'disabled', 'error')),
  secret_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_connections_user on connections (user_id, connector_id);

drop trigger if exists connections_updated_at on connections;
create trigger connections_updated_at
  before update on connections
  for each row execute function handle_updated_at();

-- ─── 6. Entitlements, usage_ledger, generation_jobs ────────────────────────────

create table if not exists entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'group')),
  active_app_limit int not null default 3 check (active_app_limit > 0),
  monthly_credit_limit int not null default 100 check (monthly_credit_limit >= 0),
  credits_used int not null default 0 check (credits_used >= 0),
  period_start timestamptz not null default date_trunc('month', now()),
  provider text,
  provider_ref text,
  updated_at timestamptz not null default now()
);

-- Backfill entitlements for existing users without disturbing existing data
insert into entitlements (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create table if not exists usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id uuid references apps(id) on delete set null,
  action_kind text not null,
  credit_cost_class text not null,
  credits_charged int not null check (credits_charged >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_ledger_user_time
  on usage_ledger (user_id, created_at desc);

create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id uuid references apps(id) on delete set null,
  prompt text not null,
  state text not null default 'RECEIVE',
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_generation_jobs_user_time
  on generation_jobs (user_id, created_at desc);

drop trigger if exists generation_jobs_updated_at on generation_jobs;
create trigger generation_jobs_updated_at
  before update on generation_jobs
  for each row execute function handle_updated_at();

-- ─── 7. Helper SQL Functions (SECURITY DEFINER, recursion-free) ────────────────

create or replace function is_app_member(
  p_app_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_user_id is null or p_app_id is null then false
    else exists (
      select 1 from apps a
      where a.id = p_app_id and a.user_id = p_user_id
    ) or exists (
      select 1 from app_members m
      where m.app_id = p_app_id and m.user_id = p_user_id
    )
  end;
$$;

create or replace function has_app_role(
  p_app_id uuid,
  p_roles text[],
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_user_id is null or p_app_id is null then false
    else (
      'owner' = any(p_roles) and exists (
        select 1 from apps a
        where a.id = p_app_id and a.user_id = p_user_id
      )
    ) or exists (
      select 1 from app_members m
      where m.app_id = p_app_id
        and m.user_id = p_user_id
        and m.role = any(p_roles)
    )
  end;
$$;

-- Atomic credit consumption with monthly period rollover and ledger entry
create or replace function consume_credits(
  p_user_id uuid,
  p_cost int,
  p_action_kind text,
  p_cost_class text,
  p_app_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  allowed boolean,
  remaining_credits int,
  credits_used int,
  monthly_credit_limit int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ent entitlements%rowtype;
  v_new_used int;
begin
  if p_cost < 0 then
    raise exception 'Credit cost must be non-negative';
  end if;

  insert into entitlements (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select *
  into v_ent
  from entitlements e
  where e.user_id = p_user_id
  for update;

  if now() >= v_ent.period_start + interval '1 month' then
    v_ent.credits_used := 0;
    v_ent.period_start := date_trunc('month', now());
    update entitlements e
    set credits_used = 0,
        period_start = v_ent.period_start,
        updated_at = now()
    where e.user_id = p_user_id;
  end if;

  if v_ent.credits_used + p_cost > v_ent.monthly_credit_limit then
    return query select
      false,
      greatest(v_ent.monthly_credit_limit - v_ent.credits_used, 0),
      v_ent.credits_used,
      v_ent.monthly_credit_limit;
    return;
  end if;

  update entitlements e
  set credits_used = v_ent.credits_used + p_cost,
      updated_at = now()
  where e.user_id = p_user_id
  returning e.credits_used into v_new_used;

  insert into usage_ledger (
    user_id,
    app_id,
    action_kind,
    credit_cost_class,
    credits_charged,
    metadata
  ) values (
    p_user_id,
    p_app_id,
    p_action_kind,
    p_cost_class,
    p_cost,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return query select
    true,
    greatest(v_ent.monthly_credit_limit - v_new_used, 0),
    v_new_used,
    v_ent.monthly_credit_limit;
end;
$$;

revoke all on function consume_credits(uuid, int, text, text, uuid, jsonb) from public, anon, authenticated;

-- Put excess active apps into sleeping status (NEVER delete rows)
create or replace function enforce_active_limit(p_user_id uuid)
returns table (
  slept_count int,
  active_count int,
  active_app_limit int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_slept int := 0;
  v_active int := 0;
begin
  insert into entitlements (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select e.active_app_limit
  into v_limit
  from entitlements e
  where e.user_id = p_user_id;

  with ranked as (
    select
      a.id,
      row_number() over (
        order by a.pinned_order asc nulls last, a.updated_at desc, a.created_at desc, a.id asc
      ) as rn
    from apps a
    where a.user_id = p_user_id and a.status = 'active'
  ),
  to_sleep as (
    update apps a
    set status = 'sleeping'
    from ranked r
    where a.id = r.id and r.rn > v_limit
    returning a.id
  )
  select count(*)::int into v_slept from to_sleep;

  select count(*)::int
  into v_active
  from apps a
  where a.user_id = p_user_id and a.status = 'active';

  return query select v_slept, v_active, v_limit;
end;
$$;

revoke all on function enforce_active_limit(uuid) from public, anon, authenticated;

-- ─── 8. Lifecycle triggers (entitlements on signup, ownership & limit checks) ──

create or replace function handle_new_user_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.entitlements (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_entitlement on auth.users;
create trigger on_auth_user_created_entitlement
  after insert on auth.users
  for each row execute function handle_new_user_entitlement();

create or replace function handle_app_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_members (app_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (app_id, user_id) do nothing;

  if new.status = 'active' then
    perform public.enforce_active_limit(new.user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_app_after_insert on apps;
create trigger on_app_after_insert
  after insert on apps
  for each row execute function handle_app_after_insert();

create or replace function handle_app_wake_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_other_active int;
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'APP_OWNER_IMMUTABLE: cannot reassign app ownership via update'
      using errcode = '42501';
  end if;

  if old.status = 'sleeping' and new.status = 'active' then
    insert into public.entitlements (user_id)
    values (new.user_id)
    on conflict (user_id) do nothing;

    select e.active_app_limit into v_limit
    from public.entitlements e
    where e.user_id = new.user_id;

    select count(*)::int into v_other_active
    from public.apps a
    where a.user_id = new.user_id
      and a.status = 'active'
      and a.id <> new.id;

    if v_other_active >= v_limit then
      raise exception 'ACTIVE_APP_LIMIT_REACHED: limit is % active apps; sleep another app or upgrade before waking', v_limit
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_app_wake_guard on apps;
create trigger on_app_wake_guard
  before update of status, user_id on apps
  for each row execute function handle_app_wake_guard();

-- ─── 9. Row Level Security policies ───────────────────────────────────────────

alter table templates enable row level security;
alter table app_members enable row level security;
alter table app_invites enable row level security;
alter table collection_records enable row level security;
alter table connections enable row level security;
alter table entitlements enable row level security;
alter table usage_ledger enable row level security;
alter table generation_jobs enable row level security;

-- templates: read-only for authenticated users; writes reserved for service_role
drop policy if exists "templates read all" on templates;
create policy "templates read all" on templates
  for select to authenticated using (true);

-- apps: update v1 policy to allow shared members while keeping owner/editor controls
drop policy if exists "own apps only" on apps;
drop policy if exists "apps select member" on apps;
drop policy if exists "apps insert owner" on apps;
drop policy if exists "apps update owner or editor" on apps;
drop policy if exists "apps delete owner" on apps;

create policy "apps select member" on apps
  for select to authenticated
  using (auth.uid() = user_id or is_app_member(id, auth.uid()));

create policy "apps insert owner" on apps
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "apps update owner or editor" on apps
  for update to authenticated
  using (auth.uid() = user_id or has_app_role(id, array['owner', 'editor'], auth.uid()))
  with check (has_app_role(id, array['owner', 'editor'], auth.uid()));

create policy "apps delete owner" on apps
  for delete to authenticated
  using (auth.uid() = user_id);

-- app_data: member read; owner/editor write
drop policy if exists "own app data only" on app_data;
drop policy if exists "app_data select member" on app_data;
drop policy if exists "app_data insert editor" on app_data;
drop policy if exists "app_data update editor" on app_data;
drop policy if exists "app_data delete editor" on app_data;

create policy "app_data select member" on app_data
  for select to authenticated
  using (is_app_member(app_id, auth.uid()));

create policy "app_data insert editor" on app_data
  for insert to authenticated
  with check (has_app_role(app_id, array['owner', 'editor'], auth.uid()));

create policy "app_data update editor" on app_data
  for update to authenticated
  using (has_app_role(app_id, array['owner', 'editor'], auth.uid()))
  with check (has_app_role(app_id, array['owner', 'editor'], auth.uid()));

create policy "app_data delete editor" on app_data
  for delete to authenticated
  using (has_app_role(app_id, array['owner', 'editor'], auth.uid()));

-- app_members: members can view membership; only app owners manage membership
drop policy if exists "app_members select member" on app_members;
drop policy if exists "app_members manage owner" on app_members;

create policy "app_members select member" on app_members
  for select to authenticated
  using (is_app_member(app_id, auth.uid()));

create policy "app_members manage owner" on app_members
  for all to authenticated
  using (has_app_role(app_id, array['owner'], auth.uid()))
  with check (has_app_role(app_id, array['owner'], auth.uid()));

-- app_invites: owners only (invite redemption goes through service_role Edge Function)
drop policy if exists "app_invites owner only" on app_invites;
create policy "app_invites owner only" on app_invites
  for all to authenticated
  using (has_app_role(app_id, array['owner'], auth.uid()))
  with check (has_app_role(app_id, array['owner'], auth.uid()) and created_by = auth.uid());

-- collection_records: personal or shared within member roles
drop policy if exists "collection_records select member" on collection_records;
drop policy if exists "collection_records insert editor" on collection_records;
drop policy if exists "collection_records update editor" on collection_records;
drop policy if exists "collection_records delete owner_or_editor" on collection_records;

create policy "collection_records select member" on collection_records
  for select to authenticated
  using (
    is_app_member(app_id, auth.uid())
    and (owner_id = auth.uid() or is_shared = true)
  );

create policy "collection_records insert editor" on collection_records
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and has_app_role(app_id, array['owner', 'editor'], auth.uid())
  );

create policy "collection_records update editor" on collection_records
  for update to authenticated
  using (
    has_app_role(app_id, array['owner', 'editor'], auth.uid())
    and (owner_id = auth.uid() or is_shared = true)
  )
  with check (
    has_app_role(app_id, array['owner', 'editor'], auth.uid())
    and (owner_id = auth.uid() or is_shared = true)
  );

create policy "collection_records delete owner_or_editor" on collection_records
  for delete to authenticated
  using (
    has_app_role(app_id, array['owner', 'editor'], auth.uid())
    and (owner_id = auth.uid() or has_app_role(app_id, array['owner'], auth.uid()))
  );

-- connections: strictly owner-only
drop policy if exists "connections owner only" on connections;
create policy "connections owner only" on connections
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- entitlements: SELECT ONLY for owner (no client insert/update/delete — prevents self-upgrade)
drop policy if exists "entitlements select own" on entitlements;
create policy "entitlements select own" on entitlements
  for select to authenticated
  using (auth.uid() = user_id);

-- usage_ledger: SELECT ONLY for owner (immutable audit log written server-side)
drop policy if exists "usage_ledger select own" on usage_ledger;
create policy "usage_ledger select own" on usage_ledger
  for select to authenticated
  using (auth.uid() = user_id);

-- generation_jobs: owner-only
drop policy if exists "generation_jobs select own" on generation_jobs;
drop policy if exists "generation_jobs insert own" on generation_jobs;
drop policy if exists "generation_jobs update own" on generation_jobs;

create policy "generation_jobs select own" on generation_jobs
  for select to authenticated
  using (auth.uid() = user_id);

create policy "generation_jobs insert own" on generation_jobs
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "generation_jobs update own" on generation_jobs
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
