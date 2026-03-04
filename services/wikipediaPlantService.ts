/**
 * Подстановка времени цветения и цвета цветка из Wikipedia (краткое описание страницы)
 * для растений, у которых эти поля не заполнены из API.
 */

const WIKI_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const USER_AGENT = 'PlantLens/1.0 (https://plantlens.app)';
const WIKI_FETCH_TIMEOUT_MS = 6000;

const COLOR_WORDS = ['white', 'yellow', 'red', 'pink', 'blue', 'purple', 'green', 'orange', 'violet', 'cream', 'brown', 'lavender', 'magenta', 'gold', 'crimson', 'salmon', 'teal', 'cyan', 'black', 'maroon', 'burgundy', 'lilac'];
const SEASON_WORDS = ['spring', 'summer', 'autumn', 'fall', 'winter'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_TO_SEASON: Record<string, string> = {
    january: 'Winter', february: 'Winter', march: 'Spring', april: 'Spring', may: 'Spring',
    june: 'Summer', july: 'Summer', august: 'Summer', september: 'Autumn', october: 'Autumn',
    november: 'Autumn', december: 'Winter',
};

/** Максимальная длина описания в карточке (6 строк, ~35 символов/строка). */
const MAX_DESCRIPTION_LENGTH = 210;

export interface WikipediaTraits {
    floweringTime?: string;
    flowerColor?: string;
    /** Краткое описание особенностей растения из Wikipedia extract. */
    description?: string;
}

function truncateToWord(text: string, maxLen: number): string {
    const t = text.trim();
    if (t.length <= maxLen) return t;
    const cut = t.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + (t.length > maxLen ? '…' : '');
}

function normalizeColor(word: string): string {
    const w = word.toLowerCase().replace(/-ish$/, '');
    const map: Record<string, string> = {
        lavender: 'Lavender', violet: 'Violet', magenta: 'Magenta', cream: 'Cream',
        crimson: 'Crimson', burgundy: 'Burgundy', maroon: 'Maroon', lilac: 'Lilac', salmon: 'Salmon', teal: 'Teal', cyan: 'Cyan',
    };
    if (map[w]) return map[w];
    return word.charAt(0).toUpperCase() + (word.slice(1).toLowerCase().replace(/-ish$/, ''));
}

function extractFlowerColor(extract: string): string | undefined {
    const lower = extract.toLowerCase();
    const extractSlice = lower.slice(0, 600);
    for (const color of COLOR_WORDS) {
        const re = new RegExp(`(?:flower|bloom|petal|corolla)[s]?\\s*(?:are|is)?\\s*${color}\\b|\\b${color}\\s*(?:flower|bloom|petal)`, 'i');
        if (re.test(extract)) return normalizeColor(color);
    }
    for (const color of COLOR_WORDS) {
        if (extractSlice.includes(` ${color} `) || extractSlice.includes(` ${color},`) || extractSlice.includes(` ${color}.`) || extractSlice.includes(`${color}ish`)) {
            const colorPos = lower.indexOf(color);
            const near = extract.slice(Math.max(0, colorPos - 100), colorPos + 100);
            if (/flower|bloom|petal|corolla|inflorescence/.test(near)) return normalizeColor(color);
        }
    }
    let bestColor: string | undefined;
    let bestPos = Infinity;
    for (const color of COLOR_WORDS) {
        const idx = lower.indexOf(color);
        if (idx === -1) continue;
        const near = lower.slice(Math.max(0, idx - 60), idx + 60);
        if (/flower|bloom|petal|leaf|plant|species|herb|shrub|tree/.test(near) && idx < bestPos) {
            bestPos = idx;
            bestColor = color;
        }
    }
    if (bestColor) return normalizeColor(bestColor);
    const first500 = lower.slice(0, 500);
    for (const color of COLOR_WORDS) {
        const re = new RegExp(`\\b${color}\\b|\\b${color}ish\\b`);
        if (re.test(first500)) return normalizeColor(color);
    }
    return undefined;
}

function extractFloweringTime(extract: string): string | undefined {
    const lower = extract.toLowerCase();
    for (const season of SEASON_WORDS) {
        const re = new RegExp(`(?:flower|bloom)[s]?\\s*(?:in|from|during)\\s*${season}|${season}\\s*(?:to|and|-)\\s*(?:early\\s+)?(?:spring|summer|autumn|fall|winter)`, 'i');
        if (re.test(extract)) return season.charAt(0).toUpperCase() + season.slice(1);
    }
    for (const season of SEASON_WORDS) {
        if (lower.includes(season)) return season.charAt(0).toUpperCase() + season.slice(1);
    }
    for (let i = 0; i < MONTHS.length; i++) {
        if (lower.includes(MONTHS[i])) return MONTH_TO_SEASON[MONTHS[i]];
    }
    return undefined;
}

async function fetchWikiOnce(scientificName: string, title: string): Promise<WikipediaTraits> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WIKI_FETCH_TIMEOUT_MS);
    const res = await fetch(`${WIKI_SUMMARY}${title}`, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
        signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return {};
    const data = await res.json();
    const extract = (data.extract ?? '') as string;
    if (!extract) return {};
    const floweringTime = extractFloweringTime(extract);
    const flowerColor = extractFlowerColor(extract);
    const description = extract.length >= 40 ? truncateToWord(extract, MAX_DESCRIPTION_LENGTH) : undefined;
    return { floweringTime, flowerColor, description };
}

