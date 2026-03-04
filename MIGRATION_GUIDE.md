# Руководство по миграции с веб-синтаксиса на React Native

## Общие паттерны замены

### 1. Импорты навигации
```typescript
// Было:
import { useNavigate, useLocation, useParams } from 'react-router-dom';

// Стало:
import { useNavigation, useRoute } from '@react-navigation/native';
```

### 2. Импорты иконок
```typescript
// Было:
import { ArrowLeft, Search, Check } from 'lucide-react';

// Стало:
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
// Используйте utils/iconMapping.ts для маппинга иконок
```

### 3. HTML элементы → React Native компоненты
```typescript
// Было:
<div className="..."> → <View style={styles.}>
<button onClick={...}> → <Pressable onPress={...}>
<img src="..." /> → <Image source={{ uri: "..." }} />
<a href="..."> → <Pressable onPress={...}>
<input /> → <TextInput />
<textarea /> → <TextInput multiline />
```

### 4. className → style
```typescript
// Было:
<div className="flex flex-col p-4 bg-white">

// Стало:
<View style={styles.container}>
// И в StyleSheet:
const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    padding: 16,
    backgroundColor: '#ffffff',
  },
});
```

### 5. onClick → onPress
```typescript
// Было:
<button onClick={handleClick}>

// Стало:
<Pressable onPress={handleClick}>
```

### 6. Навигация
```typescript
// Было:
const navigate = useNavigate();
navigate('/home');
navigate(-1);

// Стало:
const navigation = useNavigation();
navigation.navigate('Home' as never);
navigation.goBack();
```

### 7. localStorage → AsyncStorage
```typescript
// Было:
localStorage.getItem('key');
localStorage.setItem('key', 'value');

// Стало:
import AsyncStorage from '@react-native-async-storage/async-storage';
await AsyncStorage.getItem('key');
await AsyncStorage.setItem('key', 'value');
```

### 8. Условные классы → условные стили
```typescript
// Было:
<div className={`base ${isActive ? 'active' : ''}`}>

// Стало:
<View style={[styles.base, isActive && styles.active]}>
```

### 9. Tailwind классы → StyleSheet
```typescript
// Распространенные замены:
// flex → flexDirection: 'row' или 'column'
// p-4 → padding: 16
// m-4 → margin: 16
// bg-white → backgroundColor: '#ffffff'
// rounded-full → borderRadius: 9999
// text-center → textAlign: 'center'
// font-black → fontWeight: '900'
// text-lg → fontSize: 18
// gap-4 → gap: 16 (в flex контейнерах)
```

### 10. ScrollView для прокручиваемого контента
```typescript
// Было:
<div className="overflow-y-auto">

// Стало:
<ScrollView style={styles.container} contentContainerStyle={styles.content}>
```

## Обработанные файлы
- ✅ SplashScreen.tsx
- ✅ OnboardingScreen.tsx
- ✅ BottomNav.tsx
- ✅ SubscriptionScreen.tsx
- ✅ PlantDetailScreen.tsx (исправлен onClick → onPress)
- ✅ PlantAnalysisScreen.tsx

## Осталось обработать
- [ ] CameraScreen.tsx
- [ ] CropScreen.tsx
- [ ] ProcessingScreen.tsx
- [ ] DocumentsScreen.tsx
- [ ] DetailScreen.tsx
- [ ] MyPlantsScreen.tsx
- [ ] PhotoGuideScreen.tsx
- [ ] HomeScreen.tsx
- [ ] CategoryCatalogScreen.tsx
- [ ] ArticleDetailScreen.tsx
- [ ] ArticlesCatalogScreen.tsx
- [ ] DiagnosisScreen.tsx
- [ ] DiagnosisResultScreen.tsx
- [ ] MoreScreen.tsx
- [ ] ProblemDetailScreen.tsx
- [ ] LuxometerScreen.tsx
- [ ] WaterCalculatorScreen.tsx
- [ ] ResultScreen.tsx
- [ ] SettingsScreen.tsx
- [ ] RepottingResultScreen.tsx
