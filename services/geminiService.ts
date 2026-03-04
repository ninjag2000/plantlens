import Constants from 'expo-constants';
import type { Language } from '../services/translations';
import { GeminiPlantResponse, AIInsights, CatalogCategory, CatalogPlant, DiagnosisRecord, RepottingAnalysis, Plant } from "../types";
import { getPlantImageAIUrl } from "./plantImageService";
import { getDiscoverPool, REGIONAL_FLORA_CATEGORY_KEY, fetchRegionalPlantsNextPage } from "./discoverPlantsData";
import { getCachedTrendsIfFresh, setCachedTrends } from "./plantCacheService";

const RESPONSE_LANGUAGE_NAMES: Record<Language, string> = {
    en: 'English',
    ru: 'Russian',
    de: 'German',
    fr: 'French',
    es: 'Spanish',
};

/** Все 5 поддерживаемых языков для подсказок в промптах. */
const ALL_LANGUAGE_NAMES = (Object.values(RESPONSE_LANGUAGE_NAMES) as string[]).join(', ');

// --- OPENROUTER API CLIENT (React Native compatible) ---

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Get API key from environment
const getApiKey = (): string => {
    const key = Constants.expoConfig?.extra?.OPENROUTER_API_KEY || '';
    
    // Debug logging
    console.log('getApiKey called');
    console.log('Constants.expoConfig?.extra:', Constants.expoConfig?.extra);
    console.log('Key value:', key ? `${key.substring(0, 10)}...` : 'empty');
    console.log('Key length:', key?.length || 0);
    
    if (!key || key.includes('PLACEHOLDER') || key === '${OPENROUTER_API_KEY}') {
        console.warn('OPENROUTER_API_KEY not configured or is placeholder');
        return '';
    }
    
    // Debug: log first 10 chars to verify key is loaded (but don't log full key for security)
    if (key && key.length > 0) {
        console.log('OpenRouter API key loaded successfully, length:', key.length);
    }
    return key;
};

interface OpenRouterMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | Array<{ type: 'text' | 'image_url', text?: string, image_url?: { url: string } }>;
}

interface OpenRouterResponse {
    choices?: Array<{
        message?: {
            content?: string | Array<{ type?: string; image_url?: { url: string }; imageUrl?: { url: string }; text?: string }>;
            images?: Array<{ type?: string; image_url?: { url: string }; imageUrl?: { url: string } }>;
        };
    }>;
    error?: { message: string };
}

const IMAGE_GENERATION_MODELS = ['google/gemini-2.5-flash-image-preview', 'google/gemini-2.5-flash-image'];

/** Основная (платная) модель. */
const PRIMARY_MODEL = 'google/gemini-2.0-flash-001';
/** Модели с поддержкой изображений (vision). При 429 пробуем следующую. */
const IMAGE_CAPABLE_MODELS = [
    'google/gemini-2.0-flash-001',
    'google/gemini-2.5-flash',
    'google/gemini-flash-1.5',
];
/** Бесплатные модели при 402/429. При ошибке переключаемся на следующую. (1b-instruct:free даёт 404.) */
const FREE_FALLBACK_MODELS = [
    'meta-llama/llama-3.2-3b-instruct:free',
];

const fetchWithModel = async (
    apiKey: string,
    model: string,
    body: { messages: OpenRouterMessage[]; response_format?: { type: string }; max_tokens: number }
): Promise<{ ok: boolean; status: number; text: string; data?: OpenRouterResponse }> => {
    const payload = { ...body, model };
    const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://plantlens.app',
            'X-Title': 'PlantLens',
        },
        body: JSON.stringify(payload),
    });
    const text = await response.text();
    let data: OpenRouterResponse | undefined;
    try {
        data = JSON.parse(text) as OpenRouterResponse;
    } catch (_) {}
    return { ok: response.ok, status: response.status, text, data };
};

const callOpenRouter = async (
    messages: OpenRouterMessage[],
    jsonMode: boolean = false,
    options?: { max_tokens?: number }
): Promise<string> => {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY not configured');
    }

    const maxTokens = options?.max_tokens ?? 2048;
    const body: any = {
        messages,
        max_tokens: maxTokens,
    };
    if (jsonMode) {
        body.response_format = { type: 'json_object' };
    }

    // Проверяем, есть ли изображения в сообщениях
    const hasImages = messages.some(msg => {
        if (typeof msg.content === 'string') return false;
        if (Array.isArray(msg.content)) {
            return msg.content.some(part => part.type === 'image_url');
        }
        return false;
    });

    // Если есть изображения, используем несколько vision-моделей по очереди (при 429 — следующая)
    const modelsToTry = hasImages 
        ? [...IMAGE_CAPABLE_MODELS]
        : [PRIMARY_MODEL, ...FREE_FALLBACK_MODELS];
    
    let lastError: Error | null = null;
    let lastStatus: number | null = null;
    let triedPrimaryAfterFree429 = false;
    let freeModel429 = false;

    for (const model of modelsToTry) {
        const { ok, status, text, data } = await fetchWithModel(apiKey, model, body);
        const isFreeModel = FREE_FALLBACK_MODELS.includes(model);

        if (ok && data) {
            if (data.error) {
                lastError = new Error(data.error.message);
                lastStatus = status;
                continue;
            }
            const raw = data.choices?.[0]?.message?.content;
            const content = typeof raw === 'string' ? raw : Array.isArray(raw)
                ? (raw as Array<{ text?: string; content?: string } | string>).map((x) => typeof x === 'string' ? x : (x?.text ?? (x as any)?.content ?? '')).filter(Boolean).join('')
                : '';
            if (content && content.trim()) {
                if (model !== PRIMARY_MODEL) {
                    const fallbackType = hasImages ? 'vision fallback' : 'free fallback';
                    console.log('[OpenRouter] Used', fallbackType, 'model:', model);
                }
                return content.trim();
            }
            lastError = new Error('No response from OpenRouter');
            lastStatus = 0;
            continue;
        }

        if (status === 401) {
            console.warn('OpenRouter API 401: Check if API key is valid and properly configured');
            lastError = new Error(text || 'Unauthorized');
            lastStatus = status;
            break;
        }

        if (status === 402) {
            lastError = new Error(text || 'Insufficient credits');
            lastStatus = status;
            continue;
        }
        if (status === 404) {
            lastError = new Error(text || 'Model not found');
            lastStatus = status;
            // Для запросов с изображениями пробуем следующую vision-модель
            continue;
        }

        if (status === 429) {
            if (isFreeModel) {
                freeModel429 = true;
                lastError = new Error(text || 'Rate limit exceeded');
                lastStatus = status;
                // Если бесплатная модель дала 429, пробуем платную еще раз (только для текстовых запросов)
                if (!triedPrimaryAfterFree429 && !hasImages) {
                    triedPrimaryAfterFree429 = true;
                    console.log('[OpenRouter] Free model rate limited, retrying paid model:', PRIMARY_MODEL);
                    const { ok: retryOk, status: retryStatus, text: retryText, data: retryData } = await fetchWithModel(apiKey, PRIMARY_MODEL, body);
                    if (retryOk && retryData && !retryData.error) {
                        const retryRaw = retryData.choices?.[0]?.message?.content;
                        const retryContent = typeof retryRaw === 'string' ? retryRaw : Array.isArray(retryRaw)
                            ? (retryRaw as Array<{ text?: string; content?: string } | string>).map((x) => typeof x === 'string' ? x : (x?.text ?? (x as any)?.content ?? '')).filter(Boolean).join('')
                            : '';
                        if (retryContent && retryContent.trim()) {
                            console.log('[OpenRouter] Paid model succeeded after free model rate limit');
                            return retryContent.trim();
                        }
                    }
                    // Если платная тоже не сработала, продолжаем с ошибкой
                    if (retryStatus === 429) {
                        lastError = new Error(retryText || 'Rate limit exceeded');
                        lastStatus = retryStatus;
                    }
                }
            } else {
                // Платная / vision-модель дала 429 — пробуем следующую модель из списка
                lastError = new Error(text || 'Rate limit exceeded');
                lastStatus = status;
                if (hasImages) {
                    console.log('[OpenRouter] Model rate limited for image request, trying next:', model);
                }
            }
            continue;
        }

        lastError = new Error(`OpenRouter API error: ${status} - ${text}`);
        lastStatus = status;
        if (status >= 500) continue;
        break;
    }

    // Показываем сообщение про кредиты только при реальном HTTP 402
    if (lastError && lastStatus === 402) {
        throw new Error('Недостаточно кредитов OpenRouter. Пополните баланс: https://openrouter.ai/settings/credits');
    }
    if (lastError && lastStatus === 429) {
        // Если запрос с изображениями (диагностика), всегда используем платную модель
        if (hasImages) {
            // Для диагностики с изображениями используем только платную модель
            // Если она дала 429, это временная перегрузка сервиса
            throw new Error('Сервис временно перегружен. Подождите минуту и попробуйте снова.');
        }
        // Для текстовых запросов: если бесплатная модель дала 429, но мы не пробовали платную
        if (freeModel429 && !triedPrimaryAfterFree429) {
            throw new Error('Бесплатная модель временно перегружена. Подождите минуту и попробуйте снова или пополните баланс OpenRouter для стабильной работы.');
        }
        // Если платная модель дала 429 (для текстовых запросов)
        throw new Error('Сервис временно перегружен. Подождите минуту и попробуйте снова.');
    }
    throw lastError || new Error('No response from OpenRouter');
};