/**
 * Запрашивает краткое описание страницы Wikipedia по научному названию
 * и извлекает время цветения и цвет цветка из текста. Один повтор при сбое.
 */
export async function fetchPlantTraitsFromWikipedia(scientificName: string): Promise<WikipediaTraits> {
    if (!scientificName?.trim()) return {};
    const title = encodeURIComponent(scientificName.trim().replace(/\s+/g, '_'));
    try {
        return await fetchWikiOnce(scientificName, title);
    } catch (_e) {
        await new Promise((r) => setTimeout(r, 350));
        try {
            return await fetchWikiOnce(scientificName, title);
        } catch (_e2) {
            return {};
        }
    }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Обогащает растения недостающими floweringTime, flowerColor и description из Wikipedia.
 * Описание — краткий текст об особенностях растения из Wikipedia.
 * Обрабатывает не более limit растений (приоритет: с пустыми полями), с паузой между запросами.
 */
export async function enrichPlantsFromWikipedia(
    plants: Array<{ floweringTime?: string; flowerColor?: string; description?: string; scientificName?: string }>,
    limit: number = 20
): Promise<void> {
    const needEnrich = plants.filter(
        (p) => ((p.floweringTime ?? '').trim() === '' || p.floweringTime === '—') ||
            ((p.flowerColor ?? '').trim() === '' || p.flowerColor === '—') ||
            !(p.description ?? '').trim() ||
            (p.description ?? '').includes('Species observed') ||
            (p.description ?? '').includes('Наблюдаемый в регионе') ||
            (p.description ?? '').includes('beobachtete Art') ||
            (p.description ?? '').includes('observée dans votre') ||
            (p.description ?? '').includes('observada en tu')
    );
    const missingColor = (p: typeof plants[0]) => (p.flowerColor ?? '').trim() === '' || p.flowerColor === '—';
    const sorted = [...needEnrich].sort((a, b) => (missingColor(a) === missingColor(b) ? 0 : missingColor(a) ? -1 : 1));
    const toFetch = sorted.slice(0, limit);
    for (const plant of toFetch) {
        const name = (plant.scientificName ?? '').trim();
        if (!name) continue;
        try {
            const traits = await fetchPlantTraitsFromWikipedia(name);
            if (traits.floweringTime && ((plant.floweringTime ?? '').trim() === '' || plant.floweringTime === '—')) {
                (plant as { floweringTime: string }).floweringTime = traits.floweringTime;
            }
            if (traits.flowerColor && ((plant.flowerColor ?? '').trim() === '' || plant.flowerColor === '—')) {
                (plant as { flowerColor: string }).flowerColor = traits.flowerColor;
            }
            if (traits.description && (traits.description.length >= 40)) {
                (plant as { description: string }).description = traits.description;
            }
        } catch (_e) {
            // один сбой не прерывает обогащение остальных
        }
        await delay(150);
    }
}
