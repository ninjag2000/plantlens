# Как запустить Metro Bundler

## Способ 1: Через терминал в VS Code/Cursor

1. Откройте терминал в редакторе:
   - **VS Code/Cursor**: `Ctrl + ~` (тильда) или меню `Terminal` → `New Terminal`
   - **Или**: `View` → `Terminal`

2. Убедитесь, что вы в правильной директории:
   ```powershell
   cd c:\Users\zheny\Desktop\plantlens-13-new
   ```

3. Запустите Metro bundler:
   ```powershell
   npx expo start
   ```

4. Вы увидите:
   - QR-код для подключения
   - Логи Metro bundler
   - Инструкции по управлению

## Способ 2: Через командную строку Windows

1. Откройте **PowerShell** или **Command Prompt** (cmd)
   - Нажмите `Win + R`, введите `powershell` или `cmd`, нажмите Enter

2. Перейдите в папку проекта:
   ```powershell
   cd c:\Users\zheny\Desktop\plantlens-13-new
   ```

3. Запустите Metro bundler:
   ```powershell
   npx expo start
   ```

## Способ 3: Через Android Studio (если запускали через него)

Если вы запускали приложение через Android Studio (`npx expo run:android`), Metro bundler автоматически запустится в терминале Android Studio или в отдельном окне терминала.

## Как понять, что Metro bundler запущен?

Вы увидите в терминале:
```
› Metro waiting on exp://192.168.x.x:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web

› Press r │ reload app
› Press m │ toggle menu
```

## Полезные команды в Metro bundler

- `r` - перезагрузить приложение
- `R` - перезагрузить с очисткой кеша
- `m` - открыть меню разработчика
- `Ctrl + C` - остановить Metro bundler

## Если Metro bundler не запускается

1. Убедитесь, что вы в правильной папке проекта
2. Проверьте, что установлены зависимости:
   ```powershell
   npm install
   ```
3. Попробуйте с очисткой кеша:
   ```powershell
   npx expo start --clear
   ```

## Где найти окно Metro bundler, если потеряли?

1. Проверьте открытые окна терминала/консоли
2. Проверьте вкладки терминала в VS Code/Cursor (внизу экрана)
3. Если не нашли - просто запустите заново:
   ```powershell
   cd c:\Users\zheny\Desktop\plantlens-13-new
   npx expo start
   ```