/**
 * Один запрос OpenRouter: для списка растений вернуть карту «запрос → URL картинки».
 * Только URL с upload.wikimedia.org или inaturalist.org. Ускоряет подгрузку при наличии ключа.
 */
export async function getPlantImageUrlsBatchOpenRouter(queries: string[]): Promise<Record<string, string>> {
    const list = queries.filter((q) => q?.trim()).slice(0, 20);
    if (list.length === 0) return {};
    const apiKey = getApiKey();
    if (!apiKey) return {};
    const plantList = list.map((q) => q.trim()).join(', ');
    const prompt = `For each of these plants return exactly one direct image URL. Use only real URLs from Wikimedia Commons (domain upload.wikimedia.org) or iNaturalist (static.inaturalist.org). Reply with JSON only, no other text. Format: {"exact plant name from list": "https://..."}. Plants: ${plantList}`;
    try {
        const content = await callOpenRouter([{ role: 'user', content: prompt }], true, { max_tokens: 2048 });
        const parsed = extractJSON(content);
        if (!parsed || typeof parsed !== 'object') return {};
        const out: Record<string, string> = {};
        const allowed = /^https:\/\/(upload\.wikimedia\.org|static\.inaturalist\.org|.*\.wikimedia\.org)/i;
        for (const [key, val] of Object.entries(parsed)) {
            const url = typeof val === 'string' ? val.trim() : '';
            if (url && allowed.test(url)) out[key.trim()] = url;
        }
        return out;
    } catch {
        return {};
    }
}

// Helper to extract JSON from response (устойчивый к обрезке и лишнему тексту)
const extractJSON = (text: string): any => {
    const trim = text.trim();
    const jsonMatch = trim.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = jsonMatch ? jsonMatch[1].trim() : trim;
    const tryParse = (s: string): any => {
        try {
            return JSON.parse(s);
        } catch {
            return null;
        }
    };
    let out = tryParse(raw);
    if (out) return out;
    // Пробуем найти первый валидный JSON-объект в тексте
    const start = raw.indexOf('{');
    if (start >= 0) {
        let depth = 0;
        for (let i = start; i < raw.length; i++) {
            if (raw[i] === '{') depth++;
            else if (raw[i] === '}') {
                depth--;
                if (depth === 0) {
                    out = tryParse(raw.slice(start, i + 1));
                    if (out) return out;
                    break;
                }
            }
        }
    }
    throw new Error('Could not parse JSON from response');
};

