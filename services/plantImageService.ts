/**
 * Запасной сервис для фото растений.
 * Только Wikimedia Commons и iNaturalist, без стоковых фото (Pexels/Unsplash).
 */

import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';

/** Плейсхолдер «растение»: реальный JPEG. Используется только при пустом запросе; при неудаче API возвращаем уникальный AI-URL. */
const GENERIC_PLACEHOLDER =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Pilea_peperomioides_Chinese_money_plant.jpg/400px-Pilea_peperomioides_Chinese_money_plant.jpg";

/** Проверка: URL — общая заглушка (одно и то же фото для всех). Используется, чтобы не показывать её в трендах/Discover. */
export function isPlaceholderImageUrl(uri: string | undefined): boolean {
    return !uri || uri === GENERIC_PLACEHOLDER;
}

const LOG_PHOTO_SEARCH = true;
function photoLog(msg: string, data?: Record<string, unknown>) {
    if (LOG_PHOTO_SEARCH) console.log('[PlantLens фото]', msg, data ?? '');
}

/** User-Agent для всех запросов к API. Wikipedia/Wikimedia требуют формат "App/version (contact)"; без него возвращают 403. */
const API_REQUEST_HEADERS: HeadersInit = {
    'User-Agent': 'PlantLens/1.0 (https://plantlens.app)',
    'Accept': 'application/json',
};

const hashSeed = (seed: string): number => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
};

/** Пул из 20 стоковых ботанических фото (Wikimedia Commons): растения крупным планом, без людей и интерьеров. */
const BACKUP_PLANT_IMAGES: string[] = [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Pilea_peperomioides_Chinese_money_plant.jpg/400px-Pilea_peperomioides_Chinese_money_plant.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Nerium_oleander_Flower.jpg/400px-Nerium_oleander_Flower.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Digitalis_purpurea_004.JPG/400px-Digitalis_purpurea_004.JPG",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Convallaria_majalis_flower_2.jpg/400px-Convallaria_majalis_flower_2.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Centaurea_cyanus_001.jpg/400px-Centaurea_cyanus_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Taraxacum_officinale_flower.jpg/400px-Taraxacum_officinale_flower.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Betula_pendula_001.jpg/400px-Betula_pendula_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Quercus_robur_001.jpg/400px-Quercus_robur_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Urtica_dioica_001.jpg/400px-Urtica_dioica_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Sansevieria_trifasciata_001.jpg/400px-Sansevieria_trifasciata_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Monstera_deliciosa0.jpg/400px-Monstera_deliciosa0.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Lavandula-angustifolia.jpg/400px-Lavandula-angustifolia.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Rosa_hybrid_tea_01.jpg/400px-Rosa_hybrid_tea_01.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Tulipa_gesneriana_001.jpg/400px-Tulipa_gesneriana_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Dryopteris_filix-mas_002.jpg/400px-Dryopteris_filix-mas_002.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Echinocactus_grusonii_1.jpg/400px-Echinocactus_grusonii_1.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Ocimum_basilicum0.jpg/400px-Ocimum_basilicum0.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Mentha_spicata_002.jpg/400px-Mentha_spicata_002.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Aloe_vera_002.jpg/400px-Aloe_vera_002.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Orchis_mascula_001.jpg/400px-Orchis_mascula_001.jpg",
];

/**
 * Запасной сервис: вернуть URL картинки растения по seed (пул Wikimedia).
 */
export function getBackupPlantImage(seed: string): string {
    if (!seed) return GENERIC_PLACEHOLDER;
    const index = hashSeed(seed) % BACKUP_PLANT_IMAGES.length;
    return BACKUP_PLANT_IMAGES[index];
}

/** Растения, для которых API часто отдаёт неудачное фото (человек в кадре и т.п.). Всегда показываем проверенное ботаническое фото. */
const KNOWN_GOOD_PLANT_IMAGES: Record<string, string> = {
    nigella: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Nigella_damascena_bloom.jpg/400px-Nigella_damascena_bloom.jpg',
    'nigella damascena': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Nigella_damascena_bloom.jpg/400px-Nigella_damascena_bloom.jpg',
    нигелла: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Nigella_damascena_bloom.jpg/400px-Nigella_damascena_bloom.jpg',
};

/** Для растений из KNOWN_GOOD_PLANT_IMAGES возвращает проверенное фото (без людей в кадре). */
export function getKnownGoodPlantImage(commonName?: string, scientificName?: string): string | undefined {
    const norm = (s: string) => s.trim().toLowerCase();
    if (commonName) {
        const key = norm(commonName);
        if (KNOWN_GOOD_PLANT_IMAGES[key]) return KNOWN_GOOD_PLANT_IMAGES[key];
    }
    if (scientificName) {
        const key = norm(scientificName);
        if (KNOWN_GOOD_PLANT_IMAGES[key]) return KNOWN_GOOD_PLANT_IMAGES[key];
    }
    return undefined;
}

/** Кэш по нормализованному запросу — повторные вызовы возвращают результат мгновенно. Лимит размера для экономии памяти и AsyncStorage. */
const fallbackCache = new Map<string, string>();
const MAX_FALLBACK_CACHE_SIZE = 500;
const CACHE_KEY = (q: string) => q.trim().toLowerCase();

/** Кэш успешно загруженных AI-картинок: file:// путь к файлу на устройстве (редко — data URL из старого кэша). */
const aiDataCache = new Map<string, string>();

