# Исправление ошибки: Cannot find native module 'ExpoAsset'

## Проблема

Ошибка "Cannot find native module 'ExpoAsset'" означает, что нативные модули Expo не связаны правильно с приложением.

## Решение

### Вариант 1: Пересобрать проект (РЕКОМЕНДУЕТСЯ)

Нативные модули Expo должны быть пересобраны. Выполните:

```powershell
cd C:\Users\zheny\Desktop\plantlens-13-new\android
$env:GRADLE_USER_HOME = "$env:USERPROFILE\.gradle"
.\gradlew.bat clean
.\gradlew.bat assembleDebug
```

Затем переустановите приложение на устройство/эмулятор:

```powershell
.\gradlew.bat installDebug
```

### Вариант 2: Пересоздать нативные папки

Если проблема сохраняется, пересоздайте нативные папки:

```powershell
cd C:\Users\zheny\Desktop\plantlens-13-new
npx expo prebuild --clean
```

Затем пересоберите:

```powershell
cd android
$env:GRADLE_USER_HOME = "$env:USERPROFILE\.gradle"
.\gradlew.bat assembleDebug
```

### Вариант 3: Проверить autolinking

Убедитесь, что Expo autolinking работает правильно. Проверьте файл:

```
android/app/build/generated/autolinking/src/main/jni/Android-autolinking.cmake
```

Он должен содержать ссылки на Expo модули.

## Почему это происходит

- Нативные модули Expo (включая ExpoAsset) должны быть скомпилированы и связаны
- После изменений в зависимостях или конфигурации, нативные модули нужно пересобрать
- `expo-asset` является частью Expo SDK и должен быть автоматически связан

## Проверка

После пересборки, приложение должно найти модуль `ExpoAsset`. Если ошибка сохраняется, проверьте:

1. Все ли Expo модули установлены: `npm list expo`
2. Правильно ли работает autolinking
3. Нужно ли пересоздать нативные папки через `expo prebuild --clean`
