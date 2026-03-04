/**
 * Кэш данных о растениях: Discover (каталог), Тренды (главная) и полная информация Plant Detail / Plant Analysis.
 * Discover/Тренды: хранятся в файлах (expo-file-system), без лимита по объёму. Один файл на растение.
 * Остальное — AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { CatalogPlant, Plant } from '../types';
import { getPlantImageAIUrl, getBackupPlantImage, isInvalidImageDataUrl, getKnownGoodPlantImage } from './plantImageService';
import type { Language } from './translations';

const DISCOVER_PLANT_CACHE_KEY = 'plantlens_discover_plant_cache';
const DISCOVER_PLANT_CACHE_DIR_NAME = 'plantlens_plant_cache';
const MAX_DISCOVER_CACHE_FILES = 200;
const PLANT_DETAIL_CACHE_KEY = 'plantlens_plant_detail_cache';
const PLANT_DETAIL_ORDER_KEY = 'plantlens_plant_detail_order';
const MAX_PLANT_DETAIL_CACHE = 80;
const TRENDS_CACHE_KEY_PREFIX = 'plantlens_trends_cache';

function getTrendsCacheKey(lang: Language): string {
    return `${TRENDS_CACHE_KEY_PREFIX}_${lang}`;
}
const FALLBACK_IMAGE_CACHE_KEY = 'plantlens_fallback_image_cache';
const FALLBACK_AI_DATA_CACHE_KEY = 'plantlens_fallback_ai_data_cache';
const MAX_AI_DATA_CACHE_ENTRIES = 500;
/** Текущая дата по локальной таймзоне (YYYY-MM-DD) для инвалидации кэша трендов раз в день. */
function getTodayDateString(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getDiscoverPlantCacheDir(): string {
    const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
    return `${base}${DISCOVER_PLANT_CACHE_DIR_NAME}/`;
}

/** Ключ растения для кэша (без импорта из plantImageService). */
function plantKeyFromPlant(p: CatalogPlant): string {
    return `${p.commonName}|${p.scientificName || ''}`;
}

/** Имя файла из ключа: безопасно для ФС. */
function keyToFilename(plantKey: string): string {
    return plantKey.replace(/\|/g, '__').replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 150) + '.json';
}

const DISCOVER_PLANT_IMAGES_DIR = 'images';

function getDiscoverPlantImagesDir(): string {
    return getDiscoverPlantCacheDir() + DISCOVER_PLANT_IMAGES_DIR + '/';
}

function keyToImageFilename(plantKey: string, ext: string): string {
    return plantKey.replace(/\|/g, '__').replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 120) + '.' + ext;
}

/**
 * Сохранить data URL (AI-фото) в файл на диск и вернуть file:// URI.
 * При следующей загрузке кэша картинка будет браться с диска, без повторной генерации.
 */
async function saveDataUrlToImageFile(dataUrl: string, plantKey: string): Promise<string> {
    const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl);
    if (!match) throw new Error('Invalid data URL');
    const mime = match[1].toLowerCase();
    const base64 = match[2];
    const ext = mime === 'jpeg' || mime === 'jpg' ? 'jpg' : mime === 'png' ? 'png' : mime === 'webp' ? 'webp' : 'jpg';
    const imagesDir = getDiscoverPlantImagesDir();
    const info = await FileSystem.getInfoAsync(imagesDir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(imagesDir, { intermediates: true });
    const fileName = keyToImageFilename(plantKey, ext);
    const filePath = imagesDir + fileName;
    await FileSystem.writeAsStringAsync(filePath, base64, { encoding: FileSystem.EncodingType.Base64 });
    return filePath;
}

/** Кэш URL картинок по запросу (inat/commons/wiki/wikidata/ai). Ускоряет повторные открытия. */
export async function getFallbackImageCache(): Promise<Record<string, string>> {
    try {
        const raw = await AsyncStorage.getItem(FALLBACK_IMAGE_CACHE_KEY);
        if (!raw) return {};
        const data = JSON.parse(raw) as Record<string, string>;
        return typeof data === 'object' && data !== null ? data : {};
    } catch {
        return {};
    }
}

export async function setFallbackImageCache(record: Record<string, string>): Promise<void> {
    try {
        await AsyncStorage.setItem(FALLBACK_IMAGE_CACHE_KEY, JSON.stringify(record));
    } catch (e) {
        console.warn('[plantCache] setFallbackImageCache failed', e);
    }
}

export async function clearFallbackImageCache(): Promise<void> {
    try {
        await AsyncStorage.removeItem(FALLBACK_IMAGE_CACHE_KEY);
        await AsyncStorage.removeItem(FALLBACK_AI_DATA_CACHE_KEY);
    } catch (e) {
        console.warn('[plantCache] clearFallbackImageCache failed', e);
    }
}