const POLLINATIONS_IMAGE_CACHE_DIR_NAME = 'plantlens_ai_images';
function getPollinationsImageCacheDir(): string {
    const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
    return `${base}${POLLINATIONS_IMAGE_CACHE_DIR_NAME}/`;
}

function hashForFilename(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    return Math.abs(h).toString(36);
}

/** Удалить запись из AI-кэша и, если это file://, удалить файл с диска. */
function removeAiCacheEntry(key: string): void {
    const uri = aiDataCache.get(key);
    aiDataCache.delete(key);
    if (uri?.startsWith('file://')) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

/** Сохраняет data URL картинки Pollinations в файл на устройстве, возвращает file:// URI. */
async function savePollinationsDataUrlToFile(dataUrl: string, cacheKey: string): Promise<string> {
    const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl);
    if (!match) throw new Error('Invalid data URL');
    const mime = match[1].toLowerCase();
    const base64 = match[2];
    const ext = mime === 'jpeg' || mime === 'jpg' ? 'jpg' : mime === 'png' ? 'png' : mime === 'webp' ? 'webp' : 'jpg';
    const dir = getPollinationsImageCacheDir();
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const fileName = hashForFilename(cacheKey) + '.' + ext;
    const filePath = dir + fileName;
    await FileSystem.writeAsStringAsync(filePath, base64, { encoding: FileSystem.EncodingType.Base64 });
    return filePath.startsWith('file://') ? filePath : 'file://' + filePath;
}

const EXPO_IMAGE_CACHE_PURGED_KEY = 'plantlens_expo_image_cache_purged_v1';

let fallbackCacheLoadedFromStorage = false;
/** Однократно очищает диск и память Expo Image, чтобы убрать старые записи с HTML (rate limit Pollinations). */
async function purgeExpoImageCacheOnce(): Promise<void> {
    try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        if (await AsyncStorage.getItem(EXPO_IMAGE_CACHE_PURGED_KEY) === '1') return;
        const mod = await import('expo-image');
        const Image = mod.Image ?? (mod as unknown as { default: typeof mod.Image }).default;
        if (Image) {
            if (typeof (Image as unknown as { clearMemoryCache?: () => Promise<boolean> }).clearMemoryCache === 'function') {
                await (Image as unknown as { clearMemoryCache: () => Promise<boolean> }).clearMemoryCache();
            }
            if (typeof (Image as unknown as { clearDiskCache?: () => Promise<boolean> }).clearDiskCache === 'function') {
                await (Image as unknown as { clearDiskCache: () => Promise<boolean> }).clearDiskCache();
            }
        }
        await AsyncStorage.setItem(EXPO_IMAGE_CACHE_PURGED_KEY, '1');
    } catch (_) {}
}

/** Загружает кэши URL и AI (пути к файлам/ data URL) из хранилища. Вызвать при монтировании экранов с каталогом/трендами. */
export async function ensureFallbackCacheLoaded(): Promise<void> {
    if (fallbackCacheLoadedFromStorage) return;
    fallbackCacheLoadedFromStorage = true;
    try {
        const { getFallbackImageCache, getFallbackAiDataCache } = await import('./plantCacheService');
        const [stored, aiStored] = await Promise.all([getFallbackImageCache(), getFallbackAiDataCache()]);
        Object.entries(stored).forEach(([k, v]) => {
            if (!k.startsWith('ai:')) fallbackCache.set(k, v);
        });
        const aiEntries = Object.entries(aiStored);
        const validAi = await Promise.all(aiEntries.map(async ([k, v]): Promise<[string, string] | null> => {
            if (v.startsWith('data:')) return [k, v];
            if (v.startsWith('file://')) {
                try {
                    const info = await FileSystem.getInfoAsync(v, { size: false });
                    return info.exists ? [k, v] : null;
                } catch { return null; }
            }
            return null;
        }));
        validAi.filter((x): x is [string, string] => x !== null).forEach(([k, v]) => aiDataCache.set(k, v));
        if (fallbackCache.size > MAX_FALLBACK_CACHE_SIZE) {
            const entries = [...fallbackCache.entries()];
            fallbackCache.clear();
            entries.slice(-MAX_FALLBACK_CACHE_SIZE).forEach(([k, v]) => fallbackCache.set(k, v));
            schedulePersistFallback();
        }
        purgeExpoImageCacheOnce();
    } catch (_) {}
}

let persistFallbackTimeout: ReturnType<typeof setTimeout> | null = null;
function schedulePersistFallback(): void {
    if (persistFallbackTimeout) clearTimeout(persistFallbackTimeout);
    persistFallbackTimeout = setTimeout(async () => {
        persistFallbackTimeout = null;
        try {
            const { setFallbackImageCache } = await import('./plantCacheService');
            const toStore = Object.fromEntries([...fallbackCache.entries()].filter(([k]) => !k.startsWith('ai:')));
            await setFallbackImageCache(toStore);
        } catch (_) {}
    }, 2000);
}

const MAX_AI_DATA_CACHE_ENTRIES = 500;
let persistAiDataTimeout: ReturnType<typeof setTimeout> | null = null;
function schedulePersistAiDataCache(): void {
    if (persistAiDataTimeout) clearTimeout(persistAiDataTimeout);
    persistAiDataTimeout = setTimeout(async () => {
        persistAiDataTimeout = null;
        try {
            const { setFallbackAiDataCache } = await import('./plantCacheService');
            const entries = [...aiDataCache.entries()];
            const toStore = entries.length > MAX_AI_DATA_CACHE_ENTRIES
                ? entries.slice(-MAX_AI_DATA_CACHE_ENTRIES)
                : entries;
            await setFallbackAiDataCache(Object.fromEntries(toStore));
        } catch (_) {}
    }, 2000);
}

