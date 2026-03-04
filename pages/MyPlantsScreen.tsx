import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image, TextInput, Modal, FlatList, Alert, Animated, Dimensions, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { PottedPlantIcon } from '../components/CareIcons';
import { Plant, Collection, CareType } from '../types';
import PlantWelcomeScreen from './PlantWelcomeScreen';
import { getCollections, saveCollection, getPlants } from '../services/storageService';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';
import type { TranslationKey } from '../services/translations';
import { scheduleCareNotification, cancelAllNotificationsForPlant, scheduleAllCareNotificationsForPlant } from '../services/notificationService';
import { getSafetyStatus, calculateCareDifficulty, getStandardPlantTags, calculateOverallHealth } from '../services/careCalculator';
import { getReliableImage, GENERIC_FALLBACK_IMAGE } from '../services/geminiService';
import { isPollinationsUrl, getBackupPlantImage } from '../services/plantImageService';
import { generateUUID } from '../utils/uuid';
import { Image as ExpoImage } from 'expo-image';

interface MyPlantsScreenProps {
    plants: Plant[];
    updatePlant: (plant: Plant) => void;
    deletePlant?: (id: string) => void;
}

type SortOrder = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'sci-name-asc' | 'sci-name-desc';

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
    { name: 'Droplets', icon: 'water' },
    { name: 'Bug', icon: 'bug' },
    { name: 'Wind', icon: 'swap-horizontal' }
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
    if (colorClass.includes('red') || colorClass.includes('rose')) return '#ef4444';
    return '#6b7280';
};