/** Кэш успешно загруженных AI-картинок (file:// или data URL) по ключу запроса. Лимит 500 записей. */
export async function getFallbackAiDataCache(): Promise<Record<string, string>> {
    try {
        const raw = await AsyncStorage.getItem(FALLBACK_AI_DATA_CACHE_KEY);
        if (!raw) return {};
        const data = JSON.parse(raw) as Record<string, string>;
        if (typeof data !== 'object' || data === null) return {};
        const entries = Object.entries(data);
        if (entries.length > MAX_AI_DATA_CACHE_ENTRIES) {
            const trimmed = entries.slice(-MAX_AI_DATA_CACHE_ENTRIES);
            await AsyncStorage.setItem(FALLBACK_AI_DATA_CACHE_KEY, JSON.stringify(Object.fromEntries(trimmed)));
            return Object.fromEntries(trimmed);
        }
        return data;
    } catch {
        return {};
    }
}

export async function setFallbackAiDataCache(record: Record<string, string>): Promise<void> {
    try {
        const entries = Object.entries(record);
        const toStore = entries.length > MAX_AI_DATA_CACHE_ENTRIES
            ? Object.fromEntries(entries.slice(-MAX_AI_DATA_CACHE_ENTRIES))
            : record;
        await AsyncStorage.setItem(FALLBACK_AI_DATA_CACHE_KEY, JSON.stringify(toStore));
    } catch (e) {
        console.warn('[plantCache] setFallbackAiDataCache failed', e);
    }
}

export type CachedPlantRecord = Record<string, CatalogPlant>;

const MAX_PERSISTED_IMAGE_URL_LENGTH = 600;

const DISCOVER_CACHE_MIGRATED_KEY = 'plantlens_discover_cache_migrated';

/** Одна миграция: перенести старый кэш из AsyncStorage в файлы (один раз после обновления). */
async function migrateDiscoverCacheFromAsyncStorageIfNeeded(): Promise<void> {
    try {
        if (await AsyncStorage.getItem(DISCOVER_CACHE_MIGRATED_KEY)) return;
        const raw = await AsyncStorage.getItem(DISCOVER_PLANT_CACHE_KEY);
        await AsyncStorage.setItem(DISCOVER_CACHE_MIGRATED_KEY, '1');
        if (!raw) return;
        const data = JSON.parse(raw) as CachedPlantRecord;
        if (typeof data !== 'object' || data === null || Object.keys(data).length === 0) return;
        const dir = getDiscoverPlantCacheDir();
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        for (const [key, plant] of Object.entries(data)) {
            if (!plant || !plant.commonName) continue;
            let imageUrl = plant.imageUrl ?? '';
            if (imageUrl.startsWith('data:') || imageUrl.length > MAX_PERSISTED_IMAGE_URL_LENGTH || imageUrl.includes('pollinations.ai')) {
                imageUrl = getBackupPlantImage(plant.scientificName || plant.commonName || 'plant');
            }
            const toWrite = { ...plant, imageUrl };
            const path = dir + keyToFilename(key);
            await FileSystem.writeAsStringAsync(path, JSON.stringify(toWrite));
        }
        await AsyncStorage.removeItem(DISCOVER_PLANT_CACHE_KEY);
    } catch (e) {
        console.warn('[plantCache] migrateDiscoverCache failed', e);
    }
}

/** Загрузить весь кэш растений Discover из файлов (один файл — одно растение, без лимита по объёму). */
export async function getDiscoverPlantCache(): Promise<CachedPlantRecord> {
    try {
        await migrateDiscoverCacheFromAsyncStorageIfNeeded();
        const dir = getDiscoverPlantCacheDir();
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists || !info.isDirectory) return {};
        const files = await FileSystem.readDirectoryAsync(dir);
        const out: CachedPlantRecord = {};
        for (const name of files) {
            if (!name.endsWith('.json')) continue;
            try {
                const path = dir + name;
                const content = await FileSystem.readAsStringAsync(path);
                const plant = JSON.parse(content) as CatalogPlant;
                if (plant && plant.commonName) {
                    const key = plantKeyFromPlant(plant);
                    let imageUrl = plant.imageUrl ?? '';
                    const knownGood = getKnownGoodPlantImage(plant.commonName, plant.scientificName);
                    if (knownGood) imageUrl = knownGood;
                    else if (imageUrl.includes('pollinations.ai') || isInvalidImageDataUrl(imageUrl)) {
                        imageUrl = getBackupPlantImage(plant.scientificName || plant.commonName || 'plant');
                    }
                    out[key] = { ...plant, imageUrl };
                }
            } catch {
                // пропускаем битый файл
            }
        }
        return out;
    } catch {
        return {};
    }
}

