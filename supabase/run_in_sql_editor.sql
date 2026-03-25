-- PlantLens: plants + single app_cache (trends + discover in one table).
-- Copy all below into Supabase SQL Editor and Run.

CREATE TABLE IF NOT EXISTS public.plants (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read and write for plants" ON public.plants;
CREATE POLICY "Allow anon read and write for plants"
  ON public.plants FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS plants_updated_at_idx ON public.plants (updated_at DESC);

-- One table for trends (key = trends_en, trends_ru, ...) and discover (key = plant_key, kind = discover)
CREATE TABLE IF NOT EXISTS public.app_cache (
  key text PRIMARY KEY,
  kind text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read and write for app_cache" ON public.app_cache;
CREATE POLICY "Allow anon read and write for app_cache"
  ON public.app_cache FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS app_cache_kind_updated_idx ON public.app_cache (kind, updated_at DESC);

-- Optional: drop old tables if you had trends + discover_cache before
DROP TABLE IF EXISTS public.trends;
DROP TABLE IF EXISTS public.discover_cache;
