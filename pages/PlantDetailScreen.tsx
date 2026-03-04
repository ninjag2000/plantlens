import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity, ScrollView, Image, TextInput, Modal, ActivityIndicator, Alert, Animated, Dimensions, useWindowDimensions, Platform, KeyboardAvoidingView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { PottedPlantIcon } from '../components/CareIcons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Plant, Collection, CareType } from '../types';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { useSubscription } from '../hooks/useSubscription';
import { getThemeColors } from '../utils/themeColors';
import { getCollections, saveCollection } from '../services/storageService';
import { getCachedPlantDetail, setCachedPlantDetail, setCachedPlant } from '../services/plantCacheService';
import { getStandardPlantTags, getPlantTypeDisplayLabel, getLifespanDisplayLabel, translateDataValue, calculateCareDifficulty, getClassification, getSafetyStatus, calculateOverallHealth } from '../services/careCalculator';
import jsPDF from 'jspdf';
import { loadCyrillicFont, drawPdfLogo, getBase64ImageFromUrl } from '../services/pdfUtils';
import { identifyPlant, searchWorldDatabase, getReliableImage, GENERIC_FALLBACK_IMAGE, generatePlantImage, generatePlantImageUrlWithFallback, getPlantDetailsInLanguage, detectContentLanguage } from '../services/geminiService';
import { getPlantImageAIUrl, getPlantImageUrl, getPlantImageFirstAvailable, isPlaceholderImageUrl, isPollinationsUrl, isInvalidImageDataUrl, getBackupPlantImage } from '../services/plantImageService';
import { savePdfToReportsFolder } from '../services/pdfSaveService';
import { SaveSuccessModal } from '../components/SaveSuccessModal';
import { cancelAllNotificationsForPlant, scheduleAllCareNotificationsForPlant } from '../services/notificationService';

/** Не передавать на экран детали — даёт чёрный квадрат. */
const TRANSPARENT_PIXEL_PREFIX = 'data:image/gif;base64,';
function isTransparentPixel(uri: string | undefined): boolean {
    return !uri || uri === '' || uri.startsWith(TRANSPARENT_PIXEL_PREFIX);
}
import { generateUUID } from '../utils/uuid';
import { Image as ExpoImage } from 'expo-image';

interface PlantDetailScreenProps {
    plants: Plant[];
    updatePlant: (plant: Plant) => void;
    addPlant: (plant: Plant) => void;
    deletePlant: (id: string) => void;
}

const ART_STYLES = [
    { id: 'Realistic', labelKey: 'art_style_realistic' as const, prompt: 'Photorealistic, highly detailed, 8k, cinematic lighting', icon: { name: 'camera-outline' } },
    { id: 'Watercolor', labelKey: 'art_style_watercolor' as const, prompt: 'Soft watercolor painting style, artistic, gentle strokes', icon: { name: 'color-palette-outline' } },
    { id: 'Cyberpunk', labelKey: 'art_style_cyberpunk' as const, prompt: 'Neon cyberpunk style, futuristic, glowing lights', icon: { name: 'flash-outline' } },
    { id: 'Oil', labelKey: 'art_style_oil' as const, prompt: 'Classic oil painting style, textured, canvas look', icon: { name: 'create-outline' } },
    { id: 'Macro', labelKey: 'art_style_macro' as const, prompt: 'Extreme macro close-up, depth of field, detailed texture', icon: { name: 'search-outline' } },
    { id: 'Studio', labelKey: 'art_style_studio' as const, prompt: 'Professional studio photography, clean white background, soft lighting', icon: { name: 'sunny-outline' } },
];

const availableIcons = [
    { name: 'Folder', icon: 'folder' },
    { name: 'Heart', icon: 'heart' },
    { name: 'Home', icon: 'home' },
    { name: 'Sun', icon: 'sunny' },
    { name: 'Cloud', icon: 'cloud' },
    { name: 'Briefcase', icon: 'briefcase' },
    { name: 'Star', icon: 'star' },
    { name: 'Leaf', icon: 'leaf' },
    { name: 'Trees', icon: 'leaf' },
    { name: 'Flower', icon: 'flower' },
];

const GENERATION_PHASES = [
    "Инициализация нейронного ядра...",
    "Анализ хлорофилловой активности...",
    "Синтез морфологической структуры...",
    "Рендеринг текстур мезофилла...",
    "Биометрическая стилизация...",
    "Генерация финального шедевра..."
];

const getColorHex = (colorClass: string): string => {
    if (colorClass.includes('emerald')) return '#10b981';
    if (colorClass.includes('amber')) return '#f59e0b';
    if (colorClass.includes('blue')) return '#3b82f6';
    if (colorClass.includes('cyan')) return '#06b6d4';
    if (colorClass.includes('teal')) return '#14b8a6';
    if (colorClass.includes('orange')) return '#f97316';
    if (colorClass.includes('yellow')) return '#eab308';
    if (colorClass.includes('purple') || colorClass.includes('violet')) return '#8b5cf6';
    if (colorClass.includes('green')) return '#22c55e';
    if (colorClass.includes('red') || colorClass.includes('rose')) return '#ef4444';
    return '#6b7280';
};

const ProgressRingMini = ({ percentage, colorClass, size = 48 }: { percentage: number, colorClass: string, size?: number }) => {
    const strokeWidth = 3;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    const color = getColorHex(colorClass);
    const center = size / 2;

    return (
        <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
            <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke="rgba(0, 0, 0, 0.05)"
                strokeWidth={strokeWidth}
                fill="transparent"
            />
            <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke={color}
                strokeWidth={strokeWidth}
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
            />
        </Svg>
    );
};

const COLOR_ICON_NEUTRAL = '#a78bfa'; // лавандовый — для «зависит от вида» / «нет данных», чтобы не серый
const getColorHexFromName = (colorName: string | undefined): string => {
    if (!colorName) return COLOR_ICON_NEUTRAL;
    const lower = colorName.toLowerCase().trim();
    const colorMap: Record<string, string> = {
        'red': '#ef4444', 'pink': '#ec4899', 'blue': '#3b82f6', 'green': '#22c55e', 'yellow': '#eab308',
        'white': '#ffffff', 'purple': '#8b5cf6', 'orange': '#f97316', 'cream': '#fef3c7', 'violet': '#7c3aed',
        'lavender': '#e0e7ff', 'crimson': '#dc2626', 'gold': '#fbbf24', 'maroon': '#800000', 'brown': '#78350f',
        'black': '#000000', 'magenta': '#d946ef', 'teal': '#14b8a6', 'cyan': '#06b6d4', 'burgundy': '#800020',
        'lilac': '#c8a2c8', 'salmon': '#fa8072',
        'glossy green': '#4ade80', 'dark green': '#166534', 'grey': '#9ca3af', 'gray': '#9ca3af',
        'зелёный': '#22c55e', 'зеленый': '#22c55e', 'тёмно-зелёный': '#166534', 'темно-зеленый': '#166534',
        'красный': '#ef4444', 'жёлтый': '#eab308', 'желтый': '#eab308', 'синий': '#3b82f6', 'оранжевый': '#f97316',
        'фиолетовый': '#8b5cf6', 'розовый': '#ec4899', 'белый': '#ffffff', 'кремовый': '#fef3c7', 'голубой': '#06b6d4', 'лавандовый': '#e0e7ff', 'золотой': '#fbbf24', 'коричневый': '#78350f',
        'чёрный': '#000000', 'черный': '#000000', 'серый': '#9ca3af', 'бордовый': '#800020',
        'зависит от вида': COLOR_ICON_NEUTRAL, 'нет данных': COLOR_ICON_NEUTRAL, 'не применимо': COLOR_ICON_NEUTRAL, 'не образует': COLOR_ICON_NEUTRAL
    };
    for (const key in colorMap) {
        if (lower.includes(key)) return colorMap[key];
    }
    return COLOR_ICON_NEUTRAL;
};

const renderColorDots = (colorsStr?: string) => {
    const raw = (colorsStr ?? '').trim();
    if (!raw) {
        return (
            <View style={styles.colorDotsContainer}>
                <View style={[styles.colorDot, { backgroundColor: COLOR_ICON_NEUTRAL }]} />
            </View>
        );
    }
    const colors = raw.split(',').map(c => c.trim()).filter(Boolean);
    if (colors.length === 0) {
        return (
            <View style={styles.colorDotsContainer}>
                <View style={[styles.colorDot, { backgroundColor: COLOR_ICON_NEUTRAL }]} />
            </View>
        );
    }
    const seenHex = new Set<string>();
    const uniqueColors = colors.filter(c => {
        const hex = getColorHexFromName(c);
        if (seenHex.has(hex)) return false;
        seenHex.add(hex);
        return true;
    });
    return (
        <View style={styles.colorDotsContainer}>
            {uniqueColors.map((c, i) => (
                <View key={i} style={[styles.colorDot, { backgroundColor: getColorHexFromName(c) }]} />
            ))}
        </View>
    );
};