// Нормализовать ключи ответа (snake_case, обрезанный JSON) и вытащить commonName/scientificName из сырого текста при необходимости
const normalizeParsedResponse = (parsed: any, rawText: string): any => {
    if (!parsed || typeof parsed !== 'object') return parsed;
    const out = { ...parsed };
    out.commonName = out.commonName ?? out.common_name;
    out.scientificName = out.scientificName ?? out.scientific_name;
    if (out.careTips && typeof out.careTips === 'object') {
        out.careTips = {
            watering: out.careTips.watering ?? out.careTips.Watering ?? '',
            sunlight: out.careTips.sunlight ?? out.careTips.Sunlight ?? '',
            soil: out.careTips.soil ?? out.careTips.Soil ?? '',
            temperature: out.careTips.temperature ?? out.careTips.Temperature ?? '',
        };
    } else {
        out.careTips = { watering: '', sunlight: '', soil: '', temperature: '' };
    }
    out.description = out.description ?? out.about ?? '';
    out.about = out.about ?? '';
    const extractFromRaw = (key: string): string | undefined => {
        const m = rawText.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
        return m?.[1]?.replace(/\\"/g, '"').trim();
    };
    if (!out.commonName?.trim()) out.commonName = extractFromRaw('commonName');
    if (!out.scientificName?.trim()) out.scientificName = extractFromRaw('scientificName');
    if (!out.plantType?.trim()) out.plantType = extractFromRaw('plantType');
    if (!out.lifespan?.trim()) out.lifespan = extractFromRaw('lifespan');
    if (!out.habitat?.trim()) out.habitat = extractFromRaw('habitat');
    if (!out.historyAndLegends?.trim()) out.historyAndLegends = extractFromRaw('historyAndLegends');
    if (!out.adaptationStrategy?.trim()) out.adaptationStrategy = extractFromRaw('adaptationStrategy');
    if (!out.nameMeaning?.trim()) out.nameMeaning = extractFromRaw('nameMeaning');
    if (!out.nameHistory?.trim()) out.nameHistory = extractFromRaw('nameHistory');
    const pg = extractFromRaw('plantGroup');
    const maxH = extractFromRaw('maxHeight');
    const maxW = extractFromRaw('maxWidth');
    const leafType = extractFromRaw('leafType');
    const leafColor = extractFromRaw('leafColor');
    const plantingTime = extractFromRaw('plantingTime');
    const flowerSize = extractFromRaw('flowerSize');
    const floweringTime = extractFromRaw('floweringTime');
    const flowerColor = extractFromRaw('flowerColor');
    const fruitName = extractFromRaw('fruitName') || extractFromRaw('fruit_name');
    const harvestTime = extractFromRaw('harvestTime') || extractFromRaw('harvest_time');
    const fruitColor = extractFromRaw('fruitColor') || extractFromRaw('fruit_color');
    // Слить уже распарсенные characteristics от ИИ (в т.ч. fruit), затем перезаписать из raw при наличии
    out.characteristics = out.characteristics || {};
    const norm = (o: any, keys: [string, string][]): any => {
        if (!o || typeof o !== 'object') return {};
        const r: any = { ...o };
        keys.forEach(([snake, camel]) => { if (r[snake] !== undefined) { r[camel] = r[camel] ?? r[snake]; } });
        return r;
    };
    const parsedM = norm(parsed.characteristics?.mature, [['plant_group', 'plantGroup'], ['max_height', 'maxHeight'], ['max_width', 'maxWidth'], ['leaf_color', 'leafColor'], ['leaf_type', 'leafType'], ['planting_time', 'plantingTime']]);
    const parsedFl = norm(parsed.characteristics?.flower, [['flowering_time', 'floweringTime'], ['flower_size', 'flowerSize'], ['flower_color', 'flowerColor']]);
    const parsedFr = norm(parsed.characteristics?.fruit, [['fruit_name', 'fruitName'], ['harvest_time', 'harvestTime'], ['fruit_color', 'fruitColor']]);
    out.characteristics.mature = { ...parsedM, ...out.characteristics.mature };
    out.characteristics.flower = { ...parsedFl, ...out.characteristics.flower };
    out.characteristics.fruit = { ...parsedFr, ...out.characteristics.fruit };
    const hasMorph = pg || maxH || maxW || leafType || leafColor || plantingTime || flowerSize || floweringTime || flowerColor || fruitName || harvestTime || fruitColor;
    if (hasMorph) {
        out.characteristics.mature = out.characteristics.mature || {};
        if (pg) out.characteristics.mature.plantGroup = pg;
        if (maxH) out.characteristics.mature.maxHeight = maxH;
        if (maxW) out.characteristics.mature.maxWidth = maxW;
        if (leafType) out.characteristics.mature.leafType = leafType;
        if (leafColor) out.characteristics.mature.leafColor = leafColor;
        if (plantingTime) out.characteristics.mature.plantingTime = plantingTime;
        out.characteristics.flower = out.characteristics.flower || {};
        if (flowerSize) out.characteristics.flower.flowerSize = flowerSize;
        if (floweringTime) out.characteristics.flower.floweringTime = floweringTime;
        if (flowerColor) out.characteristics.flower.flowerColor = flowerColor;
        out.characteristics.fruit = out.characteristics.fruit || {};
        if (fruitName) out.characteristics.fruit.fruitName = fruitName;
        if (harvestTime) out.characteristics.fruit.harvestTime = harvestTime;
        if (fruitColor) out.characteristics.fruit.fruitColor = fruitColor;
    }
    out.characteristics.fruit = out.characteristics.fruit || {};
    if (!out.characteristics.fruit.fruitName?.trim()) out.characteristics.fruit.fruitName = 'Не применимо';
    if (!out.characteristics.fruit.harvestTime?.trim()) out.characteristics.fruit.harvestTime = 'Не применимо';
    if (!out.characteristics.fruit.fruitColor?.trim()) out.characteristics.fruit.fruitColor = 'Не применимо';
    return out;
};

// Извлечь название растения из ответа (taxonomy, description и т.д.), если commonName/scientificName пусты
const extractPlantNameFromParsed = (parsed: any): { commonName?: string; scientificName?: string } => {
    const taxonomy = parsed?.taxonomy;
    if (taxonomy && typeof taxonomy === 'object') {
        const genus = taxonomy.genus?.trim();
        const species = taxonomy.species?.trim();
        const family = taxonomy.family?.trim();
        if (genus && genus !== '-' && genus !== '—') {
            const sci = species ? `${genus} ${species}`.trim() : genus;
            const common = parsed?.commonName?.trim();
            return { scientificName: sci || undefined, commonName: common || sci || genus };
        }
        if (family && family !== '-' && family !== '—') {
            const sci = (taxonomy.genus && taxonomy.species) ? `${taxonomy.genus} ${taxonomy.species}`.trim() : taxonomy.genus || family;
            return { commonName: family, scientificName: sci };
        }
    }
    const similar = parsed?.similarPlants?.[0];
    if (similar?.commonName?.trim()) return { commonName: similar.commonName.trim(), scientificName: similar.scientificName?.trim() };
    const desc = parsed?.description?.trim();
    if (desc && desc.length > 10) {
        const firstPhrase = desc.split(/[.!?]/)[0]?.trim();
        const words = firstPhrase?.split(/\s+/).filter((w: string) => w.length > 2);
        if (words && words.length >= 1 && words.length <= 5) {
            const candidate = words.slice(0, 3).join(' ');
            if (!/^(не|это|растение|вид|род|семейство|неизвестно|unknown)/i.test(candidate))
                return { commonName: candidate, scientificName: parsed?.scientificName?.trim() };
        }
    }
    return {};
};

// --- RELIABLE IMAGE SERVICE ---

/** Плейсхолдер «растение»: реальный JPEG (RN Image не отображает SVG data URI — иначе серый экран). */
export const GENERIC_FALLBACK_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Pilea_peperomioides_Chinese_money_plant.jpg/400px-Pilea_peperomioides_Chinese_money_plant.jpg";

/** Пул из 20 стоковых ботанических фото (Wikimedia Commons), без стоковых (Pexels/Unsplash). */
const RELIABLE_PLANT_IMAGES = [
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

const hashSeed = (seed: string): number => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
};

export const getReliableImage = (seed: string): string => {
    if (!seed) return GENERIC_FALLBACK_IMAGE;
    const index = hashSeed(seed) % RELIABLE_PLANT_IMAGES.length;
    return RELIABLE_PLANT_IMAGES[index];
};

/** Настоящие фото растений для блока «В тренде» — Wikimedia Commons (ботанические снимки видов, без людей). */
const TRENDING_PLANT_IMAGE_URLS: Record<string, string> = {
    "Стрелиция": "https://upload.wikimedia.org/wikipedia/commons/e/ed/Strelitzia_reginae_Strelicja_kr%C3%B3lewska_2023-02-24_07.jpg",
    "Калатея": "https://upload.wikimedia.org/wikipedia/commons/e/e9/Calathea_ornata_%27Sanderiana%27_Kalatea_2010-08-01_01.jpg",
    "Алоказия": "https://upload.wikimedia.org/wikipedia/commons/9/9c/Alocasia_brancifolia_as_an_indoor_house_plant.jpg",
    "Филодендрон": "https://upload.wikimedia.org/wikipedia/commons/0/07/Philodendron_%28_Araceae_%29.jpg",
    "Пилея": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Pilea_peperomia_and_pups.jpg/400px-Pilea_peperomia_and_pups.jpg",
    "Нигелла": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Nigella_damascena_bloom.jpg/400px-Nigella_damascena_bloom.jpg",
};

// --- AI FUNCTIONS ---

export const identifyPlant = async (image: string | string[], mimeType: string = 'image/jpeg', responseLanguage: Language = 'en'): Promise<GeminiPlantResponse> => {
    try {
        const imageData = Array.isArray(image) ? image[0] : image;
        const base64Image = imageData.startsWith('data:') ? imageData : `data:${mimeType};base64,${imageData}`;
        const langName = RESPONSE_LANGUAGE_NAMES[responseLanguage];

        const prompt = `You are a botanical expert. Identify this plant and provide COMPLETE botanical information in ${langName}.

CRITICAL RULES - READ CAREFULLY:
1. If this is NOT a plant image, return ONLY: {"commonName":"INVALID_PLANT","scientificName":"INVALID_PLANT"}
2. THE MOST IMPORTANT FIELD IS "commonName" - you MUST identify the plant and provide its common name in ${langName}
3. EVERY field below MUST be filled with REAL botanical data based on the plant you identify
4. NEVER use: "—", "-", "unknown", "неизвестно", "N/A", null, empty strings, or placeholders
5. If you cannot determine exact data, use your botanical knowledge to provide the most likely accurate information
6. ALL string fields must contain actual text, not placeholders
7. Even if you are not 100% sure of the species, always provide at least taxonomy.genus and taxonomy.species (or family) and a best-guess commonName — do not leave name fields empty

REQUIRED JSON structure (every field is mandatory):
{
    "commonName": "MANDATORY - Common name in ${langName}. THIS IS THE MOST IMPORTANT FIELD. You MUST identify the plant from the image and provide its real common name in ${langName}. This field CANNOT be empty.",
    "scientificName": "MANDATORY - Full scientific name in APG IV format (e.g. Monstera deliciosa, Ficus benjamina, Aloe vera). This field CANNOT be empty.",
    "description": "Detailed 2-3 sentence description of the plant's appearance and characteristics, in ${langName}",
    "plantType": "EXACTLY one of (translate to ${langName} if needed): Tree, Shrub, Herb, Vine, Succulent, Fern, Moss, Aquatic plant",
    "lifespan": "EXACTLY one of (in ${langName}): Perennial, Annual, Biennial",
    "habitat": "Natural habitat and geographic range in ${langName}",
    "careTips": {
        "watering": "Specific watering instructions in ${langName}",
        "sunlight": "Specific light requirements in ${langName}",
        "soil": "Specific soil type and composition in ${langName}",
        "temperature": "Temperature range (e.g. '18-26°C')"
    },
    "taxonomy": {
        "kingdom": "Plantae",
        "phylum": "Full phylum name",
        "class": "Full class name",
        "order": "Full order name",
        "family": "Full family name",
        "genus": "Full genus name",
        "species": "Full species name"
    },
    "characteristics": {
        "mature": {
            "plantGroup": "EXACTLY one of (in ${langName}): Flowering, Conifer, Fern, Moss, Algae",
            "maxHeight": "Height range in ${langName} with units",
            "maxWidth": "Width/spread in ${langName} with units",
            "leafColor": "Actual leaf colors in ${langName}",
            "leafType": "Leaf shape/type in ${langName}",
            "plantingTime": "Best time to plant in ${langName}"
        },
        "flower": {
            "floweringTime": "When it flowers in ${langName}",
            "flowerSize": "Flower size in ${langName} with units",
            "flowerColor": "Flower colors in ${langName}"
        },
        "fruit": {
            "fruitName": "Name of fruit/berry/infructescence in ${langName} if applicable",
            "harvestTime": "When fruit is harvested or ripens in ${langName}",
            "fruitColor": "Fruit colors in ${langName}"
        }
    },
    "pros": ["Array of advantages in ${langName}"],
    "cons": ["Array of disadvantages in ${langName}"],
    "safety": {
        "toxicity": {
            "humans": "Detailed toxicity information for humans in ${langName}",
            "pets": "Detailed toxicity information for pets in ${langName}"
        },
        "allergies": {
            "humans": "Allergy information for humans in ${langName}",
            "pets": "Allergy information for pets in ${langName}"
        }
    },
    "faq": [
        {"question": "Question in ${langName}", "answer": "Answer in ${langName}"}
    ],
    "similarPlants": [
        {"commonName": "Similar plant name", "scientificName": "Scientific name"}
    ],
    "about": "Additional information about the plant in ${langName}",
    "historyAndLegends": "Historical and cultural information in ${langName}"
}

EXAMPLE for a Monstera:
{
    "commonName": "Монстера Деликатесная",
    "scientificName": "Monstera deliciosa",
    "description": "Крупная тропическая лиана с большими сердцевидными листьями, имеющими характерные прорези и отверстия. В природе может достигать значительных размеров, используя воздушные корни для опоры.",
    "plantType": "Лиана",
    "lifespan": "Многолетнее",
    "habitat": "Тропические леса Центральной и Южной Америки, от южной Мексики до Панамы",
    "careTips": {
        "watering": "Поливайте раз в неделю, когда верхний слой почвы просохнет на 2-3 см",
        "sunlight": "Яркий рассеянный свет, избегайте прямых солнечных лучей",
        "soil": "Рыхлый субстрат с добавлением коры и перлита",
        "temperature": "18-26°C"
    },
    "taxonomy": {
        "kingdom": "Plantae",
        "phylum": "Tracheophyta",
        "class": "Magnoliopsida",
        "order": "Alismatales",
        "family": "Araceae",
        "genus": "Monstera",
        "species": "M. deliciosa"
    },
    "characteristics": {
        "mature": {
            "plantGroup": "Цветковое",
            "maxHeight": "2-3 метра в домашних условиях, до 20 метров в природе",
            "maxWidth": "1-1.5 метра",
            "leafColor": "Темно-зеленый, глянцевый",
            "leafType": "Крупные, сердцевидные, перфорированные",
            "plantingTime": "Весна, круглый год в помещении"
        },
        "flower": {
            "floweringTime": "Лето, редко в домашних условиях",
            "flowerSize": "20-30 см",
            "flowerColor": "Кремовый, белый"
        },
        "fruit": {
            "fruitName": "Цериман",
            "harvestTime": "10-12 месяцев после цветения",
            "fruitColor": "Зеленый, желтый"
        }
    },
    "pros": ["Декоративный вид", "Очищает воздух", "Неприхотлив"],
    "cons": ["Требует много места", "Ядовит для животных"],
    "safety": {
        "toxicity": {
            "humans": "Ядовит при употреблении в пищу, может вызвать раздражение слизистых",
            "pets": "Ядовит для кошек и собак, вызывает раздражение ротовой полости"
        },
        "allergies": {
            "humans": "Может вызывать аллергические реакции у чувствительных людей",
            "pets": "Обычно не вызывает аллергий у животных"
        }
    },
    "faq": [
        {"question": "Как часто поливать монстеру?", "answer": "Поливайте раз в неделю, когда почва просохнет на 2-3 см"}
    ],
    "similarPlants": [
        {"commonName": "Филодендрон", "scientificName": "Philodendron"}
    ],
    "about": "Монстера - популярное комнатное растение родом из тропических лесов",
    "historyAndLegends": "Название 'Monstera' происходит от латинского 'monstrum' - чудовище, из-за необычного вида листьев"
}

IMPORTANT: Before returning JSON, make sure:
1. You have identified the plant in the image
2. You have provided a real common name in "commonName" field in ${langName}
3. The "commonName" is NOT empty, NOT a placeholder
4. All other text fields are in ${langName} and filled with real botanical data
5. "characteristics.fruit" is REQUIRED: always include "fruitName", "harvestTime", "fruitColor". For decorative/non-fruiting plants use a phrase like "Not applicable" in ${langName}, not empty.

Now identify the plant in the image and return COMPLETE JSON with ALL fields filled in ${langName}, especially "commonName" and "characteristics.fruit".`;

        const messages: OpenRouterMessage[] = [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: base64Image } },
                { type: 'text', text: prompt }
            ]
        }];

        const text = await callOpenRouter(messages, true);
        console.log("AI Response text:", text.substring(0, 500)); // Логируем первые 500 символов
        
        let parsed: any;
        try {
            parsed = extractJSON(text);
        } catch (parseError) {
            console.error("JSON parse error:", parseError, "Text:", text);
            throw new Error("Failed to parse AI response as JSON");
        }
        if (Array.isArray(parsed) && parsed.length > 0) parsed = parsed[0];
        parsed = normalizeParsedResponse(parsed, text);
        console.log("Parsed response commonName:", parsed?.commonName, "plantType:", parsed?.plantType);
        
        // Явный ответ «не растение» — только тогда показываем ошибку распознавания
        const explicitInvalid = parsed?.commonName === 'INVALID_PLANT' || parsed?.scientificName === 'INVALID_PLANT';
        if (explicitInvalid) {
            parsed.commonName = 'INVALID_PLANT';
            parsed.scientificName = 'INVALID_PLANT';
            parsed.error = 'recognition_failed';
            return parsed as GeminiPlantResponse;
        }
        
        // Нет названия — пробуем извлечь из taxonomy, description, similarPlants
        const needName = !parsed?.commonName?.trim() && !parsed?.scientificName?.trim();
        if (needName) {
            const extracted = extractPlantNameFromParsed(parsed);
            if (extracted.commonName?.trim()) parsed.commonName = extracted.commonName;
            if (extracted.scientificName?.trim()) parsed.scientificName = extracted.scientificName;
        }
        
        // Всё ещё нет commonName — подставляем scientificName
        if (!parsed?.commonName?.trim()) {
            if (parsed?.scientificName?.trim()) parsed.commonName = parsed.scientificName;
            else {
                parsed.commonName = 'INVALID_PLANT';
                parsed.scientificName = 'INVALID_PLANT';
                parsed.error = 'recognition_failed';
            }
        }
        
        return parsed as GeminiPlantResponse;
    } catch (error) {
        console.error("Identification failed:", error);
        return {
            commonName: "Неопознанное растение",
            scientificName: "Plantae incognita",
            description: "Не удалось идентифицировать растение. Попробуйте еще раз.",
            careTips: { watering: "Умеренный", sunlight: "Рассеянный", soil: "Стандартный", temperature: "18-26°C" },
            error: "Failed to identify"
        } as GeminiPlantResponse;
    }
};

