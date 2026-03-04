# Как запустить приложение

## Ошибка: "Unable to load script"

Эта ошибка означает, что **Metro bundler не запущен** или приложение не может к нему подключиться.

## Решение

### Шаг 1: Запустите Metro bundler

**Откройте PowerShell** (не Cursor терминал) и выполните:

```powershell
cd C:\Users\zheny\Desktop\plantlens-13-new
npm start
```

Или:

```powershell
npx expo start
```

Вы увидите QR-код и меню. Metro будет работать на `http://localhost:8081`.

### Шаг 2: Запустите приложение

**В Android Studio:**
- Нажмите Run (зеленая кнопка)
- Или Build → Make Project, затем Run

**Или через командную строку:**

```powershell
cd C:\Users\zheny\Desktop\plantlens-13-new\android
$env:GRADLE_USER_HOME = "$env:USERPROFILE\.gradle"
.\gradlew.bat installDebug
```

### Шаг 3: Подключение

Приложение автоматически подключится к Metro bundler на `localhost:8081`.

Если приложение на эмуляторе не может подключиться:
- Эмулятор использует `10.0.2.2` вместо `localhost`
- Metro должен автоматически это обработать

## Важно

- **Metro должен быть запущен ПЕРЕД запуском приложения**
- Metro должен работать на `http://localhost:8081`
- Если Metro не запускается, проверьте, что вы в корне проекта (не в папке `android`)

## Проверка

После запуска Metro вы увидите:
- QR-код
- Меню с опциями (a для Android, i для iOS)
- URL: `http://localhost:8081`

Если Metro не запускается, проверьте:
1. Вы в правильной папке: `C:\Users\zheny\Desktop\plantlens-13-new`
2. `package.json` существует
3. `node_modules` установлены: `npm install`
