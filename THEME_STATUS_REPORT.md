# Отчет о состоянии темы (Dark/Light Mode)

**Дата проверки:** 2026-01-28

## ✅ Что работает

### 1. Система темы
- ✅ **`hooks/useTheme.tsx`** - Реализован контекст темы
  - Сохраняет выбор в AsyncStorage (`plantlens_theme`)
  - Поддерживает 'light' и 'dark' режимы
  - Определяет системную тему при первом запуске

- ✅ **`utils/themeColors.ts`** - Система цветов
  - Определены `lightColors` и `darkColors`
  - Функция `getThemeColors(theme)` возвращает правильные цвета
  - Полный набор цветов: background, surface, card, text, borders, primary, status colors

### 2. Переключение темы
- ✅ **`pages/SettingsScreen.tsx`** - Переключатель темы
  - Использует `useTheme()` и `setTheme()`
  - Switch компонент для переключения между light/dark
  - Сохраняет выбор пользователя

### 3. Адаптированные компоненты

#### ✅ `components/BottomNav.tsx`
- Использует `useTheme()` и `getThemeColors()`
- **НО:** Стили все еще используют жестко заданные цвета
- Нужно обновить StyleSheet для использования динамических цветов

#### ⚠️ `pages/SettingsScreen.tsx`
- Использует `useTheme()` для переключателя
- **НО:** Стили используют жестко заданные цвета (#f9fafb, #111827 и т.д.)
- Тема применяется только к переключателю, не к самому экрану

## ❌ Что НЕ адаптировано под тему

### Основные страницы (высокий приоритет):

1. **`pages/HomeScreen.tsx`** ❌
   - 102+ жестко заданных цвета
   - `backgroundColor: '#f9fafb'`, `color: '#111827'`, `backgroundColor: '#ffffff'`
   - Не использует `useTheme()` или `getThemeColors()`

2. **`pages/MyPlantsScreen.tsx`** ❌
   - Множество жестко заданных цветов
   - Не использует тему

3. **`pages/PlantDetailScreen.tsx`** ❌
   - Множество жестко заданных цветов
   - Не использует тему

4. **`pages/OnboardingScreen.tsx`** ❌
   - Использует токены, но не адаптирован под тему
   - Токены жестко заданы для светлой темы

5. **`pages/SubscriptionScreen.tsx`** ❌
   - Использует токены, но не адаптирован под тему

### Второстепенные страницы (средний приоритет):

6. **`pages/MoreScreen.tsx`** ❌ - 25+ жестко заданных цветов
7. **`pages/DiagnosisScreen.tsx`** ❌ - 39+ жестко заданных цветов
8. **`pages/DiagnosisResultScreen.tsx`** ❌
9. **`pages/PlantAnalysisScreen.tsx`** ❌
10. **`pages/ArticleDetailScreen.tsx`** ❌
11. **`pages/ProblemDetailScreen.tsx`** ❌
12. **`pages/CategoryCatalogScreen.tsx`** ❌
13. **`pages/ArticlesCatalogScreen.tsx`** ❌
14. **`pages/WaterCalculatorScreen.tsx`** ❌
15. **`pages/LuxometerScreen.tsx`** ❌

### Специальные страницы (низкий приоритет):

16. **`pages/CameraScreen.tsx`** / **`pages/NewCameraScreen.tsx`** ❌
17. **`pages/ProcessingScreen.tsx`** ❌
18. **`pages/ResultScreen.tsx`** ❌
19. **`pages/SplashScreen.tsx`** ❌
20. **`pages/RepottingResultScreen.tsx`** ❌
21. **`pages/PhotoGuideScreen.tsx`** ❌
22. **`pages/DetailScreen.tsx`** ❌
23. **`pages/DocumentsScreen.tsx`** ❌
24. **`pages/PlantWelcomeScreen.tsx`** ❌

## 📊 Статистика

- **Полностью адаптировано:** 0 страниц
- **Частично адаптировано:** 2 компонента (BottomNav, SettingsScreen - только переключатель)
- **Не адаптировано:** ~24 страницы
- **Процент готовности:** ~4%

## 🔧 Что нужно сделать

### Для каждой страницы:

1. **Импортировать хук и утилиту:**
```typescript
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';
```

2. **Использовать тему в компоненте:**
```typescript
const { theme } = useTheme();
const colors = getThemeColors(theme);
```

3. **Заменить жестко заданные цвета:**
   - `#ffffff` → `colors.card` или `colors.background`
   - `#111827` → `colors.text`
   - `#f9fafb` → `colors.surface`
   - `#9ca3af` → `colors.textMuted`
   - `#6b7280` → `colors.textSecondary`
   - `rgba(0, 0, 0, 0.1)` → `colors.border`
   - `rgba(0, 0, 0, 0.05)` → `colors.borderLight`

4. **Обновить StyleSheet:**
   - Вариант 1: Использовать функцию для создания стилей
   ```typescript
   const getStyles = (colors: ThemeColors) => StyleSheet.create({
       container: {
           backgroundColor: colors.background,
       },
       text: {
           color: colors.text,
       },
   });
   ```
   
   - Вариант 2: Использовать inline стили для динамических цветов
   ```typescript
   <View style={[styles.container, { backgroundColor: colors.background }]}>
   ```

### Особые случаи:

- **OnboardingScreen и SubscriptionScreen:** Обновить токены для поддержки темной темы
- **BottomNav:** Обновить StyleSheet для использования динамических цветов
- **SettingsScreen:** Полностью адаптировать стили под тему

## 🎯 Рекомендуемый порядок адаптации

### Фаза 1 (Критично):
1. HomeScreen
2. MyPlantsScreen
3. PlantDetailScreen

### Фаза 2 (Важно):
4. OnboardingScreen
5. SubscriptionScreen
6. MoreScreen
7. SettingsScreen (полная адаптация)

### Фаза 3 (Желательно):
8. DiagnosisScreen
9. CategoryCatalogScreen
10. ArticlesCatalogScreen

### Фаза 4 (Опционально):
11. Остальные страницы

## ⚠️ Проблемы

1. **BottomNav** использует тему в компоненте, но стили жестко заданы
2. **SettingsScreen** использует тему только для переключателя
3. Большинство страниц полностью игнорируют тему

## 💡 Рекомендации

1. Создать утилиту для создания стилей с темой:
```typescript
export const createThemedStyles = (colors: ThemeColors) => ({
    // общие стили
});
```

2. Добавить проверку темы в CI/CD для новых страниц

3. Создать компоненты-обертки для часто используемых элементов (Card, Button и т.д.)