export const searchWorldDatabase = async (query: string, responseLanguage: Language = 'en'): Promise<GeminiPlantResponse> => {
    try {
        const langName = RESPONSE_LANGUAGE_NAMES[responseLanguage];
        const prompt = `Search the botanical database for "${query}". 
        Provide a detailed profile in ${langName}. Use APG IV classification.
        REQUIRED: fill every field; no placeholders. Always include "characteristics.fruit" (for non-fruiting use "Not applicable" or equivalent in ${langName}) and "characteristics.mature" with "plantGroup".
        
        Return JSON (all string values in ${langName}):
        {
            "commonName": "string in ${langName}",
            "scientificName": "string", 
            "description": "detailed 2-3 sentences in ${langName}",
            "plantType": "EXACTLY one of (translate to ${langName}): Tree, Shrub, Herb, Vine, Succulent, Fern, Moss, Aquatic plant",
            "lifespan": "EXACTLY one of (in ${langName}): Perennial, Annual, Biennial",
            "habitat": "Natural habitat and geographic range in ${langName}",
            "careTips": { "watering": "...", "sunlight": "...", "soil": "...", "temperature": "..." },
            "taxonomy": { "kingdom": "Plantae", "phylum": "...", "class": "...", "order": "...", "family": "...", "genus": "...", "species": "..." },
            "characteristics": {
                "mature": { "plantGroup": "EXACTLY one of (in ${langName}): Flowering, Conifer, Fern, Moss, Algae", "maxHeight": "...", "maxWidth": "...", "leafColor": "...", "leafType": "...", "plantingTime": "..." },
                "flower": { "floweringTime": "...", "flowerSize": "...", "flowerColor": "..." },
                "fruit": { "fruitName": "name or not applicable", "harvestTime": "when or not applicable", "fruitColor": "colors or not applicable" }
            },
            "pros": ["..."],
            "cons": ["..."],
            "safety": { "toxicity": { "humans": "...", "pets": "..." }, "allergies": { "humans": "...", "pets": "..." } },
            "faq": [{ "question": "...", "answer": "..." }],
            "similarPlants": [{ "commonName": "...", "scientificName": "..." }],
            "about": "short additional info in ${langName}",
            "nameMeaning": "Origin and meaning of the plant name (etymology) in ${langName}. 1-2 sentences.",
            "nameHistory": "History of discovery, use, spread of the plant in ${langName}. 1-2 sentences.",
            "historyAndLegends": "Cultural significance, legends, myths about the plant in ${langName}. 2-3 sentences.",
            "adaptationStrategy": "How the plant adapts to environment: drought, shade, epiphytism, storage, etc. 2-3 sentences in ${langName}."
        }`;

        const messages: OpenRouterMessage[] = [
            { role: 'system', content: `You are a professional botanist. Always return ALL fields: plantType, lifespan, habitat, characteristics.mature.plantGroup, characteristics.fruit, historyAndLegends (origin of name, history, culture), adaptationStrategy (how plant adapts). No placeholders; use real botanical data. Supported languages: ${ALL_LANGUAGE_NAMES}. You MUST return all text in the requested language: ${langName}.` },
            { role: 'user', content: prompt }
        ];

        const text = await callOpenRouter(messages, true);
        let parsed: any;
        try {
            parsed = extractJSON(text);
        } catch (parseErr) {
            console.warn("Global search: could not parse JSON from response", parseErr);
            // Fallback: open similar-plant page with query as name so UI still works
            return {
                commonName: query,
                scientificName: query,
                description: `Информация по запросу «${query}» временно недоступна. Попробуйте позже или уточните название.`,
                careTips: { watering: "—", sunlight: "—", soil: "—", temperature: "—" },
            } as GeminiPlantResponse;
        }
        if (Array.isArray(parsed) && parsed.length > 0) parsed = parsed[0];
        parsed = normalizeParsedResponse(parsed, text);
        return parsed as GeminiPlantResponse;
    } catch (error) {
        console.error("Global search failed:", error);
        throw error;
    }
};

