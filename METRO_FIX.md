# Исправление ошибки Metro: react-dom/client

## Проблема

Metro bundler пытается загрузить `index.tsx`, который содержит веб-код (`react-dom/client`), несовместимый с React Native.

## Решение

✅ **Удален `index.tsx`** (веб-версия)  
✅ **Используется `index.js`** (правильный entry point для Expo)  
✅ **Восстановлен `tsconfig.json`** (добавлены Expo типы)

## Теперь запустите Metro

```powershell
cd C:\Users\zheny\Desktop\plantlens-13-new
npm start
```

Или:

```powershell
npx expo start
```

## Структура файлов

- ✅ `index.js` - Entry point для мобильных платформ (Android/iOS)
- ✅ `app.tsx` - Главный компонент приложения
- ❌ `index.tsx` - Удален (был для веб-версии)

## Если нужна веб-версия

Если вы хотите запустить веб-версию, создайте `index.web.tsx`:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

И установите `react-dom`:
```powershell
npm install react-dom
```

Но для мобильных платформ это не нужно.

## Проверка

После удаления `index.tsx`, Metro должен использовать `index.js`, который правильно настроен для Expo.
