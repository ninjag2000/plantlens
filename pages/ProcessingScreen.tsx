import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, Animated, Alert, Dimensions, BackHandler } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { processDocument, diagnosePlant, identifyPlant, analyzeRepotting, searchWorldDatabase } from '../services/geminiService';
import { saveDocument, savePlant } from '../services/storageService';
import { useSubscription } from '../hooks/useSubscription';
import { ScannedDocument, Plant, GeminiPlantResponse } from '../types';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { generateUUID } from '../utils/uuid';
import type { TranslationKey } from '../services/translations';

function getDefaultCareTips(t: (k: TranslationKey) => string) {
    return {
        watering: t('default_care_watering'),
        sunlight: t('default_care_sunlight'),
        soil: t('default_care_soil'),
        temperature: t('default_care_temperature'),
    };
}

function normalizeIdentifiedForPlant(identified: GeminiPlantResponse, t: (k: TranslationKey) => string): Partial<Plant> {
    const defaultCare = getDefaultCareTips(t);
    const careTips = identified.careTips && typeof identified.careTips === 'object'
        ? {
            watering: identified.careTips.watering?.trim() || defaultCare.watering,
            sunlight: identified.careTips.sunlight?.trim() || defaultCare.sunlight,
            soil: identified.careTips.soil?.trim() || defaultCare.soil,
            temperature: (identified.careTips as { temperature?: string }).temperature?.trim() || defaultCare.temperature,
        }
        : defaultCare;

    const taxonomy = identified.taxonomy || { kingdom: 'Plantae', phylum: '-', class: '-', order: '-', family: '-', genus: '-', species: '-' };
    const family = taxonomy.family?.trim();

    const plantType = identified.plantType?.trim() || (family ? `${t('data_family_prefix')} ${family}` : t('data_herb'));
    const lifespan = identified.lifespan?.trim() || t('data_perennial');
    const habitat = identified.habitat?.trim() || (family ? `${t('data_cultivated_family')} ${family}` : t('data_cultivated'));
    const plantGroup = identified.characteristics?.mature?.plantGroup?.trim() || t('data_flowering');
    const mature = {
        plantGroup,
        maxHeight: identified.characteristics?.mature?.maxHeight?.trim() || t('data_depends_conditions'),
        maxWidth: identified.characteristics?.mature?.maxWidth?.trim() || t('data_depends_conditions'),
        leafColor: identified.characteristics?.mature?.leafColor?.trim() || t('data_green'),
        leafType: identified.characteristics?.mature?.leafType?.trim() || t('data_usual'),
        plantingTime: identified.characteristics?.mature?.plantingTime?.trim() || t('data_spring'),
    };
    const flower = {
        flowerSize: identified.characteristics?.flower?.flowerSize?.trim() || t('data_varies_by_species'),
        floweringTime: identified.characteristics?.flower?.floweringTime?.trim() || t('data_varies_by_species'),
        flowerColor: identified.characteristics?.flower?.flowerColor?.trim() || t('data_varies_by_species'),
    };
    const fruit = {
        fruitName: identified.characteristics?.fruit?.fruitName?.trim() || t('data_no_data'),
        harvestTime: identified.characteristics?.fruit?.harvestTime?.trim() || t('data_no_data'),
        fruitColor: identified.characteristics?.fruit?.fruitColor?.trim() || t('data_no_data'),
    };

    return {
        ...identified,
        commonName: identified.commonName?.trim() || identified.scientificName?.trim() || t('common_plant_unknown'),
        scientificName: identified.scientificName?.trim() || '',
        description: identified.description?.trim() || `Растение: ${identified.commonName?.trim() || identified.scientificName?.trim() || t('common_plant_unknown')}.`,
        plantType,
        lifespan,
        habitat,
        careTips,
        taxonomy: identified.taxonomy || {
            kingdom: 'Plantae', phylum: '-', class: '-', order: '-', family: '-', genus: '-', species: '-',
        },
        characteristics: {
            ...identified.characteristics,
            mature: { ...identified.characteristics?.mature, ...mature },
            flower: { ...identified.characteristics?.flower, ...flower },
            fruit: { ...identified.characteristics?.fruit, ...fruit },
        },
    };
}