function setCached(key: string, value: string): void {
    if (fallbackCache.size >= MAX_FALLBACK_CACHE_SIZE && !fallbackCache.has(key)) {
        const firstKey = fallbackCache.keys().next().value;
        if (firstKey !== undefined) fallbackCache.delete(firstKey);
    }
    fallbackCache.set(key, value);
    schedulePersistFallback();
}

/** Очистить in-memory и AsyncStorage кэш fallback (URL inat/commons/wiki/ai + AI). Удаляет и папку с фото Pollinations на устройстве. */
export async function clearFallbackImageCache(): Promise<void> {
    fallbackCache.clear();
    aiDataCache.clear();
    fallbackCacheLoadedFromStorage = false;
    try {
        const dir = getPollinationsImageCacheDir();
        const info = await FileSystem.getInfoAsync(dir, { size: false });
        if (info.exists) await FileSystem.deleteAsync(dir, { idempotent: true });
    } catch (_) {}
    try {
        const { clearFallbackImageCache: clearStorage } = await import('./plantCacheService');
        await clearStorage();
    } catch (_) {}
}

/** Очистить только кэши изображений: fallback URL, AI data URL, память и диск Expo Image. Удаляет в т.ч. старые записи с HTML (rate limit Pollinations). */
export async function clearImageCaches(): Promise<void> {
    await clearFallbackImageCache();
    try {
        const mod = await import('expo-image');
        const Image = mod.Image ?? (mod as unknown as { default: { clearDiskCache?: () => Promise<boolean>; clearMemoryCache?: () => Promise<boolean> } }).default;
        if (Image) {
            if (typeof (Image as unknown as { clearMemoryCache?: () => Promise<boolean> }).clearMemoryCache === 'function') {
                await (Image as unknown as { clearMemoryCache: () => Promise<boolean> }).clearMemoryCache();
            }
            if (typeof (Image as unknown as { clearDiskCache?: () => Promise<boolean> }).clearDiskCache === 'function') {
                await (Image as unknown as { clearDiskCache: () => Promise<boolean> }).clearDiskCache();
            }
        }
    } catch (_) {}
}

export type PlantSearchOptions = { skipCache?: boolean };

/**
 * Поиск фото растения в iNaturalist по научному/английскому названию. API без ключа.
 * Результат кэшируется по запросу. skipCache: не читать кэш (при повторном запросе после ошибки картинки).
 */
export async function searchiNaturalistByPlantName(query: string, opts?: PlantSearchOptions): Promise<string> {
    await ensureFallbackCacheLoaded();
    const q = query?.trim();
    if (!q) return GENERIC_PLACEHOLDER;
    const key = CACHE_KEY(q);
    if (!opts?.skipCache) {
        const cached = fallbackCache.get(`inat:${key}`);
        if (cached !== undefined) {
            photoLog('API запрос iNaturalist: из кэша', { query: q });
            return cached;
        }
    }
    const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(q)}&rank=species,genus,subspecies&per_page=1`;
    photoLog('API запрос iNaturalist: GET', { query: q, url });
    try {
        const res = await fetch(url, { headers: API_REQUEST_HEADERS });
        photoLog('API ответ iNaturalist', { query: q, status: res.status, ok: res.ok });
        if (!res.ok) {
            const out = getPlantImageAIUrl(q);
            setCached(`inat:${key}`, out);
            return out;
        }
        const data = await res.json();
        const results = data?.results ?? [];
        const taxon = results[0];
        const photoUrl = taxon?.default_photo?.medium_url || taxon?.default_photo?.small_url || taxon?.default_photo?.url;
        const out = photoUrl ? photoUrl : getPlantImageAIUrl(q);
        setCached(`inat:${key}`, out);
        if (!photoUrl) {
            photoLog('API результат iNaturalist: таксон без фото', { query: q, resultsCount: results.length, taxonId: taxon?.id, hasDefaultPhoto: !!taxon?.default_photo });
        }
        photoLog('API результат iNaturalist', { query: q, hasPhoto: !!photoUrl, source: photoUrl ? 'inat' : 'ai' });
        return out;
    } catch (e) {
        photoLog('API ошибка iNaturalist', { query: q, error: String(e) });
        const out = getPlantImageAIUrl(q);
        setCached(`inat:${key}`, out);
        return out;
    }
}

/**
 * Резервный сервис: поиск фото растения в Wikimedia Commons по названию. API без ключа.
 * Один запрос (generator=search + prop=imageinfo). Результат кэшируется.
 */
export async function searchWikimediaCommonsByPlantName(query: string, opts?: PlantSearchOptions): Promise<string> {
    await ensureFallbackCacheLoaded();
    const q = query?.trim();
    if (!q) return GENERIC_PLACEHOLDER;
    const key = CACHE_KEY(q);
    if (!opts?.skipCache) {
        const cached = fallbackCache.get(`commons:${key}`);
        if (cached !== undefined) {
            photoLog('API запрос Wikimedia Commons: из кэша', { query: q });
            return cached;
        }
    }
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json&origin=*`;
    photoLog('API запрос Wikimedia Commons: GET', { query: q, url: url.slice(0, 80) + '...' });
    try {
        const res = await fetch(url, { headers: API_REQUEST_HEADERS });
        photoLog('API ответ Wikimedia Commons', { query: q, status: res.status, ok: res.ok });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            photoLog('API Wikimedia Commons ошибка', { query: q, status: res.status, body: errText.slice(0, 200) });
            const out = getPlantImageAIUrl(q);
            setCached(`commons:${key}`, out);
            return out;
        }
        const data = await res.json();
        const pages = data?.query?.pages;
        const page = pages && Object.values(pages)[0] as { imageinfo?: Array<{ thumburl?: string; url?: string }> };
        const imageUrl = page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url;
        const out = imageUrl ? imageUrl : getPlantImageAIUrl(q);
        setCached(`commons:${key}`, out);
        photoLog('API результат Wikimedia Commons', { query: q, hasPhoto: !!imageUrl, source: imageUrl ? 'commons' : 'ai' });
        return out;
    } catch (e) {
        photoLog('API ошибка Wikimedia Commons', { query: q, error: String(e) });
        const out = getPlantImageAIUrl(q);
        setCached(`commons:${key}`, out);
        return out;
    }
}

