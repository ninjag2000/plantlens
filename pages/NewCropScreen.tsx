import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Alert, PanResponder } from 'react-native';
import Slider from '@react-native-community/slider';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useI18n } from '../hooks/useI18n';
import { getThemeColors } from '../utils/themeColors';

const NewCropScreen: React.FC = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { theme } = useTheme();
    const { t } = useI18n();
    const colors = getThemeColors(theme);
    const params = (route.params as any) || {};
    const { image: capturedImage, analysisMode, plantId, plantName, imagesQueue = [] } = params;

    const [normalizedUri, setNormalizedUri] = useState<string | null>(null);
    const [normalizedDimensions, setNormalizedDimensions] = useState<{ width: number; height: number } | null>(null);
    const [zoom, setZoom] = useState(1);
    const [cropSize, setCropSize] = useState(300);
    const [cropOffsetX, setCropOffsetX] = useState(0);
    const [cropOffsetY, setCropOffsetY] = useState(0);
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    const [imagePixelSize, setImagePixelSize] = useState<{ width: number; height: number } | null>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [isConfirming, setIsConfirming] = useState(false);
    const imageWrapperRef = useRef<View>(null);
    const cropFrameRef = useRef<View>(null);
    const [activeHandle, setActiveHandle] = useState<string | null>(null);

    const cropSizeRef = useRef(cropSize);
    const cropOffsetXRef = useRef(cropOffsetX);
    const cropOffsetYRef = useRef(cropOffsetY);
    const dragStartRef = useRef({ x: 0, y: 0, size: 300, offsetX: 0, offsetY: 0 });
    const activeHandleRef = useRef<string | null>(null);
    const displayLayoutRef = useRef({ dispW: 0, dispH: 0, left: 0, top: 0 });
    const imageLayoutRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
    const cropBoundsRef = useRef({ minOffsetX: -Infinity, maxOffsetX: Infinity, minOffsetY: -Infinity, maxOffsetY: Infinity });
    const cropBoundsLayoutRef = useRef({ imgLeft: 0, imgTop: 0, dispW: 0, dispH: 0, cw: 0, ch: 0 });

    useEffect(() => { cropSizeRef.current = cropSize; }, [cropSize]);
    useEffect(() => { cropOffsetXRef.current = cropOffsetX; }, [cropOffsetX]);
    useEffect(() => { cropOffsetYRef.current = cropOffsetY; }, [cropOffsetY]);
    useEffect(() => { activeHandleRef.current = activeHandle; }, [activeHandle]);

    useEffect(() => {
        if (!capturedImage) return;
        ImageManipulator.manipulateAsync(capturedImage, [], { compress: 1, format: ImageManipulator.SaveFormat.JPEG })
            .then((r) => {
                setNormalizedUri(r.uri);
                setNormalizedDimensions(r.width && r.height ? { width: r.width, height: r.height } : null);
            })
            .catch(() => {
                setNormalizedUri(capturedImage);
                setNormalizedDimensions(null);
            });
    }, [capturedImage]);

    useEffect(() => {
        if (!normalizedUri || normalizedDimensions) return;
        Image.getSize(
            normalizedUri,
            (width, height) => setImagePixelSize({ width, height }),
            () => setImagePixelSize(null)
        );
    }, [normalizedUri, normalizedDimensions]);

    const displayUri = normalizedUri ?? capturedImage;

    const framePanResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => !activeHandleRef.current,
            onMoveShouldSetPanResponder: (_, g) => (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2) && !activeHandleRef.current,
            onPanResponderGrant: (evt) => {
                if (!activeHandleRef.current) {
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
                    const d = dragStartRef.current;
                    const b = cropBoundsRef.current;
                    const rawX = d.offsetX + evt.nativeEvent.pageX - d.x;
                    const rawY = d.offsetY + evt.nativeEvent.pageY - d.y;
                    setCropOffsetX(Math.max(b.minOffsetX, Math.min(b.maxOffsetX, rawX)));
                    setCropOffsetY(Math.max(b.minOffsetY, Math.min(b.maxOffsetY, rawY)));
                }
            },
            onPanResponderRelease: () => {
                if (activeHandleRef.current === 'move') setActiveHandle(null);
            },
        })
    ).current;

    const createHandlePanResponder = (handleType: 'tl' | 'tr' | 'bl' | 'br') =>
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: (evt) => {
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
                const d = dragStartRef.current;
                const oldCenterX = d.offsetX;
                const oldCenterY = d.offsetY;
                const oldSize = d.size;
                let oldHandleX = 0, oldHandleY = 0, oppositeHandleX = 0, oppositeHandleY = 0;
                if (handleType === 'tl') {
                    oldHandleX = oldCenterX - oldSize / 2; oldHandleY = oldCenterY - oldSize / 2;
                    oppositeHandleX = oldCenterX + oldSize / 2; oppositeHandleY = oldCenterY + oldSize / 2;
                } else if (handleType === 'tr') {
                    oldHandleX = oldCenterX + oldSize / 2; oldHandleY = oldCenterY - oldSize / 2;
                    oppositeHandleX = oldCenterX - oldSize / 2; oppositeHandleY = oldCenterY + oldSize / 2;
                } else if (handleType === 'bl') {
                    oldHandleX = oldCenterX - oldSize / 2; oldHandleY = oldCenterY + oldSize / 2;
                    oppositeHandleX = oldCenterX + oldSize / 2; oppositeHandleY = oldCenterY - oldSize / 2;
                } else {
                    oldHandleX = oldCenterX + oldSize / 2; oldHandleY = oldCenterY + oldSize / 2;
                    oppositeHandleX = oldCenterX - oldSize / 2; oppositeHandleY = oldCenterY - oldSize / 2;
                }
                const newHandleX = oldHandleX + evt.nativeEvent.pageX - d.x;
                const newHandleY = oldHandleY + evt.nativeEvent.pageY - d.y;
                const dx = oppositeHandleX - newHandleX;
                const dy = oppositeHandleY - newHandleY;
                const diagonal = Math.sqrt(dx * dx + dy * dy);
                const newSize = Math.max(150, Math.min(400, diagonal / Math.sqrt(2)));
                let finalCenterX = 0, finalCenterY = 0;
                if (handleType === 'tl') { finalCenterX = oppositeHandleX - newSize / 2; finalCenterY = oppositeHandleY - newSize / 2; }
                else if (handleType === 'tr') { finalCenterX = oppositeHandleX + newSize / 2; finalCenterY = oppositeHandleY - newSize / 2; }
                else if (handleType === 'bl') { finalCenterX = oppositeHandleX - newSize / 2; finalCenterY = oppositeHandleY + newSize / 2; }
                else { finalCenterX = oppositeHandleX + newSize / 2; finalCenterY = oppositeHandleY + newSize / 2; }
                const layout = cropBoundsLayoutRef.current;
                const half = newSize / 2;
                const minOX = layout.imgLeft + half - layout.cw / 2;
                const maxOX = layout.imgLeft + layout.dispW - half - layout.cw / 2;
                const minOY = layout.imgTop + half - layout.ch / 2;
                const maxOY = layout.imgTop + layout.dispH - half - layout.ch / 2;
                setCropSize(newSize);
                setCropOffsetX(Math.max(minOX, Math.min(maxOX, finalCenterX)));
                setCropOffsetY(Math.max(minOY, Math.min(maxOY, finalCenterY)));
            },
            onPanResponderRelease: () => setActiveHandle(null),
        });

    const tlHandle = useRef(createHandlePanResponder('tl')).current;
    const trHandle = useRef(createHandlePanResponder('tr')).current;
    const blHandle = useRef(createHandlePanResponder('bl')).current;
    const brHandle = useRef(createHandlePanResponder('br')).current;

    if (!capturedImage) {
        navigation.navigate('NewCameraScreen' as never, { replace: true } as never);
        return null;
    }
    if (!normalizedUri && !imageSize.width) {
        return (
            <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={s.title}>{t('camera_loading')}</Text>
            </View>
        );
    }

    // Размеры файла для отображения и crop — приоритет у результата нормализации (как у ImageManipulator)
    const sizeForLayout = (normalizedDimensions ?? imagePixelSize ?? imageSize);
    const getImageStyle = () => {
        if (sizeForLayout.width === 0 || sizeForLayout.height === 0 || containerSize.width === 0 || containerSize.height === 0) {
            return { width: '100%' as const, height: '100%' as const, left: 0, top: 0 };
        }
        const scale = Math.min(containerSize.width / sizeForLayout.width, containerSize.height / sizeForLayout.height) * zoom;
        const displayedWidth = sizeForLayout.width * scale;
        const displayedHeight = sizeForLayout.height * scale;
        return {
            width: displayedWidth,
            height: displayedHeight,
            left: (containerSize.width - displayedWidth) / 2,
            top: (containerSize.height - displayedHeight) / 2,
        };
    };
    const imageStyle = getImageStyle();
    if (typeof imageStyle.width === 'number' && typeof imageStyle.height === 'number' && typeof imageStyle.left === 'number' && typeof imageStyle.top === 'number') {
        displayLayoutRef.current = {
            dispW: imageStyle.width,
            dispH: imageStyle.height,
            left: imageStyle.left,
            top: imageStyle.top,
        };
        const cw = containerSize.width;
        const ch = containerSize.height;
        const half = cropSize / 2;
        const minOX = imageStyle.left + half - cw / 2;
        const maxOX = imageStyle.left + imageStyle.width - half - cw / 2;
        const minOY = imageStyle.top + half - ch / 2;
        const maxOY = imageStyle.top + imageStyle.height - half - ch / 2;
        cropBoundsRef.current = {
            minOffsetX: Math.min(minOX, maxOX),
            maxOffsetX: Math.max(minOX, maxOX),
            minOffsetY: Math.min(minOY, maxOY),
            maxOffsetY: Math.max(minOY, maxOY),
        };
        cropBoundsLayoutRef.current = {
            imgLeft: imageStyle.left,
            imgTop: imageStyle.top,
            dispW: imageStyle.width,
            dispH: imageStyle.height,
            cw,
            ch,
        };
    }

    const isGalleryMode = analysisMode === 'gallery';
    const handleBack = () => {
        if (isGalleryMode) {
            if (plantId) {
                (navigation as any).navigate('PlantDetail', { id: plantId });
            } else {
                (navigation as any).navigate('MainTabs');
            }
        } else {
            navigation.goBack();
        }
    };

    const handleConfirm = async () => {
        if (imageSize.width === 0 || imageSize.height === 0) {
            Alert.alert(t('error_title'), t('crop_error_image_size'));
            return;
        }
        if (containerSize.width === 0 || containerSize.height === 0) {
            Alert.alert(t('error_title'), t('crop_error_wait_loading'));
            return;
        }
        const pixelSize = normalizedDimensions ?? imagePixelSize ?? imageSize;
        if (pixelSize.width <= 0 || pixelSize.height <= 0) {
            Alert.alert(t('error_title'), t('crop_error_image_size'));
            return;
        }
        setIsConfirming(true);
        // pixelSize = размеры из результата нормализации (совпадают с файлом для ImageManipulator)
        // layout считаем по текущему state
        const scale = Math.min(containerSize.width / pixelSize.width, containerSize.height / pixelSize.height) * zoom;
        const dispW = pixelSize.width * scale;
        const dispH = pixelSize.height * scale;
        const imgLeft = (containerSize.width - dispW) / 2;
        const imgTop = (containerSize.height - dispH) / 2;
        const scaleX = pixelSize.width / dispW;
        const scaleY = pixelSize.height / dispH;
        const frameCenterInContainerX = containerSize.width / 2 + cropOffsetX;
        const frameCenterInContainerY = containerSize.height / 2 + cropOffsetY;
        const centerInImageX = (frameCenterInContainerX - imgLeft) * scaleX;
        const centerInImageY = (frameCenterInContainerY - imgTop) * scaleY;
        const frameSizeInImage = Math.min(cropSize * scaleX, cropSize * scaleY);
        const size1to1 = Math.min(frameSizeInImage, pixelSize.width, pixelSize.height);
        let finalCropX = centerInImageX - size1to1 / 2;
        let finalCropY = centerInImageY - size1to1 / 2;
        finalCropX = Math.max(0, Math.min(finalCropX, pixelSize.width - size1to1));
        finalCropY = Math.max(0, Math.min(finalCropY, pixelSize.height - size1to1));
        const finalCropSize = Math.min(size1to1, pixelSize.width - finalCropX, pixelSize.height - finalCropY);

        if (__DEV__) {
            console.log('[Crop]', {
                pixelSize,
                containerSize,
                dispW: dispW.toFixed(0),
                dispH: dispH.toFixed(0),
                imgLeft: imgLeft.toFixed(0),
                imgTop: imgTop.toFixed(0),
                frameCenterX: frameCenterInContainerX.toFixed(0),
                frameCenterY: frameCenterInContainerY.toFixed(0),
                centerInImage: { x: centerInImageX.toFixed(0), y: centerInImageY.toFixed(0) },
                finalCrop: { x: Math.round(finalCropX), y: Math.round(finalCropY), size: Math.round(finalCropSize) },
            });
        }

        if (finalCropSize <= 0) {
            Alert.alert(t('error_title'), t('crop_error_invalid_size'));
            setIsConfirming(false);
            return;
        }

        const uriToCrop = normalizedUri ?? displayUri;
        ImageManipulator.manipulateAsync(
            uriToCrop,
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
        )
            .then((result) => {
                navigation.navigate('NewPreview' as never, {
                    croppedImage: result.uri,
                    analysisMode,
                    imagesQueue,
                    plantName,
                    plantId,
                } as never);
            })
            .catch((e) => {
                console.error(e);
                Alert.alert(t('error_title'), t('crop_image_process_error'));
            })
            .finally(() => setIsConfirming(false));
    };

    return (
        <View style={[s.container, { backgroundColor: '#0a0a0a' }]}>
            <View style={[s.header, { backgroundColor: '#0a0a0a', borderBottomColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)' }]}>
                <Pressable onPress={handleBack} style={({ pressed }) => [s.iconBtn, { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)', borderColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.25)' }, pressed && s.iconBtnPressed]}>
                    <Ionicons name="arrow-back" size={22} color="#fff" />
                </Pressable>
                <View style={[s.headerBadge, { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)', borderColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.25)' }]}>
                    <Ionicons name="crop" size={18} color={colors.primary} style={s.headerBadgeIcon} />
                    <Text style={[s.title, { color: '#fff' }]}>{t('crop_title_1_1')}</Text>
                </View>
                <Pressable
                    onPress={() => { setZoom(1); setCropSize(300); setCropOffsetX(0); setCropOffsetY(0); }}
                    style={({ pressed }) => [s.iconBtn, { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)', borderColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.25)' }, pressed && s.iconBtnPressed]}
                >
                    <Ionicons name="refresh" size={22} color="#fff" />
                </Pressable>
            </View>

            <View style={s.imageContainer}>
                <View
                    ref={imageWrapperRef}
                    style={s.imageWrapper}
                    onLayout={(e) => setContainerSize(e.nativeEvent.layout)}
                >
                    <Image
                        source={{ uri: displayUri }}
                        style={[s.image, imageStyle]}
                        resizeMode="contain"
                        onLayout={(e) => {
                            const { x, y, width, height } = e.nativeEvent.layout;
                            imageLayoutRef.current = { x, y, width, height };
                        }}
                        onLoad={(e) => setImageSize({ width: e.nativeEvent.source.width, height: e.nativeEvent.source.height })}
                        onError={() => Alert.alert(t('error_title'), t('crop_image_load_error'))}
                    />
                    <View style={s.cropOverlay} pointerEvents="box-none">
                        <View
                            ref={cropFrameRef}
                            style={[
                                s.cropFrameContainer,
                                {
                                    width: cropSize,
                                    height: cropSize,
                                    transform: [{ translateX: cropOffsetX }, { translateY: cropOffsetY }],
                                },
                            ]}
                            pointerEvents="auto"
                        >
                            <View style={s.cropFrame} {...framePanResponder.panHandlers} />
                            <View style={[s.handle, s.handleTL]} {...tlHandle.panHandlers}>
                                <View style={s.cornerWrap}><View style={[s.cornerBar, s.cornerBarH, s.cornerTLH]} /><View style={[s.cornerBar, s.cornerBarV, s.cornerTLV]} /></View>
                            </View>
                            <View style={[s.handle, s.handleTR]} {...trHandle.panHandlers}>
                                <View style={s.cornerWrap}><View style={[s.cornerBar, s.cornerBarH, s.cornerTRH]} /><View style={[s.cornerBar, s.cornerBarV, s.cornerTRV]} /></View>
                            </View>
                            <View style={[s.handle, s.handleBL]} {...blHandle.panHandlers}>
                                <View style={s.cornerWrap}><View style={[s.cornerBar, s.cornerBarH, s.cornerBLH]} /><View style={[s.cornerBar, s.cornerBarV, s.cornerBLV]} /></View>
                            </View>
                            <View style={[s.handle, s.handleBR]} {...brHandle.panHandlers}>
                                <View style={s.cornerWrap}><View style={[s.cornerBar, s.cornerBarH, s.cornerBRH]} /><View style={[s.cornerBar, s.cornerBarV, s.cornerBRV]} /></View>
                            </View>
                        </View>
                    </View>
                </View>
            </View>

            <View style={[s.footer, { backgroundColor: '#0a0a0a', borderTopColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)' }]}>
                <View style={s.zoomStrip}>
                    <Ionicons name="remove" size={18} color="rgba(255,255,255,0.7)" />
                    <Slider
                        style={s.slider}
                        minimumValue={1}
                        maximumValue={3}
                        step={0.1}
                        value={zoom}
                        onValueChange={setZoom}
                        minimumTrackTintColor={colors.primary}
                        maximumTrackTintColor="rgba(255,255,255,0.15)"
                        thumbTintColor={colors.primary}
                    />
                    <Ionicons name="add" size={18} color="rgba(255,255,255,0.7)" />
                </View>
                <Pressable
                    onPress={handleConfirm}
                    disabled={isConfirming}
                    style={[s.confirmBtn, { backgroundColor: colors.primary }, isConfirming && s.confirmBtnDisabled]}
                >
                    <Ionicons name="checkmark" size={22} color="#fff" />
                    <Text style={s.confirmBtnText}>{isConfirming ? t('crop_processing') : t('crop_confirm')}</Text>
                </Pressable>
            </View>
        </View>
    );
};

