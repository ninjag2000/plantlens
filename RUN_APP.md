# Как запустить приложение

## Проблема

Ошибка "Unable to load script" означает, что Metro bundler не запущен.

## Решение

### Способ 1: Запустить через Expo (РЕКОМЕНДУЕТСЯ)

1. **Откройте PowerShell** (не Cursor терминал)

2. **Перейдите в корень проекта:**
   ```powershell
   cd C:\Users\zheny\Desktop\plantlens-13-new
   ```

3. **Запустите Metro bundler:**
   ```powershell
   npm start
   ```
   или
   ```powershell
   npx expo start
   ```

4. **В новом окне PowerShell запустите приложение:**
   ```powershell
   cd C:\Users\zheny\Desktop\plantlens-13-new\android
   $env:GRADLE_USER_HOME = "$env:USERPROFILE\.gradle"
   .\gradlew.bat installDebug
   ```

   Или в Android Studio: просто запустите приложение (Run button)

### Способ 2: Запустить через Expo CLI

```powershell
cd C:\Users\zheny\Desktop\plantlens-13-new
npx expo run:android
```

Это автоматически запустит Metro и установит приложение на устройство/эмулятор.

### Способ 3: Два терминала

**Терминал 1 (Metro):**
```powershell
cd C:\Users\zheny\Desktop\plantlens-13-new
npm start
```

**Терминал 2 (Запуск приложения):**
```powershell
cd C:\Users\zheny\Desktop\plantlens-13-new\android
$env:GRADLE_USER_HOME = "$env:USERPROFILE\.gradle"
.\gradlew.bat installDebug
```

## Важно

- **Metro bundler должен быть запущен** перед запуском приложения
- Metro будет работать на `http://localhost:8081`
- Приложение автоматически подключится к Metro для загрузки JavaScript кода

## Проверка

После запуска Metro вы увидите QR-код и меню. Нажмите `a` для Android или просто запустите приложение из Android Studio.

## Если Metro не запускается

Убедитесь, что вы в корне проекта (не в папке `android`):
```powershell
cd C:\Users\zheny\Desktop\plantlens-13-new
npm start
```
