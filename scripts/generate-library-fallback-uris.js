/**
 * Читает 50 jpg из assets/library-fallbacks/, конвертирует в data URI,
 * пишет в services/libraryFallbackDataUris.generated.ts.
 * Если файл невалидный (HTML/ошибка) — заменяет фото: скачивает заново по URL и перезаписывает файл.
 * Запуск: node scripts/generate-library-fallback-uris.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const SOURCE_DIR = path.join(__dirname, '..', 'assets', 'library-fallbacks');
const OUT_FILE = path.join(__dirname, '..', 'services', 'libraryFallbackDataUris.generated.ts');

const LIBRARY_FALLBACK_URLS = [
  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Pilea_peperomioides_Chinese_money_plant.jpg/400px-Pilea_peperomioides_Chinese_money_plant.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Monstera_deliciosa0.jpg/400px-Monstera_deliciosa0.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Ocimum_basilicum0.jpg/400px-Ocimum_basilicum0.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Aloe_vera_002.jpg/400px-Aloe_vera_002.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Convallaria_majalis_flower_2.jpg/400px-Convallaria_majalis_flower_2.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Lavandula-angustifolia.jpg/400px-Lavandula-angustifolia.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Rosa_hybrid_tea_01.jpg/400px-Rosa_hybrid_tea_01.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Tulipa_gesneriana_001.jpg/400px-Tulipa_gesneriana_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Nerium_oleander_Flower.jpg/400px-Nerium_oleander_Flower.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Centaurea_cyanus_001.jpg/400px-Centaurea_cyanus_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Echinocactus_grusonii_1.jpg/400px-Echinocactus_grusonii_1.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Betula_pendula_001.jpg/400px-Betula_pendula_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Quercus_robur_001.jpg/400px-Quercus_robur_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Sansevieria_trifasciata_001.jpg/400px-Sansevieria_trifasciata_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Orchis_mascula_001.jpg/400px-Orchis_mascula_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Dryopteris_filix-mas_002.jpg/400px-Dryopteris_filix-mas_002.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Digitalis_purpurea_004.JPG/400px-Digitalis_purpurea_004.JPG',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Taraxacum_officinale_flower.jpg/400px-Taraxacum_officinale_flower.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Mentha_spicata_002.jpg/400px-Mentha_spicata_002.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Urtica_dioica_001.jpg/400px-Urtica_dioica_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Strelitzia_reginae_Strelicja_kr%C3%B3lewska_2023-02-24_07.jpg/400px-Strelitzia_reginae_Strelicja_kr%C3%B3lewska_2023-02-24_07.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Calathea_ornata_%27Sanderiana%27_Kalatea_2010-08-01_01.jpg/400px-Calathea_ornata_%27Sanderiana%27_Kalatea_2010-08-01_01.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Philodendron_%28_Araceae_%29.jpg/400px-Philodendron_%28_Araceae_%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Alocasia_brancifolia_as_an_indoor_house_plant.jpg/400px-Alocasia_brancifolia_as_an_indoor_house_plant.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Pilea_peperomia_and_pups.jpg/400px-Pilea_peperomia_and_pups.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Pilea_peperomioides_Chinese_money_plant.jpg/400px-Pilea_peperomioides_Chinese_money_plant.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Monstera_deliciosa0.jpg/400px-Monstera_deliciosa0.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Ocimum_basilicum0.jpg/400px-Ocimum_basilicum0.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Aloe_vera_002.jpg/400px-Aloe_vera_002.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Convallaria_majalis_flower_2.jpg/400px-Convallaria_majalis_flower_2.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Lavandula-angustifolia.jpg/400px-Lavandula-angustifolia.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Rosa_hybrid_tea_01.jpg/400px-Rosa_hybrid_tea_01.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Tulipa_gesneriana_001.jpg/400px-Tulipa_gesneriana_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Nerium_oleander_Flower.jpg/400px-Nerium_oleander_Flower.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Centaurea_cyanus_001.jpg/400px-Centaurea_cyanus_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Echinocactus_grusonii_1.jpg/400px-Echinocactus_grusonii_1.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Betula_pendula_001.jpg/400px-Betula_pendula_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Quercus_robur_001.jpg/400px-Quercus_robur_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Sansevieria_trifasciata_001.jpg/400px-Sansevieria_trifasciata_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Orchis_mascula_001.jpg/400px-Orchis_mascula_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Dryopteris_filix-mas_002.jpg/400px-Dryopteris_filix-mas_002.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Digitalis_purpurea_004.JPG/400px-Digitalis_purpurea_004.JPG',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Taraxacum_officinale_flower.jpg/400px-Taraxacum_officinale_flower.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Mentha_spicata_002.jpg/400px-Mentha_spicata_002.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Urtica_dioica_001.jpg/400px-Urtica_dioica_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Strelitzia_reginae_Strelicja_kr%C3%B3lewska_2023-02-24_07.jpg/400px-Strelitzia_reginae_Strelicja_kr%C3%B3lewska_2023-02-24_07.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Calathea_ornata_%27Sanderiana%27_Kalatea_2010-08-01_01.jpg/400px-Calathea_ornata_%27Sanderiana%27_Kalatea_2010-08-01_01.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Philodendron_%28_Araceae_%29.jpg/400px-Philodendron_%28_Araceae_%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Alocasia_brancifolia_as_an_indoor_house_plant.jpg/400px-Alocasia_brancifolia_as_an_indoor_house_plant.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Pilea_peperomia_and_pups.jpg/400px-Pilea_peperomia_and_pups.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Lavandula-angustifolia.jpg/400px-Lavandula-angustifolia.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Digitalis_purpurea_004.JPG/400px-Digitalis_purpurea_004.JPG',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Dryopteris_filix-mas_002.jpg/400px-Dryopteris_filix-mas_002.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Nerium_oleander_Flower.jpg/400px-Nerium_oleander_Flower.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Centaurea_cyanus_001.jpg/400px-Centaurea_cyanus_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Betula_pendula_001.jpg/400px-Betula_pendula_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Quercus_robur_001.jpg/400px-Quercus_robur_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Sansevieria_trifasciata_001.jpg/400px-Sansevieria_trifasciata_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Orchis_mascula_001.jpg/400px-Orchis_mascula_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Aloe_vera_002.jpg/400px-Aloe_vera_002.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Echinocactus_grusonii_1.jpg/400px-Echinocactus_grusonii_1.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Rosa_hybrid_tea_01.jpg/400px-Rosa_hybrid_tea_01.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Tulipa_gesneriana_001.jpg/400px-Tulipa_gesneriana_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Convallaria_majalis_flower_2.jpg/400px-Convallaria_majalis_flower_2.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Mentha_spicata_002.jpg/400px-Mentha_spicata_002.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Urtica_dioica_001.jpg/400px-Urtica_dioica_001.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Philodendron_%28_Araceae_%29.jpg/400px-Philodendron_%28_Araceae_%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Alocasia_brancifolia_as_an_indoor_house_plant.jpg/400px-Alocasia_brancifolia_as_an_indoor_house_plant.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Strelitzia_reginae_Strelicja_kr%C3%B3lewska_2023-02-24_07.jpg/400px-Strelitzia_reginae_Strelicja_kr%C3%B3lewska_2023-02-24_07.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Calathea_ornata_%27Sanderiana%27_Kalatea_2010-08-01_01.jpg/400px-Calathea_ornata_%27Sanderiana%27_Kalatea_2010-08-01_01.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Ocimum_basilicum0.jpg/400px-Ocimum_basilicum0.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Pilea_peperomioides_Chinese_money_plant.jpg/400px-Pilea_peperomioides_Chinese_money_plant.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Monstera_deliciosa0.jpg/400px-Monstera_deliciosa0.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Taraxacum_officinale_flower.jpg/400px-Taraxacum_officinale_flower.jpg',
];

function isInvalidJpeg(buf) {
  if (!buf || buf.length < 2) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8) return false;
  const start = buf.slice(0, 200).toString('utf8');
  return start.includes('<!DOCTYPE') || start.includes('Wikipedia Error') || start.includes('<html');
}

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

const files = fs.existsSync(SOURCE_DIR)
  ? fs.readdirSync(SOURCE_DIR).filter((f) => /^\d{2}\.jpg$/i.test(f)).sort()
  : [];

const lines = [
  '/** Auto-generated. Do not edit. Run: node scripts/generate-library-fallback-uris.js */',
  '/** Data URI для 50 фолбэк-фото библиотеки (с устройства, без require jpg). */',
  'export const LIBRARY_FALLBACK_DATA_URIS: string[] = [',
];

(async () => {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const jpgPath = path.join(SOURCE_DIR, file);
    const urlIndex = i;
    try {
      let buf = fs.readFileSync(jpgPath);
      if (isInvalidJpeg(buf) && LIBRARY_FALLBACK_URLS[urlIndex]) {
        try {
          buf = await download(LIBRARY_FALLBACK_URLS[urlIndex]);
          if (!isInvalidJpeg(buf)) {
            fs.writeFileSync(jpgPath, buf);
            console.log('Replaced invalid:', file);
          }
        } catch (e) {
          console.warn('Replace failed:', file, e.message);
        }
      }
      const b64 = buf.toString('base64');
      const uri = `data:image/jpeg;base64,${b64}`;
      lines.push('  ' + JSON.stringify(uri) + ',');
    } catch (e) {
      console.warn('Skip:', file, e.message);
    }
  }
  lines.push('];');
  fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
  console.log('Written:', OUT_FILE, '(', files.length, 'images)');
})();