/** URL «нормальный»: реальное фото (http/file), не заглушка и не Pollinations. */
function isGoodCachedUrl(url: string | undefined): boolean {
    if (!url) return false;
    if (url.includes('pollinations.ai')) return false;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://')) return true;
    return false;
}

/** Сохранить данные растения в кэш (файл на диск). AI-фото (data URL) сохраняем как файл изображения, в кэше храним file:// URI. Не перезаписываем, если уже есть нормальный URL (меньше лишних записей). */
export async function setCachedPlant(plantKey: string, plant: CatalogPlant): Promise<void> {
    try {
        const cache = await getDiscoverPlantCache();
        const existing = cache[plantKey]?.imageUrl;
        let imageUrl = plant.imageUrl ?? '';
        const hadDataUrl = imageUrl.startsWith('data:image');
        if (imageUrl.startsWith('data:image')) {
            try {
                imageUrl = await saveDataUrlToImageFile(imageUrl, plantKey);
                console.log('[PlantLens кэш] AI-фото сохранено на диск', { key: plantKey });
            } catch (e) {
                console.warn('[plantCache] saveDataUrlToImageFile failed', e);
                imageUrl = getBackupPlantImage(plant.scientificName || plant.commonName || 'plant');
            }
        } else if (imageUrl.startsWith('data:') || imageUrl.length > MAX_PERSISTED_IMAGE_URL_LENGTH) {
            imageUrl = getBackupPlantImage(plant.scientificName || plant.commonName || 'plant');
        }
        if (imageUrl.includes('pollinations.ai') || isInvalidImageDataUrl(imageUrl)) imageUrl = getBackupPlantImage(plant.scientificName || plant.commonName || 'plant');
        if (!hadDataUrl && isGoodCachedUrl(existing)) {
            return;
        }
        const toWrite = { ...plant, imageUrl };
        const dir = getDiscoverPlantCacheDir();
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        const path = dir + keyToFilename(plantKey);
        await FileSystem.writeAsStringAsync(path, JSON.stringify(toWrite));
        trimDiscoverCacheIfNeeded().catch(() => {});
        console.log('[PlantLens кэш] записан (файл)', { key: plantKey });
    } catch (e) {
        console.warn('[plantCache] setCachedPlant failed', e);
    }
}

/** Оставить в кэше Discover не более MAX_DISCOVER_CACHE_FILES файлов (удалить лишние по порядку в папке). */
async function trimDiscoverCacheIfNeeded(): Promise<void> {
    try {
        const dir = getDiscoverPlantCacheDir();
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists || !info.isDirectory) return;
        const files = (await FileSystem.readDirectoryAsync(dir)).filter((n) => n.endsWith('.json'));
        if (files.length <= MAX_DISCOVER_CACHE_FILES) return;
        const toDelete = files.length - MAX_DISCOVER_CACHE_FILES;
        for (let i = 0; i < toDelete; i++) {
            await FileSystem.deleteAsync(dir + files[i], { idempotent: true });
        }
    } catch (_) {}
}

/** Очистить кэш растений Discover (удалить папку с файлами). */
export async function clearDiscoverPlantCache(): Promise<void> {
    try {
        const dir = getDiscoverPlantCacheDir();
        const info = await FileSystem.getInfoAsync(dir, { size: false });
        if (info.exists) await FileSystem.deleteAsync(dir, { idempotent: true });
        await AsyncStorage.removeItem(DISCOVER_PLANT_CACHE_KEY);
    } catch (e) {
        console.warn('[plantCache] clearDiscoverPlantCache failed', e);
    }
}

// --- Кэш трендов (обновление раз в календарный день) ---

export type TrendsCacheEntry = { plants: CatalogPlant[]; fetchedAt: number; cachedDate?: string };

/** Получить кэш трендов для языка, если он закэширован сегодня (по локальной дате). */
export async function getCachedTrendsIfFresh(lang: Language = 'en'): Promise<CatalogPlant[] | null> {
    try {
        const key = getTrendsCacheKey(lang);
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return null;
        const entry = JSON.parse(raw) as TrendsCacheEntry;
        const { plants, fetchedAt, cachedDate } = entry;
        if (!Array.isArray(plants)) return null;
        const today = getTodayDateString();
        if (cachedDate && cachedDate === today) return plants;
        // старый формат без cachedDate: считаем свежим только если < 24 ч
        if (!cachedDate && typeof fetchedAt === 'number' && Date.now() - fetchedAt <= 24 * 60 * 60 * 1000) return plants;
        return null;
    } catch {
        return null;
    }
}

/** Сохранить тренды в кэш с датой текущего дня для данного языка. */
export async function setCachedTrends(plants: CatalogPlant[], lang: Language = 'en'): Promise<void> {
    try {
        const entry: TrendsCacheEntry = { plants, fetchedAt: Date.now(), cachedDate: getTodayDateString() };
        await AsyncStorage.setItem(getTrendsCacheKey(lang), JSON.stringify(entry));
    } catch (e) {
        console.warn('[plantCache] setCachedTrends failed', e);
    }
}

