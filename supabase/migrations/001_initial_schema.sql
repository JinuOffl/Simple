-- Simple App — Initial Database Schema
-- Run this in the Supabase SQL Editor

-- ─── Tables ───────────────────────────────────────────────────────────────────

create table if not exists apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  icon text not null,
  manifest jsonb not null,
  pinned_order int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists app_data (
  id uuid primary key default gen_random_uuid(),
  app_id uuid references apps(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz default now(),
  unique(app_id, key)
);

create table if not exists profile (
  user_id uuid references auth.users primary key,
  byo_api_key text,
  preferences jsonb default '{}'::jsonb
);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists apps_updated_at on apps;
create trigger apps_updated_at
  before update on apps
  for each row execute function handle_updated_at();

drop trigger if exists app_data_updated_at on app_data;
create trigger app_data_updated_at
  before update on app_data
  for each row execute function handle_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table apps enable row level security;
alter table app_data enable row level security;
alter table profile enable row level security;

-- Users can only see/edit their own apps
drop policy if exists "own apps only" on apps;
create policy "own apps only" on apps
  for all using (auth.uid() = user_id);

-- Users can only see/edit app_data for their own apps
drop policy if exists "own app data only" on app_data;
create policy "own app data only" on app_data
  for all using (
    app_id in (select id from apps where user_id = auth.uid())
  );

-- Users can only see/edit their own profile
drop policy if exists "own profile only" on profile;
create policy "own profile only" on profile
  for all using (auth.uid() = user_id);

-- ─── Auto-create profile on signup ───────────────────────────────────────────

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profile (user_id)
  values (new.id)
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
