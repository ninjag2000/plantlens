import { Plant } from '../types';
import type { TranslationKey } from './translations';

/** Config item for care reminders (key, actionType, defaultFreq). */
export interface ReminderConfigLike {
    key: string;
    actionType: string;
    defaultFreq: number;
}

/**
 * Overall health 0–100 from care schedule: average of per-task scores.
 * Same formula used on My Plants and Plant Detail so values match.
 */
export function calculateOverallHealth(
    plant: Plant,
    configs: ReminderConfigLike[]
): number {
    if (!plant || configs.length === 0) return 100;
    let totalScore = 0;
    let count = 0;
    configs.forEach(config => {
        const userRem = plant.reminders?.[config.key as keyof typeof plant.reminders];
        const freq = userRem?.frequency ?? config.defaultFreq;
        const lastAction = plant.careHistory?.find(h => h.type === config.actionType);
        const lastDate = lastAction ? new Date(lastAction.date) : new Date(plant.identificationDate);
        const daysPassed = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        const taskScore = Math.max(0, Math.min(100, 100 - (daysPassed / freq) * 100));
        totalScore += taskScore;
        count++;
    });
    return count > 0 ? Math.round(totalScore / count) : 100;
}

// Icon names for @expo/vector-icons (Ionicons)
const Icons = {
    Leaf: 'leaf-outline',
    Timer: 'timer-outline',
    Gauge: 'speedometer-outline',
    ShieldCheck: 'shield-checkmark-outline',
    AlertCircle: 'alert-circle-outline',
    ShieldX: 'shield-outline',
    Wind: 'cloudy-outline' as const, // Ionicons has no "wind"; use cloudy-outline for allergy/air
    Wheat: 'nutrition-outline',
    PawPrint: 'paw-outline',
    User: 'person-outline',
    Cloud: 'cloud-outline',
    Activity: 'pulse-outline',
    CheckCircle2: 'checkmark-circle-outline',
    AlertTriangle: 'warning-outline',
} as const;

export interface CareDifficultyResult {
    difficulty: number;
    maintenance: number;
    resilience: number;
    labelKey: 'diff_easy' | 'diff_medium' | 'diff_hard';
    color: string;
    bg: string;
    factors: {
        light: number;
        water: number;
        attention: number;
    };
    resilienceDetails: {
        drought: number;
        pest: number;
        climate: number;
        humidity: number;
    };
    maintenanceDetails: {
        frequency: number;
        nutrition: number;
        precision: number;
        pruning: number;
    };
}

export interface SafetyStatus {
    level: 0 | 1 | 2;
    labelKey: 'safety_safe' | 'safety_caution' | 'safety_toxic';
    style: string;
}

export type ClassificationLabelKey = 'tag_weed' | 'tag_cultivated' | 'tag_ornamental';

export interface ClassificationResult {
    labelKey: ClassificationLabelKey;
    icon: React.ElementType;
    style: string;
}

