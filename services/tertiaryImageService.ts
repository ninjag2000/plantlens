/**
 * Третий сервис для фото растений (Wikimedia Commons).
 * Используется после основного и запасного (plantImageService). Без стоковых фото.
 */

/** Плейсхолдер «растение»: реальный JPEG (RN Image не отображает SVG — иначе серый экран). */
const GENERIC_PLACEHOLDER =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Pilea_peperomioides_Chinese_money_plant.jpg/400px-Pilea_peperomioides_Chinese_money_plant.jpg";

const hashSeed = (seed: string): number => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
};

/** Пул из 20 стоковых ботанических картинок (Wikimedia Commons) — третий сервис. */
const TERTIARY_PLANT_IMAGES: string[] = [
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

/** Третий сервис: только растения (по имени), без интерьеров. */
export const TERTIARY_TRENDING_IMAGES: Record<string, string> = {
    "Стрелиция": "https://upload.wikimedia.org/wikipedia/commons/e/ed/Strelitzia_reginae_Strelicja_kr%C3%B3lewska_2023-02-24_07.jpg",
    "Калатея": "https://upload.wikimedia.org/wikipedia/commons/e/e9/Calathea_ornata_%27Sanderiana%27_Kalatea_2010-08-01_01.jpg",
    "Алоказия": "https://upload.wikimedia.org/wikipedia/commons/9/9c/Alocasia_brancifolia_as_an_indoor_house_plant.jpg",
    "Филодендрон": "https://upload.wikimedia.org/wikipedia/commons/0/07/Philodendron_%28_Araceae_%29.jpg",
    "Пилея": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Pilea_peperomia_and_pups.jpg/400px-Pilea_peperomia_and_pups.jpg",
};

/**
 * Третий сервис: вернуть URL картинки растения по seed.
 */
export function getTertiaryPlantImage(seed: string): string {
    if (!seed) return GENERIC_PLACEHOLDER;
    const index = hashSeed(seed) % TERTIARY_PLANT_IMAGES.length;
    return TERTIARY_PLANT_IMAGES[index];
}

/**
 * Третий сервис: вернуть URL картинки для трендового растения по имени.
 */
export function getTertiaryTrendingImage(plantName: string, seed?: string): string {
    const byName = TERTIARY_TRENDING_IMAGES[plantName];
    if (byName) return byName;
    return getTertiaryPlantImage(seed ?? plantName);
}
