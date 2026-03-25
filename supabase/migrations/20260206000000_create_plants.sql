-- PlantLens: plants table for Supabase backend.
-- Run this in Supabase Dashboard → SQL Editor (or via Supabase CLI).
create table if not exists public.plants (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Optional: enable RLS and allow anon access (tighten when you add auth).
alter table public.plants enable row level security;

create policy "Allow anon read and write for plants"
  on public.plants for all
  using (true)
  with check (true);

-- Index for ordering by updated_at
create index if not exists plants_updated_at_idx on public.plants (updated_at desc);

comment on table public.plants is 'Plant records from PlantLens app; data column is full Plant JSON.';
