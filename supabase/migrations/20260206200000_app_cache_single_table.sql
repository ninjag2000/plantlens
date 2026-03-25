-- Replace trends + discover_cache with single app_cache table.
-- app_cache: key (PK), kind ('trends' | 'discover'), data (jsonb), updated_at.

create table if not exists public.app_cache (
  key text primary key,
  kind text not null,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table public.app_cache enable row level security;
drop policy if exists "Allow anon read and write for app_cache" on public.app_cache;
create policy "Allow anon read and write for app_cache"
  on public.app_cache for all using (true) with check (true);

create index if not exists app_cache_kind_updated_idx on public.app_cache (kind, updated_at desc);

drop table if exists public.trends;
drop table if exists public.discover_cache;