/**
 * Резервный сервис 3: главное фото статьи Wikipedia по названию растения. API без ключа.
 * Один запрос (generator=search + prop=pageimages). Результат кэшируется.
 */
export async function searchWikipediaPageImage(query: string, opts?: PlantSearchOptions): Promise<string> {
    await ensureFallbackCacheLoaded();
    const q = query?.trim();
    if (!q) return GENERIC_PLACEHOLDER;
    const key = CACHE_KEY(q);
    if (!opts?.skipCache) {
        const cached = fallbackCache.get(`wiki:${key}`);
        if (cached !== undefined) {
            photoLog('API запрос Wikipedia: из кэша', { query: q });
            return cached;
        }
    }
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=1&prop=pageimages&pithumbsize=400&format=json&origin=*`;
    photoLog('API запрос Wikipedia: GET', { query: q, url: url.slice(0, 70) + '...' });
    try {
        const res = await fetch(url, { headers: API_REQUEST_HEADERS });
        photoLog('API ответ Wikipedia', { query: q, status: res.status, ok: res.ok });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            photoLog('API Wikipedia ошибка', { query: q, status: res.status, body: errText.slice(0, 200) });
            const out = getPlantImageAIUrl(q);
            setCached(`wiki:${key}`, out);
            return out;
        }
        const data = await res.json();
        const pages = data?.query?.pages;
        const page = pages && Object.values(pages)[0] as { thumbnail?: { source: string }; original?: { source: string } };
        const imageUrl = page?.thumbnail?.source || page?.original?.source;
        const out = imageUrl ? imageUrl : getPlantImageAIUrl(q);
        setCached(`wiki:${key}`, out);
        photoLog('API результат Wikipedia', { query: q, hasPhoto: !!imageUrl, source: imageUrl ? 'wiki' : 'ai' });
        return out;
    } catch (e) {
        photoLog('API ошибка Wikipedia', { query: q, error: String(e) });
        const out = getPlantImageAIUrl(q);
        setCached(`wiki:${key}`, out);
        return out;
    }
}

/** Таймаут одного запроса к внешнему API (Wikidata/Commons). */
const EXTERNAL_API_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { headers: API_REQUEST_HEADERS, signal: controller.signal });
        clearTimeout(to);
        return res;
    } catch (e) {
        clearTimeout(to);
        throw e;
    }
}

/**
 * Резервный сервис 4: Wikidata — поиск сущности по названию растения, свойство P18 (image) → URL через Commons API.
 * API без ключа. Заменяет EOL для большей стабильности.
 */
export async function searchWikidataByPlantName(query: string, opts?: PlantSearchOptions): Promise<string> {
    await ensureFallbackCacheLoaded();
    const q = query?.trim();
    if (!q) return GENERIC_PLACEHOLDER;
    const key = CACHE_KEY(q);
    if (!opts?.skipCache) {
        const cached = fallbackCache.get(`wikidata:${key}`);
        if (cached !== undefined) {
            photoLog('API запрос Wikidata: из кэша', { query: q });
            return cached;
        }
    }
    // Улучшенный поиск: добавляем "plant" или "flower" к запросу, чтобы избежать людей
    const enhancedQuery = q.toLowerCase();
    const isCommonPlantName = ['rose', 'роза', 'lily', 'лилия', 'tulip', 'тюльпан', 'daisy', 'ромашка'].some(name => enhancedQuery.includes(name));
    const searchTerm = isCommonPlantName ? `${q} plant` : q;
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchTerm)}&language=en&limit=5&format=json&origin=*`;
    photoLog('API запрос Wikidata: GET search', { query: q, searchTerm, timeoutMs: EXTERNAL_API_TIMEOUT_MS });
    try {
        const searchRes = await fetchWithTimeout(searchUrl, EXTERNAL_API_TIMEOUT_MS);
        photoLog('API ответ Wikidata search', { query: q, status: searchRes.status, ok: searchRes.ok });
        if (!searchRes.ok) {
            const out = getPlantImageAIUrl(q);
            setCached(`wikidata:${key}`, out);
            return out;
        }
        const searchData = await searchRes.json();
        const results = searchData?.search ?? [];
        if (!Array.isArray(results) || results.length === 0) {
            photoLog('API результат Wikidata: нет результатов', { query: q });
            const out = getPlantImageAIUrl(q);
            setCached(`wikidata:${key}`, out);
            return out;
        }
        // Ищем первую сущность, которая является растением (проверяем description или ищем в нескольких результатах)
        let entityId: string | null = null;
        for (const result of results) {
            if (!result?.id || typeof result.id !== 'string') continue;
            const desc = (result.description || '').toLowerCase();
            const label = (result.label || '').toLowerCase();
            // Пропускаем людей и другие не-растения
            if (desc.includes('person') || desc.includes('human') || desc.includes('actor') || desc.includes('singer') || 
                label.includes('person') || result.description?.toLowerCase().includes('given name')) {
                continue;
            }
            // Предпочитаем результаты с описанием, связанным с растениями
            if (desc.includes('plant') || desc.includes('flower') || desc.includes('species') || desc.includes('genus') || 
                label.includes('plant') || label.includes('flower') || !desc) {
                entityId = result.id;
                break;
            }
        }
        // Если не нашли подходящую, берем первую
        if (!entityId && results[0]?.id) {
            entityId = results[0].id;
        }
        if (!entityId || typeof entityId !== 'string') {
            photoLog('API результат Wikidata: нет подходящей entity', { query: q, resultsCount: results.length });
            const out = getPlantImageAIUrl(q);
            setCached(`wikidata:${key}`, out);
            return out;
        }
        const entitiesUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(entityId)}&props=claims&format=json&origin=*`;
        const entitiesRes = await fetchWithTimeout(entitiesUrl, EXTERNAL_API_TIMEOUT_MS);
        if (!entitiesRes.ok) {
            const out = getPlantImageAIUrl(q);
            setCached(`wikidata:${key}`, out);
            return out;
        }
        const entitiesData = await entitiesRes.json();
        const entity = entitiesData?.entities?.[entityId];
        const claims = entity?.claims;
        
        // Проверяем тип сущности (P31 - instance of): пропускаем людей и другие не-растения
        const p31 = claims?.P31;
        if (Array.isArray(p31)) {
            const instanceOf = p31.map((claim: any) => {
                const value = claim?.mainsnak?.datavalue?.value;
                if (value?.id) return value.id;
                return null;
            }).filter(Boolean);
            // Q5 = human, Q215627 = person, Q95074 = given name - пропускаем
            const isPerson = instanceOf.some((id: string) => id === 'Q5' || id === 'Q215627' || id === 'Q95074');
            if (isPerson) {
                photoLog('API результат Wikidata: сущность является человеком, пропускаем', { query: q, entityId, instanceOf });
                const out = getPlantImageAIUrl(q);
                setCached(`wikidata:${key}`, out);
                return out;
            }
            // Предпочитаем Q16521 (taxon), Q756 (plant), Q33986 (species)
            const isPlant = instanceOf.some((id: string) => id === 'Q16521' || id === 'Q756' || id === 'Q33986' || id === 'Q7432' || id === 'Q25329');
            if (!isPlant && instanceOf.length > 0) {
                photoLog('API результат Wikidata: сущность не является растением', { query: q, entityId, instanceOf });
            }
        }
        
        const p18 = claims?.P18;
        const filename = Array.isArray(p18) && p18[0]?.mainsnak?.datavalue?.value
            ? String(p18[0].mainsnak.datavalue.value).replace(/^File:/i, '').trim()
            : null;
        if (!filename) {
            photoLog('API результат Wikidata: нет P18 (image)', { query: q, entityId });
            const out = getPlantImageAIUrl(q);
            setCached(`wikidata:${key}`, out);
            return out;
        }
        const fileTitle = `File:${filename}`;
        const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json&origin=*`;
        const commonsRes = await fetchWithTimeout(commonsUrl, EXTERNAL_API_TIMEOUT_MS);
        if (!commonsRes.ok) {
            const out = getPlantImageAIUrl(q);
            setCached(`wikidata:${key}`, out);
            return out;
        }
        const commonsData = await commonsRes.json();
        const pages = commonsData?.query?.pages;
        const page = pages && Object.values(pages)[0] as { imageinfo?: Array<{ thumburl?: string; url?: string }> } | undefined;
        const imageUrl = page?.imageinfo?.[0]?.thumburl ?? page?.imageinfo?.[0]?.url;
        
        // Проверяем имя файла на наличие слов, связанных с людьми
        if (imageUrl && filename) {
            const filenameLower = filename.toLowerCase();
            const personKeywords = ['portrait', 'person', 'human', 'face', 'headshot', 'photo of', 'woman', 'man', 'girl', 'boy', 'people'];
            const isPersonImage = personKeywords.some(keyword => filenameLower.includes(keyword));
            if (isPersonImage) {
                photoLog('API результат Wikidata: изображение содержит портрет человека, пропускаем', { query: q, filename });
                const out = getPlantImageAIUrl(q);
                setCached(`wikidata:${key}`, out);
                return out;
            }
        }
        
        const out = imageUrl ? imageUrl : getPlantImageAIUrl(q);
        setCached(`wikidata:${key}`, out);
        photoLog('API результат Wikidata', { query: q, hasPhoto: !!imageUrl, source: imageUrl ? 'wikidata' : 'ai' });
        return out;
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        photoLog('API ошибка Wikidata', { query: q, error: errMsg });
        const out = getPlantImageAIUrl(q);
        setCached(`wikidata:${key}`, out);
        return out;
    }
}

