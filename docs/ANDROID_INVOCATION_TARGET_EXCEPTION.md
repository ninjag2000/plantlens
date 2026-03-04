# Android: InvocationTargetException

Ошибка `java.lang.reflect.InvocationTargetException` означает, что при вызове нативного модуля из JS произошло исключение. В логе **ниже** обычно идёт строка **"Caused by:"** с настоящей причиной.

## 1. Узнать реальную причину

Подключите устройство/эмулятор и выполните:

```bash
adb logcat *:E | findstr /i "InvocationTargetException Caused plantlens ReactNative"
```

Или полный вывод по приложению:

```bash
adb logcat --pid=$(adb shell pidof com.plantlens.app) *:E
```

Скопируйте блок со стеком, особенно строки **Caused by:** — по ним можно понять, какой модуль падает (AsyncStorage, NetInfo, Location, Camera и т.д.).

## 2. Чистая пересборка

Часто помогает очистка и повторный запуск:

```bash
cd android
./gradlew clean
cd ..
npx expo run:android
```

## 3. Отключить New Architecture (для проверки)

В `android/gradle.properties` временно поставьте:

```properties
newArchEnabled=false
```

Пересоберите приложение. Если ошибка исчезнет, причина может быть в New Architecture или в несовместимости одной из библиотек с ней.

## 4. Типичные причины

- **При старте приложения:** инициализация Expo-модулей, Hermes, загрузка нативных библиотек.
- **При открытии экрана:** модуль экрана (камера, геолокация, уведомления) запрашивает разрешения или ресурсы и падает.
- **JNI / нативные библиотеки:** в логе могут быть `UnsatisfiedLinkError` или `JNI DETECTED ERROR`.

После того как по `adb logcat` будет видна строка **Caused by:** с конкретным исключением, можно точечно править код или зависимости.
