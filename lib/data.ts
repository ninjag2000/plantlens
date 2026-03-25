/**
 * Data layer for plants, trends and discover cache. Uses Supabase when configured,
 * otherwise falls back to local (AsyncStorage / files). Interface unchanged for UI.
 */
import type { Plant, CatalogPlant } from '../types';
import {
  getSupabase,
  isSupabaseConfigured,
  PLANTS_TABLE_NAME,
  APP_CACHE_TABLE_NAME,
} from '../services/supabaseClient';

const TRENDS_KEY_PREFIX = 'trends_';

export type TrendsCacheEntry = { plants: CatalogPlant[]; fetchedAt: number; cachedDate?: string };
export type GetDiscoverCache = () => Promise<Record<string, CatalogPlant>>;

export type GetPlants = () => Promise<Plant[]>;
export type SavePlant = (plant: Plant) => Promise<void>;
export type DeletePlant = (id: string) => Promise<void>;

export async function getPlants(
  localGetPlants: GetPlants
): Promise<Plant[]> {
  const supabase = getSupabase();
  if (!supabase) return localGetPlants();
  try {
    const { data, error } = await supabase
      .from(PLANTS_TABLE_NAME)
      .select('data')
      .order('updated_at', { ascending: false });
    if (error) {
      console.warn('[data] Supabase getPlants error', error);
      return localGetPlants();
    }
    if (!data || data.length === 0) return [];
    return data.map((row: { data: Plant }) => row.data);
  } catch (e) {
    console.warn('[data] getPlants exception', e);
    return localGetPlants();
  }
}

export async function savePlant(
  plant: Plant,
  localGetPlants: GetPlants,
  localSavePlants: (plants: Plant[]) => Promise<void>
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    const plants = await localGetPlants();
    const idx = plants.findIndex(p => p.id === plant.id);
    if (idx >= 0) plants[idx] = plant;
    else plants.unshift(plant);
    await localSavePlants(plants);
    return;
  }
  try {
    const { error } = await supabase
      .from(PLANTS_TABLE_NAME)
      .upsert(
        {
          id: plant.id,
          data: plant,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    if (error) {
      console.warn('[data] Supabase savePlant error', error);
      const plants = await localGetPlants();
      const idx = plants.findIndex(p => p.id === plant.id);
      if (idx >= 0) plants[idx] = plant;
      else plants.unshift(plant);
      await localSavePlants(plants);
    }
  } catch (e) {
    console.warn('[data] savePlant exception', e);
    const plants = await localGetPlants();
    const idx = plants.findIndex(p => p.id === plant.id);
    if (idx >= 0) plants[idx] = plant;
    else plants.unshift(plant);
    await localSavePlants(plants);
  }
}

export async function deletePlant(
  id: string,
  localGetPlants: GetPlants,
  localSavePlants: (plants: Plant[]) => Promise<void>
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    const plants = (await localGetPlants()).filter(p => p.id !== id);
    await localSavePlants(plants);
    return;
  }
  try {
    const { error } = await supabase.from(PLANTS_TABLE_NAME).delete().eq('id', id);
    if (error) {
      console.warn('[data] Supabase deletePlant error', error);
      const plants = (await localGetPlants()).filter(p => p.id !== id);
      await localSavePlants(plants);
    }
  } catch (e) {
    console.warn('[data] deletePlant exception', e);
    const plants = (await localGetPlants()).filter(p => p.id !== id);
    await localSavePlants(plants);
  }
}

/** Trends: get from app_cache (key = trends_${lang}). */
export async function getTrends(
  lang: string,
  localGet: (lang: string) => Promise<TrendsCacheEntry | null>
): Promise<TrendsCacheEntry | null> {
  const supabase = getSupabase();
  if (!supabase) return localGet(lang);
  try {
    const key = TRENDS_KEY_PREFIX + lang;
    const { data, error } = await supabase
      .from(APP_CACHE_TABLE_NAME)
      .select('data')
      .eq('key', key)
      .eq('kind', 'trends')
      .maybeSingle();
    if (error || !data?.data) return localGet(lang);
    return data.data as TrendsCacheEntry;
  } catch (e) {
    console.warn('[data] getTrends exception', e);
    return localGet(lang);
  }
}

/** Trends: save to app_cache (key = trends_${lang}, kind = trends). */
export async function setTrends(
  entry: TrendsCacheEntry,
  lang: string,
  localSet: (entry: TrendsCacheEntry, lang: string) => Promise<void>
): Promise<void> {
  await localSet(entry, lang);
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    const key = TRENDS_KEY_PREFIX + lang;
    await supabase.from(APP_CACHE_TABLE_NAME).upsert(
      { key, kind: 'trends', data: entry, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  } catch (e) {
    console.warn('[data] setTrends exception', e);
  }
}

const MAX_IMAGE_URL_LENGTH = 2000;

/** Sanitize plant for Supabase: don't store huge data URLs. */
function sanitizePlantForSupabase(plant: CatalogPlant): CatalogPlant {
  let imageUrl = plant.imageUrl ?? '';
  if (imageUrl.startsWith('data:') || imageUrl.length > MAX_IMAGE_URL_LENGTH) imageUrl = '';
  return { ...plant, imageUrl };
}

/** Discover cache: get from local and Supabase in parallel, merge (local wins). */
export async function getDiscoverCache(
  localGet: GetDiscoverCache
): Promise<Record<string, CatalogPlant>> {
  const supabase = getSupabase();
  const supabaseFetch = supabase
    ? (async (): Promise<Record<string, CatalogPlant>> => {
        try {
          const { data, error } = await supabase
            .from(APP_CACHE_TABLE_NAME)
            .select('key, data')
            .eq('kind', 'discover');
          if (error || !data?.length) return {};
          const out: Record<string, CatalogPlant> = {};
          for (const row of data as { key: string; data: CatalogPlant }[]) {
            if (row.data?.commonName) out[row.key] = row.data;
          }
          return out;
        } catch (e) {
          console.warn('[data] getDiscoverCache exception', e);
          return {};
        }
      })()
    : Promise.resolve({});
  const [local, fromSupabase] = await Promise.all([localGet(), supabaseFetch]);
  return { ...fromSupabase, ...local };
}

/** Discover cache: save one plant to app_cache (key = plant_key, kind = discover). */
export async function setDiscoverPlant(
  plantKey: string,
  plant: CatalogPlant,
  localSet: (plantKey: string, plant: CatalogPlant) => Promise<void>
): Promise<void> {
  await localSet(plantKey, plant);
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    const sanitized = sanitizePlantForSupabase(plant);
    await supabase.from(APP_CACHE_TABLE_NAME).upsert(
      {
        key: plantKey,
        kind: 'discover',
        data: sanitized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
  } catch (e) {
    console.warn('[data] setDiscoverPlant exception', e);
  }
}

export { isSupabaseConfigured };