/** Базовый URL генерации изображений (низкое качество, без ключа). */
const POLLINATIONS_IMAGE_BASE = 'https://image.pollinations.ai/prompt';

function getPollinationsApiKey(): string {
    const k = Constants.expoConfig?.extra?.POLLINATIONS_API_KEY;
    return (typeof k === 'string' && k.trim()) ? k.trim() : '';
}

/** Добавляет API-ключ Pollinations к URL (query-параметр), если ключ задан в extra. Кэш хранит URL без ключа. */
function appendPollinationsKey(url: string): string {
    const k = getPollinationsApiKey();
    if (!k || !url.includes('pollinations.ai')) return url;
    return url.includes('?') ? `${url}&key=${encodeURIComponent(k)}` : `${url}?key=${encodeURIComponent(k)}`;
}

/** URL от Pollinations — не считать «ответом API»; ждём реальное фото от inat/commons/wiki/wikidata. */
export function isPollinationsUrl(url: string | undefined): boolean {
    return !!(url && url.includes('pollinations.ai'));
}

/** Data URL с неверным MIME (HTML или octet-stream) — не показывать как картинку. */
export function isInvalidImageDataUrl(uri: string | undefined): boolean {
    if (!uri || !uri.startsWith('data:')) return false;
    const mime = uri.slice(5, uri.indexOf(';'));
    const lower = mime.toLowerCase();
    return lower.includes('html') || lower === 'application/octet-stream';
}
/** Меньший размер = быстрее генерация на Pollinations. */
const POLLINATIONS_WIDTH = 256;
const POLLINATIONS_HEIGHT = 256;