const s = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor применяется через inline стили (всегда темный для камеры)
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 61,
        paddingBottom: 27,
        borderBottomWidth: 1,
        // backgroundColor и borderBottomColor применяются через inline стили
    },
    iconBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        // backgroundColor и borderColor применяются через inline стили
    },
    iconBtnPressed: { opacity: 0.8 },
    headerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    headerBadgeIcon: { opacity: 0.95 },
    title: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.5,
        // color применяется через inline стили
    },
    imageContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 0,
        paddingVertical: 0,
        marginVertical: 0,
        backgroundColor: '#0a0a0a',
    },
    imageWrapper: {
        width: '100%',
        flex: 1,
        position: 'relative',
        backgroundColor: '#0a0a0a',
    },
    image: { position: 'absolute' as const },
    cropOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cropFrameContainer: { position: 'relative' as const },
    cropFrame: {
        width: '100%',
        height: '100%',
        borderWidth: 2,
        borderColor: '#10b981',
        borderRadius: 8,
        borderStyle: 'dashed',
        backgroundColor: 'transparent',
    },
    handle: {
        position: 'absolute',
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
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
        borderColor: '#fff',
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
    handleTL: { top: -22, left: -22 },
    handleTR: { top: -22, right: -22 },
    handleBL: { bottom: -22, left: -22 },
    handleBR: { bottom: -22, right: -22 },
    footer: {
        paddingHorizontal: 24,
        paddingVertical: 27,
        paddingBottom: 53,
        borderTopWidth: 1,
        // backgroundColor и borderTopColor применяются через inline стили
    },
    zoomStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 21,
    },
    slider: { flex: 1, height: 28 },
    confirmBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 21,
        borderRadius: 24,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    confirmBtnDisabled: { opacity: 0.7 },
    confirmBtnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
});

export default NewCropScreen;
