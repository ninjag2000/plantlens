/**
 * Supabase client for PlantLens. Uses URL and anon key from app.config.js extra
 * (loaded from .env.local: SUPABASE_URL, SUPABASE_ANON_KEY).
 * Returns null if not configured so callers can fall back to AsyncStorage.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const PLANTS_TABLE = 'plants';
const APP_CACHE_TABLE = 'app_cache';

let client: SupabaseClient | null = null;

function getConfig(): { url: string; anonKey: string } | null {
  const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
  const url = extra?.SUPABASE_URL?.trim();
  const anonKey = extra?.SUPABASE_ANON_KEY?.trim();
  if (url && anonKey) return { url, anonKey };
  return null;
}

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const config = getConfig();
  if (!config) return null;
  try {
    client = createClient(config.url, config.anonKey);
    return client;
  } catch (e) {
    console.warn('[Supabase] createClient failed', e);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return getConfig() !== null;
}

export const PLANTS_TABLE_NAME = PLANTS_TABLE;
export const APP_CACHE_TABLE_NAME = APP_CACHE_TABLE;
