-- PlantLens: trends (per language) and discover_cache (per plant key).
-- Run in Supabase Dashboard → SQL Editor after 20260206000000_create_plants.sql.

-- Trends: one row per language; data = { plants, fetchedAt, cachedDate }.
create table if not exists public.trends (
  lang text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table public.trends enable row level security;
create policy "Allow anon read and write for trends"
  on public.trends for all using (true) with check (true);

comment on table public.trends is 'Cached trending plants per language; data = { plants, fetchedAt, cachedDate }.';

-- Discover cache: one row per plant key (commonName|scientificName), CatalogPlant as JSON.
create table if not exists public.discover_cache (
  plant_key text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table public.discover_cache enable row level security;
create policy "Allow anon read and write for discover_cache"
  on public.discover_cache for all using (true) with check (true);

create index if not exists discover_cache_updated_at_idx on public.discover_cache (updated_at desc);
comment on table public.discover_cache is 'Discover/trends plant cache by plant key; data is CatalogPlant JSON (imageUrl kept short).';
