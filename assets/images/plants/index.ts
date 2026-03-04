/**
 * Локальные фото болезней для зон поражения на экране диагностики.
 * Данные из dist/images/diseases, скрипт scripts/generate-plant-images-data.js.
 * Названия болезней сопоставлены с картинками в diseaseTitleToImage.ts.
 */
import { DISEASE_ZONE_PLANT_IMAGES, DISEASE_IMAGE_INDEX_BY_FILENAME } from './imagesData';
import { DISEASE_TITLE_TO_IMAGE_FILENAME } from './diseaseTitleToImage';
export { DISEASE_ZONE_PLANT_IMAGES };

/** Возвращает индекс изображения по названию болезни: сначала по маппингу, иначе по hash. */
export function getDiseaseZoneImageIndex(title: string): number {
  if (!title) return 0;
  const filename = DISEASE_TITLE_TO_IMAGE_FILENAME[title];
  if (filename != null) {
    const index = DISEASE_IMAGE_INDEX_BY_FILENAME[filename];
    if (index != null) return index;
  }
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % DISEASE_ZONE_PLANT_IMAGES.length;
}