/** Detect language of plant content from text fields (for plants without contentLanguage). */
export function detectContentLanguage(plant: Plant | null | undefined): Language {
    if (!plant) return 'en';
    const sample = [
        plant.description,
        plant.commonName,
        plant.adaptationStrategy,
        plant.habitat,
        plant.historyAndLegends,
    ].filter(Boolean).join(' ');
    if (!sample.trim()) return 'en';
    if (/[\u0400-\u04FF]/.test(sample)) return 'ru';
    if (/[äöüßÄÖÜ]/.test(sample)) return 'de';
    if (/[àâçéèêëîïôùûüœæ]/.test(sample)) return 'fr';
    if (/[ñáéíóúü¿¡]/.test(sample)) return 'es';
    return 'en';
}

/** Fetch plant text details by scientific name in the requested language (no image). */
export async function getPlantDetailsInLanguage(
    scientificName: string,
    commonName: string,
    responseLanguage: Language
): Promise<Partial<GeminiPlantResponse>> {
    const langName = RESPONSE_LANGUAGE_NAMES[responseLanguage];
    const prompt = `You are a botanical expert. Return COMPLETE plant information in ${langName} for the plant:
Scientific name: ${scientificName}
Common name (reference): ${commonName}

Return ONLY valid JSON with ALL text fields in ${langName}. No placeholders. Required structure:
{
    "commonName": "Common name in ${langName}",
    "scientificName": "${scientificName}",
    "description": "2-3 sentences in ${langName}",
    "plantType": "One of: Tree, Shrub, Herb, Vine, Succulent, Fern, Moss, Aquatic plant (or translation in ${langName})",
    "lifespan": "Perennial/Annual/Biennial in ${langName}",
    "habitat": "Natural habitat in ${langName}",
    "about": "Short additional info in ${langName}",
    "adaptationStrategy": "How plant adapts to environment, 2-3 sentences in ${langName}",
    "historyAndLegends": "Cultural significance, legends in ${langName}",
    "nameMeaning": "Origin of name in ${langName}",
    "nameHistory": "History of discovery in ${langName}",
    "careTips": { "watering": "...", "sunlight": "...", "soil": "...", "temperature": "..." },
    "characteristics": {
        "mature": { "plantGroup": "Flowering/Conifer/Fern/Moss/Algae in ${langName}", "maxHeight": "...", "maxWidth": "...", "leafColor": "...", "leafType": "...", "plantingTime": "..." },
        "flower": { "floweringTime": "...", "flowerSize": "...", "flowerColor": "..." },
        "fruit": { "fruitName": "...", "harvestTime": "...", "fruitColor": "..." }
    },
    "safety": { "toxicity": { "humans": "...", "pets": "..." }, "allergies": { "humans": "...", "pets": "..." } },
    "pros": ["..."],
    "cons": ["..."],
    "faq": [{"question": "...", "answer": "..."}],
    "similarPlants": [{"commonName": "...", "scientificName": "..."}]
}
Minimum 3 FAQ items. Minimum 3 similar plants. All strings in ${langName}.`;

    const messages: OpenRouterMessage[] = [
        { role: 'system', content: 'You are a professional botanist. Return only valid JSON. All text in the requested language. No placeholders.' },
        { role: 'user', content: prompt }
    ];

    const text = await callOpenRouter(messages, true, { max_tokens: 4096 });
    let parsed: any;
    try {
        parsed = extractJSON(text);
    } catch {
        console.warn('[geminiService] getPlantDetailsInLanguage: parse failed', text?.substring(0, 200));
        return {};
    }
    if (Array.isArray(parsed) && parsed.length > 0) parsed = parsed[0];
    parsed = normalizeParsedResponse(parsed, text);
    return parsed as Partial<GeminiPlantResponse>;
}

export const diagnosePlant = async (image: string | string[], mimeType: string = 'image/jpeg', plantNameContext?: string, responseLanguage: Language = 'en'): Promise<DiagnosisRecord | { error: string }> => {
    try {
        const imageData = Array.isArray(image) ? image[0] : image;
        const base64Image = imageData.startsWith('data:') ? imageData : `data:${mimeType};base64,${imageData}`;
        const langName = RESPONSE_LANGUAGE_NAMES[responseLanguage];

        const contextStr = plantNameContext ? `The plant is ${plantNameContext}.` : '';
        const prompt = `Analyze this plant image for diseases, pests, or nutrient issues. ${contextStr}
        Respond in ${langName}. All text fields (plantName, problemTitle, symptoms, treatment, prevention) must be in ${langName}.
        
        Return JSON:
        {
            "plantName": "string",
            "problemTitle": "string",
            "severity": "low|medium|high",
            "isHealthy": boolean,
            "symptoms": "string",
            "treatment": "string",
            "prevention": "string",
            "healthAssessment": {
                "healthy": 0-100,
                "pests": 0-100,
                "diseases": 0-100,
                "nutrition": 0-100,
                "abiotic": 0-100
            }
        }`;

        const messages: OpenRouterMessage[] = [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: base64Image } },
                { type: 'text', text: prompt }
            ]
        }];

        console.log('[diagnosePlant] Calling OpenRouter API...');
        const text = await callOpenRouter(messages, true);
        console.log('[diagnosePlant] OpenRouter API response received, length:', text?.length || 0);
        
        if (!text || !text.trim()) {
            console.error('[diagnosePlant] Empty response from OpenRouter');
            return { error: "Empty response from API" };
        }
        
        const data = extractJSON(text);
        
        if (!data || typeof data !== 'object') {
            console.error('[diagnosePlant] Failed to parse response:', text?.substring(0, 200));
            return { error: "Failed to parse diagnosis response" };
        }
        
        console.log('[diagnosePlant] Diagnosis data extracted:', data.problemTitle || 'no problemTitle');

        return {
            id: Math.random().toString(36).substring(2, 15),
            date: new Date().toISOString(),
            ...data
        };
    } catch (error: any) {
        console.error("Diagnosis failed:", error);
        const errorMessage = error?.message || String(error) || "Diagnosis failed";
        // Если это ошибка rate limit или перегрузки, возвращаем более понятное сообщение
        if (errorMessage.includes('перегружен') || errorMessage.includes('rate limit') || errorMessage.includes('429')) {
            return { error: "Сервис временно перегружен. Подождите минуту и попробуйте снова." };
        }
        return { error: errorMessage };
    }
};