/**
 * Маппинг русских и английских названий растений на более специфичные запросы для AI
 */
const PLANT_NAME_MAPPING: Record<string, string> = {
    'роза': 'Rosa flower plant',
    'rose': 'Rosa flower plant',
    'ромашка': 'Matricaria chamomilla flower plant',
    'chamomile': 'Matricaria chamomilla flower plant',
    'daisy': 'Bellis perennis flower plant',
};

/**
 * Возвращает URL для ИИ-генерации (256×256). Pollinations храним только в формате картинок (data URL в aiDataCache),
 * ссылки в кэш не пишем — при успешной загрузке сохраняем только fetch → data URL.
 */
export function getPlantImageAIUrl(query: string): string {
    const q = query?.trim();
    if (!q) return GENERIC_PLACEHOLDER;
    const key = CACHE_KEY(q);
    const cachedDataUrl = aiDataCache.get(key);
    if (cachedDataUrl) {
        photoLog('API Pollinations (AI): из кэша (картинка)', { query: q });
        return cachedDataUrl;
    }
    const normalizedQuery = q.toLowerCase();
    const mappedQuery = PLANT_NAME_MAPPING[normalizedQuery] || q;
    if (PLANT_NAME_MAPPING[normalizedQuery]) {
        if (aiDataCache.has(key)) {
            photoLog('API Pollinations (AI): очищаем кэш картинки для маппинга', { query: q, mappedQuery });
            removeAiCacheEntry(key);
            schedulePersistAiDataCache();
        }
    }
    const prompt = `realistic botanical photograph of ${mappedQuery}, plant specimen, natural lighting, detailed leaves and stems, no people, no human faces`;
    const urlBase = `${POLLINATIONS_IMAGE_BASE}/${encodeURIComponent(prompt)}?width=${POLLINATIONS_WIDTH}&height=${POLLINATIONS_HEIGHT}&nologo=true`;
    const url = appendPollinationsKey(urlBase);
    photoLog('API Pollinations (AI): URL для загрузки (в кэш не пишем)', { query: q, mappedQuery, hasKey: !!getPollinationsApiKey() });
    return url;
}

/**
 * Последний рубеж: генерация реалистичного фото через ИИ (низкое качество).
 * Возвращает URL Pollinations — Image сам загрузит (генерация при первом запросе).
 * Кэшируется по запросу.
 */
export async function generatePlantImageAI(query: string): Promise<string> {
    return Promise.resolve(getPlantImageAIUrl(query));
}

/**
 * Замер скорости генерации ИИ-фото: запрашивает URL и замеряет время до ответа (TTFB или полная загрузка).
 * Для проверки в настройках или отладки. Возвращает { url, ms, ok }.
 */
export async function measureAIImageGenerationSpeed(query: string): Promise<{ url: string; ms: number; ok: boolean; error?: string }> {
    const url = getPlantImageAIUrl(query?.trim() || 'plant');
    const start = Date.now();
    try {
        const headers = isPollinationsUrl(url) ? getPollinationsFetchHeaders() : API_REQUEST_HEADERS;
        const res = await fetch(url, { method: 'GET', headers });
        const ms = Date.now() - start;
        const ok = res.ok && (res.headers.get('content-type')?.startsWith('image/') ?? false);
        return { url, ms, ok: ok && res.ok };
    } catch (e) {
        const ms = Date.now() - start;
        const error = e instanceof Error ? e.message : String(e);
        return { url, ms, ok: false, error };
    }
}

/** Таймаут для загрузки AI-картинки (генерация на Pollinations может занимать 10–25 с). */
const AI_IMAGE_FETCH_TIMEOUT_MS = 40000;
/** Задержка перед повтором при 502/503/504 (мс). */
const AI_IMAGE_RETRY_DELAY_MS = 3000;
/** Максимум попыток (включая первую). */
const AI_IMAGE_MAX_ATTEMPTS = 3;

const isRetryableStatus = (status: number): boolean =>
    status === 502 || status === 503 || status === 504;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Ошибка, когда Pollinations вернул HTML (например страницу «RATE LIMIT REACHED») вместо изображения. */
export const POLLINATIONS_RATE_LIMIT = 'POLLINATIONS_RATE_LIMIT';

