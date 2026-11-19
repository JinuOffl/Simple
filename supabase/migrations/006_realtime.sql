-- Migration 006: Add app_data and collection_records to supabase_realtime publication
-- Additive: cleanly safe on PGlite (where supabase_realtime publication does not exist)

alter table if exists public.app_data replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables 
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_data'
    ) then
      alter publication supabase_realtime add table public.app_data;
    end if;

    if not exists (
      select 1 from pg_publication_tables 
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'collection_records'
    ) then
      alter publication supabase_realtime add table public.collection_records;
    end if;
  end if;
end $$;
