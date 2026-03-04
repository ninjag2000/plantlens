import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Modal, Alert, Dimensions, PanResponder } from 'react-native';
import Slider from '@react-native-community/slider';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useI18n } from '../hooks/useI18n';
import { getThemeColors } from '../utils/themeColors';

const CropScreen: React.FC = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { theme } = useTheme();
    const { t } = useI18n();
    const colors = getThemeColors(theme);
    const params = (route.params as any) || {};
    const { image: capturedImage, type: cropType = 'plant', analysisMode, plantId, plantName, imagesQueue = [] } = params;
    
    const [zoom, setZoom] = useState(1);
    const [cropSize, setCropSize] = useState(300); // Размер рамки кадрирования
    const [cropOffsetX, setCropOffsetX] = useState(0); // Смещение рамки по X
    const [cropOffsetY, setCropOffsetY] = useState(0); // Смещение рамки по Y
    const [showChoiceModal, setShowChoiceModal] = useState(false);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [currentCroppedUrl, setCurrentCroppedUrl] = useState<string | null>(null);
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    const [imageLayout, setImageLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const imageWrapperRef = useRef<View>(null);
    const cropFrameRef = useRef<View>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [activeHandle, setActiveHandle] = useState<string | null>(null); // 'move', 'tl', 'tr', 'bl', 'br'
    
    // Refs для хранения текущих значений (чтобы PanResponder всегда имел актуальные данные)
    const cropSizeRef = useRef(cropSize);
    const cropOffsetXRef = useRef(cropOffsetX);
    const cropOffsetYRef = useRef(cropOffsetY);
    const dragStartRef = useRef({ x: 0, y: 0, size: 300, offsetX: 0, offsetY: 0 });
    const activeHandleRef = useRef<string | null>(null);
    
    useEffect(() => {
        cropSizeRef.current = cropSize;
    }, [cropSize]);
    
    useEffect(() => {
        cropOffsetXRef.current = cropOffsetX;
    }, [cropOffsetX]);
    
    useEffect(() => {
        cropOffsetYRef.current = cropOffsetY;
    }, [cropOffsetY]);
    
    useEffect(() => {
        activeHandleRef.current = activeHandle;
    }, [activeHandle]);
    
    const aspect = 1;

    // PanResponder для перемещения рамки
    const framePanResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => {
                // Перехватываем жест только если не активен уголок
                return !activeHandleRef.current;
            },
            onMoveShouldSetPanResponder: (evt, gestureState) => {
                // Начинаем перетаскивание при движении более 2 пикселей (более чувствительно)
                return (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2) && !activeHandleRef.current;
            },
            onPanResponderGrant: (evt) => {
                // Проверяем, что не касаемся уголка (уголки имеют приоритет)
                if (!activeHandleRef.current) {
                    console.log('Frame drag started at', evt.nativeEvent.pageX, evt.nativeEvent.pageY);
                    setIsDragging(true);
                    setActiveHandle('move');
                    dragStartRef.current = {
                        x: evt.nativeEvent.pageX,
                        y: evt.nativeEvent.pageY,
                        size: cropSizeRef.current,
                        offsetX: cropOffsetXRef.current,
                        offsetY: cropOffsetYRef.current,
                    };
                }
            },
            onPanResponderMove: (evt) => {
                if (activeHandleRef.current === 'move') {
                    const dragStart = dragStartRef.current;
                    const deltaX = evt.nativeEvent.pageX - dragStart.x;
                    const deltaY = evt.nativeEvent.pageY - dragStart.y;
                    setCropOffsetX(dragStart.offsetX + deltaX);
                    setCropOffsetY(dragStart.offsetY + deltaY);
                }
            },
            onPanResponderRelease: () => {
                if (activeHandleRef.current === 'move') {
                    console.log('Frame drag ended');
                    setIsDragging(false);
                    setActiveHandle(null);
                }
            },
        })
    ).current;

    // PanResponder для изменения размера через уголки
    const createHandlePanResponder = (handleType: 'tl' | 'tr' | 'bl' | 'br') => {
        return PanResponder.create({
            onStartShouldSetPanResponder: () => true, // Уголки имеют приоритет
            onMoveShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false, // Не позволяем прервать перетаскивание
            onShouldBlockNativeResponder: () => true, // Блокируем нативные жесты
            onPanResponderGrant: (evt) => {
                console.log('Handle drag started:', handleType, 'at', evt.nativeEvent.pageX, evt.nativeEvent.pageY);
                setIsDragging(true);
                setActiveHandle(handleType);
                dragStartRef.current = {
                    x: evt.nativeEvent.pageX,
                    y: evt.nativeEvent.pageY,
                    size: cropSizeRef.current,
                    offsetX: cropOffsetXRef.current,
                    offsetY: cropOffsetYRef.current,
                };
            },
            onPanResponderMove: (evt) => {
                const dragStart = dragStartRef.current;
                const deltaX = evt.nativeEvent.pageX - dragStart.x;
                const deltaY = evt.nativeEvent.pageY - dragStart.y;
                
                // Текущие координаты центра рамки и размер
                const oldCenterX = dragStart.offsetX;
                const oldCenterY = dragStart.offsetY;
                const oldSize = dragStart.size;
                
                // Координаты уголков относительно центра экрана
                // (рамка центрируется в cropOverlay, который центрирован на экране)
                let oldHandleX = 0;
                let oldHandleY = 0;
                let oppositeHandleX = 0;
                let oppositeHandleY = 0;
                
                if (handleType === 'tl') {
                    // Верхний левый угол
                    oldHandleX = oldCenterX - oldSize / 2;
                    oldHandleY = oldCenterY - oldSize / 2;
                    // Противоположный угол - BR (нижний правый)
                    oppositeHandleX = oldCenterX + oldSize / 2;
                    oppositeHandleY = oldCenterY + oldSize / 2;
                } else if (handleType === 'tr') {
                    // Верхний правый угол
                    oldHandleX = oldCenterX + oldSize / 2;
                    oldHandleY = oldCenterY - oldSize / 2;
                    // Противоположный угол - BL (нижний левый)
                    oppositeHandleX = oldCenterX - oldSize / 2;
                    oppositeHandleY = oldCenterY + oldSize / 2;
                } else if (handleType === 'bl') {
                    // Нижний левый угол
                    oldHandleX = oldCenterX - oldSize / 2;
                    oldHandleY = oldCenterY + oldSize / 2;
                    // Противоположный угол - TR (верхний правый)
                    oppositeHandleX = oldCenterX + oldSize / 2;
                    oppositeHandleY = oldCenterY - oldSize / 2;
                } else if (handleType === 'br') {
                    // Нижний правый угол
                    oldHandleX = oldCenterX + oldSize / 2;
                    oldHandleY = oldCenterY + oldSize / 2;
                    // Противоположный угол - TL (верхний левый)
                    oppositeHandleX = oldCenterX - oldSize / 2;
                    oppositeHandleY = oldCenterY - oldSize / 2;
                }
                
                // Новая позиция перетаскиваемого уголка
                const newHandleX = oldHandleX + deltaX;
                const newHandleY = oldHandleY + deltaY;
                
                // Вычисляем новый размер и центр так, чтобы противоположный угол оставался на месте
                // Для квадратной рамки используем диагональное расстояние между уголками
                const dx = oppositeHandleX - newHandleX;
                const dy = oppositeHandleY - newHandleY;
                const diagonalDistance = Math.sqrt(dx * dx + dy * dy);
                
                // Для квадратной рамки размер = диагональ / sqrt(2)
                const newSize = Math.max(150, Math.min(400, diagonalDistance / Math.sqrt(2)));
                
                // Вычисляем новый центр так, чтобы противоположный угол оставался точно на месте
                let finalCenterX = 0;
                let finalCenterY = 0;
                
                if (handleType === 'tl') {
                    // BR (нижний правый) остается на месте
                    finalCenterX = oppositeHandleX - newSize / 2;
                    finalCenterY = oppositeHandleY - newSize / 2;
                } else if (handleType === 'tr') {
                    // BL (нижний левый) остается на месте
                    finalCenterX = oppositeHandleX + newSize / 2;
                    finalCenterY = oppositeHandleY - newSize / 2;
                } else if (handleType === 'bl') {
                    // TR (верхний правый) остается на месте
                    finalCenterX = oppositeHandleX - newSize / 2;
                    finalCenterY = oppositeHandleY + newSize / 2;
                } else if (handleType === 'br') {
                    // TL (верхний левый) остается на месте
                    finalCenterX = oppositeHandleX + newSize / 2;
                    finalCenterY = oppositeHandleY + newSize / 2;
                }
                
                setCropSize(newSize);
                setCropOffsetX(finalCenterX);
                setCropOffsetY(finalCenterY);
            },
            onPanResponderRelease: () => {
                console.log('Handle drag ended:', handleType);
                setIsDragging(false);
                setActiveHandle(null);
            },
        });
    };

    const tlHandlePanResponder = useRef(createHandlePanResponder('tl')).current;
    const trHandlePanResponder = useRef(createHandlePanResponder('tr')).current;
    const blHandlePanResponder = useRef(createHandlePanResponder('bl')).current;
    const brHandlePanResponder = useRef(createHandlePanResponder('br')).current;

    useEffect(() => {
        if (capturedImage) {
            console.log('CropScreen: Loading image from:', capturedImage);
            // Image.getSize может дать неправильные размеры из-за EXIF ориентации
            // Поэтому будем использовать размеры из onLoad, которые более точные
            Image.getSize(capturedImage, (width, height) => {
                console.log('CropScreen: Image.getSize (may be incorrect due to EXIF):', width, height);
                // Не устанавливаем imageSize здесь - подождем onLoad для правильных размеров
            }, (error) => {
                console.error('Error getting image size:', error);
            });
        } else {
            console.warn('CropScreen: No capturedImage provided');
        }
    }, [capturedImage]);

    if (!capturedImage) {
        navigation.navigate('NewCameraScreen' as never, { replace: true } as never);
        return null;
    }

    // Вычисляем размеры и позицию изображения для центрирования
    // Изображение уже квадратное (1:1) после обрезки в CameraScreen
    const getImageStyle = () => {
        if (imageSize.width === 0 || imageSize.height === 0 || containerSize.width === 0 || containerSize.height === 0) {
            return {
                width: '100%',
                height: '100%',
                left: 0,
                top: 0,
            };
        }

        // Для квадратного изображения используем минимальную сторону контейнера
        const minSide = Math.min(containerSize.width, containerSize.height);
        const size = minSide * zoom;
        
        // Центрируем изображение
        const left = (containerSize.width - size) / 2;
        const top = (containerSize.height - size) / 2;
        
        return {
            width: size,
            height: size,
            left,
            top,
        };
    };

    const imageStyle = getImageStyle();

    const handleBack = () => {
        navigation.navigate('NewCameraScreen' as never, { imagesQueue, analysisMode, plantName, plantId, replace: true } as never);
    };

    const handleConfirm = async () => {
        try {
            if (imageSize.width === 0 || imageSize.height === 0) {
                Alert.alert(t('error_title'), t('crop_error_image_size'));
                return;
            }

            if (containerSize.width === 0 || containerSize.height === 0) {
                Alert.alert(t('error_title'), t('crop_error_wait_loading'));
                return;
            }

            // Получаем абсолютные координаты изображения и рамки для правильного расчета
            await new Promise<void>((resolve, reject) => {
                if (!imageWrapperRef.current || !cropFrameRef.current) {
                    Alert.alert(t('error_title'), t('crop_error_position'));
                    resolve();
                    return;
                }
                
                // Получаем абсолютные координаты контейнера изображения
                imageWrapperRef.current.measure((containerFx, containerFy, containerFwidth, containerFheight, containerPx, containerPy) => {
                    // Получаем абсолютные координаты рамки кадрирования
                    cropFrameRef.current?.measure((frameFx, frameFy, frameFwidth, frameFheight, framePx, framePy) => {
                        // Размеры отображаемого изображения (из imageStyle)
                        const displayedImageSize = imageStyle.width as number;
                        const displayedImageLeft = imageStyle.left as number;
                        const displayedImageTop = imageStyle.top as number;
                        
                        // Абсолютная позиция изображения на экране
                        const imageAbsoluteLeft = containerPx + displayedImageLeft;
                        const imageAbsoluteTop = containerPy + displayedImageTop;
                        
                        // Центр изображения на экране
                        const imageCenterScreenX = imageAbsoluteLeft + displayedImageSize / 2;
                        const imageCenterScreenY = imageAbsoluteTop + displayedImageSize / 2;
                        
                        // Центр рамки кадрирования на экране
                        const cropFrameCenterScreenX = framePx + frameFwidth / 2;
                        const cropFrameCenterScreenY = framePy + frameFheight / 2;
                        
                        // Смещение центра рамки относительно центра изображения
                        const offsetFromImageCenterX = cropFrameCenterScreenX - imageCenterScreenX;
                        const offsetFromImageCenterY = cropFrameCenterScreenY - imageCenterScreenY;
                        
                        // Масштаб: размер изображения на экране к реальному размеру изображения
                        // Изображение квадратное, поэтому масштаб одинаковый по обеим осям
                        const scale = imageSize.width / displayedImageSize;
                        
                        // Конвертируем смещение в координаты изображения
                        const offsetInImageX = offsetFromImageCenterX * scale;
                        const offsetInImageY = offsetFromImageCenterY * scale;
                        
                        // Центр изображения в координатах изображения
                        const imageCenterX = imageSize.width / 2;
                        const imageCenterY = imageSize.height / 2;
                        
                        // Положение центра квадрата обрезки на изображении
                        const cropCenterX = imageCenterX + offsetInImageX;
                        const cropCenterY = imageCenterY + offsetInImageY;
                        
                        // Размер квадрата обрезки в координатах изображения
                        const cropSizeInImage = frameFwidth * scale;
                        
                        // Позиция верхнего левого угла области обрезки
                        const cropX = cropCenterX - cropSizeInImage / 2;
                        const cropY = cropCenterY - cropSizeInImage / 2;
                        
                        // Ограничиваем область обрезки границами изображения
                        let finalCropX = Math.max(0, Math.min(cropX, imageSize.width - cropSizeInImage));
                        let finalCropY = Math.max(0, Math.min(cropY, imageSize.height - cropSizeInImage));
                        
                        // Убеждаемся, что размер не превышает доступное пространство
                        const finalCropSize = Math.min(
                            cropSizeInImage,
                            imageSize.width - finalCropX,
                            imageSize.height - finalCropY
                        );
                        
                        console.log('Crop calculation:', {
                            imageSize,
                            containerSize,
                            displayedImageSize,
                            displayedImagePosition: { left: displayedImageLeft, top: displayedImageTop },
                            imageAbsolutePosition: { left: imageAbsoluteLeft, top: imageAbsoluteTop },
                            cropFrameAbsolutePosition: { x: framePx, y: framePy, width: frameFwidth, height: frameFheight },
                            scale,
                            offsetInImage: { x: offsetInImageX, y: offsetInImageY },
                            cropCenter: { x: cropCenterX, y: cropCenterY },
                            cropSizeInImage,
                            cropRegion: {
                                x: finalCropX,
                                y: finalCropY,
                                width: finalCropSize,
                                height: finalCropSize
                            }
                        });
                        
                        if (finalCropSize <= 0) {
                            Alert.alert(t('error_title'), t('crop_error_invalid_size'));
                            resolve();
                            return;
                        }
                        
                        ImageManipulator.manipulateAsync(
                            capturedImage,
                            [
                                {
                                    crop: {
                                        originX: Math.round(finalCropX),
                                        originY: Math.round(finalCropY),
                                        width: Math.round(finalCropSize),
                                        height: Math.round(finalCropSize),
                                    },
                                },
                                { resize: { width: 1024 } },
                            ],
                            { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
                        ).then((manipResult) => {
                            console.log('Crop completed successfully');
                            setCurrentCroppedUrl(manipResult.uri);
                            setShowPreviewModal(true);
                            resolve();
                        }).catch((e) => {
                            console.error('Cropping failed', e);
                            Alert.alert(t('error_title'), t('crop_image_process_error'));
                            resolve();
                        });
                    });
                });
            });
        } catch (e) {
            console.error('handleConfirm error:', e);
            Alert.alert(t('error_title'), t('crop_image_process_error'));
        }
    };

    const handleAddMore = () => {
        if (currentCroppedUrl) {
            const newQueue = [...imagesQueue, currentCroppedUrl];
            navigation.navigate('NewCameraScreen' as never, { imagesQueue: newQueue, analysisMode, plantName, plantId, replace: true } as never);
        }
    };

    const handleStartProcessing = () => {
        if (currentCroppedUrl) {
            // Передаем обрезанное изображение как основной параметр image
            // Это гарантирует, что именно обрезанная область будет использована для сканирования
            console.log('Starting processing with cropped image:', currentCroppedUrl.substring(0, 50) + '...');
            
            if (analysisMode === 'water') {
                navigation.navigate('WaterCalculator' as never, { image: currentCroppedUrl, analysisMode } as never);
                return;
            }

            navigation.navigate('Processing' as never, { 
                image: currentCroppedUrl, // Обрезанное изображение - приоритет
                imagesQueue: imagesQueue, // Очередь для дополнительных изображений (если нужно)
                analysisMode,
                plantName,
                plantId
            } as never);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: '#0a0a0a' }]}>
            <View style={[styles.header, { backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.6)', borderBottomColor: colors.borderLight }]}>
                <Pressable onPress={handleBack} style={[styles.headerButton, { backgroundColor: colors.surface }]}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </Pressable>
                <View style={styles.headerTitle}>
                    <Text style={[styles.headerTitleText, { color: colors.text }]}>{t('crop_title')}</Text>
                </View>
                <Pressable onPress={() => { setZoom(1); setCropSize(300); setCropOffsetX(0); setCropOffsetY(0); }} style={[styles.headerButton, { backgroundColor: colors.surface }]}>
                    <Ionicons name="refresh" size={24} color={colors.text} />
                </Pressable>
            </View>

            <View style={styles.imageContainer}>
                <View 
                    ref={imageWrapperRef} 
                    style={styles.imageWrapper}
                    onLayout={(e) => {
                        const { width, height } = e.nativeEvent.layout;
                        setContainerSize({ width, height });
                    }}
                >
                    <Image 
                        source={{ uri: capturedImage }} 
                        style={[
                            styles.image,
                            imageStyle
                        ]}
                        resizeMode="cover"
                        onLoad={(e) => {
                            const { width, height } = e.nativeEvent.source;
                            setImageSize({ width, height });
                            console.log('CropScreen: Image onLoad source size:', width, height);
                        }}
                        onLayout={(e) => {
                            const { x, y, width, height } = e.nativeEvent.layout;
                            setImageLayout({ x, y, width, height });
                            console.log('CropScreen: Image layout:', { x, y, width, height });
                        }}
                        onError={(error) => {
                            console.error('CropScreen: Image load error:', error);
                            Alert.alert(t('error_title'), t('crop_image_load_error'));
                        }}
                    />
                </View>
                <View style={styles.cropOverlay}>
                    {/* Рамка кадрирования с уголками */}
                    <View 
                        ref={cropFrameRef}
                        style={[
                            styles.cropFrameContainer,
                            { 
                                width: cropSize, 
                                height: cropSize,
                                transform: [{ translateX: cropOffsetX }, { translateY: cropOffsetY }]
                            }
                        ]}
                    >
                        {/* Рамка кадрирования */}
                        <View 
                            style={styles.cropFrame}
                            {...framePanResponder.panHandlers}
                        />
                        {/* Углы кадрирования (L-образные) */}
                        <View style={[styles.cropHandle, styles.cropHandleTL]} {...tlHandlePanResponder.panHandlers}>
                            <View style={styles.cornerWrap}><View style={[styles.cornerBar, styles.cornerBarH, styles.cornerTLH]} /><View style={[styles.cornerBar, styles.cornerBarV, styles.cornerTLV]} /></View>
                        </View>
                        <View style={[styles.cropHandle, styles.cropHandleTR]} {...trHandlePanResponder.panHandlers}>
                            <View style={styles.cornerWrap}><View style={[styles.cornerBar, styles.cornerBarH, styles.cornerTRH]} /><View style={[styles.cornerBar, styles.cornerBarV, styles.cornerTRV]} /></View>
                        </View>
                        <View style={[styles.cropHandle, styles.cropHandleBL]} {...blHandlePanResponder.panHandlers}>
                            <View style={styles.cornerWrap}><View style={[styles.cornerBar, styles.cornerBarH, styles.cornerBLH]} /><View style={[styles.cornerBar, styles.cornerBarV, styles.cornerBLV]} /></View>
                        </View>
                        <View style={[styles.cropHandle, styles.cropHandleBR]} {...brHandlePanResponder.panHandlers}>
                            <View style={styles.cornerWrap}><View style={[styles.cornerBar, styles.cornerBarH, styles.cornerBRH]} /><View style={[styles.cornerBar, styles.cornerBarV, styles.cornerBRV]} /></View>
                        </View>
                    </View>
                </View>
            </View>

            <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.borderLight }]}>
                <View style={styles.zoomContainer}>
                    <Ionicons name="remove" size={18} color={colors.textMuted} />
                    <Slider
                        style={styles.slider}
                        minimumValue={1}
                        maximumValue={3}
                        step={0.1}
                        value={zoom}
                        onValueChange={setZoom}
                        minimumTrackTintColor={colors.primary}
                        maximumTrackTintColor={theme === 'dark' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.2)'}
                        thumbTintColor={colors.primary}
                    />
                    <Ionicons name="add" size={18} color={colors.textMuted} />
                </View>


                <Pressable
                    onPress={handleConfirm}
                    style={[styles.confirmButton, { backgroundColor: colors.primary }]}
                >
                    <Ionicons name="checkmark" size={22} color="#ffffff" />
                    <Text style={styles.confirmButtonText}>{t('crop_confirm')}</Text>
                </Pressable>
            </View>

            {/* Модальное окно предпросмотра обрезанного изображения */}
            <Modal
                visible={showPreviewModal}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowPreviewModal(false)}
            >
                <View style={styles.previewModalOverlay}>
                    <View style={[styles.previewModalContent, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                        <View style={[styles.previewHeader, { borderBottomColor: colors.borderLight }]}>
                            <Text style={[styles.previewTitle, { color: colors.text }]}>{t('crop_preview_title')}</Text>
                            <Pressable onPress={() => setShowPreviewModal(false)} style={[styles.previewCloseButton, { backgroundColor: colors.surface }]}>
                                <Ionicons name="close" size={24} color={colors.text} />
                            </Pressable>
                        </View>
                        {currentCroppedUrl && (
                            <Image 
                                source={{ uri: currentCroppedUrl }} 
                                style={styles.previewImage}
                                resizeMode="contain"
                            />
                        )}
                        <View style={styles.previewButtons}>
                            <Pressable 
                                onPress={() => {
                                    setShowPreviewModal(false);
                                    handleBack();
                                }} 
                                style={[styles.previewButtonSecondary, { backgroundColor: colors.surface }]}
                            >
                                <Text style={[styles.previewButtonSecondaryText, { color: colors.text }]}>{t('delete_cancel')}</Text>
                            </Pressable>
                            <Pressable 
                                onPress={() => {
                                    setShowPreviewModal(false);
                                    if (currentCroppedUrl) {
                                        if (analysisMode === 'gallery' && plantId) {
                                            navigation.navigate('PlantDetail' as never, { plantId, croppedImage: currentCroppedUrl, replace: true } as never);
                                            return;
                                        }
                                        if (analysisMode === 'water') {
                                            navigation.navigate('WaterCalculator' as never, { image: currentCroppedUrl, analysisMode } as never);
                                            return;
                                        }
                                        navigation.navigate('Processing' as never, { 
                                            image: currentCroppedUrl,
                                            imagesQueue: imagesQueue,
                                            analysisMode,
                                            plantName,
                                            plantId
                                        } as never);
                                    }
                                }} 
                                style={[styles.previewButtonPrimary, { backgroundColor: colors.primary }]}
                            >
                                <Ionicons name="checkmark" size={18} color="#ffffff" />
                                <Text style={styles.previewButtonPrimaryText}>{t('crop_send_to_scan')}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={showChoiceModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowChoiceModal(false)}
            >
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                        <View style={[styles.modalIcon, { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)' }]}>
                            <MaterialIcons name="image" size={32} color={colors.primary} />
                        </View>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>{t('crop_photo_captured')}</Text>
                        <Text style={[styles.modalText, { color: colors.textSecondary }]}>
                            {t('crop_photo_captured_hint')}
                        </Text>
                        <View style={styles.modalButtons}>
                            <Pressable onPress={handleAddMore} style={[styles.modalButtonSecondary, { backgroundColor: colors.surface }]}>
                                <Ionicons name="add" size={18} color={colors.text} />
                                <Text style={[styles.modalButtonSecondaryText, { color: colors.text }]}>{t('crop_add_angle')}</Text>
                            </Pressable>
                            <Pressable onPress={handleStartProcessing} style={[styles.modalButtonPrimary, { backgroundColor: colors.primary }]}>
                                <Ionicons name="search" size={18} color="#ffffff" />
                                <Text style={styles.modalButtonPrimaryText}>{t('crop_start_analysis')} ({imagesQueue.length + 1})</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor применяется через inline стили (всегда темный для камеры)
    },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        paddingTop: 60,
        zIndex: 30,
        borderBottomWidth: 1,
        // backgroundColor и borderBottomColor применяются через inline стили
    },
    headerButton: {
        padding: 12,
        borderRadius: 9999,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    headerTitle: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 9999,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    headerTitleText: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#ffffff',
    },
    imageContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 120,
        paddingBottom: 220,
        paddingHorizontal: 16,
        backgroundColor: '#000000',
    },
    imageWrapper: {
        width: '100%',
        flex: 1,
        position: 'relative',
    },
    image: {
        position: 'absolute',
    },
    cropOverlay: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cropFrameContainer: {
        position: 'relative',
    },
    cropFrame: {
        width: '100%',
        height: '100%',
        borderWidth: 2,
        borderColor: '#10b981',
        borderRadius: 8,
        borderStyle: 'dashed',
        backgroundColor: 'transparent', // Прозрачный фон для области касания
    },
    cropHandle: {
        position: 'absolute',
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backgroundColor: 'transparent',
    },
    cornerWrap: {
        position: 'absolute',
        width: 44,
        height: 44,
        left: 0,
        top: 0,
    },
    cornerBar: {
        position: 'absolute',
        backgroundColor: '#10b981',
        borderColor: '#ffffff',
        borderWidth: 2,
    },
    cornerBarH: { height: 4 },
    cornerBarV: { width: 4 },
    cornerTLH: { left: 0, top: 21, width: 22 },
    cornerTLV: { left: 21, top: 0, height: 22 },
    cornerTRH: { left: 22, top: 21, width: 22 },
    cornerTRV: { left: 21, top: 0, height: 22 },
    cornerBLH: { left: 0, top: 21, width: 22 },
    cornerBLV: { left: 21, top: 22, height: 22 },
    cornerBRH: { left: 22, top: 21, width: 22 },
    cornerBRV: { left: 21, top: 22, height: 22 },
    cropHandleTL: { top: -22, left: -22 },
    cropHandleTR: { top: -22, right: -22 },
    cropHandleBL: { bottom: -22, left: -22 },
    cropHandleBR: { bottom: -22, right: -22 },
    cropSizeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        padding: 12,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: 12,
    },
    cropPositionContainer: {
        gap: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        padding: 12,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: 16,
    },
    cropPositionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cropPositionLabel: {
        fontSize: 10,
        fontWeight: '900',
        color: '#9ca3af',
        width: 16,
        textAlign: 'center',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 32,
        borderTopWidth: 1,
        // backgroundColor и borderTopColor применяются через inline стили
        paddingBottom: 40,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        zIndex: 30,
    },
    zoomContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        padding: 12,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: 24,
    },
    slider: {
        flex: 1,
        height: 6,
    },
    confirmButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        // backgroundColor применяется через inline стили
        paddingVertical: 16,
        borderRadius: 24,
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    confirmButtonText: {
        fontSize: 18,
        fontWeight: '900',
        color: '#ffffff',
    },
    previewModalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        // backgroundColor применяется через inline стили
    },
    previewModalContent: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    previewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        // borderBottomColor применяется через inline стили
    },
    previewTitle: {
        fontSize: 18,
        fontWeight: '700',
        // color применяется через inline стили
    },
    previewCloseButton: {
        padding: 4,
        borderRadius: 9999,
        // backgroundColor применяется через inline стили
    },
    previewImage: {
        width: '100%',
        height: 400,
        backgroundColor: '#000000',
    },
    previewButtons: {
        flexDirection: 'row',
        gap: 12,
        padding: 20,
    },
    previewButtonSecondary: {
        flex: 1,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        // backgroundColor применяется через inline стили
    },
    previewButtonSecondaryText: {
        fontSize: 14,
        fontWeight: '600',
        // color применяется через inline стили
    },
    previewButtonPrimary: {
        flex: 1,
        flexDirection: 'row',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        // backgroundColor применяется через inline стили
    },
    previewButtonPrimaryText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ffffff',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'flex-end',
        padding: 24,
    },
    modalContent: {
        backgroundColor: '#1e221f',
        borderRadius: 40,
        padding: 32,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
    },
    modalIcon: {
        width: 64,
        height: 64,
        borderRadius: 9999,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        // backgroundColor применяется через inline стили
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: '900',
        marginBottom: 8,
        // color применяется через inline стили
    },
    modalText: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 32,
        // color применяется через inline стили
    },
    modalButtons: {
        width: '100%',
        gap: 12,
    },
    modalButtonSecondary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingVertical: 16,
        borderRadius: 24,
        borderWidth: 1,
        // backgroundColor, borderColor и color применяются через inline стили
    },
    modalButtonSecondaryText: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    modalButtonPrimary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingVertical: 20,
        borderRadius: 24,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
        // backgroundColor и shadowColor применяются через inline стили
    },
    modalButtonPrimaryText: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 3.2,
        color: '#ffffff',
    },
});

export default CropScreen;