export const analyzeRepotting = async (image: string | string[], mimeType: string = 'image/jpeg', responseLanguage: Language = 'en'): Promise<RepottingAnalysis | { error: string }> => {
    try {
        const imageData = Array.isArray(image) ? image[0] : image;
        const base64Image = imageData.startsWith('data:') ? imageData : `data:${mimeType};base64,${imageData}`;
        const langName = RESPONSE_LANGUAGE_NAMES[responseLanguage];

        const prompt = `Analyze if this plant needs repotting. Check pot size, visible roots, soil condition. Respond in ${langName}. All text fields (reason, instructions, potSizeRecommendation, soilType) must be in ${langName}.
        
        Return JSON:
        {
            "needsRepotting": boolean,
            "urgency": "low|medium|high",
            "reason": "string",
            "instructions": ["step1", "step2", ...],
            "potSizeRecommendation": "string",
            "soilType": "string"
        }`;

        const messages: OpenRouterMessage[] = [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: base64Image } },
                { type: 'text', text: prompt }
            ]
        }];

        const text = await callOpenRouter(messages, true);
        return extractJSON(text) as RepottingAnalysis;
    } catch (error) {
        console.error("Repotting analysis failed:", error);
        return { error: "Analysis failed" };
    }
};

export const getPersonalizedCareArticle = async (plantName: string, category: string, weather?: any, responseLanguage: Language = 'en'): Promise<{ title: string, text: string, error?: boolean }> => {
    try {
        const weatherContext = weather
            ? `Weather: ${weather.temperature}°C, ${weather.humidity}% humidity.`
            : 'General indoor conditions.';
        const langName = RESPONSE_LANGUAGE_NAMES[responseLanguage];

        const prompt = `Write a detailed horticultural guide about "${category}" for "${plantName}".
        ${weatherContext}
        Language: ${langName}. The entire guide (headers and body) must be written in ${langName}.
        
        Structure:
        1. 5 sections with ### headers
        2. Each section 60+ words
        3. Cover: Physiology, Common Myths, Specific requirements, Advanced tips
        
        Output: markdown text only, no JSON.`;

        const messages: OpenRouterMessage[] = [{ role: 'user', content: prompt }];
        const text = await callOpenRouter(messages);

        return { title: `${category}`, text };
    } catch (e) {
        console.error(e);
        return { title: "Error", text: "", error: true };
    }
};

function extractImageUrlFromMessage(message: { images?: Array<{ image_url?: { url: string }; imageUrl?: { url: string } }>; content?: string | Array<{ image_url?: { url: string }; imageUrl?: { url: string } }> } | null): string | null {
    if (!message) return null;
    const images = message.images;
    if (images?.length) {
        const first = images[0];
        const url = first?.image_url?.url ?? first?.imageUrl?.url;
        if (url && (url.startsWith('data:image/') || url.startsWith('https://'))) return url;
    }
    const content = message.content;
    if (Array.isArray(content)) {
        for (const part of content) {
            const url = part?.image_url?.url ?? part?.imageUrl?.url;
            if (url && (url.startsWith('data:image/') || url.startsWith('https://'))) return url;
        }
    }
    return null;
}

/**
 * Генерация реалистичного фото растения через OpenRouter (Gemini 2.5 Flash Image).
 * Для fallback-картинок в Discover/Трендах. При ошибке вызывающий код подставит Pollinations.
 */
export const generatePlantImageUrl = async (plantName: string): Promise<string> => {
    const query = plantName?.trim() || 'plant';
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');
    console.log('[PlantLens фото] OpenRouter (Gemini): генерация фото', { query });
    const prompt = `Generate a single high-quality realistic botanical photograph of a plant: "${plantName}". Natural lighting, detailed leaves and stems, no people. The image must show the plant clearly, botanically recognizable. Output only one image, square aspect ratio 1:1.`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://plantlens.app',
        'X-Title': 'PlantLens',
    };
    let lastError = '';
    for (const model of IMAGE_GENERATION_MODELS) {
        try {
            const body = {
                model,
                messages: [{ role: 'user' as const, content: prompt }],
                modalities: ['image', 'text'] as const,
                image_config: { aspect_ratio: '1:1' as const },
                max_tokens: 1024,
            };
            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            const responseText = await response.text();
            if (!response.ok) {
                if (response.status === 402) lastError = 'Недостаточно кредитов OpenRouter.';
                else lastError = `HTTP ${response.status}`;
                continue;
            }
            let data: OpenRouterResponse;
            try {
                data = JSON.parse(responseText);
            } catch {
                continue;
            }
            if (data.error) {
                lastError = data.error.message || '';
                continue;
            }
            const message = data.choices?.[0]?.message;
            const url = extractImageUrlFromMessage(message);
            if (url) {
                console.log('[PlantLens фото] OpenRouter (Gemini): успех', { query, model });
                return url;
            }
        } catch (e) {
            lastError = e instanceof Error ? e.message : String(e);
        }
    }
    throw new Error(lastError || 'OpenRouter image generation failed');
};

/**
 * Генерация фото растения: сначала OpenRouter (Gemini), при отсутствии ключа или ошибке — Pollinations.
 * Использовать для fallback-картинок в Discover и Трендах.
 */
export const generatePlantImageUrlWithFallback = async (plantName: string): Promise<string> => {
    const query = plantName?.trim() || 'plant';
    try {
        return await generatePlantImageUrl(plantName?.trim() || 'plant');
    } catch (err) {
        console.log('[PlantLens фото] OpenRouter не удался, fallback Pollinations', { query, err: String(err) });
        return getPlantImageAIUrl(query);
    }
};

/**
 * Генерация изображения растения в выбранном стиле через OpenRouter (Gemini 2.5 Flash Image).
 * При отсутствии API ключа или ошибке возвращается подбор изображения по названию.
 */
export const generatePlantImage = async (plantName: string, stylePrompt: string): Promise<string> => {
    const apiKey = getApiKey();
    if (!apiKey) {
        return getReliableImage(plantName);
    }
    const prompt = `Generate a single high-quality image of a plant: "${plantName}". Style and mood: ${stylePrompt}. The image must show the plant clearly, botanically recognizable. Output only one image, square aspect ratio 1:1.`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://plantlens.app',
        'X-Title': 'PlantLens',
    };
    let lastError = '';
    for (const model of IMAGE_GENERATION_MODELS) {
        try {
            const body = {
                model,
                messages: [{ role: 'user' as const, content: prompt }],
                modalities: ['image', 'text'] as const,
                image_config: { aspect_ratio: '1:1' as const },
                max_tokens: 1024,
            };
            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            const responseText = await response.text();
            if (!response.ok) {
                const detail = responseText.length > 200 ? responseText.slice(0, 200) + '…' : responseText;
                if (response.status === 402) {
                    lastError = 'Недостаточно кредитов на OpenRouter. Пополните баланс на openrouter.ai/credits или уменьшите использование.';
                } else {
                    lastError = `Модель ${model}: HTTP ${response.status} — ${detail}`;
                }
                console.warn(`OpenRouter image (${model}) failed:`, response.status, responseText.slice(0, 300));
                continue;
            }
            let data: OpenRouterResponse;
            try {
                data = JSON.parse(responseText);
            } catch {
                lastError = `Модель ${model}: неверный JSON ответа`;
                console.warn('OpenRouter image: invalid JSON', responseText.slice(0, 200));
                continue;
            }
            if (data.error) {
                lastError = `Модель ${model}: ${data.error.message}`;
                console.warn('OpenRouter image error:', data.error.message);
                continue;
            }
            const message = data.choices?.[0]?.message;
            const url = extractImageUrlFromMessage(message);
            if (url) return url;
            if (message) {
                lastError = `Модель ${model}: в ответе нет изображения (ключи: ${Object.keys(message).join(', ')})`;
                console.warn('OpenRouter image: no image in response, keys:', Object.keys(message));
            }
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            lastError = `Модель ${model}: ${errMsg}`;
            console.warn(`generatePlantImage (${model}) error:`, e);
        }
    }
    const detail = lastError ? ` Причина: ${lastError}` : '';
    throw new Error('Не удалось сгенерировать изображение. Проверьте API ключ OpenRouter и доступность модели генерации изображений.' + detail);
};

