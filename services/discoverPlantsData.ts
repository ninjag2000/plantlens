/**
 * Пул растений для Discover по категориям (по 100 на категорию).
 * Порядок выдачи зависит от геолокации (lat/lon) для привязки к региону.
 * Категория «Флора региона» заполняется по API iNaturalist (наблюдения в радиусе от пользователя).
 * Данные по региону сохраняются в постоянный кэш по ключу (город: lat,lon,locale). При повторном
 * открытии того же города — загрузка из кэша; при выборе нового города — загрузка по API и сохранение.
 * «Показать ещё» для региона подгружает следующую страницу по API.
 */

import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CatalogPlant } from '../types';
import type { Language } from './translations';
import { enrichPlantsFromWikipedia } from './wikipediaPlantService';

const REGIONAL_FLORA_STORAGE_KEY = 'plantlens_regional_flora_cache';

/** Ключ категории с растениями из API по региону. */
export const REGIONAL_FLORA_CATEGORY_KEY = 'Флора региона';

const INATURALIST_API = 'https://api.inaturalist.org/v1';
const REGIONAL_RADIUS_KM = 50;
const REGIONAL_PAGE_SIZE = 200;
const USER_AGENT = 'PlantLens/1.0 (https://plantlens.app)';

const REGIONAL_DESC_BY_LOCALE: Record<string, string> = {
    en: 'Species observed in your area.',
    ru: 'Наблюдаемый в регионе вид.',
    de: 'In Ihrer Region beobachtete Art.',
    fr: 'Espèce observée dans votre région.',
    es: 'Especie observada en tu zona.',
};

/** iNaturalist Plant Phenology: attribute 12 = "Flowers and Fruits", values 13=Flowers, 14=Fruits, 15=Flower Buds, 21=No flowers. */
const PHENOLOGY_ATTR_ID = 12;
const PHENOLOGY_FLOWERS = 13;
const PHENOLOGY_FRUITS = 14;
const PHENOLOGY_BUDS = 15;

/** Сезон по месяцу (1–12) для подписи времени цветения. */
const SEASON_BY_MONTH: Record<string, Record<number, string>> = {
    en: { 1: 'Winter', 2: 'Winter', 3: 'Spring', 4: 'Spring', 5: 'Spring', 6: 'Summer', 7: 'Summer', 8: 'Summer', 9: 'Autumn', 10: 'Autumn', 11: 'Autumn', 12: 'Winter' },
    ru: { 1: 'Зима', 2: 'Зима', 3: 'Весна', 4: 'Весна', 5: 'Весна', 6: 'Лето', 7: 'Лето', 8: 'Лето', 9: 'Осень', 10: 'Осень', 11: 'Осень', 12: 'Зима' },
    de: { 1: 'Winter', 2: 'Winter', 3: 'Frühling', 4: 'Frühling', 5: 'Frühling', 6: 'Sommer', 7: 'Sommer', 8: 'Sommer', 9: 'Herbst', 10: 'Herbst', 11: 'Herbst', 12: 'Winter' },
    fr: { 1: 'Hiver', 2: 'Hiver', 3: 'Printemps', 4: 'Printemps', 5: 'Printemps', 6: 'Été', 7: 'Été', 8: 'Été', 9: 'Automne', 10: 'Automne', 11: 'Automne', 12: 'Hiver' },
    es: { 1: 'Invierno', 2: 'Invierno', 3: 'Primavera', 4: 'Primavera', 5: 'Primavera', 6: 'Verano', 7: 'Verano', 8: 'Verano', 9: 'Otoño', 10: 'Otoño', 11: 'Otoño', 12: 'Invierno' },
};

/** Время цветения: из аннотации «Flowers/Fruits» (сезон) или запас — сезон по дате наблюдения (у многих наблюдений аннотаций нет). */
function getFloweringTimeFromObservation(annotations: Array<{ controlled_attribute_id?: number; controlled_value_id?: number }> | undefined, observedOnDetails: { month?: number } | undefined, locale: string): string {
    const loc = locale === 'ru' ? 'ru' : locale === 'de' ? 'de' : locale === 'fr' ? 'fr' : locale === 'es' ? 'es' : 'en';
    const seasons = SEASON_BY_MONTH[loc] ?? SEASON_BY_MONTH.en;
    const month = observedOnDetails?.month;
    const season = month != null && month >= 1 && month <= 12 ? seasons[month] : null;
    const ann = (annotations || []).find((a) => a.controlled_attribute_id === PHENOLOGY_ATTR_ID);
    const valueId = ann?.controlled_value_id;
    if (valueId === PHENOLOGY_FLOWERS || valueId === PHENOLOGY_BUDS) {
        return season || '—';
    }
    if (valueId === PHENOLOGY_FRUITS && season) {
        return season;
    }
    return season || '—';
}

function getFlowerColorFromObservation(ofvs: Array<{ name?: string; value?: string; observation_field?: { name?: string } }> | undefined): string {
    const list = ofvs || [];
    for (const ofv of list) {
        const name = (ofv.observation_field?.name ?? ofv.name ?? '').toLowerCase();
        const value = (ofv.value ?? '').trim();
        if (value && (name.includes('color') || name.includes('colour') || name.includes('flower'))) {
            return value;
        }
    }
    return '—';
}

/** Кэш региональной флоры в памяти (последняя загруженная страница по ключу города). */
let regionalCache: { key: string; plants: CatalogPlant[]; page: number } | null = null;

function buildCacheKey(lat: number, lon: number, locale: string): string {
    return `${lat.toFixed(4)},${lon.toFixed(4)},${locale}`;
}

type RegionalFloraStored = { key: string; plants: CatalogPlant[]; page: number };

async function loadRegionalFloraFromStorage(cacheKey: string): Promise<{ plants: CatalogPlant[]; page: number } | null> {
    try {
        const raw = await AsyncStorage.getItem(REGIONAL_FLORA_STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw) as RegionalFloraStored;
        if (data?.key !== cacheKey || !Array.isArray(data.plants) || data.plants.length === 0) return null;
        return { plants: data.plants, page: typeof data.page === 'number' ? data.page : 1 };
    } catch {
        return null;
    }
}

async function saveRegionalFloraToStorage(key: string, plants: CatalogPlant[], page: number): Promise<void> {
    try {
        await AsyncStorage.setItem(REGIONAL_FLORA_STORAGE_KEY, JSON.stringify({ key, plants, page }));
    } catch (e) {
        console.warn('[Discover] Failed to persist regional flora cache', e);
    }
}

/** Ключ для дедупликации и FlatList — совпадает с getPlantKey в plantImageService. */
function plantKey(p: CatalogPlant): string {
    return `${(p.commonName || '').trim()}|${(p.scientificName || '').trim()}`;
}

