import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image, TextInput, FlatList, Modal, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { PottedPlantIcon } from '../components/CareIcons';
import { useI18n } from '../hooks/useI18n';
import { getDailyTips, getLibraryFallbackImage, getLibraryFallbackUrls } from '../services/contentService';
import { getRegionalCatalog, getTrendingPlants, getReliableImage, GENERIC_FALLBACK_IMAGE, generateWeatherInsight, generatePlantImageUrlWithFallback } from '../services/geminiService';
import { getBackupPlantImage } from '../services/plantImageService';
import {
    getPlantImageAIUrl,
    getPlantKey,
    getPlantImageUrl,
    isPlaceholderImageUrl,
    isPollinationsUrl,
    isInvalidImageDataUrl,
    fetchImageAsDataUrl,
    getPlantImageFirstAvailable,
    ensureFallbackCacheLoaded,
    } from '../services/plantImageService';
import { getTertiaryPlantImage } from '../services/tertiaryImageService';
import { getDiscoverPlantCache, setCachedPlant } from '../services/plantCacheService';
import { getCurrentWeather, WeatherData } from '../services/weatherService';
import { CatalogCategory, CatalogPlant, Plant, CareType } from '../types';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { scheduleCareNotification } from '../services/notificationService';
import { calculateOverallHealth } from '../services/careCalculator';
import { Image as ExpoImage } from 'expo-image';
import { useTheme } from '../hooks/useTheme';
import { useSubscription } from '../hooks/useSubscription';
import { getThemeColors } from '../utils/themeColors';

const SELECTED_LOCATION_STORAGE_KEY = 'plantlens_selected_location';

const DISCOVER_CATEGORY_KEYS: Record<string, 'category_poisonous' | 'category_indoor' | 'category_flowers' | 'category_allergens' | 'category_trees' | 'category_weeds' | 'category_regional_flora'> = {
    'Флора региона': 'category_regional_flora',
    'Ядовитые': 'category_poisonous', 'Домашние': 'category_indoor', 'Цветы': 'category_flowers',
    'Аллергены': 'category_allergens', 'Деревья': 'category_trees', 'Сорняки': 'category_weeds',
    'Poisonous': 'category_poisonous', 'Indoor': 'category_indoor', 'Flowers': 'category_flowers',
    'Allergens': 'category_allergens', 'Trees': 'category_trees', 'Weeds': 'category_weeds',
    'Regional flora': 'category_regional_flora',
};

