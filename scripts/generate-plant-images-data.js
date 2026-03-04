/**
 * Генерирует assets/images/plants/imagesData.ts из jpg в dist/images/diseases.
 * Metro не умеет обрабатывать эти jpg (image-size), поэтому используем data URI.
 * Запуск: node scripts/generate-plant-images-data.js
 */
const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, '..', 'dist', 'images', 'diseases');
const OUT_FILE = path.join(__dirname, '..', 'assets', 'images', 'plants', 'imagesData.ts');

const IMG_EXT = ['.jpg', '.jpeg', '.png'];
const files = fs.existsSync(SOURCE_DIR)
  ? fs.readdirSync(SOURCE_DIR)
      .filter((f) => IMG_EXT.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort()
  : [];

const lines = [
  '/** Auto-generated. Do not edit. Run: node scripts/generate-plant-images-data.js */',
  'export const DISEASE_ZONE_PLANT_IMAGES: { uri: string }[] = ['
];

const indexByFilename = {};
let idx = 0;
for (const file of files) {
  const name = file.replace(/\.(jpg|jpeg|png)$/i, '');
  indexByFilename[name] = idx;
  const filePath = path.join(SOURCE_DIR, file);
  let uri = '';
  try {
    const buf = fs.readFileSync(filePath);
    const b64 = buf.toString('base64');
    const isPng = /\.png$/i.test(file);
    uri = isPng ? `data:image/png;base64,${b64}` : `data:image/jpeg;base64,${b64}`;
  } catch (e) {
    console.warn('Skip:', file, e.message);
  }
  lines.push(`  { uri: ${JSON.stringify(uri)} },`);
  idx++;
}

lines.push('];');
lines.push('');
lines.push('/** filename (without extension) -> index in DISEASE_ZONE_PLANT_IMAGES */');
lines.push('export const DISEASE_IMAGE_INDEX_BY_FILENAME: Record<string, number> = ' + JSON.stringify(indexByFilename, null, 2) + ';');

fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
console.log('Written:', OUT_FILE, '(', files.length, 'images)');