function dedupeByPlantKeyApi(plants: CatalogPlant[]): CatalogPlant[] {
    const seen = new Set<string>();
    return plants.filter((p) => {
        const k = plantKey(p);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

/** Запрос одной страницы наблюдений iNaturalist. */
async function fetchRegionalPlantsPage(lat: number, lon: number, locale: string, page: number): Promise<CatalogPlant[]> {
    const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lon),
        radius: String(REGIONAL_RADIUS_KM),
        per_page: String(REGIONAL_PAGE_SIZE),
        page: String(page),
        order: 'desc',
        order_by: 'created_at',
        locale: locale === 'ru' ? 'ru' : locale === 'de' ? 'de' : locale === 'fr' ? 'fr' : locale === 'es' ? 'es' : 'en',
    });
    params.append('iconic_taxa[]', 'Plantae');
    params.append('extra', 'fields');
    params.append('extra', 'observation_field_values');
    const url = `${INATURALIST_API}/observations?${params.toString()}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    type ObsAnnotation = { controlled_attribute_id?: number; controlled_value_id?: number };
    type ObsOfv = { name?: string; value?: string; observation_field?: { name?: string } };
    type Obs = {
        taxon?: { id: number; name: string; rank?: string; preferred_common_name?: string; default_photo?: { medium_url?: string; small_url?: string; url?: string } };
        annotations?: ObsAnnotation[];
        observed_on_details?: { month?: number };
        ofvs?: ObsOfv[];
        observation_field_values?: ObsOfv[];
    };
    const observations: Obs[] = data?.results ?? [];
    const byTaxonId = new Map<number, CatalogPlant>();
    for (const obs of observations) {
        const taxon = obs.taxon;
        if (!taxon?.name || byTaxonId.has(taxon.id)) continue;
        const rank = (taxon.rank || '').toLowerCase();
        if (rank && rank !== 'species' && rank !== 'genus' && rank !== 'subspecies' && rank !== 'variety') continue;
        const commonName = taxon.preferred_common_name?.trim() || taxon.name;
        const photo = taxon.default_photo;
        const imageUrl = photo?.medium_url || photo?.small_url || photo?.url || '';
        const descKey = locale === 'ru' ? 'ru' : locale === 'de' ? 'de' : locale === 'fr' ? 'fr' : locale === 'es' ? 'es' : 'en';
        const shortDesc = rank === 'species' || rank === 'genus' ? `${commonName} — ${REGIONAL_DESC_BY_LOCALE[descKey]}` : `${commonName}.`;
        const floweringTime = getFloweringTimeFromObservation(obs.annotations, obs.observed_on_details, locale);
        const ofvs = obs.ofvs ?? obs.observation_field_values;
        const flowerColor = getFlowerColorFromObservation(ofvs);
        byTaxonId.set(taxon.id, {
            commonName,
            scientificName: taxon.name,
            description: shortDesc,
            imageUrl: imageUrl || undefined,
            floweringTime: floweringTime || '—',
            flowerColor: flowerColor || '—',
        });
    }
    return dedupeByPlantKeyApi(Array.from(byTaxonId.values()));
}

/**
 * Загружает растения региона. Для выбранного города (lat, lon, locale):
 * — если данные уже есть в кэше (память или постоянное хранилище) для этого города — возвращаем из кэша;
 * — если выбран другой город или кэша нет — загружаем по API и сохраняем в кэш.
 */
export async function fetchRegionalPlantsFromiNaturalist(lat: number, lon: number, locale: string = 'en'): Promise<CatalogPlant[]> {
    const cacheKey = buildCacheKey(lat, lon, locale);
    const netState = await NetInfo.fetch();
    const isOffline = !netState.isConnected;

    if (regionalCache && regionalCache.key === cacheKey && regionalCache.plants.length > 0) {
        return regionalCache.plants;
    }

    const fromStorage = await loadRegionalFloraFromStorage(cacheKey);
    if (fromStorage && fromStorage.plants.length > 0) {
        regionalCache = { key: cacheKey, plants: fromStorage.plants, page: fromStorage.page };
        return fromStorage.plants;
    }

    if (isOffline) return [];

    try {
        const plants = await fetchRegionalPlantsPage(lat, lon, locale, 1);
        if (plants.length > 0) {
            regionalCache = { key: cacheKey, plants, page: 1 };
            await saveRegionalFloraToStorage(cacheKey, plants, 1);
        }
        return plants;
    } catch (e) {
        console.warn('[Discover] iNaturalist regional fetch failed', e);
        return [];
    }
}

/**
 * Подгружает следующую страницу региональной флоры по API и дополняет кэш.
 * Вызывать при «Показать ещё» для категории «Флора региона» при наличии интернета.
 * При офлайне ничего не запрашивает (данные для «ещё» возьмутся из уже закэшированного пула в getDiscoverPool).
 */
export async function fetchRegionalPlantsNextPage(lat: number, lon: number, locale: string = 'en'): Promise<CatalogPlant[]> {
    const cacheKey = buildCacheKey(lat, lon, locale);
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
        return regionalCache?.key === cacheKey ? regionalCache.plants : [];
    }

    if (!regionalCache || regionalCache.key !== cacheKey) {
        await fetchRegionalPlantsFromiNaturalist(lat, lon, locale);
        return regionalCache?.key === cacheKey ? regionalCache.plants : [];
    }

    const nextPage = regionalCache.page + 1;
    try {
        const nextPlants = await fetchRegionalPlantsPage(lat, lon, locale, nextPage);
        if (nextPlants.length > 0) {
            const byPlantKey = new Map<string, CatalogPlant>();
            for (const p of regionalCache.plants) {
                byPlantKey.set(plantKey(p), p);
            }
            for (const p of nextPlants) {
                const k = plantKey(p);
                if (!byPlantKey.has(k)) byPlantKey.set(k, p);
            }
            const merged = Array.from(byPlantKey.values());
            regionalCache = { key: cacheKey, plants: merged, page: nextPage };
            await saveRegionalFloraToStorage(cacheKey, merged, nextPage);
        }
        return regionalCache.plants;
    } catch (e) {
        console.warn('[Discover] iNaturalist next page fetch failed', e);
        return regionalCache.plants;
    }
}

/** Сбросить кэш региональной флоры (память и постоянное хранилище). */
export async function clearRegionalFloraCache(): Promise<void> {
    regionalCache = null;
    try {
        await AsyncStorage.removeItem(REGIONAL_FLORA_STORAGE_KEY);
    } catch {}
}

type PlantTuple = [string, string, string, string, string];

function toPlant([commonName, scientificName, description, floweringTime, flowerColor]: PlantTuple): CatalogPlant {
    return {
        commonName,
        scientificName,
        description,
        floweringTime,
        flowerColor,
        imageUrl: '',
    };
}

function buildCategory(tuples: PlantTuple[]): CatalogPlant[] {
    return tuples.map(toPlant);
}

// Ядовитые — 100 видов
const POISONOUS_TUPLES: PlantTuple[] = [
    ["Датура", "Datura stramonium", "Крупные белые или лиловые цветы в форме граммофона; все части ядовиты — алкалоиды вызывают галлюцинации и тяжёлое отравление.", "Лето", "White"],
    ["Борщевик", "Heracleum sosnowskyi", "Крупный зонтичный многолетник с полым стеблем; сок и пыльца содержат фурокумарины — под солнцем вызывают сильные ожоги кожи.", "Лето", "White"],
    ["Безвременник", "Colchicum autumnale", "Невысокое растение с лиловыми цветами, похожими на крокус; цветёт осенью. Все части токсичны из-за колхицина.", "Осень", "Purple"],
    ["Олеандр", "Nerium oleander", "Вечнозелёный кустарник с душистыми розовыми или белыми цветами; все части токсичны — опасен для людей и животных при поедании.", "Лето", "Pink"],
    ["Диффенбахия", "Dieffenbachia", "Популярное комнатное растение с крупными пёстрыми листьями; сок вызывает ожоги слизистой рта и кожи, возможен отёк.", "Весна", "White"],
    ["Наперстянка", "Digitalis purpurea", "Высокие кисти колокольчатых цветов; содержит сердечные гликозиды — опасна при употреблении, в малых дозах используется в медицине.", "Лето", "Purple"],
    ["Клещевина", "Ricinus communis", "Крупные пальчатые листья и колючие коробочки с семенами; семена содержат рицин — сильнейший яд даже в малых количествах.", "Лето", "Red"],
    ["Ландыш", "Convallaria majalis", "Душистые белые колокольчики и красные ягоды; все части содержат сердечные гликозиды — ягоды особенно опасны для детей.", "Май", "White"],
    ["Волчья ягода", "Daphne mezereum", "Невысокий кустарник, цветёт до распускания листьев; кора, листья и ярко-красные ягоды ядовиты — вызывают отравление.", "Весна", "Pink"],
    ["Белена", "Hyoscyamus niger", "Сероватые листья и грязно-жёлтые цветы с фиолетовыми жилками; все части содержат алкалоиды — сильное отравление, галлюцинации.", "Лето", "Yellow"],
    ["Белладонна", "Atropa belladonna", "Крупные тёмно-фиолетовые цветы и чёрные блестящие ягоды; атропин и другие алкалоиды — тяжёлое отравление, возможен летальный исход.", "Лето", "Purple"],
    ["Ясенец", "Dictamnus albus", "Высокое растение с розовато-белыми цветами; эфирные масла и фурокумарины вызывают ожоги кожи при контакте в солнечный день.", "Июнь", "White"],
    ["Аконит", "Aconitum napellus", "Тёмно-синие шлемовидные цветы на высоком стебле; один из самых ядовитых видов — аконитин поражает нервную систему и сердце.", "Лето", "Blue"],
    ["Лютик едкий", "Ranunculus acris", "Ярко-жёлтые блестящие цветы на лугах и полях; сок содержит протоанемонин — раздражает кожу и слизистые.", "Май", "Yellow"],
    ["Молочай", "Euphorbia", "Млечный сок выделяется при надломе; вызывает ожоги кожи и слизистых, при попадании в глаза — опасное воспаление.", "Весна", "Green"],
    ["Вороний глаз", "Paris quadrifolia", "Один тёмный плод на верхушке стебля, четыре листа в мутовке; ягоды и корневище ядовиты — сапонины и алкалоиды.", "Май", "Green"],
    ["Болиголов", "Conium maculatum", "Высокий зонтичный с красноватыми пятнами на стебле; кониин и другие алкалоиды — паралич, в древности использовался для казней.", "Лето", "White"],
    ["Чистотел", "Chelidonium majus", "Жёлтый сок при надломе, жёлтые цветы; алкалоиды в больших дозах ядовиты, в малых — применяются в народной медицине.", "Май", "Yellow"],
    ["Бузина красная", "Sambucus racemosa", "Кустарник с красными гроздьями ягод; незрелые ягоды и семена ядовиты — вызывают тошноту и рвоту.", "Май", "White"],
    ["Паслён сладко-горький", "Solanum dulcamara", "Лиана с фиолетовыми цветами и красными ягодами; соланин и другие гликозиды — отравление при поедании ягод.", "Лето", "Purple"],
    ["Вех ядовитый", "Cicuta virosa", "Зонтичное растение по берегам водоёмов; корневище содержит цикутоксин — один из сильнейших растительных ядов.", "Лето", "White"],
    ["Купена", "Polygonatum", "Тенелюбивое растение с белыми колокольчиками и синими ягодами; сапонины в ягодах и корневище вызывают отравление.", "Май", "White"],
    ["Воронец", "Actaea spicata", "Кисти белых цветов и чёрные блестящие ягоды; ягоды и сок ядовиты — раздражают кожу и вызывают отравление.", "Июнь", "White"],
    ["Жимолость лесная", "Lonicera xylosteum", "Кустарник с парными красными ягодами; ягоды горькие и ядовиты — вызывают тошноту и расстройство желудка.", "Май", "Yellow"],
    ["Крушина", "Frangula alnus", "Кустарник с мелкими цветами и чёрными ягодами; кора и ягоды слаботоксичны — антрагликозиды в больших дозах опасны.", "Май", "Green"],
    ["Морозник", "Helleborus", "Раннецветущее растение с крупными цветами; все части содержат гликозиды — ядовиты при употреблении.", "Весна", "Green"],
    ["Дурман", "Datura", "Крупные воронковидные цветы и колючие коробочки; алкалоиды вызывают галлюцинации и отравление — сильно ядовит.", "Лето", "White"],
    ["Борец", "Aconitum", "Высокое растение с синими или фиолетовыми шлемовидными цветами; аконитин и другие алкалоиды — один из самых ядовитых видов.", "Лето", "Blue"],
    ["Чемерица", "Veratrum", "Крупные листья и метёлки белых или зеленоватых цветов; корневище и листья содержат алкалоиды — тяжёлое отравление.", "Лето", "Green"],
    ["Омег", "Conium", "Зонтичное растение с пятнистым стеблем; кониин и другие алкалоиды — паралич и отравление, похож на съедобный укроп.", "Лето", "White"],
    ["Красавка", "Atropa belladonna", "Ядовитое растение.", "Лето", "Purple"],
    ["Белладонна обыкновенная", "Atropa belladonna", "Содержит алкалоиды.", "Лето", "Purple"],
    ["Паслён чёрный", "Solanum nigrum", "Незрелые ягоды ядовиты.", "Лето", "White"],
    ["Белокрыльник", "Calla palustris", "Ядовитое болотное растение.", "Май", "White"],
    ["Багульник", "Rhododendron tomentosum", "Эфирные масла ядовиты.", "Май", "White"],
    ["Рододендрон", "Rhododendron", "Листья и нектар ядовиты.", "Май", "Pink"],
    ["Гортензия", "Hydrangea", "Содержит цианогликозиды.", "Лето", "Blue"],
    ["Тис", "Taxus baccata", "Хвоя и семена ядовиты.", "Весна", "Green"],
    ["Туя", "Thuja", "Масла раздражают кожу.", "Весна", "Green"],
    ["Самшит", "Buxus sempervirens", "Все части ядовиты.", "Весна", "Green"],
    ["Олеандр обыкновенный", "Nerium oleander", "Сильно ядовит.", "Лето", "Pink"],
    ["Клещевина обыкновенная", "Ricinus communis", "Рицин в семенах.", "Лето", "Red"],
    ["Наперстянка пурпурная", "Digitalis purpurea", "Сердечные гликозиды.", "Лето", "Purple"],
    ["Ландыш майский", "Convallaria majalis", "Сердечные гликозиды.", "Май", "White"],
    ["Аронник", "Arum", "Ядовитое растение.", "Весна", "Purple"],
    ["Вьюнок полевой", "Convolvulus arvensis", "Слаботоксичен.", "Лето", "White"],
    ["Дурман обыкновенный", "Datura stramonium", "Алкалоиды.", "Лето", "White"],
    ["Белена чёрная", "Hyoscyamus niger", "Сильно ядовита.", "Лето", "Yellow"],
    ["Красавка белладонна", "Atropa belladonna", "Атропин.", "Лето", "Purple"],
    ["Паслён чёрный", "Solanum nigrum", "Токсичные ягоды.", "Лето", "White"],
    ["Волчеягодник", "Daphne", "Ягоды и кора ядовиты.", "Весна", "Pink"],
    ["Безвременник осенний", "Colchicum autumnale", "Колхицин.", "Осень", "Purple"],
    ["Борщевик Сосновского", "Heracleum sosnowskyi", "Фурокумарины.", "Лето", "White"],
    ["Ясенец белый", "Dictamnus albus", "Фототоксичен.", "Июнь", "White"],
    ["Аконит клобучковый", "Aconitum napellus", "Аконитин.", "Лето", "Blue"],
    ["Лютик ядовитый", "Ranunculus sceleratus", "Протоанемонин.", "Лето", "Yellow"],
    ["Молочай садовый", "Euphorbia", "Эуфорбин.", "Весна", "Green"],
    ["Вороний глаз четырёхлистный", "Paris quadrifolia", "Сапонины.", "Май", "Green"],
    ["Болиголов пятнистый", "Conium maculatum", "Кониин.", "Лето", "White"],
    ["Чистотел большой", "Chelidonium majus", "Алкалоиды.", "Май", "Yellow"],
    ["Бузина травянистая", "Sambucus ebulus", "Ядовита.", "Лето", "White"],
    ["Паслён чёрный", "Solanum nigrum", "Соланин.", "Лето", "White"],
    ["Вех ядовитый", "Cicuta virosa", "Цикутоксин.", "Лето", "White"],
    ["Купена душистая", "Polygonatum odoratum", "Сапонины.", "Май", "White"],
    ["Воронец колосистый", "Actaea spicata", "Ядовитые ягоды.", "Июнь", "White"],
    ["Жимолость обыкновенная", "Lonicera xylosteum", "Ксилостеин.", "Май", "Yellow"],
    ["Крушина ломкая", "Frangula alnus", "Антрагликозиды.", "Май", "Green"],
    ["Морозник кавказский", "Helleborus caucasicus", "Гликозиды.", "Весна", "Green"],
    ["Дурман индийский", "Datura metel", "Скополамин.", "Лето", "White"],
    ["Борец северный", "Aconitum septentrionale", "Ядовит.", "Лето", "Blue"],
    ["Чемерица Лобеля", "Veratrum lobelianum", "Алкалоиды.", "Лето", "Green"],
    ["Болиголов крапчатый", "Conium maculatum", "Кониин.", "Лето", "White"],
    ["Красавка обыкновенная", "Atropa belladonna", "Атропин.", "Лето", "Purple"],
    ["Паслён сладко-горький", "Solanum dulcamara", "Соланин.", "Лето", "Purple"],
    ["Белокрыльник болотный", "Calla palustris", "Сапонины.", "Май", "White"],
    ["Багульник болотный", "Ledum palustre", "Эфирные масла.", "Май", "White"],
    ["Рододендрон жёлтый", "Rhododendron luteum", "Андромедотоксин.", "Май", "Yellow"],
    ["Гортензия метельчатая", "Hydrangea paniculata", "Цианогликозиды.", "Лето", "White"],
    ["Тис ягодный", "Taxus baccata", "Таксин.", "Весна", "Green"],
    ["Туя западная", "Thuja occidentalis", "Туйон.", "Весна", "Green"],
    ["Самшит вечнозелёный", "Buxus sempervirens", "Буксин.", "Весна", "Green"],
    ["Омела", "Viscum album", "Ягоды ядовиты.", "Весна", "White"],
    ["Очный цвет", "Anagallis arvensis", "Сапонины.", "Лето", "Red"],
    ["Переступень", "Bryonia alba", "Корни ядовиты.", "Лето", "White"],
    ["Плющ", "Hedera helix", "Сапонины в ягодах.", "Осень", "Green"],
    ["Подофилл", "Podophyllum peltatum", "Подофиллотоксин.", "Весна", "White"],
    ["Прострел", "Pulsatilla", "Протоанемонин.", "Весна", "Purple"],
    ["Ревень", "Rheum", "Щавелевая кислота в листьях.", "Лето", "Green"],
    ["Снежноягодник", "Symphoricarpos", "Ягоды вызывают тошноту.", "Лето", "Pink"],
    ["Тисс", "Taxus", "Таксин.", "Весна", "Green"],
    ["Фитолакка", "Phytolacca americana", "Ягоды и корни ядовиты.", "Лето", "Purple"],
    ["Хохлатка", "Corydalis", "Алкалоиды.", "Весна", "Purple"],
    ["Черемица", "Veratrum", "Алкалоиды.", "Лето", "Green"],
    ["Эфедра", "Ephedra", "Эфедрин.", "Весна", "Green"],
    ["Ядовитый плющ", "Toxicodendron radicans", "Урушиол.", "Лето", "Green"],
    ["Ясенец голостолбиковый", "Dictamnus gymnostylis", "Фурокумарины.", "Июнь", "Pink"],
    ["Ятрофа", "Jatropha", "Токсичные семена.", "Лето", "Red"],
    ["Адиантум", "Adiantum", "Некоторые виды слабоядовиты.", "—", "Green"],
    ["Азалия", "Rhododendron", "Грейанотоксин.", "Весна", "Pink"],
    ["Амариллис", "Amaryllis", "Ликорин.", "Весна", "Red"],
    ["Аспарагус", "Asparagus", "Ягоды слаботоксичны.", "Лето", "Green"],
    ["Брунфельсия", "Brunfelsia", "Ядовитое растение.", "Лето", "Purple"],
    ["Глориоза", "Gloriosa", "Колхицин.", "Лето", "Red"],
    ["Дицентра", "Dicentra", "Алкалоиды.", "Весна", "Pink"],
    ["Каладиум", "Caladium", "Оксалаты.", "Лето", "Red"],
    ["Кливия", "Clivia", "Ликорин.", "Весна", "Orange"],
    ["Кодиеум", "Codiaeum", "Млечный сок.", "—", "Red"],
    ["Лантана", "Lantana camara", "Тритерпеноиды.", "Лето", "Orange"],
    ["Олеандр розовый", "Nerium oleander", "Сердечные гликозиды.", "Лето", "Pink"],
    ["Пуансеттия", "Euphorbia pulcherrima", "Млечный сок.", "Зима", "Red"],
    ["Сциндапсус", "Scindapsus", "Оксалаты.", "—", "Green"],
    ["Филодендрон", "Philodendron", "Оксалаты кальция.", "—", "Green"],
    ["Цикламен", "Cyclamen", "Сапонины.", "Зима", "Pink"],
    ["Аглаонема", "Aglaonema", "Оксалаты.", "Лето", "White"],
    ["Алоказия", "Alocasia", "Оксалаты.", "—", "Green"],
    ["Антуриум", "Anthurium", "Оксалаты.", "—", "Red"],
    ["Гиппеаструм", "Hippeastrum", "Ликорин.", "Весна", "Red"],
    ["Диффенбахия пятнистая", "Dieffenbachia maculata", "Оксалаты.", "Весна", "White"],
    ["Замия", "Zamia", "Циказин.", "—", "Green"],
    ["Кротон", "Codiaeum variegatum", "Млечный сок.", "—", "Red"],
    ["Монстера", "Monstera deliciosa", "Оксалаты в незрелых плодах.", "Редко", "White"],
    ["Плющ обыкновенный", "Hedera helix", "Сапонины.", "Осень", "Green"],
    ["Спатифиллум", "Spathiphyllum", "Оксалаты.", "Весна", "White"],
    ["Сингониум", "Syngonium", "Оксалаты.", "—", "Green"],
    ["Эпипремнум", "Epipremnum aureum", "Оксалаты.", "Редко", "Green"],
    ["Юкка", "Yucca", "Сапонины.", "Лето", "White"],
];

// Домашние — 100 видов (комнатные и садовые декоративные)
const INDOOR_TUPLES: PlantTuple[] = [
    ["Эпипремнум", "Epipremnum aureum", "Неприхотливая плетистая лиана с сердцевидными листьями; хорошо растёт в тени и при искусственном свете.", "Редко", "Green"],
    ["Аглаонема", "Aglaonema", "Теневыносливое растение с пёстрыми или зелёными листьями; подходит для слабоосвещённых комнат и офисов.", "Лето", "White"],
    ["Фикус Бенджамина", "Ficus benjamina", "Популярное деревце с мелкими глянцевыми листьями; любит свет и регулярный полив, не переносит сквозняков.", "Нет", "None"],
    ["Монстера", "Monstera deliciosa", "Крупная лиана с резными листьями и воздушными корнями; нужна опора и простор, в зрелости даёт съедобные плоды.", "Редко", "White"],
    ["Спатифиллум", "Spathiphyllum", "Белые покрывала-цветы и тёмно-зелёные листья; любит влажный воздух и рассеянный свет, цветёт весной и летом.", "Весна", "White"],
    ["Замиокулькас", "Zamioculcas zamiifolia", "Крупные глянцевые листья на мясистых черешках; очень неприхотлив, переносит засуху и слабое освещение.", "Редко", "Green"],
    ["Сансевиерия", "Sansevieria", "Жёсткие мечевидные или розеточные листья; выносливое растение, очищает воздух, цветёт редко мелкими душистыми цветами.", "Редко", "White"],
    ["Фикус Лирата", "Ficus lyrata", "Крупные волнистые листья в форме скрипки; любит яркий рассеянный свет и простор, требователен к влажности.", "Нет", "None"],
    ["Хлорофитум", "Chlorophytum comosum", "Пышный куст с узкими листьями и свисающими «детками» на столонах; неприхотлив, хорошо очищает воздух.", "Лето", "White"],
    ["Пеперомия", "Peperomia", "Компактное растение с мясистыми листьями разной формы и окраски; подходит для подоконников и террариумов.", "Лето", "Green"],
    ["Бегония", "Begonia", "Декоративнолистные и цветущие виды с асимметричными листьями; любит влажный воздух и рассеянный свет.", "Лето", "Pink"],
    ["Герань", "Pelargonium", "Душистые листья и яркие зонтики цветов; светолюбива, летом хорошо чувствует себя на балконе.", "Лето", "Red"],
    ["Фиалка", "Saintpaulia", "Компактные розетки с бархатными листьями и мелкими цветами; цветёт почти круглый год при достаточном свете.", "Круглый год", "Purple"],
    ["Кактус", "Cactaceae", "Сукуленты с колючками и разнообразной формой; нужны редкий полив и много света, многие цветут весной.", "Весна", "Pink"],
    ["Алоэ", "Aloe vera", "Мясистые листья с гелеобразной мякотью; лечебные свойства, неприхотлив, любит яркий свет и умеренный полив.", "Зима", "Orange"],
    ["Каланхоэ", "Kalanchoe", "Сукулент с плотными листьями и яркими соцветиями; цветёт зимой и весной, любит свет и умеренный полив.", "Зима", "Red"],
    ["Толстянка", "Crassula ovata", "Древовидный суккулент с толстыми листьями; «денежное дерево», очень неприхотлив, любит солнце.", "Зима", "White"],
    ["Драцена", "Dracaena", "Деревце с розеткой узких или широких листьев на стволе; неприхотлива, подходит для офисов и жилых комнат.", "Редко", "White"],
    ["Юкка", "Yucca", "Пальмовидное растение с жёсткими листьями на стволе; светолюбива, зимой предпочитает прохладу и редкий полив.", "Лето", "White"],
    ["Шеффлера", "Schefflera", "Крупные пальчатые листья на высоком стебле; быстро растёт, любит рассеянный свет и регулярное опрыскивание.", "Редко", "Green"],
    ["Филодендрон", "Philodendron", "Лианы и кустовые формы.", "Редко", "Green"],
    ["Сциндапсус", "Scindapsus", "Плетистая лиана.", "Редко", "Green"],
    ["Плющ", "Hedera helix", "Вьющаяся лиана.", "Осень", "Green"],
    ["Традесканция", "Tradescantia", "Ампельное растение.", "Лето", "Pink"],
    ["Калатея", "Calathea", "Узорчатые листья.", "Весна", "White"],
    ["Маранта", "Maranta", "Молитвенное растение.", "Лето", "White"],
    ["Кротон", "Codiaeum variegatum", "Пёстрые листья.", "Редко", "Yellow"],
    ["Диффенбахия", "Dieffenbachia", "Крупные пёстрые листья.", "Весна", "White"],
    ["Антуриум", "Anthurium", "Цветок-хвост.", "Круглый год", "Red"],
    ["Орхидея", "Phalaenopsis", "Эпифит с цветами.", "Зима", "White"],
    ["Гибискус", "Hibiscus rosa-sinensis", "Китайская роза.", "Лето", "Red"],
    ["Азалия", "Rhododendron simsii", "Цветущий кустик.", "Зима", "Pink"],
    ["Пуансеттия", "Euphorbia pulcherrima", "Рождественская звезда.", "Зима", "Red"],
    ["Цикламен", "Cyclamen", "Крылья бабочки.", "Зима", "Pink"],
    ["Бромелиевые", "Bromeliaceae", "Яркая розетка.", "Лето", "Red"],
    ["Гузмания", "Guzmania", "Яркий прицветник.", "Лето", "Red"],
    ["Вриезия", "Vriesea", "Декоративный прицветник.", "Лето", "Yellow"],
    ["Нефролепис", "Nephrolepis", "Папоротник.", "—", "Green"],
    ["Адиантум", "Adiantum", "Венерин волос.", "—", "Green"],
    ["Птерис", "Pteris", "Папоротник с резными листьями.", "—", "Green"],
    ["Асплениум", "Asplenium", "Костенец.", "—", "Green"],
    ["Даваллия", "Davallia", "Папоротник с мохнатыми корневищами.", "—", "Green"],
    ["Фиттония", "Fittonia", "Мозаичные листья.", "Лето", "White"],
    ["Рео", "Tradescantia spathacea", "Лодка Моисея.", "Лето", "White"],
    ["Колеус", "Plectranthus scutellarioides", "Крапивка с пёстрыми листьями.", "Лето", "Blue"],
    ["Ирезине", "Iresine", "Краснолистное растение.", "Лето", "Red"],
    ["Кодиеум", "Codiaeum", "Пёстрые листья.", "Редко", "Yellow"],
    ["Алоказия", "Alocasia", "Слоновье ухо.", "Редко", "White"],
    ["Аглаонема переменчивая", "Aglaonema commutatum", "Теневыносливая.", "Лето", "White"],
    ["Сингониум", "Syngonium podophyllum", "Стреловидные листья.", "Редко", "Green"],
    ["Солейролия", "Soleirolia soleirolii", "Детские слёзы.", "Весна", "White"],
    ["Нертера", "Nertera granadensis", "Коралловые ягоды.", "Лето", "Orange"],
    ["Пеларгония", "Pelargonium", "Герань душистая.", "Лето", "Pink"],
    ["Бальзамин", "Impatiens", "Ванька мокрый.", "Лето", "Red"],
    ["Фуксия", "Fuchsia", "Цветы-фонарики.", "Лето", "Pink"],
    ["Жасмин", "Jasminum", "Ароматные цветы.", "Лето", "White"],
    ["Гардения", "Gardenia jasminoides", "Восковые цветы.", "Лето", "White"],
    ["Стефанотис", "Stephanotis floribunda", "Мадагаскарский жасмин.", "Лето", "White"],
    ["Хойя", "Hoya", "Восковой плющ.", "Лето", "White"],
    ["Пассифлора", "Passiflora", "Страстоцвет.", "Лето", "Purple"],
    ["Бугенвиллея", "Bougainvillea", "Яркие прицветники.", "Лето", "Pink"],
    ["Олеандр", "Nerium oleander", "Кустарник с ароматными цветами.", "Лето", "Pink"],
    ["Мирт", "Myrtus", "Ароматные листья.", "Лето", "White"],
    ["Лавр", "Laurus nobilis", "Благородный лавр.", "Весна", "Yellow"],
    ["Кофе", "Coffea arabica", "Кофейное деревце.", "Лето", "White"],
    ["Лимон", "Citrus limon", "Комнатный цитрус.", "Весна", "White"],
    ["Мандарин", "Citrus reticulata", "Комнатный цитрус.", "Весна", "White"],
    ["Гранат", "Punica granatum", "Карликовый гранат.", "Лето", "Red"],
    ["Инжир", "Ficus carica", "Смоковница.", "Лето", "Green"],
    ["Фикус каучуконосный", "Ficus elastica", "Крупные глянцевые листья.", "Редко", "Green"],
    ["Фикус микрокарпа", "Ficus microcarpa", "Бонсай.", "Редко", "Green"],
    ["Араукария", "Araucaria", "Комнатная ель.", "—", "Green"],
    ["Нолина", "Beaucarnea recurvata", "Слоновья нога.", "Лето", "White"],
    ["Панданус", "Pandanus", "Винтовая пальма.", "Редко", "White"],
    ["Хамедорея", "Chamaedorea", "Бамбуковая пальма.", "Весна", "Yellow"],
    ["Ховея", "Howea", "Пальма Кентия.", "—", "Green"],
    ["Финик", "Phoenix dactylifera", "Финиковая пальма.", "Редко", "Yellow"],
    ["Рапис", "Rhapis", "Веерная пальма.", "—", "Yellow"],
    ["Ливистона", "Livistona", "Веерная пальма.", "—", "Green"],
    ["Замия", "Zamia", "Карликовая пальма.", "—", "Brown"],
];

// Дублируем и дополняем до 100 для Домашних (только реальные виды)
function padIndoorTo100(): PlantTuple[] {
    const base = INDOOR_TUPLES;
    const extra: PlantTuple[] = [
        ["Бегония королевская", "Begonia rex", "Декоративные листья.", "Лето", "Pink"],
        ["Бегония клубневая", "Begonia tuberhybrida", "Крупные цветы.", "Лето", "Orange"],
        ["Глоксиния", "Sinningia speciosa", "Колокольчики.", "Лето", "Purple"],
        ["Стрептокарпус", "Streptocarpus", "Цветущее растение.", "Лето", "Purple"],
        ["Колерия", "Kohleria", "Опушённые цветы.", "Лето", "Red"],
        ["Эсхинантус", "Aeschynanthus", "Цветы на концах побегов.", "Лето", "Red"],
        ["Колумнея", "Columnea", "Ампельное цветение.", "Зима", "Red"],
        ["Ахименес", "Achimenes", "Летнее цветение.", "Лето", "Purple"],
        ["Смитианта", "Smithiantha", "Колокольчики.", "Лето", "Orange"],
        ["Эписция", "Episcia", "Бархатные листья.", "Лето", "Red"],
        ["Гипоцирта", "Hypocyrta", "Рыбка.", "Лето", "Orange"],
        ["Рипсалис", "Rhipsalis", "Лесной кактус.", "Весна", "White"],
        ["Шлюмбергера", "Schlumbergera", "Декабрист.", "Зима", "Pink"],
        ["Хатиора", "Hatiora", "Кактус-танцующие кости.", "Весна", "Yellow"],
        ["Эхинопсис", "Echinopsis", "Цветущий кактус.", "Лето", "White"],
        ["Маммиллярия", "Mammillaria", "Шаровидный кактус.", "Весна", "Pink"],
        ["Опунция", "Opuntia", "Плоский кактус.", "Лето", "Yellow"],
        ["Ребуция", "Rebutia", "Маленький цветущий кактус.", "Весна", "Orange"],
        ["Литопс", "Lithops", "Живые камни.", "Осень", "White"],
        ["Хавортия", "Haworthia", "Полосатые листья.", "Лето", "White"],
        ["Эхеверия", "Echeveria", "Розетки суккулента.", "Лето", "Pink"],
        ["Седум", "Sedum", "Очиток.", "Лето", "Yellow"],
        ["Крассула", "Crassula", "Толстянка.", "Зима", "White"],
        ["Пахифитум", "Pachyphytum", "Толстые листья.", "Весна", "Pink"],
        ["Граптопеталум", "Graptopetalum", "Розеточный суккулент.", "Весна", "White"],
        ["Агава", "Agave", "Розетка с шипами.", "Редко", "Green"],
        ["Алоэ древовидное", "Aloe arborescens", "Столетник.", "Зима", "Red"],
        ["Гастерия", "Gasteria", "Языковидные листья.", "Весна", "Red"],
        ["Стапелия", "Stapelia", "Цветы с запахом.", "Лето", "Purple"],
        ["Хойя мясистая", "Hoya carnosa", "Восковой плющ.", "Лето", "White"],
        ["Стефанотис обильноцветущий", "Stephanotis floribunda", "Жасмин Мадагаскара.", "Лето", "White"],
        ["Алламанда", "Allamanda", "Жёлтые трубы.", "Лето", "Yellow"],
        ["Мандевилла", "Mandevilla", "Дипладения.", "Лето", "Pink"],
        ["Каланхоэ Блоссфельда", "Kalanchoe blossfeldiana", "Цветущее каланхоэ.", "Зима", "Red"],
        ["Плектрантус", "Plectranthus", "Комнатная мята.", "Лето", "White"],
        ["Сансевиерия цилиндрическая", "Sansevieria cylindrica", "Цилиндрические листья.", "Редко", "White"],
        ["Каладиум двуцветный", "Caladium bicolor", "Крылья ангела.", "Лето", "Red"],
        ["Аспидистра", "Aspidistra elatior", "Чугунное растение.", "Редко", "Purple"],
        ["Циссус", "Cissus", "Комнатный виноград.", "Лето", "Green"],
        ["Сеткреазия", "Setcreasea pallida", "Пурпурная традесканция.", "Лето", "Pink"],
        ["Бильбергия", "Billbergia", "Бромелиевые.", "Лето", "Pink"],
        ["Тилландсия", "Tillandsia", "Воздушное растение.", "Лето", "Purple"],
        ["Гименокаллис", "Hymenocallis", "Лилия-паук.", "Лето", "White"],
        ["Вельтгеймия", "Veltheimia", "Летняя лилия.", "Зима", "Pink"],
    ];
    return [...base, ...extra].slice(0, 100);
}

// Цветы — 100 видов
const FLOWERS_TUPLES: PlantTuple[] = [
    ["Астра", "Aster", "Звездчатые соцветия разнообразных оттенков; осенний многолетник для клумб и срезки, неприхотлива и холодостойка.", "Осень", "Purple"],
    ["Бархатцы", "Tagetes", "Яркие однолетники с резким запахом; долго цветут, отпугивают вредителей, подходят для бордюров и контейнеров.", "Лето", "Orange"],
    ["Петуния", "Petunia", "Крупные воронковидные цветы на балконах и клумбах; обильное цветение всё лето, любит солнце и регулярный полив.", "Лето", "Purple"],
    ["Ромашка", "Matricaria chamomilla", "Мелкие белые соцветия с жёлтой серединкой; лекарственное растение, используется в чаях и наружно.", "Лето", "White"],
    ["Мак", "Papaver rhoeas", "Ярко-красные лепестки с чёрным центром; однолетник полей и лугов, цветёт в начале лета.", "Июнь", "Red"],
    ["Василёк", "Centaurea cyanus", "Небесно-голубые цветы на тонких стеблях; символ хлебных полей, однолетник для лужаек и букетов.", "Лето", "Blue"],
    ["Одуванчик", "Taraxacum officinale", "Жёлтые корзинки и пушистые шары семян; медонос и лекарственное растение, растёт повсеместно.", "Май", "Yellow"],
    ["Клевер", "Trifolium", "Шаровидные соцветия и тройчатые листья; медонос и сидерат, украшает луга и газоны.", "Лето", "Pink"],
    ["Роза", "Rosa", "Классический садовый цветок с ароматом и шипами; множество сортов для клумб, шпалер и срезки.", "Лето", "Red"],
    ["Пион", "Paeonia", "Крупные махровые или простые цветы; многолетник с пышной листвой, цветёт в начале лета.", "Июнь", "Pink"],
    ["Ирис", "Iris", "Изящные цветы с бородкой или без; луковичные и корневищные виды для влажных и сухих мест.", "Май", "Purple"],
    ["Лилия", "Lilium", "Крупные ароматные цветы на высоких стеблях; луковичный многолетник для клумб и букетов.", "Лето", "White"],
    ["Тюльпан", "Tulipa", "Классический весенний цветок разнообразной формы и окраски; луковичный, цветёт в апреле—мае.", "Апрель", "Red"],
    ["Нарцисс", "Narcissus", "Белые или жёлтые венчики с коронкой; весенний луковичный для клумб и натурализации в газоне.", "Апрель", "Yellow"],
    ["Гвоздика", "Dianthus", "Цветы с бахромчатыми лепестками и пряным ароматом; однолетние и многолетние виды для бордюров и срезки.", "Лето", "Pink"],
    ["Левкой", "Matthiola", "Ночная фиалка.", "Лето", "Purple"],
    ["Георгин", "Dahlia", "Крупные соцветия.", "Лето", "Red"],
    ["Гладиолус", "Gladiolus", "Шпажник.", "Лето", "Pink"],
    ["Хризантема", "Chrysanthemum", "Осенний цветок.", "Осень", "Yellow"],
    ["Астра однолетняя", "Callistephus chinensis", "Китайская астра.", "Лето", "Blue"],
    ["Цинния", "Zinnia", "Яркие головки.", "Лето", "Orange"],
    ["Бальзамин садовый", "Impatiens balsamina", "Недотрога.", "Лето", "Pink"],
    ["Львиный зев", "Antirrhinum majus", "Собачки.", "Лето", "Yellow"],
    ["Сальвия", "Salvia splendens", "Шалфей сверкающий.", "Лето", "Red"],
    ["Вербена", "Verbena", "Душистые соцветия.", "Лето", "Purple"],
    ["Лобелия", "Lobelia", "Синие каскады.", "Лето", "Blue"],
    ["Алиссум", "Lobularia maritima", "Медовый запах.", "Лето", "White"],
    ["Брахикома", "Brachyscome", "Ромашковидные.", "Лето", "Purple"],
    ["Гацания", "Gazania", "Африканская ромашка.", "Лето", "Orange"],
    ["Космея", "Cosmos", "Космос.", "Лето", "Pink"],
    ["Эхинацея", "Echinacea", "Лекарственная.", "Лето", "Pink"],
    ["Рудбекия", "Rudbeckia", "Золотой шар.", "Лето", "Yellow"],
    ["Гелениум", "Helenium", "Осенний цветок.", "Осень", "Orange"],
    ["Дельфиниум", "Delphinium", "Живокость.", "Июнь", "Blue"],
    ["Люпин", "Lupinus", "Многолетник с свечами.", "Июнь", "Purple"],
    ["Аквилегия", "Aquilegia", "Водосбор.", "Май", "Blue"],
    ["Примула", "Primula", "Первоцвет.", "Весна", "Yellow"],
    ["Виола", "Viola", "Анютины глазки.", "Весна", "Purple"],
    ["Маргаритка", "Bellis perennis", "Многолетняя маргаритка.", "Весна", "Pink"],
    ["Незабудка", "Myosotis", "Голубые глазки.", "Май", "Blue"],
    ["Ландыш", "Convallaria majalis", "Майский цветок.", "Май", "White"],
    ["Ветреница", "Anemone", "Весенний эфемероид.", "Весна", "White"],
    ["Медуница", "Pulmonaria", "Раннецвет.", "Весна", "Pink"],
    ["Барвинок", "Vinca", "Вечнозелёный ковёр.", "Весна", "Blue"],
    ["Флокс", "Phlox", "Душистые метёлки.", "Лето", "Pink"],
    ["Астильба", "Astilbe", "Пышные метёлки.", "Лето", "Pink"],
    ["Хоста", "Hosta", "Декоративнолистная.", "Лето", "White"],
    ["Лилейник", "Hemerocallis", "Красоднев.", "Лето", "Orange"],
    ["Пиретрум", "Tanacetum coccineum", "Ромашка персидская.", "Июнь", "Pink"],
    ["Нивяник", "Leucanthemum", "Садовая ромашка.", "Лето", "White"],
    ["Колокольчик", "Campanula", "Колокольчики.", "Лето", "Blue"],
    ["Гвоздика турецкая", "Dianthus barbatus", "Бородатая гвоздика.", "Июнь", "Red"],
    ["Мальва", "Malva", "Просвирник.", "Лето", "Pink"],
    ["Лаванда", "Lavandula", "Ароматная.", "Лето", "Purple"],
    ["Шалфей", "Salvia officinalis", "Лекарственный.", "Лето", "Purple"],
    ["Монарда", "Monarda", "Бергамот.", "Лето", "Red"],
    ["Тысячелистник", "Achillea", "Лекарственный.", "Лето", "White"],
    ["Золотарник", "Solidago", "Золотая розга.", "Осень", "Yellow"],
    ["Очиток", "Sedum", "Седум.", "Осень", "Pink"],
    ["Астра многолетняя", "Aster novae-angliae", "Новоанглийская.", "Осень", "Purple"],
    ["Хризантема корейская", "Chrysanthemum koreanum", "Мелкоцветковая.", "Осень", "Orange"],
    ["Георгин культурный", "Dahlia pinnata", "Садовый георгин.", "Лето", "Red"],
    ["Гладиолус гибридный", "Gladiolus × hortulanus", "Садовый гладиолус.", "Лето", "Pink"],
    ["Канна", "Canna", "Канна индийская.", "Лето", "Red"],
    ["Бегония клубневая", "Begonia × tuberhybrida", "Клубневая бегония.", "Лето", "Orange"],
    ["Герань садовая", "Geranium", "Журавельник.", "Лето", "Purple"],
    ["Клематис", "Clematis", "Ломонос.", "Лето", "Purple"],
    ["Жимолость каприфоль", "Lonicera caprifolium", "Душистая лиана.", "Июнь", "White"],
    ["Настурция", "Tropaeolum majus", "Капуцин.", "Лето", "Orange"],
    ["Ипомея", "Ipomoea", "Вьюнок.", "Лето", "Blue"],
    ["Душистый горошек", "Lathyrus odoratus", "Чина душистая.", "Лето", "Pink"],
    ["Календула", "Calendula officinalis", "Ноготки.", "Лето", "Orange"],
    ["Подсолнечник", "Helianthus annuus", "Солнечный цветок.", "Лето", "Yellow"],
    ["Матиола", "Matthiola incana", "Левкой седой.", "Лето", "Purple"],
    ["Годеция", "Godetia", "Калифорнийский мак.", "Лето", "Pink"],
    ["Эшшольция", "Eschscholzia", "Калифорнийский мак.", "Лето", "Orange"],
    ["Лимнантус", "Limnanthes", "Пенник.", "Лето", "Yellow"],
    ["Нигелла", "Nigella", "Чернушка.", "Лето", "Blue"],
    ["Лаватера", "Lavatera", "Дикая роза.", "Лето", "Pink"],
    ["Мальва шток-роза", "Alcea rosea", "Шток-роза.", "Лето", "Red"],
    ["Дурман душистый", "Datura metel", "Декоративный дурман.", "Лето", "White"],
    ["Табак душистый", "Nicotiana alata", "Душистый табак.", "Лето", "White"],
    ["Бегония вечноцветущая", "Begonia semperflorens", "Постоянное цветение.", "Лето", "Pink"],
    ["Петуния ампельная", "Petunia × hybrida", "Каскадная петуния.", "Лето", "Purple"],
    ["Сурфиния", "Surfinia", "Ампельная петуния.", "Лето", "Pink"],
    ["Вербена гибридная", "Verbena × hybrida", "Садовая вербена.", "Лето", "Red"],
    ["Лобелия эринус", "Lobelia erinus", "Синяя лобелия.", "Лето", "Blue"],
    ["Бархатцы прямостоячие", "Tagetes erecta", "Крупные бархатцы.", "Лето", "Orange"],
    ["Бархатцы тонколистные", "Tagetes tenuifolia", "Мелкие бархатцы.", "Лето", "Yellow"],
    ["Агератум", "Ageratum", "Долгоцветка.", "Лето", "Blue"],
    ["Целозия", "Celosia", "Петушиный гребень.", "Лето", "Red"],
    ["Амарант", "Amaranthus", "Щирица.", "Лето", "Red"],
    ["Клеома", "Cleome", "Паучок.", "Лето", "Pink"],
    ["Гвоздика Шабо", "Dianthus caryophyllus", "Садовая гвоздика.", "Лето", "Red"],
    ["Бузульник", "Ligularia", "Крупные листья и жёлтые соцветия.", "Лето", "Yellow"],
    ["Гейхера", "Heuchera", "Декоративнолистная с метёлками цветов.", "Лето", "Pink"],
    ["Кореопсис", "Coreopsis", "Желтые ромашковидные цветы.", "Лето", "Yellow"],
    ["Пенстемон", "Penstemon", "Колокольчатые цветы на высоких стеблях.", "Лето", "Purple"],
    ["Гайлардия", "Gaillardia", "Пёстрые ромашковидные соцветия.", "Лето", "Red"],
    ["Книфофия", "Kniphofia", "Факельная лилия.", "Лето", "Orange"],
    ["Лихнис", "Lychnis", "Горицвет.", "Лето", "Red"],
];

// Дополняем Цветы до 100 (только реальные виды)
function padFlowersTo100(): PlantTuple[] {
    const extra: PlantTuple[] = [
        ["Анемона японская", "Anemone hupehensis", "Осенняя ветреница.", "Осень", "Pink"],
        ["Астильбоидес", "Astilboides tabularis", "Крупнолистный многолетник.", "Лето", "White"],
        ["Бергения", "Bergenia", "Бадан.", "Весна", "Pink"],
        ["Гелениум осенний", "Helenium autumnale", "Осенний цветок.", "Осень", "Yellow"],
        ["Дороникум", "Doronicum", "Козульник.", "Весна", "Yellow"],
        ["Купена", "Polygonatum", "Соломонова печать.", "Май", "White"],
        ["Лютик азиатский", "Ranunculus asiaticus", "Садовый лютик.", "Май", "Red"],
    ];
    return [...FLOWERS_TUPLES, ...extra].slice(0, 100);
}

// Аллергены — 100 видов
const ALLERGENS_TUPLES: PlantTuple[] = [
    ["Рожь", "Secale cereale", "Злаковая культура с обильной пыльцой; цветёт в июне, сильный аллерген для людей с поллинозом на злаки.", "Июнь", "Green"],
    ["Крапива", "Urtica dioica", "Жгучие листья и мелкие зелёные соцветия; пыльца разносится ветром и может усиливать аллергию в конце лета.", "Лето", "Green"],
    ["Щавель", "Rumex", "Кислые листья и метёлки мелких цветов; пыльца вызывает поллиноз у чувствительных людей в мае—июне.", "Май", "Red"],
    ["Береза", "Betula pendula", "Один из главных весенних аллергенов; пыльца разносится далеко, пик цветения — апрель—май.", "Апрель", "Yellow"],
    ["Амброзия", "Ambrosia artemisiifolia", "Карантинный сорняк с мелкими зеленоватыми цветами; сильнейший осенний аллерген, цветёт в августе—сентябре.", "Август", "Green"],
    ["Полынь", "Artemisia vulgaris", "Горькая трава с метёлками мелких желтоватых цветов; пыльца вызывает поллиноз в середине и конце лета.", "Июль", "Yellow"],
    ["Тимофеевка", "Phleum pratense", "Луговая трава с колосовидными соцветиями; типичный аллерген злаковых лугов, цветёт в июне.", "Июнь", "Green"],
    ["Лещина", "Corylus avellana", "Кустарник-орешник; одна из первых пылящих растений весной — март—апрель.", "Март", "Yellow"],
    ["Ольха", "Alnus", "Раннецветущее дерево у водоёмов; серёжки пылят в марте—апреле, сильный аллерген начала весны.", "Март", "Green"],
    ["Ива", "Salix", "Деревья и кустарники у воды; пушистые серёжки пылят в апреле—мае.", "Апрель", "Yellow"],
    ["Тополь", "Populus", "Дерево с пухом и обильной лёгкой пыльцой; пух разносит пыльцу и раздражает дыхательные пути в мае—июне.", "Май", "Green"],
    ["Дуб", "Quercus robur", "Крупное дерево с серёжками; пыльца дуба аллергенна в мае.", "Май", "Green"],
    ["Ясень", "Fraxinus", "Дерево с метёлками мелких цветов; пылит рано весной — апрель—май.", "Апрель", "Green"],
    ["Клён", "Acer", "Деревья с кистями или щитками цветов; пыльца клёна — весенний аллерген, пик в мае.", "Май", "Yellow"],
    ["Липа", "Tilia", "Душистое цветение в июле; пыльца липы может вызывать аллергию в разгар лета.", "Июль", "Yellow"],
    ["Сосна", "Pinus", "Хвойное дерево; жёлтая пыльца обильно высыпается в мае и покрывает поверхности.", "Май", "Yellow"],
    ["Ель", "Picea", "Хвойное дерево с шишками; пылит в мае, пыльца менее аллергенна, чем у берёзы, но может беспокоить.", "Май", "Red"],
    ["Овсяница", "Festuca", "Луговая трава.", "Июнь", "Green"],
    ["Мятлик", "Poa", "Злак.", "Май", "Green"],
    ["Пырей", "Elymus repens", "Злак-сорняк.", "Июнь", "Green"],
    ["Кострец", "Bromus", "Злак.", "Июнь", "Green"],
    ["Лисохвост", "Alopecurus", "Злак.", "Июнь", "Green"],
    ["Подорожник", "Plantago major", "Пыльца подорожника.", "Лето", "Green"],
    ["Лебеда", "Atriplex", "Сорняк.", "Лето", "Green"],
    ["Марь", "Chenopodium", "Сорняк.", "Лето", "Green"],
    ["Полынь горькая", "Artemisia absinthium", "Сильный аллерген.", "Июль", "Yellow"],
    ["Полынь однолетняя", "Artemisia annua", "Амброзия полыннолистная.", "Август", "Yellow"],
    ["Золотарник", "Solidago", "Осенний аллерген.", "Август", "Yellow"],
    ["Амброзия трёхраздельная", "Ambrosia trifida", "Крупная амброзия.", "Август", "Green"],
    ["Конопля", "Cannabis sativa", "Пыльца конопли.", "Лето", "Green"],
    ["Хмель", "Humulus lupulus", "Пыльца хмеля.", "Лето", "Green"],
    ["Ежа сборная", "Dactylis glomerata", "Злак лугов и газонов.", "Июнь", "Green"],
    ["Полевица", "Agrostis", "Злак.", "Июнь", "Green"],
    ["Трясунка", "Briza", "Злак.", "Июнь", "Green"],
    ["Душистый колосок", "Anthoxanthum odoratum", "Злак.", "Май", "Green"],
    ["Пшеница", "Triticum aestivum", "Культурный злак, пыльца.", "Июнь", "Green"],
    ["Ячмень", "Hordeum vulgare", "Культурный злак, пыльца.", "Июнь", "Green"],
    ["Кукуруза", "Zea mays", "Пыльца кукурузы.", "Июль", "Yellow"],
    ["Подсолнечник", "Helianthus annuus", "Пыльца подсолнечника.", "Лето", "Yellow"],
    ["Лебеда садовая", "Atriplex hortensis", "Пыльца.", "Лето", "Green"],
    ["Марь белая", "Chenopodium album", "Пыльца мари.", "Лето", "Green"],
    ["Свекла", "Beta vulgaris", "Пыльца свёклы.", "Лето", "Green"],
    ["Щавель курчавый", "Rumex crispus", "Пыльца.", "Июнь", "Green"],
    ["Гречиха", "Fagopyrum esculentum", "Пыльца гречихи.", "Июль", "White"],
    ["Конский щавель", "Rumex obtusifolius", "Пыльца.", "Июнь", "Green"],
    ["Клён ясенелистный", "Acer negundo", "Пыльца клёна.", "Апрель", "Green"],
    ["Берёза карликовая", "Betula nana", "Пыльца берёзы.", "Май", "Yellow"],
    ["Ива козья", "Salix caprea", "Ранняя пыльца.", "Апрель", "Yellow"],
    ["Ольха серая", "Alnus incana", "Пыльца ольхи.", "Март", "Green"],
    ["Бук восточный", "Fagus orientalis", "Пыльца бука.", "Апрель", "Green"],
    ["Платан", "Platanus", "Пух и пыльца платана.", "Май", "Green"],
    ["Вяз гладкий", "Ulmus laevis", "Пыльца вяза.", "Март", "Green"],
    ["Ясень американский", "Fraxinus americana", "Пыльца ясеня.", "Апрель", "Green"],
    ["Орех грецкий", "Juglans regia", "Пыльца ореха.", "Май", "Green"],
    ["Берёза низкая", "Betula humilis", "Пыльца.", "Май", "Yellow"],
    ["Осина", "Populus tremula", "Пух осины.", "Апрель", "Green"],
    ["Тополь белый", "Populus alba", "Пух тополя.", "Май", "Green"],
    ["Кипарисовик", "Chamaecyparis", "Пыльца хвойных.", "Май", "Yellow"],
    ["Лиственница", "Larix", "Пыльца лиственницы.", "Май", "Red"],
    ["Пихта", "Abies", "Пыльца пихты.", "Май", "Green"],
    ["Тсуга", "Tsuga", "Пыльца.", "Май", "Green"],
    ["Можжевельник", "Juniperus", "Пыльца можжевельника.", "Май", "Green"],
    ["Акация белая", "Robinia pseudoacacia", "Пыльца акации.", "Май", "White"],
    ["Каштан конский", "Aesculus hippocastanum", "Пыльца каштана.", "Май", "White"],
    ["Боярышник", "Crataegus", "Пыльца боярышника.", "Май", "White"],
    ["Яблоня", "Malus domestica", "Пыльца яблони.", "Май", "White"],
    ["Груша", "Pyrus communis", "Пыльца груши.", "Апрель", "White"],
    ["Слива", "Prunus domestica", "Пыльца сливы.", "Апрель", "White"],
    ["Вишня", "Prunus cerasus", "Пыльца вишни.", "Апрель", "White"],
    ["Черёмуха", "Prunus padus", "Пыльца черёмухи.", "Май", "White"],
    ["Сирень", "Syringa vulgaris", "Пыльца сирени.", "Май", "Purple"],
    ["Буддлея", "Buddleja", "Пыльца буддлеи.", "Лето", "Purple"],
    ["Бирючина", "Ligustrum", "Пыльца бирючины.", "Июнь", "White"],
    ["Жимолость", "Lonicera", "Пыльца жимолости.", "Май", "White"],
    ["Бархат амурский", "Phellodendron amurense", "Пыльца.", "Июнь", "Green"],
    ["Клён остролистный", "Acer platanoides", "Пыльца клёна.", "Май", "Yellow"],
    ["Вяз малый", "Ulmus minor", "Пыльца вяза.", "Март", "Green"],
    ["Граб обыкновенный", "Carpinus betulus", "Пыльца граба.", "Апрель", "Green"],
    ["Орешник медвежий", "Corylus colurna", "Пыльца лещины.", "Март", "Yellow"],
    ["Ольха чёрная", "Alnus glutinosa", "Пыльца ольхи.", "Март", "Green"],
    ["Ива белая", "Salix alba", "Пыльца ивы.", "Апрель", "Yellow"],
    ["Тополь чёрный", "Populus nigra", "Пух тополя.", "Май", "Green"],
    ["Дуб красный", "Quercus rubra", "Пыльца дуба.", "Май", "Green"],
    ["Ясень обыкновенный", "Fraxinus excelsior", "Пыльца ясеня.", "Апрель", "Green"],
    ["Липа крупнолистная", "Tilia platyphyllos", "Пыльца липы.", "Июль", "Yellow"],
    ["Сосна чёрная", "Pinus nigra", "Пыльца сосны.", "Май", "Yellow"],
    ["Ель колючая", "Picea pungens", "Пыльца ели.", "Май", "Red"],
];

// Дополняем Аллергены до 100 (только реальные виды)
function padAllergensTo100(): PlantTuple[] {
    return [...ALLERGENS_TUPLES].slice(0, 100);
}

// Деревья — 100 видов
const TREES_TUPLES: PlantTuple[] = [
    ["Береза", "Betula", "Белоствольное дерево с серёжками; символ российского пейзажа, растёт в лесах и на опушках, пылит весной.", "Апрель", "Yellow"],
    ["Вяз", "Ulmus", "Крупное дерево с асимметричными листьями; растёт по поймам рек и в смешанных лесах, цветёт рано весной.", "Март", "Green"],
    ["Лиственница", "Larix", "Хвойное дерево, сбрасывающее хвою на зиму; мягкие иголки и мелкие шишки, распространена в Сибири и горах.", "Май", "Red"],
    ["Дуб", "Quercus robur", "Долгоживущее дерево с желудями и лопастными листьями; типичен для широколиственных лесов и парков.", "Май", "Green"],
    ["Сосна", "Pinus sylvestris", "Вечнозелёная хвойная с длинными иглами и шишками; светолюбива, растёт на песках и сухих склонах.", "Май", "Yellow"],
    ["Клен", "Acer platanoides", "Дерево с крупными пальчатыми листьями, яркой осенней окраской; обычен в парках и лесах средней полосы.", "Май", "Yellow"],
    ["Липа", "Tilia cordata", "Дерево с сердцевидными листьями и душистыми цветами; медонос, даёт липовый мёд, цветёт в июле.", "Июль", "Yellow"],
    ["Ель", "Picea abies", "Вечнозелёная хвойная с висячими шишками; «новогоднее дерево», растёт в тайге и парках.", "Май", "Red"],
    ["Ольха", "Alnus glutinosa", "Дерево у водоёмов с округлыми листьями и шишковидными соплодиями; чёрная ольха цветёт рано весной.", "Март", "Green"],
    ["Ива", "Salix alba", "Дерево с узкими листьями у рек и прудов; белая ива с серебристой листвой, пылит в апреле.", "Апрель", "Yellow"],
    ["Тополь", "Populus nigra", "Высокое дерево с треугольными листьями; чёрный тополь даёт пух в мае—июне, растёт по поймам.", "Май", "Green"],
    ["Ясень", "Fraxinus excelsior", "Крупное дерево с перистыми листьями и крылатыми плодами; ясень обыкновенный — лесной и парковый вид.", "Апрель", "Green"],
    ["Рябина", "Sorbus aucuparia", "Дерево или кустарник с оранжево-красными гроздьями ягод; плоды остаются на зиму и кормят птиц.", "Май", "White"],
    ["Бук", "Fagus sylvatica", "Мощное дерево с гладкой серой корой и орешками в колючей плюске; буковые леса — Европа и Кавказ.", "Апрель", "Green"],
    ["Граб", "Carpinus betulus", "Дерево с ребристыми стволами и овальными листьями; граб обыкновенный типичен для дубрав и предгорий.", "Апрель", "Green"],
    ["Каштан", "Aesculus hippocastanum", "Крупные пальчатые листья и свечи белых цветов; конский каштан — парковое дерево, плоды несъедобны.", "Май", "White"],
    ["Клён полевой", "Acer campestre", "Полевой клён.", "Май", "Yellow"],
    ["Клён ясенелистный", "Acer negundo", "Американский клён.", "Апрель", "Green"],
    ["Осина", "Populus tremula", "Тополь дрожащий.", "Апрель", "Green"],
    ["Черёмуха", "Prunus padus", "Ароматное цветение.", "Май", "White"],
    ["Яблоня лесная", "Malus sylvestris", "Дикая яблоня.", "Май", "White"],
    ["Груша лесная", "Pyrus pyraster", "Дикая груша.", "Апрель", "White"],
    ["Вишня птичья", "Prunus avium", "Черешня.", "Апрель", "White"],
    ["Слива", "Prunus domestica", "Слива домашняя.", "Апрель", "White"],
    ["Черешня", "Prunus avium", "Птичья вишня.", "Апрель", "White"],
    ["Облепиха", "Hippophae rhamnoides", "Колючий кустарник.", "Апрель", "Green"],
    ["Калина", "Viburnum opulus", "Калина красная.", "Май", "White"],
    ["Боярышник", "Crataegus", "Колючий кустарник.", "Май", "White"],
    ["Крушина", "Frangula alnus", "Крушина ломкая.", "Май", "Green"],
    ["Ирга", "Amelanchier", "Ирга круглолистная.", "Май", "White"],
    ["Лещина", "Corylus avellana", "Орешник.", "Март", "Yellow"],
    ["Берёза пушистая", "Betula pubescens", "Берёза белая.", "Апрель", "Yellow"],
    ["Берёза повислая", "Betula pendula", "Берёза бородавчатая.", "Апрель", "Yellow"],
    ["Дуб черешчатый", "Quercus robur", "Дуб обыкновенный.", "Май", "Green"],
    ["Сосна обыкновенная", "Pinus sylvestris", "Сосна лесная.", "Май", "Yellow"],
    ["Ель обыкновенная", "Picea abies", "Ель европейская.", "Май", "Red"],
    ["Пихта", "Abies", "Пихта сибирская.", "Май", "Green"],
    ["Лиственница сибирская", "Larix sibirica", "Лиственница.", "Май", "Red"],
    ["Кедр сибирский", "Pinus sibirica", "Кедровая сосна.", "Июнь", "Purple"],
    ["Можжевельник", "Juniperus", "Можжевельник обыкновенный.", "Май", "Green"],
    ["Туя", "Thuja", "Туя западная.", "Апрель", "Green"],
    ["Тис", "Taxus baccata", "Тис ягодный.", "Март", "Green"],
    ["Берёза карельская", "Betula pendula var. carelica", "Карельская берёза.", "Апрель", "Yellow"],
    ["Дуб скальный", "Quercus petraea", "Дуб бесплодный.", "Май", "Green"],
    ["Клён полевой", "Acer campestre", "Полевой клён.", "Май", "Yellow"],
    ["Клён татарский", "Acer tataricum", "Неклён.", "Май", "White"],
    ["Клён серебристый", "Acer saccharinum", "Серебристый клён.", "Апрель", "Green"],
    ["Ясень маньчжурский", "Fraxinus mandschurica", "Маньчжурский ясень.", "Май", "Green"],
    ["Вяз горный", "Ulmus glabra", "Вяз шершавый.", "Март", "Green"],
    ["Липа войлочная", "Tilia tomentosa", "Серебристая липа.", "Июль", "Yellow"],
    ["Липа крупнолистная", "Tilia platyphyllos", "Широколистная липа.", "Июнь", "Yellow"],
    ["Ольха серая", "Alnus incana", "Белая ольха.", "Март", "Green"],
    ["Ива ломкая", "Salix fragilis", "Ракита.", "Апрель", "Yellow"],
    ["Ива козья", "Salix caprea", "Бредина.", "Апрель", "Yellow"],
    ["Тополь пирамидальный", "Populus nigra var. italica", "Тополь итальянский.", "Апрель", "Green"],
    ["Тополь белый", "Populus alba", "Белый тополь.", "Апрель", "Green"],
    ["Яблоня ягодная", "Malus baccata", "Сибирская яблоня.", "Май", "White"],
    ["Груша уссурийская", "Pyrus ussuriensis", "Дикая груша.", "Май", "White"],
    ["Вишня степная", "Prunus fruticosa", "Кустарниковая вишня.", "Май", "White"],
    ["Черёмуха Маака", "Prunus maackii", "Черёмуха медвежья.", "Май", "White"],
    ["Рябина круглолистная", "Sorbus aria", "Рябина ария.", "Май", "White"],
    ["Рябина глоговина", "Sorbus torminalis", "Берека.", "Май", "White"],
    ["Боярышник однопестичный", "Crataegus monogyna", "Боярышник обыкновенный.", "Май", "White"],
    ["Боярышник кроваво-красный", "Crataegus sanguinea", "Сибирский боярышник.", "Май", "White"],
    ["Кизильник", "Cotoneaster", "Кизильник блестящий.", "Май", "Pink"],
    ["Сирень обыкновенная", "Syringa vulgaris", "Сирень.", "Май", "Purple"],
    ["Сирень венгерская", "Syringa josikaea", "Венгерская сирень.", "Май", "Purple"],
    ["Бирючина обыкновенная", "Ligustrum vulgare", "Дикая бирючина.", "Июнь", "White"],
    ["Жимолость татарская", "Lonicera tatarica", "Татарская жимолость.", "Май", "Pink"],
    ["Клён гиннала", "Acer ginnala", "Клён приречный.", "Май", "Yellow"],
    ["Скумпия", "Cotinus coggygria", "Желтинник.", "Июнь", "Yellow"],
    ["Сумах", "Rhus typhina", "Уксусное дерево.", "Июнь", "Green"],
    ["Бархат амурский", "Phellodendron amurense", "Амурское пробковое дерево.", "Июнь", "Green"],
    ["Карагана", "Caragana arborescens", "Жёлтая акация.", "Май", "Yellow"],
    ["Робиния", "Robinia pseudoacacia", "Белая акация.", "Май", "White"],
    ["Гледичия", "Gleditsia triacanthos", "Гледичия трёхколючковая.", "Июнь", "Green"],
    ["Софора", "Styphnolobium japonicum", "Софора японская.", "Июль", "White"],
    ["Конский каштан красный", "Aesculus × carnea", "Красный каштан.", "Май", "Pink"],
    ["Платан клёнолистный", "Platanus × hispanica", "Платан гибридный.", "Май", "Green"],
    ["Орех маньчжурский", "Juglans mandshurica", "Маньчжурский орех.", "Май", "Green"],
    ["Орех чёрный", "Juglans nigra", "Чёрный орех.", "Май", "Green"],
    ["Птелея", "Ptelea trifoliata", "Кожанка.", "Июнь", "Green"],
    ["Пайрус", "Pyrus", "Груша.", "Апрель", "White"],
    ["Черешня", "Prunus avium", "Птичья вишня.", "Апрель", "White"],
    ["Абрикос", "Prunus armeniaca", "Абрикос обыкновенный.", "Апрель", "White"],
    ["Персик", "Prunus persica", "Персик обыкновенный.", "Апрель", "Pink"],
    ["Миндаль", "Prunus dulcis", "Миндаль обыкновенный.", "Март", "Pink"],
    ["Пихта белая", "Abies alba", "Пихта европейская.", "Май", "Green"],
    ["Пихта Нордмана", "Abies nordmanniana", "Пихта кавказская.", "Май", "Green"],
    ["Лиственница европейская", "Larix decidua", "Лиственница опадающая.", "Май", "Red"],
    ["Кедр атласский", "Cedrus atlantica", "Атласский кедр.", "Октябрь", "Green"],
    ["Можжевельник виргинский", "Juniperus virginiana", "Карандашное дерево.", "Март", "Green"],
    ["Туя гигантская", "Thuja plicata", "Туя складчатая.", "Апрель", "Green"],
];

// Дополняем Деревья до 100 (только реальные виды)
function padTreesTo100(): PlantTuple[] {
    return [...TREES_TUPLES].slice(0, 100);
}

// Сорняки — 100 видов
const WEEDS_TUPLES: PlantTuple[] = [
    ["Пастушья сумка", "Capsella bursa-pastoris", "Мелкие белые цветы и треугольные стручочки; типичный огородный и придорожный сорняк, цветёт всё лето.", "Лето", "White"],
    ["Горец птичий", "Polygonum aviculare", "Стелющееся растение с мелкими розоватыми цветами; устойчивый сорняк дорог и тропинок, трудно выпалывается.", "Лето", "Pink"],
    ["Сныть", "Aegopodium podagraria", "Крупные тройчатые листья и зонтики белых цветов; трудноискоренимый многолетник тенистых мест и огородов.", "Лето", "White"],
    ["Крапива", "Urtica dioica", "Жгучие листья и метёлки мелких зелёных цветов; растёт у заборов и на пустырях, молодые листья съедобны.", "Лето", "Green"],
    ["Подорожник", "Plantago major", "Широкие листья в розетке и колосья мелких цветов; лекарственное растение, сорняк газонов и дорог.", "Лето", "Green"],
    ["Лопух", "Arctium lappa", "Крупные листья и шаровидные корзинки с цепкими репьями; растёт на пустырях, корни съедобны.", "Лето", "Purple"],
    ["Пырей", "Elymus repens", "Злак с ползучим корневищем и колосьями; злостный сорняк полей и огородов, трудно выводится.", "Лето", "Green"],
    ["Лебеда", "Atriplex patula", "Ромбовидные листья и зелёные клубочки цветов; огородный и полевой сорняк, молодые побеги съедобны.", "Лето", "Green"],
    ["Марь белая", "Chenopodium album", "Мучнистые листья и метёлки мелких цветов; марь обыкновенная — частый сорняк огородов и полей.", "Лето", "Green"],
    ["Щирица", "Amaranthus retroflexus", "Крупные метёлки и колючие соплодия; щирица запрокинутая засоряет огороды и поля.", "Лето", "Green"],
    ["Осот", "Sonchus", "Жёлтые корзинки и колючие листья; полевой и огородный сорняк с горьким млечным соком.", "Лето", "Yellow"],
    ["Бодяк", "Cirsium", "Колючие листья и фиолетовые корзинки; чертополох засоряет луга, пастбища и обочины.", "Лето", "Purple"],
    ["Вьюнок", "Convolvulus arvensis", "Воронковидные белые или розовые цветы и вьющиеся стебли; березка оплетает посевы и изгороди.", "Лето", "White"],
    ["Мокрица", "Stellaria media", "Мелкие белые звёздчатые цветы и сочные стебли; звездчатка средняя — влаголюбивый сорняк огородов и теплиц.", "Весна", "White"],
    ["Одуванчик", "Taraxacum officinale", "Жёлтые корзинки и пушистые шары семян; сорняк газонов и лужаек, листья и корни съедобны.", "Май", "Yellow"],
    ["Клевер ползучий", "Trifolium repens", "Белые головки и укореняющиеся побеги; ползучий сорняк газонов и лугов.", "Лето", "White"],
    ["Лютик ползучий", "Ranunculus repens", "Жёлтые блестящие цветы и ползучие побеги; влаголюбивый сорняк лугов и канав.", "Май", "Yellow"],
    ["Лапчатка", "Potentilla", "Жёлтые цветы и пальчатые листья; лапчатка гусиная растёт по дорогам и выгонам.", "Лето", "Yellow"],
    ["Тысячелистник", "Achillea millefolium", "Щитки белых или розоватых цветов и рассечённые листья; обычный сорняк лугов и обочин, лекарственное.", "Лето", "White"],
    ["Пижма", "Tanacetum vulgare", "Жёлтые пуговки соцветий и перистые листья; дикая рябинка по дорогам и пустырям, запах резкий.", "Лето", "Yellow"],
    ["Полынь", "Artemisia vulgaris", "Серебристо-зелёные листья и метёлки мелких желтоватых цветов; горькая трава пустырей и обочин.", "Июль", "Yellow"],
    ["Звездчатка", "Stellaria", "Мокрица.", "Весна", "White"],
    ["Горец почечуйный", "Persicaria maculosa", "Почечуйная трава.", "Лето", "Pink"],
    ["Репейник", "Arctium", "Лопух.", "Лето", "Purple"],
    ["Крапива двудомная", "Urtica dioica", "Жгучая крапива.", "Лето", "Green"],
    ["Подорожник большой", "Plantago major", "Подорожник.", "Лето", "Green"],
    ["Пырей ползучий", "Elymus repens", "Пырей.", "Июнь", "Green"],
    ["Овсюг", "Avena fatua", "Овёс пустой.", "Июнь", "Green"],
    ["Куриное просо", "Echinochloa", "Ежовник.", "Лето", "Green"],
    ["Щетинник", "Setaria", "Мышей.", "Лето", "Green"],
    ["Плевел", "Lolium", "Плевел многолетний.", "Июнь", "Green"],
    ["Костер", "Bromus", "Кострец.", "Июнь", "Green"],
    ["Галинсога", "Galinsoga parviflora", "Американка.", "Лето", "White"],
    ["Щирица жминдовидная", "Amaranthus blitum", "Щирица.", "Лето", "Green"],
    ["Лебеда раскидистая", "Atriplex patula", "Лебеда.", "Лето", "Green"],
    ["Марь многосемянная", "Chenopodium polyspermum", "Марь.", "Лето", "Green"],
    ["Щавель малый", "Rumex acetosella", "Щавелёк.", "Май", "Red"],
    ["Щавель курчавый", "Rumex crispus", "Щавель курчавый.", "Июнь", "Green"],
    ["Горец вьюнковый", "Fallopia convolvulus", "Гречишка вьюнковая.", "Лето", "Green"],
    ["Горец земноводный", "Persicaria amphibia", "Горец amphibium.", "Лето", "Pink"],
    ["Щирица белая", "Amaranthus albus", "Щирица белая.", "Лето", "Green"],
    ["Белена чёрная", "Hyoscyamus niger", "Ядовитый сорняк.", "Лето", "Yellow"],
    ["Дурман обыкновенный", "Datura stramonium", "Сорняк полей.", "Лето", "White"],
    ["Паслён чёрный", "Solanum nigrum", "Паслён.", "Лето", "White"],
    ["Белокудренник", "Ballota nigra", "Чернокудренник.", "Лето", "Purple"],
    ["Яснотка пурпурная", "Lamium purpureum", "Глухая крапива.", "Весна", "Pink"],
    ["Яснотка белая", "Lamium album", "Белая глухая крапива.", "Весна", "White"],
    ["Пикульник", "Galeopsis", "Конопляник.", "Лето", "Pink"],
    ["Чистец", "Stachys", "Чистец однолетний.", "Лето", "Pink"],
    ["Вероника плющелистная", "Veronica hederifolia", "Вероника.", "Весна", "Blue"],
    ["Вероника персидская", "Veronica persica", "Вероника.", "Весна", "Blue"],
    ["Фиалка полевая", "Viola arvensis", "Анютины глазки полевые.", "Весна", "Yellow"],
    ["Фиалка трёхцветная", "Viola tricolor", "Иван-да-марья.", "Лето", "Purple"],
    ["Марь синяя", "Chenopodium glaucum", "Марь сизоватая.", "Лето", "Green"],
    ["Редька дикая", "Raphanus raphanistrum", "Редька полевая.", "Лето", "Yellow"],
    ["Горчица полевая", "Sinapis arvensis", "Горчица дикая.", "Лето", "Yellow"],
    ["Сурепка", "Barbarea vulgaris", "Сурепица.", "Май", "Yellow"],
    ["Пастушья сумка", "Capsella bursa-pastoris", "Торица.", "Лето", "White"],
    ["Ярутка полевая", "Thlaspi arvense", "Ярутка.", "Май", "White"],
    ["Резеда жёлтая", "Reseda lutea", "Резеда.", "Лето", "Yellow"],
    ["Подмаренник", "Galium", "Подмаренник цепкий.", "Лето", "White"],
    ["Вьюнок полевой", "Convolvulus arvensis", "Березка.", "Лето", "White"],
    ["Будра плющевидная", "Glechoma hederacea", "Собачья мята.", "Весна", "Purple"],
    ["Крапива жгучая", "Urtica urens", "Малая крапива.", "Лето", "Green"],
    ["Лебеда татарская", "Atriplex tatarica", "Лебеда.", "Лето", "Green"],
    ["Марь красная", "Chenopodium rubrum", "Марь краснеющая.", "Лето", "Green"],
    ["Осот полевой", "Sonchus arvensis", "Жёлтый осот.", "Лето", "Yellow"],
    ["Осот огородный", "Sonchus oleraceus", "Осот.", "Лето", "Yellow"],
    ["Бодяк полевой", "Cirsium arvense", "Розовый осот.", "Лето", "Purple"],
    ["Бодяк обыкновенный", "Cirsium vulgare", "Чертополох.", "Лето", "Purple"],
    ["Лопух паутинистый", "Arctium tomentosum", "Лопух.", "Лето", "Purple"],
    ["Чертополох курчавый", "Carduus crispus", "Чертополох.", "Лето", "Purple"],
    ["Василёк синий", "Centaurea cyanus", "Сорняк полей.", "Лето", "Blue"],
    ["Василёк луговой", "Centaurea jacea", "Василёк.", "Лето", "Purple"],
    ["Одуванчик осенний", "Scorzoneroides autumnalis", "Козлобородник.", "Осень", "Yellow"],
    ["Нивяник обыкновенный", "Leucanthemum vulgare", "Поповник.", "Лето", "White"],
    ["Полынь обыкновенная", "Artemisia vulgaris", "Чернобыльник.", "Июль", "Yellow"],
    ["Полынь горькая", "Artemisia absinthium", "Горькая полынь.", "Июль", "Yellow"],
    ["Пижма обыкновенная", "Tanacetum vulgare", "Дикая рябинка.", "Лето", "Yellow"],
    ["Тысячелистник обыкновенный", "Achillea millefolium", "Тысячелистник.", "Лето", "White"],
    ["Лапчатка гусиная", "Potentilla anserina", "Гусиная лапка.", "Лето", "Yellow"],
    ["Лапчатка ползучая", "Potentilla reptans", "Лапчатка.", "Лето", "Yellow"],
    ["Лютик ползучий", "Ranunculus repens", "Лютик.", "Май", "Yellow"],
    ["Лютик едкий", "Ranunculus acris", "Куриная слепота.", "Май", "Yellow"],
    ["Гравилат речной", "Geum rivale", "Гравилат.", "Май", "Pink"],
    ["Чистотел большой", "Chelidonium majus", "Бородавник.", "Май", "Yellow"],
    ["Молочай солнцегляд", "Euphorbia helioscopia", "Молочай.", "Лето", "Green"],
    ["Молочай острый", "Euphorbia esula", "Молочай.", "Лето", "Green"],
    ["Просвирник приземистый", "Malva neglecta", "Мальва.", "Лето", "Pink"],
    ["Просвирник лесной", "Malva sylvestris", "Мальва лесная.", "Лето", "Pink"],
    ["Хвощ полевой", "Equisetum arvense", "Хвощ.", "Весна", "Green"],
    ["Папоротник орляк", "Pteridium aquilinum", "Орляк.", "—", "Green"],
    ["Щетинник зелёный", "Setaria viridis", "Мышей зелёный.", "Лето", "Green"],
    ["Просо куриное", "Echinochloa crus-galli", "Ежовник обыкновенный.", "Лето", "Green"],
    ["Овсюг", "Avena fatua", "Овёс пустой.", "Июнь", "Green"],
    ["Плевел многолетний", "Lolium perenne", "Райграс.", "Июнь", "Green"],
    ["Кострец безостый", "Bromus inermis", "Кострец.", "Июнь", "Green"],
    ["Пырей ползучий", "Elymus repens", "Пырей.", "Июнь", "Green"],
    ["Ежовник обыкновенный", "Echinochloa crus-galli", "Куриное просо.", "Лето", "Green"],
    ["Лисохвост луговой", "Alopecurus pratensis", "Лисохвост.", "Июнь", "Green"],
    ["Овсяница луговая", "Festuca pratensis", "Овсяница.", "Июнь", "Green"],
    ["Ежа сборная", "Dactylis glomerata", "Ежа.", "Июнь", "Green"],
    ["Мятлик луговой", "Poa pratensis", "Мятлик.", "Май", "Green"],
    ["Горошек мышиный", "Vicia cracca", "Мышиный горошек.", "Июнь", "Purple"],
];

// Дополняем Сорняки до 100 (только реальные виды)
function padWeedsTo100(): PlantTuple[] {
    return [...WEEDS_TUPLES].slice(0, 100);
}

/** Детерминированный shuffle по seed (для геолокации). */
function seededShuffle<T>(arr: T[], seed: number): T[] {
    const out = [...arr];
    let s = seed;
    for (let i = out.length - 1; i > 0; i--) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const j = s % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function dedupeByName(plants: CatalogPlant[]): CatalogPlant[] {
    const seen = new Set<string>();
    return plants.filter((p) => {
        const key = p.commonName.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function buildAllPools(): Record<string, CatalogPlant[]> {
    const poisonous = dedupeByName(buildCategory(POISONOUS_TUPLES.slice(0, 100)));
    const indoor = dedupeByName(buildCategory(padIndoorTo100()));
    const flowers = dedupeByName(buildCategory(padFlowersTo100()));
    const allergens = dedupeByName(buildCategory(padAllergensTo100()));
    const trees = dedupeByName(buildCategory(padTreesTo100()));
    const weeds = dedupeByName(buildCategory(padWeedsTo100()));
    return {
        "Ядовитые": poisonous,
        "Домашние": indoor,
        "Цветы": flowers,
        "Аллергены": allergens,
        "Деревья": trees,
        "Сорняки": weeds,
    };
}

const ALL_POOLS = buildAllPools();

type DiscoverTranslation = { commonName: string; description: string; floweringTime: string; flowerColor: string };

/** Переводы Discover по языкам (ключ — scientificName в нижнем регистре). ru — базовые данные в пуле. */
const DISCOVER_EN: Record<string, DiscoverTranslation> = {
    'datura stramonium': { commonName: 'Jimsonweed', description: 'Large white or purple trumpet-shaped flowers; all parts are toxic — alkaloids cause hallucinations and severe poisoning.', floweringTime: 'Summer', flowerColor: 'White' },
    'heracleum sosnowskyi': { commonName: 'Giant hogweed', description: 'Large umbel perennial with hollow stem; sap and pollen contain furanocoumarins — cause severe skin burns in sunlight.', floweringTime: 'Summer', flowerColor: 'White' },
    'colchicum autumnale': { commonName: 'Autumn crocus', description: 'Low plant with purple crocus-like flowers; blooms in autumn. All parts toxic due to colchicine.', floweringTime: 'Autumn', flowerColor: 'Purple' },
    'nerium oleander': { commonName: 'Oleander', description: 'Evergreen shrub with fragrant pink or white flowers; all parts toxic — dangerous to people and animals if ingested.', floweringTime: 'Summer', flowerColor: 'Pink' },
    'dieffenbachia': { commonName: 'Dumb cane', description: 'Popular houseplant with large variegated leaves; sap causes mouth and skin burns, possible swelling.', floweringTime: 'Spring', flowerColor: 'White' },
    'digitalis purpurea': { commonName: 'Foxglove', description: 'Tall spikes of bell-shaped flowers; contains cardiac glycosides — dangerous if ingested, used in medicine in small doses.', floweringTime: 'Summer', flowerColor: 'Purple' },
    'ricinus communis': { commonName: 'Castor bean', description: 'Large palmate leaves and spiny seed pods; seeds contain ricin — one of the strongest plant toxins even in small amounts.', floweringTime: 'Summer', flowerColor: 'Red' },
    'convallaria majalis': { commonName: 'Lily of the valley', description: 'Fragrant white bells and red berries; all parts contain cardiac glycosides — berries especially dangerous for children.', floweringTime: 'May', flowerColor: 'White' },
    'daphne mezereum': { commonName: 'February daphne', description: 'Low shrub, flowers before leaves; bark, leaves and bright red berries are poisonous.', floweringTime: 'Spring', flowerColor: 'Pink' },
    'hyoscyamus niger': { commonName: 'Henbane', description: 'Greyish leaves and dull yellow flowers with purple veins; all parts contain alkaloids — severe poisoning, hallucinations.', floweringTime: 'Summer', flowerColor: 'Yellow' },
    'atropa belladonna': { commonName: 'Deadly nightshade', description: 'Large dark purple flowers and black shiny berries; atropine and other alkaloids — severe poisoning, can be fatal.', floweringTime: 'Summer', flowerColor: 'Purple' },
    'dictamnus albus': { commonName: 'Burning bush', description: 'Tall plant with pinkish-white flowers; essential oils and furanocoumarins cause skin burns on contact in sunshine.', floweringTime: 'June', flowerColor: 'White' },
    'aconitum napellus': { commonName: 'Monkshood', description: 'Dark blue hood-shaped flowers on tall stem; one of the most poisonous species — aconitine affects nerves and heart.', floweringTime: 'Summer', flowerColor: 'Blue' },
    'ranunculus acris': { commonName: 'Meadow buttercup', description: 'Bright yellow shiny flowers in meadows; sap contains protoanemonin — irritates skin and mucous membranes.', floweringTime: 'May', flowerColor: 'Yellow' },
    'euphorbia': { commonName: 'Spurge', description: 'Milky sap when broken; causes skin and mucous membrane burns, dangerous eye inflammation.', floweringTime: 'Spring', flowerColor: 'Green' },
    'paris quadrifolia': { commonName: 'Herb Paris', description: 'Single dark berry on stem top, four leaves in a whorl; berries and rhizome poisonous — saponins and alkaloids.', floweringTime: 'May', flowerColor: 'Green' },
    'conium maculatum': { commonName: 'Poison hemlock', description: 'Tall umbel with reddish spots on stem; coniine and other alkaloids — paralysis, used in antiquity for executions.', floweringTime: 'Summer', flowerColor: 'White' },
    'chelidonium majus': { commonName: 'Greater celandine', description: 'Yellow sap when broken, yellow flowers; alkaloids toxic in large doses, used in folk medicine in small doses.', floweringTime: 'May', flowerColor: 'Yellow' },
    'sambucus racemosa': { commonName: 'Red elderberry', description: 'Shrub with red berry clusters; unripe berries and seeds poisonous — cause nausea and vomiting.', floweringTime: 'May', flowerColor: 'White' },
    'solanum dulcamara': { commonName: 'Bittersweet nightshade', description: 'Vine with purple flowers and red berries; solanine and other glycosides — poisoning if berries eaten.', floweringTime: 'Summer', flowerColor: 'Purple' },
    'cicuta virosa': { commonName: 'Water hemlock', description: 'Umbelliferous plant by water; rhizome contains cicutoxin — one of the strongest plant poisons.', floweringTime: 'Summer', flowerColor: 'White' },
    'polygonatum': { commonName: 'Solomon\'s seal', description: 'Shade-loving plant with white bells and blue berries; saponins in berries and rhizome cause poisoning.', floweringTime: 'May', flowerColor: 'White' },
    'actaea spicata': { commonName: 'Baneberry', description: 'Spikes of white flowers and black shiny berries; berries and sap poisonous.', floweringTime: 'June', flowerColor: 'White' },
    'lonicera xylosteum': { commonName: 'Fly honeysuckle', description: 'Shrub with paired red berries; berries bitter and poisonous.', floweringTime: 'May', flowerColor: 'Yellow' },
    'frangula alnus': { commonName: 'Alder buckthorn', description: 'Shrub with small flowers and black berries; bark and berries mildly toxic.', floweringTime: 'May', flowerColor: 'Green' },
    'helleborus': { commonName: 'Hellebore', description: 'Early-flowering plant with large flowers; all parts contain glycosides — poisonous if ingested.', floweringTime: 'Spring', flowerColor: 'Green' },
    'datura': { commonName: 'Thorn apple', description: 'Large funnel-shaped flowers and spiny pods; alkaloids cause hallucinations and poisoning.', floweringTime: 'Summer', flowerColor: 'White' },
    'aconitum': { commonName: 'Monkshood', description: 'Tall plant with blue or purple hood-shaped flowers; aconitine and other alkaloids — highly poisonous.', floweringTime: 'Summer', flowerColor: 'Blue' },
    'veratrum': { commonName: 'False hellebore', description: 'Large leaves and panicles of white or greenish flowers; rhizome and leaves contain alkaloids.', floweringTime: 'Summer', flowerColor: 'Green' },
    'conium': { commonName: 'Hemlock', description: 'Umbelliferous plant with spotted stem; coniine and other alkaloids — paralysis and poisoning.', floweringTime: 'Summer', flowerColor: 'White' },
    'solanum nigrum': { commonName: 'Black nightshade', description: 'Unripe berries are poisonous.', floweringTime: 'Summer', flowerColor: 'White' },
    'calla palustris': { commonName: 'Bog arum', description: 'Poisonous wetland plant.', floweringTime: 'May', flowerColor: 'White' },
    'rhododendron tomentosum': { commonName: 'Wild rosemary', description: 'Essential oils are toxic.', floweringTime: 'May', flowerColor: 'White' },
    'rhododendron': { commonName: 'Rhododendron', description: 'Leaves and nectar are poisonous.', floweringTime: 'May', flowerColor: 'Pink' },
    'hydrangea': { commonName: 'Hydrangea', description: 'Contains cyanogenic glycosides.', floweringTime: 'Summer', flowerColor: 'Blue' },
    'taxus baccata': { commonName: 'Yew', description: 'Needles and seeds are poisonous.', floweringTime: 'Spring', flowerColor: 'Green' },
    'thuja': { commonName: 'Arborvitae', description: 'Oils irritate skin.', floweringTime: 'Spring', flowerColor: 'Green' },
    'buxus sempervirens': { commonName: 'Boxwood', description: 'All parts poisonous.', floweringTime: 'Spring', flowerColor: 'Green' },
    'monstera deliciosa': { commonName: 'Monstera', description: 'Tropical houseplant with split leaves.', floweringTime: 'Summer', flowerColor: 'White' },
    'pilea peperomioides': { commonName: 'Chinese money plant', description: 'Round leaves on long petioles.', floweringTime: 'Summer', flowerColor: 'Green' },
    'epipremnum aureum': { commonName: 'Pothos', description: 'Climbing vine with heart-shaped leaves.', floweringTime: 'Summer', flowerColor: 'Green' },
    'sansevieria trifasciata': { commonName: 'Snake plant', description: 'Upright leaves with banded pattern.', floweringTime: 'Spring', flowerColor: 'Green' },
    'ficus elastica': { commonName: 'Rubber plant', description: 'Large glossy leaves.', floweringTime: 'Summer', flowerColor: 'Green' },
    'rosa': { commonName: 'Rose', description: 'Thorny shrub with fragrant flowers.', floweringTime: 'Summer', flowerColor: 'Pink' },
    'tulipa': { commonName: 'Tulip', description: 'Bulb with cup-shaped flowers.', floweringTime: 'Spring', flowerColor: 'Yellow' },
    'salix alba': { commonName: 'White willow', description: 'Tree with narrow leaves by rivers and ponds.', floweringTime: 'April', flowerColor: 'Yellow' },
    'betula pendula': { commonName: 'Silver birch', description: 'Deciduous tree with white bark.', floweringTime: 'Spring', flowerColor: 'Green' },
    'quercus robur': { commonName: 'Oak', description: 'Large deciduous tree.', floweringTime: 'Spring', flowerColor: 'Green' },
    'taraxacum officinale': { commonName: 'Dandelion', description: 'Yellow composite flowers, wind-dispersed seeds.', floweringTime: 'Spring', flowerColor: 'Yellow' },
    'urtica dioica': { commonName: 'Stinging nettle', description: 'Hairy leaves that sting on contact.', floweringTime: 'Summer', flowerColor: 'Green' },
};

const DISCOVER_DE: Record<string, DiscoverTranslation> = {
    'datura stramonium': { commonName: 'Stechapfel', description: 'Große weiße oder violette Trichterblüten; alle Teile giftig — Alkaloide verursachen Halluzinationen und schwere Vergiftungen.', floweringTime: 'Sommer', flowerColor: 'White' },
    'heracleum sosnowskyi': { commonName: 'Riesen-Bärenklau', description: 'Große Doldenstaude mit hohlem Stängel; Saft und Pollen enthalten Furocumarine — schwere Hautverbrennungen in der Sonne.', floweringTime: 'Sommer', flowerColor: 'White' },
    'colchicum autumnale': { commonName: 'Herbstzeitlose', description: 'Niedrige Pflanze mit krokusähnlichen violetten Blüten; blüht im Herbst. Alle Teile durch Colchicin giftig.', floweringTime: 'Herbst', flowerColor: 'Purple' },
    'nerium oleander': { commonName: 'Oleander', description: 'Immergrüner Strauch mit duftenden rosa oder weißen Blüten; alle Teile giftig — gefährlich für Menschen und Tiere.', floweringTime: 'Sommer', flowerColor: 'Pink' },
    'dieffenbachia': { commonName: 'Dieffenbachie', description: 'Beliebte Zimmerpflanze mit großen bunten Blättern; Saft verursacht Mund- und Hautverbrennungen.', floweringTime: 'Frühling', flowerColor: 'White' },
    'digitalis purpurea': { commonName: 'Roter Fingerhut', description: 'Hohe Glockenblüten; enthält Herzglykoside — giftig bei Verzehr, in kleinen Dosen medizinisch genutzt.', floweringTime: 'Sommer', flowerColor: 'Purple' },
    'ricinus communis': { commonName: 'Rizinus', description: 'Große handförmige Blätter und stachlige Samenkapseln; Samen enthalten Ricin — eines der stärksten Pflanzengifte.', floweringTime: 'Sommer', flowerColor: 'Red' },
    'convallaria majalis': { commonName: 'Maiglöckchen', description: 'Duftende weiße Glocken und rote Beeren; alle Teile enthalten Herzglykoside — Beeren besonders gefährlich für Kinder.', floweringTime: 'Mai', flowerColor: 'White' },
    'atropa belladonna': { commonName: 'Tollkirsche', description: 'Große dunkelviolette Blüten und schwarze Beeren; Atropin und andere Alkaloide — schwere Vergiftung, kann tödlich sein.', floweringTime: 'Sommer', flowerColor: 'Purple' },
    'aconitum napellus': { commonName: 'Blauer Eisenhut', description: 'Dunkelblaue helmförmige Blüten; einer der giftigsten Arten — Aconitin wirkt auf Nerven und Herz.', floweringTime: 'Sommer', flowerColor: 'Blue' },
    'conium maculatum': { commonName: 'Gefleckter Schierling', description: 'Hohe Dolden mit rötlichen Flecken am Stängel; Coniin — Lähmung, in der Antike für Hinrichtungen genutzt.', floweringTime: 'Sommer', flowerColor: 'White' },
    'solanum nigrum': { commonName: 'Schwarzer Nachtschatten', description: 'Unreife Beeren sind giftig.', floweringTime: 'Sommer', flowerColor: 'White' },
    'rhododendron': { commonName: 'Rhododendron', description: 'Blätter und Nektar sind giftig.', floweringTime: 'Mai', flowerColor: 'Pink' },
    'hydrangea': { commonName: 'Hortensie', description: 'Enthält cyanogene Glykoside.', floweringTime: 'Sommer', flowerColor: 'Blue' },
    'taxus baccata': { commonName: 'Eibe', description: 'Nadeln und Samen sind giftig.', floweringTime: 'Frühling', flowerColor: 'Green' },
    'monstera deliciosa': { commonName: 'Monstera', description: 'Tropische Zimmerpflanze mit geteilten Blättern.', floweringTime: 'Sommer', flowerColor: 'White' },
    'pilea peperomioides': { commonName: 'Ufopflanze', description: 'Runde Blätter an langen Stielen.', floweringTime: 'Sommer', flowerColor: 'Green' },
    'rosa': { commonName: 'Rose', description: 'Dorniger Strauch mit duftenden Blüten.', floweringTime: 'Sommer', flowerColor: 'Pink' },
    'tulipa': { commonName: 'Tulpe', description: 'Zwiebel mit kelchförmigen Blüten.', floweringTime: 'Frühling', flowerColor: 'Yellow' },
    'salix alba': { commonName: 'Silber-Weide', description: 'Baum mit schmalen Blättern an Flüssen und Teichen.', floweringTime: 'April', flowerColor: 'Yellow' },
    'betula pendula': { commonName: 'Hänge-Birke', description: 'Laubbaum mit weißer Rinde.', floweringTime: 'Frühling', flowerColor: 'Green' },
    'quercus robur': { commonName: 'Stiel-Eiche', description: 'Großer Laubbaum.', floweringTime: 'Frühling', flowerColor: 'Green' },
    'taraxacum officinale': { commonName: 'Löwenzahn', description: 'Gelbe Korbblüten, windverbreitete Samen.', floweringTime: 'Frühling', flowerColor: 'Yellow' },
    'urtica dioica': { commonName: 'Große Brennnessel', description: 'Brennhaare an Blättern.', floweringTime: 'Sommer', flowerColor: 'Green' },
};

const DISCOVER_FR: Record<string, DiscoverTranslation> = {
    'datura stramonium': { commonName: 'Stramoine', description: 'Grandes fleurs en trompette blanches ou violettes; toutes les parties sont toxiques — alcaloïdes provoquant hallucinations et intoxication grave.', floweringTime: 'Été', flowerColor: 'White' },
    'heracleum sosnowskyi': { commonName: 'Berce du Caucase', description: 'Grande ombellifère à tige creuse; la sève et le pollen contiennent des furocoumarines — brûlures cutanées graves au soleil.', floweringTime: 'Été', flowerColor: 'White' },
    'colchicum autumnale': { commonName: 'Colchique', description: 'Plante basse à fleurs violettes en crocus; fleurit en automne. Toutes les parties toxiques (colchicine).', floweringTime: 'Automne', flowerColor: 'Purple' },
    'nerium oleander': { commonName: 'Laurier-rose', description: 'Arbuste à fleurs roses ou blanches parfumées; toutes les parties toxiques — dangereux pour l\'homme et les animaux.', floweringTime: 'Été', flowerColor: 'Pink' },
    'dieffenbachia': { commonName: 'Dieffenbachia', description: 'Plante d\'intérieur à grandes feuilles panachées; la sève provoque brûlures buccales et cutanées.', floweringTime: 'Printemps', flowerColor: 'White' },
    'digitalis purpurea': { commonName: 'Digitale pourpre', description: 'Grandes hampes de fleurs en cloche; contient des glycosides cardiaques — dangereux si ingéré, utilisé en médecine à faible dose.', floweringTime: 'Été', flowerColor: 'Purple' },
    'ricinus communis': { commonName: 'Ricin', description: 'Grandes feuilles palmées et capsules épineuses; les graines contiennent la ricine — l\'un des poisons végétaux les plus puissants.', floweringTime: 'Été', flowerColor: 'Red' },
    'convallaria majalis': { commonName: 'Muguet', description: 'Clochettes blanches parfumées et baies rouges; toutes les parties contiennent des glycosides cardiaques — baies dangereuses pour les enfants.', floweringTime: 'Mai', flowerColor: 'White' },
    'atropa belladonna': { commonName: 'Belladone', description: 'Grandes fleurs violet foncé et baies noires; atropine et autres alcaloïdes — intoxication grave, peut être mortelle.', floweringTime: 'Été', flowerColor: 'Purple' },
    'aconitum napellus': { commonName: 'Aconit napel', description: 'Fleurs bleues en casque; l\'une des espèces les plus toxiques — aconitine agit sur les nerfs et le cœur.', floweringTime: 'Été', flowerColor: 'Blue' },
    'conium maculatum': { commonName: 'Grande ciguë', description: 'Grande ombellifère à tige tachetée; conine et autres alcaloïdes — paralysie.', floweringTime: 'Été', flowerColor: 'White' },
    'solanum nigrum': { commonName: 'Morelle noire', description: 'Les baies immatures sont toxiques.', floweringTime: 'Été', flowerColor: 'White' },
    'rhododendron': { commonName: 'Rhododendron', description: 'Feuilles et nectar toxiques.', floweringTime: 'Mai', flowerColor: 'Pink' },
    'hydrangea': { commonName: 'Hortensia', description: 'Contient des glycosides cyanogènes.', floweringTime: 'Été', flowerColor: 'Blue' },
    'taxus baccata': { commonName: 'If', description: 'Aiguilles et graines toxiques.', floweringTime: 'Printemps', flowerColor: 'Green' },
    'monstera deliciosa': { commonName: 'Monstera', description: 'Plante tropicale à feuilles découpées.', floweringTime: 'Été', flowerColor: 'White' },
    'pilea peperomioides': { commonName: 'Plante du missionnaire', description: 'Feuilles rondes à longs pétioles.', floweringTime: 'Été', flowerColor: 'Green' },
    'rosa': { commonName: 'Rose', description: 'Arbuste épineux à fleurs parfumées.', floweringTime: 'Été', flowerColor: 'Pink' },
    'tulipa': { commonName: 'Tulipe', description: 'Bulbe à fleurs en coupe.', floweringTime: 'Printemps', flowerColor: 'Yellow' },
    'salix alba': { commonName: 'Saule blanc', description: 'Arbre à feuilles étroites près des rivières et étangs.', floweringTime: 'Avril', flowerColor: 'Yellow' },
    'betula pendula': { commonName: 'Bouleau', description: 'Arbre à écorce blanche.', floweringTime: 'Printemps', flowerColor: 'Green' },
    'quercus robur': { commonName: 'Chêne pédonculé', description: 'Grand arbre à feuilles caduques.', floweringTime: 'Printemps', flowerColor: 'Green' },
    'taraxacum officinale': { commonName: 'Pissenlit', description: 'Fleurs jaunes composées, graines dispersées par le vent.', floweringTime: 'Printemps', flowerColor: 'Yellow' },
    'urtica dioica': { commonName: 'Ortie dioïque', description: 'Feuilles à poils urticants.', floweringTime: 'Été', flowerColor: 'Green' },
};

const DISCOVER_ES: Record<string, DiscoverTranslation> = {
    'datura stramonium': { commonName: 'Estramonio', description: 'Grandes flores en trompeta blancas o violetas; todas las partes son tóxicas — alcaloides causan alucinaciones e intoxicación grave.', floweringTime: 'Verano', flowerColor: 'White' },
    'heracleum sosnowskyi': { commonName: 'Heracleum gigante', description: 'Grande umbelífera de tallo hueco; savia y polen con furanocumarinas — quemaduras graves en la piel con el sol.', floweringTime: 'Verano', flowerColor: 'White' },
    'colchicum autumnale': { commonName: 'Cólquico', description: 'Planta baja con flores violetas tipo crocus; florece en otoño. Todas las partes tóxicas por colchicina.', floweringTime: 'Otoño', flowerColor: 'Purple' },
    'nerium oleander': { commonName: 'Adelfa', description: 'Arbusto perenne con flores rosas o blancas aromáticas; todas las partes tóxicas — peligroso para personas y animales.', floweringTime: 'Verano', flowerColor: 'Pink' },
    'dieffenbachia': { commonName: 'Dieffenbachia', description: 'Planta de interior con hojas grandes variegadas; la savia causa quemaduras en boca y piel.', floweringTime: 'Primavera', flowerColor: 'White' },
    'digitalis purpurea': { commonName: 'Dedalera', description: 'Altas espigas de flores acampanadas; contiene glucósidos cardíacos — peligrosa si se ingiere, usada en medicina a dosis bajas.', floweringTime: 'Verano', flowerColor: 'Purple' },
    'ricinus communis': { commonName: 'Ricino', description: 'Grandes hojas palmeadas y cápsulas espinosas; semillas con ricino — uno de los venenos vegetales más potentes.', floweringTime: 'Verano', flowerColor: 'Red' },
    'convallaria majalis': { commonName: 'Lirio de los valles', description: 'Campanillas blancas aromáticas y bayas rojas; todas las partes con glucósidos cardíacos — bayas peligrosas para niños.', floweringTime: 'Mayo', flowerColor: 'White' },
    'atropa belladonna': { commonName: 'Belladona', description: 'Grandes flores violeta oscuro y bayas negras; atropina y otros alcaloides — intoxicación grave, puede ser fatal.', floweringTime: 'Verano', flowerColor: 'Purple' },
    'aconitum napellus': { commonName: 'Acónito', description: 'Flores azules en forma de casco; una de las especies más venenosas — aconitina afecta nervios y corazón.', floweringTime: 'Verano', flowerColor: 'Blue' },
    'conium maculatum': { commonName: 'Cicuta', description: 'Grande umbelífera de tallo manchado; conina y otros alcaloides — parálisis.', floweringTime: 'Verano', flowerColor: 'White' },
    'solanum nigrum': { commonName: 'Hierba mora', description: 'Las bayas inmaduras son tóxicas.', floweringTime: 'Verano', flowerColor: 'White' },
    'rhododendron': { commonName: 'Rododendro', description: 'Hojas y néctar tóxicos.', floweringTime: 'Mayo', flowerColor: 'Pink' },
    'hydrangea': { commonName: 'Hortensia', description: 'Contiene glucósidos cianogénicos.', floweringTime: 'Verano', flowerColor: 'Blue' },
    'taxus baccata': { commonName: 'Tejo', description: 'Agujas y semillas tóxicas.', floweringTime: 'Primavera', flowerColor: 'Green' },
    'monstera deliciosa': { commonName: 'Monstera', description: 'Planta tropical de hojas divididas.', floweringTime: 'Verano', flowerColor: 'White' },
    'pilea peperomioides': { commonName: 'Planta del dinero china', description: 'Hojas redondas con peciolos largos.', floweringTime: 'Verano', flowerColor: 'Green' },
    'rosa': { commonName: 'Rosa', description: 'Arbusto espinoso de flores aromáticas.', floweringTime: 'Verano', flowerColor: 'Pink' },
    'tulipa': { commonName: 'Tulipán', description: 'Bulbo con flores en forma de copa.', floweringTime: 'Primavera', flowerColor: 'Yellow' },
    'salix alba': { commonName: 'Sauce blanco', description: 'Árbol de hojas estrechas junto a ríos y estanques.', floweringTime: 'Abril', flowerColor: 'Yellow' },
    'betula pendula': { commonName: 'Abedul', description: 'Árbol de corteza blanca.', floweringTime: 'Primavera', flowerColor: 'Green' },
    'quercus robur': { commonName: 'Roble', description: 'Gran árbol de hoja caduca.', floweringTime: 'Primavera', flowerColor: 'Green' },
    'taraxacum officinale': { commonName: 'Diente de león', description: 'Flores amarillas compuestas, semillas dispersadas por el viento.', floweringTime: 'Primavera', flowerColor: 'Yellow' },
    'urtica dioica': { commonName: 'Ortiga', description: 'Hojas con pelos urticantes.', floweringTime: 'Verano', flowerColor: 'Green' },
};

const DISCOVER_BY_LANG: Partial<Record<Language, Record<string, DiscoverTranslation>>> = {
    en: DISCOVER_EN,
    de: DISCOVER_DE,
    fr: DISCOVER_FR,
    es: DISCOVER_ES,
};

/** Подставляет время цветения и цвет цветка из статического словаря только если в API не пришли (приоритет у API). */
function enrichRegionalFromStatic(plants: CatalogPlant[], lang: Language): CatalogPlant[] {
    const dict = DISCOVER_BY_LANG[lang] || DISCOVER_BY_LANG['en'];
    if (!dict) return plants;
    return plants.map((p) => {
        const key = (p.scientificName || '').trim().toLowerCase();
        const tr = dict[key];
        if (!tr) return p;
        const hasApiFlowering = (p.floweringTime ?? '').trim() && p.floweringTime !== '—';
        const hasApiColor = (p.flowerColor ?? '').trim() && p.flowerColor !== '—';
        return {
            ...p,
            floweringTime: hasApiFlowering ? p.floweringTime : (tr.floweringTime || p.floweringTime),
            flowerColor: hasApiColor ? p.flowerColor : (tr.flowerColor || p.flowerColor),
        };
    });
}

/** Применяет переводы и оставляет только растения, для которых есть перевод — в Discover только выбранный язык. Региональную категорию не трогаем (данные уже с API на нужном языке). */
function applyDiscoverLanguage(pools: Record<string, CatalogPlant[]>, lang: Language): Record<string, CatalogPlant[]> {
    const dict = DISCOVER_BY_LANG[lang];
    const out: Record<string, CatalogPlant[]> = {};
    for (const cat of Object.keys(pools)) {
        if (cat === REGIONAL_FLORA_CATEGORY_KEY) {
            out[cat] = pools[cat];
            continue;
        }
        if (!dict) {
            out[cat] = pools[cat];
            continue;
        }
        out[cat] = pools[cat]
            .map((p) => {
                const key = (p.scientificName || '').trim().toLowerCase();
                const tr = dict[key];
                if (!tr) return null;
                return { ...p, commonName: tr.commonName, description: tr.description, floweringTime: tr.floweringTime, flowerColor: tr.flowerColor };
            })
            .filter((p): p is CatalogPlant => p !== null);
    }
    return out;
}

/** Ключи только статических категорий (без региональной). */
const STATIC_CATEGORY_KEYS = ['Ядовитые', 'Домашние', 'Цветы', 'Аллергены', 'Деревья', 'Сорняки'] as const;

/** Уникальность по ключу commonName|scientificName для FlatList (избегаем дублей в UI). */
function dedupeByPlantKey(plants: CatalogPlant[]): CatalogPlant[] {
    const seen = new Set<string>();
    return plants.filter((p) => {
        const k = `${(p.commonName || '').trim()}|${(p.scientificName || '').trim()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

/**
 * Возвращает пул растений по категориям. При переданных lat, lon категория «Флора региона»:
 * — при наличии интернета — из API iNaturalist;
 * — при отсутствии интернета — только из закэшированного пула (если есть).
 */
export async function getDiscoverPool(lat?: number, lon?: number, language?: Language): Promise<Record<string, CatalogPlant[]>> {
    const lang = language || 'en';
    let pools: Record<string, CatalogPlant[]>;
    if (lat == null || lon == null) {
        pools = { [REGIONAL_FLORA_CATEGORY_KEY]: [], ...ALL_POOLS };
    } else {
        const seed = Math.floor((lat * 1e6 + lon * 1e3) % 0x7fffffff);
        const netState = await NetInfo.fetch();
        let regional: CatalogPlant[];
        if (!netState.isConnected) {
            const cacheKey = buildCacheKey(lat, lon, lang);
            regional = regionalCache?.key === cacheKey ? regionalCache.plants : [];
        } else {
            regional = await fetchRegionalPlantsFromiNaturalist(lat, lon, lang);
        }
        regional = enrichRegionalFromStatic(dedupeByPlantKey(regional), lang);
        await enrichPlantsFromWikipedia(regional, 45);
        pools = { [REGIONAL_FLORA_CATEGORY_KEY]: regional };
        for (const cat of STATIC_CATEGORY_KEYS) {
            pools[cat] = dedupeByPlantKey(seededShuffle(ALL_POOLS[cat], seed + cat.length));
        }
    }
    const withLang = language ? applyDiscoverLanguage(pools, language) : pools;
    const deduped: Record<string, CatalogPlant[]> = {};
    for (const cat of Object.keys(withLang)) {
        deduped[cat] = dedupeByPlantKey(withLang[cat]);
    }
    return deduped;
}
