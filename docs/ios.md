# Сборка и запуск PlantLens на iOS

## Требования

- **macOS** (обязательно для сборки iOS)
- **Xcode** (из App Store), с установленным симулятором iOS и командной строкой: `xcode-select --install` при необходимости
- **Node.js** и зависимости проекта (`npm install`)
- **CocoaPods**: `sudo gem install cocoapods` (если ещё не установлен)

## Первая настройка (prebuild)

Нативные папки `ios` и `android` генерируются из `app.config.js`:

```bash
npx expo prebuild
```

При необходимости очистить и пересобрать:

```bash
npx expo prebuild --clean
```

## Запуск на симуляторе

```bash
npm run ios
# или
npx expo run:ios
```

Будет собран проект и запущен симулятор по умолчанию. Указать устройство:

```bash
npx expo run:ios --device "iPhone 16"
```

## Запуск на физическом устройстве

1. Открыть проект в Xcode:
   ```bash
   open ios/plantlens.xcworkspace
   ```
2. Выбрать свою команду разработчика в **Signing & Capabilities**.
3. Подключить iPhone и выбрать его в списке устройств.
4. Запустить сборку (▶ Run).

## Разрешения (Info.plist)

Тексты запросов разрешений задаются в `app.config.js` через плагины:

- **Камера** — экспозиция растений, фото для ухода.
- **Геолокация** — флора региона и погода.
- **Фото** — выбор изображений, экспорт отчётов.
- **Уведомления** — локальные напоминания по уходу за растениями.

После изменения плагинов или разрешений в `app.config.js` нужно заново выполнить `npx expo prebuild`.

## Заметки

- Люксометр (датчик освещённости) на iOS недоступен — в приложении показывается сообщение об этом.
- Сохранение PDF на iOS выполняется в папку приложения (`documentDirectory`); для экспорта в «Файлы» можно использовать общий экспорт/шаринг из экрана отчёта.

---

## Чек-лист полной конвертации под iOS

| Область | Статус | Примечание |
|--------|--------|------------|
| **Конфиг (app.config.js)** | ✅ | Плагины: camera, location, image-picker, notifications, document-picker. `ios.bundleIdentifier`, `supportsTablet`. |
| **Камера** | ✅ | expo-camera, текст разрешения в плагине. |
| **Геолокация** | ✅ | expo-location, `locationWhenInUsePermission`. |
| **Фото / медиа** | ✅ | expo-image-picker (фото + камера), expo-document-picker в plugins. |
| **Уведомления** | ✅ | expo-notifications (локальные), без push. |
| **Safe Area** | ✅ | `useSafeAreaInsets()` и отступы используются на экранах (PlantDetail, Processing, MyPlants, Settings, Water, Subscription, Onboarding, ProblemDetail, RepottingResult). |
| **StatusBar** | ✅ | `barStyle` в App.tsx (light-content / dark-content), без `backgroundColor` (только Android). |
| **Клавиатура** | ✅ | `KeyboardAvoidingView` с `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` в PlantDetailScreen. |
| **file:// URI** | ✅ | На iOS не нужна правка `file://` → `file:///` (только Android в PlantDetailScreen). Остальной код использует file:// и data: на обеих платформах. |
| **PDF** | ✅ | pdfSaveService: на iOS сохранение в `documentDirectory`; на Android — SAF при наличии, иначе documentDirectory. |
| **Sharing** | ✅ | expo-sharing используется для PDF/отчётов; поддерживает iOS. |
| **BackHandler** | ✅ | Используется в ProcessingScreen; на iOS кнопки «назад» нет, подписка просто не срабатывает. |
| **Люксометр** | ✅ | На iOS показывается сообщение «только на Android» (lux_sensor_unavailable_ios). |
| **content://** | ✅ | Обработка только в PlantDetailScreen (PDF/фото) для Android; на iOS не используется. |
| **Prebuild** | ✅ | После изменений в `app.config.js` выполнить `npx expo prebuild` (или `--clean`). |

Перед релизом на App Store: проверить подпись (Signing & Capabilities), тестовое устройство и симулятор, все сценарии с камерой/фото/геолокацией/уведомлениями и экспортом PDF.

**Публикация в App Store:** пошаговая инструкция (EAS Build, Xcode, App Store Connect, модерация) — в [app-store.md](./app-store.md).