export const processDocument = async (base64: string, mimeType: string, isPremium: boolean, responseLanguage: Language = 'en'): Promise<{ ocrText: string, aiInsights?: AIInsights, error?: string }> => {
    try {
        const dataUrl = `data:${mimeType};base64,${base64}`;
        const langName = RESPONSE_LANGUAGE_NAMES[responseLanguage];
        const prompt = isPremium
            ? `Perform OCR on this document. Provide: ocrText, and aiInsights with summary, actionItems array, keyEntities array. All aiInsights text must be in ${langName}. Return JSON.`
            : "Perform OCR on this document. Return JSON: { ocrText: \"extracted text\" }";

        const messages: OpenRouterMessage[] = [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: dataUrl } },
                { type: 'text', text: prompt }
            ]
        }];

        const text = await callOpenRouter(messages, true);
        return extractJSON(text);
    } catch (e) {
        console.error("Document processing failed", e);
        return { ocrText: "", error: "Failed to process document" };
    }
};

export const generateAiInsights = async (text: string, responseLanguage: Language = 'en'): Promise<AIInsights | { error: string }> => {
    try {
        const langName = RESPONSE_LANGUAGE_NAMES[responseLanguage];
        const prompt = `Analyze this botanical text. Provide summary, actionItems, keyEntities. All output text must be in ${langName}.
        Text: ${text}
        
        Return JSON: { "summary": "...", "actionItems": ["..."], "keyEntities": [{ "type": "...", "value": "..." }] }`;

        const messages: OpenRouterMessage[] = [{ role: 'user', content: prompt }];
        const responseText = await callOpenRouter(messages, true);
        return extractJSON(responseText) as AIInsights;
    } catch (e) {
        console.error("AI Insights failed", e);
        return { error: "Failed to generate insights" };
    }
};

const WEATHER_FALLBACK_INSIGHTS: Record<Language, Record<string, string>> = {
    en: {
        default: 'Conditions are favorable for plant growth.',
        wind: 'Strong wind may dry out the soil. Increase watering and protect plants from drafts.',
        humidityLow: 'Critically low humidity. Mist plants and use a humidifier.',
        humidityMed: 'Low humidity. Mist tropical plants.',
        tempHigh: 'High temperature. Shield plants from direct sun and increase watering.',
        tempLow: 'Low temperature. Reduce watering and avoid cold drafts.',
        precip: 'Rain increases humidity. Reduce watering and ventilate.',
    },
    ru: {
        default: 'Условия благоприятны для роста растений.',
        wind: 'Сильный ветер может пересушить почву. Увеличьте полив и защитите растения от сквозняков.',
        humidityLow: 'Критически низкая влажность. Опрыскивайте растения и используйте увлажнитель.',
        humidityMed: 'Низкая влажность. Рекомендуется опрыскивание тропических видов.',
        tempHigh: 'Высокая температура. Защитите растения от прямых солнечных лучей и увеличьте полив.',
        tempLow: 'Низкая температура. Сократите полив и избегайте холодных сквозняков.',
        precip: 'Осадки повышают влажность. Сократите полив и проветривайте помещение.',
    },
    de: {
        default: 'Die Bedingungen sind günstig für das Pflanzenwachstum.',
        wind: 'Starker Wind kann den Boden austrocknen. Gießen Sie mehr und schützen Sie Pflanzen vor Zugluft.',
        humidityLow: 'Sehr niedrige Luftfeuchtigkeit. Besprühen Sie die Pflanzen und nutzen Sie einen Luftbefeuchter.',
        humidityMed: 'Niedrige Luftfeuchtigkeit. Besprühen Sie tropische Pflanzen.',
        tempHigh: 'Hohe Temperatur. Schützen Sie Pflanzen vor direkter Sonne und gießen Sie mehr.',
        tempLow: 'Niedrige Temperatur. Gießen Sie weniger und vermeiden Sie kalte Zugluft.',
        precip: 'Niederschlag erhöht die Luftfeuchtigkeit. Gießen Sie weniger und lüften Sie.',
    },
    fr: {
        default: 'Les conditions sont favorables à la croissance des plantes.',
        wind: 'Un vent fort peut assécher le sol. Arrosez davantage et protégez les plantes des courants d\'air.',
        humidityLow: 'Humidité très basse. Vaporisez les plantes et utilisez un humidificateur.',
        humidityMed: 'Humidité basse. Vaporisez les plantes tropicales.',
        tempHigh: 'Température élevée. Protégez les plantes du soleil direct et arrosez davantage.',
        tempLow: 'Température basse. Réduisez l\'arrosage et évitez les courants d\'air froids.',
        precip: 'Les précipitations augmentent l\'humidité. Réduisez l\'arrosage et aérez.',
    },
    es: {
        default: 'Las condiciones son favorables para el crecimiento de las plantas.',
        wind: 'El viento fuerte puede secar la tierra. Riega más y protege las plantas de las corrientes.',
        humidityLow: 'Humedad muy baja. Rocía las plantas y usa un humidificador.',
        humidityMed: 'Humedad baja. Se recomienda rociar las plantas tropicales.',
        tempHigh: 'Temperatura alta. Protege las plantas del sol directo y riega más.',
        tempLow: 'Temperatura baja. Reduce el riego y evita las corrientes frías.',
        precip: 'Las precipitaciones aumentan la humedad. Riega menos y ventila.',
    },
};

