import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, FlatList } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { CatalogCategory, CatalogPlant } from '../types';
import { getCategoryMorePlants, generatePlantImageUrlWithFallback } from '../services/geminiService';
import { getPlantImageAIUrl, getPlantKey, getPlantImageUrl, isPlaceholderImageUrl, isPollinationsUrl, isInvalidImageDataUrl, getKnownGoodPlantImage, fetchImageAsDataUrl, getBackupPlantImage, ensureFallbackCacheLoaded } from '../services/plantImageService';
import { getPlants } from '../services/storageService';
import { getDiscoverPlantCache, setCachedPlant } from '../services/plantCacheService';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';

/** 1×1 прозрачный пиксель — показываем вместо стокового фото, пока ждём fallback (iNaturalist). */
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const DISCOVER_CATEGORY_KEYS: Record<string, 'category_poisonous' | 'category_indoor' | 'category_flowers' | 'category_allergens' | 'category_trees' | 'category_weeds' | 'category_regional_flora'> = {
    'Флора региона': 'category_regional_flora',
    'Ядовитые': 'category_poisonous', 'Домашние': 'category_indoor', 'Цветы': 'category_flowers',
    'Аллергены': 'category_allergens', 'Деревья': 'category_trees', 'Сорняки': 'category_weeds',
    'Poisonous': 'category_poisonous', 'Indoor': 'category_indoor', 'Flowers': 'category_flowers',
    'Allergens': 'category_allergens', 'Trees': 'category_trees', 'Weeds': 'category_weeds',
    'Regional flora': 'category_regional_flora',
};

const getCategoryIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('regional') || t.includes('region') || t.includes('flora') || t.includes('флора')) return { icon: 'location' as const, color: '#059669', bg: 'rgba(5, 150, 105, 0.1)' };
    if (t.includes('poison') || t.includes('toxic') || t.includes('яд') || t.includes('опасн')) return { icon: 'skull' as const, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' };
    if (t.includes('flower') || t.includes('bloom') || t.includes('цвет')) return { icon: 'flower' as const, color: '#ec4899', bg: 'rgba(236, 72, 153, 0.1)' };
    if (t.includes('allergy') || t.includes('allergen') || t.includes('аллерг')) return { icon: 'cloudy-outline' as const, color: '#eab308', bg: 'rgba(234, 179, 8, 0.1)' };
    if (t.includes('indoor') || t.includes('house') || t.includes('дом')) return { icon: 'home' as const, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' };
    if (t.includes('tree') || t.includes('дерев')) return { icon: 'leaf' as const, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
    if (t.includes('weed') || t.includes('invader') || t.includes('сорняк')) return { icon: 'cut' as const, color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.1)' };
    return { icon: 'leaf' as const, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' };
};

const getColorHex = (colorName: string | undefined): string => {
    if (!colorName) return '#4b5563';
    const lower = colorName.toLowerCase().trim();
    const colorMap: Record<string, string> = {
        'red': '#ef4444', 'pink': '#ec4899', 'blue': '#3b82f6', 'green': '#22c55e', 'yellow': '#eab308',
        'white': '#ffffff', 'purple': '#8b5cf6', 'orange': '#f97316', 'cream': '#fef3c7', 'violet': '#7c3aed',
        'lavender': '#e0e7ff', 'crimson': '#dc2626', 'gold': '#fbbf24', 'maroon': '#800000', 'brown': '#78350f',
        'black': '#000000', 'magenta': '#d946ef', 'teal': '#14b8a6', 'cyan': '#06b6d4', 'burgundy': '#800020',
        'lilac': '#c8a2c8', 'salmon': '#fa8072',
    };
    for (const key in colorMap) {
        if (lower.includes(key)) return colorMap[key];
    }
    return '#4b5563';
};

const COLOR_TRANSLATION_KEYS: Record<string, 'color_red' | 'color_orange' | 'color_yellow' | 'color_green' | 'color_blue' | 'color_pink' | 'color_purple' | 'color_white' | 'color_cream' | 'color_violet' | 'color_lavender' | 'color_teal' | 'color_cyan' | 'color_brown' | 'color_black' | 'color_magenta' | 'color_gold' | 'color_salmon' | 'color_lilac' | 'color_burgundy' | 'color_maroon' | 'color_crimson'> = {
    red: 'color_red', orange: 'color_orange', yellow: 'color_yellow', green: 'color_green', blue: 'color_blue', pink: 'color_pink', purple: 'color_purple', white: 'color_white', cream: 'color_cream', violet: 'color_violet', lavender: 'color_lavender', teal: 'color_teal', cyan: 'color_cyan', brown: 'color_brown', black: 'color_black', magenta: 'color_magenta', gold: 'color_gold', salmon: 'color_salmon', lilac: 'color_lilac', burgundy: 'color_burgundy', maroon: 'color_maroon', crimson: 'color_crimson',
};
const SEASON_TRANSLATION_KEYS: Record<string, 'season_spring' | 'season_summer' | 'season_autumn' | 'season_winter'> = {
    spring: 'season_spring', summer: 'season_summer', autumn: 'season_autumn', winter: 'season_winter',
    весна: 'season_spring', лето: 'season_summer', осень: 'season_autumn', зима: 'season_winter',
    frühling: 'season_spring', sommer: 'season_summer', herbst: 'season_autumn', winter: 'season_winter',
    printemps: 'season_spring', été: 'season_summer', automne: 'season_autumn', hiver: 'season_winter',
    primavera: 'season_spring', verano: 'season_summer', otoño: 'season_autumn', invierno: 'season_winter',
};
/** Значение «Flowering» в floweringTime переводим через plant_info_flowering (Цветение / Blüte / …). */
function getFloweringTimeDisplay(floweringTime: string | undefined, t: (key: string) => string): string {
    if (!floweringTime) return '—';
    const lower = floweringTime.trim().toLowerCase();
    if (lower === 'flowering') return t('plant_info_flowering');
    const seasonKey = SEASON_TRANSLATION_KEYS[lower];
    return seasonKey ? t(seasonKey) : floweringTime;
}

const CategoryCatalogScreen: React.FC = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { t, language } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    
    const category = (route.params as any)?.category || '';
    const initialData: CatalogCategory | null = (route.params as any)?.categoryData || null;
    const lat = (route.params as any)?.lat as number | undefined;
    const lon = (route.params as any)?.lon as number | undefined;
    const [plants, setPlants] = useState<CatalogPlant[]>(initialData?.plants || []);
    const [isPageLoading, setIsPageLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasReachedEnd, setHasReachedEnd] = useState(false);
    const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
    const [imageLoaded, setImageLoaded] = useState<Record<string, boolean>>({});
    const [cachedPlants, setCachedPlants] = useState<Record<string, CatalogPlant>>({});
    const [retryUrls, setRetryUrls] = useState<Record<string, string>>({});
    const [aiDataUrls, setAiDataUrls] = useState<Record<string, string>>({});
    const initialCountRef = useRef<number | null>(null);
    const prefetchedRef = useRef<Set<string>>(new Set());
    const fetchingAiRef = useRef<Set<string>>(new Set());

    // Единый кэш фото (Discover + Тренды): загружаем при монтировании и при каждом фокусе экрана
    const refreshDiscoverCache = React.useCallback(() => {
        getDiscoverPlantCache().then((cache) => {
            setCachedPlants(cache);
            setImageLoaded((prev) => {
                const next = { ...prev };
                Object.keys(cache).forEach((k) => {
                    if (cache[k]?.imageUrl && !isPlaceholderImageUrl(cache[k]?.imageUrl)) next[k] = true;
                });
                return next;
            });
        });
    }, []);
    useEffect(() => { refreshDiscoverCache(); }, [refreshDiscoverCache]);
    useFocusEffect(
        React.useCallback(() => {
            refreshDiscoverCache();
        }, [refreshDiscoverCache])
    );

    useEffect(() => {
        plants.forEach((plant) => {
            const key = getPlantKey(plant);
            if (prefetchedRef.current.has(key)) return;
            prefetchedRef.current.add(key);
            getPlantImageUrl(plant, { aiFallback: generatePlantImageUrlWithFallback }).then((url) => {
                if (!url || isPlaceholderImageUrl(url)) return;
                const safeUrl = isPollinationsUrl(url) ? getBackupPlantImage(plant.scientificName || plant.commonName) : url;
                setResolvedUrls((prev) => (prev[key] ? prev : { ...prev, [key]: safeUrl }));
                setCachedPlants((prev) => (prev[key]?.imageUrl ? prev : { ...prev, [key]: { ...plant, imageUrl: safeUrl } }));
                setImageLoaded((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
                if (!isPollinationsUrl(safeUrl)) ExpoImage.prefetch(safeUrl, 'disk').catch(() => {});
            });
        });
    }, [plants]);

    // Для AI (Pollinations) URL загружаем картинку через fetch и подставляем data URL — ExpoImage надёжно отображает только его
    useEffect(() => {
        if (plants.length === 0) return;
        ensureFallbackCacheLoaded().then(() => {
            plants.forEach((plant) => {
                const key = getPlantKey(plant);
                const uri = getDisplayUri(plant);
                if (!isPollinationsUrl(uri) || aiDataUrls[key] || fetchingAiRef.current.has(key)) return;
                fetchingAiRef.current.add(key);
                const queryForCache = plant.scientificName || plant.commonName || 'plant';
                fetchImageAsDataUrl(uri, undefined, queryForCache)
                .then((dataUrl) => {
                    const withDataUrl = { ...plant, imageUrl: dataUrl };
                    setCachedPlant(key, withDataUrl).catch(() => {}); // сразу в кэш
                    setCachedPlants((prev) => (prev[key]?.imageUrl === dataUrl ? prev : { ...prev, [key]: withDataUrl }));
                    setAiDataUrls((prev) => (prev[key] ? prev : { ...prev, [key]: dataUrl }));
                    setImageLoaded((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
                    console.log('[PlantLens кэш] Discover: добавлено AI-фото (data URL)', { key });
                })
                .catch(() => {})
                .finally(() => { fetchingAiRef.current.delete(key); });
            });
        });
    }, [plants, resolvedUrls, cachedPlants, retryUrls, aiDataUrls]);

    // Синхронизация imageLoaded с «есть URL»: кэш, резолв или статичный бэкап — сразу считаем карточку загруженной
    useEffect(() => {
        if (plants.length === 0) return;
        setImageLoaded((prev) => {
            let changed = false;
            const next = { ...prev };
            plants.forEach((p) => {
                const k = getPlantKey(p);
                if (next[k] === true) return;
                const hasUrl = retryUrls[k] || resolvedUrls[k] || cachedPlants[k]?.imageUrl;
                if (hasUrl) {
                    next[k] = true;
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [plants.length, resolvedUrls, cachedPlants, retryUrls]);

    // Снимаем экран загрузки, когда есть хотя бы одно растение с фото в кэше или по таймауту
    useEffect(() => {
        if (plants.length === 0) {
            setIsPageLoading(false);
            return;
        }
        const visibleCount = plants.filter((p) => {
            const key = getPlantKey(p);
            const c = cachedPlants[key];
            return !!(c?.imageUrl && !isPlaceholderImageUrl(c.imageUrl));
        }).length;
        if (visibleCount > 0) setIsPageLoading(false);
    }, [plants, cachedPlants]);

    useEffect(() => {
        if (plants.length === 0) return;
        const t = setTimeout(() => setIsPageLoading(false), 8000);
        return () => clearTimeout(t);
    }, [plants.length]);

    // Страховка: если onLoad не сработал за 10 с (битый/медленный URL) — снять спиннер с карточек
    useEffect(() => {
        if (plants.length === 0) return;
        const t = setTimeout(() => {
            setImageLoaded((prev) => {
                let changed = false;
                const next = { ...prev };
                plants.forEach((p) => {
                    const k = getPlantKey(p);
                    if (next[k] !== true) {
                        next[k] = true;
                        changed = true;
                    }
                });
                return changed ? next : prev;
            });
        }, 10000);
        return () => clearTimeout(t);
    }, [plants.length]);

    const handleBack = () => {
        navigation.goBack();
    };

    const handleLoadMore = async () => {
        if (isLoadingMore || !category) return;
        setIsLoadingMore(true);

        try {
            const existingNames = plants.map(p => p.commonName);
            const existingKeys = plants.map(p => getPlantKey(p));
            const morePlants = await getCategoryMorePlants(category, existingNames, lat, lon, language, existingKeys);

            if (morePlants.length === 0) {
                setHasReachedEnd(true);
            } else {
                setPlants(prev => {
                    const byKey = new Map<string, CatalogPlant>();
                    [...prev, ...morePlants].forEach(p => {
                        const key = getPlantKey(p);
                        if (!byKey.has(key)) byKey.set(key, p);
                    });
                    return Array.from(byKey.values());
                });
            }
        } catch (error) {
            console.error("Error loading more plants:", error);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleSelectPlant = async (plant: CatalogPlant) => {
        const savedPlants = await getPlants();
        const existingPlant = savedPlants.find(p => 
            p.commonName.toLowerCase() === plant.commonName.toLowerCase() || 
            p.scientificName.toLowerCase() === plant.scientificName.toLowerCase()
        );

        if (existingPlant) {
            navigation.navigate('PlantDetail' as never, { plantId: existingPlant.id } as never);
        } else {
            const key = getPlantKey(plant);
            const displayUri = getDisplayUri(plant);
            // В детали передаём только безопасный URI: не URL Pollinations (может вернуть HTML rate limit)
            const safeImage = isPollinationsUrl(displayUri)
                ? (aiDataUrls[key] || getBackupPlantImage(plant.scientificName || plant.commonName))
                : displayUri;
            navigation.navigate('PlantDetail' as never, {
                id: 'new',
                query: plant.commonName,
                scientificName: plant.scientificName,
                isGlobalSearch: true,
                image: safeImage,
            } as never);
        }
    };

    const handleImageLoad = (plantKey: string, plant: CatalogPlant, uri: string) => {
        setImageLoaded(prev => ({ ...prev, [plantKey]: true }));
        if (!uri || uri === TRANSPARENT_PIXEL || isPollinationsUrl(uri) || isInvalidImageDataUrl(uri)) return;
        const withResolvedUrl = { ...plant, imageUrl: uri };
        setCachedPlant(plantKey, withResolvedUrl).catch(() => {});
        setCachedPlants(prev => ({ ...prev, [plantKey]: withResolvedUrl }));
        if (uri.startsWith('http') || uri.startsWith('file://') || uri.startsWith('data:')) {
            ExpoImage.prefetch(uri, 'disk').catch(() => {});
        }
    };

    const handleImageError = (plant: CatalogPlant) => {
        const key = getPlantKey(plant);
        console.log('[PlantLens фото] UI: ошибка картинки, запрашиваем новый URL', { key });
        getPlantImageUrl(plant, { skipCache: true, aiFallback: generatePlantImageUrlWithFallback })
            .then((url) => {
                if (!url || isPlaceholderImageUrl(url)) return;
                const safeUrl = isPollinationsUrl(url) ? getBackupPlantImage(plant.scientificName || plant.commonName) : url;
                console.log('[PlantLens фото] UI: получили URL, подставляем в карточку', { key, ok: true, uri: safeUrl?.slice(0, 60) + '...' });
                setRetryUrls(prev => ({ ...prev, [key]: safeUrl }));
                setResolvedUrls(prev => ({ ...prev, [key]: safeUrl }));
                setCachedPlants(prev => ({ ...prev, [key]: { ...plant, imageUrl: safeUrl } }));
                setImageLoaded(prev => ({ ...prev, [key]: true }));
                setCachedPlant(key, { ...plant, imageUrl: safeUrl }).catch(() => {});
            })
            .catch((err) => console.warn('[PlantLens фото] UI: ошибка при получении URL', { key, err: String(err) }));
    };

    const getDisplayUri = (plant: CatalogPlant): string => {
        const key = getPlantKey(plant);
        let source: string;
        let uri: string;
        if (retryUrls[key] && !isPlaceholderImageUrl(retryUrls[key])) {
            source = 'retry';
            uri = retryUrls[key];
        } else if (cachedPlants[key]?.imageUrl && !isPlaceholderImageUrl(cachedPlants[key]!.imageUrl!)) {
            source = 'кэш';
            uri = cachedPlants[key]!.imageUrl!;
        } else if (resolvedUrls[key] && !isPlaceholderImageUrl(resolvedUrls[key])) {
            source = 'resolved';
            uri = resolvedUrls[key];
        } else if (plant.imageUrl && !isPlaceholderImageUrl(plant.imageUrl)) {
            source = 'plant';
            uri = plant.imageUrl;
        } else {
            source = 'AI';
            uri = getPlantImageAIUrl(plant.scientificName || 'plant');
        }
        const knownGood = getKnownGoodPlantImage(plant.commonName, plant.scientificName);
        if (knownGood) uri = knownGood;
        else if (isPollinationsUrl(uri) || isInvalidImageDataUrl(uri)) uri = getBackupPlantImage(plant.scientificName || plant.commonName);
        if (__DEV__) console.log('[PlantLens фото] карточка', { key, источник: source, uri: uri.slice(0, 55) + '...' });
        return uri;
    };

    const getImageSource = (plant: CatalogPlant) => ({ uri: getDisplayUri(plant) });

    /** URI для экрана детали: то же фото, что уже отобразилось в Discover. */
    const getResolvedImageUriForDetail = (plant: CatalogPlant): string => {
        const uri = getDisplayUri(plant);
        return uri && uri !== TRANSPARENT_PIXEL && !uri.startsWith('data:image/gif;base64')
            ? uri
            : getPlantImageAIUrl(plant.scientificName || 'plant');
    };

    const renderPlant = ({ item }: { item: CatalogPlant; index: number }) => {
        const plantKey = getPlantKey(item);
        const displayUri = getDisplayUri(item);
        // AI (Pollinations) или data:application/octet-stream (HTML) — подставляем data URL или бэкап
        const effectiveUri = (isPollinationsUrl(displayUri) || isInvalidImageDataUrl(displayUri))
            ? (aiDataUrls[plantKey] || getBackupPlantImage(item.scientificName || item.commonName))
            : displayUri;
        const imageSource = { uri: effectiveUri };
        const hasAiData = !!aiDataUrls[plantKey];
        return (
        <Pressable
            onPress={() => handleSelectPlant(item)}
            style={({ pressed }) => [
                styles.plantCard,
                { backgroundColor: colors.card, borderColor: colors.borderLight },
                pressed && styles.plantCardPressed,
            ]}
        >
            <View style={styles.plantImageContainer}>
                <ExpoImage
                    key={`${plantKey}-${hasAiData ? 'ai' : 'src'}-${(effectiveUri || '').slice(0, 60)}`}
                    source={imageSource}
                    style={styles.plantImage}
                    contentFit="cover"
                    cachePolicy="disk"
                    onLoad={() => handleImageLoad(plantKey, item, effectiveUri)}
                    onError={() => handleImageError(item)}
                />
                <View style={styles.plantImageOverlay} />
                <View style={styles.plantImageInfo}>
                    <Text style={styles.plantName}>{item.commonName}</Text>
                    <Text style={styles.plantScientificName}>{item.scientificName}</Text>
                </View>
            </View>

            <View style={styles.plantContent}>
                <View style={styles.plantDescription}>
                    <Ionicons name="information-circle" size={16} color={colors.primary} style={styles.infoIcon} />
                    <Text style={[styles.plantDescriptionText, { color: colors.textSecondary }]} numberOfLines={6}>
                        {item.description}
                    </Text>
                </View>

                <View style={[styles.plantInfoGrid, { borderTopColor: colors.borderLight }]}>
                    <View style={[styles.plantInfoCard, { backgroundColor: colors.surface }]}>
                        <View style={styles.plantInfoHeader}>
                            <Ionicons name="calendar" size={12} color={colors.info} />
                            <Text style={[styles.plantInfoLabel, { color: colors.textMuted }]}>{t('plant_info_flowering')}</Text>
                        </View>
                        <Text style={[styles.plantInfoValue, { color: colors.text }]} numberOfLines={1}>
                            {getFloweringTimeDisplay(item.floweringTime, t)}
                        </Text>
                    </View>
                    <View style={[styles.plantInfoCard, { backgroundColor: colors.surface }]}>
                        <View style={styles.plantInfoHeader}>
                            <MaterialIcons name="palette" size={12} color="#ec4899" />
                            <Text style={[styles.plantInfoLabel, { color: colors.textMuted }]}>{t('plant_info_flower_color')}</Text>
                        </View>
                        <View style={styles.plantInfoColorRow}>
                            <View 
                                style={[
                                    styles.colorDot, 
                                    { backgroundColor: getColorHex(item.flowerColor), borderColor: colors.borderLight }
                                ]} 
                            />
                            <Text style={[styles.plantInfoValue, { color: colors.text }]} numberOfLines={1}>
                                {item.flowerColor ? (COLOR_TRANSLATION_KEYS[item.flowerColor.toLowerCase()] ? t(COLOR_TRANSLATION_KEYS[item.flowerColor.toLowerCase()]) : item.flowerColor) : '—'}
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={styles.plantFooter}>
                    <Text style={[styles.plantMoreText, { color: colors.primary }]}>{t('catalog_more_details')}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
            </View>
        </Pressable>
    );
    };

    if (isPageLoading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.pageLoadingOverlay}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.pageLoadingText, { color: colors.textSecondary }]}>{t('catalog_loading')}</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.borderLight }]}>
                <Pressable onPress={handleBack} style={[styles.backButton, { backgroundColor: colors.surface }]}>
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>{DISCOVER_CATEGORY_KEYS[category] ? t(DISCOVER_CATEGORY_KEYS[category]) : category}</Text>
                    <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>{plants.length} {t('catalog_species_suffix')}</Text>
                </View>
                <View style={styles.headerSpacer} />
            </View>

            <FlatList
                data={plants}
                extraData={{ aiDataUrls, resolvedUrls, retryUrls, cachedPlants }}
                renderItem={renderPlant}
                keyExtractor={(item) => getPlantKey(item)}
                numColumns={1}
                contentContainerStyle={styles.listContent}
                ListFooterComponent={
                    <Pressable 
                        onPress={handleLoadMore} 
                        disabled={isLoadingMore || hasReachedEnd}
                        style={[
                            styles.loadMoreButton,
                            (isLoadingMore || hasReachedEnd) && styles.loadMoreButtonDisabled,
                        ]}
                    >
                        {isLoadingMore ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                        ) : hasReachedEnd ? (
                            <Text style={[styles.loadMoreText, { color: colors.textMuted }]}>{t('catalog_all_loaded')}</Text>
                        ) : (
                            <>
                                <Text style={[styles.loadMoreText, { color: colors.textMuted }]}>{t('catalog_show_more')}</Text>
                                <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                            </>
                        )}
                    </Pressable>
                }
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor применяется через inline стили
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 24,
        paddingTop: 60,
        paddingBottom: 16,
        borderBottomWidth: 1,
        // backgroundColor и borderBottomColor применяются через inline стили
    },
    backButton: {
        padding: 8,
        borderRadius: 9999,
        // backgroundColor применяется через inline стили
    },
    headerCenter: {
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: -0.5,
        // color применяется через inline стили
    },
    headerSubtitle: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    headerSpacer: {
        width: 40,
    },
    listContent: {
        padding: 16,
        paddingBottom: 40,
    },
    plantCard: {
        borderRadius: 32,
        marginBottom: 24,
        overflow: 'hidden',
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        // backgroundColor и borderColor применяются через inline стили
    },
    plantCardPressed: {
        transform: [{ scale: 0.95 }],
    },
    plantImageContainer: {
        width: '100%',
        aspectRatio: 1,
        position: 'relative',
    },
    plantImageLoadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 10,
        backgroundColor: '#f9fafb',
        alignItems: 'center',
        justifyContent: 'center',
    },
    plantImage: {
        width: '100%',
        height: '100%',
    },
    plantImageOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 56,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    plantImageInfo: {
        position: 'absolute',
        bottom: 8,
        left: 16,
        right: 16,
    },
    plantName: {
        fontSize: 20,
        fontWeight: '900',
        color: '#ffffff',
        marginBottom: 4,
    },
    plantScientificName: {
        fontSize: 12,
        color: '#d1d5db',
        fontStyle: 'italic',
        fontWeight: '500',
    },
    plantContent: {
        padding: 20,
        gap: 16,
    },
    plantDescription: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        flexShrink: 0,
    },
    infoIcon: {
        marginTop: 2,
    },
    plantDescriptionText: {
        flex: 1,
        fontSize: 12,
        lineHeight: 18,
        fontStyle: 'italic',
        minHeight: 0,
        // color применяется через inline стили
    },
    plantInfoGrid: {
        flexDirection: 'row',
        gap: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        // borderTopColor применяется через inline стили
    },
    plantInfoCard: {
        flex: 1,
        padding: 12,
        borderRadius: 16,
        gap: 4,
        // backgroundColor применяется через inline стили
    },
    plantInfoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    plantInfoLabel: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    plantInfoValue: {
        fontSize: 11,
        fontWeight: '700',
        // color применяется через inline стили
    },
    plantInfoColorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    colorDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 1,
        // borderColor применяется через inline стили
    },
    plantFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    plantMoreText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 3.2,
        // color применяется через inline стили
    },
    loadMoreButton: {
        paddingVertical: 40,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    loadMoreButtonDisabled: {
        opacity: 0.5,
    },
    loadMoreText: {
        fontSize: 14,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    pageLoadingOverlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    pageLoadingText: {
        fontSize: 14,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
});

export default CategoryCatalogScreen;
