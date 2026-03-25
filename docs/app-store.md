# Публикация PlantLens в App Store

Пошаговая инструкция по выкладке приложения в Apple App Store.

## Требования

- **Apple Developer Program** — платная подписка ($99/год). Регистрация: [developer.apple.com/programs](https://developer.apple.com/programs/).
- Для **сборки на своём Mac**: macOS, Xcode (последняя стабильная версия).
- Для **сборки без Mac**: аккаунт Expo (EAS Build собирает в облаке).

---

## 1. Подготовка проекта

### Версия и идентификатор

В `app.config.js` уже заданы:

- `version: "1.0.0"` — при каждом релизе увеличивайте (например, 1.0.1).
- `ios.bundleIdentifier: "com.plantlens.app"` — должен совпадать с App ID в Apple Developer и в App Store Connect.

При использовании EAS можно включить автоинкремент build number в `eas.json` (уже есть `"autoIncrement": true` в production).

### Иконка и экран загрузки

- Иконка приложения: `assets/icon.png` (1024×1024 px для App Store).
- Splash: `assets/splash.png`.
- При необходимости добавьте все размеры иконок по [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons).

### Шифрование (экспорт)

В `app.config.js` уже указано `ITSAppUsesNonExemptEncryption: false` (приложение не использует собственное шифрование сверх стандартного HTTPS). Это избавляет от лишних вопросов при экспорте.

---

## 2. App Store Connect

1. Войдите в [App Store Connect](https://appstoreconnect.apple.com/).
2. **Мои приложения** → **+** → **Новое приложение**:
   - Платформы: iOS.
   - Название: PlantLens (или как в магазине).
   - Основной язык.
   - Bundle ID: выберите или создайте `com.plantlens.app`.
   - SKU: например `plantlens-ios-1`.
3. Заполните карточку приложения:
   - **Описание**, **Ключевые слова**, **URL поддержки**, **URL политики конфиденциальности** (обязательно, если собираете персональные данные).
   - **Категория** (например, «Справочники» или «Образ жизни»).
   - **Рейтинг** (опросник по контенту).
   - Готовые ASO-тексты (название, подзаголовок, ключевые слова, описание, промо): **[docs/aso.md](./aso.md)** и **[docs/aso-app-store-connect.txt](./aso-app-store-connect.txt)**.
4. **Цены и доступность** — бесплатно или платно, страны.
5. **Снимки экрана**: нужны для iPhone 6.7", 6.5", 5.5" (и при поддержке iPad — для iPad Pro 12.9"). Размеры см. в [документации Apple](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications). Можно сделать в симуляторе (Cmd+S) или на устройстве.

---

## 3. Сборка приложения

### Вариант A: EAS Build (рекомендуется, можно без Mac)

1. Установите EAS CLI и войдите в Expo:
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. Привяжите проект (если ещё не сделано):
   ```bash
   eas build:configure
   ```
3. Соберите production-сборку для iOS:
   ```bash
   eas build --platform ios --profile production
   ```
4. Дождитесь окончания сборки в [expo.dev](https://expo.dev). В конце будет ссылка на скачивание `.ipa` или уведомление об успешной загрузке в App Store Connect (если настроен auto-submit).

### Вариант B: Локальная сборка в Xcode (нужен Mac)

1. Сгенерируйте нативные проекты:
   ```bash
   npx expo prebuild
   ```
2. Откройте проект в Xcode:
   ```bash
   open ios/plantlens.xcworkspace
   ```
3. В Xcode:
   - Выберите **Signing & Capabilities** → укажите свою **Team** (Apple Developer).
   - Меню **Product** → **Archive**.
4. После архивации откроется **Organizer**: выберите архив → **Distribute App** → **App Store Connect** → загрузите билд.

---

## 4. Загрузка билда в App Store Connect

- **EAS**: можно настроить автоматическую отправку после сборки:
  ```bash
  eas submit --platform ios --latest
  ```
  Либо вручную: скачайте `.ipa` из экспо-дашборда и загрузите через [Transporter](https://apps.apple.com/app/transporter/id1450874784) (Mac) или через веб-интерфейс App Store Connect (загрузка билда).
- **Xcode**: после **Distribute App** → **App Store Connect** билд появится в разделе **Тестирование** → **Билды** в App Store Connect (иногда с задержкой 5–15 минут).

---

## 5. Отправка на модерацию

1. В App Store Connect откройте приложение → **Версия iOS** (или «+ Версия платформы»).
2. Укажите **версию** (например, 1.0.0), совпадающую с `app.config.js`.
3. В блоке **Сборка** нажмите **+** и выберите загруженный билд.
4. Заполните всё обязательное: описание, ключевые слова, снимки, рейтинг, контакт поддержки, политика конфиденциальности.
5. Ответьте на вопросы **Экспорт**, **Реклама** (если используете), **Контент**.
6. Нажмите **Отправить на проверку**.

После отправки статус станет «На проверке». Обычно ответ 24–48 часов. При одобрении приложение перейдёт в «Готово к продаже»; можно включить ручную публикацию или автоматическую после одобрения.

---

## Чек-лист перед первой отправкой

- [ ] Apple Developer Program активен, Bundle ID `com.plantlens.app` создан.
- [ ] В App Store Connect создано приложение, заполнены описание, скриншоты, политика конфиденциальности.
- [ ] В проекте заданы `version` и при необходимости build number.
- [ ] Собран production-билд (EAS или Xcode), билд загружен в App Store Connect.
- [ ] Выбран билд в карточке версии и отправка на проверку выполнена.

---

## Полезные ссылки

- [Expo: Submit to App Store](https://docs.expo.dev/submit/ios/)
- [EAS Build для iOS](https://docs.expo.dev/build-reference/ios-builds/)
- [App Store Connect Help](https://developer.apple.com/help/app-store-connect/)
- [Human Interface Guidelines — App Icons](https://developer.apple.com/design/human-interface-guidelines/app-icons)