/**
 * Одна попытка загрузки: fetch → blob → data URL.
 * Если сервер вернул HTML (rate limit или ошибка) — бросаем POLLINATIONS_RATE_LIMIT, чтобы не показывать баннер в UI.
 */
function getPollinationsFetchHeaders(): HeadersInit {
    const k = getPollinationsApiKey();
    const h: HeadersInit = { ...API_REQUEST_HEADERS };
    if (k) (h as Record<string, string>)['Authorization'] = `Bearer ${k}`;
    return h;
}

async function fetchImageAsDataUrlOnce(
    url: string,
    controller: AbortController,
    timeoutMs: number
): Promise<string> {
    const headers = isPollinationsUrl(url) ? getPollinationsFetchHeaders() : API_REQUEST_HEADERS;
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
    }
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
        photoLog('AI → data URL: ответ HTML (rate limit или ошибка), не подставляем в картинку', { url: url.slice(0, 50) });
        throw new Error(POLLINATIONS_RATE_LIMIT);
    }
    const blob = await res.blob();
    if (blob.type && blob.type.toLowerCase().includes('html')) {
        photoLog('AI → data URL: blob type HTML', { url: url.slice(0, 50) });
        throw new Error(POLLINATIONS_RATE_LIMIT);
    }
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result as string;
            if (!dataUrl || !dataUrl.startsWith('data:image/')) {
                photoLog('AI → data URL: не изображение (octet-stream/html), не подставляем', { prefix: dataUrl?.slice(0, 30) });
                reject(new Error(POLLINATIONS_RATE_LIMIT));
                return;
            }
            resolve(dataUrl);
        };
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
    });
}

/**
 * Загружает изображение по URL (в т.ч. Pollinations) и возвращает data URL.
 * При 502/503/504 повторяет запрос до AI_IMAGE_MAX_ATTEMPTS раз с задержкой.
 * Если передан queryForCache и загрузка успешна — сохраняет data URL в кэш для этого запроса.
 */
export async function fetchImageAsDataUrl(
    url: string,
    timeoutMs: number = AI_IMAGE_FETCH_TIMEOUT_MS,
    queryForCache?: string
): Promise<string> {
    photoLog('AI → data URL: начало загрузки', { url: url.slice(0, 60) + '...', timeoutMs });
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= AI_IMAGE_MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const dataUrl = await fetchImageAsDataUrlOnce(url, controller, timeoutMs);
            clearTimeout(to);
            photoLog('AI → data URL: успех', { size: dataUrl.length, attempt });
            if (queryForCache && dataUrl.startsWith('data:image/')) {
                const key = CACHE_KEY(queryForCache.trim());
                try {
                    const fileUri = await savePollinationsDataUrlToFile(dataUrl, key);
                    aiDataCache.set(key, fileUri);
                    if (aiDataCache.size > MAX_AI_DATA_CACHE_ENTRIES) {
                        const firstKey = aiDataCache.keys().next().value;
                        if (firstKey !== undefined) removeAiCacheEntry(firstKey);
                    }
                    schedulePersistAiDataCache();
                    photoLog('AI → сохранено на устройство', { query: key, file: fileUri.slice(0, 50) + '...' });
                } catch (e) {
                    photoLog('AI → не удалось сохранить на диск, кэш в памяти', { query: key, err: String(e) });
                    aiDataCache.set(key, dataUrl);
                    if (aiDataCache.size > MAX_AI_DATA_CACHE_ENTRIES) {
                        const firstKey = aiDataCache.keys().next().value;
                        if (firstKey !== undefined) removeAiCacheEntry(firstKey);
                    }
                    schedulePersistAiDataCache();
                }
            }
            return dataUrl;
        } catch (e) {
            clearTimeout(to);
            lastError = e instanceof Error ? e : new Error(String(e));
            const status = (lastError as Error & { status?: number }).status;
            if (attempt < AI_IMAGE_MAX_ATTEMPTS && status != null && isRetryableStatus(status)) {
                await sleep(AI_IMAGE_RETRY_DELAY_MS);
                continue;
            }
            throw lastError;
        }
    }
    throw lastError ?? new Error('AI → data URL failed');
}

/** Таймаут на один источник (мс). */
const SOURCE_TIMEOUT_MS = 20000;
/** Общий таймаут (мс): если ни один источник не ответил — отдаём AI URL. */
const TOTAL_TIMEOUT_MS = 20000;

const timeoutReject = (ms: number): Promise<never> =>
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

export type GetPlantImageFirstAvailableOptions = { skipFallbackCache?: boolean };

/**
 * Запрос ко всем источникам параллельно; возвращает первый полученный не-заглушку URL.
 * На каждый источник — таймаут 5 с; общий таймаут 7 с, чтобы не зависать на медленных растениях.
 * skipFallbackCache: при повторе после ошибки не брать URL из fallback-кэша (запросить свежие API).
 */