interface ProcessingScreenProps {
    plants: Plant[];
    refreshDocuments: () => void;
    addPlant: (plant: Plant) => void;
}

const ProcessingScreen: React.FC<ProcessingScreenProps> = ({ plants, refreshDocuments, addPlant }) => {
    const navigation = useNavigation();
    const route = useRoute();
    const insets = useSafeAreaInsets();
    const { t, language } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const params = (route.params as any) || {};
    const { image, analysisMode, imagesQueue, plantName: initialPlantName, plantId: initialPlantId } = params;
    const { isSubscribed, checkSubscription } = useSubscription();
    
    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const scanAnim = React.useRef(new Animated.Value(0)).current;
    const pulseAnim1 = React.useRef(new Animated.Value(1)).current;
    const pulseAnim2 = React.useRef(new Animated.Value(1)).current;
    const pulseAnim3 = React.useRef(new Animated.Value(1)).current;

    const loadingMessages = analysisMode === 'diagnosis'
        ? [t('loading_diag_1'), t('loading_diag_2'), t('loading_diag_3'), t('loading_diag_4'), t('loading_diag_5'), t('loading_diag_6')]
        : analysisMode === 'repotting'
        ? [t('loading_repot_1'), t('loading_repot_2'), t('loading_repot_3'), t('loading_repot_4'), t('loading_repot_5'), t('loading_repot_6')]
        : [t('loading_scan_1'), t('loading_scan_2'), t('loading_scan_3'), t('loading_scan_4'), t('loading_scan_5'), t('loading_scan_6')];

    useEffect(() => {
        checkSubscription();
    }, []);

    useEffect(() => {
        const onBack = () => {
            (navigation as any).navigate('MainTabs');
            return true;
        };
        const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
        return () => sub.remove();
    }, [navigation]);

    useEffect(() => {
        const progressInterval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 98) return prev; // Увеличено с 95 до 98
                return prev + Math.random() * 3; // Уменьшено с 5 до 3 для более плавного роста
            });
        }, 200);
        return () => clearInterval(progressInterval);
    }, []);

    useEffect(() => {
        // Scan animation
        Animated.loop(
            Animated.sequence([
                Animated.timing(scanAnim, {
                    toValue: 1,
                    duration: 3000,
                    useNativeDriver: true,
                }),
                Animated.timing(scanAnim, {
                    toValue: 0,
                    duration: 0,
                    useNativeDriver: true,
                }),
            ])
        ).start();

        // Pulse animations
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim1, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
                Animated.timing(pulseAnim1, { toValue: 1, duration: 1000, useNativeDriver: true }),
            ])
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.delay(300),
                Animated.timing(pulseAnim2, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
                Animated.timing(pulseAnim2, { toValue: 1, duration: 1000, useNativeDriver: true }),
            ])
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.delay(700),
                Animated.timing(pulseAnim3, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
                Animated.timing(pulseAnim3, { toValue: 1, duration: 1000, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    useEffect(() => {
        if (!image && (!imagesQueue || imagesQueue.length === 0)) {
            navigation.navigate('NewCameraScreen' as never, { replace: true } as never);
            return;
        }

        const runProcessing = async () => {
            // Приоритет: обрезанное изображение (image) > очередь изображений (imagesQueue)
            // Это гарантирует, что используется именно обрезанная область, выбранная пользователем
            const imagesToProcess = image ? [image] : (imagesQueue && imagesQueue.length > 0 ? imagesQueue : []);
            
            if (imagesToProcess.length === 0) {
                console.error("No valid images found to process");
                navigation.navigate('NewCameraScreen' as never, { replace: true } as never);
                return;
            }
            
            console.log('Processing image:', imagesToProcess[0].substring(0, 50) + '...', 'Total images:', imagesToProcess.length);

            if (analysisMode === 'diagnosis') {
                let diagnosisPlantName = initialPlantName;
                let resolvedPlantId = initialPlantId;
                let identifiedPlantData = null;

                if (!diagnosisPlantName) {
                    setProgress(40);
                    // Конвертируем file:// URI в base64, если необходимо
                    let imageForIdentification = imagesToProcess[0];
                    if (imageForIdentification.startsWith('file://')) {
                        try {
                            setProgress(50);
                            const base64 = await FileSystem.readAsStringAsync(imageForIdentification, {
                                encoding: FileSystem.EncodingType.Base64,
                            });
                            imageForIdentification = `data:image/jpeg;base64,${base64}`;
                            setProgress(60);
                        } catch (error) {
                            console.error('Failed to convert image to base64:', error);
                        }
                    }
                    setProgress(65);
                    const identified = await identifyPlant(imageForIdentification, 'image/jpeg', language);
                    setProgress(70);
                    
                    // Проверяем на невалидное растение
                    const isInvalidPlant = identified.commonName === 'INVALID_PLANT' || 
                                          identified.scientificName === 'INVALID_PLANT' ||
                                          identified.commonName?.toLowerCase().includes('invalid') ||
                                          identified.error;
                    
                    if (!isInvalidPlant) {
                        diagnosisPlantName = identified.commonName;
                        identifiedPlantData = identified;

                        const existingPlant = plants.find(p => {
                            // Приоритет: сначала проверяем научное имя
                            const sMatch = p.scientificName?.toLowerCase().trim() === identified.scientificName?.toLowerCase().trim();
                            if (sMatch && identified.scientificName?.trim()) return true;
                            // Если научное имя не совпало или отсутствует, проверяем обычное название
                            const cMatch = p.commonName?.toLowerCase().trim() === identified.commonName?.toLowerCase().trim();
                            return cMatch;
                        });

                        if (existingPlant) {
                            resolvedPlantId = existingPlant.id;
                        }
                    }
                }

                // Используем обрезанное изображение для диагностики
                // Конвертируем file:// URI в base64, если необходимо
                setProgress(75);
                let imageForDiagnosis = imagesToProcess[0]; // Это обрезанное изображение
                if (imageForDiagnosis.startsWith('file://')) {
                    try {
                        setProgress(80);
                        const base64 = await FileSystem.readAsStringAsync(imageForDiagnosis, {
                            encoding: FileSystem.EncodingType.Base64,
                        });
                        imageForDiagnosis = `data:image/jpeg;base64,${base64}`;
                        setProgress(85);
                    } catch (error) {
                        console.error('Failed to convert image to base64:', error);
                    }
                }
                setProgress(90);
                console.log('[ProcessingScreen] Starting diagnosis...');
                const diagnosis = await diagnosePlant(imageForDiagnosis, 'image/jpeg', diagnosisPlantName, language);
                console.log('[ProcessingScreen] Diagnosis completed:', diagnosis && 'error' in diagnosis ? 'error' : 'success');
                
                if ('error' in diagnosis) {
                    const errorMsg = diagnosis.error || t('error_diagnosis');
                    console.error('[ProcessingScreen] Diagnosis error:', errorMsg);
                    Alert.alert(t('error_title'), errorMsg);
                    navigation.navigate('NewCameraScreen' as never, { analysisMode: 'diagnosis', replace: true } as never);
                    return;
                }
                
                // Проверяем, что диагноз действительно получен
                if (!diagnosis || !diagnosis.problemTitle) {
                    console.error('[ProcessingScreen] Incomplete diagnosis data:', diagnosis);
                    Alert.alert(t('error_title'), t('error_diagnosis_incomplete'));
                    navigation.navigate('NewCameraScreen' as never, { analysisMode: 'diagnosis', replace: true } as never);
                    return;
                }
                
                const hasImage = !!(imagesToProcess && imagesToProcess[0]);
                if (!hasImage) {
                    Alert.alert(t('error_title'), t('error_diagnosis_incomplete'));
                    navigation.navigate('NewCameraScreen' as never, { analysisMode: 'diagnosis', replace: true } as never);
                    return;
                }
                
                // Убеждаемся, что диагноз полностью готов перед навигацией
                setProgress(100);
                console.log('[ProcessingScreen] Navigating to DiagnosisResult with diagnosis:', diagnosis.problemTitle);
                
                // Небольшая задержка для завершения всех операций перед навигацией
                await new Promise(resolve => setTimeout(resolve, 300));
                
                navigation.navigate('DiagnosisResult' as never, { 
                    diagnosis, 
                    image: imagesToProcess[0], 
                    identifiedPlant: identifiedPlantData,
                    plantId: resolvedPlantId,
                    contextPlantName: diagnosisPlantName || undefined
                } as never);
                return;
            }

            if (analysisMode === 'repotting') {
                setProgress(50);
                // Используем обрезанное изображение для анализа пересадки
                // Конвертируем file:// URI в base64, если необходимо
                let imageForRepotting = imagesToProcess[0]; // Это обрезанное изображение
                if (imageForRepotting.startsWith('file://')) {
                    try {
                        setProgress(60);
                        const base64 = await FileSystem.readAsStringAsync(imageForRepotting, {
                            encoding: FileSystem.EncodingType.Base64,
                        });
                        imageForRepotting = `data:image/jpeg;base64,${base64}`;
                        setProgress(70);
                    } catch (error) {
                        console.error('Failed to convert image to base64:', error);
                    }
                }
                setProgress(85);
                const repotData = await analyzeRepotting(imageForRepotting, 'image/jpeg', language);
                if ('error' in repotData) {
                    Alert.alert(t('error_title'), t('error_analysis'));
                    navigation.navigate('NewCameraScreen' as never, { analysisMode: 'repotting', replace: true } as never);
                } else {
                    setProgress(100);
                    setTimeout(() => {
                        navigation.navigate('RepottingResult' as never, { 
                            result: repotData, 
                            image: imagesToProcess[0]
                        } as never);
                    }, 500);
                }
                return;
            }

            if (analysisMode !== 'document') {
                // Идентифицируем растение и переходим на Plant Detail (в т.ч. режим analysis с центральной кнопки)
                // Примечание: 'diagnosis' обрабатывается отдельно выше, поэтому здесь его не проверяем
                if (!analysisMode || analysisMode === 'scan' || analysisMode === 'identify' || analysisMode === 'analysis') {
                    try {
                        setProgress(50); // Прогресс после начала обработки
                        
                        // Конвертируем file:// URI в base64, если необходимо
                        let imageForIdentification = imagesToProcess[0];
                        if (imageForIdentification.startsWith('file://')) {
                            try {
                                setProgress(60); // Прогресс начала конвертации
                                const base64 = await FileSystem.readAsStringAsync(imageForIdentification, {
                                    encoding: FileSystem.EncodingType.Base64,
                                });
                                imageForIdentification = `data:image/jpeg;base64,${base64}`;
                                setProgress(70); // Прогресс после конвертации
                            } catch (error) {
                                console.error('Failed to convert image to base64:', error);
                                setProgress(100);
                                Alert.alert(t('error_title'), t('error_image_process'));
                                navigation.navigate('NewCameraScreen' as never, { replace: true } as never);
                                return;
                            }
                        }
                        
                        setProgress(75); // Прогресс перед идентификацией
                        const identified = await identifyPlant(imageForIdentification, 'image/jpeg', language);
                        setProgress(85); // Прогресс после идентификации
                        
                        // Проверяем на ошибку или невалидное растение
                        const isInvalidPlant = identified.commonName === 'INVALID_PLANT' || 
                                              identified.scientificName === 'INVALID_PLANT' ||
                                              identified.commonName?.toLowerCase().includes('invalid') ||
                                              identified.error;
                        
                        if (isInvalidPlant) {
                            setProgress(100);
                            Alert.alert(
                                t('error_identification'),
                                t('error_identification_desc'),
                                [
                                    {
                                        text: t('try_again_btn'),
                                        onPress: () => navigation.navigate('NewCameraScreen' as never, { analysisMode: 'analysis', replace: true } as never)
                                    }
                                ]
                            );
                            setTimeout(() => {
                                navigation.navigate('NewCameraScreen' as never, { analysisMode: 'analysis', replace: true } as never);
                            }, 100);
                            return;
                        }
                        
                        setProgress(90); // Прогресс перед сохранением
                        
                        // Проверяем, существует ли уже такое растение (приоритет научному имени)
                        const existingPlant = plants.find(p => {
                            // Приоритет: сначала проверяем научное имя
                            const sMatch = p.scientificName?.toLowerCase().trim() === identified.scientificName?.toLowerCase().trim();
                            if (sMatch && identified.scientificName?.trim()) return true;
                            // Если научное имя не совпало или отсутствует, проверяем обычное название
                            const cMatch = p.commonName?.toLowerCase().trim() === identified.commonName?.toLowerCase().trim();
                            return cMatch;
                        });
                        
                        let targetPlantId: string;
                        
                        let normalized = normalizeIdentifiedForPlant(identified, t);
                        let finalCommonName = identified.commonName?.trim() || normalized.commonName?.trim();
                        if (!finalCommonName || finalCommonName === '') {
                            finalCommonName = identified.scientificName?.trim() || normalized.scientificName?.trim() || t('common_plant_unknown');
                        }
                        const finalScientificName = identified.scientificName?.trim() || normalized.scientificName?.trim() || '';

                        const fruitPlaceholder = (v?: string) => !v?.trim() || v.trim().toLowerCase() === 'не применимо' || v.trim().toLowerCase() === 'не образует';
                        const flowerPlaceholder = (v?: string) => !v?.trim() || v.trim().toLowerCase() === 'зависит от вида';
                        const fruitFromIdentify = normalized.characteristics?.fruit;
                        const flowerFromIdentify = normalized.characteristics?.flower;
                        const needFruitFromAi = fruitPlaceholder(fruitFromIdentify?.fruitName) && fruitPlaceholder(fruitFromIdentify?.harvestTime) && fruitPlaceholder(fruitFromIdentify?.fruitColor);
                        const needFlowerFromAi = flowerPlaceholder(flowerFromIdentify?.floweringTime) || flowerPlaceholder(flowerFromIdentify?.flowerSize) || flowerPlaceholder(flowerFromIdentify?.flowerColor);
                        if ((needFruitFromAi || needFlowerFromAi) && finalScientificName) {
                            try {
                                setProgress(92);
                                const searchResult = await searchWorldDatabase(finalScientificName, language);
                                const srFruit = searchResult?.characteristics?.fruit;
                                const srFlower = searchResult?.characteristics?.flower;
                                const hasFruitToMerge = srFruit && typeof srFruit === 'object' && (!fruitPlaceholder(srFruit.fruitName) || !fruitPlaceholder(srFruit.harvestTime) || !fruitPlaceholder(srFruit.fruitColor));
                                const hasFlowerToMerge = srFlower && typeof srFlower === 'object' && (!flowerPlaceholder(srFlower.floweringTime) || !flowerPlaceholder(srFlower.flowerSize) || !flowerPlaceholder(srFlower.flowerColor));
                                if (hasFruitToMerge || hasFlowerToMerge) {
                                    normalized = {
                                        ...normalized,
                                        characteristics: {
                                            ...normalized.characteristics,
                                            ...(hasFruitToMerge && srFruit && {
                                                fruit: {
                                                    fruitName: (srFruit.fruitName?.trim() && !fruitPlaceholder(srFruit.fruitName)) ? srFruit.fruitName.trim() : (normalized.characteristics?.fruit?.fruitName || t('data_not_applicable')),
                                                    harvestTime: (srFruit.harvestTime?.trim() && !fruitPlaceholder(srFruit.harvestTime)) ? srFruit.harvestTime.trim() : (normalized.characteristics?.fruit?.harvestTime || t('data_not_applicable')),
                                                    fruitColor: (srFruit.fruitColor?.trim() && !fruitPlaceholder(srFruit.fruitColor)) ? srFruit.fruitColor.trim() : (normalized.characteristics?.fruit?.fruitColor || t('data_not_applicable')),
                                                },
                                            }),
                                            ...(hasFlowerToMerge && srFlower && {
                                                flower: {
                                                    floweringTime: (srFlower.floweringTime?.trim() && !flowerPlaceholder(srFlower.floweringTime)) ? srFlower.floweringTime.trim() : (normalized.characteristics?.flower?.floweringTime || t('data_varies_by_species')),
                                                    flowerSize: (srFlower.flowerSize?.trim() && !flowerPlaceholder(srFlower.flowerSize)) ? srFlower.flowerSize.trim() : (normalized.characteristics?.flower?.flowerSize || t('data_varies_by_species')),
                                                    flowerColor: (srFlower.flowerColor?.trim() && !flowerPlaceholder(srFlower.flowerColor)) ? srFlower.flowerColor.trim() : (normalized.characteristics?.flower?.flowerColor || t('data_varies_by_species')),
                                                },
                                            }),
                                        },
                                    };
                                }
                            } catch (_) {
                                // оставляем normalized как есть
                            }
                        }

                        if (existingPlant) {
                            // Обновляем существующее растение: новое фото + заполняем пустые поля из распознавания
                            const updatedPlant: Plant = {
                                ...existingPlant,
                                imageUrl: imagesToProcess[0],
                                identificationDate: new Date().toISOString(),
                                contentLanguage: language,
                                commonName: finalCommonName,
                                scientificName: finalScientificName || existingPlant.scientificName,
                                description: normalized.description ?? existingPlant.description,
                                plantType: normalized.plantType ?? existingPlant.plantType,
                                lifespan: normalized.lifespan ?? existingPlant.lifespan,
                                habitat: normalized.habitat ?? existingPlant.habitat,
                                careTips: normalized.careTips ?? existingPlant.careTips,
                                taxonomy: normalized.taxonomy ?? existingPlant.taxonomy,
                                characteristics: normalized.characteristics ?? existingPlant.characteristics,
                            };
                            await savePlant(updatedPlant);
                            targetPlantId = existingPlant.id;
                        } else {
                            const newPlant: Plant = {
                                id: generateUUID(),
                                imageUrl: imagesToProcess[0],
                                identificationDate: new Date().toISOString(),
                                contentLanguage: language,
                                isInGarden: false,
                                notes: '',
                                reminders: {},
                                careHistory: [],
                                ...normalized,
                                commonName: finalCommonName,
                                scientificName: finalScientificName,
                                plantType: normalized.plantType,
                                lifespan: normalized.lifespan,
                                habitat: normalized.habitat,
                                characteristics: normalized.characteristics,
                            } as Plant;
                            addPlant(newPlant);
                            targetPlantId = newPlant.id;
                        }
                        
                        setProgress(100);
                        setTimeout(() => {
                            navigation.navigate('PlantDetail' as never, { plantId: targetPlantId, replace: true } as never);
                        }, 500);
                        return;
                    } catch (error) {
                        console.error('Error during plant identification:', error);
                        setProgress(100);
                        Alert.alert(t('error_title'), t('error_analysis'));
                        navigation.navigate('NewCameraScreen' as never, { replace: true } as never);
                        return;
                    }
                }
                
                // Для других режимов анализа переходим на PlantAnalysis
                navigation.navigate('PlantAnalysis' as never, { 
                    image: imagesToProcess[0],
                    imagesQueue: imagesToProcess,
                    analysisMode 
                } as never);
                return;
            }

            const docImage = imagesToProcess[0];
            const base64Data = docImage.startsWith('data:') ? docImage.split(',')[1] : docImage;
            
            const response = await processDocument(base64Data, 'image/jpeg', isSubscribed, language);
            const docId = generateUUID();
            let title = t('scanned_document');
            if (!response.error && response.ocrText) {
                title = response.ocrText.split(' ').slice(0, 5).join(' ') || t('scanned_document');
            }
            
            const newDocument: ScannedDocument = {
                id: docId,
                title,
                imageUrl: imagesToProcess[0],
                createdAt: new Date().toISOString(),
                ocrText: response.ocrText,
                aiInsights: response.aiInsights,
                error: response.error,
            };
            
            await saveDocument(newDocument);
            refreshDocuments();
            setProgress(100);
            setTimeout(() => navigation.navigate('Detail' as never, { documentId: docId, replace: true } as never), 500);
        };
        
        const timer = setTimeout(runProcessing, 3500);
        return () => clearTimeout(timer);
    }, [image, navigation, isSubscribed, analysisMode, refreshDocuments, imagesQueue, initialPlantName, initialPlantId, plants, addPlant]);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentMessageIndex((prev) => (prev >= loadingMessages.length - 1 ? prev : prev + 1));
        }, 1000);
        return () => clearInterval(interval);
    }, [loadingMessages.length]);

    const screenHeight = Dimensions.get('window').height;
    const scanY = scanAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, screenHeight * 0.8], // Ограничиваем диапазон для безопасности
    });

    // Приоритет: обрезанное изображение (image) > очередь изображений (imagesQueue)
    // Это гарантирует, что на экране загрузки отображается именно обрезанная область
    const displayImage = image || (imagesQueue && imagesQueue.length > 0 ? imagesQueue[0] : null);

    // Фон экрана загрузки всегда тёмно-зелёный при любой теме
    const PROCESSING_BG = '#0f2e1a';
    const processingText = '#f0fdf4';
    const processingTextMuted = 'rgba(240, 253, 244, 0.7)';

    return (
        <View style={[styles.container, { backgroundColor: PROCESSING_BG }]}>
            <View style={[styles.gradientOverlay, { top: -insets.top, bottom: -insets.bottom, left: 0, right: 0, backgroundColor: 'rgba(16, 185, 129, 0.12)' }]} />
            <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom, justifyContent: 'center' }]}>
                <View style={styles.abovePhoto}>
                    <Text style={[styles.abovePhotoTitle, { color: processingText }]}>{t('processing_neural_scan')}</Text>
                    <Text style={[styles.abovePhotoSubtitle, { color: processingTextMuted }]}>{t('processing_analyzing_image')}</Text>
                </View>
                <View style={styles.imageContainer}>
                    <View style={styles.imageWrapper}>
                        {displayImage && (
                            <Image 
                                source={{ uri: displayImage }} 
                                style={styles.image}
                                resizeMode="cover"
                            />
                        )}
                        <Animated.View 
                            style={[
                                styles.scanLine,
                                {
                                    transform: [{ translateY: scanY }],
                                }
                            ]}
                        />
                        
                        <Animated.View 
                            style={[
                                styles.pulseDot,
                                styles.pulseDot1,
                                { opacity: pulseAnim1 }
                            ]}
                        />
                        <Animated.View 
                            style={[
                                styles.pulseDot,
                                styles.pulseDot2,
                                { opacity: pulseAnim2 }
                            ]}
                        />
                        <Animated.View 
                            style={[
                                styles.pulseDot,
                                styles.pulseDot3,
                                { opacity: pulseAnim3 }
                            ]}
                        />
                        
                        <View style={styles.imageOverlay}>
                            <Text style={styles.imageOverlayText}>PX-9902 :: CAPTURED</Text>
                            <Text style={styles.imageOverlayText}>MODE: {analysisMode}</Text>
                            <Text style={styles.imageOverlayText}>SCANNING DATA_STREAM...</Text>
                        </View>
                    </View>
                    
                    <View style={styles.sideIcons}>
                        <Ionicons name="pulse" size={18} color="rgba(16, 185, 129, 0.4)" />
                        <MaterialIcons name="memory" size={18} color="rgba(16, 185, 129, 0.4)" />
                        <MaterialIcons name="storage" size={18} color="rgba(16, 185, 129, 0.4)" />
                    </View>
                </View>

                <View style={styles.messageContainer}>
                    <Text style={styles.messageLabel}>{t('processing_intelligence')}</Text>
                    <View style={styles.messageBox}>
                        <Text key={currentMessageIndex} style={styles.messageText}>
                            {loadingMessages[currentMessageIndex]}
                        </Text>
                    </View>
                </View>

                <View style={styles.progressContainer}>
                    <View style={styles.progressHeader}>
                        <Text style={styles.progressLabel}>{t('processing_neural_engine')}</Text>
                        <Text style={styles.progressValue}>{Math.round(progress)}%</Text>
                    </View>
                    <View style={styles.progressBar}>
                        <Animated.View 
                            style={[
                                styles.progressFill,
                                { width: `${progress}%` }
                            ]}
                        />
                    </View>
                    <View style={styles.progressIcons}>
                        <View style={styles.progressIconItem}>
                            <MaterialIcons name="fingerprint" size={16} color="rgba(16, 185, 129, 0.4)" />
                            <Text style={styles.progressIconLabel}>{t('progress_identity')}</Text>
                        </View>
                        <View style={styles.progressIconItem}>
                            <Ionicons name="search" size={16} color="rgba(16, 185, 129, 0.4)" />
                            <Text style={styles.progressIconLabel}>{t('progress_texture')}</Text>
                        </View>
                        <View style={styles.progressIconItem}>
                            <Ionicons name="shield-checkmark" size={16} color="rgba(16, 185, 129, 0.4)" />
                            <Text style={styles.progressIconLabel}>{t('health_label')}</Text>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible',
        // backgroundColor применяется через inline стили
    },
    gradientOverlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        // backgroundColor применяется через inline стили
    },
    content: {
        width: '100%',
        flex: 1,
        alignItems: 'center',
        zIndex: 10,
        paddingHorizontal: 16,
    },
    abovePhoto: {
        marginBottom: 16,
        alignItems: 'center',
    },
    abovePhotoTitle: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 1,
        // color применяется через inline стили
    },
    abovePhotoSubtitle: {
        fontSize: 12,
        marginTop: 4,
        // color применяется через inline стили
    },
    imageContainer: {
        width: '100%',
        maxWidth: 280,
        aspectRatio: 1,
        marginBottom: 20,
        position: 'relative',
    },
    imageWrapper: {
        width: '100%',
        height: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
        opacity: 0.85,
    },
    scanLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: 4,
        backgroundColor: '#4ade80',
        shadowColor: '#4ade80',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 20,
        elevation: 8,
    },
    pulseDot: {
        position: 'absolute',
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#4ade80',
        shadowColor: '#4ade80',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 10,
        elevation: 4,
    },
    pulseDot1: {
        top: '20%',
        left: '30%',
    },
    pulseDot2: {
        top: '60%',
        left: '70%',
    },
    pulseDot3: {
        top: '40%',
        left: '50%',
    },
    imageOverlay: {
        position: 'absolute',
        top: 16,
        left: 16,
        gap: 4,
    },
    imageOverlayText: {
        fontFamily: 'monospace',
        fontSize: 8,
        color: 'rgba(16, 185, 129, 0.6)',
        textTransform: 'uppercase',
    },
    sideIcons: {
        position: 'absolute',
        right: 8,
        top: '50%',
        marginTop: -28,
        gap: 16,
    },
    messageContainer: {
        gap: 6,
        marginBottom: 16,
        alignItems: 'center',
        flexShrink: 0,
    },
    messageLabel: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 8,
        color: 'rgba(16, 185, 129, 0.8)',
        marginBottom: 8,
    },
    messageBox: {
        minHeight: 28,
        overflow: 'hidden',
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    messageText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: -0.5,
        textAlign: 'center',
    },
    progressContainer: {
        width: '100%',
        gap: 12,
        flexShrink: 0,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        paddingHorizontal: 4,
    },
    progressLabel: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: 'rgba(240, 253, 244, 0.8)',
    },
    progressValue: {
        fontSize: 14,
        fontWeight: '900',
        fontFamily: 'monospace',
        color: '#4ade80',
    },
    progressBar: {
        width: '100%',
        height: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 9999,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#10b981',
        shadowColor: '#4ade80',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 4,
    },
    progressIcons: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 24,
        paddingTop: 12,
    },
    progressIconItem: {
        alignItems: 'center',
        gap: 4,
    },
    progressIconLabel: {
        fontSize: 7,
        fontWeight: '700',
        textTransform: 'uppercase',
        color: 'rgba(240, 253, 244, 0.7)',
        letterSpacing: 0.5,
    },
});

export default ProcessingScreen;
