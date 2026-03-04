/**
 * Скачивает 50 фолбэк-фото библиотеки в assets/library-fallbacks/
 * Запуск: node scripts/download-library-fallbacks.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'library-fallbacks');

const LIBRARY_FALLBACK_URLS = [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Pilea_peperomioides_Chinese_money_plant.jpg/400px-Pilea_peperomioides_Chinese_money_plant.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Monstera_deliciosa0.jpg/400px-Monstera_deliciosa0.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Ocimum_basilicum0.jpg/400px-Ocimum_basilicum0.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Aloe_vera_002.jpg/400px-Aloe_vera_002.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Convallaria_majalis_flower_2.jpg/400px-Convallaria_majalis_flower_2.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Lavandula-angustifolia.jpg/400px-Lavandula-angustifolia.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Rosa_hybrid_tea_01.jpg/400px-Rosa_hybrid_tea_01.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Tulipa_gesneriana_001.jpg/400px-Tulipa_gesneriana_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Nerium_oleander_Flower.jpg/400px-Nerium_oleander_Flower.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Centaurea_cyanus_001.jpg/400px-Centaurea_cyanus_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Echinocactus_grusonii_1.jpg/400px-Echinocactus_grusonii_1.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Betula_pendula_001.jpg/400px-Betula_pendula_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Quercus_robur_001.jpg/400px-Quercus_robur_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Sansevieria_trifasciata_001.jpg/400px-Sansevieria_trifasciata_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Orchis_mascula_001.jpg/400px-Orchis_mascula_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Dryopteris_filix-mas_002.jpg/400px-Dryopteris_filix-mas_002.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Digitalis_purpurea_004.JPG/400px-Digitalis_purpurea_004.JPG",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Taraxacum_officinale_flower.jpg/400px-Taraxacum_officinale_flower.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Mentha_spicata_002.jpg/400px-Mentha_spicata_002.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Urtica_dioica_001.jpg/400px-Urtica_dioica_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Strelitzia_reginae_Strelicja_kr%C3%B3lewska_2023-02-24_07.jpg/400px-Strelitzia_reginae_Strelicja_kr%C3%B3lewska_2023-02-24_07.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Calathea_ornata_%27Sanderiana%27_Kalatea_2010-08-01_01.jpg/400px-Calathea_ornata_%27Sanderiana%27_Kalatea_2010-08-01_01.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Philodendron_%28_Araceae_%29.jpg/400px-Philodendron_%28_Araceae_%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Alocasia_brancifolia_as_an_indoor_house_plant.jpg/400px-Alocasia_brancifolia_as_an_indoor_house_plant.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Pilea_peperomia_and_pups.jpg/400px-Pilea_peperomia_and_pups.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Pilea_peperomioides_Chinese_money_plant.jpg/400px-Pilea_peperomioides_Chinese_money_plant.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Monstera_deliciosa0.jpg/400px-Monstera_deliciosa0.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Ocimum_basilicum0.jpg/400px-Ocimum_basilicum0.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Aloe_vera_002.jpg/400px-Aloe_vera_002.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Convallaria_majalis_flower_2.jpg/400px-Convallaria_majalis_flower_2.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Lavandula-angustifolia.jpg/400px-Lavandula-angustifolia.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Rosa_hybrid_tea_01.jpg/400px-Rosa_hybrid_tea_01.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Tulipa_gesneriana_001.jpg/400px-Tulipa_gesneriana_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Nerium_oleander_Flower.jpg/400px-Nerium_oleander_Flower.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Centaurea_cyanus_001.jpg/400px-Centaurea_cyanus_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Echinocactus_grusonii_1.jpg/400px-Echinocactus_grusonii_1.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Betula_pendula_001.jpg/400px-Betula_pendula_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Quercus_robur_001.jpg/400px-Quercus_robur_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Sansevieria_trifasciata_001.jpg/400px-Sansevieria_trifasciata_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Orchis_mascula_001.jpg/400px-Orchis_mascula_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Dryopteris_filix-mas_002.jpg/400px-Dryopteris_filix-mas_002.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Digitalis_purpurea_004.JPG/400px-Digitalis_purpurea_004.JPG",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Taraxacum_officinale_flower.jpg/400px-Taraxacum_officinale_flower.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Mentha_spicata_002.jpg/400px-Mentha_spicata_002.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Urtica_dioica_001.jpg/400px-Urtica_dioica_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Strelitzia_reginae_Strelicja_kr%C3%B3lewska_2023-02-24_07.jpg/400px-Strelitzia_reginae_Strelicja_kr%C3%B3lewska_2023-02-24_07.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Calathea_ornata_%27Sanderiana%27_Kalatea_2010-08-01_01.jpg/400px-Calathea_ornata_%27Sanderiana%27_Kalatea_2010-08-01_01.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Philodendron_%28_Araceae_%29.jpg/400px-Philodendron_%28_Araceae_%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Alocasia_brancifolia_as_an_indoor_house_plant.jpg/400px-Alocasia_brancifolia_as_an_indoor_house_plant.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Pilea_peperomia_and_pups.jpg/400px-Pilea_peperomia_and_pups.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Lavandula-angustifolia.jpg/400px-Lavandula-angustifolia.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Digitalis_purpurea_004.JPG/400px-Digitalis_purpurea_004.JPG",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Dryopteris_filix-mas_002.jpg/400px-Dryopteris_filix-mas_002.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Nerium_oleander_Flower.jpg/400px-Nerium_oleander_Flower.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Centaurea_cyanus_001.jpg/400px-Centaurea_cyanus_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Betula_pendula_001.jpg/400px-Betula_pendula_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Quercus_robur_001.jpg/400px-Quercus_robur_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Sansevieria_trifasciata_001.jpg/400px-Sansevieria_trifasciata_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Orchis_mascula_001.jpg/400px-Orchis_mascula_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Aloe_vera_002.jpg/400px-Aloe_vera_002.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Echinocactus_grusonii_1.jpg/400px-Echinocactus_grusonii_1.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Rosa_hybrid_tea_01.jpg/400px-Rosa_hybrid_tea_01.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Tulipa_gesneriana_001.jpg/400px-Tulipa_gesneriana_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Convallaria_majalis_flower_2.jpg/400px-Convallaria_majalis_flower_2.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Mentha_spicata_002.jpg/400px-Mentha_spicata_002.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Urtica_dioica_001.jpg/400px-Urtica_dioica_001.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Philodendron_%28_Araceae_%29.jpg/400px-Philodendron_%28_Araceae_%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Alocasia_brancifolia_as_an_indoor_house_plant.jpg/400px-Alocasia_brancifolia_as_an_indoor_house_plant.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Strelitzia_reginae_Strelicja_kr%C3%B3lewska_2023-02-24_07.jpg/400px-Strelitzia_reginae_Strelicja_kr%C3%B3lewska_2023-02-24_07.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Calathea_ornata_%27Sanderiana%27_Kalatea_2010-08-01_01.jpg/400px-Calathea_ornata_%27Sanderiana%27_Kalatea_2010-08-01_01.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Ocimum_basilicum0.jpg/400px-Ocimum_basilicum0.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Pilea_peperomioides_Chinese_money_plant.jpg/400px-Pilea_peperomioides_Chinese_money_plant.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Monstera_deliciosa0.jpg/400px-Monstera_deliciosa0.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Taraxacum_officinale_flower.jpg/400px-Taraxacum_officinale_flower.jpg",
];

function download(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'PlantLens/1.0' } }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

async function main() {
    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
    }
    const urls = LIBRARY_FALLBACK_URLS.slice(0, 50);
    console.log('Downloading', urls.length, 'library fallback images to', OUT_DIR);
    for (let i = 0; i < urls.length; i++) {
        const num = String(i + 1).padStart(2, '0');
        const filePath = path.join(OUT_DIR, num + '.jpg');
        try {
            const buf = await download(urls[i]);
            fs.writeFileSync(filePath, buf);
            console.log('  ', num + '.jpg');
        } catch (e) {
            console.warn('  ', num + '.jpg failed:', e.message);
        }
    }
    console.log('Done.');
}

main();