const TRENDS_LANGUAGES: Language[] = ['en', 'ru', 'de', 'fr', 'es'];

/** Очистить кэш трендов по всем языкам (например, из настроек). */
export async function clearTrendsCache(): Promise<void> {
    try {
        await Promise.all(TRENDS_LANGUAGES.map((lang) => AsyncStorage.removeItem(getTrendsCacheKey(lang))));
    } catch (e) {
        console.warn('[plantCache] clearTrendsCache failed', e);
    }
}

// --- Кэш полной информации Plant Detail / Plant Analysis (по plant.id), LRU макс. MAX_PLANT_DETAIL_CACHE ---

async function getPlantDetailOrder(): Promise<string[]> {
    try {
        const raw = await AsyncStorage.getItem(PLANT_DETAIL_ORDER_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw) as string[];
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

async function setPlantDetailOrder(ids: string[]): Promise<void> {
    try {
        await AsyncStorage.setItem(PLANT_DETAIL_ORDER_KEY, JSON.stringify(ids));
    } catch (_) {}
}

/** Загрузить из кэша полные данные растения (Plant Detail / Plant Analysis). При чтении обновляем порядок LRU. */
export async function getCachedPlantDetail(plantId: string): Promise<Plant | null> {
    try {
        const [raw, order] = await Promise.all([
            AsyncStorage.getItem(PLANT_DETAIL_CACHE_KEY),
            getPlantDetailOrder(),
        ]);
        if (!raw) return null;
        const cache = JSON.parse(raw) as Record<string, Plant>;
        const plant = cache?.[plantId];
        if (!plant || typeof plant !== 'object' || !plant.id) return null;
        const nextOrder = order.filter((id) => id !== plantId).concat(plantId);
        if (nextOrder.length !== order.length || nextOrder[nextOrder.length - 1] !== plantId) {
            setPlantDetailOrder(nextOrder).catch(() => {});
        }
        return plant;
    } catch {
        return null;
    }
}

/** Сохранить в кэш полные данные растения. Храним не более MAX_PLANT_DETAIL_CACHE записей (вытесняем самые старые). */
export async function setCachedPlantDetail(plant: Plant): Promise<void> {
    try {
        if (!plant?.id) return;
        const [raw, order] = await Promise.all([
            AsyncStorage.getItem(PLANT_DETAIL_CACHE_KEY),
            getPlantDetailOrder(),
        ]);
        const cache: Record<string, Plant> = raw ? (JSON.parse(raw) as Record<string, Plant>) : {};
        cache[plant.id] = { ...plant };
        let nextOrder = order.filter((id) => id !== plant.id).concat(plant.id);
        if (nextOrder.length > MAX_PLANT_DETAIL_CACHE) {
            const toRemove = nextOrder.slice(0, nextOrder.length - MAX_PLANT_DETAIL_CACHE);
            toRemove.forEach((id) => delete cache[id]);
            nextOrder = nextOrder.slice(-MAX_PLANT_DETAIL_CACHE);
        }
        await Promise.all([
            AsyncStorage.setItem(PLANT_DETAIL_CACHE_KEY, JSON.stringify(cache)),
            setPlantDetailOrder(nextOrder),
        ]);
    } catch (e) {
        console.warn('[plantCache] setCachedPlantDetail failed', e);
    }
}

/** Удалить из кэша данные одного растения (при удалении растения). */
export async function removeCachedPlantDetail(plantId: string): Promise<void> {
    try {
        if (!plantId) return;
        const [raw, order] = await Promise.all([
            AsyncStorage.getItem(PLANT_DETAIL_CACHE_KEY),
            getPlantDetailOrder(),
        ]);
        if (!raw) return;
        const cache = JSON.parse(raw) as Record<string, Plant>;
        delete cache[plantId];
        const nextOrder = order.filter((id) => id !== plantId);
        await Promise.all([
            AsyncStorage.setItem(PLANT_DETAIL_CACHE_KEY, JSON.stringify(cache)),
            setPlantDetailOrder(nextOrder),
        ]);
    } catch (e) {
        console.warn('[plantCache] removeCachedPlantDetail failed', e);
    }
}

/** Очистить кэш Plant Detail / Plant Analysis (вызывается из настроек). */
export async function clearPlantDetailCache(): Promise<void> {
    try {
        await Promise.all([
            AsyncStorage.removeItem(PLANT_DETAIL_CACHE_KEY),
            AsyncStorage.removeItem(PLANT_DETAIL_ORDER_KEY),
        ]);
    } catch (e) {
        console.warn('[plantCache] clearPlantDetailCache failed', e);
    }
}