// Separate component for similar plant card to avoid hooks in map
const SimilarPlantCard: React.FC<{ 
    plant: { commonName: string; scientificName?: string; imageUrl?: string }, 
    navigation: any,
    styles: any 
}> = ({ plant, navigation, styles }) => {
    const { theme } = useTheme();
    const { t } = useI18n();
    const colors = getThemeColors(theme);
    const [similarImg, setSimilarImg] = useState<string | null>(plant.imageUrl || null);

    useEffect(() => {
        let cancelled = false;
        const query = plant.scientificName || plant.commonName;
        if (!query) {
            setSimilarImg(null);
            return;
        }

        const plantKey = `${plant.commonName}|${plant.scientificName || ''}`;
        const saveToCache = (imageUrl: string) => {
            setCachedPlant(plantKey, {
                commonName: plant.commonName,
                scientificName: plant.scientificName || '',
                description: '',
                imageUrl
            }).catch(() => {});
        };

        // Если уже есть валидное изображение - используем его и не загружаем новое
        // Проверяем только что оно не пустое и не placeholder
        if (plant.imageUrl && typeof plant.imageUrl === 'string' && !isPlaceholderImageUrl(plant.imageUrl) && plant.imageUrl.length > 0) {
            setSimilarImg(plant.imageUrl);
            saveToCache(plant.imageUrl);
            return; // Не загружаем новое изображение, если уже есть валидное
        }

        // Загружаем новое изображение только если его нет или оно невалидное
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
                    setSimilarImg(url);
                    saveToCache(url);
                } else {
                    const fallback = getPlantImageAIUrl(query || 'plant');
                    setSimilarImg(fallback);
                    // Сохраняем fallback в кэш, чтобы при следующем переходе использовалось то же изображение
                    saveToCache(fallback);
                }
            } catch (e) {
                if (cancelled) return;
                try {
                    const fallback = getPlantImageAIUrl(query || 'plant');
                    setSimilarImg(fallback);
                    // Сохраняем fallback в кэш
                    saveToCache(fallback);
                } catch (err) {
                    console.error('[PlantDetailScreen] SimilarPlantCard: all image loading failed', { query, error: String(e), fallbackError: String(err) });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [plant.commonName, plant.scientificName, plant.imageUrl]);

    const imageSource = similarImg && typeof similarImg === 'string' && similarImg.length > 0 && (similarImg.startsWith('http') || similarImg.startsWith('data:') || similarImg.startsWith('file://')) ? { uri: similarImg } : undefined;

    return (
        <Pressable
            onPress={() => {
                // ПРИОРИТЕТ: уже загруженное изображение (similarImg) > исходное изображение растения
                // Упрощенная проверка: если изображение не пустое и не прозрачный пиксель - используем его
                // ВАЖНО: передаём уже загруженное изображение, чтобы не загружать его заново на странице деталей
                const isValidImage = (img: string | null | undefined): boolean => {
                    return !!img && 
                        typeof img === 'string' && 
                        img.length > 0 && 
                        img.trim() !== '' &&
                        !isTransparentPixel(img);
                };
                
                // Приоритет: используем уже загруженное изображение из similarImg
                // Только если его нет или невалидное - используем исходное plant.imageUrl
                const imageToPass = isValidImage(similarImg) 
                    ? similarImg! // Используем уже загруженное изображение - оно будет использовано без перезагрузки
                    : isValidImage(plant.imageUrl)
                        ? plant.imageUrl!
                        : undefined;
                        
                navigation.navigate('PlantDetail' as never, { 
                    id: 'new', 
                    query: plant.commonName, 
                    isGlobalSearch: true,
                    image: imageToPass // Передаём уже загруженное изображение - оно будет использовано без перезагрузки
                } as never);
            }}
            style={[styles.similarPlantCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
        >
            <View style={styles.similarPlantImageContainer}>
                {imageSource && imageSource.uri ? (
                    <ExpoImage
                        source={imageSource}
                        style={styles.similarPlantImage}
                        contentFit="cover"
                        cachePolicy="disk"
                        recyclingKey={`similar-${plant.commonName}`}
                        placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
                        transition={200}
                        onError={(e) => {
                            try {
                                const query = plant.scientificName || plant.commonName || 'plant';
                                setSimilarImg(getPlantImageAIUrl(query));
                            } catch (err) {
                                console.warn('[PlantDetailScreen] SimilarPlantCard: onError handler failed', err);
                            }
                        }}
                    />
                ) : (
                    <View style={[styles.similarPlantImage, { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
                        <Ionicons name="leaf-outline" size={32} color={colors.textMuted} />
                    </View>
                )}
                <View style={[styles.similarPlantOverlay, { backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)' }]} />
                <View style={[styles.similarPlantBadge, { backgroundColor: colors.success + '15' }]}>
                    <Ionicons name="search" size={14} color={colors.success} />
                </View>
            </View>
            <View style={styles.similarPlantInfo}>
                <Text style={[styles.similarPlantName, { color: colors.text }]} numberOfLines={1}>
                    {plant.commonName}
                </Text>
                <Text style={[styles.similarPlantScientific, { color: colors.textSecondary }]} numberOfLines={1}>
                    {plant.scientificName}
                </Text>
                <View style={styles.similarPlantFooter}>
                    <Text style={[styles.similarPlantAction, { color: colors.textSecondary }]}>{t('action_explore')}</Text>
                    <Ionicons name="chevron-forward" size={10} color={colors.textMuted} />
                </View>
            </View>
        </Pressable>
    );
};

const HEADER_BAR_HEIGHT = 84;

const GRID_GAP = 16;
const SECTION_PADDING = 32;
const SCROLL_PADDING_H = 24 * 2;

const PlantDetailScreen: React.FC<PlantDetailScreenProps> = ({ plants, updatePlant, addPlant, deletePlant }) => {
    const navigation = useNavigation();
    const route = useRoute();
    const insets = useSafeAreaInsets();
    const { width: screenWidth } = useWindowDimensions();
    const { t, language } = useI18n();
    const { theme } = useTheme();
    const { isSubscribed } = useSubscription();
    const colors = getThemeColors(theme);
    const id = (route.params as any)?.id || (route.params as any)?.plantId;
    const infoGridItemWidth = Math.floor(
        (screenWidth - SCROLL_PADDING_H - SECTION_PADDING * 2 - GRID_GAP) / 2
    );

    const [plant, setPlant] = useState<Plant | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [generationPhase, setGenerationPhase] = useState(0);
    
    const [activeTab, setActiveTab] = useState<'info' | 'care' | 'notes'>('info');
    const [morphologyTab, setMorphologyTab] = useState<'mature' | 'flower' | 'fruit'>('mature');
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [notesText, setNotesText] = useState('');
    const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
    const [isEditingCommonName, setIsEditingCommonName] = useState(false);
    const [editedCommonName, setEditedCommonName] = useState('');
    
    const [viewingItem, setViewingItem] = useState<{url: string, type: string} | null>(null);
    const [viewerDisplayUri, setViewerDisplayUri] = useState<string | null>(null);
    const [showAiStyleModal, setShowAiStyleModal] = useState(false);
    const [selectedStyle, setSelectedStyle] = useState(ART_STYLES[0]);

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    
    // Ref для отслеживания изображения, переданного из параметров (например, из SimilarPlantCard)
    // Это нужно, чтобы не перезагружать уже загруженное изображение
    const passedImageRef = useRef<string | null>(null);
    const [showCollectionModal, setShowCollectionModal] = useState(false);
    const [showCareSettingsModal, setShowCareSettingsModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [showPdfSavedModal, setShowPdfSavedModal] = useState(false);

    
    const [tempReminders, setTempReminders] = useState<Record<string, number | undefined>>({});
    const [collections, setCollections] = useState<Collection[]>([]);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [newCollectionIcon, setNewCollectionIcon] = useState('Folder');
    const [completedTasks, setCompletedTasks] = useState<string[]>([]);

    const [heroContainerSize, setHeroContainerSize] = useState<{ width: number; height: number } | null>(null);
    const [heroImagePixelSize, setHeroImagePixelSize] = useState<{ width: number; height: number } | null>(null);
    /** URI для героя: при ошибке загрузки подставляем fallback, чтобы не показывать чёрный фон. */
    const [heroDisplayUri, setHeroDisplayUri] = useState<string | null>(null);
    /** Актуальный URI картинки для PDF (обновляется вместе с героем), чтобы при нажатии «Сохранить» не использовать устаревшее замыкание. */
    const pdfImageUriRef = useRef<string | null>(null);
    /** Для растений из трендов (http): предзагружаем картинку в кэш при открытии экрана, чтобы PDF не зависел от сети в момент сохранения. */
    const pdfCachedFileRef = useRef<{ url: string; localUri: string } | null>(null);
    const [careIndexBarSize, setCareIndexBarSize] = useState<{ width: number; height: number } | null>(null);

    useEffect(() => {
        const load = async () => {
            const cols = await getCollections();
            setCollections(cols ?? []);
        };
        load();
    }, []);

    // Синхронизируем editedCommonName с plant при загрузке
    useEffect(() => {
        if (plant) {
            setEditedCommonName(plant.commonName || plant.scientificName || '');
        }
    }, [plant?.id]);

    useEffect(() => {
        if (!viewingItem) {
            setViewerDisplayUri(null);
            return;
        }
        const url = viewingItem.url;
        if (url.startsWith('data:image/')) {
            const base64 = url.indexOf(',') >= 0 ? url.split(',')[1] : '';
            const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
            if (base64 && dir) {
                const fileName = `viewer_${Date.now()}.png`;
                const filePath = `${dir}${fileName}`;
                FileSystem.writeAsStringAsync(filePath, base64, { encoding: FileSystem.EncodingType.Base64 })
                    .then(() => {
                        const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
                        setViewerDisplayUri(uri);
                    })
                    .catch(() => setViewerDisplayUri(url));
            } else {
                setViewerDisplayUri(url);
            }
        } else {
            setViewerDisplayUri(url);
        }
    }, [viewingItem?.url]);

    useEffect(() => {
        const uri = plant?.imageUrl;
        const passedImage = passedImageRef.current;
        
        // ПРИОРИТЕТ #1: Если изображение было передано из параметров (например, из SimilarPlantCard),
        // используем его и НЕ загружаем новое - это уже загруженное изображение
        if (passedImage) {
            setHeroDisplayUri(passedImage);
            // Пытаемся получить размер только для http/file:///data: URL
            if (passedImage.startsWith('http') || passedImage.startsWith('file://') || passedImage.startsWith('data:')) {
                Image.getSize(
                    passedImage,
                    (width, height) => setHeroImagePixelSize({ width, height }),
                    () => setHeroImagePixelSize(null)
                );
            }
            return; // НЕ загружаем новое изображение, если оно было передано
        }
        
        // ПРИОРИТЕТ #2: Если изображение в plant совпадает с переданным (уже установлено),
        // используем его и не загружаем новое
        if (uri && passedImage && uri === passedImage) {
            setHeroDisplayUri(uri);
            if (uri.startsWith('http') || uri.startsWith('file://') || uri.startsWith('data:')) {
                Image.getSize(
                    uri,
                    (width, height) => setHeroImagePixelSize({ width, height }),
                    () => setHeroImagePixelSize(null)
                );
            }
            return;
        }
        
        // ПРИОРИТЕТ #3: Если изображение не было передано, проверяем существующее изображение растения
        // URL Pollinations не используем для отображения — может вернуть HTML (rate limit), подставляем бэкап
        const safeUri = uri && (isPollinationsUrl(uri) || isInvalidImageDataUrl(uri))
            ? getBackupPlantImage(plant?.commonName || plant?.scientificName || 'plant')
            : uri;
        const isValidUri = safeUri && 
            typeof safeUri === 'string' && 
            safeUri.length > 0 && 
            safeUri.trim() !== '' &&
            !isTransparentPixel(safeUri) &&
            !isPlaceholderImageUrl(safeUri) &&
            (safeUri.startsWith('http') || safeUri.startsWith('file://') || safeUri.startsWith('data:') || safeUri.includes('api.') || safeUri.includes('cdn.'));
        
        if (isValidUri) {
            setHeroDisplayUri(safeUri);
            if (safeUri.startsWith('http') || safeUri.startsWith('file://') || safeUri.startsWith('data:')) {
                Image.getSize(
                    safeUri,
                    (width, height) => setHeroImagePixelSize({ width, height }),
                    () => setHeroImagePixelSize(null)
                );
            }
            return;
        }
        
        // ПРИОРИТЕТ #4: Загружаем новое изображение только если его нет или оно невалидное
        // И ТОЛЬКО если изображение НЕ было передано из параметров (критически важно!)
        // Если passedImage есть - НЕ загружаем новое изображение, чтобы сохранить уже загруженное
        if (!passedImage && plant?.commonName && !isValidUri) {
            let fallback = getReliableImage(plant.commonName) || getPlantImageAIUrl(plant.commonName || plant.scientificName || 'plant');
            if (fallback && isPollinationsUrl(fallback)) fallback = getBackupPlantImage(plant.commonName || plant.scientificName || 'plant');
            setHeroDisplayUri(fallback || null);
            setHeroImagePixelSize(null);
            if (fallback && fallback.startsWith('http')) {
                Image.getSize(fallback, (w, h) => setHeroImagePixelSize({ width: w, height: h }), () => {});
            }
            // Загружаем улучшенное изображение только если нет валидного изображения
            // И ТОЛЬКО если изображение НЕ было передано из параметров
            getPlantImageUrl(plant, { aiFallback: generatePlantImageUrlWithFallback })
                .then((url) => { 
                    // КРИТИЧЕСКИ ВАЖНО: Проверяем, что изображение не было передано из параметров
                    // Если passedImageRef.current установлен - НЕ заменяем изображение
                    if (url && !passedImageRef.current && (!plant?.imageUrl || isTransparentPixel(plant.imageUrl))) {
                        setHeroDisplayUri(url);
                    }
                })
                .catch(() => {});
        }
    }, [plant?.imageUrl, plant?.commonName, plant?.scientificName]);

    // Держим ref в актуальном состоянии для PDF: при нажатии «Сохранить» берём URI отсюда
    useEffect(() => {
        const uri = heroDisplayUri || (plant?.imageUrl && !isTransparentPixel(plant.imageUrl) ? plant.imageUrl : null);
        pdfImageUriRef.current = uri ?? null;
    }, [heroDisplayUri, plant?.imageUrl]);

    // Предзагрузка картинки по http (тренды, каталог): скачиваем в кэш при открытии экрана. При смене URL удаляем старый файл, чтобы не накапливать мусор.
    useEffect(() => {
        const uri = heroDisplayUri || (plant?.imageUrl && !isTransparentPixel(plant.imageUrl) ? plant.imageUrl : null);
        if (!uri || !uri.startsWith('http')) {
            const prev = pdfCachedFileRef.current;
            if (prev) {
                FileSystem.deleteAsync(prev.localUri, { idempotent: true }).catch(() => {});
                pdfCachedFileRef.current = null;
            }
            return;
        }
        const prev = pdfCachedFileRef.current;
        if (prev && prev.url !== uri) {
            FileSystem.deleteAsync(prev.localUri, { idempotent: true }).catch(() => {});
            pdfCachedFileRef.current = null;
        }
        let cancelled = false;
        const cacheDir = FileSystem.cacheDirectory;
        if (!cacheDir) return;
        const tempPath = `${cacheDir}pdf-prefetch-${Date.now()}.jpg`;
        FileSystem.downloadAsync(uri, tempPath)
            .then(({ uri: localUri }) => {
                if (!cancelled) pdfCachedFileRef.current = { url: uri, localUri };
            })
            .catch(() => {
                if (!cancelled) pdfCachedFileRef.current = null;
            });
        return () => { cancelled = true; };
    }, [heroDisplayUri, plant?.imageUrl]);

    const handleHeroImageError = () => {
        if (!plant?.commonName) return;
        getPlantImageUrl(plant, { skipCache: true, aiFallback: generatePlantImageUrlWithFallback })
            .then((url) => {
                if (url) {
                    const safe = isPollinationsUrl(url) ? getBackupPlantImage(plant.commonName || plant.scientificName || 'plant') : url;
                    setHeroDisplayUri(safe);
                }
            })
            .catch(() => {
                let fallback = getReliableImage(plant.commonName) || getPlantImageAIUrl(plant.commonName || plant.scientificName || 'plant');
                if (fallback && isPollinationsUrl(fallback)) fallback = getBackupPlantImage(plant.commonName || plant.scientificName || 'plant');
                if (fallback) setHeroDisplayUri(fallback);
            });
    };

    // Note: Click outside handling not needed in React Native - modals handle this automatically

    useEffect(() => {
        if (isGeneratingImage) {
            const interval = setInterval(() => {
                setGenerationPhase(prev => (prev + 1) % GENERATION_PHASES.length);
            }, 2500);
            return () => clearInterval(interval);
        }
    }, [isGeneratingImage]);

    // Устанавливаем переданное изображение в ref СРАЗУ при изменении параметров маршрута
    // Это критически важно для сохранения уже загруженного изображения при переходе на похожее растение
    useEffect(() => {
        const params = (route.params as any) || {};
        if (id === 'new' && params?.image) {
            const state = params;
            // Минимальная проверка: только что это не пустая строка и не прозрачный пиксель
            const rawOk = state.image && 
                typeof state.image === 'string' && 
                state.image.length > 0 && 
                state.image.trim() !== '' &&
                !isTransparentPixel(state.image);
            // Не используем URL Pollinations для отображения — сервер может вернуть HTML (rate limit)
            const hasPassedImage = rawOk && !isPollinationsUrl(state.image);
            
            if (hasPassedImage) {
                passedImageRef.current = state.image;
            } else if (rawOk && isPollinationsUrl(state.image)) {
                passedImageRef.current = getBackupPlantImage(state.query || state.scientificName || 'plant');
            } else {
                passedImageRef.current = null;
            }
        } else {
            // Очищаем ref только если это не переход на новое растение с переданным изображением
            passedImageRef.current = null;
        }
    }, [id, route.params]);

    useEffect(() => {
        const loadPlant = async () => {
            const params = (route.params as any) || {};
            if (id === 'new') {
                const state = params;
                if (!state || (!state.image && !state.query)) {
                    navigation.navigate('MainTabs' as never, { screen: 'Home' } as never);
                    return;
                }

                setIsLoading(true);
                try {
                    if (state.isGlobalSearch && state.query) {
                        const searchQuery = (state.scientificName && String(state.scientificName).trim()) ? String(state.scientificName).trim() : state.query;
                        const result = await searchWorldDatabase(searchQuery, language);
                        const careTips = result.careTips && typeof result.careTips === 'object'
                            ? { watering: result.careTips.watering ?? '', sunlight: result.careTips.sunlight ?? '', soil: result.careTips.soil ?? '', temperature: result.careTips.temperature ?? '' }
                            : { watering: '', sunlight: '', soil: '', temperature: '' };
                        
                        // ПРИОРИТЕТ: Если изображение передано и это не URL Pollinations (может вернуть HTML), используем его
                        const rawPassed = state.image && typeof state.image === 'string' && state.image.length > 0 && state.image.trim() !== '' && !isTransparentPixel(state.image);
                        const hasPassedImage = rawPassed && !isPollinationsUrl(state.image);
                        
                        // КРИТИЧНО: Переданный Pollinations URL не используем для отображения — подставляем бэкап
                        const imageForDetail = hasPassedImage 
                            ? state.image 
                            : (rawPassed && isPollinationsUrl(state.image) 
                                ? getBackupPlantImage(state.query || result.scientificName || 'plant')
                                : (getReliableImage(state.query) || getPlantImageAIUrl(state.query || result.scientificName || 'plant')));
                        
                        if (hasPassedImage) {
                            passedImageRef.current = state.image;
                        } else if (rawPassed && isPollinationsUrl(state.image)) {
                            passedImageRef.current = getBackupPlantImage(state.query || result.scientificName || 'plant');
                        } else {
                            passedImageRef.current = null;
                        }
                        
                        setPlant({
                            id: 'temp-search-' + Date.now(),
                            imageUrl: imageForDetail,
                            identificationDate: new Date().toISOString(),
                            contentLanguage: language,
                            isInGarden: false,
                            ...result,
                            careTips,
                            description: result.description ?? result.about ?? '',
                            about: result.about ?? '',
                            commonName: result.commonName?.trim() || result.scientificName?.trim() || state.query || t('common_plant_unknown'),
                        });
                        setNotesText('');
                    } else if (state.image) {
                        if (state.identifiedPlant) {
                             const safeImg = isPollinationsUrl(state.image)
                                 ? getBackupPlantImage((state.identifiedPlant as any)?.scientificName || (state.identifiedPlant as any)?.commonName || 'plant')
                                 : state.image;
                             setPlant({
                                 id: 'temp-' + Date.now(),
                                 imageUrl: safeImg,
                                 identificationDate: new Date().toISOString(),
                                 contentLanguage: (state.identifiedPlant as any)?.contentLanguage ?? language,
                                 isInGarden: false,
                                 ...state.identifiedPlant,
                                 commonName: state.identifiedPlant.commonName?.trim() || state.identifiedPlant.scientificName?.trim() || t('common_plant_unknown'),
                             });
                             setNotesText('');
                        } else {
                             const result = await identifyPlant(state.image, 'image/jpeg', language);
                             const isInvalid = result.commonName === 'INVALID_PLANT' || result.scientificName === 'INVALID_PLANT' || result.error === 'recognition_failed';
                             if (isInvalid) {
Alert.alert(
                                    t('error_identification'),
                                    t('error_identification_desc'),
                                    [{ text: 'OK', onPress: () => navigation.navigate('MainTabs' as never, { screen: 'Home' } as never) }]
                                );
                                 return;
                             }
                             setPlant({
                                 id: 'temp-scan-' + Date.now(),
                                 imageUrl: state.image,
                                 identificationDate: new Date().toISOString(),
                                 contentLanguage: language,
                                 isInGarden: false,
                                 ...result,
                                 commonName: result.commonName?.trim() || result.scientificName?.trim() || t('common_plant_unknown'),
                             });
                             setNotesText('');
                        }
                    }
                } catch (e: any) {
                    console.error("Failed to load new plant data", e);
                    const msg = e?.message || t('error_load_desc');
                    Alert.alert(
                        t('error_load'),
                        msg,
                        [{ text: 'OK', onPress: () => navigation.navigate('MainTabs' as never, { screen: 'Home' } as never) }]
                    );
                } finally {
                    setIsLoading(false);
                }
            } else {
                const cached = await getCachedPlantDetail(id);
                if (cached) {
                    setPlant(cached);
                    setNotesText(cached.notes || '');
                }
                const found = plants.find(p => p.id === id);
                if (found) {
                    setPlant(found);
                    setNotesText(found.notes || '');
                    setCachedPlantDetail(found).catch(() => {});
                } else if (!cached) {
                    if (!showDeleteModal) {
                        navigation.navigate('MainTabs' as never, { screen: 'Home' } as never);
                    }
                }
            }
        };
        loadPlant();
    }, [id, plants, route.params, navigation, language]);

    // When app language differs from content language, refetch plant details in app language
    useEffect(() => {
        if (!plant?.scientificName?.trim() || !language) return;
        const effectiveContentLang = plant.contentLanguage ?? detectContentLanguage(plant);
        if (effectiveContentLang === language) return;

        let cancelled = false;
        (async () => {
            try {
                const details = await getPlantDetailsInLanguage(
                    plant.scientificName!.trim(),
                    plant.scientificName!.trim(),
                    language
                );
                if (cancelled) return;
                const merged: Plant = {
                    ...plant,
                    ...details,
                    id: plant.id,
                    imageUrl: plant.imageUrl,
                    identificationDate: plant.identificationDate,
                    contentLanguage: language,
                    commonName: details.commonName ?? plant.commonName,
                    scientificName: details.scientificName ?? plant.scientificName,
                };
                setPlant(merged);
                if (!plant.id.startsWith('temp-')) {
                    updatePlant(merged);
                }
            } catch (e) {
                if (!cancelled) console.warn('[PlantDetailScreen] getPlantDetailsInLanguage failed', e);
            }
        })();
        return () => { cancelled = true; };
    }, [plant?.id, plant?.scientificName, plant?.contentLanguage, language]);

    useEffect(() => {
        if (plant?.id) setCachedPlantDetail(plant).catch(() => {});
    }, [plant]);

    useEffect(() => {
        const params = (route.params as any) || {};
        if (params.croppedImage && plant) {
            const newPhoto = params.croppedImage;
            if (!plant.userPhotos?.includes(newPhoto)) {
                const updated = { 
                    ...plant, 
                    userPhotos: [newPhoto, ...(plant.userPhotos || [])] 
                };
                updatePlant(updated);
                setPlant(updated);
                // Clear the croppedImage param
                navigation.setParams({ croppedImage: undefined } as any);
            }
        }
    }, [route.params, plant, navigation]);

    // All useMemo hooks must be called before any conditional returns
    const galleryItems = useMemo(() => {
        if (!plant) return [];
        return [
            { url: plant.imageUrl, type: 'main' },
            ...(plant.userPhotos || []).map(url => ({ url, type: 'user' })),
            ...(plant.generatedImages || []).map(url => ({ url, type: 'ai' }))
        ];
    }, [plant]);

    const NOTIF_BODY_KEYS: Record<string, 'notif_water_reminder' | 'notif_fertilize_reminder' | 'notif_misting_reminder' | 'notif_repot_reminder'> = { watering: 'notif_water_reminder', fertilizing: 'notif_fertilize_reminder', misting: 'notif_misting_reminder', repotting: 'notif_repot_reminder' };
    const reminderConfigs = useMemo(() => [
        { key: 'watering', labelKey: 'care_water' as const, actionType: 'watered' as CareType, icon: 'water-outline', defaultFreq: 7, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', accent: 'text-blue-500' },
        { key: 'fertilizing', labelKey: 'care_fertilize' as const, actionType: 'fertilized' as CareType, icon: 'leaf-outline', defaultFreq: 30, color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', accent: 'text-emerald-500' },
        { key: 'misting', labelKey: 'care_misting' as const, actionType: 'misting' as CareType, icon: 'spray-bottle', iconLibrary: 'MaterialCommunityIcons' as const, defaultFreq: 2, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', accent: 'text-cyan-500' },
        { key: 'repotting', labelKey: 'care_repot' as const, actionType: 'repotted' as CareType, icon: 'potted-plant', iconLibrary: 'PottedPlant' as const, defaultFreq: 365, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', accent: 'text-violet-500' },
    ], []);

    const careSpecs = useMemo(() => plant ? calculateCareDifficulty(plant) : { difficulty: 50, resilience: 50, maintenance: 50 }, [plant]);

    /** Сохранить data URL в файл и вернуть растение с file:// imageUrl, чтобы фото отображалось в саду и в Care Agenda. */
    const persistPlantImageIfDataUrl = async (p: Plant): Promise<Plant> => {
        const url = p.imageUrl?.trim();
        if (!url || !url.startsWith('data:image')) return p;
        try {
            const comma = url.indexOf(',');
            const base64 = comma >= 0 ? url.slice(comma + 1) : '';
            if (!base64) return p;
            const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
            if (!dir) return p;
            const path = `${dir}plant_${p.id}_${Date.now()}.jpg`;
            await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
            const fileUri = path.startsWith('file://') ? path : `file://${path}`;
            return { ...p, imageUrl: fileUri };
        } catch (_) {
            return p;
        }
    };

    const handleAddToGarden = async () => {
        if (!plant) return;
        if (id === 'new' || plant.id.startsWith('temp-')) {
            let newPlant: Plant = { ...plant, id: generateUUID(), isInGarden: true, notes: notesText };
            newPlant = await persistPlantImageIfDataUrl(newPlant);
            addPlant(newPlant);
            setPlant(newPlant);
            navigation.setParams({ id: newPlant.id } as never);
            scheduleAllCareNotificationsForPlant(newPlant, reminderConfigs, (key) => t(NOTIF_BODY_KEYS[key] ?? 'notif_water_reminder').replace('{name}', newPlant.commonName));
        } else {
            const updated = { ...plant, isInGarden: true };
            updatePlant(updated);
            setPlant(updated);
            scheduleAllCareNotificationsForPlant(updated, reminderConfigs, (key) => t(NOTIF_BODY_KEYS[key] ?? 'notif_water_reminder').replace('{name}', updated.commonName));
        }
    };

    const handleDelete = () => {
        if (!plant?.id) return;
        setShowDeleteModal(false);
        cancelAllNotificationsForPlant(plant.id);
        const updatedPlant = { ...plant, isInGarden: false };
        updatePlant(updatedPlant);
        setPlant(updatedPlant);
    };

    const toggleCollection = async (col: Collection) => {
        if (!plant) return;
        const plantIdToUse = plant.id.startsWith('temp-') ? generateUUID() : plant.id;
        
        if (plant.id.startsWith('temp-') || !plant.isInGarden) {
             let newPlant: Plant = { ...plant, id: plantIdToUse, isInGarden: true, notes: notesText };
             newPlant = await persistPlantImageIfDataUrl(newPlant);
             addPlant(newPlant);
             setPlant(newPlant);
             navigation.setParams({ id: newPlant.id } as never);
        }

        const exists = col.plantIds.includes(plantIdToUse);
        const updatedCol = {
            ...col,
            plantIds: exists 
                ? col.plantIds.filter(pid => pid !== plantIdToUse)
                : [...col.plantIds, plantIdToUse]
        };
        await saveCollection(updatedCol);
        const cols = await getCollections();
        setCollections(cols ?? []);
    };

    const handleCreateCollection = async () => {
        console.log('[PlantDetailScreen] handleCreateCollection called', { 
            name: newCollectionName, 
            icon: newCollectionIcon, 
            plantId: plant?.id 
        });
        
        if (!newCollectionName.trim() || !plant) {
            console.warn('[PlantDetailScreen] Cannot create collection: missing name or plant', {
                hasName: !!newCollectionName.trim(),
                hasPlant: !!plant
            });
            Alert.alert(t('error_title'), t('error_enter_name'));
            return;
        }
        
        try {
            let finalPlantId = plant.id;
            let needsNavigation = false;
            let newId = plant.id;

            // Если растение временное или не в саду, сначала сохраняем его
            if (plant.id.startsWith('temp-') || !plant.isInGarden) {
                 newId = plant.id.startsWith('temp-') ? generateUUID() : plant.id;
                 console.log('[PlantDetailScreen] Saving temporary plant with new ID:', newId);
                 let updatedPlant: Plant = { ...plant, id: newId, isInGarden: true, notes: notesText };
                 updatedPlant = await persistPlantImageIfDataUrl(updatedPlant);
                 addPlant(updatedPlant);
                 setPlant(updatedPlant);
                 finalPlantId = newId;
                 needsNavigation = true;
            }

            // Создаем коллекцию с правильным ID растения
            const newCol: Collection = {
                id: generateUUID(),
                name: newCollectionName.trim(),
                iconName: newCollectionIcon,
                plantIds: [finalPlantId]
            };
            
            console.log('[PlantDetailScreen] Creating collection:', newCol);
            await saveCollection(newCol);
            console.log('[PlantDetailScreen] Collection saved successfully');
            
            const cols = await getCollections();
            console.log('[PlantDetailScreen] Collections after save:', cols?.length, 'collections');
            setCollections(cols ?? []);
            setNewCollectionName('');
            setNewCollectionIcon('Folder');
            setShowCollectionModal(false);
            
            // Если нужно было навигировать, делаем это после создания коллекции
            if (needsNavigation) {
                setTimeout(() => {
                    navigation.navigate('PlantDetail' as never, { id: newId } as never);
                }, 200);
            }
        } catch (error: any) {
            console.error('[PlantDetailScreen] Error creating collection:', error);
            Alert.alert(t('error_title'), error?.message || t('error_create_collection'));
        }
    };

    const handleSaveNotes = () => {
        if (!plant) return;
        const updatedPlant = { ...plant, notes: notesText };
        if (plant.id.startsWith('temp-')) {
             setPlant(updatedPlant);
        } else {
             updatePlant(updatedPlant);
             setPlant(updatedPlant);
        }
        setIsEditingNotes(false);
    };

    const handleAddPhoto = () => {
        if (!plant) return;
        navigation.navigate('NewCameraScreen' as never, { 
            analysisMode: 'gallery',
            plantId: plant.id,
            plantName: plant.commonName
        } as never);
    };

    const handleGenerateArt = async () => {
        if (!plant || isGeneratingImage) return;
        setShowAiStyleModal(false);
        setIsGeneratingImage(true);
        setGenerationPhase(0);
        try {
            const aiImage = await generatePlantImage(plant.commonName, selectedStyle.prompt);
            const updatedPlant = {
                ...plant,
                generatedImages: [aiImage, ...(plant.generatedImages || [])]
            };
            if (!plant.id.startsWith('temp-')) {
                updatePlant(updatedPlant);
            }
            setPlant(updatedPlant);
        } catch (e: any) {
            console.error("AI Generation failed", e);
            const msg = e?.message && typeof e.message === 'string' ? e.message : t('error_image_gen');
            alert(msg);
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const handleSetMainPhoto = () => {
        if (!plant || !viewingItem) return;
        if (viewingItem.url === plant.imageUrl) return;

        const oldMain = plant.imageUrl;
        const newMain = viewingItem.url;
        const newUserPhotos = (plant.userPhotos || []).filter(img => img !== newMain);
        const newGenerated = (plant.generatedImages || []).filter(img => img !== newMain);
        
        if (!oldMain.includes('data:image/svg')) {
             newUserPhotos.unshift(oldMain);
        }

        const updatedPlant = {
            ...plant,
            imageUrl: newMain,
            userPhotos: newUserPhotos,
            generatedImages: newGenerated
        };

        if (!plant.id.startsWith('temp-')) {
            updatePlant(updatedPlant);
        }
        setPlant(updatedPlant);
        setViewingItem(null);
    };

    const handleDeletePhoto = () => {
        if (!plant || !viewingItem) return;
        if (viewingItem.url === plant.imageUrl) {
            alert("Нельзя удалить главное фото. Сначала выберите другое.");
            return;
        }

        const newUserPhotos = (plant.userPhotos || []).filter(img => img !== viewingItem.url);
        const newGenerated = (plant.generatedImages || []).filter(img => img !== viewingItem.url);

        const updatedPlant = {
            ...plant,
            userPhotos: newUserPhotos,
            generatedImages: newGenerated
        };

        if (!plant.id.startsWith('temp-')) {
            updatePlant(updatedPlant);
        }
        setPlant(updatedPlant);
        setViewingItem(null);
    };

    const getTaskStatus = (taskKey: string, defaultFreq: number, actionType: string) => {
        if (!plant) return { daysLeft: 0, isDue: false, freq: defaultFreq, daysPassed: 0, percentage: 100 };
        const userRem = plant.reminders?.[taskKey as keyof typeof plant.reminders];
        const freq = userRem?.frequency || defaultFreq;
        const lastAction = plant.careHistory?.find(h => h.type === actionType);
        const lastDate = lastAction ? new Date(lastAction.date) : new Date(plant.identificationDate);
        const daysPassed = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysLeft = Math.ceil(Math.max(0, freq - daysPassed));
        const percentage = Math.max(0, Math.min(100, ((freq - daysPassed) / freq) * 100));
        return { daysLeft, isDue: daysPassed >= freq, freq, daysPassed, percentage };
    };

    const handleTaskAction = async (taskKey: string, actionType: CareType, defaultFreq: number) => {
        if (!plant) return;
        const newHistory = [{ type: actionType, date: new Date().toISOString() }, ...(plant.careHistory || [])];
        const updatedPlant = { ...plant, careHistory: newHistory };
        
        if (plant.id.startsWith('temp-') || !plant.isInGarden) {
             const newId = plant.id.startsWith('temp-') ? generateUUID() : plant.id;
             let realPlant: Plant = { ...updatedPlant, id: newId, isInGarden: true };
             realPlant = await persistPlantImageIfDataUrl(realPlant);
             addPlant(realPlant);
             setPlant(realPlant);
             navigation.setParams({ id: newId } as never);
        } else {
             updatePlant(updatedPlant);
             setPlant(updatedPlant);
        }

        setCompletedTasks(prev => [...prev, taskKey]);
        setTimeout(() => setCompletedTasks(prev => prev.filter(k => k !== taskKey)), 3000);
    };

    const getNextDueTask = () => {
        if (!plant) return null;
        let urgentTask = null;
        let minDays = Infinity;

        reminderConfigs.forEach(config => {
            const { daysLeft, isDue } = getTaskStatus(config.key, config.defaultFreq, config.actionType);
            if (isDue) {
                if (urgentTask === null || !urgentTask.isDue) {
                     urgentTask = { ...config, daysLeft, isDue: true };
                }
            } else if (daysLeft < minDays && (urgentTask === null || !urgentTask.isDue)) {
                minDays = daysLeft;
                urgentTask = { ...config, daysLeft, isDue: false };
            }
        });

        return urgentTask;
    };

    const clampDays = (_key: string, value: number) => Math.max(1, Math.round(value));

    const canSaveCareSettings = useMemo(() => (
        reminderConfigs.every(c => {
            const v = tempReminders[c.key];
            return v !== undefined && typeof v === 'number' && !isNaN(v) && v >= 1;
        })
    ), [tempReminders]);

    const openCareSettings = () => {
        if (!plant) return;
        const current: Record<string, number> = {};
        reminderConfigs.forEach(config => {
            const raw = plant.reminders?.[config.key as keyof typeof plant.reminders]?.frequency ?? config.defaultFreq;
            current[config.key] = clampDays(config.key, Number(raw));
        });
        setTempReminders(current);
        setShowCareSettingsModal(true);
    };

    const saveCareSettings = () => {
        if (!plant || !canSaveCareSettings) return;
        const updatedReminders: any = { ...plant.reminders };
        reminderConfigs.forEach(config => {
            const raw = tempReminders[config.key];
            const freq = raw !== undefined && !isNaN(Number(raw))
                ? clampDays(config.key, Number(raw))
                : (plant.reminders?.[config.key as keyof typeof plant.reminders]?.frequency ?? config.defaultFreq);
            updatedReminders[config.key] = {
                ...(updatedReminders[config.key] || { lastSet: plant.identificationDate }),
                frequency: clampDays(config.key, freq)
            };
        });
        const updatedPlant = { ...plant, reminders: updatedReminders };
        updatePlant(updatedPlant);
        setPlant(updatedPlant);
        setShowCareSettingsModal(false);
        scheduleAllCareNotificationsForPlant(updatedPlant, reminderConfigs, (key) => t(NOTIF_BODY_KEYS[key] ?? 'notif_water_reminder').replace('{name}', updatedPlant.commonName));
    };

    const generateAndSavePlantPdf = async (): Promise<{ fileName: string; base64: string } | null> => {
        if (!plant) return null;
        try {
            const pdf = new jsPDF();
            await loadCyrillicFont(pdf);
            const pageWidth = pdf.internal.pageSize.getWidth();
            const margin = 20;
            let y = 15;

            // --- HEADER (Page 1) ---
            drawPdfLogo(pdf, margin, y, 15, 'dark');
            pdf.setTextColor(16, 185, 129);
            pdf.setFontSize(14);
            pdf.setFont('Roboto', 'bold');
            pdf.text('PLANT PASSPORT', margin + 20, y + 8);
            
            pdf.setTextColor(156, 163, 175);
            pdf.setFontSize(8);
            pdf.setFont('Roboto', 'normal');
            pdf.text(`Generated by PlantLens AI • ${new Date().toLocaleDateString()}`, margin + 20, y + 13);

            // --- GAUGE (Top Right - MINIMAL GRADIENT) ---
            const indexX = pageWidth - margin - 12;
            const indexY = y + 8;
            const indexRadius = 8; // Smallest radius
            
            pdf.setDrawColor(243, 244, 246);
            pdf.setLineWidth(2);
            pdf.circle(indexX, indexY, indexRadius, 'S');
            
            const diff = careSpecs.difficulty;
            const segments = 40;
            const portion = diff / 100;
            const startAngle = -Math.PI / 2;
            
            for (let i = 0; i < segments * portion; i++) {
                const step = i / segments;
                let r, g, b;
                if (step < 0.5) {
                    r = Math.floor(16 + (245 - 16) * (step * 2));
                    g = Math.floor(185 + (158 - 185) * (step * 2));
                    b = Math.floor(129 + (11 - 129) * (step * 2));
                } else {
                    r = Math.floor(245 + (239 - 245) * ((step - 0.5) * 2));
                    g = Math.floor(158 + (68 - 158) * ((step - 0.5) * 2));
                    b = Math.floor(11 + (68 - 11) * ((step - 0.5) * 2));
                }
                pdf.setDrawColor(r, g, b);
                pdf.setLineWidth(2.5);
                const a1 = startAngle + (i / segments) * Math.PI * 2;
                const a2 = startAngle + ((i + 1) / segments) * Math.PI * 2;
                pdf.line(
                    indexX + indexRadius * Math.cos(a1), indexY + indexRadius * Math.sin(a1),
                    indexX + indexRadius * Math.cos(a2), indexY + indexRadius * Math.sin(a2)
                );
            }
            pdf.setTextColor(31, 41, 55);
            pdf.setFontSize(10);
            pdf.setFont('Roboto', 'bold');
            pdf.text(`${careSpecs.difficulty}`, indexX, indexY + 1.2, { align: 'center' }); 

            y += 35;

            // --- HERO BLOCK (plant photo) — URI из ref (актуальный на момент нажатия «Сохранить») или state/plant ---
            const imageUriForPdf = pdfImageUriRef.current ?? heroDisplayUri ?? (plant.imageUrl && !isTransparentPixel(plant.imageUrl) ? plant.imageUrl : '');
            try {
                let imgData = (imageUriForPdf || '').trim();
                if (!imgData) { /* skip image */ } else if (imgData.startsWith('data:')) {
                    // Уже data URL — оставляем как есть, проверим длину ниже
                    if (!imgData.includes(',') || (imgData.split(',')[1]?.length ?? 0) <= 100) imgData = '';
                } else if (imgData.startsWith('content://')) {
                    // На Android readAsStringAsync не поддерживает content:// — копируем во временный file:// и читаем
                    const tempPath = (FileSystem.cacheDirectory || '') + `pdf-plant-${Date.now()}.jpg`;
                    const toUri = tempPath.startsWith('file://') ? tempPath : `file://${tempPath}`;
                    await FileSystem.copyAsync({ from: imgData, to: toUri });
                    const b64 = await FileSystem.readAsStringAsync(toUri, { encoding: FileSystem.EncodingType.Base64 });
                    if (b64 && b64.length > 100) {
                        imgData = `data:image/jpeg;base64,${b64}`;
                    } else {
                        imgData = '';
                    }
                    try { await FileSystem.deleteAsync(toUri, { idempotent: true }); } catch (_) {}
                } else if (imgData.startsWith('file://')) {
                    const b64 = await FileSystem.readAsStringAsync(imgData, { encoding: FileSystem.EncodingType.Base64 });
                    if (b64 && b64.length > 100) {
                        const ext = (imgData.split('.').pop() || '').split('?')[0].toLowerCase();
                        const format = ext === 'png' ? 'PNG' : 'JPEG';
                        imgData = `data:image/${format === 'PNG' ? 'png' : 'jpeg'};base64,${b64}`;
                    } else {
                        imgData = '';
                    }
                } else if (imgData.startsWith('http')) {
                    let b64Result = '';
                    // 1) Пробуем взять фото из кэша ExpoImage (то же, что показывается на экране)
                    try {
                        const cachePath = await ExpoImage.getCachePathAsync?.(imgData) ?? null;
                        if (cachePath && cachePath.length > 0) {
                            const fileUri = cachePath.startsWith('file://') ? cachePath : `file://${cachePath}`;
                            const b64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
                            if (b64 && b64.length > 100) b64Result = `data:image/jpeg;base64,${b64}`;
                        }
                    } catch (_) {}
                    // 2) Предзагруженный файл (наш prefetch при открытии экрана)
                    if (!b64Result || (b64Result.split(',')[1]?.length ?? 0) <= 100) {
                        const cached = pdfCachedFileRef.current;
                        if (cached && cached.url === imgData) {
                            try {
                                const b64 = await FileSystem.readAsStringAsync(cached.localUri, { encoding: FileSystem.EncodingType.Base64 });
                                if (b64 && b64.length > 100) b64Result = `data:image/jpeg;base64,${b64}`;
                            } catch (_) {}
                        }
                    }
                    if (!b64Result || (b64Result.split(',')[1]?.length ?? 0) <= 100) {
                        b64Result = await getBase64ImageFromUrl(imgData);
                    }
                    if (!b64Result || !b64Result.includes(',') || (b64Result.split(',')[1]?.length ?? 0) <= 100) {
                        try {
                            const tempPath = (FileSystem.cacheDirectory || '') + `pdf-dl-${Date.now()}.jpg`;
                            const toUri = tempPath.startsWith('file://') ? tempPath : `${tempPath}`;
                            const { uri } = await FileSystem.downloadAsync(imgData, toUri);
                            const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
                            if (b64 && b64.length > 100) b64Result = `data:image/jpeg;base64,${b64}`;
                            try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch (_) {}
                        } catch (_) {}
                    }
                    if (b64Result && b64Result.includes(',') && b64Result.split(',')[1]?.length > 100) {
                        imgData = b64Result;
                    } else {
                        imgData = '';
                    }
                }
                const hasValidBase64 = imgData.startsWith('data:') && imgData.includes(',') && (imgData.split(',')[1]?.length ?? 0) > 100;
                if (hasValidBase64) {
                    const format = imgData.indexOf('image/png') !== -1 ? 'PNG' : 'JPEG';
                    pdf.addImage(imgData, format, margin, y, 75, 75, undefined, 'FAST');
                }
            } catch (e) {
                console.warn('PDF: could not embed plant image', e);
            }

            const contentX = margin + 85;
            let cursorY = y + 5;
            pdf.setTextColor(31, 41, 55);
            pdf.setFontSize(22);
            pdf.setFont('Roboto', 'bold');
            const titleLines = pdf.splitTextToSize(plant.commonName.toUpperCase(), 75);
            pdf.text(titleLines, contentX, cursorY);
            cursorY += (titleLines.length * 8);

            pdf.setTextColor(156, 163, 175);
            pdf.setFontSize(10);
            pdf.setFont('Roboto', 'normal');
            pdf.text(plant.scientificName, contentX, cursorY);
            cursorY += 12;

            const plantTags = getStandardPlantTags(plant, t);
            let tagX = contentX;
            pdf.setFontSize(7);
            pdf.setFont('Roboto', 'bold');
            plantTags.forEach(tag => {
                const tagText = tag.label.toUpperCase();
                const textWidth = pdf.getTextWidth(tagText);
                const tagWidth = textWidth + 6;
                if (tagX + tagWidth > pageWidth - margin) { tagX = contentX; cursorY += 8; }
                let bColor = [243, 244, 246]; let tColor = [107, 114, 128];
                if (tag.style.includes('emerald')) { bColor = [209, 250, 229]; tColor = [5, 150, 105]; }
                if (tag.style.includes('red')) { bColor = [254, 226, 226]; tColor = [220, 38, 38]; }
                if (tag.style.includes('yellow')) { bColor = [254, 243, 199]; tColor = [217, 119, 6]; }
                if (tag.style.includes('blue')) { bColor = [219, 234, 254]; tColor = [37, 99, 235]; }
                if (tag.style.includes('purple')) { bColor = [243, 232, 255]; tColor = [147, 51, 234]; }
                pdf.setFillColor(bColor[0], bColor[1], bColor[2]);
                pdf.roundedRect(tagX, cursorY - 4, tagWidth, 6, 2, 2, 'F');
                pdf.setTextColor(tColor[0], tColor[1], tColor[2]);
                pdf.text(tagText, tagX + 3, cursorY);
                tagX += tagWidth + 4;
            });
            cursorY += 12;

            pdf.setTextColor(107, 114, 128);
            pdf.setFontSize(9);
            pdf.setFont('Roboto', 'bold');
            pdf.text('BIOLOGICAL DESCRIPTION', contentX, cursorY);
            cursorY += 5;
            pdf.setTextColor(75, 85, 99);
            pdf.setFont('Roboto', 'normal');
            const descLines = pdf.splitTextToSize(plant.description, 75);
            pdf.text(descLines, contentX, cursorY);

            y += 115; // Increased spacing between description and expert summary

            // --- EXPERT SUMMARY ---
            pdf.setFillColor(249, 250, 251);
            pdf.roundedRect(margin, y, pageWidth - margin * 2, 20, 5, 5, 'F');
            pdf.setTextColor(156, 163, 175);
            pdf.setFontSize(8);
            pdf.setFont('Roboto', 'bold');
            pdf.text('EXPERT ANALYSIS SUMMARY', margin + 8, y + 8);
            pdf.setTextColor(75, 85, 99);
            pdf.setFontSize(9);
            pdf.setFont('Roboto', 'normal');
            const summaryText = `Conclusion: Specimen exhibits ${careSpecs.resilience}% resilience. The care index of ${careSpecs.difficulty}/100 indicates ${careSpecs.difficulty < 40 ? 'beginner-friendly' : 'advanced'} requirements.`;
            pdf.text(summaryText, margin + 8, y + 14);

            y += 35;

            // --- CARE HUB CARDS (No header) ---
            const hubItems = [
                { title: t('care_water').toUpperCase(), val: plant.careTips?.watering || '—', color: [59, 130, 246] },
                { title: t('care_lighting').toUpperCase(), val: plant.careTips?.sunlight || '—', color: [245, 158, 11] },
                { title: t('care_soil').toUpperCase(), val: plant.careTips?.soil || '—', color: [139, 92, 246] },
                { title: t('care_temperature').toUpperCase(), val: plant.careTips?.temperature || '18-26°C', color: [239, 68, 68] }
            ];
            const cardW = (pageWidth - margin * 2 - 10) / 2;
            const cardH = 35;
            hubItems.forEach((item, i) => {
                const col = i % 2; const row = Math.floor(i / 2);
                const curX = margin + col * (cardW + 10); const curY = y + row * (cardH + 10);
                pdf.setFillColor(249, 250, 251); pdf.roundedRect(curX, curY, cardW, cardH, 5, 5, 'F');
                pdf.setDrawColor(item.color[0], item.color[1], item.color[2]); pdf.setLineWidth(0.3); pdf.roundedRect(curX, curY, cardW, cardH, 5, 5, 'S');
                pdf.setFillColor(item.color[0], item.color[1], item.color[2]); pdf.circle(curX + 8, curY + 8, 2, 'F');
                pdf.setFontSize(7); pdf.setTextColor(156, 163, 175); pdf.setFont('Roboto', 'bold'); pdf.text(item.title, curX + 15, curY + 9);
                pdf.setFontSize(8); pdf.setTextColor(75, 85, 99); pdf.setFont('Roboto', 'normal');
                const valLines = pdf.splitTextToSize(item.val, cardW - 16); pdf.text(valLines, curX + 10, curY + 18);
            });

            // --- PAGE 2: KEY CHARACTERISTICS & SAFETY ---
            pdf.addPage();
            y = 20;
            pdf.setTextColor(31, 41, 55); pdf.setFontSize(14); pdf.setFont('Roboto', 'bold');
            pdf.text(t('pdf_section_characteristics'), margin, y);
            y += 10;
            
            const utility = getClassification(plant);
            const gridData = [
                { label: t('info_type').toUpperCase(), val: getPlantTypeDisplayLabel(plant.plantType, t), full: false },
                { label: t('info_lifespan').toUpperCase(), val: getLifespanDisplayLabel(plant.lifespan, t), full: false },
                { label: t('char_plant_group').toUpperCase(), val: translateDataValue(plant.characteristics?.mature?.plantGroup, t) || '—', full: false },
                { label: t('info_utility').toUpperCase(), val: t(utility.labelKey), full: false },
                { label: t('char_height').toUpperCase(), val: plant.characteristics?.mature?.maxHeight || '—', full: false },
                { label: t('char_width').toUpperCase(), val: plant.characteristics?.mature?.maxWidth || '—', full: false },
                { label: t('info_habitat').toUpperCase(), val: plant.habitat || '—', full: true },
            ];

            gridData.forEach((item, i) => {
                const isFull = item.full;
                const col = i % 2; 
                const row = Math.floor(i / 2);
                const curX = isFull ? margin : margin + col * (cardW + 10);
                const curW = isFull ? pageWidth - margin * 2 : cardW;
                const curY = isFull ? y + (Math.ceil((gridData.length - 1) / 2) * 22) : y + row * 22;

                pdf.setFillColor(249, 250, 251); pdf.roundedRect(curX, curY, curW, 18, 4, 4, 'F');
                pdf.setFontSize(7); pdf.setTextColor(156, 163, 175); pdf.setFont('Roboto', 'bold'); pdf.text(item.label, curX + 5, curY + 6);
                pdf.setFontSize(9); pdf.setTextColor(31, 41, 55);
                const textVal = pdf.splitTextToSize(item.val, curW - 10); pdf.text(textVal, curX + 5, curY + 12);
            });

            y += 115;

            // --- SAFETY PASSPORT ---
            pdf.setTextColor(31, 41, 55); pdf.setFontSize(14); pdf.setFont('Roboto', 'bold');
            pdf.text(t('info_safety_passport'), margin, y);
            y += 10;
            const drawSafetyBlock = (label: string, tox: string, allergy: string, color: [number, number, number]) => {
                pdf.setTextColor(color[0], color[1], color[2]); pdf.setFontSize(9); pdf.setFont('Roboto', 'bold');
                pdf.text(label.toUpperCase(), margin, y); y += 6;
                const toxStatus = getSafetyStatus(tox);
                const toxColor = toxStatus.level === 2 ? [239, 68, 68] : (toxStatus.level === 1 ? [245, 158, 11] : [16, 185, 129]);
                pdf.setFillColor(toxColor[0], toxColor[1], toxColor[2]); pdf.circle(margin + 2, y - 1, 1.5, 'F');
                pdf.setFontSize(8); pdf.setTextColor(156, 163, 175); pdf.text(t('pdf_toxicity_label') + ':', margin + 6, y);
                pdf.setTextColor(75, 85, 99); const toxLines = pdf.splitTextToSize(tox || '—', pageWidth - margin * 2 - 40);
                pdf.text(toxLines, margin + 35, y); y += toxLines.length * 4 + 4;
                const allergyStatus = getSafetyStatus(allergy);
                const allergyColor = allergyStatus.level > 0 ? [245, 158, 11] : [16, 185, 129];
                pdf.setFillColor(allergyColor[0], allergyColor[1], allergyColor[2]); pdf.circle(margin + 2, y - 1, 1.5, 'F');
                pdf.setTextColor(156, 163, 175); pdf.text(t('pdf_allergies_label') + ':', margin + 6, y);
                pdf.setTextColor(75, 85, 99); const allLines = pdf.splitTextToSize(allergy || '—', pageWidth - margin * 2 - 40);
                pdf.text(allLines, margin + 35, y); y += allLines.length * 4 + 8;
            };
            drawSafetyBlock(t('safety_humans_label'), plant.safety?.toxicity.humans || '', plant.safety?.allergies.humans || '', [59, 130, 246]);
            drawSafetyBlock(t('safety_pets_label'), plant.safety?.toxicity.pets || '', plant.safety?.allergies.pets || '', [234, 179, 8]);
            y += 10;

            // --- STRENGTHS & WEAKNESSES ---
            pdf.setTextColor(31, 41, 55); pdf.setFontSize(14); pdf.setFont('Roboto', 'bold');
            pdf.text(t('pdf_section_pros_cons'), margin, y);
            y += 10;
            let listY = y; const halfW = (pageWidth - margin * 2 - 10) / 2;
            pdf.setTextColor(16, 185, 129); pdf.setFontSize(9); pdf.text(t('pros_label').toUpperCase(), margin, listY);
            listY += 6; plant.pros?.forEach(pro => {
                pdf.setFillColor(16, 185, 129); pdf.circle(margin + 2, listY - 1, 1.5, 'F');
                pdf.setTextColor(75, 85, 99); pdf.setFontSize(9); const lines = pdf.splitTextToSize(pro, halfW - 10);
                pdf.text(lines, margin + 8, listY); listY += lines.length * 5 + 2;
            });
            listY = y; const conX = margin + halfW + 10;
            pdf.setTextColor(239, 68, 68); pdf.setFontSize(9); pdf.text(t('cons_label').toUpperCase(), conX, listY);
            listY += 6; plant.cons?.forEach(con => {
                pdf.setFillColor(239, 68, 68); pdf.circle(conX + 2, listY - 1, 1.5, 'F');
                pdf.setTextColor(75, 85, 99); pdf.setFontSize(9); const lines = pdf.splitTextToSize(con, halfW - 10);
                pdf.text(lines, conX + 8, listY); listY += lines.length * 5 + 2;
            });

            const pdfBase64 = pdf.output('datauristring');
            const fileName = `PlantLens_Passport_${plant.commonName.replace(/\s+/g, '_')}.pdf`;
            const base64 = pdfBase64.split(',')[1];
            return { fileName, base64 };
        } catch (e) { console.error(e); return null; }
    };

    const handleExportPdf = async () => {
        if (!plant) return;
        setIsExporting(true);
        setIsExportMenuOpen(false);
        try {
            const data = await generateAndSavePlantPdf();
            if (data) {
                const path = await savePdfToReportsFolder(data.fileName, data.base64);
                if (path) setShowPdfSavedModal(true);
            }
        } catch (e) { console.error(e); } finally { setIsExporting(false); }
    };

    const handleShareNative = async () => {
        if (!plant) return;
        setIsExportMenuOpen(false);
        setIsExporting(true);
        try {
            const data = await generateAndSavePlantPdf();
            if (data) {
                const fileUri = `${FileSystem.documentDirectory}${data.fileName}`;
                await FileSystem.writeAsStringAsync(fileUri, data.base64, { encoding: FileSystem.EncodingType.Base64 });
                if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri);
            }
        } catch (e) { 
            if (String(e).indexOf('cancel') === -1) console.log('Share canceled or failed', e); 
        } finally {
            setIsExporting(false);
        }
    };

    const handleImageError = (imageUri: string, setImageUri: (uri: string) => void, altKey: string, triedReliable: React.MutableRefObject<boolean>, triedFallback: React.MutableRefObject<boolean>) => {
        if (triedFallback.current) return;
        if (!triedReliable.current) {
            triedReliable.current = true;
            setImageUri(getReliableImage(altKey));
        } else {
            triedFallback.current = true;
            setImageUri(GENERIC_FALLBACK_IMAGE);
        }
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <View style={styles.loadingSpinnerContainer}>
                    <View style={styles.loadingSpinnerOuter} />
                    <ActivityIndicator size="large" color="#10b981" style={styles.loadingSpinner} />
                    <Ionicons name="leaf" size={32} color="#10b981" style={styles.loadingIcon} />
                </View>
                <Text style={styles.loadingTitle}>{t('loading_identifying')}</Text>
                <Text style={styles.loadingSubtitle}>{t('loading_msg_2')}</Text>
            </View>
        );
    }

    if (!plant) return null;

    const plantTags = getStandardPlantTags(plant, t);
    
    // Функция для парсинга стилей тегов и получения цветов
    const getTagColors = (style: string) => {
        let backgroundColor = theme === 'dark' ? colors.surface : '#ffffff';
        let textColor = colors.text;
        let borderColor = colors.borderLight;
        
        // Emerald (зеленый)
        if (style.includes('emerald')) {
            backgroundColor = 'rgba(16, 185, 129, 0.1)';
            textColor = '#059669';
            borderColor = 'rgba(16, 185, 129, 0.3)';
        }
        // Red (красный)
        else if (style.includes('red')) {
            backgroundColor = 'rgba(239, 68, 68, 0.1)';
            textColor = '#dc2626';
            borderColor = 'rgba(239, 68, 68, 0.3)';
        }
        // Yellow (желтый)
        else if (style.includes('yellow')) {
            backgroundColor = 'rgba(234, 179, 8, 0.15)';
            textColor = '#d97706';
            borderColor = 'rgba(234, 179, 8, 0.3)';
        }
        // Blue (синий)
        else if (style.includes('blue')) {
            backgroundColor = 'rgba(59, 130, 246, 0.1)';
            textColor = '#2563eb';
            borderColor = 'rgba(59, 130, 246, 0.3)';
        }
        // Purple (фиолетовый)
        else if (style.includes('purple')) {
            backgroundColor = 'rgba(139, 92, 246, 0.1)';
            textColor = '#7c3aed';
            borderColor = 'rgba(139, 92, 246, 0.3)';
        }
        // Gray (серый) - по умолчанию
        else {
            backgroundColor = theme === 'dark' ? 'rgba(107, 114, 128, 0.1)' : 'rgba(107, 114, 128, 0.05)';
            textColor = colors.textMuted;
            borderColor = colors.borderLight;
        }
        
        return { backgroundColor, textColor, borderColor };
    };
    
    const overallHealth = plant ? calculateOverallHealth(plant, reminderConfigs) : 100;
    const nextTask = getNextDueTask();
    const humTox = getSafetyStatus(plant.safety?.toxicity.humans);
    const humAllergy = getSafetyStatus(plant.safety?.allergies.humans);
    const petTox = getSafetyStatus(plant.safety?.toxicity.pets);
    const petAllergy = getSafetyStatus(plant.safety?.allergies.pets);
    const utility = getClassification(plant);

    return (
        <View key={language} style={[styles.container, { backgroundColor: colors.background }]}>
            {/* AI Generation Overlay */}
            {isGeneratingImage && (
                <Modal visible={isGeneratingImage} transparent animationType="fade">
                    <View style={[styles.aiOverlay, { backgroundColor: colors.overlay }]}>
                        <View style={styles.aiSpinnerContainer}>
                            <View style={styles.aiSpinnerOrbit}>
                                <View style={[styles.aiSpinnerDot, { top: -6, backgroundColor: '#a855f7' }]} />
                                <View style={[styles.aiSpinnerDot, { bottom: -6, backgroundColor: '#6366f1' }]} />
                            </View>
                            <View style={styles.aiSpinnerInner}>
                                <Ionicons name="sparkles" size={48} color="#a855f7" />
                            </View>
                        </View>
                        <View style={[styles.aiContent, { backgroundColor: colors.card }]}>
                            <View style={styles.aiHeader}>
                                <Text style={[styles.aiTitle, { color: colors.text }]}>AI Art Laboratory</Text>
                                <View style={[styles.aiBadge, { backgroundColor: colors.primaryLight }]}>
                                    <Ionicons name="code" size={10} color={colors.primary} />
                                    <Text style={[styles.aiBadgeText, { color: colors.textSecondary }]}>Processing Data</Text>
                                </View>
                            </View>
                            <View style={styles.aiPhaseContainer}>
                                <Text style={[styles.aiPhaseText, { color: colors.text }]} key={generationPhase}>
                                    {GENERATION_PHASES[generationPhase]}
                                </Text>
                            </View>
                            <View style={[styles.aiProgressBar, { backgroundColor: colors.surface }]}>
                                <Animated.View style={[styles.aiProgressFill, { width: '100%', backgroundColor: colors.primary }]} />
                            </View>
                        </View>
                    </View>
                </Modal>
            )}

            {/* FIXED HEADER */}
            <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.surface, borderBottomColor: colors.borderLight }]}>
                <Pressable onPress={() => navigation.goBack()} style={[styles.headerButton, { backgroundColor: colors.pressed }]}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </Pressable>
                <View style={styles.headerTitleContainer}>
                    <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={2}>
                        {plant.commonName?.trim() || plant.scientificName?.trim() || t('common_plant')}
                    </Text>
                </View>
                <View style={styles.headerActions}>
                    <View style={styles.exportMenuContainer}>
                        <Pressable onPress={() => setIsExportMenuOpen(!isExportMenuOpen)} style={[styles.headerButton, { backgroundColor: colors.pressed }]}>
                            {isExporting ? (
                                <ActivityIndicator size="small" color={colors.text} />
                            ) : (
                                <Ionicons name="share-outline" size={20} color={colors.text} />
                            )}
                        </Pressable>
                        {isExportMenuOpen && (
                            <View style={[styles.exportMenu, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                                <Pressable onPress={handleExportPdf} style={styles.exportMenuItem}>
                                    <Ionicons name="download-outline" size={16} color={colors.info} />
                                    <Text style={[styles.exportMenuText, { color: colors.text }]}>{t('export_pdf')}</Text>
                                </Pressable>
                                <Pressable onPress={handleShareNative} style={styles.exportMenuItem}>
                                    <Ionicons name="share-outline" size={16} color={colors.success} />
                                    <Text style={[styles.exportMenuText, { color: colors.text }]}>{t('export_share')}</Text>
                                </Pressable>
                            </View>
                        )}
                    </View>
                    <Pressable onPress={() => {
                        setNewCollectionName('');
                        setNewCollectionIcon('Folder');
                        setShowCollectionModal(true);
                    }} style={[styles.headerButton, { backgroundColor: colors.pressed }]}>
                        <Ionicons name="folder-outline" size={20} color={colors.text} />
                    </Pressable>
                    {plant.isInGarden ? (
                        <Pressable onPress={() => setShowDeleteModal(true)} style={[styles.headerButton, styles.deleteButton, { backgroundColor: colors.pressed }]}>
                            <Ionicons name="trash-outline" size={20} color={colors.error} />
                        </Pressable>
                    ) : (
                        <Pressable onPress={handleAddToGarden} style={[styles.headerButton, styles.addButton, { backgroundColor: colors.primary }]}>
                            <Ionicons name="add" size={20} color="#ffffff" />
                        </Pressable>
                    )}
                </View>
            </View>

            <ScrollView 
                style={[styles.contentContainer, { paddingTop: insets.top + HEADER_BAR_HEIGHT }]} 
                contentContainerStyle={styles.contentContainerInner}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
            >
                {/* HERO IMAGE — явный расчёт cover + центр (Android) */}
                <View style={[styles.heroImageContainer, styles.heroImagePreviewStyle]}>
                    <View
                        style={styles.heroImageWrapper}
                        onLayout={(e) => {
                            const { width, height } = e.nativeEvent.layout;
                            if (width > 0 && height > 0) setHeroContainerSize({ width, height });
                        }}
                    >
                        {(() => {
                            const rawUri = heroDisplayUri || (plant?.imageUrl && !isTransparentPixel(plant.imageUrl) ? plant.imageUrl : null);
                            const uri = rawUri && (isPollinationsUrl(rawUri) || isInvalidImageDataUrl(rawUri)) ? getBackupPlantImage(plant?.commonName || plant?.scientificName || 'plant') : rawUri;
                            if (!uri) {
                                return (
                                    <View style={[styles.heroImage, styles.heroPlaceholder]}>
                                        <Ionicons name="leaf-outline" size={64} color="rgba(16, 185, 129, 0.4)" />
                                    </View>
                                );
                            }
                            const c = heroContainerSize;
                            const p = heroImagePixelSize;
                            if (c && p && p.width > 0 && p.height > 0) {
                                const scale = Math.max(c.width / p.width, c.height / p.height);
                                const w = p.width * scale;
                                const h = p.height * scale;
                                return (
                                    <ExpoImage
                                        source={{ uri }}
                                        style={[
                                            styles.heroImage,
                                            {
                                                position: 'absolute',
                                                width: w,
                                                height: h,
                                                left: (c.width - w) / 2,
                                                top: (c.height - h) / 2,
                                            },
                                        ]}
                                        contentFit="cover"
                                        onError={handleHeroImageError}
                                    />
                                );
                            }
                            return (
                                <ExpoImage
                                    source={{ uri }}
                                    style={styles.heroImage}
                                    contentFit="cover"
                                    onError={handleHeroImageError}
                                />
                            );
                        })()}
                    </View>
                </View>

                {/* Title Block */}
                <View style={styles.titleBlock}>
                    <View style={styles.tagsContainer}>
                        {plantTags.map((tag, idx) => {
                            const colors = getTagColors(tag.style);
                            return (
                                <View 
                                    key={idx} 
                                    style={[
                                        styles.tag, 
                                        { 
                                            backgroundColor: colors.backgroundColor,
                                            borderColor: colors.borderColor 
                                        }
                                    ]}
                                >
                                    <Text style={[styles.tagText, { color: colors.textColor }]}>{tag.label}</Text>
                                </View>
                            );
                        })}
                    </View>
                    <View style={styles.plantNameContainer}>
                        {plant.isInGarden && isEditingCommonName ? (
                            <View style={styles.editNameContainer}>
                                <TextInput
                                    style={[styles.editNameInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                                    value={editedCommonName}
                                    onChangeText={setEditedCommonName}
                                    placeholder={t('placeholder_plant_name')}
                                    placeholderTextColor={colors.textMuted}
                                    autoFocus
                                    maxLength={100}
                                    onSubmitEditing={() => {
                                        const trimmed = editedCommonName.trim();
                                        if (trimmed && trimmed.length > 0 && trimmed !== plant.commonName) {
                                            const updated = { ...plant, commonName: trimmed };
                                            setPlant(updated);
                                            updatePlant(updated);
                                            setIsEditingCommonName(false);
                                        } else if (!trimmed || trimmed.length === 0) {
                                            setEditedCommonName(plant.commonName || plant.scientificName || '');
                                            setIsEditingCommonName(false);
                                        } else {
                                            setIsEditingCommonName(false);
                                        }
                                    }}
                                    blurOnSubmit={true}
                                />
                                <Pressable
                                    style={styles.editNameButton}
                                    onPress={() => {
                                        const trimmed = editedCommonName.trim();
                                        if (trimmed && trimmed.length > 0 && trimmed !== plant.commonName) {
                                            const updated = { ...plant, commonName: trimmed };
                                            setPlant(updated);
                                            updatePlant(updated);
                                            setIsEditingCommonName(false);
                                        } else if (!trimmed || trimmed.length === 0) {
                                            setEditedCommonName(plant.commonName || plant.scientificName || '');
                                            setIsEditingCommonName(false);
                                        } else {
                                            setIsEditingCommonName(false);
                                        }
                                    }}
                                >
                                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                                </Pressable>
                                <Pressable
                                    style={styles.editNameButton}
                                    onPress={() => {
                                        setIsEditingCommonName(false);
                                        setEditedCommonName(plant.commonName || plant.scientificName || '');
                                    }}
                                >
                                    <Ionicons name="close" size={20} color={colors.error} />
                                </Pressable>
                            </View>
                        ) : (
                            <View style={styles.plantNameRow}>
                                <Text style={[styles.plantName, { color: colors.text }]}>
                                    {plant.commonName?.trim() || plant.scientificName?.trim() || 'Неопознанное растение'}
                                </Text>
                                {plant.isInGarden && (
                                    <Pressable
                                        style={styles.editIconButton}
                                        onPress={() => {
                                            setEditedCommonName(plant.commonName || plant.scientificName || '');
                                            setIsEditingCommonName(true);
                                        }}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <Ionicons name="create-outline" size={16} color={colors.primary} />
                                    </Pressable>
                                )}
                            </View>
                        )}
                    </View>
                    
                    {/* Scientific Name Premium Badge — рамка по ширине и высоте текста */}
                    <View style={[styles.scientificBadge, { backgroundColor: colors.surface, width: '100%' }]}>
                        <View style={[styles.scientificIconContainer, { backgroundColor: colors.primaryLight, flexShrink: 0 }]}>
                            <Ionicons name="leaf" size={12} color={colors.primary} />
                        </View>
                        <Text style={[styles.scientificName, { color: colors.textSecondary, flexShrink: 1, flex: 1 }]} numberOfLines={2}>
                            {plant.scientificName?.trim() || plant.commonName?.trim() || 'Неизвестно'}
                        </Text>
                        <View style={[styles.scientificDot, { backgroundColor: colors.border, flexShrink: 0 }]} />
                        <Text style={[styles.verifiedText, { color: colors.textMuted, flexShrink: 0 }]}>Verified</Text>
                    </View>
                </View>

                {/* Tabs */}
                <View style={[styles.tabsContainer, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                    <View style={styles.tabs}>
                        {(['info', 'care', 'notes'] as const).map(tab => (
                            <Pressable
                                key={tab}
                                onPress={() => setActiveTab(tab)}
                                style={[
                                    styles.tab,
                                    { backgroundColor: activeTab === tab ? colors.primary : 'transparent' },
                                    activeTab === tab && (theme === 'dark' ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 3, elevation: 2 } : {}),
                                ]}
                            >
                                <Text style={[styles.tabText, { color: activeTab === tab ? '#ffffff' : colors.textSecondary }]}>
                                    {t(`plant_tab_${tab}` as any)}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>
                {activeTab === 'info' && (
                    <View style={styles.tabContent}>
                        {/* 1. Key Facts Section */}
                        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                            <View style={styles.sectionHeader}>
                                <View style={[styles.sectionIconContainer, { backgroundColor: colors.primaryLight }]}>
                                    <Ionicons name="clipboard-outline" size={28} color={colors.primary} />
                                </View>
                                <View style={styles.sectionTitleWrap}>
                                    <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={2}>{t('info_key_facts')}</Text>
                                </View>
                            </View>
                            
                            <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
                                {plant.description}
                            </Text>

                            <View style={styles.infoGrid}>
                                <View style={styles.infoGridRow}>
                                    <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'leaf-outline' }} label={t('info_type')} value={getPlantTypeDisplayLabel(plant.plantType, t)} color="text-green-500" /></View>
                                    <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'time-outline' }} label={t('info_lifespan')} value={getLifespanDisplayLabel(plant.lifespan, t)} color="text-blue-500" /></View>
                                </View>
                                <View style={styles.infoGridRow}>
                                    <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'cube-outline' }} label={t('char_plant_group')} value={translateDataValue(plant.characteristics?.mature?.plantGroup, t) || '—'} color="text-purple-500" /></View>
                                    <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'nutrition-outline' }} label={t('info_utility')} value={t(utility.labelKey)} color="text-amber-500" /></View>
                                </View>
                                <View style={styles.infoGridRow}>
                                    <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'arrow-up-circle-outline' }} label={t('char_height')} value={plant.characteristics?.mature?.maxHeight || '—'} color="text-orange-500" /></View>
                                    <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'resize-outline' }} label={t('char_width')} value={plant.characteristics?.mature?.maxWidth || '—'} color="text-indigo-500" /></View>
                                </View>
                                <View style={[styles.infoGridRow, styles.infoGridRowLast]}>
                                    <InfoCard icon={{ name: 'location-outline' }} label={t('info_habitat')} value={plant.habitat || '—'} color="text-red-500" className="col-span-2" />
                                </View>
                                <View style={styles.infoGridRow}>
                                    <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard 
                                        icon={{ name: 'person-outline' }} 
                                        label={t('info_toxicity_humans')} 
                                        value={t(humTox.labelKey)} 
                                        valueColor={humTox.level === 2 ? 'text-red-500' : (humTox.level === 1 ? 'text-yellow-600' : 'text-emerald-500')}
                                        color="text-blue-500" 
                                    /></View>
                                    <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard 
                                        icon={{ name: 'paw-outline' }} 
                                        label={t('info_toxicity_pets')} 
                                        value={t(petTox.labelKey)} 
                                        valueColor={petTox.level === 2 ? 'text-red-500' : (petTox.level === 1 ? 'text-yellow-600' : 'text-emerald-500')}
                                        color="text-pink-500" 
                                    /></View>
                                </View>
                                <View style={[styles.infoGridRow, styles.infoGridRowLast]}>
                                    <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard 
                                        icon={{ name: 'warning-outline' }} 
                                        label={t('info_allergy_humans')} 
                                        value={humAllergy.level > 0 ? t('allergy_yes') : t('safety_safe')} 
                                        valueColor={humAllergy.level > 0 ? 'text-yellow-600' : 'text-emerald-500'}
                                        color="text-amber-500" 
                                    /></View>
                                    <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard 
                                        icon={{ name: 'warning-outline' }} 
                                        label={t('info_allergy_pets')} 
                                        value={petAllergy.level > 0 ? t('allergy_yes') : t('safety_safe')} 
                                        valueColor={petAllergy.level > 0 ? 'text-yellow-600' : 'text-emerald-500'}
                                        color="text-cyan-500" 
                                    /></View>
                                </View>
                            </View>
                        </View>

                        {/* 3. Gallery Section */}
                        <View>
                            <View style={styles.galleryHeader}>
                                <View style={styles.galleryTitleContainer}>
                                    <Ionicons name="image-outline" size={20} color={colors.info} />
                                    <Text style={[styles.galleryTitle, { color: colors.text }]}>{t('plant_gallery')}</Text>
                                </View>
                                <View style={styles.galleryActions}>
                                    <Pressable onPress={() => setShowAiStyleModal(true)} style={[styles.galleryButton, { backgroundColor: colors.surface }]}>
                                        <Ionicons name="sparkles" size={20} color={colors.primary} />
                                    </Pressable>
                                    <Pressable onPress={handleAddPhoto} style={[styles.galleryButton, { backgroundColor: colors.surface }]}>
                                        <Ionicons name="add" size={20} color={colors.success} />
                                    </Pressable>
                                </View>
                            </View>
                            <ScrollView 
                                horizontal 
                                showsHorizontalScrollIndicator={false} 
                                style={styles.galleryScroll} 
                                contentContainerStyle={styles.galleryContent}
                                nestedScrollEnabled={true}
                            >
                                {galleryItems.map((item, idx) => (
                                    <Pressable key={idx} onPress={() => setViewingItem(item)} style={styles.galleryItem}>
                                        <Image source={{ uri: item.url }} style={styles.galleryImage} resizeMode="cover" />
                                        {item.type === 'ai' && (
                                            <View style={styles.aiBadgeOverlay}>
                                                <Ionicons name="sparkles" size={12} color="#ffffff" />
                                            </View>
                                        )}
                                    </Pressable>
                                ))}
                            </ScrollView>
                        </View>

                        {/* 3. Morphology Section */}
                        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                            <View style={styles.sectionHeader}>
                                <View style={[styles.sectionIconContainer, { backgroundColor: theme === 'dark' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(168, 85, 247, 0.1)' }]}>
                                    <Ionicons name="leaf" size={28} color={colors.primary} />
                                </View>
                                <View style={styles.sectionTitleWrap}>
                                    <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={2}>{t('info_morphology')}</Text>
                                </View>
                            </View>

                            <View style={[styles.morphologyTabs, { backgroundColor: colors.surface }]}>
                                {(['mature', 'flower', 'fruit'] as const).map(mTab => (
                                    <Pressable
                                        key={mTab}
                                        onPress={() => setMorphologyTab(mTab)}
                                        style={[styles.morphologyTab, { backgroundColor: colors.surface }, morphologyTab === mTab && [styles.morphologyTabActive, { backgroundColor: colors.primary }]]}
                                    >
                                        <Text style={[styles.morphologyTabText, { color: colors.textSecondary }, morphologyTab === mTab && [styles.morphologyTabTextActive, { color: '#ffffff' }]]}>
                                            {mTab === 'mature' ? t('char_general').toUpperCase() : mTab === 'flower' ? t('morphology_flower').toUpperCase() : t('morphology_fruit').toUpperCase()}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>

                            <View style={styles.morphologyContent} key={morphologyTab}>
                                {morphologyTab === 'mature' && (
                                    <View style={styles.infoGrid}>
                                        <View style={styles.infoGridRow}>
                                            <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'cube-outline' }} label={t('char_plant_group')} value={translateDataValue(plant.characteristics?.mature?.plantGroup, t) || '—'} color="text-blue-500" /></View>
                                            <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'arrow-up-circle-outline' }} label={t('char_height')} value={plant.characteristics?.mature?.maxHeight || '—'} color="text-purple-500" /></View>
                                        </View>
                                        <View style={styles.infoGridRow}>
                                            <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'resize-outline' }} label={t('char_width')} value={plant.characteristics?.mature?.maxWidth || '—'} color="text-indigo-500" /></View>
                                            <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'leaf-outline' }} label={t('char_leaf_type')} value={plant.characteristics?.mature?.leafType || '—'} color="text-emerald-500" /></View>
                                        </View>
                                        <View style={styles.infoGridRow}>
                                            <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'calendar-outline' }} label={t('char_planting_time')} value={translateDataValue(plant.characteristics?.mature?.plantingTime, t) || t('season_spring')} color="text-orange-500" /></View>
                                            <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'time-outline' }} label={t('info_lifespan')} value={getLifespanDisplayLabel(plant.lifespan, t)} color="text-cyan-500" /></View>
                                        </View>
                                        <View style={[styles.infoGridRow, styles.infoGridRowLast]}>
                                            <InfoCard 
                                                icon={{ name: 'color-palette-outline' }} 
                                                label={t('char_leaf_color')} 
                                                customValue={renderColorDots(translateDataValue(plant.characteristics?.mature?.leafColor, t) === '—' ? '' : translateDataValue(plant.characteristics?.mature?.leafColor, t))} 
                                                color="text-pink-500" 
                                                className="col-span-2"
                                            />
                                        </View>
                                    </View>
                                )}
                                {morphologyTab === 'flower' && (
                                    <View style={styles.infoGrid}>
                                        <View style={styles.infoGridRow}>
                                            <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'expand-outline' }} label={t('char_flower_size')} value={plant.characteristics?.flower?.flowerSize || '—'} color="text-pink-500" /></View>
                                            <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'calendar-outline' }} label={t('char_flowering_time')} value={plant.characteristics?.flower?.floweringTime || '—'} color="text-orange-500" /></View>
                                        </View>
                                        <View style={[styles.infoGridRow, styles.infoGridRowLast]}>
                                            <InfoCard 
                                                icon={{ name: 'color-palette-outline' }} 
                                                label={t('char_flower_color')} 
                                                customValue={renderColorDots(translateDataValue(plant.characteristics?.flower?.flowerColor, t) === '—' ? '' : translateDataValue(plant.characteristics?.flower?.flowerColor, t) || t('data_varies_by_species'))} 
                                                color="text-purple-500" 
                                                className="col-span-2"
                                            />
                                        </View>
                                    </View>
                                )}
                                {morphologyTab === 'fruit' && (
                                    <View style={styles.infoGrid}>
                                        <View style={styles.infoGridRow}>
                                            <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'nutrition-outline' }} label={t('char_fruit_name')} value={translateDataValue(plant.characteristics?.fruit?.fruitName, t) || t('data_no_data')} color="text-red-500" /></View>
                                            <View style={[styles.infoGridItem, { width: infoGridItemWidth }]}><InfoCard icon={{ name: 'time-outline' }} label={t('char_harvest_time')} value={translateDataValue(plant.characteristics?.fruit?.harvestTime, t) || t('data_no_data')} color="text-amber-500" /></View>
                                        </View>
                                        <View style={[styles.infoGridRow, styles.infoGridRowLast]}>
                                            <InfoCard 
                                                icon={{ name: 'color-palette-outline' }} 
                                                label={t('char_fruit_color')} 
                                                customValue={renderColorDots(translateDataValue(plant.characteristics?.fruit?.fruitColor, t) === '—' ? '' : translateDataValue(plant.characteristics?.fruit?.fruitColor, t) || t('data_not_applicable'))} 
                                                color="text-orange-500" 
                                                className="col-span-2"
                                            />
                                        </View>
                                    </View>
                                )}
                            </View>
                        </View>

                        {/* 4. Safety Passport Section */}
                        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                            <View style={styles.sectionHeader}>
                                <View style={[styles.sectionIconContainer, { backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)' }]}>
                                    <Ionicons name="shield-outline" size={28} color={colors.error} />
                                </View>
                                <View style={styles.sectionTitleWrap}>
                                    <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={2}>{t('info_safety_passport')}</Text>
                                </View>
                            </View>

                            <View style={styles.safetyContainer}>
                                <View style={[styles.safetyBlock, { backgroundColor: colors.surface }]}>
                                    <View style={styles.safetyBlockHeader}>
                                        <View style={[styles.safetyIcon, { backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
                                            <Ionicons name="person-outline" size={20} color={colors.info} />
                                        </View>
                                        <Text style={[styles.safetyBlockTitle, { color: colors.text }]}>{t('safety_for_humans')}</Text>
                                    </View>
                                    <View style={styles.safetyContent}>
                                        <View>
                                            <View style={styles.safetyRow}>
                                                <Text style={[styles.safetyLabel, { color: colors.textSecondary }]}>{t('plant_info_toxicity')}</Text>
                                                <View style={[styles.safetyBadge, { borderColor: humTox.level === 2 ? '#ef4444' : humTox.level === 1 ? '#eab308' : '#10b981' }]}>
                                                    <Text style={[styles.safetyBadgeText, { color: humTox.level === 2 ? '#ef4444' : humTox.level === 1 ? '#eab308' : '#10b981' }]}>
                                                        {t(humTox.labelKey)}
                                                    </Text>
                                                </View>
                                            </View>
                                            <Text style={[styles.safetyText, { color: colors.text }]}>{plant.safety?.toxicity.humans || '—'}</Text>
                                        </View>
                                        <View style={styles.safetySpacer}>
                                            <View style={styles.safetyRow}>
                                                <Text style={[styles.safetyLabel, { color: colors.textSecondary }]}>{t('plant_info_allergies')}</Text>
                                                <View style={[styles.safetyBadge, { borderColor: humAllergy.level > 0 ? colors.warning : colors.primary }]}>
                                                    <Text style={[styles.safetyBadgeText, { color: humAllergy.level > 0 ? colors.warning : colors.primary }]}>
                                                        {humAllergy.level === 0 ? t('allergy_level_low') : t('allergy_level_high')}
                                                    </Text>
                                                </View>
                                            </View>
                                            <Text style={[styles.safetyText, { color: colors.text }]}>{plant.safety?.allergies.humans || '—'}</Text>
                                        </View>
                                    </View>
                                </View>

                                <View style={[styles.safetyBlock, { backgroundColor: colors.surface }]}>
                                    <View style={styles.safetyBlockHeader}>
                                        <View style={[styles.safetyIcon, { backgroundColor: theme === 'dark' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(236, 72, 153, 0.1)' }]}>
                                            <Ionicons name="paw-outline" size={20} color={colors.info} />
                                        </View>
                                        <Text style={[styles.safetyBlockTitle, { color: colors.text }]}>{t('safety_for_pets')}</Text>
                                    </View>
                                    <View style={styles.safetyContent}>
                                        <View>
                                            <View style={styles.safetyRow}>
                                                <Text style={[styles.safetyLabel, { color: colors.textSecondary }]}>{t('plant_info_toxicity')}</Text>
                                                <View style={[styles.safetyBadge, { borderColor: petTox.level === 2 ? colors.error : petTox.level === 1 ? colors.warning : colors.primary }]}>
                                                    <Text style={[styles.safetyBadgeText, { color: petTox.level === 2 ? colors.error : petTox.level === 1 ? colors.warning : colors.primary }]}>
                                                        {t(petTox.labelKey)}
                                                    </Text>
                                                </View>
                                            </View>
                                            <Text style={[styles.safetyText, { color: colors.text }]}>{plant.safety?.toxicity.pets || '—'}</Text>
                                        </View>
                                        <View style={styles.safetySpacer}>
                                            <View style={styles.safetyRow}>
                                                <Text style={[styles.safetyLabel, { color: colors.textSecondary }]}>{t('plant_info_allergies')}</Text>
                                                <View style={[styles.safetyBadge, { borderColor: petAllergy.level > 0 ? colors.warning : colors.primary }]}>
                                                    <Text style={[styles.safetyBadgeText, { color: petAllergy.level > 0 ? colors.warning : colors.primary }]}>
                                                        {petAllergy.level === 0 ? t('allergy_level_low') : t('allergy_level_high')}
                                                    </Text>
                                                </View>
                                            </View>
                                            <Text style={[styles.safetyText, { color: colors.text }]}>{plant.safety?.allergies.pets || '—'}</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* 5. Adaptation Strategy Section — всегда показываем */}
                        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                            <View style={styles.sectionHeader}>
                                <View style={[styles.sectionIconContainer, { backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
                                    <Ionicons name="flash-outline" size={28} color={colors.info} />
                                </View>
                                <View style={styles.sectionTitleWrap}>
                                    <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={2}>{t('info_adaptation')}</Text>
                                </View>
                            </View>
                            <View style={styles.adaptationBox}>
                                <Text style={[styles.adaptationText, { color: colors.textSecondary }]}>
                                    {plant.adaptationStrategy?.trim() || t('data_adaptation_loading')}
                                </Text>
                            </View>
                        </View>

                        {/* 6. Heritage & Legends — значение названия, история, легенды всегда в блоке */}
                        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                            <View style={styles.sectionHeader}>
                                <View style={[styles.sectionIconContainer, { backgroundColor: theme === 'dark' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)' }]}>
                                    <Ionicons name="time-outline" size={28} color={colors.warning} />
                                </View>
                                <View style={styles.sectionTitleWrap}>
                                    <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={2}>{t('info_heritage')}</Text>
                                </View>
                            </View>
                            <View style={styles.heritageContent}>
                                <View>
                                    <Text style={[styles.heritageLabel, { color: colors.textSecondary }]}>{t('plant_info_name_meaning')}</Text>
                                    <Text style={[styles.heritageText, { color: colors.text }]}>{plant.nameMeaning?.trim() || '—'}</Text>
                                </View>
                                <View>
                                    <Text style={[styles.heritageLabel, { color: colors.textSecondary }]}>{t('plant_info_name_history')}</Text>
                                    <Text style={[styles.heritageText, { color: colors.text }]}>{plant.nameHistory?.trim() || '—'}</Text>
                                </View>
                                <View style={[styles.legendsBox, { backgroundColor: colors.surface }]}>
                                    <View style={styles.legendsHeader}>
                                        <Ionicons name="sparkles" size={16} color={colors.warning} />
                                        <Text style={[styles.legendsTitle, { color: colors.text }]}>{t('plant_info_history_legends')}</Text>
                                    </View>
                                    <Text style={[styles.legendsText, { color: colors.textSecondary }]}>{plant.historyAndLegends?.trim() || '—'}</Text>
                                </View>
                            </View>
                        </View>

                        {/* Scientific classification (Taxonomy) — под культурное наследие */}
                        {(plant.taxonomy && (plant.taxonomy.family || plant.taxonomy.genus || plant.taxonomy.species)) && (
                            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                                <View style={styles.sectionHeader}>
                                    <View style={[styles.sectionIconContainer, { backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
                                        <Ionicons name="git-branch-outline" size={28} color={colors.info} />
                                    </View>
                                    <View style={styles.sectionTitleWrap}>
                                        <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={2}>{t('info_taxonomy')}</Text>
                                    </View>
                                </View>
                                <View style={styles.taxonomyContainer}>
                                    {(['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'] as const).map((key, idx) => {
                                        const TAXONOMY_LABEL_KEYS: Record<typeof key, 'tax_kingdom' | 'tax_phylum' | 'tax_class' | 'tax_order' | 'tax_family' | 'tax_genus' | 'tax_species'> = {
                                            kingdom: 'tax_kingdom', phylum: 'tax_phylum', class: 'tax_class', order: 'tax_order', family: 'tax_family', genus: 'tax_genus', species: 'tax_species',
                                        };
                                        const label = t(TAXONOMY_LABEL_KEYS[key]);
                                        const value = plant.taxonomy?.[key]?.trim();
                                        if (!value || value === '-' || value === '—') return null;
                                        return (
                                            <View key={key} style={styles.taxonomyItem}>
                                                <View style={[styles.taxonomyDot, { backgroundColor: colors.border }]} />
                                                <View>
                                                    <Text style={[styles.taxonomyRank, { color: colors.textSecondary }]}>{label}</Text>
                                                    <Text style={[styles.taxonomyValue, { color: colors.text }]} numberOfLines={2}>{value}</Text>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {/* 8. FAQ Accordion — минимум 3 вопроса, без фона у текста */}
                        {(() => {
                            const MIN_FAQ = 3;
                            const name = plant.commonName || t('common_plant');
                            const defaultFaqs = [
                                { question: t('discover_faq_water_q').replace('{name}', name), answer: t('discover_faq_water_a') },
                                { question: t('discover_faq_light_q').replace('{name}', name), answer: t('discover_faq_light_a') },
                                { question: t('discover_faq_repot_q').replace('{name}', name), answer: t('discover_faq_repot_a') },
                            ];
                            const baseFaq = plant.faq && plant.faq.length > 0 ? plant.faq : [];
                            const faqItems = baseFaq.length >= MIN_FAQ ? baseFaq : [...baseFaq, ...defaultFaqs.slice(0, MIN_FAQ - baseFaq.length)];
                            if (faqItems.length === 0) return null;
                            return (
                                <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                                    <View style={styles.sectionHeader}>
                                        <View style={[styles.sectionIconContainer, { backgroundColor: theme === 'dark' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(6, 182, 212, 0.1)' }]}>
                                            <Ionicons name="help-circle-outline" size={28} color={colors.info} />
                                        </View>
                                        <View style={styles.sectionTitleWrap}>
                                            <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={2}>{t('plant_info_faq')}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.faqList}>
                                        {faqItems.map((item, idx) => (
                                            <View key={idx} style={[styles.faqItem, { borderBottomColor: colors.borderLight }]}>
                                                <Pressable 
                                                    onPress={() => setOpenFaqIndex(openFaqIndex === idx ? null : idx)}
                                                    style={styles.faqQuestion}
                                                >
                                                    <Text style={[styles.faqQuestionText, { color: colors.text }]} numberOfLines={3}>{item.question}</Text>
                                                    <View style={[styles.faqChevron, { backgroundColor: 'transparent' }, openFaqIndex === idx && styles.faqChevronOpen]}>
                                                        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                                                    </View>
                                                </Pressable>
                                                {openFaqIndex === idx && (
                                                    <View style={[styles.faqAnswer, { borderLeftColor: colors.info }]}>
                                                        <Text style={[styles.faqAnswerText, { color: colors.textSecondary }]}>{item.answer}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            );
                        })()}

                        {/* 9. Similar Plants Section — минимум 3 похожих растения */}
                        {(() => {
                            const MIN_SIMILAR = 3;
                            const defaultSimilar: { commonName: string; scientificName: string }[] = [
                                { commonName: 'Вриезия', scientificName: 'Vriesea' },
                                { commonName: 'Эхмея', scientificName: 'Aechmea' },
                                { commonName: 'Тилландсия', scientificName: 'Tillandsia' },
                            ];
                            const base = plant.similarPlants && plant.similarPlants.length > 0 ? plant.similarPlants : [];
                            const similarItems = base.length >= MIN_SIMILAR
                                ? base
                                : [...base, ...defaultSimilar.slice(0, MIN_SIMILAR - base.length)];
                            if (similarItems.length === 0) return null;
                            return (
                                <View style={styles.similarPlantsContainer}>
                                    <View style={styles.similarPlantsHeader}>
                                        <View style={[styles.similarPlantsIconContainer, { backgroundColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
                                            <Ionicons name="layers-outline" size={20} color={colors.success} />
                                        </View>
                                        <Text style={[styles.similarPlantsTitle, { color: colors.text }]}>{t('info_similar')}</Text>
                                    </View>
                                    <ScrollView 
                                        horizontal 
                                        showsHorizontalScrollIndicator={false} 
                                        style={styles.similarPlantsScroll} 
                                        contentContainerStyle={styles.similarPlantsContent}
                                        nestedScrollEnabled={true}
                                    >
                                        {similarItems.map((p, idx) => (
                                            <SimilarPlantCard 
                                                key={`${p.commonName}-${idx}`}
                                                plant={p}
                                                navigation={navigation}
                                                styles={styles}
                                            />
                                        ))}
                                    </ScrollView>
                                </View>
                            );
                        })()}
                    </View>
                )}

                {activeTab === 'care' && (
                    <View style={styles.tabContent}>
                        {/* Care Index & Quick Indicators */}
                        <View style={[styles.sectionCard, { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                             <View style={[styles.careIndexBadge, { backgroundColor: colors.primaryLight }]}>
                                <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                                <Text style={[styles.careIndexBadgeText, { color: colors.text }]} numberOfLines={2} adjustsFontSizeToFit={true}>{t('analysis_care_index').toUpperCase()}</Text>
                             </View>
                             
                             <View style={styles.careIndexNumberContainer}>
                                <View style={styles.careIndexBackgroundIcon}>
                                    <Ionicons name="pulse" size={180} color={colors.text} style={{ opacity: theme === 'dark' ? 0.05 : 0.03 }} />
                                </View>
                                <Text style={[styles.careIndexNumber, { color: colors.text }]}>{careSpecs.difficulty}</Text>
                                <Text style={[styles.careIndexDenominator, { color: colors.textMuted }]}>/100</Text>
                             </View>

                             <View
                                style={styles.careIndexProgressBar}
                                onLayout={(e) => {
                                    const { width, height } = e.nativeEvent.layout;
                                    if (width > 0 && height > 0) setCareIndexBarSize({ width, height });
                                }}
                             >
                                {careIndexBarSize && careIndexBarSize.width > 0 && (
                                    <Svg
                                        width={careIndexBarSize.width}
                                        height={careIndexBarSize.height}
                                        style={StyleSheet.absoluteFill}
                                    >
                                        <Defs>
                                            <LinearGradient id="careIndexGradient" x1="0" y1="0" x2="1" y2="0">
                                                <Stop offset="0" stopColor="#22c55e" />
                                                <Stop offset="0.5" stopColor="#eab308" />
                                                <Stop offset="1" stopColor="#ef4444" />
                                            </LinearGradient>
                                        </Defs>
                                        <Rect x={0} y={0} width={careIndexBarSize.width} height={careIndexBarSize.height} fill="url(#careIndexGradient)" rx={careIndexBarSize.height / 2} ry={careIndexBarSize.height / 2} />
                                    </Svg>
                                )}
                                <View style={[styles.careIndexProgressMarker, { left: `${careSpecs.difficulty}%`, marginLeft: -12 }]} />
                             </View>

                             <View style={styles.careIndexStats}>
                                <View style={styles.careIndexStat}>
                                    <View style={styles.careIndexStatHeader}>
                                        <View style={styles.careIndexStatLabelContainer}>
                                            <Ionicons name="shield-checkmark" size={14} color={colors.info} />
                                            <Text style={[styles.careIndexStatLabel, { color: colors.textSecondary }]}>{t('analysis_resilience')}</Text>
                                        </View>
                                        <Text style={[styles.careIndexStatValue, { color: colors.text }]}>{careSpecs.resilience}%</Text>
                                    </View>
                                    <View style={[styles.careIndexStatBar, { backgroundColor: colors.surface }]}>
                                        <View style={[styles.careIndexStatBarFill, { width: `${careSpecs.resilience}%`, backgroundColor: colors.info }]} />
                                    </View>
                                </View>
                                <View style={styles.careIndexStat}>
                                    <View style={styles.careIndexStatHeader}>
                                        <View style={styles.careIndexStatLabelContainer}>
                                            <Ionicons name="pulse" size={14} color={colors.warning} />
                                            <Text style={[styles.careIndexStatLabel, { color: colors.textSecondary }]}>{t('analysis_maintenance')}</Text>
                                        </View>
                                        <Text style={[styles.careIndexStatValue, { color: colors.warning }]}>{careSpecs.maintenance}%</Text>
                                    </View>
                                    <View style={[styles.careIndexStatBar, { backgroundColor: colors.surface }]}>
                                        <View style={[styles.careIndexStatBarFill, { width: `${careSpecs.maintenance}%`, backgroundColor: colors.warning }]} />
                                    </View>
                                </View>
                             </View>

                             <View style={[styles.expertConclusion, { backgroundColor: colors.surface }]}>
                                <View style={styles.expertConclusionHeader}>
                                    <Ionicons name="bulb-outline" size={20} color={colors.primary} />
                                    <Text style={[styles.expertConclusionTitle, { color: colors.text }]}>{t('analysis_expert_conclusion').toUpperCase()}</Text>
                                </View>
                                <Text style={[styles.expertConclusionText, { color: colors.text }]}>
                                    {t(careSpecs.difficulty < 40 ? 'expert_conclusion_level_beginner' : 'expert_conclusion_level_experienced')} {t(careSpecs.resilience > 60 ? 'expert_conclusion_adaptation_high' : 'expert_conclusion_adaptation_moderate')}
                                </Text>
                                
                                <View style={styles.prosConsGrid}>
                                    <View style={styles.prosConsColumn}>
                                        <View style={styles.prosConsHeader}>
                                            <Ionicons name="thumbs-up-outline" size={14} color={colors.primary} />
                                            <Text style={[styles.prosConsTitle, { color: colors.text }]}>{t('pros_label')}</Text>
                                        </View>
                                        <View style={styles.prosConsList}>
                                            {plant.pros?.map((pro, i) => (
                                                <View key={i} style={styles.prosConsItem}>
                                                    <Text style={[styles.prosConsBullet, { color: colors.primary }]}>•</Text>
                                                    <View style={styles.prosConsTextWrap}>
                                                        <Text style={[styles.prosConsText, { color: colors.textSecondary }]}>{pro}</Text>
                                                    </View>
                                                </View>
                                            )) || <Text style={[styles.prosConsEmpty, { color: colors.textMuted }]}>...</Text>}
                                        </View>
                                    </View>
                                    <View style={styles.prosConsColumn}>
                                        <View style={styles.prosConsHeader}>
                                            <Ionicons name="thumbs-down-outline" size={14} color={colors.error} />
                                            <Text style={[styles.prosConsTitle, { color: colors.error }]}>{t('cons_label')}</Text>
                                        </View>
                                        <View style={styles.prosConsList}>
                                            {plant.cons?.map((con, i) => (
                                                <View key={i} style={styles.prosConsItem}>
                                                    <Text style={[styles.prosConsBullet, { color: colors.error }]}>•</Text>
                                                    <View style={styles.prosConsTextWrap}>
                                                        <Text style={[styles.prosConsText, { color: colors.textSecondary }]}>{con}</Text>
                                                    </View>
                                                </View>
                                            )) || <Text style={[styles.prosConsEmpty, { color: colors.textMuted }]}>...</Text>}
                                        </View>
                                    </View>
                                </View>

                                <Pressable 
                                    onPress={() => isSubscribed ? navigation.navigate('PlantAnalysis' as never, { plantId: plant.id, plant } as never) : navigation.navigate('SubscriptionManage' as never)}
                                    style={[styles.analysisButton, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                                >
                                    <Ionicons name="search-outline" size={14} color={colors.text} />
                                    <Text style={[styles.analysisButtonText, { color: colors.text }]} numberOfLines={2}>{t('biometric_report_full').toUpperCase()}</Text>
                                </Pressable>
                             </View>
                        </View>

                        {/* Care Intelligence Hub */}
                        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                            <View style={styles.sectionHeader}>
                                <View style={[styles.sectionIconContainer, { backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
                                    <Ionicons name="sparkles" size={28} color={colors.info} />
                                </View>
                                <View style={styles.sectionTitleWrap}>
                                    <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={2}>{t('section_care_hub')}</Text>
                                </View>
                            </View>

                            <View style={styles.hubGrid}>
                                <View style={styles.hubGridRow}>
                                    <View style={styles.hubGridItem}>
                                        <HubCard 
                                            title={t('care_temperature').toUpperCase()} 
                                            content={plant.careTips?.temperature || '18-26°C'} 
                                            color="red"
                                            icon={{ name: 'thermometer-outline' }}
                                            onPress={() => isSubscribed ? navigation.navigate('ArticleDetail' as never, { articleId: 'temp', isDynamic: true, category: t('care_temperature'), plantName: plant.commonName, plantImage: plant.imageUrl } as never) : navigation.navigate('SubscriptionManage' as never)}
                                        />
                                    </View>
                                    <View style={styles.hubGridItem}>
                                        <HubCard 
                                            title={t('care_lighting').toUpperCase()} 
                                            content={plant.careTips?.sunlight || '—'} 
                                            color="yellow"
                                            icon={{ name: 'sunny-outline' }}
                                            onPress={() => isSubscribed ? navigation.navigate('ArticleDetail' as never, { articleId: 'light', isDynamic: true, category: t('care_lighting'), plantName: plant.commonName, plantImage: plant.imageUrl } as never) : navigation.navigate('SubscriptionManage' as never)}
                                        />
                                    </View>
                                </View>
                                <View style={styles.hubGridRow}>
                                    <View style={styles.hubGridItem}>
                                        <HubCard 
                                            title={t('care_soil').toUpperCase()} 
                                            content={plant.careTips?.soil || '—'} 
                                            color="orange" 
                                            icon={{ name: 'layers-outline' }}
                                            onPress={() => isSubscribed ? navigation.navigate('ArticleDetail' as never, { articleId: 'soil', isDynamic: true, category: t('care_soil'), plantName: plant.commonName, plantImage: plant.imageUrl } as never) : navigation.navigate('SubscriptionManage' as never)}
                                        />
                                    </View>
                                    <View style={styles.hubGridItem}>
                                        <HubCard 
                                            title={t('care_water').toUpperCase()} 
                                            content={plant.careTips?.watering || '—'} 
                                            color="blue" 
                                            icon={{ name: 'water-outline' }}
                                            onPress={() => isSubscribed ? navigation.navigate('ArticleDetail' as never, { articleId: 'water', isDynamic: true, category: t('care_water'), plantName: plant.commonName, plantImage: plant.imageUrl } as never) : navigation.navigate('SubscriptionManage' as never)}
                                        />
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* Plan Section — только для растений в саду */}
                        {plant.isInGarden ? (
                        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                            <View style={styles.planHeader}>
                                <View style={styles.sectionTitleWrap}>
                                    <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={1}>{t('section_care_plan')}</Text>
                                </View>
                                <View style={styles.planActions}>
                                    <Pressable onPress={openCareSettings} style={[styles.planActionButton, { backgroundColor: colors.surface }]}>
                                        <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
                                    </Pressable>
                                    <TouchableOpacity onPress={() => setTimeout(() => setShowHistoryModal(true), 0)} style={[styles.planActionButton, { backgroundColor: colors.surface }]} activeOpacity={0.7}>
                                        <Ionicons name="time-outline" size={20} color={colors.textMuted} />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={[styles.healthCard, { backgroundColor: overallHealth < 50 ? (theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)') : (theme === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.05)'), borderColor: colors.borderLight }]}>
                                <View style={styles.healthCardContent}>
                                    <View style={[styles.healthIconContainer, { backgroundColor: overallHealth < 50 ? (theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)') : (theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)') }]}>
                                        <Ionicons name="heart" size={24} color={overallHealth < 50 ? colors.error : colors.primary} />
                                    </View>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={[styles.healthTitle, { color: colors.text }]}>{t('health_total').toUpperCase()}</Text>
                                        <Text style={[styles.healthSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
                                            {nextTask 
                                                ? `${t('next_task')} ${t((nextTask as { labelKey: 'care_water' | 'care_fertilize' | 'care_misting' | 'care_repot' }).labelKey)}`
                                                : t('all_procedures_done')
                                            }
                                        </Text>
                                    </View>
                                </View>
                                <Text style={[styles.healthPercentage, { color: overallHealth < 50 ? colors.error : colors.primary }]}>{overallHealth}%</Text>
                            </View>

                            <View style={styles.tasksGrid}>
                                <View style={styles.tasksGridRow}>
                                    {reminderConfigs.slice(0, 2).map(config => {
                                        const { isDue, daysLeft, percentage } = getTaskStatus(config.key, config.defaultFreq, config.actionType);
                                        const isDone = completedTasks.includes(config.key);
                                        const iconName = config.icon;
                                        return (
                                            <View key={config.key} style={styles.tasksGridItem}>
                                                <Pressable 
                                                    onPress={() => handleTaskAction(config.key, config.actionType, config.defaultFreq)}
                                                    style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.borderLight }, isDue && !isDone && [styles.taskCardDue, { backgroundColor: theme === 'dark' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.08)', borderColor: theme === 'dark' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.25)' }]]}
                                                >
                                                    <View style={styles.taskCardContent}>
                                                        <View style={styles.taskProgressContainer}>
                                                            <ProgressRingMini 
                                                                percentage={isDone ? 100 : percentage} 
                                                                colorClass={isDone ? 'text-emerald-500' : isDue ? 'text-amber-500' : (config?.accent ?? 'text-blue-500')} 
                                                            />
                                                        </View>
                                                        <View style={[styles.taskIconContainer, 
                                                            isDone && { backgroundColor: colors.primary },
                                                            isDue && !isDone && { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.warning },
                                                            !isDone && !isDue && { backgroundColor: theme === 'dark' ? (config?.bg?.replace('0.1', '0.15') || 'rgba(59, 130, 246, 0.2)') : (config?.bg ?? 'rgba(59, 130, 246, 0.15)') }
                                                        ]}>
                                                            {isDone ? (
                                                                <Ionicons name="checkmark" size={32} color="#ffffff" />
                                                            ) : (config as any).iconLibrary === 'PottedPlant' ? (
                                                                <PottedPlantIcon size={24} color={isDue ? '#f59e0b' : (config?.color ?? '#3b82f6')} />
                                                            ) : (config as any).iconLibrary === 'MaterialCommunityIcons' ? (
                                                                <MaterialCommunityIcons name={iconName} size={24} color={isDue ? '#f59e0b' : (config?.color ?? '#3b82f6')} />
                                                            ) : (
                                                                <Ionicons name={iconName} size={24} color={isDue ? '#f59e0b' : (config?.color ?? '#3b82f6')} />
                                                            )}
                                                        </View>
                                                    </View>
                                                    <View style={styles.taskInfo}>
                                                        <Text style={[styles.taskLabel, { color: colors.text }]} numberOfLines={2}>{(config as { labelKey?: string }).labelKey ? t((config as { labelKey: 'care_water' | 'care_fertilize' | 'care_misting' | 'care_repot' }).labelKey) : ''}</Text>
                                                        <Text style={[styles.taskStatus, 
                                                            isDone && { color: colors.primary },
                                                            isDue && !isDone && { color: colors.warning }
                                                        ]} numberOfLines={1}>
                                                            {isDone ? t('task_done') : isDue ? t('agenda_today') : `${daysLeft} ${t('agenda_days_short')}`}
                                                        </Text>
                                                    </View>
                                                </Pressable>
                                            </View>
                                        );
                                    })}
                                </View>
                                <View style={styles.tasksGridRow}>
                                    {reminderConfigs.slice(2, 4).map(config => {
                                        const { isDue, daysLeft, percentage } = getTaskStatus(config.key, config.defaultFreq, config.actionType);
                                        const isDone = completedTasks.includes(config.key);
                                        const iconName = config.icon;
                                        return (
                                            <View key={config.key} style={styles.tasksGridItem}>
                                                <Pressable 
                                                    onPress={() => handleTaskAction(config.key, config.actionType, config.defaultFreq)}
                                                    style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.borderLight }, isDue && !isDone && [styles.taskCardDue, { backgroundColor: theme === 'dark' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.08)', borderColor: theme === 'dark' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.25)' }]]}
                                                >
                                                    <View style={styles.taskCardContent}>
                                                        <View style={styles.taskProgressContainer}>
                                                            <ProgressRingMini 
                                                                percentage={isDone ? 100 : percentage} 
                                                                colorClass={isDone ? 'text-emerald-500' : isDue ? 'text-amber-500' : (config?.accent ?? 'text-blue-500')} 
                                                            />
                                                        </View>
                                                        <View style={[styles.taskIconContainer, 
                                                            isDone && { backgroundColor: colors.primary },
                                                            isDue && !isDone && { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.warning },
                                                            !isDone && !isDue && { backgroundColor: theme === 'dark' ? (config?.bg?.replace('0.1', '0.15') || 'rgba(59, 130, 246, 0.2)') : (config?.bg ?? 'rgba(59, 130, 246, 0.15)') }
                                                        ]}>
                                                            {isDone ? (
                                                                <Ionicons name="checkmark" size={32} color="#ffffff" />
                                                            ) : (config as any).iconLibrary === 'PottedPlant' ? (
                                                                <PottedPlantIcon size={24} color={isDue ? '#f59e0b' : (config?.color ?? '#3b82f6')} />
                                                            ) : (config as any).iconLibrary === 'MaterialCommunityIcons' ? (
                                                                <MaterialCommunityIcons name={iconName} size={24} color={isDue ? '#f59e0b' : (config?.color ?? '#3b82f6')} />
                                                            ) : (
                                                                <Ionicons name={iconName} size={24} color={isDue ? '#f59e0b' : (config?.color ?? '#3b82f6')} />
                                                            )}
                                                        </View>
                                                    </View>
                                                    <View style={styles.taskInfo}>
                                                        <Text style={[styles.taskLabel, { color: colors.text }]} numberOfLines={2}>{(config as { labelKey?: string }).labelKey ? t((config as { labelKey: 'care_water' | 'care_fertilize' | 'care_misting' | 'care_repot' }).labelKey) : ''}</Text>
                                                        <Text style={[styles.taskStatus, 
                                                            isDone && { color: colors.primary },
                                                            isDue && !isDone && { color: colors.warning }
                                                        ]} numberOfLines={1}>
                                                            {isDone ? t('task_done') : isDue ? t('agenda_today') : `${daysLeft} ${t('agenda_days_short')}`}
                                                        </Text>
                                                    </View>
                                                </Pressable>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        </View>
                        ) : (
                            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                                <View style={styles.planHeader}>
                                    <View style={styles.sectionTitleWrap}>
                                        <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={1}>{t('section_care_plan')}</Text>
                                    </View>
                                </View>
                                <View style={[styles.healthCard, styles.addToGardenCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                                    <View style={styles.addToGardenCardContent}>
                                        <View style={[styles.healthIconContainer, { backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
                                            <Ionicons name="leaf-outline" size={24} color={colors.info} />
                                        </View>
                                        <Text style={[styles.healthTitle, { color: colors.text }]}>{t('add_to_garden_title').toUpperCase()}</Text>
                                        <Text style={[styles.addToGardenSubtitle, { color: colors.textSecondary }]}>
                                            {t('care_plan_garden_only')}
                                        </Text>
                                    </View>
                                </View>
                                <Pressable onPress={handleAddToGarden} style={[styles.addToGardenPlanButton, { backgroundColor: colors.primary }]}>
                                    <Ionicons name="add-circle" size={22} color="#ffffff" />
                                    <Text style={styles.addToGardenPlanButtonText}>Добавить в сад</Text>
                                </Pressable>
                            </View>
                        )}

                        {/* AI Health Scan CTA */}
                        {plant.isInGarden && (
                            <View style={[styles.sectionCard, { position: 'relative', overflow: 'hidden', backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                                <View style={styles.healthScanBackground}>
                                    <Ionicons name="search-outline" size={120} color={colors.text} style={{ opacity: theme === 'dark' ? 0.05 : 0.03 }} />
                                </View>
                                <View style={styles.healthScanHeader}>
                                    <View style={styles.healthScanInfo}>
                                        <View style={[styles.healthScanIcon, 
                                            plant.latestDiagnosis && plant.latestDiagnosis.isHealthy && { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)' },
                                            plant.latestDiagnosis && !plant.latestDiagnosis.isHealthy && { backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)' },
                                            !plant.latestDiagnosis && { backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }
                                        ]}>
                                            {plant.latestDiagnosis ? (
                                                plant.latestDiagnosis.isHealthy ? (
                                                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                                                ) : (
                                                    <Ionicons name="alert-circle" size={24} color={colors.error} />
                                                )
                                            ) : (
                                                <Ionicons name="search-outline" size={24} color={colors.info} />
                                            )}
                                        </View>
                                        <View style={styles.healthScanTextWrap}>
                                            <Text style={[styles.healthScanTitle, { color: colors.text }]}>AI Health Check</Text>
                                            <Text style={[styles.healthScanSubtitle, { color: colors.textSecondary }]}>
                                                {plant.latestDiagnosis ? `${t('last_scan_label')} ${new Date(plant.latestDiagnosis.date).toLocaleDateString()}` : t('diagnosis_history_empty')}
                                            </Text>
                                            {plant.latestDiagnosis && (
                                                <Text style={[styles.healthScanDiagnosis, { color: colors.text }]} numberOfLines={2}>
                                                    {plant.latestDiagnosis.isHealthy ? 'Биометрия в норме' : (plant.latestDiagnosis.problemTitle?.trim() || 'Выявлены отклонения')}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                    <Pressable onPress={() => navigation.navigate('NewCameraScreen' as never, { analysisMode: 'diagnosis', plantName: plant.commonName, plantId: plant.id } as never)} style={[styles.healthScanButton, { backgroundColor: colors.surface }]}>
                                        <Ionicons name="scan-outline" size={22} color={colors.text} />
                                    </Pressable>
                                </View>
                                
                                <Pressable 
                                    onPress={() => navigation.navigate('NewCameraScreen' as never, { analysisMode: 'diagnosis', plantName: plant.commonName, plantId: plant.id } as never)}
                                    style={[styles.healthScanCTA, { backgroundColor: colors.primary }]}
                                >
                                    <Text style={styles.healthScanCTAText}>{t('new_health_scan_cta').toUpperCase()}</Text>
                                    <Ionicons name="chevron-forward" size={16} color="#ffffff" />
                                </Pressable>
                            </View>
                        )}
                    </View>
                )}

                {activeTab === 'notes' && (
                    <View style={styles.notesTabWrap}>
                        <View style={[styles.notesCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                        <View style={styles.notesHeader}>
                            <View style={styles.notesTitleContainer}>
                                <Ionicons name="document-text-outline" size={20} color={colors.warning} />
                                <Text style={[styles.notesTitle, { color: colors.text }]}>{t('notes_title')}</Text>
                            </View>
                            {isEditingNotes ? (
                                <Pressable onPress={handleSaveNotes} style={[styles.notesButton, { backgroundColor: colors.surface }]}>
                                    <Ionicons name="checkmark" size={20} color={colors.success} />
                                </Pressable>
                            ) : (
                                <Pressable onPress={() => setIsEditingNotes(true)} style={[styles.notesButton, { backgroundColor: colors.surface }]}>
                                    <Ionicons name="create-outline" size={20} color={colors.textMuted} />
                                </Pressable>
                            )}
                        </View>
                        {isEditingNotes ? (
                            <TextInput
                                style={[styles.notesInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                                value={notesText}
                                onChangeText={setNotesText}
                                placeholder={t('notes_placeholder')}
                                placeholderTextColor={colors.textMuted}
                                multiline
                                textAlignVertical="top"
                            />
                        ) : (
                            <Text style={[styles.notesText, { color: colors.text }]}>
                                {notesText || <Text style={[styles.notesEmpty, { color: colors.textMuted }]}>{t('notes_empty')}</Text>}
                            </Text>
                        )}
                        </View>
                    </View>
                )}
            </ScrollView>

            <SaveSuccessModal
                visible={showPdfSavedModal}
                onClose={() => setShowPdfSavedModal(false)}
                title={t('success_title')}
                message={t('export_pdf_saved')}
            />

            {/* AI Style Modal */}
            {showAiStyleModal && (
                <Modal visible={showAiStyleModal} transparent animationType="slide" onRequestClose={() => setShowAiStyleModal(false)}>
                    <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={() => setShowAiStyleModal(false)}>
                        <Pressable style={[styles.aiStyleModal, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
                            <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
                                <View style={styles.modalHeaderLeft}>
                                    <View style={[styles.aiStyleIconContainer, { backgroundColor: colors.primaryLight }]}>
                                        <Ionicons name="sparkles" size={20} color={colors.primary} />
                                    </View>
                                    <Text style={[styles.modalTitle, { color: colors.text }]}>Выберите стиль</Text>
                                </View>
                                <Pressable onPress={() => setShowAiStyleModal(false)}>
                                    <Ionicons name="close" size={24} color={colors.textMuted} />
                                </Pressable>
                            </View>
                            
                            <View style={styles.aiStyleGrid}>
                                {ART_STYLES.reduce<typeof ART_STYLES[]>((rows, style, i) => {
                                    if (i % 2 === 0) rows.push(ART_STYLES.slice(i, i + 2));
                                    return rows;
                                }, []).map((row, rowIdx) => (
                                    <View key={rowIdx} style={styles.aiStyleGridRow}>
                                        {row.map(style => {
                                            const iconName = style.icon?.name || 'image-outline';
                                            return (
                                                <Pressable 
                                                    key={style.id} 
                                                    onPress={() => setSelectedStyle(style)} 
                                                    style={[styles.aiStyleOption, { backgroundColor: colors.surface, borderColor: colors.borderLight }, selectedStyle.id === style.id && [styles.aiStyleOptionActive, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]]}
                                                >
                                                    <Ionicons name={iconName} size={24} color={selectedStyle.id === style.id ? colors.primary : colors.textMuted} />
                                                    <Text style={[styles.aiStyleOptionText, { color: colors.textSecondary }, selectedStyle.id === style.id && [styles.aiStyleOptionTextActive, { color: colors.primary }]]} numberOfLines={1}>
                                                        {t((style as { labelKey: string }).labelKey)}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                ))}
                            </View>

                            <View style={[styles.aiStyleInfo, { backgroundColor: colors.surface }]}>
                                <View style={styles.aiStyleInfoHeader}>
                                    <Ionicons name="bulb-outline" size={18} color={colors.primary} />
                                    <Text style={[styles.aiStyleInfoTitle, { color: colors.text }]}>Технология генерации</Text>
                                </View>
                                <Text style={[styles.aiStyleInfoText, { color: colors.textSecondary }]}>
                                    Модель <Text style={{ fontWeight: 'bold', color: colors.text }}>Gemini 2.5 Flash Image</Text> анализирует биологические особенности вида <Text style={{ fontStyle: 'italic', color: colors.text }}>{plant.scientificName}</Text> и создает уникальную художественную интерпретацию в выбранном стиле. Результат будет сохранен в галерее с соотношением 1:1.
                                </Text>
                            </View>

                            <Pressable onPress={handleGenerateArt} style={[styles.aiStyleGenerateButton, { backgroundColor: colors.primary }]}>
                                <Text style={styles.aiStyleGenerateText}>Сгенерировать Арт</Text>
                            </Pressable>
                        </Pressable>
                    </Pressable>
                    </Modal>
                )}

            {/* Care Settings Modal */}
            {showCareSettingsModal && (
                <Modal visible={showCareSettingsModal} transparent animationType="slide" onRequestClose={() => setShowCareSettingsModal(false)}>
                    <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={() => setShowCareSettingsModal(false)}>
                        <Pressable style={[styles.careSettingsModal, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
                            <View style={[styles.careSettingsHeader, { borderBottomColor: colors.borderLight }]}>
                                <View style={styles.careSettingsHeaderLeft}>
                                    <View style={[styles.careSettingsIconContainer, { backgroundColor: colors.success + '15' }]}>
                                        <Ionicons name="settings-outline" size={24} color={colors.success} />
                                    </View>
                                    <View>
                                        <Text style={[styles.careSettingsTitle, { color: colors.text }]}>{t('bio_intervals_title')}</Text>
                                        <Text style={[styles.careSettingsSubtitle, { color: colors.textSecondary }]}>{t('bio_intervals_subtitle')}</Text>
                                    </View>
                                </View>
                                <Pressable onPress={() => setShowCareSettingsModal(false)} style={[styles.modalCloseButton, { backgroundColor: colors.surface }]}>
                                    <Ionicons name="close" size={24} color={colors.textMuted} />
                                </Pressable>
                            </View>

                            <KeyboardAvoidingView style={styles.careSettingsList} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                                <View style={styles.careSettingsGrid}>
                                    {reminderConfigs.map(config => {
                                        const iconName = config.icon;
                                        const val = tempReminders[config.key];
                                        const displayVal = val !== undefined && typeof val === 'number' && !isNaN(val)
                                            ? String(Math.round(val))
                                            : '';
                                        return (
                                            <View key={config.key} style={[styles.careSettingsItem, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                                                <View style={[styles.careSettingsItemIconContainer, { backgroundColor: colors.card }]}>
                                                    {(config as any).iconLibrary === 'PottedPlant' ? (
                                                        <PottedPlantIcon size={18} color={config.color} />
                                                    ) : (config as any).iconLibrary === 'MaterialCommunityIcons' ? (
                                                        <MaterialCommunityIcons name={iconName} size={18} color={config.color} />
                                                    ) : (
                                                        <Ionicons name={iconName} size={18} color={config.color} />
                                                    )}
                                                </View>
                                                <Text style={[styles.careSettingsItemLabel, { color: colors.text }]} numberOfLines={1}>{(config as { labelKey?: string }).labelKey ? t((config as { labelKey: 'care_water' | 'care_fertilize' | 'care_misting' | 'care_repot' }).labelKey) : ''}</Text>
                                                <TextInput
                                                    style={[styles.careSettingsItemValueInput, val !== undefined && String(val).length > 0 ? { color: '#ffffff', backgroundColor: colors.primary, borderColor: colors.primary } : { color: colors.textMuted, backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                                                    value={displayVal}
                                                    keyboardType="number-pad"
                                                    maxLength={6}
                                                    onChangeText={(text) => {
                                                        const digits = text.replace(/\D/g, '');
                                                        if (digits === '') {
                                                            setTempReminders({ ...tempReminders, [config.key]: undefined });
                                                            return;
                                                        }
                                                        const n = parseInt(digits, 10);
                                                        if (!isNaN(n)) setTempReminders({ ...tempReminders, [config.key]: clampDays(config.key, n) });
                                                    }}
                                                    onBlur={() => {
                                                        const current = tempReminders[config.key];
                                                        if (current !== undefined && !isNaN(Number(current))) {
                                                            setTempReminders({ ...tempReminders, [config.key]: clampDays(config.key, current) });
                                                        }
                                                    }}
                                                    placeholder="—"
                                                    placeholderTextColor={colors.textMuted}
                                                />
                                                <Text style={[styles.careSettingsItemDaySuffix, { color: colors.textSecondary }]}>{t('agenda_days_short')}</Text>
                                                {val === undefined && (
                                                    <Text style={[styles.careSettingsItemRequired, { color: colors.error }]}>{t('care_settings_required')}</Text>
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>
                            </KeyboardAvoidingView>

                                            <View style={[styles.careSettingsFooter, { borderTopColor: colors.borderLight }]}>
                                {!canSaveCareSettings && (
                                    <Text style={[styles.careSettingsFillHint, { color: colors.error }]}>{t('care_settings_fill_hint')}</Text>
                                )}
                                <View style={[styles.careSettingsInfo, { backgroundColor: colors.primaryLight, borderColor: colors.borderLight }]}>
                                    <Ionicons name="information-circle-outline" size={16} color={colors.info} />
                                    <Text style={[styles.careSettingsInfoText, { color: colors.textSecondary }]}>{t('bio_intervals_disclaimer')}</Text>
                                </View>
                                <Pressable
                                    onPress={saveCareSettings}
                                    style={[styles.careSettingsSaveButton, { backgroundColor: colors.primary }, !canSaveCareSettings && { backgroundColor: colors.disabled }]}
                                    disabled={!canSaveCareSettings}
                                >
                                    <Ionicons name="checkmark" size={20} color="#ffffff" />
                                    <Text style={[styles.careSettingsSaveText, { color: '#ffffff' }]}>{t('save_configuration').toUpperCase()}</Text>
                                </Pressable>
                            </View>
                        </Pressable>
                    </Pressable>
                    </Modal>
                )}

            {/* History Modal — всегда в дереве, видимость через visible */}
            <Modal visible={!!showHistoryModal} transparent animationType="slide" onRequestClose={() => setShowHistoryModal(false)} statusBarTranslucent>
                <View style={[styles.modalOverlay, { paddingBottom: insets.bottom }]}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowHistoryModal(false)} />
                    <View style={styles.historyModal}>
                        <View style={styles.historyHeader}>
                                <View style={styles.historyHeaderLeft}>
                                    <View style={styles.historyIconContainer}>
                                        <Ionicons name="time-outline" size={24} color="#8b5cf6" />
                                    </View>
                                    <View>
                                        <Text style={styles.historyTitle}>{t('care_journal_title')}</Text>
                                        <Text style={styles.historySubtitle}>{t('care_journal_subtitle')}</Text>
                                    </View>
                                </View>
                                <Pressable onPress={() => setShowHistoryModal(false)} style={styles.modalCloseButton}>
                                    <Ionicons name="close" size={24} color="#9ca3af" />
                                </Pressable>
                            </View>
                            <View style={styles.historyListWrap}>
                            <ScrollView style={styles.historyList} contentContainerStyle={styles.historyListContent} showsVerticalScrollIndicator={true} bounces={true} scrollEventThrottle={16} removeClippedSubviews={false} keyboardShouldPersistTaps="handled">
                                {!(plant?.careHistory?.length) ? (
                                    <View style={styles.historyEmpty}>
                                        <View style={styles.historyEmptyIcon}>
                                            <Ionicons name="document-text-outline" size={40} color="#9ca3af" />
                                        </View>
                                        <Text style={styles.historyEmptyText}>{t('history_empty')}</Text>
                                    </View>
                                ) : (
                                    <View style={styles.historyTimeline}>
                                        {(plant?.careHistory ?? []).map((entry, idx) => {
                                            const config = reminderConfigs.find(c => c.actionType === entry.type) || reminderConfigs[0];
                                            if (!config) return null;
                                            const date = new Date(entry.date);
                                            const iconName = config.icon;
                                            return (
                                                <View key={idx} style={styles.historyItem}>
                                                    <View style={[styles.historyItemIcon, { backgroundColor: config.bg }]}>
                                                        {(config as any).iconLibrary === 'PottedPlant' ? (
                                                            <PottedPlantIcon size={28} color={config.color} />
                                                        ) : (config as any).iconLibrary === 'MaterialCommunityIcons' ? (
                                                            <MaterialCommunityIcons name={iconName} size={28} color={config.color} />
                                                        ) : (
                                                            <Ionicons name={iconName} size={28} color={config.color} />
                                                        )}
                                                    </View>
                                                    <View style={styles.historyItemContent}>
                                                        <Text style={styles.historyItemTitle}>{(config as { labelKey?: string }).labelKey ? t((config as { labelKey: 'care_water' | 'care_fertilize' | 'care_misting' | 'care_repot' }).labelKey) : ''}</Text>
                                                        <Text style={styles.historyItemDate}>{date.toLocaleDateString('ru-RU')}</Text>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}
                            </ScrollView>
                            </View>
                        </View>
                </View>
            </Modal>

            {/* Image Viewer */}
            {viewingItem && (
                <Modal visible={!!viewingItem} transparent animationType="fade" onRequestClose={() => setViewingItem(null)}>
                    <View style={styles.imageViewer}>
                        <View style={styles.imageViewerHeader}>
                            <Pressable onPress={() => setViewingItem(null)} style={styles.imageViewerButton}>
                                <Ionicons name="close" size={24} color="#ffffff" />
                            </Pressable>
                            <View style={styles.imageViewerActions}>
                                <Pressable 
                                    onPress={handleSetMainPhoto} 
                                    style={[styles.imageViewerButton, plant.imageUrl === viewingItem.url && styles.imageViewerButtonActive]}
                                >
                                    <Ionicons name={plant.imageUrl === viewingItem.url ? "star" : "star-outline"} size={24} color="#ffffff" />
                                </Pressable>
                                {plant.imageUrl !== viewingItem.url && (
                                    <Pressable onPress={handleDeletePhoto} style={[styles.imageViewerButton, styles.imageViewerButtonDelete]}>
                                        <Ionicons name="trash-outline" size={24} color="#ffffff" />
                                    </Pressable>
                                )}
                            </View>
                        </View>
                        <View style={styles.imageViewerContent}>
                            {(() => {
                                const raw = viewerDisplayUri ?? viewingItem.url;
                                const safeUri = raw && (isPollinationsUrl(raw) || isInvalidImageDataUrl(raw)) ? getBackupPlantImage(plant?.commonName || plant?.scientificName || 'plant') : raw;
                                if (!safeUri) return <ActivityIndicator size="large" color="#ffffff" />;
                                return safeUri.startsWith('file://') ? (
                                    <Image
                                        source={{
                                            uri: (Platform.OS === 'android' && safeUri.startsWith('file://') && !safeUri.startsWith('file:///')) ? 'file:///' + safeUri.slice(7) : safeUri,
                                        }}
                                        style={styles.imageViewerImage}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <ExpoImage source={{ uri: safeUri }} style={styles.imageViewerImage} contentFit="cover" />
                                );
                            })()}
                        </View>
                    </View>
                </Modal>
            )}

            {showCollectionModal && (
                <Modal visible={showCollectionModal} transparent animationType="slide" onRequestClose={() => setShowCollectionModal(false)}>
                    <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={() => setShowCollectionModal(false)}>
                        <Pressable style={[styles.collectionModal, { backgroundColor: colors.card }, insets.bottom > 0 && { marginBottom: -insets.bottom, paddingBottom: insets.bottom }]} onPress={(e) => e.stopPropagation()}>
                            <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
                                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('col_select_title')}</Text>
                                <Pressable onPress={() => setShowCollectionModal(false)}>
                                    <Ionicons name="close" size={24} color={colors.textMuted} />
                                </Pressable>
                            </View>
                            <ScrollView style={styles.collectionList} contentContainerStyle={{ gap: 12, paddingBottom: 16 + insets.bottom }} showsVerticalScrollIndicator={false}>
                                {(collections ?? []).length === 0 ? (
                                    <View style={styles.collectionEmpty}>
                                        <Text style={[styles.collectionEmptyTitle, { color: colors.text }]}>Коллекций пока нет</Text>
                                        <Text style={[styles.collectionEmptyText, { color: colors.textSecondary }]}>Создайте первую — в неё сразу добавится это растение.</Text>
                                        <TextInput
                                            style={[styles.collectionEmptyInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                                            value={newCollectionName}
                                            onChangeText={setNewCollectionName}
                                            placeholder={t('placeholder_collection_name')}
                                            placeholderTextColor={colors.textMuted}
                                            autoFocus
                                        />
                                        <View style={styles.collectionEmptyIcons}>
                                            {availableIcons.map(icon => (
                                                <Pressable
                                                    key={icon.name}
                                                    onPress={() => setNewCollectionIcon(icon.name)}
                                                    style={[
                                                        styles.collectionEmptyIcon,
                                                        { backgroundColor: colors.surface, borderColor: colors.borderLight },
                                                        newCollectionIcon === icon.name && [styles.collectionEmptyIconActive, { backgroundColor: colors.primary }]
                                                    ]}
                                                >
                                                    <Ionicons 
                                                        name={icon.icon as any} 
                                                        size={20} 
                                                        color={newCollectionIcon === icon.name ? '#ffffff' : colors.textMuted} 
                                                    />
                                                </Pressable>
                                            ))}
                                        </View>
                                        <Pressable
                                            onPress={handleCreateCollection}
                                            style={[styles.collectionEmptyButton, { backgroundColor: colors.primary }, !newCollectionName.trim() && { backgroundColor: colors.disabled }]}
                                            disabled={!newCollectionName.trim()}
                                        >
                                            <Ionicons name="add" size={20} color="#ffffff" />
                                            <Text style={styles.collectionEmptyButtonText}>Создать коллекцию</Text>
                                        </Pressable>
                                    </View>
                                ) : (
                                    <>
                                        {(collections ?? []).map(col => {
                                            const iconInfo = availableIcons.find(i => i.name === col.iconName) || availableIcons[0];
                                            const isInCollection = col.plantIds.includes(plant.id);
                                            return (
                                                <Pressable 
                                                    key={col.id} 
                                                    onPress={() => toggleCollection(col)} 
                                                    style={[styles.collectionItem, { backgroundColor: colors.surface, borderColor: colors.borderLight }, isInCollection && { backgroundColor: colors.primaryLight }]}
                                                >
                                                    <View style={styles.collectionItemContent}>
                                                        <View style={[styles.collectionItemIcon, { backgroundColor: colors.card }, isInCollection && { backgroundColor: colors.primary }]}>
                                                            <Ionicons name={iconInfo.icon as any} size={18} color={isInCollection ? '#ffffff' : colors.textMuted} />
                                                        </View>
                                                        <Text style={[styles.collectionName, { color: colors.text }]}>{col.name}</Text>
                                                    </View>
                                                    {isInCollection && (
                                                        <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                                                    )}
                                                </Pressable>
                                            );
                                        })}
                                        <View style={styles.collectionEmpty}>
                                            <Text style={[styles.collectionEmptyTitle, { color: colors.text }]}>Создать новую коллекцию</Text>
                                            <TextInput
                                                style={[styles.collectionEmptyInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                                                value={newCollectionName}
                                                onChangeText={setNewCollectionName}
                                                placeholder={t('placeholder_collection_name')}
                                                placeholderTextColor={colors.textMuted}
                                            />
                                            <View style={styles.collectionEmptyIcons}>
                                                {availableIcons.map(icon => (
                                                    <Pressable
                                                        key={icon.name}
                                                        onPress={() => setNewCollectionIcon(icon.name)}
                                                        style={[
                                                            styles.collectionEmptyIcon,
                                                            { backgroundColor: colors.surface, borderColor: colors.borderLight },
                                                            newCollectionIcon === icon.name && [styles.collectionEmptyIconActive, { backgroundColor: colors.primary }]
                                                        ]}
                                                    >
                                                        <Ionicons 
                                                            name={icon.icon as any} 
                                                            size={20} 
                                                            color={newCollectionIcon === icon.name ? '#ffffff' : colors.textMuted} 
                                                        />
                                                    </Pressable>
                                                ))}
                                            </View>
                                            <Pressable
                                                onPress={handleCreateCollection}
                                                style={[styles.collectionEmptyButton, { backgroundColor: colors.primary }, !newCollectionName.trim() && { backgroundColor: colors.disabled }]}
                                                disabled={!newCollectionName.trim()}
                                            >
                                                <Ionicons name="add" size={20} color="#ffffff" />
                                                <Text style={styles.collectionEmptyButtonText}>Создать коллекцию</Text>
                                            </Pressable>
                                        </View>
                                    </>
                                )}
                            </ScrollView>
                        </Pressable>
                    </Pressable>
                </Modal>
            )}

            {showDeleteModal && (
                <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
                    <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                        <View style={[styles.deleteModal, { backgroundColor: colors.card }]}>
                            <View style={[styles.deleteIconContainer, { backgroundColor: colors.error + '15' }]}>
                                <Ionicons name="trash-outline" size={32} color={colors.error} />
                            </View>
                            <Text style={[styles.deleteModalTitle, { color: colors.text }]}>{t('delete_plant_title')}</Text>
                            <Text style={[styles.deleteModalDesc, { color: colors.textSecondary }]}>{t('delete_plant_desc')}</Text>
                            <View style={styles.deleteModalActions}>
                                <Pressable onPress={handleDelete} style={[styles.deleteConfirmButton, { backgroundColor: colors.error }]}>
                                    <Text style={styles.deleteConfirmText}>{t('delete_confirm')}</Text>
                                </Pressable>
                                <Pressable onPress={() => setShowDeleteModal(false)} style={[styles.deleteCancelButton, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                                    <Text style={[styles.deleteCancelText, { color: colors.text }]}>{t('delete_cancel')}</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}
        </View>
    );
};

const InfoCard = ({ icon: Icon, label, value, color, valueColor, className, customValue }: any) => {
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    let iconName = 'information-circle';
    if (Icon?.name) {
        iconName = Icon.name;
    } else if (typeof Icon === 'object' && Icon.name) {
        iconName = Icon.name;
    }
    
    const iconColor = color?.includes('green') ? '#10b981' : 
                     color?.includes('blue') ? '#3b82f6' : 
                     color?.includes('red') ? '#ef4444' : 
                     color?.includes('purple') ? '#8b5cf6' :
                     color?.includes('orange') ? '#f97316' :
                     color?.includes('pink') ? '#ec4899' :
                     color?.includes('amber') ? '#f59e0b' :
                     color?.includes('indigo') ? '#6366f1' :
                     color?.includes('cyan') ? '#06b6d4' :
                     '#6b7280';
    
    const valueColorHex = valueColor?.includes('red') ? '#ef4444' :
                          valueColor?.includes('yellow') ? '#eab308' :
                          valueColor?.includes('emerald') ? '#10b981' :
                          undefined;
    
    return (
        <View style={[styles.infoCard, className, { width: '100%', backgroundColor: colors.card, borderColor: colors.borderLight }]}>
            <View style={[styles.infoCardIcon, { backgroundColor: theme === 'dark' ? iconColor + '20' : iconColor + '15' }]}>
                <Ionicons name={iconName} size={18} color={iconColor} />
            </View>
            <View>
                <Text style={[styles.infoCardLabel, { color: colors.textSecondary }]}>{label}</Text>
                {customValue ? customValue : <Text style={[styles.infoCardValue, { color: colors.text }, valueColorHex && { color: valueColorHex }]}>{value}</Text>}
            </View>
        </View>
    );
};

const defaultColorStyle = { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' };
const HubCard = ({ title, content, color, icon: Icon, onPress }: { title: string, content: string, color: string, icon: React.ElementType, onPress: () => void }) => {
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const colorStyles: Record<string, { bg: string, text: string, border: string }> = {
        red: { bg: theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)', text: '#ef4444', border: theme === 'dark' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.3)' },
        yellow: { bg: theme === 'dark' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(234, 179, 8, 0.1)', text: '#eab308', border: theme === 'dark' ? 'rgba(234, 179, 8, 0.3)' : 'rgba(234, 179, 8, 0.3)' },
        orange: { bg: theme === 'dark' ? 'rgba(249, 115, 22, 0.15)' : 'rgba(249, 115, 22, 0.1)', text: '#f97316', border: theme === 'dark' ? 'rgba(249, 115, 22, 0.3)' : 'rgba(249, 115, 22, 0.3)' },
        blue: { bg: theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)', text: '#3b82f6', border: theme === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.3)' },
    };
    const style = (color && colorStyles[color]) || colorStyles.blue || defaultColorStyle;
    const iconName = Icon?.name || 'information-circle';

    return (
        <Pressable 
            onPress={onPress}
            style={[styles.hubCard, { backgroundColor: style.bg, borderColor: style.border }]}
        >
            <View style={styles.hubCardHeader}>
                <View style={[styles.hubCardIconContainer, { backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.4)' }]}>
                    <Ionicons name={iconName} size={16} color={style.text} />
                </View>
                <Ionicons name="chevron-forward" size={12} color={style.text} style={{ opacity: 0.4 }} />
            </View>
            <Text style={[styles.hubCardTitle, { color: style.text }]}>{title}</Text>
            <Text style={[styles.hubCardContent, { color: colors.textSecondary }]}>
                {content}
            </Text>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor применяется через inline стили
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: '#1e221f',
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingSpinnerContainer: {
        width: 96,
        height: 96,
        marginBottom: 32,
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingSpinnerOuter: {
        position: 'absolute',
        width: 96,
        height: 96,
        borderRadius: 48,
        borderWidth: 4,
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    loadingSpinner: {
        position: 'absolute',
    },
    loadingIcon: {
        position: 'absolute',
    },
    loadingTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 8,
    },
    loadingSubtitle: {
        fontSize: 14,
        color: '#9ca3af',
    },
    aiOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    aiSpinnerContainer: {
        width: 128,
        height: 128,
        marginBottom: 48,
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    aiSpinnerOrbit: {
        position: 'absolute',
        width: 128,
        height: 128,
        borderRadius: 64,
        borderWidth: 4,
        borderColor: 'rgba(168, 85, 247, 0.2)',
    },
    aiSpinnerDot: {
        position: 'absolute',
        width: 12,
        height: 12,
        borderRadius: 6,
        left: '50%',
        marginLeft: -6,
    },
    aiSpinnerInner: {
        width: 128,
        height: 128,
        borderRadius: 64,
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    aiContent: {
        width: '100%',
        maxWidth: 320,
        alignItems: 'center',
    },
    aiHeader: {
        alignItems: 'center',
        marginBottom: 16,
    },
    aiTitle: {
        fontSize: 24,
        fontWeight: '900',
        textTransform: 'uppercase',
        color: '#ffffff',
        marginBottom: 8,
    },
    aiBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 999,
        gap: 8,
    },
    aiBadgeText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        color: '#a855f7',
    },
    aiPhaseContainer: {
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    aiPhaseText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#9ca3af',
    },
    aiProgressBar: {
        width: '100%',
        height: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 999,
        marginTop: 32,
        overflow: 'hidden',
    },
    aiProgressFill: {
        height: '100%',
        backgroundColor: '#8b5cf6',
    },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    },
    headerButton: {
        padding: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        borderRadius: 999,
    },
    headerTitleContainer: {
        flex: 1,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        color: '#1f2937',
        textAlign: 'center',
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    exportMenuContainer: {
        position: 'relative',
    },
    exportMenu: {
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 8,
        width: 208,
        backgroundColor: '#ffffff',
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
        zIndex: 101,
        zIndex: 100,
    },
    exportMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    },
    exportMenuText: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        color: '#1f2937',
    },
    deleteButton: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    addButton: {
        backgroundColor: '#22c55e',
    },
    heroImageContainer: {
        width: '100%',
        position: 'relative',
        backgroundColor: 'rgba(0, 0, 0, 0.06)',
    },
    heroImagePreviewStyle: {
        backgroundColor: '#1f2937',
    },
    heroPlaceholder: {
        backgroundColor: 'rgba(31, 41, 55, 0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroImageWrapper: {
        width: '100%',
        aspectRatio: 1,
        overflow: 'hidden',
    },
    heroImage: {
        width: '100%',
        height: '100%',
    },
    heroGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '30%',
        backgroundColor: 'transparent',
    },
    colorDash: {
        color: '#9ca3af',
    },
    colorDotsContainer: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 4,
    },
    colorDot: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
    },
    titleBlock: {
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 8,
    },
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    tag: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
    },
    tagText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
    },
    plantNameContainer: {
        marginBottom: 8,
    },
    plantNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    plantName: {
        fontSize: 24,
        fontWeight: '900',
        color: '#1f2937',
        textTransform: 'uppercase',
        lineHeight: 28,
        flex: 1,
    },
    editIconButton: {
        padding: 6,
        borderRadius: 8,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.2)',
    },
    editNameContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#ffffff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    editNameInput: {
        flex: 1,
        fontSize: 24,
        fontWeight: '900',
        color: '#1f2937',
        textTransform: 'uppercase',
        padding: 0,
        margin: 0,
    },
    editNameButton: {
        padding: 6,
        borderRadius: 6,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    scientificBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 16,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.1)',
        gap: 10,
        flexWrap: 'wrap',
        // backgroundColor и maxWidth применяются через inline стили
    },
    scientificIconContainer: {
        padding: 4,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderRadius: 999,
    },
    scientificName: {
        fontSize: 13,
        fontWeight: '500',
        fontStyle: 'italic',
        letterSpacing: 0.5,
        flex: 1,
        minWidth: 0,
        // color и flexShrink применяются через inline стили; текст может переноситься
    },
    scientificDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
    },
    verifiedText: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        color: 'rgba(5, 150, 105, 0.4)',
        flexShrink: 0,
        // flexShrink: 0 гарантирует, что "Verified" не будет переноситься
    },
    tabsContainer: {
        paddingHorizontal: 24,
        marginTop: 24,
        marginBottom: 24,
        borderWidth: 1,
        borderRadius: 20,
        paddingVertical: 4,
        paddingHorizontal: 4,
    },
    tabs: {
        flexDirection: 'row',
        padding: 2,
        borderRadius: 14,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
    },
    tabActive: {
        // backgroundColor применяется через inline стили
    },
    tabText: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        textAlign: 'center',
        // color применяется через inline стили
    },
    tabTextActive: {
        // color применяется через inline стили
    },
    infoCard: {
        padding: 16,
        borderRadius: 24,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
        flexDirection: 'column',
        gap: 8,
        minHeight: 100,
        flex: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    infoCardIcon: {
        padding: 8,
        borderRadius: 12,
        alignSelf: 'flex-start',
    },
    infoCardLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#9ca3af',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        marginBottom: 2,
    },
    infoCardValue: {
        fontSize: 11,
        fontWeight: '900',
        lineHeight: 16,
        color: '#1f2937',
    },
    hubCard: {
        flex: 1,
        alignSelf: 'stretch',
        padding: 16,
        borderRadius: 32,
        borderWidth: 1,
        flexDirection: 'column',
        alignItems: 'flex-start',
        minHeight: 200,
        minWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    hubCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 8,
    },
    hubCardIconContainer: {
        padding: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    hubCardTitle: {
        fontSize: 8,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.2,
        opacity: 0.6,
        marginBottom: 4,
    },
    hubCardContent: {
        fontSize: 9,
        fontWeight: '900',
        lineHeight: 13,
        color: '#1f2937',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        flexShrink: 1,
        flex: 1,
        minWidth: 0,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    collectionModal: {
        backgroundColor: '#ffffff',
        width: '100%',
        maxWidth: 448,
        maxHeight: '90%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 32,
        paddingHorizontal: 32,
        paddingBottom: 0,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '900',
        // color применяется через inline стили
    },
    collectionList: {
        flexGrow: 1,
        marginBottom: 0,
    },
    emptyText: {
        color: '#6b7280',
        textAlign: 'center',
        paddingVertical: 16,
    },
    collectionEmpty: {
        paddingVertical: 8,
        gap: 16,
    },
    collectionEmptyTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#1f2937',
        textAlign: 'center',
    },
    collectionEmptyText: {
        fontSize: 13,
        color: '#6b7280',
        textAlign: 'center',
        lineHeight: 20,
    },
    collectionEmptyInput: {
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        backgroundColor: '#f9fafb',
    },
    collectionEmptyIcons: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        justifyContent: 'center',
    },
    collectionEmptyIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    collectionEmptyIconActive: {
        // backgroundColor применяется через inline стили
    },
    collectionEmptyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#8b5cf6',
    },
    collectionEmptyButtonDisabled: {
        opacity: 0.5,
    },
    collectionEmptyButtonText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#ffffff',
    },
    collectionItem: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
    },
    collectionItemContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    collectionItemIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        // backgroundColor применяется через inline стили
    },
    collectionName: {
        borderRadius: 16,
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    collectionName: {
        fontWeight: 'bold',
    },
    deleteModal: {
        backgroundColor: '#ffffff',
        width: '100%',
        maxWidth: 400,
        borderRadius: 40,
        padding: 32,
        alignItems: 'center',
    },
    deleteIconContainer: {
        width: 64,
        height: 64,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    deleteModalTitle: {
        fontSize: 20,
        fontWeight: '900',
        marginBottom: 8,
    },
    deleteModalDesc: {
        fontSize: 14,
        color: '#6b7280',
        marginBottom: 32,
    },
    deleteModalActions: {
        width: '100%',
        flexDirection: 'column',
        gap: 12,
    },
    deleteConfirmButton: {
        width: '100%',
        backgroundColor: '#ef4444',
        paddingVertical: 16,
        borderRadius: 16,
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
    },
    deleteConfirmText: {
        color: '#ffffff',
        fontWeight: '900',
        textAlign: 'center',
    },
    deleteCancelButton: {
        width: '100%',
        paddingVertical: 12,
    },
    deleteCancelText: {
        fontWeight: 'bold',
        color: '#6b7280',
        textAlign: 'center',
    },
    contentContainer: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 56,
    },
    contentContainerInner: {
        gap: 32,
        paddingBottom: 120,
    },
    tabContent: {
        gap: 32,
        paddingBottom: 48,
    },
    sectionCard: {
        padding: 32,
        borderRadius: 40,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        // backgroundColor и borderColor применяются через inline стили
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 32,
    },
    sectionIconContainer: {
        padding: 12,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    sectionTitleWrap: {
        flex: 1,
        minWidth: 0,
    },
    sectionTitle: {
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: -0.5,
        // color применяется через inline стили
    },
    descriptionText: {
        fontSize: 15,
        fontWeight: 'bold',
        lineHeight: 24,
        marginBottom: 40,
        paddingLeft: 8,
        // color применяется через inline стили
    },
    infoGrid: {
        width: '100%',
        gap: 16,
    },
    infoGridRow: {
        flexDirection: 'row',
        width: '100%',
        gap: 16,
        alignItems: 'stretch',
    },
    infoGridRowLast: {},
    infoGridItem: {
        flexGrow: 0,
        flexShrink: 0,
        alignSelf: 'stretch',
    },
    galleryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    galleryTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    galleryTitle: {
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: -0.5,
        // color применяется через inline стили
    },
    galleryActions: {
        flexDirection: 'row',
        gap: 8,
    },
    galleryButton: {
        padding: 8,
        borderRadius: 12,
        // backgroundColor применяется через inline стили
    },
    galleryScroll: {
        marginBottom: 8,
    },
    galleryContent: {
        gap: 16,
        paddingBottom: 8,
    },
    galleryItem: {
        minWidth: 140,
        height: 140,
        borderRadius: 24,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    galleryImage: {
        width: '100%',
        height: '100%',
    },
    aiBadgeOverlay: {
        position: 'absolute',
        top: 8,
        right: 8,
        padding: 6,
        backgroundColor: '#8b5cf6',
        borderRadius: 8,
    },
    morphologyTabs: {
        flexDirection: 'row',
        padding: 4,
        borderRadius: 16,
        marginBottom: 32,
        // backgroundColor применяется через inline стили
    },
    morphologyTab: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        // backgroundColor применяется через inline стили
    },
    morphologyTabActive: {
        // backgroundColor применяется через inline стили
    },
    morphologyTabText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.2,
        textAlign: 'center',
        // color применяется через inline стили
    },
    morphologyTabTextActive: {
        color: '#ffffff',
    },
    morphologyContent: {
        gap: 24,
    },
    safetyContainer: {
        gap: 24,
    },
    safetyBlock: {
        borderRadius: 32,
        padding: 24,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    safetyBlockHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    },
    safetyIcon: {
        padding: 8,
        borderRadius: 8,
    },
    safetyBlockTitle: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили
    },
    safetyContent: {
        gap: 16,
    },
    safetyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    safetyLabel: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили
    },
    safetyBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        borderWidth: 1,
        // borderColor применяется через inline стили
    },
    safetyBadgeText: {
        fontSize: 8,
        fontWeight: '900',
        textTransform: 'uppercase',
        // color применяется через inline стили
    },
    safetyText: {
        fontSize: 12,
        fontWeight: 'bold',
        lineHeight: 18,
        // color применяется через inline стили
    },
    safetySpacer: {
        paddingTop: 8,
    },
    adaptationBox: {
        padding: 24,
        borderRadius: 32,
        borderLeftWidth: 4,
        borderLeftColor: '#3b82f6',
        // backgroundColor применяется через inline стили
    },
    adaptationText: {
        fontSize: 14,
        fontWeight: 'bold',
        lineHeight: 20,
        fontStyle: 'italic',
        // color применяется через inline стили
    },
    notesTabWrap: {
        paddingBottom: 48,
    },
    notesCard: {
        padding: 24,
        paddingBottom: 32,
        borderRadius: 32,
        borderWidth: 1,
        minHeight: 300,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        // backgroundColor и borderColor применяются через inline стили
    },
    notesHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    notesTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    notesTitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили
    },
    notesButton: {
        padding: 8,
        borderRadius: 12,
        // backgroundColor применяется через inline стили
    },
    notesInput: {
        width: '100%',
        height: 192,
        borderRadius: 12,
        padding: 16,
        fontSize: 14,
        fontWeight: '500',
        borderWidth: 1,
        // backgroundColor, borderColor и color применяются через inline стили
    },
    notesText: {
        fontSize: 14,
        whiteSpace: 'pre-wrap',
        lineHeight: 20,
        // color применяется через inline стили
    },
    notesEmpty: {
        fontStyle: 'italic',
        // color применяется через inline стили
    },
    careIndexBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 999,
        marginBottom: 40,
        // backgroundColor применяется через inline стили
    },
    careIndexBadgeText: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        flex: 1,
        flexShrink: 1,
        // color применяется через inline стили
    },
    careIndexNumberContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'baseline',
        gap: 4,
        marginBottom: 16,
        position: 'relative',
    },
    careIndexBackgroundIcon: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    careIndexNumber: {
        fontSize: 96,
        fontWeight: '900',
        letterSpacing: -2,
        zIndex: 10,
        // color применяется через inline стили
    },
    careIndexDenominator: {
        fontSize: 36,
        fontWeight: '900',
        zIndex: 10,
        // color применяется через inline стили
    },
    careIndexProgressBar: {
        height: 16,
        width: '100%',
        borderRadius: 8,
        marginBottom: 32,
        position: 'relative',
        // backgroundColor применяется через inline стили
    },
    careIndexProgressMarker: {
        position: 'absolute',
        top: '50%',
        marginTop: -12,
        width: 24,
        height: 24,
        backgroundColor: '#d1d5db',
        borderWidth: 2,
        borderColor: '#9ca3af',
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    careIndexStats: {
        flexDirection: 'row',
        gap: 20,
        paddingHorizontal: 0,
        marginBottom: 40,
        width: '100%',
    },
    careIndexStat: {
        flex: 1,
    },
    careIndexStatHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        width: '100%',
    },
    careIndexStatLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flex: 1,
        minWidth: 0,
    },
    careIndexStatLabel: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        flexShrink: 1,
        // color применяется через inline стили
    },
    careIndexStatValue: {
        fontSize: 10,
        fontWeight: '900',
        // color применяется через inline стили
    },
    careIndexStatBar: {
        height: 10,
        borderRadius: 999,
        overflow: 'hidden',
        // backgroundColor применяется через inline стили
    },
    careIndexStatBarFill: {
        height: '100%',
        borderRadius: 999,
    },
    expertConclusion: {
        paddingVertical: 24,
        paddingHorizontal: 12,
        borderRadius: 32,
        borderWidth: 1,
        marginBottom: 16,
        // backgroundColor и borderColor применяются через inline стили
    },
    expertConclusionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    expertConclusionTitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили
    },
    expertConclusionText: {
        fontSize: 13,
        fontWeight: 'bold',
        lineHeight: 20,
        marginBottom: 16,
        // color применяется через inline стили
    },
    prosConsGrid: {
        flexDirection: 'row',
        gap: 16,
        marginTop: 24,
    },
    prosConsColumn: {
        flex: 1,
        gap: 8,
    },
    prosConsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    prosConsTitle: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили
    },
    prosConsList: {
        gap: 4,
    },
    prosConsItem: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'flex-start',
    },
    prosConsTextWrap: {
        flex: 1,
        flexShrink: 1,
        minWidth: 0,
    },
    prosConsBullet: {
        fontSize: 11,
        fontWeight: 'bold',
        // color применяется через inline стили
    },
    prosConsText: {
        fontSize: 11,
        fontWeight: 'bold',
        lineHeight: 16,
        // color применяется через inline стили
    },
    prosConsEmpty: {
        fontSize: 10,
        fontStyle: 'italic',
        // color применяется через inline стили
    },
    analysisButton: {
        width: '100%',
        marginTop: 24,
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderWidth: 1,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        // backgroundColor, borderColor и shadowColor применяются через inline стили
    },
    analysisButtonText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        flexShrink: 0,
        textAlign: 'center',
        // color применяется через inline стили
    },
    hubGrid: {
        gap: 16,
    },
    hubGridRow: {
        flexDirection: 'row',
        gap: 16,
    },
    hubGridItem: {
        flex: 1,
        minWidth: 0,
    },
    planHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 32,
    },
    planActions: {
        flexDirection: 'row',
        gap: 12,
    },
    planActionButton: {
        padding: 10,
        borderRadius: 12,
        // backgroundColor применяется через inline стили
    },
    addToGardenPlanButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: '#22c55e',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 16,
        marginTop: 8,
    },
    addToGardenPlanButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#ffffff',
    },
    addToGardenCard: {
        flexDirection: 'column',
        alignItems: 'stretch',
        // backgroundColor применяется через inline стили
    },
    addToGardenCardContent: {
        flexDirection: 'column',
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    addToGardenSubtitle: {
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
        lineHeight: 20,
        marginTop: 4,
        paddingHorizontal: 8,
        // color применяется через inline стили
    },
    healthCard: {
        padding: 24,
        borderRadius: 32,
        borderWidth: 1,
        marginBottom: 32,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        overflow: 'hidden',
        // backgroundColor и borderColor применяются через inline стили
    },
    healthCardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        flex: 1,
        flexShrink: 1,
        minWidth: 0,
    },
    healthIconContainer: {
        padding: 12,
        borderRadius: 16,
    },
    healthTitle: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        marginBottom: 4,
        // color применяется через inline стили
    },
    healthSubtitle: {
        fontSize: 10,
        fontWeight: 'bold',
        flexShrink: 1,
        // color применяется через inline стили
    },
    healthPercentage: {
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: -0.5,
        flexShrink: 0,
        marginLeft: 8,
        // color применяется через inline стили
    },
    tasksGrid: {
        gap: 16,
    },
    tasksGridRow: {
        flexDirection: 'row',
        gap: 16,
    },
    tasksGridItem: {
        flex: 1,
        minWidth: 0,
    },
    taskCard: {
        flex: 1,
        alignSelf: 'stretch',
        padding: 24,
        borderRadius: 40,
        borderWidth: 1,
        alignItems: 'center',
        gap: 16,
        // backgroundColor и borderColor применяются через inline стили
    },
    taskCardDue: {
        // backgroundColor и borderColor применяются через inline стили
    },
    taskCardContent: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    taskProgressContainer: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    taskIconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    taskInfo: {
        alignItems: 'center',
        flex: 1,
        minWidth: 0,
    },
    taskLabel: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        marginBottom: 4,
        textAlign: 'center',
        // color применяется через inline стили
    },
    taskStatus: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        // color применяется через inline стили
    },
    healthScanBackground: {
        position: 'absolute',
        top: 0,
        right: 0,
        padding: 32,
        opacity: 0.03,
    },
    healthScanHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
    },
    healthScanInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
        minWidth: 0,
    },
    healthScanTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    healthScanIcon: {
        padding: 10,
        borderRadius: 14,
    },
    healthScanTitle: {
        fontSize: 18,
        fontWeight: '900',
        marginBottom: 4,
        // color применяется через inline стили
    },
    healthScanSubtitle: {
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили
    },
    healthScanDiagnosis: {
        fontSize: 12,
        fontWeight: '600',
        marginTop: 6,
        // color применяется через inline стили
    },
    healthScanButton: {
        padding: 10,
        borderRadius: 999,
        flexShrink: 0,
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        // backgroundColor применяется через inline стили
    },
    healthScanCTA: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        // backgroundColor и shadowColor применяются через inline стили
    },
    healthScanCTAText: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        color: '#ffffff',
    },
    aiStyleModal: {
        width: '100%',
        maxWidth: 448,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 32,
        maxHeight: '90%',
        // backgroundColor применяется через inline стили
    },
    modalHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    aiStyleIconContainer: {
        padding: 8,
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        borderRadius: 12,
    },
    aiStyleGrid: {
        gap: 12,
        marginBottom: 32,
    },
    aiStyleGridRow: {
        flexDirection: 'row',
        width: '100%',
        gap: 12,
    },
    aiStyleOption: {
        flex: 1,
        minWidth: 0,
        padding: 16,
        borderRadius: 16,
        borderWidth: 2,
        alignItems: 'center',
        gap: 8,
        // backgroundColor и borderColor применяются через inline стили
    },
    aiStyleOptionActive: {
        // borderColor и backgroundColor применяются через inline стили
    },
    aiStyleOptionText: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        // color применяется через inline стили
    },
    aiStyleOptionTextActive: {
        // color применяется через inline стили
    },
    aiStyleInfo: {
        padding: 20,
        borderRadius: 24,
        borderWidth: 1,
        marginBottom: 32,
        // backgroundColor и borderColor применяются через inline стили
    },
    aiStyleInfoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    aiStyleInfoTitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили
    },
    aiStyleInfoText: {
        fontSize: 12,
        lineHeight: 18,
        // color применяется через inline стили
    },
    aiStyleGenerateButton: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 16,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        // backgroundColor и shadowColor применяются через inline стили
    },
    aiStyleGenerateText: {
        color: '#ffffff',
        fontWeight: '900',
        textAlign: 'center',
    },
    careSettingsModal: {
        width: '100%',
        maxWidth: 512,
        borderTopLeftRadius: 48,
        borderTopRightRadius: 48,
        padding: 20,
        maxHeight: '90%',
        // backgroundColor применяется через inline стили
    },
    careSettingsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    careSettingsHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    careSettingsIconContainer: {
        padding: 12,
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderRadius: 16,
    },
    careSettingsTitle: {
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: -0.5,
        marginBottom: 4,
        // color применяется через inline стили
    },
    careSettingsSubtitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили
    },
    modalCloseButton: {
        padding: 8,
        backgroundColor: '#f3f4f6',
        borderRadius: 999,
    },
    careSettingsList: {
        marginBottom: 20,
    },
    careSettingsGrid: {
        gap: 10,
    },
    careSettingsItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(249, 250, 251, 1)',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
    },
    careSettingsItemIconContainer: {
        padding: 8,
        borderRadius: 10,
        backgroundColor: '#ffffff',
        marginRight: 10,
    },
    careSettingsItemLabel: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        color: '#374151',
        flex: 1,
    },
    careSettingsItemValueInput: {
        minWidth: 44,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#22c55e',
        borderRadius: 999,
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '900',
        textAlign: 'center',
    },
    careSettingsItemValueInputEmpty: {
        backgroundColor: 'rgba(156, 163, 175, 0.25)',
        borderWidth: 1.5,
        borderColor: '#d1d5db',
    },
    careSettingsItemDaySuffix: {
        fontSize: 10,
        fontWeight: '700',
        color: '#9ca3af',
        marginLeft: 4,
    },
    careSettingsItemRequired: {
        fontSize: 9,
        fontWeight: '700',
        color: '#f59e0b',
        marginLeft: 4,
    },
    careSettingsFillHint: {
        fontSize: 11,
        fontWeight: '700',
        color: '#f59e0b',
        marginBottom: 4,
    },
    careSettingsSaveButtonDisabled: {
        opacity: 0.5,
    },
    careSettingsFooter: {
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0, 0, 0, 0.05)',
        gap: 12,
    },
    careSettingsInfo: {
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.1)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    careSettingsInfoText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#2563eb',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        flex: 1,
    },
    careSettingsSaveButton: {
        width: '100%',
        backgroundColor: '#22c55e',
        paddingVertical: 20,
        borderRadius: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        shadowColor: '#22c55e',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
    },
    careSettingsSaveText: {
        color: '#ffffff',
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
    },
    historyModal: {
        backgroundColor: '#ffffff',
        width: '100%',
        maxWidth: 512,
        height: '80%',
        maxHeight: '85%',
        borderTopLeftRadius: 48,
        borderTopRightRadius: 48,
        padding: 32,
        overflow: 'hidden',
        flexDirection: 'column',
    },
    historyListWrap: {
        flex: 1,
        minHeight: 0,
    },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
    },
    historyHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    historyIconContainer: {
        padding: 12,
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        borderRadius: 16,
    },
    historyTitle: {
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: -0.5,
        marginBottom: 4,
    },
    historySubtitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        color: '#9ca3af',
    },
    historyList: {
        flex: 1,
        minHeight: 0,
    },
    historyListContent: {
        paddingBottom: 32,
    },
    historyEmpty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
    },
    historyEmptyIcon: {
        width: 80,
        height: 80,
        backgroundColor: '#f3f4f6',
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    historyEmptyText: {
        fontSize: 18,
        fontWeight: '900',
        color: '#9ca3af',
    },
    historyTimeline: {
        gap: 24,
        paddingLeft: 24,
        position: 'relative',
    },
    historyItem: {
        flexDirection: 'row',
        gap: 24,
        alignItems: 'center',
        position: 'relative',
    },
    historyItemIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    historyItemContent: {
        flex: 1,
        backgroundColor: '#f9fafb',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
    },
    historyItemTitle: {
        fontWeight: '900',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        color: '#1f2937',
        marginBottom: 4,
    },
    historyItemDate: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#9ca3af',
    },
    imageViewer: {
        flex: 1,
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
    },
    imageViewerHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: 24,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    imageViewerButton: {
        padding: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 999,
    },
    imageViewerButtonActive: {
        backgroundColor: '#eab308',
    },
    imageViewerButtonDelete: {
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
    },
    imageViewerActions: {
        flexDirection: 'row',
        gap: 12,
    },
    imageViewerContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
    },
    imageViewerImage: {
        width: '100%',
        height: '100%',
        minHeight: 200,
        borderRadius: 8,
    },
    heritageContent: {
        gap: 24,
    },
    heritageLabel: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        color: '#f59e0b',
        marginBottom: 8,
    },
    heritageText: {
        fontSize: 14,
        fontWeight: 'bold',
        lineHeight: 20,
        color: '#4b5563',
        fontStyle: 'italic',
    },
    legendsBox: {
        padding: 24,
        borderRadius: 32,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    legendsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    legendsTitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили
    },
    legendsText: {
        fontSize: 14,
        fontWeight: 'bold',
        lineHeight: 20,
        // color применяется через inline стили
    },
    taxonomyContainer: {
        paddingLeft: 32,
        gap: 32,
        position: 'relative',
    },
    taxonomyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        position: 'relative',
    },
    taxonomyDot: {
        position: 'absolute',
        left: -25,
        top: '50%',
        marginTop: -8,
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#ffffff',
        backgroundColor: '#3b82f6',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        zIndex: 10,
    },
    taxonomyRank: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        color: '#9ca3af',
        marginBottom: 6,
    },
    taxonomyValue: {
        fontSize: 14,
        fontWeight: '900',
        color: '#1f2937',
        textTransform: 'uppercase',
    },
    taxonomyEmpty: {
        fontSize: 14,
        color: '#9ca3af',
        fontStyle: 'italic',
    },
    faqList: {
        gap: 16,
    },
    faqItem: {
        borderBottomWidth: 1,
        paddingBottom: 16,
        // borderBottomColor задаётся через inline
    },
    faqQuestion: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        paddingVertical: 8,
    },
    faqQuestionText: {
        fontSize: 14,
        fontWeight: '900',
        color: '#1f2937',
        flex: 1,
    },
    faqChevron: {
        padding: 6,
        borderRadius: 8,
    },
    faqChevronOpen: {
        transform: [{ rotate: '180deg' }],
    },
    faqAnswer: {
        marginTop: 12,
        paddingLeft: 16,
        borderLeftWidth: 2,
        borderLeftColor: 'rgba(6, 182, 212, 0.3)',
        paddingVertical: 4,
    },
    faqAnswerText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#6b7280',
        lineHeight: 18,
        fontStyle: 'italic',
    },
    similarPlantsContainer: {
        gap: 24,
    },
    similarPlantsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 8,
    },
    similarPlantsIconContainer: {
        padding: 8,
        borderRadius: 12,
        // backgroundColor применяется через inline стили
    },
    similarPlantsTitle: {
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: -0.5,
        // color применяется через inline стили
    },
    similarPlantsScroll: {
        marginHorizontal: -8,
    },
    similarPlantsContent: {
        gap: 20,
        paddingHorizontal: 8,
        paddingBottom: 24,
    },
    similarPlantCard: {
        width: 120,
        maxWidth: 120,
        backgroundColor: '#ffffff',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        overflow: 'hidden',
    },
    similarPlantImageContainer: {
        width: '100%',
        aspectRatio: 1,
        position: 'relative',
        overflow: 'hidden',
    },
    similarPlantImage: {
        width: '100%',
        height: '100%',
    },
    similarPlantOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
    },
    similarPlantBadge: {
        position: 'absolute',
        bottom: 6,
        right: 6,
        padding: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 999,
    },
    similarPlantInfo: {
        padding: 10,
        paddingTop: 8,
    },
    similarPlantName: {
        fontWeight: '900',
        fontSize: 10,
        color: '#1f2937',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    similarPlantScientific: {
        fontSize: 7,
        fontWeight: 'bold',
        color: '#9ca3af',
        fontStyle: 'italic',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: 2,
    },
    similarPlantFooter: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0, 0, 0, 0.05)',
    },
    similarPlantAction: {
        fontSize: 7,
        fontWeight: '900',
        color: '#9ca3af',
        textTransform: 'uppercase',
        letterSpacing: 0.2,
    },
});

export default PlantDetailScreen;