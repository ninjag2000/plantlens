import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Animated, Dimensions, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CameraView, CameraType, useCameraPermissions, FlashMode } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';

type Rect = { x: number; y: number; width: number; height: number };

const CameraScreen: React.FC = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const isOnline = useOnlineStatus();
    const { t } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);
    const cameraContainerRef = useRef<View>(null);
    const scanFrameRef = useRef<View>(null);
    
    const params = (route.params as any) || {};
    const { analysisMode, imagesQueue = [], plantName, plantId } = params;

    const [facing, setFacing] = useState<CameraType>('back');
    const [flash, setFlash] = useState<FlashMode>('off');
    const [isCapturing, setIsCapturing] = useState(false);
    const [showFocus, setShowFocus] = useState(false);
    const scanAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!permission?.granted) {
            requestPermission();
        }
    }, [permission]);

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(scanAnim, {
                    toValue: 1,
                    duration: 4000,
                    useNativeDriver: true,
                }),
                Animated.timing(scanAnim, {
                    toValue: 0,
                    duration: 0,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    const handleFlipCamera = () => {
        setFacing(prev => prev === 'back' ? 'front' : 'back');
        setFlash('off');
    };

    const handleToggleFlash = () => {
        setFlash(prev => prev === 'off' ? 'on' : 'off');
    };

    const goToProcessing = (uri: string) => {
        const newQueue = [...imagesQueue, uri];
        
        if (analysisMode === 'water') {
            navigation.navigate('WaterCalculator' as never, { image: uri, analysisMode } as never);
            return;
        }

        navigation.navigate('Processing' as never, { 
            image: uri,
            imagesQueue: newQueue,
            analysisMode,
            plantName,
            plantId
        } as never);
    };

    const capturePhoto = async () => {
        if (!cameraRef.current || isCapturing) return;
        setIsCapturing(true);
        setShowFocus(true);

        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.9,
                base64: false,
            });

            if (photo?.uri) {
                const imageSize = await new Promise<{ width: number; height: number }>((resolve, reject) => {
                    Image.getSize(photo.uri, (width, height) => resolve({ width, height }), reject);
                });

                let cameraRect: Rect;
                let frameRect: Rect;
                try {
                    [cameraRect, frameRect] = await new Promise<[Rect, Rect]>((resolve, reject) => {
                        if (!cameraContainerRef.current || !scanFrameRef.current) {
                            reject(new Error('Refs not ready'));
                            return;
                        }
                        let cam: Rect | null = null;
                        let fr: Rect | null = null;
                        const check = () => { if (cam && fr) resolve([cam, fr]); };
                        (cameraContainerRef.current as any).measureInWindow((x: number, y: number, w: number, h: number) => {
                            cam = { x, y, width: w, height: h };
                            check();
                        });
                        (scanFrameRef.current as any).measureInWindow((x: number, y: number, w: number, h: number) => {
                            fr = { x, y, width: w, height: h };
                            check();
                        });
                    });
                } catch {
                    const sw = Dimensions.get('window').width;
                    const sh = Dimensions.get('window').height;
                    const fs = Math.min(sw * 0.85, 400);
                    cameraRect = { x: 0, y: 0, width: sw, height: sh };
                    frameRect = { x: (sw - fs) / 2, y: (sh - fs) / 2, width: fs, height: fs };
                }

                // Превью камеры в cameraRect — режим contain (картинка целиком вписана)
                const imageAspect = imageSize.width / imageSize.height;
                const cameraAspect = cameraRect.width / cameraRect.height;
                let previewLeft: number, previewTop: number, previewWidth: number, previewHeight: number;
                let scaleX: number, scaleY: number;
                if (imageAspect > cameraAspect) {
                    previewHeight = cameraRect.height;
                    previewWidth = cameraRect.height * imageAspect;
                    previewLeft = cameraRect.x + (cameraRect.width - previewWidth) / 2;
                    previewTop = cameraRect.y;
                    scaleX = imageSize.width / previewWidth;
                    scaleY = imageSize.height / previewHeight;
                } else {
                    previewWidth = cameraRect.width;
                    previewHeight = cameraRect.width / imageAspect;
                    previewLeft = cameraRect.x;
                    previewTop = cameraRect.y + (cameraRect.height - previewHeight) / 2;
                    scaleX = imageSize.width / previewWidth;
                    scaleY = imageSize.height / previewHeight;
                }

                // Рамка в координатах превью (пиксели на экране → координаты в «превью-пространстве»)
                const frameLeftInPreview = Math.max(0, frameRect.x - previewLeft);
                const frameTopInPreview = Math.max(0, frameRect.y - previewTop);
                const frameRightInPreview = Math.min(previewWidth, frameRect.x + frameRect.width - previewLeft);
                const frameBottomInPreview = Math.min(previewHeight, frameRect.y + frameRect.height - previewTop);
                const frameWInPreview = Math.max(0, frameRightInPreview - frameLeftInPreview);
                const frameHInPreview = Math.max(0, frameBottomInPreview - frameTopInPreview);

                // Рамка и её центр в пикселях фото
                const frameLeftInImage = frameLeftInPreview * scaleX;
                const frameTopInImage = frameTopInPreview * scaleY;
                const frameWInImage = frameWInPreview * scaleX;
                const frameHInImage = frameHInPreview * scaleY;
                const frameCenterXInImage = frameLeftInImage + frameWInImage / 2;
                const frameCenterYInImage = frameTopInImage + frameHInImage / 2;

                const measured = {
                    cameraRect,
                    frameRect,
                    preview: { left: previewLeft, top: previewTop, width: previewWidth, height: previewHeight },
                    scale: { x: scaleX, y: scaleY },
                    frameInPreview: { left: frameLeftInPreview, top: frameTopInPreview, width: frameWInPreview, height: frameHInPreview },
                    frameInImage: { left: frameLeftInImage, top: frameTopInImage, width: frameWInImage, height: frameHInImage },
                    frameCenterInImage: { x: frameCenterXInImage, y: frameCenterYInImage },
                    imageSize,
                };
                // Кроп = ровно область белой рамки (frameInImage). Поправка: превью не contain — сдвигаем вырез вправо и вниз, чтобы не попадала дверь/штора слева.
                const frameCorrectionX = 280;
                const frameCorrectionY = 150;
                const cropW = Math.round(frameWInImage);
                const cropH = Math.round(frameHInImage);
                let originX = Math.round(frameLeftInImage) + frameCorrectionX;
                let originY = Math.round(frameTopInImage) + frameCorrectionY;
                originX = Math.max(0, Math.min(originX, imageSize.width - cropW));
                originY = Math.max(0, Math.min(originY, imageSize.height - cropH));

                console.log('Crop measure:', JSON.stringify({
                    ...measured,
                    frameCorrection: { x: frameCorrectionX, y: frameCorrectionY },
                    cropRegion: { originX, originY, width: cropW, height: cropH },
                }, null, 2));

                const cropped = await ImageManipulator.manipulateAsync(
                    photo.uri,
                    [{ crop: { originX, originY, width: cropW, height: cropH } }],
                    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
                );
                goToProcessing(cropped.uri);
            }
        } catch (error) {
            console.error('Error capturing photo:', error);
            Alert.alert('Ошибка', 'Не удалось сделать фото');
        } finally {
            setIsCapturing(false);
            setShowFocus(false);
        }
    };

    const handleGalleryClick = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Нужен доступ', 'Разрешите доступ к галерее');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.9,
        });

        if (!result.canceled && result.assets[0]) {
            goToProcessing(result.assets[0].uri);
        }
    };

    const handleClose = () => {
        navigation.navigate('MainTabs' as never, { screen: 'Home' } as never);
    };

    const screenWidth = Dimensions.get('window').width;
    const frameWidth = Math.min(screenWidth * 0.85, 400);
    const frameHeight = frameWidth;
    const scanY = scanAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, frameHeight],
    });

    if (!permission) {
        return (
            <View style={styles.container}>
                <Text style={styles.loadingText}>Загрузка...</Text>
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <View style={styles.permissionContainer}>
                <View style={styles.permissionIcon}>
                    <Ionicons name="close-circle" size={32} color="#ef4444" />
                </View>
                <Text style={styles.permissionTitle}>{t('camera_no_permission')}</Text>
                <Text style={styles.permissionText}>Please enable camera access in your browser settings.</Text>
                <Pressable onPress={handleClose} style={styles.permissionButton}>
                    <Text style={styles.permissionButtonText}>{t('camera_back')}</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: '#000000' }]}>
            <View ref={cameraContainerRef} style={styles.cameraContainer}>
                <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing={facing}
                    flash={flash}
                    mode="picture"
                />
            </View>

            <View style={[styles.header, { backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.6)' }]}>
                <Pressable onPress={handleClose} style={[styles.headerButton, { backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.2)' }]}>
                    <Ionicons name="close" size={24} color="#ffffff" />
                </Pressable>
                <View style={styles.headerTitle}>
                    <Text style={[styles.headerTitleText, { color: '#ffffff' }]}>
                        {plantName ? `${plantName.toUpperCase()} :: SCAN` : "AI SCANNER"}
                    </Text>
                    {!isOnline && <Ionicons name="wifi-outline" size={10} color={colors.error} />}
                </View>
                <Pressable 
                    onPress={handleToggleFlash}
                    style={[styles.headerButton, { backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.2)' }, flash === 'on' && styles.flashButtonActive]}
                >
                    {flash === 'on' ? (
                        <Ionicons name="flash" size={24} color="#ffffff" />
                    ) : (
                        <Ionicons name="flash-outline" size={24} color="#ffffff" />
                    )}
                </Pressable>
            </View>

            <View style={styles.scanOverlay}>
                <View ref={scanFrameRef} style={styles.scanFrame}>
                    <View style={[styles.scanCorner, styles.scanCornerTopLeft]} />
                    <View style={[styles.scanCorner, styles.scanCornerTopRight]} />
                    <View style={[styles.scanCorner, styles.scanCornerBottomLeft]} />
                    <View style={[styles.scanCorner, styles.scanCornerBottomRight]} />
                    <Animated.View 
                        style={[
                            styles.scanLine,
                            { transform: [{ translateY: scanY }] }
                        ]}
                    />
                </View>
            </View>

            <View style={[styles.footer, { backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.6)' }]}>
                <Pressable onPress={handleGalleryClick} style={[styles.footerButton, { backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)' }]}>
                    <Ionicons name="images" size={24} color="#ffffff" />
                </Pressable>
                <Pressable 
                    onPress={capturePhoto}
                    disabled={isCapturing}
                    style={[styles.captureButton, { backgroundColor: colors.primary }, isCapturing && styles.captureButtonActive]}
                >
                    <View style={styles.captureButtonInner} />
                </Pressable>
                <Pressable onPress={handleFlipCamera} style={[styles.footerButton, { backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)' }]}>
                    <Ionicons name="camera-reverse" size={24} color="#ffffff" />
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor применяется через inline стили (всегда черный для камеры)
    },
    cameraContainer: {
        flex: 1,
    },
    camera: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: 16,
        paddingTop: 40,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 30,
    },
    headerButton: {
        padding: 12,
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    flashButtonActive: {
        backgroundColor: '#fbbf24',
        borderColor: '#fbbf24',
    },
    headerTitle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 6,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    headerTitleText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#10b981',
    },
    scanOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
        pointerEvents: 'none',
    },
    scanFrame: {
        width: '85%',
        maxWidth: 400,
        aspectRatio: 1,
        position: 'relative',
    },
    scanCorner: {
        position: 'absolute',
        width: 48,
        height: 48,
        borderWidth: 4,
        borderColor: 'rgba(255, 255, 255, 0.8)',
    },
    scanCornerTopLeft: {
        top: 0,
        left: 0,
        borderRightWidth: 0,
        borderBottomWidth: 0,
        borderTopLeftRadius: 16,
    },
    scanCornerTopRight: {
        top: 0,
        right: 0,
        borderLeftWidth: 0,
        borderBottomWidth: 0,
        borderTopRightRadius: 16,
    },
    scanCornerBottomLeft: {
        bottom: 0,
        left: 0,
        borderRightWidth: 0,
        borderTopWidth: 0,
        borderBottomLeftRadius: 16,
    },
    scanCornerBottomRight: {
        bottom: 0,
        right: 0,
        borderLeftWidth: 0,
        borderTopWidth: 0,
        borderBottomRightRadius: 16,
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
        opacity: 0.8,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 32,
        paddingBottom: 40,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        zIndex: 30,
    },
    footerButton: {
        padding: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    captureButton: {
        width: 80,
        height: 80,
        borderRadius: 9999,
        borderWidth: 4,
        borderColor: 'rgba(255, 255, 255, 0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    captureButtonActive: {
        opacity: 0.8,
        transform: [{ scale: 0.95 }],
    },
    captureButtonInner: {
        width: 64,
        height: 64,
        borderRadius: 9999,
        backgroundColor: '#ffffff',
        shadowColor: '#ffffff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 8,
    },
    permissionContainer: {
        flex: 1,
        backgroundColor: '#1e221f',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    permissionIcon: {
        width: 64,
        height: 64,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: 9999,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    permissionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 8,
    },
    permissionText: {
        fontSize: 14,
        color: '#9ca3af',
        textAlign: 'center',
        marginBottom: 24,
    },
    permissionButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 16,
    },
    permissionButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#ffffff',
    },
    loadingText: {
        color: '#ffffff',
        fontSize: 16,
    },
});

export default CameraScreen;