export async function getPlantImageFirstAvailable(query: string, opts?: GetPlantImageFirstAvailableOptions): Promise<string> {
    await ensureFallbackCacheLoaded();
    const q = query?.trim();
    if (!q) {
        photoLog('API: пустой query → AI', {});
        return getPlantImageAIUrl('plant');
    }
    const key = CACHE_KEY(q);
    const skipFallback = opts?.skipFallbackCache === true;
    if (!skipFallback) {
        const fromCache = fallbackCache.get(`inat:${key}`) ?? fallbackCache.get(`commons:${key}`) ?? fallbackCache.get(`wiki:${key}`) ?? fallbackCache.get(`wikidata:${key}`);
        if (fromCache && !isPlaceholderImageUrl(fromCache)) {
            photoLog('API: URL из fallback-кэша (inat/commons/wiki/wikidata)', { query: q });
            return fromCache;
        }
    } else {
        photoLog('API: skipFallbackCache — запрос свежих API', { query: q });
    }
    photoLog('API: параллельный запрос inat, commons, wiki, wikidata', { query: q, timeoutSource: SOURCE_TIMEOUT_MS, timeoutTotal: TOTAL_TIMEOUT_MS, skipCache: skipFallback });
    const wrap = (p: Promise<string>, source: string) =>
        p.then((url) => {
            if (!url || isPlaceholderImageUrl(url) || isPollinationsUrl(url)) {
                const reason = isPollinationsUrl(url) ? 'ai_fallback' : 'placeholder';
                photoLog(`API: ${source} отклонирован`, { query: q, reason });
                return Promise.reject(new Error(reason));
            }
            photoLog(`API: ответ от ${source}`, { query: q });
            return url;
        });
    const withTimeout = (p: Promise<string>) => Promise.race([p, timeoutReject(SOURCE_TIMEOUT_MS)]);
    const searchOpts = skipFallback ? { skipCache: true } as const : undefined;
    const inat = wrap(withTimeout(searchiNaturalistByPlantName(q, searchOpts)), 'iNaturalist');
    const commons = wrap(withTimeout(searchWikimediaCommonsByPlantName(q, searchOpts)), 'Wikimedia');
    const wiki = wrap(withTimeout(searchWikipediaPageImage(q, searchOpts)), 'Wikipedia');
    const wikidata = wrap(withTimeout(searchWikidataByPlantName(q, searchOpts)), 'Wikidata');
    const first = Promise.any([inat, commons, wiki, wikidata]);
    const withTotalTimeout = Promise.race([
        first,
        timeoutReject(TOTAL_TIMEOUT_MS).then(() => Promise.reject(new Error('total timeout'))),
    ]);
    try {
        return await withTotalTimeout;
    } catch (e) {
        photoLog('API: таймаут или все источники вернули placeholder → AI fallback', { query: q, err: String(e) });
        throw e; // вызывающий getPlantImageUrl вызовет aiFallback (OpenRouter или Pollinations)
    }
}

/** Ключ растения для кэша (commonName|scientificName). */
export function getPlantKey(plant: { commonName: string; scientificName?: string }): string {
    return `${plant.commonName}|${plant.scientificName || ''}`;
}

/**
 * Единая логика получения URL фото растения.
 * Порядок: кэш Discover → параллельные API (inat/commons/wiki/wikidata) → AI (openRouter или Pollinations).
 * aiFallback вызывается для последнего шага; если не передан — используется getPlantImageAIUrl (Pollinations).
 */
export type PlantImageOptions = {
    skipCache?: boolean;
    aiFallback?: (query: string) => Promise<string>;
};

export async function getPlantImageUrl(
    plant: { commonName: string; scientificName?: string },
    options?: PlantImageOptions
): Promise<string> {
    const key = getPlantKey(plant);
    const query = (plant.scientificName?.trim() || 'plant');
    const knownGood = getKnownGoodPlantImage(plant.commonName, plant.scientificName);
    if (knownGood) {
        photoLog('поиск фото: известное хорошее фото', { key });
        return knownGood;
    }
    photoLog('поиск фото', { scientificName: query, key, skipCache: options?.skipCache });

    const { getDiscoverPlantCache, setCachedPlant } = await import('./plantCacheService');

    if (!options?.skipCache) {
        const cache = await getDiscoverPlantCache();
        const cached = cache[key]?.imageUrl;
        if (cached && !isPlaceholderImageUrl(cached)) {
            photoLog('взято из кэша Discover', { key });
            return cached;
        }
        photoLog('кэш Discover пуст или placeholder', { key });
    }

    photoLog('запрос API', { query });
    let url: string;
    const skipFallbackCache = options?.skipCache === true;

    try {
        url = await getPlantImageFirstAvailable(query, { skipFallbackCache });
        if (url && !isPlaceholderImageUrl(url)) {
            if (isPollinationsUrl(url)) {
                photoLog('ИИ создал фото (все API отклонены)', { query, url: url.slice(0, 60) + '...' });
            } else {
                photoLog('получен URL из API', { query, url: url.slice(0, 60) + '...' });
            }
            const record = { commonName: plant.commonName, scientificName: plant.scientificName ?? '', description: 'description' in plant ? (plant as { description?: string }).description ?? '' : '', imageUrl: url };
            setCachedPlant(key, record).catch(() => {});
            return url;
        }
    } catch (e) {
        photoLog('ошибка API', { query, err: String(e) });
    }

    const aiFallback = options?.aiFallback ?? ((q: string) => Promise.resolve(getPlantImageAIUrl(q)));
    const useOpenRouter = !!options?.aiFallback;
    photoLog('ИИ создаёт фото', { query, через: useOpenRouter ? 'OpenRouter (при ошибке → Pollinations)' : 'Pollinations' });
    url = await aiFallback(query);
    photoLog('ИИ создал фото (URL готов)', { query, url: url?.slice(0, 60) + '...', pollinations: isPollinationsUrl(url) });
    const record = { commonName: plant.commonName, scientificName: plant.scientificName ?? '', description: 'description' in plant ? (plant as { description?: string }).description ?? '' : '', imageUrl: url };
    setCachedPlant(key, record).catch(() => {});
    return url;
}