const getTagColors = (style: string) => {
    let backgroundColor = 'rgba(107, 114, 128, 0.1)';
    let textColor = '#6b7280';
    let borderColor = 'rgba(107, 114, 128, 0.3)';
    
    if (style.includes('emerald')) {
        backgroundColor = 'rgba(16, 185, 129, 0.15)';
        textColor = '#10b981';
        borderColor = 'rgba(16, 185, 129, 0.3)';
    } else if (style.includes('red')) {
        backgroundColor = 'rgba(239, 68, 68, 0.15)';
        textColor = '#ef4444';
        borderColor = 'rgba(239, 68, 68, 0.3)';
    } else if (style.includes('yellow')) {
        backgroundColor = 'rgba(234, 179, 8, 0.15)';
        textColor = '#eab308';
        borderColor = 'rgba(234, 179, 8, 0.3)';
    } else if (style.includes('blue')) {
        backgroundColor = 'rgba(59, 130, 246, 0.15)';
        textColor = '#3b82f6';
        borderColor = 'rgba(59, 130, 246, 0.3)';
    } else if (style.includes('purple')) {
        backgroundColor = 'rgba(139, 92, 246, 0.15)';
        textColor = '#8b5cf6';
        borderColor = 'rgba(139, 92, 246, 0.3)';
    }
    
    return { backgroundColor, textColor, borderColor };
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

const MyPlantsScreen: React.FC<MyPlantsScreenProps> = ({ plants: plantsProp, updatePlant: updatePlantProp, deletePlant: deletePlantProp }) => {
    const navigation = useNavigation();
    const route = useRoute();
    const { t } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const insets = useSafeAreaInsets();
    
    const plantsFromProps = plantsProp || [];
    const updatePlantPropSafe = updatePlantProp || (() => {});
    const [syncedPlants, setSyncedPlants] = useState<Plant[] | null>(null);
    const plants = plantsFromProps.length > 0 ? plantsFromProps : (syncedPlants ?? []);
    const updatePlant = (updated: Plant) => {
        updatePlantPropSafe(updated);
        setSyncedPlants(prev => prev ? prev.map(p => p.id === updated.id ? updated : p) : null);
    };

    const [sortOrder, setSortOrder] = useState<SortOrder>('date-desc');
    const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'garden' | 'history'>('garden');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    
    const [collections, setCollections] = useState<Collection[]>([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isAddToColModalOpen, setIsAddToColModalOpen] = useState(false);
    const [activeCollection, setActiveCollection] = useState<Collection | null>(null);
    const [plantToCollect, setPlantToCollect] = useState<string | null>(null);
    const [plantToConfirmDelete, setPlantToConfirmDelete] = useState<Plant | null>(null);
    const [plantToDeleteFromHistory, setPlantToDeleteFromHistory] = useState<Plant | null>(null);
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [activeFilterTags, setActiveFilterTags] = useState<string[]>([]);
    const [plantToEditName, setPlantToEditName] = useState<Plant | null>(null);
    const [editedPlantName, setEditedPlantName] = useState('');
    
    const [newColName, setNewColName] = useState('');
    const [newColIcon, setNewColIcon] = useState('Folder');
    
    const [completedTasks, setCompletedTasks] = useState<string[]>([]);
    const [taskToConfirm, setTaskToConfirm] = useState<{plantId: string, taskKey: string} | null>(null);
    const tabAnim = useRef(new Animated.Value(activeTab === 'garden' ? 0 : 1)).current;

    const NOTIF_BODY_KEYS: Record<string, 'notif_water_reminder' | 'notif_fertilize_reminder' | 'notif_misting_reminder' | 'notif_repot_reminder'> = { watering: 'notif_water_reminder', fertilizing: 'notif_fertilize_reminder', misting: 'notif_misting_reminder', repotting: 'notif_repot_reminder' };
    const reminderConfigs = useMemo(() => [
        { key: 'watering', label: t('care_water'), actionType: 'watered' as CareType, icon: 'water-outline', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', accent: 'text-blue-500', defaultFreq: 7 },
        { key: 'fertilizing', label: t('care_fertilize'), actionType: 'fertilized' as CareType, icon: 'leaf-outline', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', accent: 'text-emerald-500', defaultFreq: 30 },
        { key: 'misting', label: t('care_misting'), actionType: 'misting' as CareType, icon: 'spray-bottle', iconLibrary: 'MaterialCommunityIcons' as const, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)', accent: 'text-cyan-500', defaultFreq: 2 },
        { key: 'repotting', label: t('care_repot'), actionType: 'repotted' as CareType, icon: 'potted-plant', iconLibrary: 'PottedPlant' as const, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)', accent: 'text-violet-500', defaultFreq: 365 },
    ], [t]);

    useEffect(() => {
        const loadCollections = async () => {
            const cols = await getCollections();
            setCollections(cols ?? []);
        };
        loadCollections();
        
        const params = (route.params as any) || {};
        if (params.openCreateModal) {
            setIsCreateModalOpen(true);
        }
    }, [route.params]);

    // Перезагружаем коллекции при фокусе экрана, чтобы видеть новые коллекции
    useFocusEffect(
        React.useCallback(() => {
            const loadCollections = async () => {
                const cols = await getCollections();
                setCollections(cols ?? []);
            };
            loadCollections();
        }, [])
    );

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        // Animate tab switch
        const targetValue = activeTab === 'garden' ? 0 : 1;
        Animated.timing(tabAnim, {
            toValue: targetValue,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [activeTab]);

    // Force recalculation when plants change
    useEffect(() => {}, [plants, plantsKey]);

    useEffect(() => {
        if (plantsFromProps.length > 0) return;
        let cancelled = false;
        getPlants().then(data => { if (!cancelled) setSyncedPlants(data); });
        return () => { cancelled = true; };
    }, [plantsFromProps.length]);

    useFocusEffect(
        React.useCallback(() => {
            if (plantsFromProps.length > 0) return;
            let cancelled = false;
            getPlants().then(data => { if (!cancelled) setSyncedPlants(data); });
            return () => { cancelled = true; };
        }, [plantsFromProps.length])
    );

    const allUniqueTags = useMemo(() => {
        const tagSet = new Set<string>();
        plants.forEach(plant => {
            getStandardPlantTags(plant, t).forEach(tag => tagSet.add(tag.label));
        });
        return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
    }, [plants, t]);

    const getNearestTask = (plant: Plant) => {
        let minDays = Infinity;
        let nearest = null;

        reminderConfigs.forEach(config => {
            const userRem = plant.reminders?.[config.key as keyof typeof plant.reminders];
            const freq = userRem?.frequency || config.defaultFreq;
            const lastAction = plant.careHistory?.find(h => h.type === config.actionType);
            const lastDate = lastAction ? new Date(lastAction.date) : new Date(plant.identificationDate);
            const daysPassed = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
            
            const daysLeft = Math.ceil(Math.max(0, freq - daysPassed));
            const isDue = daysPassed >= freq;
            
            if (isDue) {
                if (nearest === null || !nearest.isDue) {
                    nearest = { ...config, daysLeft, isDue: true };
                }
            } else if (daysLeft < minDays && (nearest === null || !nearest.isDue)) {
                minDays = daysLeft;
                nearest = { ...config, daysLeft, isDue: false };
            }
        });
        return nearest;
    };

    // Force recalculation when plants change by using a key based on plants length and IDs
    const plantsKey = useMemo(() => {
        const key = plants.map(p => `${p.id}:${p.isInGarden}`).join(',') + `:${plants.length}`;
        console.log('[MyPlantsScreen] plantsKey calculated:', key);
        return key;
    }, [plants]);

    const filteredAndSortedPlants = useMemo(() => {
        const q = debouncedSearchQuery.toLowerCase().trim();
        // Show all plants regardless of isInGarden status
        const basePlants = plants;
        
        console.log('[MyPlantsScreen] filteredAndSortedPlants - input:', {
            totalPlants: plants.length,
            searchQuery: q,
            filterTags: activeFilterTags.length,
            sortOrder,
            plantsKey
        });
        
        let filtered = basePlants.filter(plant => {
            const matchesSearch = q === '' || plant.commonName.toLowerCase().includes(q) || plant.scientificName?.toLowerCase().includes(q);
            if (!matchesSearch) return false;

            if (activeFilterTags.length > 0) {
                const plantTags = getStandardPlantTags(plant, t).map(tag => tag.label);
                const matchesTags = activeFilterTags.every(filterTag => plantTags.includes(filterTag));
                if (!matchesTags) return false;
            }
            return true;
        });
        
        console.log('[MyPlantsScreen] filteredAndSortedPlants - after filter:', filtered.length);
        
        const plantsToSort = [...filtered];
        switch (sortOrder) {
            case 'name-asc': return plantsToSort.sort((a, b) => a.commonName.localeCompare(b.commonName));
            case 'name-desc': return plantsToSort.sort((a, b) => b.commonName.localeCompare(a.commonName));
            case 'sci-name-asc': return plantsToSort.sort((a, b) => (a.scientificName || '').localeCompare(b.scientificName || ''));
            case 'sci-name-desc': return plantsToSort.sort((a, b) => (b.scientificName || '').localeCompare(a.scientificName || ''));
            case 'date-asc': return plantsToSort.sort((a, b) => new Date(a.identificationDate).getTime() - new Date(b.identificationDate).getTime());
            default: return plantsToSort.sort((a, b) => new Date(b.identificationDate).getTime() - new Date(a.identificationDate).getTime());
        }
    }, [plants, plantsKey, sortOrder, debouncedSearchQuery, activeFilterTags, t]);

    // Removed totalPlantsInGarden - using plants directly now

    const historyPlants = useMemo(() => {
        return filteredAndSortedPlants.filter(p => p.showInHistory !== false);
    }, [filteredAndSortedPlants]);

    const gardenPlants = useMemo(() => {
        if (activeTab !== 'garden') return [];
        const inGardenOnly = filteredAndSortedPlants.filter(p => p.isInGarden !== false);
        const result = activeCollection 
            ? inGardenOnly.filter(p => activeCollection.plantIds.includes(p.id))
            : inGardenOnly;
        console.log('[MyPlantsScreen] gardenPlants calculated:', {
            activeTab,
            filteredCount: filteredAndSortedPlants.length,
            resultCount: result.length,
            hasCollection: !!activeCollection,
            plants: result.map(p => ({ id: p.id, name: p.commonName })),
            plantsKey
        });
        return result;
    }, [filteredAndSortedPlants, activeCollection, activeTab, plantsKey]);

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

    const toggleCollectionPlant = async (collection: Collection) => {
        if (!plantToCollect) return;
        const alreadyIn = collection.plantIds.includes(plantToCollect);

        if (!alreadyIn) {
            const plantToAdd = plants.find(p => p.id === plantToCollect);
            if (plantToAdd && plantToAdd.isInGarden === false) {
                updatePlant({ ...plantToAdd, isInGarden: true });
            }
        }

        const updatedPlantIds = alreadyIn ? collection.plantIds.filter(id => id !== plantToCollect) : [...collection.plantIds, plantToCollect];
        const updatedCollection = { ...collection, plantIds: updatedPlantIds };
        await saveCollection(updatedCollection);
        const cols = await getCollections();
        setCollections(cols);
    };

    const handleCreateCollection = async () => {
        if (!newColName.trim()) return;
        const newCol: Collection = { id: generateUUID(), name: newColName, iconName: newColIcon, plantIds: [] };
        await saveCollection(newCol);
        const cols = await getCollections();
        setCollections(cols);
        setIsCreateModalOpen(false);
        setNewColName('');
    };


    const handleResetFilters = () => {
        setSearchQuery('');
        setActiveFilterTags([]);
        setActiveCollection(null);
    };

    const tabTranslateX = tabAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '-100%'],
    });
    
    const historyTranslateX = tabAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['100%', '0%'],
    });
    
    const sortOptions: { key: SortOrder, labelKey: TranslationKey }[] = [
        { key: 'date-desc', labelKey: 'sort_newest' },
        { key: 'date-asc', labelKey: 'sort_oldest' },
        { key: 'name-asc', labelKey: 'sort_az' },
        { key: 'name-desc', labelKey: 'sort_za' },
        { key: 'sci-name-asc', labelKey: 'sort_sci_az' },
        { key: 'sci-name-desc', labelKey: 'sort_sci_za' },
    ];

    const PlantCard: React.FC<{ plant: Plant; onTaskPress: (plantId: string, taskKey: string) => void; completedTasks: string[] }> = ({ plant, onTaskPress, completedTasks }) => {
        const fallbackForPlant = getReliableImage(plant.scientificName || plant.commonName) || GENERIC_FALLBACK_IMAGE;
        const safePlantUrl = (plant.imageUrl && isPollinationsUrl(plant.imageUrl)) ? getBackupPlantImage(plant.scientificName || plant.commonName) : (plant.imageUrl || fallbackForPlant);
        const [imageUri, setImageUri] = useState(safePlantUrl);
        useEffect(() => {
            const raw = (plant.imageUrl && isPollinationsUrl(plant.imageUrl)) ? getBackupPlantImage(plant.scientificName || plant.commonName) : (plant.imageUrl || fallbackForPlant);
            setImageUri(raw);
            if (plant.imageUrl && !isPollinationsUrl(plant.imageUrl) && (plant.imageUrl.startsWith('http://') || plant.imageUrl.startsWith('https://'))) {
                let cancelled = false;
                (ExpoImage.getCachePathAsync?.(plant.imageUrl) ?? Promise.resolve(null)).then((cachePath) => {
                    if (cancelled || !cachePath?.length) return;
                    setImageUri(cachePath.startsWith('file://') ? cachePath : `file://${cachePath}`);
                }).catch(() => {});
                return () => { cancelled = true; };
            }
        }, [plant.imageUrl, plant.id, fallbackForPlant]);
        const health = calculateOverallHealth(plant, reminderConfigs);
        const nearestTask = getNearestTask(plant);
        const plantTasks = reminderConfigs.map(config => {
            const userRem = plant.reminders?.[config.key as keyof typeof plant.reminders];
            const freq = userRem?.frequency || config.defaultFreq;
            const lastAction = plant.careHistory?.find(h => h.type === config.actionType);
            const lastDate = lastAction ? new Date(lastAction.date) : new Date(plant.identificationDate);
            const daysPassed = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
            const isDue = daysPassed >= freq;
            const daysLeft = Math.ceil(Math.max(0, freq - daysPassed));
            const percentage = Math.max(0, Math.min(100, ((freq - daysPassed) / freq) * 100));
            return { ...config, isDue, daysLeft, percentage };
        });
        const plantTags = getStandardPlantTags(plant, t);

        return (
            <View style={[styles.plantCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                <View style={styles.plantImageContainer}>
                    <Pressable 
                        style={StyleSheet.absoluteFill}
                        onPress={() => navigation.navigate('PlantDetail' as never, { plantId: plant.id } as never)}
                    >
                        <ExpoImage
                            source={{ uri: imageUri }}
                            style={styles.plantImage}
                            contentFit="cover"
                            cachePolicy="disk"
                            onError={() => setImageUri(getReliableImage(plant.scientificName || plant.commonName) || GENERIC_FALLBACK_IMAGE)}
                        />
                        <View style={styles.plantImageHeader}>
                            <View style={[
                                styles.healthBadge,
                                health > 70 ? styles.healthBadgeGood : health > 40 ? styles.healthBadgeMedium : styles.healthBadgeBad
                            ]}>
                                <Ionicons 
                                    name="pulse" 
                                    size={16} 
                                    color="#ffffff" 
                                />
                                <View style={styles.healthBadgeTextWrap}>
                                    <Text style={[styles.healthLabel, { color: '#ffffff' }]}>{t('health_label')}</Text>
                                    <Text style={[styles.healthValue, { color: '#ffffff' }]}>{health}%</Text>
                                </View>
                            </View>
                        </View>
                        
                        {nearestTask && (
                            <View style={[styles.taskBadge, { backgroundColor: theme === 'dark' ? colors.surface : 'rgba(255, 255, 255, 0.9)', borderColor: colors.borderLight }]}>
                                {(nearestTask as any).iconLibrary === 'PottedPlant' ? (
                                    <PottedPlantIcon size={12} color={nearestTask.color} />
                                ) : (nearestTask as any).iconLibrary === 'MaterialCommunityIcons' ? (
                                    <MaterialCommunityIcons name={(nearestTask.icon as any) || 'spray-bottle'} size={12} color={nearestTask.color} />
                                ) : (
                                    <Ionicons name={nearestTask.icon as any} size={12} color={nearestTask.color} />
                                )}
                                <Text style={[
                                    styles.taskBadgeText,
                                    { color: colors.textSecondary },
                                    nearestTask.isDue && [styles.taskBadgeTextDue, { color: colors.warning }]
                                ]}>
                                    {nearestTask.isDue ? `${t('agenda_today').toUpperCase()}!` : `${nearestTask.daysLeft} ${t('agenda_days_short')}`}
                                </Text>
                            </View>
                        )}

                        <View style={[styles.plantImageFooter, { backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.6)' }]}>
                            <View style={styles.plantNameContainer}>
                                <Text style={[styles.plantName, { color: '#ffffff' }]} numberOfLines={2}>{plant.commonName}</Text>
                            </View>
                            <Text style={[styles.plantScientificName, { color: 'rgba(255, 255, 255, 0.8)' }]} numberOfLines={2}>{plant.scientificName}</Text>
                        </View>
                    </Pressable>
                    {plant.isInGarden !== false && (
                        <Pressable
                            style={styles.removeFromGardenButton}
                            onPress={() => setPlantToConfirmDelete(plant)}
                        >
                            <Ionicons name="trash-outline" size={18} color="#ffffff" />
                        </Pressable>
                    )}
                </View>

                <View style={[styles.plantTasks, { backgroundColor: colors.surface }]}>
                    {plantTasks.map(task => {
                        const taskId = `${plant.id}-${task.key}`;
                        const isCompleted = completedTasks.includes(taskId);
                        const isDue = task.isDue && !isCompleted;
                        
                        return (
                            <View key={task.key} style={styles.taskItem}>
                                <View style={styles.taskProgressContainer}>
                                    <ProgressRingMini 
                                        percentage={isCompleted ? 100 : task.percentage} 
                                        colorClass={isCompleted ? 'text-emerald-500' : isDue ? 'text-amber-500' : (task.accent ?? 'text-blue-500')}
                                        size={40}
                                    />
                                    <Pressable 
                                        onPress={() => onTaskPress(plant.id, task.key)}
                                        disabled={isCompleted}
                                        style={[
                                            styles.taskButton,
                                            { backgroundColor: colors.card },
                                            isCompleted && [styles.taskButtonCompleted, { backgroundColor: colors.primary }],
                                            isDue && [styles.taskButtonDue, { backgroundColor: colors.card, borderColor: colors.warning }]
                                        ]}
                                    >
                                        {isCompleted ? (
                                            <Ionicons name="checkmark" size={16} color="#ffffff" />
                                        ) : (task as any).iconLibrary === 'PottedPlant' ? (
                                            <PottedPlantIcon size={16} color={isDue ? colors.warning : task.color} />
                                        ) : (task as any).iconLibrary === 'MaterialCommunityIcons' ? (
                                            <MaterialCommunityIcons name={task.icon as any} size={16} color={isDue ? colors.warning : task.color} />
                                        ) : (
                                            <Ionicons name={task.icon as any} size={16} color={isDue ? colors.warning : task.color} />
                                        )}
                                    </Pressable>
                                    {isDue && (
                                        <View style={[styles.taskAlert, { borderColor: theme === 'dark' ? colors.card : '#ffffff' }]}>
                                            <Text style={styles.taskAlertText}>!</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={[
                                    styles.taskLabel,
                                    { color: colors.textSecondary },
                                    isCompleted && [styles.taskLabelCompleted, { color: colors.primary }],
                                    isDue && [styles.taskLabelDue, { color: colors.warning }]
                                ]}>
                                    {isCompleted ? 'ОК' : task.label}
                                </Text>
                            </View>
                        );
                    })}
                </View>

                <View style={[styles.plantTags, { backgroundColor: colors.card }]}>
                    {plantTags.map(tag => {
                        const tagColors = getTagColors(tag.style);
                        return (
                            <View key={tag.label} style={[styles.tag, { borderColor: tagColors.borderColor, backgroundColor: tagColors.backgroundColor }]}>
                                <Ionicons name={((tag.icon === 'wind' || tag.icon === 'Wind') ? 'cloudy-outline' : tag.icon) as any} size={10} color={tagColors.textColor} />
                                <Text style={[styles.tagText, { color: tagColors.textColor }]}>{tag.label}</Text>
                            </View>
                        );
                    })}
                </View>
            </View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>{t('nav_my_plants')}</Text>
                <View style={[styles.tabsContainer, { backgroundColor: colors.surface, borderColor: colors.borderLight, shadowColor: colors.primary }]}>
                    <Pressable 
                        onPress={() => setActiveTab('garden')}
                        style={[styles.tab, activeTab === 'garden' && { backgroundColor: colors.primary }]}
                    >
                        <Ionicons name="leaf" size={16} color={activeTab === 'garden' ? '#ffffff' : colors.textMuted} style={styles.tabIcon} />
                        <Text style={[styles.tabText, { color: activeTab === 'garden' ? '#ffffff' : colors.textSecondary }]}>
                            {t('plant_tab_garden')}
                        </Text>
                    </Pressable>
                    <Pressable 
                        onPress={() => setActiveTab('history')}
                        style={[styles.tab, activeTab === 'history' && { backgroundColor: colors.primary }]}
                    >
                        <Ionicons name="time-outline" size={16} color={activeTab === 'history' ? '#ffffff' : colors.textMuted} style={styles.tabIcon} />
                        <Text style={[styles.tabText, { color: activeTab === 'history' ? '#ffffff' : colors.textSecondary }]}>
                            {t('plant_tab_history')}
                        </Text>
                    </Pressable>
                </View>
            </View>

            <View style={styles.searchContainer}>
                <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                    <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
                    <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder={t('search_placeholder')}
                        style={[styles.searchInput, { color: colors.text }]}
                        placeholderTextColor={colors.textMuted}
                    />
                </View>
                <Pressable 
                    onPress={() => setIsFilterModalOpen(true)}
                    style={[styles.filterButton, { backgroundColor: colors.card, borderColor: colors.borderLight }, activeFilterTags.length > 0 && styles.filterButtonActive]}
                >
                    <Ionicons name="filter" size={18} color={activeFilterTags.length > 0 ? colors.primary : colors.textMuted} />
                </Pressable>
                <View style={styles.sortButtonContainer}>
                    <Pressable 
                        onPress={() => setIsSortMenuOpen(!isSortMenuOpen)}
                        style={[styles.sortButton, { backgroundColor: colors.card, borderColor: colors.borderLight }, isSortMenuOpen && styles.sortButtonActive]}
                    >
                        <Ionicons name="swap-vertical" size={18} color={isSortMenuOpen ? colors.primary : colors.textMuted} />
                    </Pressable>
                    {isSortMenuOpen && (
                        <View style={[styles.sortMenu, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                            {sortOptions.map(option => (
                                <Pressable
                                    key={option.key}
                                    onPress={() => { setSortOrder(option.key); setIsSortMenuOpen(false); }}
                                    style={[styles.sortMenuItem, { borderBottomColor: colors.borderLight }]}
                                >
                                    <Text style={[
                                        styles.sortMenuText,
                                        { color: colors.text },
                                        sortOrder === option.key && [styles.sortMenuTextActive, { color: colors.primary }]
                                    ]}>
                                        {t(option.labelKey)}
                                    </Text>
                                    {sortOrder === option.key && (
                                        <Ionicons name="checkmark" size={14} color={colors.primary} />
                                    )}
                                </Pressable>
                            ))}
                        </View>
                    )}
                </View>
            </View>

            {activeTab === 'garden' && (
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    style={styles.collectionsScroll}
                    contentContainerStyle={styles.collectionsContainer}
                >
                    <Pressable 
                        onPress={() => setActiveCollection(null)}
                        style={[styles.collectionChip, { backgroundColor: colors.surface, borderColor: colors.borderLight }, !activeCollection && { backgroundColor: colors.primary }]}
                    >
                        <Text style={[styles.collectionChipText, { color: colors.textMuted }, !activeCollection && { color: '#ffffff' }]}>
                            {t('common_all')}
                        </Text>
                    </Pressable>
                    {(collections ?? []).map(col => {
                        const iconInfo = availableIcons.find(i => i.name === col.iconName) || availableIcons[0];
                        const isActive = activeCollection?.id === col.id;
                        return (
                            <Pressable
                                key={col.id}
                                onPress={() => setActiveCollection(col.id === activeCollection?.id ? null : col)}
                                style={[styles.collectionChip, { backgroundColor: colors.surface, borderColor: colors.borderLight }, isActive && { backgroundColor: colors.primary }]}
                            >
                                <Ionicons name={iconInfo.icon as any} size={8} color={isActive ? '#ffffff' : colors.textMuted} />
                                <Text style={[styles.collectionChipText, { color: colors.textMuted }, isActive && { color: '#ffffff' }]}>
                                    {col.name}
                                </Text>
                            </Pressable>
                        );
                    })}
                    <Pressable 
                        onPress={() => setIsCreateModalOpen(true)}
                        style={[styles.collectionChipNew, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                    >
                        <Ionicons name="add" size={10} color={colors.textMuted} />
                        <Text style={[styles.collectionChipText, { color: colors.textMuted }]}>{t('col_create_new')}</Text>
                    </Pressable>
                </ScrollView>
            )}

            <View style={styles.content}>
                {activeTab === 'garden' ? (
                    <ScrollView 
                        style={styles.tabPanel} 
                        contentContainerStyle={styles.tabPanelContent}
                        showsVerticalScrollIndicator={true}
                        nestedScrollEnabled={false}
                        scrollEnabled={true}
                        bounces={false}
                    >
                        {plantsFromProps.length === 0 && syncedPlants === null ? (
                            <View style={styles.emptyState}>
                                <ActivityIndicator size="large" color={colors.primary} />
                                <Text style={[styles.emptyTitle, { marginTop: 12, color: colors.text }]}>{t('search_placeholder')}</Text>
                            </View>
                        ) : plants.length === 0 ? (
                            <PlantWelcomeScreen />
                        ) : gardenPlants.length === 0 ? (
                            <View style={styles.emptyState}>
                                <View style={styles.emptyGardenIconWrap}>
                                    <Ionicons name="scan-outline" size={48} color={colors.primary} />
                                </View>
                                <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('empty_garden_title')}</Text>
                                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('empty_garden_subtitle')}</Text>
                                <Pressable
                                    onPress={() => navigation.navigate('NewCameraScreen' as never)}
                                    style={[styles.emptyGardenScanButton, { backgroundColor: colors.primary }]}
                                >
                                    <Ionicons name="scan" size={20} color="#ffffff" />
                                    <Text style={styles.emptyGardenScanButtonText}>{t('empty_garden_scan_cta')}</Text>
                                </Pressable>
                                {(searchQuery !== '' || activeFilterTags.length > 0) && (
                                    <Pressable onPress={handleResetFilters} style={[styles.resetButton, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                                        <Text style={[styles.resetButtonText, { color: colors.textSecondary }]}>Сбросить фильтры</Text>
                                    </Pressable>
                                )}
                            </View>
                        ) : (
                            <View style={styles.plantsList}>
                                {gardenPlants.map(plant => (
                                    <PlantCard 
                                        key={plant.id}
                                        plant={plant}
                                        onTaskPress={(plantId, taskKey) => setTaskToConfirm({plantId, taskKey})}
                                        completedTasks={completedTasks}
                                    />
                                ))}
                            </View>
                        )}
                    </ScrollView>
                ) : (
                    <ScrollView 
                        style={styles.tabPanel} 
                        contentContainerStyle={styles.tabPanelContent}
                        showsVerticalScrollIndicator={true}
                        nestedScrollEnabled={false}
                        scrollEnabled={true}
                        bounces={false}
                    >
                        {plants.length === 0 ? (
                            <PlantWelcomeScreen />
                        ) : historyPlants.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Ionicons name="search" size={48} color={colors.textMuted} style={{ opacity: 0.5 }} />
                                <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('search_no_results')}</Text>
                                <Pressable onPress={handleResetFilters} style={[styles.resetButton, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                                    <Text style={[styles.resetButtonText, { color: colors.textSecondary }]}>Сбросить</Text>
                                </Pressable>
                            </View>
                        ) : (
                            <View style={styles.historyGrid}>
                                {historyPlants.map(plant => {
                                    const HistoryItem: React.FC<{ plant: Plant }> = ({ plant }) => {
                                        const fallback = getReliableImage(plant.scientificName || plant.commonName) || GENERIC_FALLBACK_IMAGE;
                                        const safePlantUrl = (plant.imageUrl && isPollinationsUrl(plant.imageUrl)) ? getBackupPlantImage(plant.scientificName || plant.commonName) : (plant.imageUrl || fallback);
                                        const [imageUri, setImageUri] = useState(safePlantUrl);
                                        useEffect(() => {
                                            const raw = (plant.imageUrl && isPollinationsUrl(plant.imageUrl)) ? getBackupPlantImage(plant.scientificName || plant.commonName) : (plant.imageUrl || fallback);
                                            setImageUri(raw);
                                            if (plant.imageUrl && !isPollinationsUrl(plant.imageUrl) && (plant.imageUrl.startsWith('http://') || plant.imageUrl.startsWith('https://'))) {
                                                let cancelled = false;
                                                (ExpoImage.getCachePathAsync?.(plant.imageUrl) ?? Promise.resolve(null)).then((cachePath) => {
                                                    if (cancelled || !cachePath?.length) return;
                                                    setImageUri(cachePath.startsWith('file://') ? cachePath : `file://${cachePath}`);
                                                }).catch(() => {});
                                                return () => { cancelled = true; };
                                            }
                                        }, [plant.imageUrl, plant.id, fallback]);
                                        return (
                                            <View style={styles.historyItem}>
                                                <Pressable
                                                    onPress={() => navigation.navigate('PlantDetail' as never, { plantId: plant.id } as never)}
                                                    style={styles.historyImageContainer}
                                                >
                                                    <ExpoImage
                                                        source={{ uri: imageUri }}
                                                        style={styles.historyImage}
                                                        contentFit="cover"
                                                        cachePolicy="disk"
                                                        onError={() => setImageUri(getReliableImage(plant.scientificName || plant.commonName) || GENERIC_FALLBACK_IMAGE)}
                                                    />
                                                    <Pressable
                                                        onPress={() => setPlantToDeleteFromHistory(plant)}
                                                        style={[styles.historyDeleteButton, { backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.5)' }]}
                                                        hitSlop={8}
                                                    >
                                                        <Ionicons name="trash-outline" size={16} color="#ffffff" />
                                                    </Pressable>
                                                </Pressable>
                                                <Pressable 
                                                    onPress={() => {
                                                        if (plant.isInGarden) {
                                                            setPlantToConfirmDelete(plant);
                                                        } else {
                                                            const updated = { ...plant, isInGarden: true, showInHistory: true };
                                                            updatePlant(updated);
                                                            scheduleAllCareNotificationsForPlant(updated, reminderConfigs, (key) => t(NOTIF_BODY_KEYS[key] ?? 'notif_water_reminder').replace('{name}', updated.commonName));
                                                        }
                                                    }}
                                                    style={[styles.historyButton, { backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.4)' }, plant.isInGarden && [styles.historyButtonActive, { backgroundColor: colors.primary }]]}
                                                >
                                                    {plant.isInGarden ? (
                                                        <Ionicons name="checkmark" size={14} color="#ffffff" />
                                                    ) : (
                                                        <Ionicons name="add" size={14} color="#ffffff" />
                                                    )}
                                                </Pressable>
                                            </View>
                                        );
                                    };
                                    return <HistoryItem key={plant.id} plant={plant} />;
                                })}
                            </View>
                        )}
                    </ScrollView>
                )}
            </View>

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
                                        <PottedPlantIcon size={32} color={taskForModalInfo.task?.color ?? colors.primary} />
                                    ) : (taskForModalInfo.task as any)?.iconLibrary === 'MaterialCommunityIcons' ? (
                                        <MaterialCommunityIcons name={(taskForModalInfo.task?.icon as any) ?? 'spray-bottle'} size={32} color={taskForModalInfo.task?.color ?? colors.primary} />
                                    ) : (
                                        <Ionicons name={(taskForModalInfo.task?.icon as any) ?? 'ellipse'} size={32} color={taskForModalInfo.task?.color ?? colors.primary} />
                                    )}
                                </View>
                                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('action_confirm_question')}</Text>
                                <Text style={[styles.modalText, { color: colors.textSecondary }]}>
                                    {taskForModalInfo.task?.label ?? ''} <Text style={[styles.modalTextBold, { color: colors.text }]}>{taskForModalInfo.plant?.commonName ?? ''}</Text>?
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
                visible={!!plantToConfirmDelete}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setPlantToConfirmDelete(null)}
            >
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
                        {plantToConfirmDelete && (
                            <>
                                <View style={[styles.modalIconDelete, { backgroundColor: colors.error + '15' }]}>
                                    <Ionicons name="trash" size={32} color={colors.error} />
                                </View>
                                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('delete_plant_title')}</Text>
                                <Text style={[styles.modalPlantName, { color: colors.text }]}>{plantToConfirmDelete.commonName}</Text>
                                <Text style={[styles.modalText, { color: colors.textSecondary }]}>{t('delete_plant_desc')}</Text>
                                <View style={styles.modalButtons}>
                                    <Pressable 
                                        onPress={() => {
                                            cancelAllNotificationsForPlant(plantToConfirmDelete.id);
                                            updatePlant({ ...plantToConfirmDelete, isInGarden: false });
                                            setPlantToConfirmDelete(null);
                                        }}
                                        style={[styles.modalButtonDelete, { backgroundColor: colors.error }]}
                                    >
                                        <Text style={styles.modalButtonDeleteText}>{t('delete_confirm')}</Text>
                                    </Pressable>
                                    <Pressable 
                                        onPress={() => setPlantToConfirmDelete(null)}
                                        style={[styles.modalButtonSecondary, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                                    >
                                        <Text style={[styles.modalButtonSecondaryText, { color: colors.text }]}>{t('delete_cancel')}</Text>
                                    </Pressable>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            <Modal
                visible={!!plantToDeleteFromHistory}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setPlantToDeleteFromHistory(null)}
            >
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
                        {plantToDeleteFromHistory && (
                            <>
                                <View style={[styles.modalIconDelete, { backgroundColor: colors.error + '15' }]}>
                                    <Ionicons name="trash" size={32} color={colors.error} />
                                </View>
                                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('delete_plant_title')}</Text>
                                <Text style={[styles.modalPlantName, { color: colors.text }]}>{plantToDeleteFromHistory.commonName}</Text>
                                <Text style={[styles.modalText, { color: colors.textSecondary }]}>Растение исчезнет из вкладки «История». В саду останется.</Text>
                                <View style={styles.modalButtons}>
                                    <Pressable 
                                        onPress={() => {
                                            updatePlant({ ...plantToDeleteFromHistory, showInHistory: false });
                                            setPlantToDeleteFromHistory(null);
                                        }}
                                        style={[styles.modalButtonDelete, { backgroundColor: colors.error }]}
                                    >
                                        <Text style={styles.modalButtonDeleteText}>Удалить из истории</Text>
                                    </Pressable>
                                    <Pressable 
                                        onPress={() => setPlantToDeleteFromHistory(null)}
                                        style={[styles.modalButtonSecondary, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                                    >
                                        <Text style={[styles.modalButtonSecondaryText, { color: colors.text }]}>{t('delete_cancel')}</Text>
                                    </Pressable>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            <Modal
                visible={isAddToColModalOpen}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setIsAddToColModalOpen(false)}
            >
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <View style={[styles.collectionModal, { paddingBottom: 32 + insets.bottom, backgroundColor: colors.card }]}>
                        <View style={styles.collectionModalHeader}>
                            <Text style={[styles.collectionModalTitle, { color: colors.text }]}>{t('col_select_title')}</Text>
                            <Pressable onPress={() => setIsAddToColModalOpen(false)}>
                                <Ionicons name="close" size={24} color={colors.textMuted} />
                            </Pressable>
                        </View>
                        {(collections ?? []).length === 0 ? (
                            <View style={styles.collectionModalEmpty}>
                                <View style={[styles.collectionModalEmptyIcon, { backgroundColor: colors.primaryLight }]}>
                                    <Ionicons name="folder-add" size={40} color={colors.primary} />
                                </View>
                                <Text style={[styles.collectionModalEmptyTitle, { color: colors.text }]}>Групп пока нет</Text>
                                <Text style={[styles.collectionModalEmptyText, { color: colors.textSecondary }]}>Организуйте свои растения по комнатам или видам.</Text>
                                <Pressable 
                                    onPress={() => { setIsAddToColModalOpen(false); setIsCreateModalOpen(true); }}
                                    style={[styles.collectionModalEmptyButton, { backgroundColor: colors.primary }]}
                                >
                                    <Ionicons name="add" size={20} color="#ffffff" />
                                    <Text style={styles.collectionModalEmptyButtonText}>Создать первую группу</Text>
                                </Pressable>
                            </View>
                        ) : (
                            <ScrollView style={styles.collectionModalList}>
                                <Pressable 
                                    onPress={() => { setIsAddToColModalOpen(false); setIsCreateModalOpen(true); }}
                                    style={[styles.collectionModalNewButton, { backgroundColor: colors.primary }]}
                                >
                                    <View style={[styles.collectionModalNewIcon, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
                                        <Ionicons name="add" size={20} color="#ffffff" />
                                    </View>
                                    <Text style={styles.collectionModalNewText}>{t('col_create_new')}</Text>
                                </Pressable>
                                {(collections ?? []).map(col => {
                                    const iconInfo = availableIcons.find(i => i.name === col.iconName) || availableIcons[0];
                                    const alreadyIn = col.plantIds.includes(plantToCollect || '');
                                    return (
                                        <Pressable
                                            key={col.id}
                                            onPress={() => toggleCollectionPlant(col)}
                                            style={[styles.collectionModalItem, { backgroundColor: colors.surface }, alreadyIn && { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
                                        >
                                            <View style={[styles.collectionModalItemIcon, { backgroundColor: colors.card }, alreadyIn && { backgroundColor: colors.primary }]}>
                                                <Ionicons name={iconInfo.icon as any} size={20} color={alreadyIn ? '#ffffff' : colors.textMuted} />
                                            </View>
                                            <View style={styles.collectionModalItemContent}>
                                                <Text style={[styles.collectionModalItemName, { color: colors.text }]}>{col.name}</Text>
                                                <Text style={[styles.collectionModalItemCount, { color: colors.textSecondary }]}>{col.plantIds.length} растений</Text>
                                            </View>
                                            <View style={[styles.collectionModalItemCheck, { borderColor: colors.border }, alreadyIn && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                                                {alreadyIn && <Ionicons name="checkmark" size={16} color="#ffffff" />}
                                            </View>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            <Modal
                visible={isCreateModalOpen}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsCreateModalOpen(false)}
            >
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <View style={[styles.createModal, { backgroundColor: colors.card }]}>
                        <Text style={[styles.createModalTitle, { color: colors.text }]}>{t('col_new_group')}</Text>
                        <TextInput
                            value={newColName}
                            onChangeText={setNewColName}
                            placeholder={t('col_name_placeholder')}
                            style={[styles.createModalInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                            placeholderTextColor={colors.textMuted}
                            autoFocus
                        />
                        <View style={styles.createModalIcons}>
                            {availableIcons.map(icon => (
                                <Pressable
                                    key={icon.name}
                                    onPress={() => setNewColIcon(icon.name)}
                                    style={[
                                        styles.createModalIcon,
                                        { backgroundColor: colors.surface, borderColor: colors.borderLight },
                                        newColIcon === icon.name && [styles.createModalIconActive, { backgroundColor: colors.primary }]
                                    ]}
                                >
                                    <Ionicons 
                                        name={icon.icon as any} 
                                        size={22} 
                                        color={newColIcon === icon.name ? '#ffffff' : colors.textMuted} 
                                    />
                                </Pressable>
                            ))}
                        </View>
                        <View style={styles.createModalButtons}>
                            <Pressable 
                                onPress={handleCreateCollection}
                                disabled={!newColName.trim()}
                                style={[styles.createModalButton, { backgroundColor: colors.primary }, !newColName.trim() && { backgroundColor: colors.disabled }]}
                            >
                                <Text style={styles.createModalButtonText}>{t('col_create_btn')}</Text>
                            </Pressable>
                            <Pressable 
                                onPress={() => setIsCreateModalOpen(false)}
                                style={[styles.createModalCancel, { backgroundColor: colors.surface }]}
                            >
                                <Text style={[styles.createModalCancelText, { color: colors.text }]}>{t('delete_cancel')}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            <FilterModal 
                isOpen={isFilterModalOpen}
                onClose={() => setIsFilterModalOpen(false)}
                allTags={allUniqueTags}
                activeTags={activeFilterTags}
                setActiveTags={setActiveFilterTags}
            />

            {/* Modal для редактирования имени растения */}
            <Modal
                visible={plantToEditName !== null}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    setPlantToEditName(null);
                    setEditedPlantName('');
                }}
            >
                <Pressable 
                    style={[styles.editNameModalOverlay, { backgroundColor: colors.overlay }]}
                    onPress={() => {
                        setPlantToEditName(null);
                        setEditedPlantName('');
                    }}
                >
                    <Pressable 
                        style={[styles.editNameModalContent, { backgroundColor: colors.card }]}
                        onPress={(e) => e.stopPropagation()}
                    >
                        <Text style={[styles.editNameModalTitle, { color: colors.text }]}>Изменить название растения</Text>
                        <TextInput
                            style={[styles.editNameModalInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                            value={editedPlantName}
                            onChangeText={setEditedPlantName}
                            placeholder={t('placeholder_plant_name')}
                            placeholderTextColor={colors.textMuted}
                            autoFocus
                            maxLength={100}
                            onSubmitEditing={() => {
                                if (plantToEditName && editedPlantName.trim()) {
                                    const updated = { ...plantToEditName, commonName: editedPlantName.trim() };
                                    updatePlant(updated);
                                    setPlantToEditName(null);
                                    setEditedPlantName('');
                                }
                            }}
                        />
                        <View style={styles.editNameModalButtons}>
                            <Pressable
                                style={[styles.editNameModalButton, styles.editNameModalButtonSave, { backgroundColor: colors.primary }, !editedPlantName.trim() && { backgroundColor: colors.disabled }]}
                                onPress={() => {
                                    if (plantToEditName && editedPlantName.trim()) {
                                        const updated = { ...plantToEditName, commonName: editedPlantName.trim() };
                                        updatePlant(updated);
                                        setPlantToEditName(null);
                                        setEditedPlantName('');
                                    }
                                }}
                                disabled={!editedPlantName.trim()}
                            >
                                <Text style={[styles.editNameModalButtonText, { color: '#ffffff' }, !editedPlantName.trim() && [styles.editNameModalButtonTextDisabled, { color: colors.textMuted }]]}>
                                    Сохранить
                                </Text>
                            </Pressable>
                            <Pressable
                                style={[styles.editNameModalButton, styles.editNameModalButtonCancel, { backgroundColor: colors.surface }]}
                                onPress={() => {
                                    setPlantToEditName(null);
                                    setEditedPlantName('');
                                }}
                            >
                                <Text style={[styles.editNameModalButtonText, { color: colors.text }]}>Отмена</Text>
                            </Pressable>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
};

interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    allTags: string[];
    activeTags: string[];
    setActiveTags: (tags: string[]) => void;
}

const FilterModal: React.FC<FilterModalProps> = ({ isOpen, onClose, allTags, activeTags, setActiveTags }) => {
    const { t } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const [tempTags, setTempTags] = useState(activeTags);

    useEffect(() => {
        setTempTags(activeTags);
    }, [isOpen, activeTags]);

    const handleToggleTag = (tag: string) => {
        setTempTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    };

    const handleApply = () => {
        setActiveTags(tempTags);
        onClose();
    };

    const handleReset = () => {
        setTempTags([]);
    };

    return (
        <Modal
            visible={isOpen}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                <View style={[styles.filterModal, { backgroundColor: colors.card }]}>
                    <View style={styles.filterModalHeader}>
                        <Text style={[styles.filterModalTitle, { color: colors.text }]}>{t('filter_by_tags')}</Text>
                        <Pressable onPress={onClose}>
                            <Ionicons name="close" size={24} color={colors.textMuted} />
                        </Pressable>
                    </View>
                    <ScrollView style={styles.filterModalBody}>
                        <View style={styles.filterTags}>
                            {allTags.map(tag => (
                                <Pressable
                                    key={tag}
                                    onPress={() => handleToggleTag(tag)}
                                    style={[styles.filterTag, { backgroundColor: colors.surface }, tempTags.includes(tag) && [styles.filterTagActive, { backgroundColor: colors.primary }]]}
                                >
                                    <Text style={[styles.filterTagText, { color: colors.textSecondary }, tempTags.includes(tag) && [styles.filterTagTextActive, { color: '#ffffff' }]]}>
                                        {tag}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </ScrollView>
                    <View style={[styles.filterModalFooter, { borderTopColor: colors.borderLight }]}>
                        <Pressable onPress={handleReset} style={[styles.filterButtonReset, { backgroundColor: colors.surface }]}>
                            <Text style={[styles.filterButtonResetText, { color: colors.textSecondary }]}>{t('filter_reset')}</Text>
                        </Pressable>
                        <Pressable onPress={handleApply} style={[styles.filterButtonApply, { backgroundColor: colors.primary }]}>
                            <Text style={styles.filterButtonApplyText}>{t('filter_apply')}</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor применяется через inline стили
    },
    header: {
        padding: 16,
        paddingTop: 32,
        paddingBottom: 6,
    },
    headerTitle: {
        fontSize: 30,
        fontWeight: '900',
        letterSpacing: -0.5,
        marginBottom: 10,
        // color применяется через inline стили
    },
    tabsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 4,
        borderRadius: 9999,
        borderWidth: 1,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 2,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 9999,
        gap: 6,
    },
    tabIcon: {
        marginRight: 0,
    },
    tabText: {
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 0.5,
        textAlign: 'center',
    },
    tabIndicator: {
        position: 'absolute',
        bottom: 0,
        width: '50%',
        height: 4,
        borderRadius: 2,
        // backgroundColor применяется через inline стили
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 6,
    },
    searchBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20,
        borderWidth: 1,
        paddingHorizontal: 10,
        // backgroundColor и borderColor применяются через inline стили
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 13,
        paddingVertical: 6,
        // color применяется через inline стили
    },
    filterButton: {
        padding: 6,
        borderRadius: 20,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    filterButtonActive: {
        // borderColor применяется через inline стили
    },
    sortButtonContainer: {
        position: 'relative',
    },
    sortButton: {
        padding: 6,
        borderRadius: 20,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    sortButtonActive: {
        // borderColor применяется через inline стили
    },
    sortMenu: {
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 8,
        width: 208,
        borderRadius: 24,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
        zIndex: 500,
        // backgroundColor и borderColor применяются через inline стили
    },
    sortMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    },
    sortMenuText: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    sortMenuTextActive: {
        // color применяется через inline стили
    },
    collectionsScroll: {
        maxHeight: 32,
    },
    collectionsContainer: {
        paddingHorizontal: 16,
        paddingBottom: 4,
        gap: 4,
    },
    collectionChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 9999,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    collectionChipActive: {
        // backgroundColor и borderColor применяются через inline стили
    },
    collectionChipActivePurple: {
        // backgroundColor и borderColor применяются через inline стили
    },
    collectionChipText: {
        fontSize: 8,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1,
        // color применяется через inline стили
    },
    collectionChipTextActive: {
        color: '#ffffff',
    },
    collectionChipTextActivePurple: {
        color: '#ffffff',
    },
    collectionChipNew: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 9999,
        borderWidth: 1,
        borderStyle: 'dashed',
        // backgroundColor и borderColor применяются через inline стили
    },
    content: {
        flex: 1,
    },
    tabContent: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        backgroundColor: 'transparent',
    },
    tabContentHistory: {
        zIndex: 0,
    },
    tabPanel: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    tabPanelContentWrapper: {
        flex: 1,
    },
    tabPanelContent: {
        padding: 12,
        paddingBottom: 20,
    },
    plantsList: {
        gap: 12,
        width: '100%',
        flexShrink: 0,
    },
    plantCard: {
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 0,
        width: '100%',
        marginHorizontal: 40,
        marginBottom: 12,
        flexShrink: 0,
        alignSelf: 'center',
        // backgroundColor и borderColor применяются через inline стили
    },
    plantImageContainer: {
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        aspectRatio: 1,
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
    },
    plantImage: {
        width: '100%',
        height: '100%',
    },
    plantImageHeader: {
        position: 'absolute',
        top: 10,
        right: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    healthBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 9999,
        borderWidth: 0,
        backgroundColor: '#000000',
    },
    healthBadgeTextWrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    healthBadgeGood: {
        backgroundColor: '#10b981',
    },
    healthBadgeMedium: {
        backgroundColor: '#fbbf24',
    },
    healthBadgeBad: {
        backgroundColor: '#ef4444',
    },
    healthLabel: {
        fontSize: 8,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1,
        color: '#ffffff',
        textAlign: 'center',
    },
    healthValue: {
        fontSize: 10,
        fontWeight: '900',
        color: '#ffffff',
        fontVariant: ['tabular-nums'],
        textAlign: 'center',
    },
    taskBadge: {
        position: 'absolute',
        top: 10,
        left: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 9999,
        borderWidth: 1,
        // backgroundColor, borderColor и color текста — через inline
    },
    taskBadgeText: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    taskBadgeTextDue: {},
    plantImageFooter: {
        position: 'absolute',
        bottom: 10,
        left: 10,
        right: 64,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: 14,
        // backgroundColor — через inline
    },
    removeFromGardenButton: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.9)',
        borderRadius: 22,
    },
    plantNameContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    plantNamePressable: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    plantName: {
        fontSize: 18,
        fontWeight: '900',
        color: '#ffffff',
        marginBottom: 2,
        flex: 1,
    },
    plantNameEditIcon: {
        marginLeft: 6,
        marginBottom: 2,
        opacity: 0.7,
    },
    plantScientificName: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: 'rgba(255, 255, 255, 0.8)',
    },
    plantTasks: {
        flexDirection: 'row',
        paddingVertical: 6,
        paddingHorizontal: 12,
        paddingTop: 14,
        gap: 8,
        borderTopWidth: 0,
        borderBottomWidth: 0,
        // backgroundColor применяется через inline стили
    },
    taskItem: {
        flex: 1,
        alignItems: 'center',
        gap: 4,
    },
    taskProgressContainer: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    taskButton: {
        position: 'absolute',
        width: 40,
        height: 40,
        borderRadius: 9999,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        // backgroundColor — через inline
    },
    taskButtonCompleted: {
        // backgroundColor — через inline
    },
    taskButtonDue: {
        borderWidth: 2,
        // backgroundColor, borderColor — через inline
    },
    taskAlert: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 14,
        height: 14,
        borderRadius: 9999,
        backgroundColor: '#ef4444',
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
        // borderColor — через inline
    },
    taskAlertText: {
        fontSize: 7,
        fontWeight: '900',
        color: '#ffffff',
    },
    taskLabel: {
        fontSize: 8,
        fontWeight: '900',
        textTransform: 'uppercase',
        // color — через inline
    },
    taskLabelCompleted: {},
    taskLabelDue: {},
    plantTags: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        padding: 8,
        // backgroundColor применяется через inline стили
    },
    tag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 9999,
        borderWidth: 1,
    },
    tagText: {
        fontSize: 8,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    historyGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingBottom: 60,
    },
    historyItem: {
        width: '31%',
        aspectRatio: 1,
        position: 'relative',
    },
    historyImageContainer: {
        width: '100%',
        height: '100%',
        borderRadius: 24,
        overflow: 'hidden',
        position: 'relative',
    },
    historyDeleteButton: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        // backgroundColor применяется через inline стили
    },
    historyImage: {
        width: '100%',
        height: '100%',
    },
    historyButton: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        width: 32,
        height: 32,
        borderRadius: 9999,
        alignItems: 'center',
        justifyContent: 'center',
        // backgroundColor применяется через inline стили
    },
    historyButtonActive: {
        // backgroundColor применяется через inline стили
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        minHeight: 400,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginTop: 16,
        marginBottom: 4,
        // color применяется через inline стили
    },
    emptyText: {
        fontSize: 14,
        marginBottom: 24,
        textAlign: 'center',
        // color применяется через inline стили
    },
    emptyGardenIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 9999,
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyGardenScanButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 24,
        paddingVertical: 14,
        backgroundColor: '#10b981',
        borderRadius: 20,
        marginBottom: 16,
    },
    emptyGardenScanButtonText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#ffffff',
    },
    resetButton: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 9999,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
        // backgroundColor, shadowColor и borderColor применяются через inline стили
    },
    resetButtonText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    modalOverlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        // backgroundColor применяется через inline стили
    },
    modalContent: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 48,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    modalIcon: {
        width: 64,
        height: 64,
        borderRadius: 9999,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    modalIconDelete: {
        width: 64,
        height: 64,
        borderRadius: 9999,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: '900',
        marginBottom: 8,
        textAlign: 'center',
        // color применяется через inline стили
    },
    modalPlantName: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
        textAlign: 'center',
        // color применяется через inline стили
    },
    modalText: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 32,
        // color применяется через inline стили
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
        // backgroundColor и shadowColor применяются через inline стили
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
        // backgroundColor и borderColor применяются через inline стили
    },
    modalButtonSecondaryText: {
        fontSize: 14,
        fontWeight: '700',
        // color применяется через inline стили
    },
    modalButtonDelete: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 24,
        alignItems: 'center',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
        // backgroundColor и shadowColor применяются через inline стили
    },
    modalButtonDeleteText: {
        fontSize: 16,
        fontWeight: '900',
        color: '#ffffff',
    },
    collectionModal: {
        width: '100%',
        maxWidth: 400,
        borderTopLeftRadius: 48,
        borderTopRightRadius: 48,
        maxHeight: '85%',
        padding: 32,
        // backgroundColor применяется через inline стили
    },
    collectionModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
    },
    collectionModalTitle: {
        fontSize: 24,
        fontWeight: '900',
        // color применяется через inline стили
    },
    collectionModalEmpty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
        paddingHorizontal: 24,
    },
    collectionModalEmptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 9999,
        backgroundColor: 'rgba(167, 139, 250, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    collectionModalEmptyTitle: {
        fontSize: 18,
        fontWeight: '900',
        marginBottom: 8,
        // color применяется через inline стили
    },
    collectionModalEmptyText: {
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 32,
        // color применяется через inline стили
    },
    collectionModalEmptyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        paddingVertical: 16,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
        // backgroundColor и shadowColor применяются через inline стили
    },
    collectionModalEmptyButtonText: {
        fontSize: 14,
        fontWeight: '900',
        color: '#ffffff',
    },
    collectionModalList: {
        flex: 1,
    },
    collectionModalNewButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        padding: 20,
        borderRadius: 32,
        marginBottom: 24,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
        // backgroundColor и shadowColor применяются через inline стили
    },
    collectionModalNewIcon: {
        padding: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 20,
    },
    collectionModalNewText: {
        fontSize: 14,
        fontWeight: '900',
        color: '#ffffff',
    },
    collectionModalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        padding: 20,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: 'transparent',
        marginBottom: 12,
        // backgroundColor применяется через inline стили
    },
    collectionModalItemActive: {
        // backgroundColor и borderColor применяются через inline стили
    },
    collectionModalItemIcon: {
        padding: 16,
        borderRadius: 24,
        // backgroundColor применяется через inline стили
    },
    collectionModalItemIconActive: {
        backgroundColor: '#a78bfa',
    },
    collectionModalItemContent: {
        flex: 1,
    },
    collectionModalItemName: {
        fontSize: 14,
        fontWeight: '900',
        marginBottom: 8,
        // color применяется через inline стили
    },
    collectionModalItemCount: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    collectionModalItemCheck: {
        width: 28,
        height: 28,
        borderRadius: 9999,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        // borderColor применяется через inline стили
    },
    collectionModalItemCheckActive: {
        backgroundColor: '#a78bfa',
        borderColor: '#a78bfa',
    },
    createModal: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 48,
        padding: 40,
        // backgroundColor применяется через inline стили
    },
    createModalTitle: {
        fontSize: 24,
        fontWeight: '900',
        marginBottom: 32,
        // color применяется через inline стили
    },
    createModalInput: {
        width: '100%',
        padding: 20,
        borderRadius: 24,
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 32,
        // backgroundColor, borderColor и color применяются через inline стили
    },
    createModalIcons: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 40,
    },
    createModalIcon: {
        width: 56,
        height: 56,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        // backgroundColor и borderColor применяются через inline стили
    },
    createModalIconActive: {
        // backgroundColor применяется через inline стили
    },
    createModalButtons: {
        gap: 12,
    },
    createModalButton: {
        width: '100%',
        paddingVertical: 20,
        borderRadius: 24,
        alignItems: 'center',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
        // backgroundColor и shadowColor применяются через inline стили
    },
    createModalButtonDisabled: {
        opacity: 0.5,
    },
    createModalButtonText: {
        fontSize: 16,
        fontWeight: '900',
        color: '#ffffff',
    },
    createModalCancel: {
        width: '100%',
        paddingVertical: 16,
        alignItems: 'center',
        // backgroundColor применяется через inline стили
    },
    createModalCancelText: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    filterModal: {
        width: '100%',
        maxWidth: 400,
        borderTopLeftRadius: 48,
        borderTopRightRadius: 48,
        maxHeight: '75%',
        padding: 32,
        // backgroundColor применяется через inline стили
    },
    filterModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    filterModalTitle: {
        fontSize: 24,
        fontWeight: '900',
        // color применяется через inline стили
    },
    filterModalBody: {
        flex: 1,
        marginBottom: 16,
    },
    filterTags: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    filterTag: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 9999,
        // backgroundColor применяется через inline стили
    },
    filterTagActive: {
        // backgroundColor применяется через inline стили
    },
    filterTagText: {
        fontSize: 12,
        fontWeight: '700',
        // color применяется через inline стили
    },
    filterTagTextActive: {
        color: '#ffffff',
    },
    filterModalFooter: {
        flexDirection: 'row',
        gap: 12,
        paddingTop: 16,
        borderTopWidth: 1,
        // borderTopColor применяется через inline стили
    },
    filterButtonReset: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 24,
        alignItems: 'center',
        // backgroundColor применяется через inline стили
    },
    filterButtonResetText: {
        fontSize: 16,
        fontWeight: '700',
        // color применяется через inline стили
    },
    filterButtonApply: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 24,
        alignItems: 'center',
        // backgroundColor применяется через inline стили
    },
    filterButtonApplyText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#ffffff',
    },
    editNameModalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        // backgroundColor применяется через inline стили
    },
    editNameModalContent: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 24,
        padding: 24,
        // backgroundColor применяется через inline стили
    },
    editNameModalTitle: {
        fontSize: 20,
        fontWeight: '900',
        marginBottom: 16,
        // color применяется через inline стили
    },
    editNameModalInput: {
        width: '100%',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        fontSize: 16,
        marginBottom: 20,
        // backgroundColor, borderColor и color применяются через inline стили
    },
    editNameModalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    editNameModalButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        // backgroundColor применяется через inline стили
    },
    editNameModalButtonSave: {
        // backgroundColor применяется через inline стили
    },
    editNameModalButtonCancel: {
        // backgroundColor применяется через inline стили
    },
    editNameModalButtonText: {
        fontSize: 16,
        fontWeight: '700',
        // color применяется через inline стили
    },
    editNameModalButtonTextDisabled: {
        // color применяется через inline стили
    },
});

export default MyPlantsScreen;