export const generateWeatherInsight = async (weather: { temperature: number; humidity: number; precipitation: number; windSpeed: number }, responseLanguage: Language = 'en'): Promise<string> => {
    try {
        const langName = RESPONSE_LANGUAGE_NAMES[responseLanguage];
        const fallbacks = WEATHER_FALLBACK_INSIGHTS[responseLanguage];
        const prompt = `You are an expert in houseplant and garden care. Analyze the current weather and give a short, informative care recommendation.

Weather:
- Temperature: ${weather.temperature}°C
- Humidity: ${weather.humidity}%
- Precipitation: ${weather.precipitation > 0 ? `${weather.precipitation} mm` : 'none'}
- Wind speed: ${weather.windSpeed} m/s

Requirements:
1. Response MUST be in ${langName} only.
2. Length: 1-3 short sentences (about 200-350 characters). Do not exceed 400 characters.
3. Be specific: mention concrete actions (watering, misting, ventilation, sun protection, etc.).
4. Consider all parameters (temperature, humidity, precipitation, wind).
5. Give practical advice applicable right now.
6. If conditions are ideal, say so briefly.
7. Strong wind (over 10 m/s) can damage plants – take this into account.

Return only the recommendation text, no quotes, no prefix like "Recommendation:", no extra explanation.`;

        const messages: OpenRouterMessage[] = [{ role: 'user', content: prompt }];
        const responseText = await callOpenRouter(messages, false, { max_tokens: 512 });
        
        let insight = (responseText || '').trim();
        insight = insight.replace(/^["']|["']$/g, '');
        insight = insight.replace(/^(Recommendation|Рекомендация|Empfehlung|Recommandation|Recomendación):?\s*/i, '');
        insight = insight.trim();
        
        const maxLen = 400;
        if (insight.length > maxLen) {
            const cut = insight.substring(0, maxLen - 3).trim();
            const lastSpace = cut.lastIndexOf(' ');
            insight = (lastSpace > maxLen * 0.6 ? cut.substring(0, lastSpace) : cut) + '...';
        }
        
        return insight || fallbacks.default;
    } catch (e: any) {
        const msg = e?.message ?? String(e);
        const isCreditsOrAuth = /402|кредит|credits|401|No cookie auth/i.test(msg);
        if (isCreditsOrAuth) {
            console.warn("Weather insight: using fallback (API limits).");
        } else {
            console.error("Weather insight generation failed", e);
        }
        const fallbacks = WEATHER_FALLBACK_INSIGHTS[responseLanguage];
        if (weather.windSpeed > 10) {
            return fallbacks.wind;
        } else if (weather.humidity < 30) {
            return fallbacks.humidityLow;
        } else if (weather.humidity < 40) {
            return fallbacks.humidityMed;
        } else if (weather.temperature > 28) {
            return fallbacks.tempHigh;
        } else if (weather.temperature < 15) {
            return fallbacks.tempLow;
        } else if (weather.precipitation > 0) {
            return fallbacks.precip || fallbacks.default;
        } else {
            return fallbacks.default;
        }
    }
};

// --- CATALOG FUNCTIONS (no AI needed) ---

const BATCH_SIZE = 5;

function shuffle<T>(arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/** Ключ растения для дедупликации (тот же формат, что в UI: commonName|scientificName). */
const plantKey = (p: CatalogPlant): string => `${(p.commonName || '').trim()}|${(p.scientificName || '').trim()}`;

export const getCategoryMorePlants = async (
    category: string,
    excludeNames: string[],
    lat?: number,
    lon?: number,
    language: Language = 'en',
    excludeKeys?: string[]
): Promise<CatalogPlant[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    if (category === REGIONAL_FLORA_CATEGORY_KEY && lat != null && lon != null) {
        await fetchRegionalPlantsNextPage(lat, lon, language);
    }
    const poolByCategory = await getDiscoverPool(lat, lon, language);
    const pool = poolByCategory[category] || [];
    const excludeSet = new Set(excludeNames.map((e) => e.toLowerCase().trim()));
    const excludeKeySet = new Set((excludeKeys || []).map((k) => k.trim()));
    let candidates = pool.filter((p) => {
        if (excludeSet.has((p.commonName || '').toLowerCase().trim())) return false;
        if (excludeKeySet.size > 0 && excludeKeySet.has(plantKey(p))) return false;
        return true;
    });
    if (candidates.length === 0) {
        candidates = shuffle(pool);
    }
    return candidates.slice(0, BATCH_SIZE);
};

const INITIAL_PLANTS_PER_CATEGORY = 5;

/** Ключи категорий: первая — флора региона (API), остальные — статичные. */
const CATEGORY_KEYS = [REGIONAL_FLORA_CATEGORY_KEY, 'Ядовитые', 'Домашние', 'Цветы', 'Аллергены', 'Деревья', 'Сорняки'] as const;

const CATEGORY_META: Record<Language, { locationName: string; descriptions: string[] }> = {
    en: { locationName: 'Regional flora', descriptions: ['Species observed in your area', 'Dangerous species', 'Houseplants', 'Garden flowers', 'Allergenic plants', 'Tree species', 'Weeds'] },
    ru: { locationName: 'Флора региона', descriptions: ['Виды, отмеченные в вашем регионе', 'Опасные виды', 'Комнатные растения', 'Садовые цветы', 'Растения-аллергены', 'Лесные породы', 'Сорные травы'] },
    de: { locationName: 'Flora der Region', descriptions: ['In Ihrer Region beobachtete Arten', 'Giftige Arten', 'Zimmerpflanzen', 'Gartenblumen', 'Allergieauslösende Pflanzen', 'Baumarten', 'Unkräuter'] },
    fr: { locationName: 'Flore régionale', descriptions: ['Espèces observées dans votre région', 'Espèces dangereuses', 'Plantes d\'intérieur', 'Fleurs de jardin', 'Plantes allergènes', 'Essences forestières', 'Mauvaises herbes'] },
    es: { locationName: 'Flora regional', descriptions: ['Especies observadas en tu zona', 'Especies peligrosas', 'Plantas de interior', 'Flores de jardín', 'Plantas alergénicas', 'Especies arbóreas', 'Malas hierbas'] },
};

export const getRegionalCatalog = async (lat: number, lon: number, language: Language = 'en'): Promise<{ locationName: string, categories: CatalogCategory[] }> => {
    const meta = CATEGORY_META[language] ?? CATEGORY_META.en;
    const poolByCategory = await getDiscoverPool(lat, lon, language);
    const categories: CatalogCategory[] = CATEGORY_KEYS.map((title, i) => ({
        title,
        description: meta.descriptions[i] ?? '',
        plants: (poolByCategory[title] || []).slice(0, INITIAL_PLANTS_PER_CATEGORY),
    }));
    return {
        locationName: meta.locationName,
        categories,
    };
};

const TRENDING_PLANTS_BY_LANG: Record<Language, Omit<CatalogPlant, 'imageUrl'>[]> = {
    en: [
        { commonName: "Bird of Paradise", scientificName: "Strelitzia nicolai", description: "Tropical showstopper." },
        { commonName: "Calathea", scientificName: "Calathea orbifolia", description: "Prayer plant." },
        { commonName: "Alocasia", scientificName: "Alocasia polly", description: "African mask." },
        { commonName: "Philodendron", scientificName: "Philodendron birkin", description: "Striped beauty." },
        { commonName: "Pilea", scientificName: "Pilea peperomioides", description: "Chinese money plant." },
    ],
    ru: [
        { commonName: "Стрелиция", scientificName: "Strelitzia nicolai", description: "Райская птица." },
        { commonName: "Калатея", scientificName: "Calathea orbifolia", description: "Молитвенный цветок." },
        { commonName: "Алоказия", scientificName: "Alocasia polly", description: "Африканская маска." },
        { commonName: "Филодендрон", scientificName: "Philodendron birkin", description: "Полосатый красавец." },
        { commonName: "Пилея", scientificName: "Pilea peperomioides", description: "Китайское денежное дерево." },
    ],
    de: [
        { commonName: "Paradiesvogel", scientificName: "Strelitzia nicolai", description: "Tropische Pracht." },
        { commonName: "Korbmarante", scientificName: "Calathea orbifolia", description: "Gebetsblatt." },
        { commonName: "Alokasie", scientificName: "Alocasia polly", description: "Afrikanische Maske." },
        { commonName: "Philodendron", scientificName: "Philodendron birkin", description: "Gestreifter Blickfang." },
        { commonName: "Ufopflanze", scientificName: "Pilea peperomioides", description: "Chinesischer Geldbaum." },
    ],
    fr: [
        { commonName: "Oiseau de paradis", scientificName: "Strelitzia nicolai", description: "Plante tropicale spectaculaire." },
        { commonName: "Calathea", scientificName: "Calathea orbifolia", description: "Plante qui prie." },
        { commonName: "Alocasia", scientificName: "Alocasia polly", description: "Masque africain." },
        { commonName: "Philodendron", scientificName: "Philodendron birkin", description: "Beauté rayée." },
        { commonName: "Pilea", scientificName: "Pilea peperomioides", description: "Arbre à monnaie chinois." },
    ],
    es: [
        { commonName: "Ave del paraíso", scientificName: "Strelitzia nicolai", description: "Planta tropical llamativa." },
        { commonName: "Calatea", scientificName: "Calathea orbifolia", description: "Planta de la oración." },
        { commonName: "Alocasia", scientificName: "Alocasia polly", description: "Máscara africana." },
        { commonName: "Filodendro", scientificName: "Philodendron birkin", description: "Belleza rayada." },
        { commonName: "Pilea", scientificName: "Pilea peperomioides", description: "Planta del dinero china." },
    ],
};

/** Тренды обновляются раз в 24 ч; фото резолвится в UI через getPlantImageUrl. Язык определяет названия и описания. */
export const getTrendingPlants = async (offset: number = 0, language: Language = 'en'): Promise<CatalogPlant[]> => {
    const cached = await getCachedTrendsIfFresh(language);
    if (cached && cached.length > 0) return cached;
    const base = TRENDING_PLANTS_BY_LANG[language] ?? TRENDING_PLANTS_BY_LANG.en;
    const plants: CatalogPlant[] = base.map((p) => ({
        ...p,
        imageUrl: '',
    }));
    await setCachedTrends(plants, language);
    return plants;
};