const levenshteinDistance = (a: string, b: string): number => {
    const matrix = [];
    let i, j;
    for (i = 0; i <= b.length; i++) matrix[i] = [i];
    for (j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

// Проверка на похожие символы (для опечаток типа и/й, е/ё, о/а)
const areSimilarChars = (a: string, b: string): boolean => {
    const similarPairs: Record<string, string[]> = {
        'и': ['й', 'ы'],
        'й': ['и', 'ы'],
        'ы': ['и', 'й'],
        'е': ['ё', 'э'],
        'ё': ['е', 'э'],
        'э': ['е', 'ё'],
        'о': ['а'],
        'а': ['о'],
        'с': ['з'],
        'з': ['с'],
        'п': ['б'],
        'б': ['п'],
        'т': ['д'],
        'д': ['т'],
        'к': ['г'],
        'г': ['к'],
        'ш': ['ж'],
        'ж': ['ш'],
    };
    const lowerA = a.toLowerCase();
    const lowerB = b.toLowerCase();
    return lowerA === lowerB || (similarPairs[lowerA]?.includes(lowerB) || similarPairs[lowerB]?.includes(lowerA));
};

// Улучшенное расстояние с учетом похожих символов
const fuzzyDistance = (a: string, b: string): number => {
    const matrix = [];
    let i, j;
    for (i = 0; i <= b.length; i++) matrix[i] = [i];
    for (j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            const charA = a.charAt(j - 1);
            const charB = b.charAt(i - 1);
            
            if (charA === charB) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else if (areSimilarChars(charA, charB)) {
                // Похожие символы считаются как расстояние 0.5
                matrix[i][j] = matrix[i - 1][j - 1] + 0.5;
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

// Улучшенный алгоритм сопоставления с приоритетами и учетом опечаток
const calculateMatchQuality = (text: string, searchQuery: string): number => {
    const lowerText = text.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    
    // Точное совпадение (высший приоритет)
    if (lowerText === lowerQuery) return 0;
    
    // Начало слова (высокий приоритет)
    if (lowerText.startsWith(lowerQuery)) return 0.5;
    
    // Начало слова после пробела или дефиса
    const words = lowerText.split(/[\s-]+/);
    if (words.some(word => word.startsWith(lowerQuery))) return 0.7;
    
    // Вхождение подстроки
    if (lowerText.includes(lowerQuery)) return 1;
    
    // Проверка опечаток по словам (если запрос состоит из нескольких слов)
    const queryWords = lowerQuery.split(/[\s-]+/);
    if (queryWords.length > 1) {
        let bestWordMatch = 999;
        for (const queryWord of queryWords) {
            if (queryWord.length < 3) continue; // Пропускаем короткие слова
            for (const textWord of words) {
                if (textWord.includes(queryWord)) {
                    bestWordMatch = Math.min(bestWordMatch, 1.2);
                } else {
                    const wordDist = fuzzyDistance(queryWord, textWord);
                    const maxDist = Math.max(1, Math.floor(queryWord.length / 3)); // До 1/3 длины слова
                    if (wordDist <= maxDist && textWord.length >= queryWord.length - 1) {
                        bestWordMatch = Math.min(bestWordMatch, 1.5 + wordDist * 0.2);
                    }
                }
            }
        }
        if (bestWordMatch < 999) return bestWordMatch;
    }
    
    // Улучшенное расстояние с учетом похожих символов (для опечаток)
    const fuzzyDist = fuzzyDistance(lowerQuery, lowerText);
    const standardDist = levenshteinDistance(lowerQuery, lowerText);
    
    // Определяем максимально допустимое расстояние в зависимости от длины запроса
    const queryLen = lowerQuery.length;
    let maxDist: number;
    if (queryLen <= 3) {
        maxDist = 1; // Для очень коротких запросов - только 1 ошибка
    } else if (queryLen <= 5) {
        maxDist = 2; // Для коротких запросов - до 2 ошибок
    } else if (queryLen <= 8) {
        maxDist = 3; // Для средних запросов - до 3 ошибок
    } else {
        maxDist = Math.floor(queryLen / 3); // Для длинных - до 1/3 длины
    }
    
    // Используем лучшее из двух расстояний (fuzzy или стандартное)
    const bestDist = Math.min(fuzzyDist, standardDist);
    
    // Проверяем, подходит ли результат
    if (bestDist <= maxDist && lowerText.length >= queryLen - maxDist) {
        // Качество совпадения зависит от расстояния и длины
        const quality = 1.8 + bestDist * 0.15;
        return quality;
    }
    
    return 999; // Не подходит
};

const POPULAR_PLANTS_DB = [
    // Популярные комнатные растения
    "Monstera Deliciosa", "Ficus Elastica", "Sansevieria", "Zamioculcas", 
    "Spathiphyllum", "Orchid Phalaenopsis", "Aloe Vera", "Dracaena", 
    "Chlorophytum", "Begonia", "Peperomia", "Calathea", "Alocasia", 
    "Philodendron", "Pothos", "Succulent", "Cactus", "Lavender", "Basil", 
    "Mint", "Rose", "Hydrangea", "Azalea", "Fern", "Ivy", "Palm", "Yucca",
    "Монстера", "Фикус", "Сансевиерия", "Замиокулькас", "Спатифиллум", 
    "Орхидея", "Алоэ", "Драцена", "Хлорофитум", "Бегония", "Калатея", 
    "Алоказия", "Филодендрон", "Кактус", "Суккулент", "Роза", "Гортензия",
    "Пилея", "Пилея Пеперомиевидная",
    // Дополнительные популярные растения
    "Jade Plant", "Snake Plant", "Rubber Plant", "Peace Lily", "ZZ Plant",
    "Spider Plant", "Pothos", "English Ivy", "Fiddle Leaf Fig", "Anthurium",
    "Dieffenbachia", "Schefflera", "Croton", "Coleus", "Tradescantia",
    "Pothos Golden", "Monstera Adansonii", "Philodendron Brasil", "Hoya",
    "Ficus Lyrata", "Strelitzia", "Maranta", "Syngonium", "Scindapsus",
    "Pilea", "Pilea Peperomioides", "Chinese Money Plant",
    // Садовые растения
    "Tulip", "Daisy", "Sunflower", "Lily", "Peony", "Iris", "Dahlia",
    "Petunia", "Marigold", "Pansy", "Geranium", "Chrysanthemum", "Carnation",
    "Тюльпан", "Ромашка", "Подсолнух", "Лилия", "Пион", "Ирис", "Георгин",
    "Петуния", "Бархатцы", "Анютины глазки", "Герань", "Хризантема", "Гвоздика",
    // Травы и специи
    "Rosemary", "Thyme", "Oregano", "Sage", "Cilantro", "Parsley", "Dill",
    "Розмарин", "Тимьян", "Орегано", "Шалфей", "Кинза", "Петрушка", "Укроп",
    // Овощи
    "Tomato", "Pepper", "Cucumber", "Lettuce", "Spinach", "Carrot", "Onion",
    "Помидор", "Перец", "Огурец", "Салат", "Шпинат", "Морковь", "Лук"
];

/** WMO weather code → иконка погоды. Для частично облачно (1–2) partlyCloudy: true — рисуем солнце и облако разными цветами в стиле partly-sunny. */
const getWeatherConditionIcon = (weatherCode: number | undefined): { name: keyof typeof Ionicons.glyphMap; color: string; partlyCloudy?: boolean } => {
    const code = weatherCode ?? 0;
    if (code === 0) return { name: 'sunny', color: '#eab308' };
    if (code >= 1 && code <= 2) return { name: 'partly-sunny', color: '#eab308', partlyCloudy: true };
    if (code === 3 || code === 45 || code === 48) return { name: 'cloudy', color: '#64748b' };
    if (code >= 51 && code <= 67 || code >= 80 && code <= 82) return { name: 'rainy', color: '#3b82f6' };
    if (code >= 95 && code <= 99) return { name: 'thunderstorm', color: '#6366f1' };
    if (code >= 71 && code <= 77 || code >= 85 && code <= 86) return { name: 'snow', color: '#06b6d4' };
    return { name: 'partly-sunny', color: '#eab308', partlyCloudy: true };
};

const getCategoryIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('regional') || t.includes('region') || t.includes('flora') || t.includes('флора')) return { icon: 'location', library: 'Ionicons', color: '#059669', bg: 'rgba(5, 150, 105, 0.1)' };
    if (t.includes('poison') || t.includes('toxic') || t.includes('яд') || t.includes('опасн')) return { icon: 'skull', library: 'Ionicons', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' };
    if (t.includes('flower') || t.includes('bloom') || t.includes('цвет')) return { icon: 'flower', library: 'Ionicons', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.1)' };
    if (t.includes('allergy') || t.includes('allergen') || t.includes('аллерг')) return { icon: 'cloud', library: 'Ionicons', color: '#eab308', bg: 'rgba(234, 179, 8, 0.1)' };
    if (t.includes('indoor') || t.includes('house') || t.includes('дом')) return { icon: 'home', library: 'Ionicons', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' };
    if (t.includes('tree') || t.includes('дерев')) return { icon: 'tree', library: 'MaterialCommunityIcons', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
    if (t.includes('weed') || t.includes('invader') || t.includes('сорняк')) return { icon: 'cut', library: 'Ionicons', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)' };
    return { icon: 'leaf', library: 'Ionicons', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
};

/** Изображение: по возможности из кэша ExpoImage, иначе основной → запасной → третий при ошибках (карточки задач). */
const AgendaTaskImage: React.FC<{ primaryUri: string; backupUri: string; tertiaryUri: string; style: any; resizeMode?: 'cover' | 'contain' | 'stretch' }> = ({ primaryUri, backupUri, tertiaryUri, style, resizeMode }) => {
    const [uri, setUri] = useState(primaryUri);
    useEffect(() => {
        setUri(primaryUri);
        if (primaryUri && (primaryUri.startsWith('http://') || primaryUri.startsWith('https://'))) {
            let cancelled = false;
            (ExpoImage.getCachePathAsync?.(primaryUri) ?? Promise.resolve(null)).then((cachePath) => {
                if (cancelled || !cachePath || !cachePath.length) return;
                const fileUri = cachePath.startsWith('file://') ? cachePath : `file://${cachePath}`;
                setUri(fileUri);
            }).catch(() => {});
            return () => { cancelled = true; };
        }
    }, [primaryUri]);
    const onError = () => setUri((prev) => (prev === backupUri ? tertiaryUri : backupUri));
    return (
        <ExpoImage
            source={{ uri: uri || backupUri }}
            style={style}
            contentFit={resizeMode === 'contain' ? 'contain' : resizeMode === 'stretch' ? 'fill' : 'cover'}
            cachePolicy="disk"
            onError={onError}
        />
    );
};

/** Карточка совета: фон — фолбэк по категории (URL), сверху — фото статьи или фолбэк при ошибке. */
const TipCardImage: React.FC<{ tip: any; style: any }> = ({ tip, style }) => {
    const fallbackByCategory = getLibraryFallbackImage(tip?.category);
    const primaryUri = (tip?.image && (tip.image.startsWith('http') || tip.image.startsWith('data:'))) ? tip.image : fallbackByCategory;
    const [uri, setUri] = useState(() => primaryUri);
    useEffect(() => {
        const next = (tip?.image && (tip.image.startsWith('http') || tip.image.startsWith('data:'))) ? tip.image : fallbackByCategory;
        setUri(next);
    }, [tip?.id, tip?.image, tip?.category]);
    const onError = () => setUri(fallbackByCategory);
    const sourceUri = uri || fallbackByCategory;
    return (
        <View style={[style, { position: 'relative', overflow: 'hidden', minHeight: 128 }]}>
            <ExpoImage
                source={{ uri: fallbackByCategory }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="disk"
            />
            <ExpoImage
                key={`tip-img-${tip?.id}-${String(sourceUri).slice(-40)}`}
                source={{ uri: sourceUri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="disk"
                onError={onError}
            />
        </View>
    );
};

/** Карточка тренда: полностью управляемая — источник фото только из primaryUri (родитель). */
const TrendingPlantCard: React.FC<{
    plant: CatalogPlant;
    primaryUri: string;
    onPress: () => void;
    onImageError?: (plant: CatalogPlant) => void;
    styles: Record<string, any>;
}> = ({ plant, primaryUri, onPress, onImageError, styles: s }) => {
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    
    const handleError = () => {
        onImageError?.(plant);
    };
    return (
        <Pressable onPress={onPress} style={[s.trendingCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
            <View style={s.trendingImageContainer}>
                <ExpoImage
                    key={primaryUri.slice(0, 120)}
                    source={{ uri: primaryUri }}
                    style={s.trendingImage}
                    contentFit="cover"
                    cachePolicy="disk"
                    onError={handleError}
                />
                <View style={[s.trendingImageOverlay, { backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)' }]} />
            </View>
            <View style={s.trendingContent}>
                <Text style={[s.trendingName, { color: colors.text }]} numberOfLines={1}>{plant.commonName}</Text>
                {plant.scientificName && (
                    <Text style={[s.trendingScientific, { color: colors.textSecondary }]} numberOfLines={1}>{plant.scientificName}</Text>
                )}
                {plant.description && (
                    <Text style={[s.trendingDescription, { color: colors.textMuted }]} numberOfLines={2}>{plant.description}</Text>
                )}
            </View>
        </Pressable>
    );
};

/** Карточка подсказки поиска с фото (система Discover). */
const SearchSuggestionCard: React.FC<{
    suggestion: SearchSuggestion;
    onPress: () => void;
    styles: Record<string, any>;
}> = ({ suggestion, onPress, styles: s }) => {
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const [imageUri, setImageUri] = useState<string | null>(suggestion.imageUrl || null);

    useEffect(() => {
        let cancelled = false;
        const query = suggestion.scientificName || suggestion.label;
        if (!query) {
            setImageUri(null);
            return;
        }

        if (suggestion.type === 'garden' && suggestion.imageUrl && !isPlaceholderImageUrl(suggestion.imageUrl)) {
            setImageUri(suggestion.imageUrl);
            return;
        }

        (async () => {
            try {
                const timeoutPromise = new Promise<string>((_, reject) => 
                    setTimeout(() => reject(new Error('Image fetch timeout')), 8000)
                );
                const url = await Promise.race([
                    getPlantImageFirstAvailable(query),
                    timeoutPromise
                ]).catch(() => null);
                
                if (cancelled) return;
                if (url && typeof url === 'string' && url.length > 0 && !isPlaceholderImageUrl(url)) {
                    setImageUri(url);
                    // Сохраняем изображение в кэш Discover для повторного использования
                    const plantKey = getPlantKey({ commonName: suggestion.label, scientificName: suggestion.scientificName });
                    setCachedPlant(plantKey, {
                        commonName: suggestion.label,
                        scientificName: suggestion.scientificName || '',
                        description: '',
                        imageUrl: url
                    }).catch(() => {
                        // Игнорируем ошибки сохранения в кэш
                    });
                } else {
                    const fallback = getPlantImageAIUrl(query || 'plant');
                    setImageUri(fallback);
                }
            } catch (e) {
                if (cancelled) return;
                try {
                    const fallback = getPlantImageAIUrl(query || 'plant');
                    setImageUri(fallback);
                } catch (err) {
                    console.error('[HomeScreen] SearchSuggestionCard: all image loading failed', { query, error: String(e), fallbackError: String(err) });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [suggestion.label, suggestion.scientificName, suggestion.type, suggestion.imageUrl]);

    const imageSource = imageUri && typeof imageUri === 'string' && imageUri.length > 0 && (imageUri.startsWith('http') || imageUri.startsWith('data:') || imageUri.startsWith('file://')) ? { uri: imageUri } : undefined;

    return (
        <Pressable
            onPress={onPress}
            style={[s.suggestionItem, { borderBottomColor: colors.borderLight }]}
        >
            <View style={s.suggestionContent}>
                {imageSource && imageSource.uri ? (
                    <View style={s.suggestionImageContainer}>
                        <ExpoImage
                            source={imageSource}
                            style={s.suggestionImage}
                            contentFit="cover"
                            cachePolicy="disk"
                            recyclingKey={`search-${suggestion.id}`}
                            onError={(e) => {
                                try {
                                    const query = suggestion.scientificName || suggestion.label || 'plant';
                                    setImageUri(getPlantImageAIUrl(query));
                                } catch (err) {
                                    console.warn('[HomeScreen] SearchSuggestionCard: onError handler failed', err);
                                }
                            }}
                        />
                    </View>
                ) : (
                    <View style={[s.suggestionIcon, { backgroundColor: colors.surface }, suggestion.type === 'garden' ? s.suggestionIconGarden : s.suggestionIconGlobal]}>
                        {suggestion.type === 'garden' ? (
                            <Ionicons name="leaf" size={18} color={colors.primary} />
                        ) : (
                            <Ionicons name="globe" size={18} color={colors.info} />
                        )}
                    </View>
                )}
                <View style={s.suggestionTextContainer}>
                    <Text style={[s.suggestionLabel, { color: colors.text }, suggestion.type === 'garden' && s.suggestionLabelGarden]}>
                        {suggestion.label}
                    </Text>
                    <Text style={[s.suggestionSubLabel, { color: colors.textSecondary }]}>{suggestion.subLabel}</Text>
                </View>
            </View>
            <Ionicons name="arrow-up" size={16} color={colors.textMuted} />
        </Pressable>
    );
};

interface HomeScreenProps {
    plants: Plant[];
    updatePlant: (plant: Plant) => void;
}

interface SearchSuggestion {
    id: string;
    label: string;
    subLabel?: string;
    type: 'garden' | 'global';
    matchQuality: number;
    imageUrl?: string;
    scientificName?: string;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ plants, updatePlant }) => {
    const navigation = useNavigation();
    const { t, language } = useI18n();
    const { theme } = useTheme();
    const { isSubscribed } = useSubscription();
    const colors = getThemeColors(theme);
    const isOnline = useOnlineStatus();
    const [searchQuery, setSearchQuery] = useState('');
    const [dailyTips, setDailyTips] = useState<any[]>([]);
    const [regionalCatalog, setRegionalCatalog] = useState<{ locationName: string, categories: CatalogCategory[] } | null>(null);
    const [trendingPlants, setTrendingPlants] = useState<CatalogPlant[]>([]);
    const [trendingDiscoverCache, setTrendingDiscoverCache] = useState<Record<string, string>>({});
    const [trendingResolvedUris, setTrendingResolvedUris] = useState<Record<string, string>>({});
    const [trendingRetryUris, setTrendingRetryUris] = useState<Record<string, string>>({});
    const [trendingAiDataUrls, setTrendingAiDataUrls] = useState<Record<string, string>>({});
    const fetchingTrendingAiRef = useRef<Set<string>>(new Set());
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [weatherInsight, setWeatherInsight] = useState<string>('');
    const [completedTasks, setCompletedTasks] = useState<string[]>([]);
    const [taskToConfirm, setTaskToConfirm] = useState<{plantId: string, taskKey: string} | null>(null);
    
    const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const wikidataSearchRef = useRef<{ query: string; cancelled: boolean } | null>(null);
    
    // Location picker state
    const [showLocationPicker, setShowLocationPicker] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState<{ name: string; lat: number; lon: number } | null>(null);
    const [customCityQuery, setCustomCityQuery] = useState('');
    const [customCityResults, setCustomCityResults] = useState<{ name: string; lat: number; lon: number }[]>([]);
    const [isSearchingCity, setIsSearchingCity] = useState(false);
    
    // Predefined locations (display names via translations for all app languages)
    const locationKeys: { key: Parameters<typeof t>[0]; lat: number; lon: number }[] = [
        { key: 'location_city_moscow', lat: 55.7558, lon: 37.6173 },
        { key: 'location_city_spb', lat: 59.9343, lon: 30.3351 },
        { key: 'location_city_sochi', lat: 43.5855, lon: 39.7231 },
        { key: 'location_city_kazan', lat: 55.7887, lon: 49.1221 },
        { key: 'location_city_krasnodar', lat: 45.0355, lon: 38.9753 },
        { key: 'location_city_novosibirsk', lat: 55.0084, lon: 82.9357 },
        { key: 'location_city_ekb', lat: 56.8389, lon: 60.6057 },
        { key: 'location_city_vladivostok', lat: 43.1155, lon: 131.8855 },
        { key: 'location_city_kaliningrad', lat: 54.7104, lon: 20.4522 },
        { key: 'location_city_crimea', lat: 44.4952, lon: 34.1663 },
    ];
    
    const NOTIF_BODY_KEYS: Record<string, 'notif_water_reminder' | 'notif_fertilize_reminder' | 'notif_misting_reminder' | 'notif_repot_reminder'> = { watering: 'notif_water_reminder', fertilizing: 'notif_fertilize_reminder', misting: 'notif_misting_reminder', repotting: 'notif_repot_reminder' };
    const reminderConfigs = useMemo(() => [
        { key: 'watering', label: t('care_water'), actionType: 'watered' as CareType, icon: 'water-outline', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', defaultFreq: 7 },
        { key: 'fertilizing', label: t('care_fertilize'), actionType: 'fertilized' as CareType, icon: 'leaf-outline', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', defaultFreq: 30 },
        { key: 'misting', label: t('care_misting'), actionType: 'misting' as CareType, icon: 'spray-bottle', iconLibrary: 'MaterialCommunityIcons' as const, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', defaultFreq: 2 },
        { key: 'repotting', label: t('care_repot'), actionType: 'repotted' as CareType, icon: 'potted-plant', iconLibrary: 'PottedPlant' as const, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', defaultFreq: 365 },
    ], [t]);

    // Reverse geocoding - get city name from coordinates (Nominatim)
    const reverseGeocode = async (lat: number, lon: number): Promise<string> => {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
                { headers: { 'Accept-Language': language, 'User-Agent': 'PlantLens/1.0' } }
            );
            const data = await response.json();
            const addr = data?.address || {};
            const city =
                addr.city ||
                addr.town ||
                addr.village ||
                addr.municipality ||
                addr.county ||
                addr.state_district ||
                addr.state ||
                (data.display_name ? String(data.display_name).split(',')[0].trim() : null) ||
                t('location_your_region');
            return city;
        } catch (e) {
            const isNetworkError = e instanceof TypeError && (e.message === 'Network request failed' || e.message?.includes('Network'));
            if (!isNetworkError && __DEV__) {
                console.warn('Reverse geocoding failed:', e);
            }
            return t('location_your_region');
        }
    };

    // Search for city using OpenStreetMap Nominatim API
    const searchCity = async (query: string) => {
        if (query.length < 2) {
            setCustomCityResults([]);
            return;
        }
        
        setIsSearchingCity(true);
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
                { headers: { 'Accept-Language': language, 'User-Agent': 'PlantLens/1.0' } }
            );
            const data = await response.json();
            const results = data.map((item: any) => ({
                name: item.display_name.split(',')[0] + (item.address?.country ? `, ${item.address.country}` : ''),
                lat: parseFloat(item.lat),
                lon: parseFloat(item.lon)
            }));
            setCustomCityResults(results);
        } catch (e) {
            console.warn('City search failed:', e);
            setCustomCityResults([]);
        } finally {
            setIsSearchingCity(false);
        }
    };

    // Handle manual location selection
    const handleLocationSelect = async (location: { name: string; lat: number; lon: number }) => {
        setSelectedLocation(location);
        setShowLocationPicker(false);
        setCustomCityQuery('');
        setCustomCityResults([]);
        try {
            await AsyncStorage.setItem(SELECTED_LOCATION_STORAGE_KEY, JSON.stringify(location));
        } catch (_) {}
        if (isSubscribed) {
            const weatherData = await getCurrentWeather(location.lat, location.lon);
            setWeather(weatherData);
        } else {
            setWeather(null);
        }
        const catalogData = await getRegionalCatalog(location.lat, location.lon, language);
        setRegionalCatalog({ ...catalogData, locationName: location.name });
    };

    useEffect(() => {
        const urls = getLibraryFallbackUrls();
        if (urls.length) ExpoImage.prefetch(urls, 'disk').catch(() => {});
    }, []);
    useEffect(() => {
        setDailyTips(getDailyTips(language));

        const loadData = async () => {
            let lat = 55.7558;
            let lon = 37.6173;
            let locationName = t('location_flora_region');

            let usedSavedLocation = false;
            try {
                const saved = await AsyncStorage.getItem(SELECTED_LOCATION_STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved) as { name?: string; lat?: number; lon?: number };
                    if (typeof parsed?.lat === 'number' && typeof parsed?.lon === 'number') {
                        lat = parsed.lat;
                        lon = parsed.lon;
                        locationName = (parsed.name && String(parsed.name).trim()) || locationName;
                        setSelectedLocation({ name: locationName, lat, lon });
                        usedSavedLocation = true;
                    }
                }
            } catch (_) {}

            if (!usedSavedLocation) {
                try {
                    const { status } = await Location.requestForegroundPermissionsAsync();
                    if (status === 'granted') {
                        const location = await Location.getCurrentPositionAsync({});
                        lat = location.coords.latitude;
                        lon = location.coords.longitude;
                        locationName = await reverseGeocode(lat, lon);
                        const loc = { name: locationName, lat, lon };
                        setSelectedLocation(loc);
                        await AsyncStorage.setItem(SELECTED_LOCATION_STORAGE_KEY, JSON.stringify(loc));
                    }
                } catch (e) {
                    console.log('Location access denied or timeout, using default');
                }
            }

            if (isSubscribed) {
                const weatherData = await getCurrentWeather(lat, lon);
                setWeather(weatherData);
            } else {
                setWeather(null);
            }

            const catalogData = await getRegionalCatalog(lat, lon, language);
            setRegionalCatalog({ ...catalogData, locationName });
            
            const trending = await getTrendingPlants(0, language);
            setTrendingPlants(trending);
            console.log('[PlantLens тренды] загружены', { count: trending.length, keys: trending.map((p) => getPlantKey(p)) });
            const discoverCache = await getDiscoverPlantCache();
            const uriMap: Record<string, string> = {};
            Object.entries(discoverCache).forEach(([k, v]) => {
                if (v?.imageUrl && !v.imageUrl.startsWith('data:image/gif;base64')) uriMap[k] = v.imageUrl;
            });
            setTrendingDiscoverCache(uriMap);
            if (Object.keys(uriMap).length > 0) {
                console.log('[PlantLens кэш] тренды: подставлен Discover-кэш', { keys: Object.keys(uriMap) });
            }
            trending.forEach((plant) => {
                const key = getPlantKey(plant);
                getPlantImageUrl(plant, { aiFallback: generatePlantImageUrlWithFallback }).then((url) => {
                    if (!url || isPlaceholderImageUrl(url)) return;
                    setTrendingResolvedUris((prev) => ({ ...prev, [key]: url }));
                    setTrendingDiscoverCache((prev) => ({ ...prev, [key]: url })); // in-memory кэш = приложение видит данные
                    setCachedPlant(key, { ...plant, imageUrl: url }).catch(() => {});
                    console.log('[PlantLens кэш] тренды: добавлен URL при загрузке', { key, isDataUrl: url.startsWith('data:') });
                });
            });
        };

        loadData();
    }, [language]);

    // Load or clear weather when subscription status changes
    useEffect(() => {
        if (!isSubscribed) {
            setWeather(null);
            setWeatherInsight('');
            return;
        }
        const loc = selectedLocation ?? { name: t('location_flora_region'), lat: 55.7558, lon: 37.6173 };
        getCurrentWeather(loc.lat, loc.lon).then(setWeather).catch(() => setWeather(null));
    }, [isSubscribed, selectedLocation?.lat, selectedLocation?.lon]);

    const handleTrendingImageError = (plant: CatalogPlant) => {
        const key = getPlantKey(plant);
        console.log('[PlantLens фото] Главная: ошибка картинки тренда, запрашиваем новый URL', { key });
        getPlantImageUrl(plant, { skipCache: true, aiFallback: generatePlantImageUrlWithFallback })
            .then((url) => {
                console.log('[PlantLens фото] Главная: получили URL, подставляем в тренд', { key, ok: !!(url && !isPlaceholderImageUrl(url)) });
                if (!url || isPlaceholderImageUrl(url)) return;
                const safeUrl = isPollinationsUrl(url) ? getBackupPlantImage(plant.scientificName || plant.commonName) : url;
                setTrendingRetryUris((prev) => ({ ...prev, [key]: safeUrl }));
                setTrendingResolvedUris((prev) => ({ ...prev, [key]: safeUrl }));
                setTrendingDiscoverCache((prev) => ({ ...prev, [key]: safeUrl }));
                setCachedPlant(key, { ...plant, imageUrl: safeUrl }).catch(() => {});
                if (isPollinationsUrl(url)) {
                    fetchingTrendingAiRef.current.add(key);
                    console.log('[PlantLens фото] Главная: начинаем загрузку AI → data URL', { key });
                    const queryForCache = plant.scientificName || plant.commonName || 'plant';
                    const tryFetch = () => fetchImageAsDataUrl(url, undefined, queryForCache);
                    tryFetch()
                        .then((dataUrl) => {
                            const withDataUrl = { ...plant, imageUrl: dataUrl };
                            setCachedPlant(key, withDataUrl).catch(() => {});
                            setTrendingDiscoverCache((prev) => ({ ...prev, [key]: dataUrl }));
                            setTrendingAiDataUrls((prev) => ({ ...prev, [key]: dataUrl }));
                            console.log('[PlantLens кэш] тренды: добавлено AI-фото (data URL) после ошибки картинки', { key });
                            console.log('[PlantLens тренды] обновление карточки', { key });
                        })
                        .catch((err) => {
                            console.warn('[PlantLens фото] Главная: не удалось загрузить AI → data URL', { key, err: String(err) });
                            tryFetch().then((dataUrl) => {
                                const withDataUrl = { ...plant, imageUrl: dataUrl };
                                setCachedPlant(key, withDataUrl).catch(() => {});
                                setTrendingDiscoverCache((prev) => ({ ...prev, [key]: dataUrl }));
                                setTrendingAiDataUrls((prev) => ({ ...prev, [key]: dataUrl }));
                                console.log('[PlantLens кэш] тренды: добавлено AI-фото (повтор)', { key });
                            }).catch((e2) => console.warn('[PlantLens фото] Главная: повтор загрузки data URL failed', { key, err: String(e2) }));
                        })
                        .finally(() => { fetchingTrendingAiRef.current.delete(key); });
                }
            })
            .catch((err) => console.warn('[PlantLens фото] Главная: ошибка при получении URL', { key, err: String(err) }));
    };

    // Для трендов: AI (Pollinations) URL загружаем в data URL, чтобы ExpoImage отображал фото
    useEffect(() => {
        if (trendingPlants.length === 0) return;
        ensureFallbackCacheLoaded().then(() => {
            trendingPlants.forEach((plant) => {
                const key = getPlantKey(plant);
                const rawUri = trendingRetryUris[key] || trendingResolvedUris[key] || trendingDiscoverCache[key] || plant.imageUrl || '';
                const primaryUri = (rawUri && !isPlaceholderImageUrl(rawUri)) ? rawUri : getPlantImageAIUrl(plant.scientificName || 'plant');
                if (!isPollinationsUrl(primaryUri) || trendingAiDataUrls[key] || fetchingTrendingAiRef.current.has(key)) return;
                fetchingTrendingAiRef.current.add(key);
                console.log('[PlantLens фото] Главная: начинаем загрузку AI → data URL (effect)', { key });
                const queryForCache = plant.scientificName || plant.commonName || 'plant';
                fetchImageAsDataUrl(primaryUri, undefined, queryForCache)
                .then((dataUrl) => {
                    const withDataUrl = { ...plant, imageUrl: dataUrl };
                    setCachedPlant(key, withDataUrl).catch(() => {});
                    setTrendingDiscoverCache((prev) => ({ ...prev, [key]: dataUrl }));
                    setTrendingAiDataUrls((prev) => (prev[key] ? prev : { ...prev, [key]: dataUrl }));
                    console.log('[PlantLens кэш] тренды: добавлено AI-фото (data URL)', { key });
                    console.log('[PlantLens тренды] обновление карточки', { key });
                })
                .catch((err) => {
                    console.warn('[PlantLens фото] Главная: не удалось загрузить AI → data URL (effect)', { key, err: String(err) });
                })
                .finally(() => { fetchingTrendingAiRef.current.delete(key); });
            });
        });
    }, [trendingPlants, trendingRetryUris, trendingResolvedUris, trendingDiscoverCache, trendingAiDataUrls]);

    // Список трендов с уже подставленным URI — при изменении state получается новый массив, карточки перерисовываются
    const trendingPlantsWithUri = useMemo(() => {
        return trendingPlants.map((plant) => {
            const key = getPlantKey(plant);
            const rawUri = trendingRetryUris[key] || trendingResolvedUris[key] || trendingDiscoverCache[key] || plant.imageUrl || '';
            const primaryUri = (rawUri && !isPlaceholderImageUrl(rawUri))
                ? rawUri
                : getPlantImageAIUrl(plant.scientificName || 'plant');
            const effectiveUri = (isPollinationsUrl(primaryUri) || isInvalidImageDataUrl(primaryUri))
                ? (trendingAiDataUrls[key] || getBackupPlantImage(plant.scientificName || plant.commonName))
                : primaryUri;
            const safeUri = (effectiveUri && !isInvalidImageDataUrl(effectiveUri) && ((effectiveUri.startsWith('http')) || (effectiveUri.startsWith('data:image')))) ? effectiveUri : getBackupPlantImage(plant.scientificName || plant.commonName);
            return { ...plant, __effectiveImageUri: safeUri };
        });
    }, [trendingPlants, trendingRetryUris, trendingResolvedUris, trendingDiscoverCache, trendingAiDataUrls]);

    // Search city when query changes
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (customCityQuery.trim().length >= 2) {
                searchCity(customCityQuery);
            } else {
                setCustomCityResults([]);
            }
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [customCityQuery]);

    // Generate AI insight when weather changes (Premium only)
    useEffect(() => {
        if (!isSubscribed || !weather) return;
        if (weather && isOnline) {
            generateWeatherInsight(weather, language)
                .then(insight => setWeatherInsight(insight))
                .catch(error => {
                    console.error('Failed to generate weather insight:', error);
                    setWeatherInsight(weather.humidity < 40 ? t('weather_fallback_low_humidity') : t('weather_fallback_ok'));
                });
        } else if (weather && !isOnline) {
            setWeatherInsight(weather.humidity < 40 ? t('weather_fallback_low_humidity') : t('weather_fallback_ok'));
        }
    }, [isSubscribed, weather, isOnline, language, t]);

    useEffect(() => {
        if (!searchQuery || searchQuery.length < 2) {
            setSuggestions([]);
            return;
        }

        const query = searchQuery.toLowerCase().trim();
        const results: SearchSuggestion[] = [];

        // Поиск по растениям пользователя
        plants.forEach(p => {
            const common = p.commonName.toLowerCase();
            const sci = p.scientificName?.toLowerCase() || '';
            
            const commonMatch = calculateMatchQuality(p.commonName, query);
            const sciMatch = sci ? calculateMatchQuality(p.scientificName || '', query) : 999;
            const bestMatch = Math.min(commonMatch, sciMatch);
            
            if (bestMatch < 999) {
                const isExact = commonMatch === 0 || sciMatch === 0;
                const isStart = commonMatch <= 0.7 || sciMatch <= 0.7;
                const isTypo = bestMatch >= 1.8;
                
                let subLabel = t('home_in_my_garden');
                if (isTypo) {
                    subLabel = t('home_in_my_garden_fuzzy');
                } else if (!isExact && !isStart) {
                    subLabel = t('home_in_my_garden_fuzzy');
                }
                
                results.push({ 
                    id: p.id, 
                    label: p.commonName, 
                    subLabel,
                    type: 'garden',
                    matchQuality: bestMatch,
                    imageUrl: p.imageUrl,
                    scientificName: p.scientificName
                });
            }
        });

        // Поиск по глобальной базе
        POPULAR_PLANTS_DB.forEach(name => {
            const n = name.toLowerCase();
            if (results.some(r => r.label.toLowerCase() === n)) return;

            const matchQuality = calculateMatchQuality(name, query);
            
            if (matchQuality < 999) {
                let subLabel = t('home_global_search');
                if (matchQuality === 0) {
                    subLabel = t('home_global_search');
                } else if (matchQuality <= 0.7) {
                    subLabel = t('home_global_search');
                } else if (matchQuality <= 1) {
                    subLabel = t('home_global_search');
                } else if (matchQuality <= 1.8) {
                    subLabel = t('home_global_search');
                } else {
                    subLabel = t('home_did_you_mean');
                }
                
                results.push({
                    id: `global-${name}`,
                    label: name,
                    subLabel,
                    type: 'global',
                    matchQuality
                });
            }
        });

        // Фильтрация: для коротких запросов (<= 5 символов) показываем только хорошие совпадения
        // Для длинных запросов показываем также результаты с опечатками (до 2.5)
        const filteredResults = query.length <= 5 
            ? results.filter(r => r.matchQuality <= 2.0) // Точные совпадения, начало слова, вхождение или легкие опечатки
            : results.filter(r => r.matchQuality <= 2.5); // Для длинных запросов - более гибкая фильтрация
        
        // Сортировка: сначала по качеству совпадения, затем по типу (garden > global)
        filteredResults.sort((a, b) => {
            if (Math.abs(a.matchQuality - b.matchQuality) < 0.1) {
                // Если качество совпадения примерно одинаковое, приоритет растениям из сада
                if (a.type === 'garden' && b.type !== 'garden') return -1;
                if (a.type !== 'garden' && b.type === 'garden') return 1;
            }
            return a.matchQuality - b.matchQuality;
        });
        
        // Показываем 3-5 наиболее вероятных совпадений
        // Приоритет результатам с хорошим качеством совпадения (<= 1)
        const goodMatches = filteredResults.filter(r => r.matchQuality <= 1);
        const maxResults = Math.min(5, Math.max(3, goodMatches.length > 0 ? goodMatches.length : 3));
        const initialResults = filteredResults.slice(0, maxResults);
        setSuggestions(initialResults);
        
        // Асинхронный поиск через Wikidata для расширения результатов (если результатов мало и запрос >= 3 символов)
        if (isOnline && query.length >= 3 && initialResults.length < 3) {
            // Отменяем предыдущий поиск
            if (wikidataSearchRef.current) {
                wikidataSearchRef.current.cancelled = true;
            }
            
            const searchState = { query, cancelled: false };
            wikidataSearchRef.current = searchState;
            
            // Поиск через Wikidata с задержкой (debounce)
            setTimeout(async () => {
                if (searchState.cancelled || searchState.query !== query) return;
                
                try {
                    const searchTerm = query.includes(' ') ? query : `${query} plant`;
                    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchTerm)}&language=en,ru&limit=5&format=json&origin=*`;
                    
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 5000);
                    
                    const response = await fetch(searchUrl, { 
                        headers: { 'User-Agent': 'PlantLens/1.0 (https://plantlens.app)' },
                        signal: controller.signal 
                    });
                    clearTimeout(timeout);
                    
                    if (!response.ok || searchState.cancelled || searchState.query !== query) return;
                    
                    const data = await response.json();
                    const searchResults = data?.search ?? [];
                    
                    if (!Array.isArray(searchResults) || searchResults.length === 0) return;
                    
                    // Фильтруем результаты: пропускаем людей и не-растения
                    const plantResults = searchResults.filter((result: any) => {
                        const desc = (result.description || '').toLowerCase();
                        const label = (result.label || '').toLowerCase();
                        return !desc.includes('person') && !desc.includes('human') && 
                               !desc.includes('actor') && !desc.includes('singer') &&
                               !label.includes('person') && !desc.includes('given name');
                    });
                    
                    if (plantResults.length === 0 || searchState.cancelled || searchState.query !== query) return;
                    
                    // Добавляем найденные растения в результаты (максимум 2 из Wikidata, чтобы не превысить лимит 5)
                    const maxWikidataResults = Math.min(2, 5 - initialResults.length);
                    const wikidataSuggestions: SearchSuggestion[] = plantResults.slice(0, maxWikidataResults).map((result: any) => {
                        const label = result.label || '';
                        const matchQuality = calculateMatchQuality(label, query);
                        
                        return {
                            id: `wikidata-${result.id}`,
                            label,
                            subLabel: t('home_knowledge_base'),
                            type: 'global' as const,
                            matchQuality: matchQuality < 999 ? matchQuality : 3,
                            scientificName: label
                        };
                    });
                    
                    if (searchState.cancelled || searchState.query !== query) return;
                    
                    // Объединяем с существующими результатами и сортируем
                    const allResults = [...initialResults, ...wikidataSuggestions];
                    allResults.sort((a, b) => {
                        if (Math.abs(a.matchQuality - b.matchQuality) < 0.1) {
                            if (a.type === 'garden' && b.type !== 'garden') return -1;
                            if (a.type !== 'garden' && b.type === 'garden') return 1;
                        }
                        return a.matchQuality - b.matchQuality;
                    });
                    
                    // Ограничиваем финальный результат до 5 совпадений
                    const finalResults = allResults.slice(0, 5);
                    setSuggestions(finalResults);
                } catch (error) {
                    // Игнорируем ошибки поиска через Wikidata
                    console.log('[HomeScreen] Wikidata search failed:', error);
                }
            }, 300); // Debounce 300ms
        }
    }, [searchQuery, plants, isOnline]);

    const totalPlantsInGarden = useMemo(() => plants.filter(p => p.isInGarden !== false), [plants]);
    
    const careAgenda = useMemo(() => {
        const tasks: any[] = [];
        totalPlantsInGarden.forEach(plant => {
            reminderConfigs.forEach(config => {
                const userRem = plant.reminders?.[config.key as keyof typeof plant.reminders];
                const freq = userRem?.frequency || config.defaultFreq;
                const lastAction = plant.careHistory?.find(h => h.type === config.actionType);
                const lastDate = lastAction ? new Date(lastAction.date) : new Date(plant.identificationDate);
                const daysPassed = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
                const daysLeft = Math.ceil(Math.max(0, freq - daysPassed));
                const isDue = daysPassed >= freq;
    
                if (daysLeft <= 2 || isDue) {
                    tasks.push({
                        plantId: plant.id,
                        plantName: plant.commonName,
                        plantImageUrl: plant.imageUrl,
                        taskKey: config.key,
                        taskLabel: config.label,
                        daysLeft,
                        isDue,
                        icon: config.icon,
                        iconLibrary: (config as any).iconLibrary,
                        color: config.color,
                    });
                }
            });
        });
        return tasks.sort((a, b) => a.daysLeft - b.daysLeft);
    }, [totalPlantsInGarden, reminderConfigs]);

    const handleActionComplete = (plantId: string, type: string) => {
        const plant = plants.find(p => p.id === plantId);
        if (!plant) return;
        const typeConfig = reminderConfigs.find(r => r.key === type);
        if (!typeConfig) return;

        const newHistory = [{ type: typeConfig.actionType, date: new Date().toISOString() }, ...(plant.careHistory || [])];
        const updatedPlant = { ...plant, careHistory: newHistory };
        updatePlant(updatedPlant);

        const freq = updatedPlant.reminders?.[type as keyof typeof updatedPlant.reminders]?.frequency || typeConfig.defaultFreq;
        const body = t(NOTIF_BODY_KEYS[type] ?? 'notif_water_reminder').replace('{name}', updatedPlant.commonName);
        scheduleCareNotification(updatedPlant, type, body, freq);

        const taskId = `${plantId}-${type}`;
        setCompletedTasks(prev => [...prev, taskId]);
        setTimeout(() => {
            setCompletedTasks(prev => prev.filter(id => id !== taskId));
        }, 2000);
    };

    const confirmAndCompleteAction = () => {
        if (taskToConfirm) {
            handleActionComplete(taskToConfirm.plantId, taskToConfirm.taskKey);
            setTaskToConfirm(null);
        }
    };

    const taskForModalInfo = useMemo(() => {
        if (!taskToConfirm) return null;
        
        const plant = plants.find(p => p.id === taskToConfirm.plantId);
        if (!plant) return null;
        
        const task = reminderConfigs.find(r => r.key === taskToConfirm.taskKey);
        if (!task) return null;

        return { plant, task };
    }, [taskToConfirm, plants, reminderConfigs]);

    const handleSearchSubmit = () => {
        setShowSuggestions(false);
        if (searchQuery.trim()) {
            navigation.navigate('PlantAnalysis' as never, { query: searchQuery, isGlobalSearch: true } as never);
        }
    };

    const handleSuggestionClick = (suggestion: SearchSuggestion) => {
        if (suggestion.type === 'garden') {
            navigation.navigate('PlantDetail' as never, { plantId: suggestion.id } as never);
        } else {
            navigation.navigate('PlantAnalysis' as never, { query: suggestion.label, isGlobalSearch: true } as never);
        }
        setShowSuggestions(false);
        setSearchQuery('');
    };

    const quickActions = useMemo(() => [
        { 
            id: 'scan', 
            title: t('nav_scan'), 
            icon: 'scan', 
            action: () => navigation.navigate('NewCameraScreen' as never), 
            color: colors.primary, 
            bg: colors.primaryLight
        },
        { 
            id: 'diag', 
            title: t('more_tool_diagnosis'), 
            icon: 'pulse', 
            action: () => navigation.navigate('Diagnosis' as never), 
            color: colors.error, 
            bg: theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)'
        },
        { 
            id: 'garden', 
            title: t('plant_tab_garden'), 
            icon: 'leaf', 
            action: () => navigation.navigate('MyPlants' as never), 
            color: colors.primary, 
            bg: colors.primaryLight
        },
    ], [t, colors.primary, colors.error, colors.primaryLight, theme, navigation]);

    const renderAgendaItem = ({ item: task }: { item: any }) => {
        const taskId = `${task.plantId}-${task.taskKey}`;
        const isCompleted = completedTasks.includes(taskId);
        const plant = plants.find(p => p.id === task.plantId);
        const plantHealth = plant != null ? calculateOverallHealth(plant, reminderConfigs) : null;
        const primaryUri = task.plantImageUrl || getReliableImage(plant?.scientificName || task.plantName) || getBackupPlantImage(plant?.scientificName || task.plantName);
        const backupUri = getBackupPlantImage(plant?.scientificName || task.plantName);
        const tertiaryUri = getTertiaryPlantImage(plant?.scientificName || task.plantName);

        return (
            <View style={styles.agendaCard}>
                <View style={styles.agendaImageContainer}>
                    <AgendaTaskImage primaryUri={primaryUri} backupUri={backupUri} tertiaryUri={tertiaryUri} style={styles.agendaImageFull} resizeMode="cover" />
                    <Pressable
                        style={styles.agendaPhotoPressable}
                        onPress={() => navigation.navigate('PlantDetail' as never, { plantId: task.plantId } as never)}
                    />
                    <View style={[styles.agendaTopBlock, { backgroundColor: theme === 'dark' ? colors.surface : 'rgba(255, 255, 255, 0.9)', borderColor: colors.borderLight }]}>
                        <View style={[styles.agendaTimeBadge, task.isDue && styles.agendaTimeBadgeDue, { backgroundColor: task.isDue ? colors.error + '15' : colors.success + '15' }]}>
                            <Ionicons name="time" size={12} color={task.isDue ? colors.error : colors.success} />
                            <Text style={[styles.agendaTimeText, { color: task.isDue ? colors.error : colors.success }, task.isDue && styles.agendaTimeTextDue]}>
                                {task.daysLeft === 0 ? t('agenda_today') : task.isDue ? t('agenda_overdue') : `${task.daysLeft} ${t('agenda_days_short')}`}
                            </Text>
                        </View>
                        <Text style={[styles.agendaTaskLabel, { color: colors.text }]} numberOfLines={1}>{task.taskLabel}</Text>
                        {plantHealth != null && (
                            <View style={[styles.agendaHealthBadge, { backgroundColor: (plantHealth >= 70 ? colors.success : plantHealth >= 40 ? colors.warning : colors.error) + '25' }]}>
                                <Ionicons name="pulse" size={10} color={plantHealth >= 70 ? colors.success : plantHealth >= 40 ? colors.warning : colors.error} />
                                <Text style={[styles.agendaHealthText, { color: plantHealth >= 70 ? colors.success : plantHealth >= 40 ? colors.warning : colors.error }]}>{plantHealth}%</Text>
                            </View>
                        )}
                    </View>
                    <View style={[styles.agendaImageFooter, { backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.6)' }]}>
                        <Text style={styles.agendaPlantNameOverlay} numberOfLines={2}>{task.plantName}</Text>
                    </View>
                    <Pressable
                        onPress={(e) => { e?.stopPropagation?.(); setTaskToConfirm({ plantId: task.plantId, taskKey: task.taskKey }); }}
                        disabled={isCompleted}
                        style={[styles.agendaActionButton, { backgroundColor: isCompleted ? colors.primary : task.color }]}
                    >
                        {task.iconLibrary === 'PottedPlant' ? (
                            <PottedPlantIcon size={18} color="#ffffff" />
                        ) : task.iconLibrary === 'MaterialCommunityIcons' ? (
                            <MaterialCommunityIcons name={(task.icon as any) || 'spray-bottle'} size={18} color="#ffffff" />
                        ) : (
                            <Ionicons name={task.icon as any} size={18} color="#ffffff" />
                        )}
                    </Pressable>
                </View>
            </View>
        );
    };

    const renderTipCard = ({ item: tip }: { item: any }) => {
        return (
            <Pressable 
                onPress={() => navigation.navigate('ArticleDetail' as never, { articleId: tip.id, article: tip } as never)}
                style={[styles.tipCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
            >
                <View style={styles.tipHeader}>
                    <View style={[styles.tipIcon, { backgroundColor: tip.bg || colors.surface }]}>
                        <Ionicons name={tip.icon || 'book'} size={18} color={tip.color || colors.textMuted} />
                    </View>
                    <Text style={[styles.tipCategory, { color: colors.textMuted }]}>{tip.category}</Text>
                </View>
                <Text style={[styles.tipTitle, { color: colors.text }]} numberOfLines={2}>{tip.title}</Text>
                <View style={styles.tipImageContainer}>
                    <TipCardImage tip={tip} style={styles.tipImage} />
                    <View style={[styles.tipImageOverlay, { backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)' }]} />
                </View>
            </Pressable>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} nestedScrollEnabled showsVerticalScrollIndicator={true}>
                <View style={styles.header}>
                    <View style={styles.headerTop}>
                        <View>
                            <Text style={[styles.headerTitle, { color: colors.text }]}>PlantLens</Text>
                            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>{t('settings_designed_for')}</Text>
                        </View>
                        {regionalCatalog && (
                            <Pressable 
                                onPress={() => setShowLocationPicker(true)}
                                style={[styles.locationBadge, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
                            >
                                <Ionicons name="location" size={12} color={colors.primary} style={styles.locationBadgeIcon} />
                                <Text style={[styles.locationText, { color: colors.primary }]} numberOfLines={1} ellipsizeMode="tail">
                                    {(() => {
                                        const name = selectedLocation?.name ?? regionalCatalog.locationName;
                                        return (name && name !== t('location_your_region')) ? name : t('location_choose_city');
                                    })()}
                                </Text>
                            </Pressable>
                        )}
                    </View>

                    <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                        <Ionicons name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
                        <TextInput
                            value={searchQuery}
                            onChangeText={(text) => {
                                setSearchQuery(text);
                                setShowSuggestions(true);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                            onSubmitEditing={handleSearchSubmit}
                            placeholder={t('search_placeholder')}
                            style={[styles.searchInput, { color: colors.text }]}
                            placeholderTextColor={colors.textMuted}
                        />
                        {searchQuery.length > 0 && (
                            <Pressable 
                                onPress={() => { setSearchQuery(''); setSuggestions([]); }}
                                style={styles.searchClear}
                            >
                                <Ionicons name="close" size={18} color={colors.textMuted} />
                            </Pressable>
                        )}
                    </View>

                    {showSuggestions && (suggestions.length > 0 || searchQuery.length > 1) && (
                        <View style={[styles.suggestionsContainer, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                            {suggestions.length > 0 ? (
                                <View>
                                    <View style={[styles.suggestionsHeader, { borderBottomColor: colors.borderLight }]}>
                                        <Text style={[styles.suggestionsHeaderText, { color: colors.textMuted }]}>Лучшие совпадения</Text>
                                    </View>
                                    {suggestions.map((s) => (
                                        <SearchSuggestionCard
                                            key={s.id}
                                            suggestion={s}
                                            onPress={() => handleSuggestionClick(s)}
                                            styles={styles}
                                        />
                                    ))}
                                </View>
                            ) : (
                                <Pressable 
                                    onPress={handleSearchSubmit}
                                    style={styles.suggestionItem}
                                >
                                    <View style={styles.suggestionContent}>
                                        <View style={[styles.suggestionIcon, { backgroundColor: colors.surface }]}>
                                            <Ionicons name="search" size={18} color={colors.textMuted} />
                                        </View>
                                        <View>
                                            <Text style={[styles.suggestionLabel, { color: colors.text }]}>Искать "{searchQuery}"</Text>
                                            <Text style={[styles.suggestionSubLabel, { color: colors.textSecondary }]}>Глобальный поиск в базе данных</Text>
                                        </View>
                                    </View>
                                </Pressable>
                            )}
                        </View>
                    )}
                </View>

                {isSubscribed && weather ? (
                    <View style={[styles.weatherCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                        <View style={styles.weatherIcon}>
                            {weather.temperature > 25 ? (
                                <Ionicons name="sunny" size={140} color={theme === 'dark' ? 'rgba(234, 179, 8, 0.1)' : 'rgba(234, 179, 8, 0.05)'} />
                            ) : (
                                <Ionicons name="rainy" size={140} color={theme === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)'} />
                            )}
                        </View>
                        <View style={styles.weatherContent}>
                            <View style={styles.weatherHeader}>
                                <View style={{ flex: 1 }}>
                                    <View style={styles.weatherLocation}>
                                        <Ionicons name="location" size={10} color={colors.info} />
                                        <Text style={[styles.weatherLocationText, { color: colors.textSecondary }]}>
                                            {(() => {
                                                const name = selectedLocation?.name ?? regionalCatalog?.locationName;
                                                return (name && name !== t('location_your_region')) ? name : t('location_local_climate');
                                            })()}
                                        </Text>
                                    </View>
                                    <View style={styles.weatherTemp}>
                                        <Text style={[styles.weatherTempValue, { color: colors.text }]}>{weather.temperature}°</Text>
                                        <Text style={[styles.weatherTempUnit, { color: colors.textSecondary }]}>C</Text>
                                    </View>
                                </View>
                                <View style={styles.weatherConditionIcon}>
                                    {(() => {
                                        const iconInfo = getWeatherConditionIcon(weather.weatherCode);
                                        if (iconInfo.partlyCloudy) {
                                            return (
                                                <View style={styles.weatherPartlyCloudyWrap}>
                                                    <Ionicons name="sunny" size={32} color="#eab308" style={styles.weatherPartlySun} />
                                                    <Ionicons name="cloud" size={36} color="#cbd5e1" style={styles.weatherPartlyCloud} />
                                                </View>
                                            );
                                        }
                                        return (
                                            <Ionicons name={iconInfo.name} size={48} color={iconInfo.color} />
                                        );
                                    })()}
                                </View>
                            </View>
                            <View style={styles.weatherStats}>
                                <View style={[styles.weatherStat, { backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.6)', borderColor: colors.borderLight }]}>
                                    <Ionicons name="water" size={10} color={colors.info} />
                                    <Text style={[styles.weatherStatText, { color: colors.textSecondary }]} numberOfLines={1}>{weather.humidity}%</Text>
                                </View>
                                <View style={[styles.weatherStat, { backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.6)', borderColor: colors.borderLight }]}>
                                    <Ionicons name="rainy" size={10} color={colors.info} />
                                    <Text style={[styles.weatherStatText, { color: colors.textSecondary }]} numberOfLines={1}>
                                        {weather.precipitation > 0 ? `${weather.precipitation.toFixed(1)}` : '0'}мм
                                    </Text>
                                </View>
                                <View style={[styles.weatherStat, { backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.6)', borderColor: colors.borderLight }]}>
                                    <Ionicons name="navigate" size={10} color={colors.info} />
                                    <Text style={[styles.weatherStatText, { color: colors.textSecondary }]} numberOfLines={1}>{weather.windSpeed}м/с</Text>
                                </View>
                            </View>
                            {isOnline ? (
                                <View style={[styles.weatherRecommendation, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                                    <View style={[styles.weatherRecIcon, { backgroundColor: theme === 'dark' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(234, 179, 8, 0.2)' }]}>
                                        <Ionicons name="flash" size={16} color={colors.warning} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.weatherRecLabel, { color: colors.textMuted }]}>{t('care_ai_recommendation')}</Text>
                                        <Text style={[styles.weatherRecText, { color: colors.textSecondary }]}>
                                            {weatherInsight || (weather.humidity < 40 ? t('weather_fallback_low_humidity') : t('weather_fallback_ok'))}
                                        </Text>
                                    </View>
                                </View>
                            ) : (
                                <View style={[styles.weatherOffline, { backgroundColor: theme === 'dark' ? 'rgba(249, 115, 22, 0.15)' : 'rgba(249, 115, 22, 0.1)', borderColor: theme === 'dark' ? 'rgba(249, 115, 22, 0.3)' : 'rgba(249, 115, 22, 0.2)' }]}>
                                    <Ionicons name="wifi-outline" size={18} color={colors.warning} />
                                    <Text style={[styles.weatherOfflineText, { color: colors.warning }]}>{t('offline_banner')}</Text>
                                </View>
                            )}
                        </View>
                    </View>
                ) : !isSubscribed ? (
                    <Pressable
                        onPress={() => navigation.navigate('SubscriptionManage')}
                        style={[styles.weatherCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
                    >
                        <View style={styles.weatherContent}>
                            <View style={styles.weatherHeader}>
                                <View style={[styles.weatherPartlyCloudyWrap, { alignSelf: 'center', marginBottom: 8 }]}>
                                    <Ionicons name="partly-sunny" size={48} color={colors.textMuted} />
                                    <Ionicons name="lock-closed" size={20} color={colors.primary} style={{ position: 'absolute', right: -4, bottom: -4 }} />
                                </View>
                                <Text style={[styles.weatherTempValue, { color: colors.text, fontSize: 18 }]}>{t('settings_premium_get')}</Text>
                                <Text style={[styles.weatherLocationText, { color: colors.textSecondary, marginTop: 4 }]}>
                                    {t('home_tools_weather')}
                                </Text>
                            </View>
                        </View>
                    </Pressable>
                ) : null}

                {careAgenda.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="flash" size={22} color={colors.primary} />
                            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('home_agenda')}</Text>
                        </View>
                        <FlatList
                            data={careAgenda}
                            renderItem={renderAgendaItem}
                            keyExtractor={(item, idx) => `${item.plantId}-${item.taskKey}-${idx}`}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.agendaList}
                        />
                    </View>
                )}

                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="flash" size={22} color={colors.info} />
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('home_tools')}</Text>
                    </View>
                    <View style={styles.quickActionsGrid}>
                        {quickActions.map((item) => (
                            <Pressable 
                                key={item.id} 
                                onPress={item.action} 
                                style={[styles.quickActionCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
                            >
                                <View style={[styles.quickActionIcon, { backgroundColor: item.bg }]}>
                                    <Ionicons name={item.icon as any} size={24} color={item.color} />
                                </View>
                                <Text style={[styles.quickActionText, { color: colors.text }]}>{item.title}</Text>
                            </Pressable>
                        ))}
                    </View>
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="library" size={22} color={colors.info} />
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('home_library')}</Text>
                    </View>
                    <FlatList
                        data={dailyTips}
                        renderItem={renderTipCard}
                        keyExtractor={(item) => item.id}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.tipsList}
                    />
                </View>

                {trendingPlants.length > 0 && (
                    <View style={styles.section} key={`trending-section-${Object.keys(trendingRetryUris).length}-${Object.keys(trendingAiDataUrls).length}`}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="flame" size={22} color={colors.warning} />
                            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('home_trending')}</Text>
                        </View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.trendingList}
                            nestedScrollEnabled
                        >
                            {trendingPlantsWithUri.map((item, idx) => (
                                <TrendingPlantCard
                                    key={`trending-${getPlantKey(item)}-${idx}-${(item.__effectiveImageUri || '').slice(0, 80)}`}
                                    plant={item}
                                    primaryUri={item.__effectiveImageUri}
                                    onPress={() => navigation.navigate('PlantDetail' as never, { id: 'new', query: item.commonName, scientificName: item.scientificName, isGlobalSearch: true, image: item.__effectiveImageUri } as never)}
                                    onImageError={handleTrendingImageError}
                                    styles={styles}
                                />
                            ))}
                        </ScrollView>
                    </View>
                )}

                {regionalCatalog && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="leaf" size={22} color={colors.primary} />
                            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('home_discover')}</Text>
                        </View>
                        <View style={styles.catalogGrid}>
                            {regionalCatalog.categories.map((cat, idx) => {
                                const style = getCategoryIcon(cat?.title ?? '');
                                return (
                                    <Pressable
                                        key={idx}
                                        onPress={() => navigation.navigate('Catalog' as never, { category: cat.title, categoryData: cat, lat: selectedLocation?.lat ?? 55.7558, lon: selectedLocation?.lon ?? 37.6173 } as never)}
                                        style={[styles.catalogCard, { backgroundColor: style?.bg ?? colors.primaryLight }]}
                                    >
                                        <View style={[styles.catalogIcon, { backgroundColor: colors.card }]}>
                                            {style?.library === 'MaterialCommunityIcons' ? (
                                                <MaterialCommunityIcons name={(style?.icon ?? 'leaf') as any} size={32} color={style?.color ?? colors.primary} />
                                            ) : (
                                                <Ionicons name={(style?.icon ?? 'leaf') as any} size={32} color={style?.color ?? colors.primary} />
                                            )}
                                        </View>
                                        <Text style={[styles.catalogTitle, { color: style?.color ?? colors.primary }]}>{DISCOVER_CATEGORY_KEYS[cat.title] ? t(DISCOVER_CATEGORY_KEYS[cat.title]) : cat.title}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                )}
            </ScrollView>

            <Modal
                visible={!!taskForModalInfo}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setTaskToConfirm(null)}
            >
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
                        {taskForModalInfo && (
                            <>
                                <View style={[styles.modalIcon, { backgroundColor: taskForModalInfo.task?.bg ?? colors.primaryLight }]}>
                                    {(taskForModalInfo.task as any)?.iconLibrary === 'PottedPlant' ? (
                                        <PottedPlantIcon size={32} color={taskForModalInfo.task.color} />
                                    ) : (taskForModalInfo.task as any)?.iconLibrary === 'MaterialCommunityIcons' ? (
                                        <MaterialCommunityIcons name={taskForModalInfo.task.icon as any} size={32} color={taskForModalInfo.task.color} />
                                    ) : (
                                        <Ionicons name={taskForModalInfo.task.icon as any} size={32} color={taskForModalInfo.task.color} />
                                    )}
                                </View>
                                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('action_confirm_question')}</Text>
                                <Text style={[styles.modalText, { color: colors.textSecondary }]}>
                                    {taskForModalInfo.task.label} <Text style={[styles.modalTextBold, { color: colors.text }]}>{taskForModalInfo.plant.commonName}</Text>?
                                </Text>
                                <View style={styles.modalButtons}>
                                    <Pressable onPress={confirmAndCompleteAction} style={[styles.modalButtonPrimary, { backgroundColor: colors.primary }]}>
                                        <Text style={styles.modalButtonPrimaryText}>{t('action_confirm')}</Text>
                                    </Pressable>
                                    <Pressable onPress={() => setTaskToConfirm(null)} style={[styles.modalButtonSecondary, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                                        <Text style={[styles.modalButtonSecondaryText, { color: colors.text }]}>{t('delete_cancel')}</Text>
                                    </Pressable>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            <Modal
                visible={showLocationPicker}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowLocationPicker(false)}
            >
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <View style={[styles.locationModalContent, { backgroundColor: colors.card }]}>
                        <View style={[styles.locationModalHeader, { borderBottomColor: colors.borderLight }]}>
                            <Text style={[styles.locationModalTitle, { color: colors.text }]}>{t('location_choose_region')}</Text>
                            <Pressable onPress={() => setShowLocationPicker(false)}>
                                <Ionicons name="close" size={24} color={colors.textMuted} />
                            </Pressable>
                        </View>

                        <ScrollView style={styles.locationModalScroll}>
                            <View style={styles.locationSection}>
                                <Text style={[styles.locationSectionTitle, { color: colors.text }]}>{t('location_enter_city')}</Text>
                                <View style={[styles.locationSearchContainer, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                                    <Ionicons name="search" size={20} color={colors.textMuted} style={styles.locationSearchIcon} />
                                    <TextInput
                                        value={customCityQuery}
                                        onChangeText={setCustomCityQuery}
                                        placeholder={t('placeholder_city_example')}
                                        style={[styles.locationSearchInput, { color: colors.text }]}
                                        placeholderTextColor={colors.textMuted}
                                    />
                                    {isSearchingCity && (
                                        <Ionicons name="hourglass" size={20} color={colors.textMuted} />
                                    )}
                                </View>
                                {customCityResults.length > 0 && (
                                    <View style={styles.locationResultsContainer}>
                                        {customCityResults.map((result, idx) => (
                                            <Pressable
                                                key={idx}
                                                onPress={() => handleLocationSelect(result)}
                                                style={[styles.locationItem, { backgroundColor: colors.surface, borderBottomColor: colors.borderLight }]}
                                            >
                                                <Ionicons name="location-outline" size={20} color={colors.textSecondary} />
                                                <Text style={[styles.locationItemText, { color: colors.text }]} numberOfLines={2}>{result.name}</Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                )}
                            </View>

                            <View style={styles.locationSection}>
                                <Text style={[styles.locationSectionTitle, { color: colors.text }]}>{t('location_popular_cities')}</Text>
                                {locationKeys.map((loc, idx) => {
                                    const displayName = t(loc.key);
                                    const isSelected = selectedLocation?.lat === loc.lat && selectedLocation?.lon === loc.lon;
                                    return (
                                        <Pressable
                                            key={idx}
                                            onPress={() => handleLocationSelect({ name: displayName, lat: loc.lat, lon: loc.lon })}
                                            style={[
                                                styles.locationItem,
                                                { backgroundColor: colors.surface, borderBottomColor: colors.borderLight },
                                                isSelected && [styles.locationItemSelected, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]
                                            ]}
                                        >
                                            <Ionicons name="location" size={20} color={isSelected ? colors.primary : colors.textSecondary} />
                                            <Text style={[
                                                styles.locationItemText,
                                                { color: colors.text },
                                                isSelected && [styles.locationItemTextSelected, { color: colors.primary }]
                                            ]} numberOfLines={2}>
                                                {displayName}
                                            </Text>
                                            {isSelected && (
                                                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                                            )}
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

// Базовые стили без цветов (цвета применяются через inline стили)
const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor применяется через inline стили
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 96,
    },
    header: {
        padding: 24,
        paddingTop: 40,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: -0.5,
        color: '#111827',
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#9ca3af',
    },
    locationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#ffffff',
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
        maxWidth: '65%',
        flexShrink: 1,
    },
    locationBadgeIcon: {
        flexShrink: 0,
    },
    locationText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        color: '#10b981',
        flex: 1,
        minWidth: 0,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#f3f4f6',
        paddingHorizontal: 16,
        marginBottom: 8,
        position: 'relative',
    },
    searchIcon: {
        marginRight: 12,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        fontWeight: '500',
        color: '#111827',
        paddingVertical: 16,
    },
    searchClear: {
        padding: 4,
    },
    suggestionsContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
        marginTop: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    suggestionsHeader: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        // borderBottomColor будет переопределен через inline стили
    },
    suggestionsHeaderText: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 3.2,
        color: '#9ca3af',
    },
    suggestionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 0, 0, 0.05)', // Базовое значение, переопределяется через inline стили
    },
    suggestionContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        flex: 1,
    },
    suggestionIcon: {
        padding: 10,
        borderRadius: 16,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
    },
    suggestionIconGarden: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    suggestionIconGlobal: {
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
    },
    suggestionImageContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: 'rgba(243, 244, 246, 0.5)',
    },
    suggestionImage: {
        width: '100%',
        height: '100%',
    },
    suggestionTextContainer: {
        flex: 1,
        minWidth: 0,
    },
    suggestionLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#374151',
        marginBottom: 2,
    },
    suggestionLabelGarden: {
        color: '#111827',
    },
    suggestionSubLabel: {
        fontSize: 10,
        fontWeight: '500',
        color: '#9ca3af',
    },
    weatherCard: {
        marginHorizontal: 24,
        marginBottom: 32,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.1)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
    },
    weatherIcon: {
        position: 'absolute',
        top: 0,
        right: 0,
        opacity: 0.05,
    },
    weatherContent: {
        position: 'relative',
        zIndex: 10,
    },
    weatherHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    weatherConditionIcon: {
        marginLeft: 12,
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    weatherPartlyCloudyWrap: {
        width: 48,
        height: 48,
        position: 'relative',
    },
    weatherPartlySun: {
        position: 'absolute',
        right: 8,
        top: 4,
    },
    weatherPartlyCloud: {
        position: 'absolute',
        left: 0,
        bottom: 0,
    },
    weatherLocation: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    weatherLocationText: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#3b82f6',
    },
    weatherTemp: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 6,
    },
    weatherTempValue: {
        fontSize: 42,
        fontWeight: '900',
        letterSpacing: -1,
        color: '#111827',
    },
    weatherTempUnit: {
        fontSize: 14,
        fontWeight: '900',
        color: '#9ca3af',
        marginBottom: 4,
    },
    weatherStats: {
        flexDirection: 'row',
        gap: 4,
        marginBottom: 16,
        justifyContent: 'space-between',
    },
    weatherStat: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        justifyContent: 'center',
        minWidth: 0,
        // backgroundColor и borderColor будут переопределены через inline стили
    },
    weatherStatText: {
        fontSize: 10,
        fontWeight: '900',
        // color будет переопределен через inline стили
    },
    weatherRecommendation: {
        flexDirection: 'row',
        gap: 12,
        borderRadius: 24,
        padding: 16,
        borderWidth: 1,
        // backgroundColor и borderColor будут переопределены через inline стили
    },
    weatherRecIcon: {
        padding: 8,
        backgroundColor: 'rgba(234, 179, 8, 0.2)',
        borderRadius: 12,
        alignSelf: 'flex-start',
    },
    weatherRecLabel: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        color: '#9ca3af',
        marginBottom: 3,
    },
    weatherRecText: {
        fontSize: 12,
        fontWeight: '700',
        lineHeight: 18,
        color: '#374151',
    },
    weatherOffline: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        borderRadius: 28,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(249, 115, 22, 0.2)',
    },
    weatherOfflineText: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#f97316',
    },
    section: {
        marginBottom: 32,
        paddingHorizontal: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: -0.5,
        color: '#111827',
    },
    agendaList: {
        gap: 16,
        paddingRight: 24,
    },
    agendaCard: {
        width: 288,
        aspectRatio: 1,
        borderRadius: 24,
        overflow: 'hidden',
    },
    agendaImageContainer: {
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
    },
    agendaImageFull: {
        ...StyleSheet.absoluteFillObject,
    },
    agendaPhotoPressable: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 52,
        bottom: 64,
        zIndex: 0,
    },
    agendaTopBlock: {
        position: 'absolute',
        top: 10,
        left: 10,
        right: 10,
        zIndex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 9999,
        borderWidth: 1,
    },
    agendaHealthBadge: {
        marginLeft: 'auto',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 9999,
    },
    agendaHealthText: {
        fontSize: 11,
        fontWeight: '800',
    },
    agendaImageFooter: {
        position: 'absolute',
        bottom: 10,
        left: 10,
        right: 64,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: 14,
        zIndex: 1,
    },
    agendaPlantNameOverlay: {
        fontSize: 18,
        fontWeight: '900',
        color: '#ffffff',
    },
    agendaActionButton: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 22,
        zIndex: 1,
    },
    agendaHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 36,
        marginBottom: 12,
    },
    agendaHeaderText: {
        flex: 1,
        minWidth: 0,
    },
    agendaImage: {
        width: 200,
        height: 200,
        borderRadius: 24,
        backgroundColor: '#ecfdf5',
    },
    agendaTaskLabel: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 0,
        flex: 1,
        minWidth: 0,
    },
    agendaPlantName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
    },
    agendaTimeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 9999,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    agendaTimeBadgeDue: {
        backgroundColor: 'rgba(245, 158, 11, 0.12)',
    },
    agendaTimeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#10b981',
    },
    agendaTimeTextDue: {
        color: '#f59e0b',
    },
    quickActionsGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    quickActionCard: {
        flex: 1,
        backgroundColor: '#ffffff',
        padding: 16,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: '#f3f4f6',
        alignItems: 'center',
        gap: 12,
    },
    quickActionIcon: {
        padding: 12,
        borderRadius: 24,
    },
    quickActionText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#374151',
        textAlign: 'center',
    },
    tipsList: {
        gap: 16,
        paddingRight: 24,
    },
    tipCard: {
        width: 256,
        backgroundColor: '#ffffff',
        borderRadius: 32,
        padding: 20,
        borderWidth: 1,
        borderColor: '#f3f4f6',
    },
    tipHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    tipIcon: {
        padding: 8,
        borderRadius: 16,
    },
    tipCategory: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#9ca3af',
    },
    tipTitle: {
        fontSize: 14,
        fontWeight: '700',
        lineHeight: 20,
        color: '#111827',
        marginBottom: 12,
    },
    tipImageContainer: {
        height: 128,
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: 'transparent',
    },
    tipImage: {
        width: '100%',
        height: '100%',
    },
    tipImageOverlay: {
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
    },
    trendingList: {
        gap: 16,
        paddingRight: 24,
    },
    trendingCard: {
        width: 200,
        backgroundColor: '#ffffff',
        borderRadius: 32,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#f3f4f6',
    },
    trendingImageContainer: {
        width: '100%',
        height: 200,
        position: 'relative',
    },
    trendingImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    trendingImageLoadingOverlay: {
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(243, 244, 246, 0.9)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    trendingImageOverlay: {
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
    },
    trendingContent: {
        padding: 16,
        gap: 4,
    },
    trendingName: {
        fontSize: 16,
        fontWeight: '900',
        color: '#111827',
    },
    trendingScientific: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6b7280',
        fontStyle: 'italic',
    },
    trendingDescription: {
        fontSize: 12,
        fontWeight: '500',
        color: '#9ca3af',
        marginTop: 4,
        lineHeight: 16,
    },
    catalogGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
    },
    catalogCard: {
        width: '47%',
        height: 128,
        borderRadius: 40,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        position: 'relative',
        overflow: 'hidden',
    },
    catalogIcon: {
        padding: 12,
        borderRadius: 24,
    },
    catalogTitle: {
        fontSize: 14,
        fontWeight: '900',
        textAlign: 'center',
    },
    modalOverlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        // backgroundColor будет переопределен через inline стили
    },
    modalContent: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 48,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        // backgroundColor и borderColor будут переопределены через inline стили
    },
    modalIcon: {
        width: 64,
        height: 64,
        borderRadius: 9999,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: '900',
        color: '#111827',
        marginBottom: 8,
        textAlign: 'center',
    },
    modalText: {
        fontSize: 14,
        color: '#6b7280',
        textAlign: 'center',
        marginBottom: 32,
    },
    modalTextBold: {
        fontWeight: '700',
    },
    modalButtons: {
        width: '100%',
        gap: 12,
    },
    modalButtonPrimary: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 24,
        alignItems: 'center',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
        // backgroundColor и shadowColor будут переопределены через inline стили
    },
    modalButtonPrimaryText: {
        fontSize: 16,
        fontWeight: '900',
        color: '#ffffff',
    },
    modalButtonSecondary: {
        width: '100%',
        paddingVertical: 12,
        alignItems: 'center',
    },
    modalButtonSecondaryText: {
        fontSize: 14,
        fontWeight: '700',
        // color будет переопределен через inline стили
    },
    locationModalContent: {
        width: '100%',
        maxWidth: 400,
        maxHeight: '80%',
        borderRadius: 32,
        borderWidth: 1,
        // backgroundColor и borderColor будут переопределены через inline стили
    },
    locationModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        borderBottomWidth: 1,
        // borderBottomColor будет переопределен через inline стили
    },
    locationModalTitle: {
        fontSize: 20,
        fontWeight: '900',
        // color будет переопределен через inline стили
    },
    locationModalScroll: {
        maxHeight: 500,
    },
    locationSection: {
        padding: 24,
        borderBottomWidth: 1,
        // borderBottomColor будет переопределен через inline стили
    },
    locationSectionTitle: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 16,
        // color задаётся через inline (colors.text) для темы
    },
    locationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderRadius: 16,
        marginBottom: 8,
        // backgroundColor задаётся через inline (colors.surface)
    },
    locationItemSelected: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 1,
        borderColor: '#10b981',
    },
    locationItemText: {
        flex: 1,
        fontSize: 16,
        lineHeight: 22,
        fontWeight: '600',
        // color задаётся через inline (colors.text) для темы
    },
    locationItemTextSelected: {
        color: '#10b981',
        fontWeight: '700',
    },
    locationSearchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 12,
        borderWidth: 1,
        minHeight: 48,
        // backgroundColor и borderColor задаются через inline
    },
    locationSearchIcon: {
        marginRight: 4,
    },
    locationSearchInput: {
        flex: 1,
        fontSize: 16,
        lineHeight: 22,
        minHeight: 44,
        paddingVertical: 12,
        paddingHorizontal: 0,
        // color задаётся через inline стили
    },
    locationResultsContainer: {
        marginTop: 12,
        gap: 8,
    },
});

export default HomeScreen;
