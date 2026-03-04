# Отчет о проверке темы (Dark/Light Mode)

## ✅ Что работает

1. **Переключение темы:**
   - Реализовано в `hooks/useTheme.tsx`
   - Сохраняется в AsyncStorage (`plantlens_theme`)
   - Переключатель находится в `SettingsScreen`
   - Работает корректно

2. **Адаптированные компоненты:**
   - ✅ `components/BottomNav.tsx` - использует `useTheme()` и `getThemeColors()`
   - ✅ `pages/SettingsScreen.tsx` - использует `useTheme()` и адаптирован под тему

3. **Система цветов:**
   - ✅ `utils/themeColors.ts` - содержит `lightColors` и `darkColors`
   - ✅ Функция `getThemeColors(theme)` возвращает правильные цвета

## ❌ Что НЕ адаптировано под тему

Большинство страниц используют жестко заданные цвета и НЕ адаптированы под тему:

### Основные страницы:
1. **HomeScreen.tsx** - использует жестко заданные цвета:
   - `backgroundColor: '#f9fafb'`
   - `color: '#111827'`
   - `backgroundColor: '#ffffff'`
   - И многие другие

2. **MyPlantsScreen.tsx** - использует жестко заданные цвета:
   - `backgroundColor: '#f9fafb'`
   - `color: '#111827'`
   - `backgroundColor: '#ffffff'`
   - И многие другие

3. **PlantDetailScreen.tsx** - использует жестко заданные цвета:
   - `backgroundColor: '#ffffff'`
   - `color: '#111827'`
   - И многие другие

4. **OnboardingScreen.tsx** - использует жестко заданные цвета (токены, но не адаптированы под тему)

5. **SubscriptionScreen.tsx** - использует жестко заданные цвета

6. **MoreScreen.tsx** - использует жестко заданные цвета

7. **DiagnosisScreen.tsx** - использует жестко заданные цвета

8. **DiagnosisResultScreen.tsx** - использует жестко заданные цвета

9. **PlantAnalysisScreen.tsx** - использует жестко заданные цвета

10. **ArticleDetailScreen.tsx** - использует жестко заданные цвета

11. **ProblemDetailScreen.tsx** - использует жестко заданные цвета

12. **CategoryCatalogScreen.tsx** - использует жестко заданные цвета

13. **ArticlesCatalogScreen.tsx** - использует жестко заданные цвета

14. **WaterCalculatorScreen.tsx** - использует жестко заданные цвета

15. **LuxometerScreen.tsx** - использует жестко заданные цвета

16. **CameraScreen.tsx** / **NewCameraScreen.tsx** - используют жестко заданные цвета

17. **ProcessingScreen.tsx** - использует жестко заданные цвета

18. **ResultScreen.tsx** - использует жестко заданные цвета

19. **SplashScreen.tsx** - использует жестко заданные цвета

20. **RepottingResultScreen.tsx** - использует жестко заданные цвета

21. **PhotoGuideScreen.tsx** - использует жестко заданные цвета

22. **DetailScreen.tsx** - использует жестко заданные цвета

23. **DocumentsScreen.tsx** - использует жестко заданные цвета

24. **PlantWelcomeScreen.tsx** - использует жестко заданные цвета

## 🔧 Что нужно сделать

Для каждой страницы нужно:

1. Импортировать `useTheme` и `getThemeColors`:
```typescript
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';
```

2. Использовать тему в компоненте:
```typescript
const { theme } = useTheme();
const colors = getThemeColors(theme);
```

3. Заменить жестко заданные цвета на цвета из темы:
   - `#ffffff` → `colors.card` или `colors.background`
   - `#111827` → `colors.text`
   - `#f9fafb` → `colors.surface`
   - `#9ca3af` → `colors.textMuted`
   - `#6b7280` → `colors.textSecondary`
   - И т.д.

4. Обновить StyleSheet, чтобы использовать динамические цвета:
```typescript
const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.background,
    },
    text: {
        color: colors.text,
    },
    // и т.д.
});
```

## 📊 Статистика

- **Адаптировано:** 2 компонента (BottomNav, SettingsScreen)
- **Не адаптировано:** ~24 страницы
- **Процент готовности:** ~8%

## 🎯 Приоритеты

1. **Высокий приоритет:**
   - HomeScreen
   - MyPlantsScreen
   - PlantDetailScreen
   - OnboardingScreen

2. **Средний приоритет:**
   - MoreScreen
   - DiagnosisScreen
   - CategoryCatalogScreen
   - ArticlesCatalogScreen

3. **Низкий приоритет:**
   - Остальные страницы