export const getClassification = (plant: Plant): ClassificationResult => {
    if (plant.isWeed?.toLowerCase().includes('yes')) return { labelKey: 'tag_weed', icon: Icons.AlertCircle, style: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20' };
    const desc = (plant.description + (plant.about || '')).toLowerCase();
    if (desc.includes('fruit') || desc.includes('harvest') || desc.includes('edible') || desc.includes('культур') || desc.includes('урожай')) {
        return { labelKey: 'tag_cultivated', icon: Icons.Wheat, style: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' };
    }
    return { labelKey: 'tag_ornamental', icon: Icons.Leaf, style: 'bg-blue-500/10 text-blue-700 border-blue-500/20' };
};

/** Оценка 0–100 по ключевым словам: каждая найденная фраза добавляет к базе. */
function scoreByKeywords(text: string, keywordsLow: string[], keywordsHigh: string[], base: number): number {
    const t = text.toLowerCase();
    if (keywordsHigh.some(k => t.includes(k))) return Math.min(98, base + 45);
    if (keywordsLow.some(k => t.includes(k))) return Math.max(5, base - 25);
    return base;
}

/** Собирает один текст из всех описательных полей растения. */
function fullText(plant: Plant): string {
    const parts = [
        plant.description ?? '',
        plant.about ?? '',
        plant.careTips?.watering ?? '',
        plant.careTips?.sunlight ?? '',
        plant.habitat ?? '',
        plant.adaptationStrategy ?? '',
        plant.plantType ?? '',
        (plant.pros ?? []).join(' '),
        (plant.cons ?? []).join(' '),
    ];
    return parts.join(' ').toLowerCase();
}

export const calculateCareDifficulty = (plant: Plant): CareDifficultyResult => {
    const sunlight = (plant.careTips?.sunlight ?? '').toString().toLowerCase();
    const watering = (plant.careTips?.watering ?? '').toString().toLowerCase();
    const desc = ((plant.description ?? '') + (plant.about ?? '')).toLowerCase();
    const text = fullText(plant);
    const plantType = (plant.plantType ?? '').toLowerCase();
    const habitat = (plant.habitat ?? '').toLowerCase();

    // —— Стойкость (resilience): засуха, климат, вредители, влажность ——
    const droughtBase = 55;
    const drought = scoreByKeywords(
        watering + ' ' + desc + ' ' + (plant.adaptationStrategy ?? ''),
        ['редко', 'rare', 'сух', 'dry', 'засух', 'drought', 'кактус', 'cactus', 'суккулент', 'сухой воздух'],
        ['частый', 'often', 'ежеднев', 'daily', 'постоянно влаж', 'moist', 'влажн', 'регулярный полив'],
        droughtBase
    );
    if (plantType.includes('суккулент') || plantType.includes('succulent')) {
        // уже может быть поднят по ключевым словам; суккуленты — засухоустойчивы
        // drought уже считается в scoreByKeywords по тексту
    }

    const climateBase = 50;
    const climate = scoreByKeywords(
        sunlight + ' ' + desc + ' ' + habitat,
        ['тень', 'shade', 'теневынос', 'low light', 'любой свет', 'any light', 'толерант', 'tolerate', 'hardy', 'мороз', 'frost'],
        ['строго', 'strictly', 'только яркий', 'only bright', 'обязателен прямой', 'must have direct'],
        climateBase
    );
    const climateBonus = (sunlight.includes('рассеян') || sunlight.includes('diffused') || sunlight.includes('indirect')) ? 25 : 0;
    const climateFinal = Math.min(95, Math.max(15, climate + climateBonus));

    const pestBase = 50;
    const pest = plant.isWeed?.toLowerCase().includes('yes') ? 85 : (plantType.includes('суккулент') || plantType.includes('succulent') ? 72 : pestBase);
    const pestFromDesc = (desc.includes('устойчив') || desc.includes('resistant') || text.includes('редко болеет')) ? 75 : pestBase;
    const pestFinal = Math.max(pest, pestFromDesc);

    const humidityBase = 50;
    const humidityRes = scoreByKeywords(
        desc + ' ' + (plant.adaptationStrategy ?? '') + ' ' + habitat,
        ['сухой воздух', 'dry air', 'низкая влажность', 'low humidity', 'не требует опрыск'],
        ['опрыскиван', 'misting', 'высокая влажность', 'high humidity', 'тропическ', 'tropical', 'влажный воздух'],
        humidityBase
    );

    const resilienceScore = Math.round(Math.min(98, Math.max(5, (drought + climateFinal + pestFinal + humidityRes) / 4)));

    // —— Уход (maintenance): частота полива, подкормка, точность, обрезка ——
    const waterFreqBase = 35;
    const waterFreq = scoreByKeywords(
        watering + ' ' + desc,
        ['редко', 'rare', 'раз в неделю', 'once a week', 'умерен', 'moderate', 'по мере подсых'],
        ['частый', 'often', 'ежеднев', 'daily', 'постоянно влаж', 'moist', 'не пересушив'],
        waterFreqBase
    );
    const waterFreqFinal = Math.min(92, Math.max(15, waterFreq));

    const nutritionNeeds = (desc.includes('цветен') || desc.includes('flowering') || desc.includes('быстро раст') || desc.includes('fast growing') || desc.includes('подкорм') || text.includes('heavy feeder')) ? 72 : 38;
    const precision = (sunlight.includes('строго') || sunlight.includes('strictly') || desc.includes('чувствитель') || desc.includes('sensitive') || desc.includes('сквозняк') || desc.includes('drafts')) ? 70 : 28;
    const pruningNeeds = (desc.includes('лиан') || desc.includes('vine') || desc.includes('дерев') || desc.includes('tree') || desc.includes('обрез') || desc.includes('pruning') || desc.includes('форм') || desc.includes('shape')) ? 65 : 22;

    const maintenanceScore = Math.round(Math.min(98, Math.max(5, (waterFreqFinal + nutritionNeeds + precision + pruningNeeds) / 4)));

    // —— Итоговая сложность: чем выше уход и ниже стойкость — тем сложнее ——
    const rawDifficulty = Math.round((maintenanceScore + (100 - resilienceScore)) / 2);
    const finalDifficulty = Math.min(98, Math.max(5, rawDifficulty));

    // Учёт «лёгкости» из pros / description для понижения индекса
    const easySignals = ['неприхотлив', 'unpretentious', 'легко', 'easy', 'простой уход', 'easy care', 'для начинающих', 'beginner', 'вынослив', 'hardy'];
    const hardSignals = ['каприз', 'капризн', 'требователь', 'demanding', 'сложн', 'difficult', 'опыт', 'experience'];
    const easyBonus = easySignals.some(k => text.includes(k)) ? -12 : 0;
    const hardBonus = hardSignals.some(k => text.includes(k)) ? 15 : 0;
    const difficultyAdjusted = Math.min(98, Math.max(5, finalDifficulty + easyBonus + hardBonus));

    let labelKey: 'diff_easy' | 'diff_medium' | 'diff_hard' = 'diff_easy';
    let color = 'text-green-500';
    let bg = 'bg-green-500/10';
    if (difficultyAdjusted > 65) {
        labelKey = 'diff_hard';
        color = 'text-red-500';
        bg = 'bg-red-500/10';
    } else if (difficultyAdjusted > 35) {
        labelKey = 'diff_medium';
        color = 'text-yellow-500';
        bg = 'bg-yellow-500/10';
    }

    const lightFactor = (sunlight.includes('ярк') || sunlight.includes('bright')) ? 78 : (sunlight.includes('тень') || sunlight.includes('shade')) ? 25 : 48;

    return {
        difficulty: difficultyAdjusted,
        maintenance: maintenanceScore,
        resilience: resilienceScore,
        labelKey,
        color,
        bg,
        factors: {
            light: lightFactor,
            water: waterFreqFinal,
            attention: maintenanceScore
        },
        resilienceDetails: { drought, pest: pestFinal, climate: climateFinal, humidity: humidityRes },
        maintenanceDetails: { frequency: waterFreqFinal, nutrition: nutritionNeeds, precision, pruning: pruningNeeds }
    };
};

export const getSafetyStatus = (text: string = ''): SafetyStatus => {
    const t = (text || '').toLowerCase();
    const safeStyle = 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
    const cautionStyle = 'bg-yellow-400/20 text-yellow-700 border-yellow-500/20';
    const toxicStyle = 'bg-red-500/10 text-red-700 border-red-500/20';

    const safeKeywords = [
        'not toxic', 'non-toxic', 'safe', 'edible', 'harmless', 'no known toxicity', 'pet friendly',
        'non-allergenic', 'hypoallergenic', 'no allergy',
        'не токсич', 'нетоксич', 'не ядовит', 'безопасн', 'съедобн', 'безвредн', 'не представляет опасности', 'не является ядовит', 'нет данных о токсичности',
        'не вызывает аллерг', 'гипоаллерген', 'нет аллерг', 'не является аллерг', 'не вызывает реакций', 'не является аллергеном',
        'низкая аллергенность', 'редко вызывает', 'безопасно', 'низкий риск', 'не является типичным аллергеном'
    ];
    if (safeKeywords.some(k => t.includes(k))) {
        return { level: 0, labelKey: 'safety_safe', style: safeStyle };
    }

    const toxicKeywords = [
        'toxic', 'poison', 'fatal', 'deadly', 'harmful', 'unsafe', 'dangerous', 'severe', 'paralysis',
        'ядовит', 'токсич', 'опасен', 'опасно', 'смертельн', 'вреден', 'вредно', 'угроз', 'яд', 'летальн', 'погиб'
    ];
    if (toxicKeywords.some(k => t.includes(k))) {
        return { level: 2, labelKey: 'safety_toxic', style: toxicStyle };
    }

    const cautionKeywords = [
        'irritat', 'caution', 'warning', 'vomit', 'stomach', 'rash', 'dermatitis', 'ingest', 'swallow', 'drool', 'mouth', 'gastro', 'mild', 'upset', 'diarrhea', 'nausea', 'discomfort', 'low toxicity', 'slightly toxic', 'burn', 'swelling',
        'раздражен', 'осторожн', 'рвот', 'диаре', 'желуд', 'дерматит', 'аллерг', 'проглатыван', 'слюн', 'жжение', 'отек', 'тошн', 'недомогани', 'расстройств'
    ];
    if (cautionKeywords.some(k => t.includes(k))) {
        return { level: 1, labelKey: 'safety_caution', style: cautionStyle };
    }

    return { level: 0, labelKey: 'safety_safe', style: safeStyle };
};

type PlantTypeLabelKey = Extract<TranslationKey, `tag_plant_type_${string}`>;

function getPlantTypeLabelKey(plantType: string): PlantTypeLabelKey | null {
    const lower = (plantType || '').toLowerCase().trim();
    if (lower === 'tree' || lower === 'дерево') return 'tag_plant_type_tree';
    if (lower === 'shrub' || lower === 'кустарник') return 'tag_plant_type_shrub';
    if (lower === 'herb' || lower === 'трава') return 'tag_plant_type_herb';
    if (lower === 'vine' || lower === 'лиана') return 'tag_plant_type_vine';
    if (lower === 'succulent' || lower === 'суккулент') return 'tag_plant_type_succulent';
    if (lower === 'fern' || lower === 'папоротник') return 'tag_plant_type_fern';
    if (lower === 'moss' || lower === 'мхи' || lower === 'мох') return 'tag_plant_type_moss';
    if (lower.includes('aquatic') || lower.includes('водн')) return 'tag_plant_type_aquatic';
    return null;
}

/** Returns translated plant type for display, or raw value if no key. */
export function getPlantTypeDisplayLabel(plantType: string | undefined, t: (key: TranslationKey) => string): string {
    if (!plantType?.trim()) return '—';
    const key = getPlantTypeLabelKey(plantType);
    return key ? t(key) : plantType;
}

type LifespanLabelKey = 'tag_lifespan_annual' | 'tag_lifespan_biennial' | 'tag_lifespan_evergreen' | 'tag_lifespan_perennial';

function getLifespanLabelKey(lifespan: string = ''): LifespanLabelKey {
    const lower = (lifespan || '').toLowerCase();
    if (lower.includes('однолет') || lower.includes('annual')) return 'tag_lifespan_annual';
    if (lower.includes('двулет') || lower.includes('biennial')) return 'tag_lifespan_biennial';
    if (lower.includes('вечнозелен') || lower.includes('evergreen')) return 'tag_lifespan_evergreen';
    return 'tag_lifespan_perennial';
}

/** Returns translated lifespan for display. */
export function getLifespanDisplayLabel(lifespan: string | undefined, t: (key: TranslationKey) => string): string {
    if (!lifespan?.trim()) return '—';
    return t(getLifespanLabelKey(lifespan));
}

/** Maps common RU/en data values to translated label for display (seasons, "No data", "Varies by species", etc.). */
export function translateDataValue(value: string | undefined, t: (key: TranslationKey) => string): string {
    if (!value?.trim()) return '—';
    const lower = value.toLowerCase().trim();
    if (lower.includes('нет дан') || lower === 'no data') return t('data_no_data');
    if (lower.includes('весна') || lower === 'spring') return t('season_spring');
    if (lower.includes('лето') || lower === 'summer') return t('season_summer');
    if (lower.includes('осен') || lower === 'autumn' || lower === 'fall') return t('season_autumn');
    if (lower.includes('зим') || lower === 'winter') return t('season_winter');
    if (lower.includes('зависит от вида') || lower.includes('varies by species') || lower.includes('depends on species')) return t('data_varies_by_species');
    if (lower.includes('не применимо') || lower.includes('n/a') || lower.includes('not applicable') || lower.includes('не образует')) return t('data_not_applicable');
    // Plant group (GROUP field)
    if (lower.includes('цветков') || lower === 'flowering') return t('data_group_flowering');
    if (lower.includes('хвойн') || lower.includes('conifer')) return t('data_group_conifer');
    if (lower.includes('папоротник') || lower === 'fern') return t('data_group_fern');
    if (lower.includes('мхи') || lower === 'moss' || lower === 'moos') return t('data_group_moss');
    if (lower.includes('водоросл') || lower.includes('algae') || lower.includes('algue')) return t('data_group_algae');
    return value;
}

export const getStandardPlantTags = (plant: Plant, t: (key: TranslationKey, replacements?: Record<string, string>) => string) => {
    const tags: { label: string; icon: string; style: string }[] = [];
    if (!plant) return tags;

    // Health Tag (Only for garden plants)
    if (plant.isInGarden) {
        if (!plant.latestDiagnosis) {
            tags.push({ 
                label: t('tag_diagnosis_needed'), 
                icon: Icons.Activity, 
                style: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-white/5 dark:text-gray-400 dark:border-white/10" 
            });
        } else {
            const isHealthy = plant.latestDiagnosis.isHealthy;
            tags.push({ 
                label: isHealthy ? t('tag_healthy') : t('tag_needs_treatment'), 
                icon: isHealthy ? Icons.CheckCircle2 : Icons.AlertTriangle, 
                style: isHealthy 
                    ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" 
                    : "bg-red-500/10 text-red-700 border-red-500/20" 
            });
        }
    }

    // 1. Care Difficulty
    try {
        const careData = calculateCareDifficulty(plant);
        const diffColor = careData.difficulty > 65 ? 'bg-red-500/10 text-red-700 border-red-500/20' : (careData.difficulty > 35 ? 'bg-yellow-400/20 text-yellow-700 border-yellow-500/20' : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20');
        tags.push({ label: t(careData.labelKey), icon: Icons.Gauge, style: diffColor });
    } catch (e) {}

    // 2. Plant Type (translated when known)
    if (plant.plantType) {
        const plantTypeKey = getPlantTypeLabelKey(plant.plantType);
        const label = plantTypeKey ? t(plantTypeKey) : plant.plantType;
        tags.push({ label, icon: Icons.Leaf, style: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20' });
    }

    // 3. Utility Tag
    try {
        const classification = getClassification(plant);
        tags.push({ label: t(classification.labelKey), icon: classification.icon, style: classification.style });
    } catch (e) {}
    
    // 4. Safety Tags
    if (plant.safety) {
        const humanTox = getSafetyStatus(plant.safety?.toxicity?.humans);
        let humanKey = 'safety_safe_humans';
        if (humanTox.level === 2) humanKey = 'safety_toxic_humans';
        if (humanTox.level === 1) humanKey = 'safety_caution_humans';
        tags.push({ label: t(humanKey as any), icon: Icons.User, style: humanTox.style });

        const petTox = getSafetyStatus(plant.safety?.toxicity?.pets);
        let petKey = 'safety_safe_pets';
        if (petTox.level === 2) petKey = 'safety_toxic_pets';
        if (petTox.level === 1) petKey = 'safety_caution_pets';
        tags.push({ label: t(petKey as any), icon: Icons.PawPrint, style: petTox.style });
    }

    // 5. Allergy Tag (Binary Allergen/Non-allergen with Yellow indicator for Allergen)
    if (plant.safety?.allergies?.humans) {
        const allergyStatus = getSafetyStatus(plant.safety.allergies.humans);
        const isAllergen = allergyStatus.level > 0;
        tags.push({ 
            label: isAllergen ? t('allergy_yes') : t('allergy_no'), 
            icon: 'cloudy-outline' as const, // Ionicons: no "wind", use cloudy-outline
            style: isAllergen 
                ? 'bg-yellow-400/20 text-yellow-700 border-yellow-500/20' 
                : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' 
        });
    }
    
    // 6. Lifespan
    if (plant.lifespan) {
        tags.push({ label: t(getLifespanLabelKey(plant.lifespan)), icon: Icons.Timer, style: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20' });
    }

    // 7. Light Requirement
    const sunlight = (plant.careTips?.sunlight || '').toLowerCase();
    if (sunlight.includes('shade') || sunlight.includes('low light') || sunlight.includes('shadow') || sunlight.includes('тень')) {
         tags.push({ label: t('tag_low_light'), icon: Icons.Cloud, style: 'bg-purple-500/10 text-purple-700 border-purple-500/20' });
    }

    return tags;
};