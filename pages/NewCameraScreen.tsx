import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CameraView, CameraType, useCameraPermissions, FlashMode } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useI18n } from '../hooks/useI18n';
import { getThemeColors } from '../utils/themeColors';

const FRAME_SIZE = 244;

const NewCameraScreen: React.FC = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { theme } = useTheme();
    const { t } = useI18n();
    const colors = getThemeColors(theme);
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);

    const params = (route.params as any) || {};
    const { analysisMode = 'diagnosis', imagesQueue = [], plantName, plantId } = params;

    const [facing, setFacing] = useState<CameraType>('back');
    const [flash, setFlash] = useState<FlashMode>('off');
    const [zoom, setZoom] = useState(0);
    const [isCapturing, setIsCapturing] = useState(false);
    const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);

    React.useEffect(() => {
        if (!permission?.granted) requestPermission();
    }, [permission]);

    const goToCrop = (uri: string) => {
        navigation.navigate('NewCropScreen' as never, {
            image: uri,
            imagesQueue,
            analysisMode,
            plantName,
            plantId,
        } as never);
    };

    const goToPreview = (croppedUri: string) => {
        navigation.navigate('NewPreview' as never, {
            croppedImage: croppedUri,
            analysisMode,
            imagesQueue,
            plantName,
            plantId,
        } as never);
    };

    const capturePhoto = async () => {
        if (!cameraRef.current || isCapturing) return;
        setIsCapturing(true);
        try {
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, base64: false });
            if (!photo?.uri) {
                setIsCapturing(false);
                return;
            }
            const photoWidth = photo.width ?? 0;
            const photoHeight = photo.height ?? 0;
            let pw = photoWidth;
            let ph = photoHeight;
            if ((pw <= 0 || ph <= 0) && photo.uri) {
                const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
                    Image.getSize(photo.uri, (w, h) => resolve({ width: w, height: h }), reject);
                }).catch(() => ({ width: 1920, height: 1440 }));
                pw = size.width;
                ph = size.height;
            }
            if (previewSize && pw > 0 && ph > 0) {
                const previewW = previewSize.width;
                const previewH = previewSize.height;
                const scale = Math.max(previewW / pw, previewH / ph);
                const offsetX = (pw - previewW / scale) / 2;
                const offsetY = (ph - previewH / scale) / 2;
                const frameX = (previewW - FRAME_SIZE) / 2;
                const frameY = (previewH - FRAME_SIZE) / 2;
                const originX = Math.max(0, Math.round(offsetX + frameX / scale));
                const originY = Math.max(0, Math.round(offsetY + frameY / scale));
                const cropW = Math.min(pw - originX, Math.round(FRAME_SIZE / scale));
                const cropH = Math.min(ph - originY, Math.round(FRAME_SIZE / scale));
                if (cropW > 0 && cropH > 0) {
                    const cropped = await ImageManipulator.manipulateAsync(
                        photo.uri,
                        [{ crop: { originX, originY, width: cropW, height: cropH } }, { resize: { width: 1024 } }],
                        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
                    );
                    goToPreview(cropped.uri);
                    setIsCapturing(false);
                    return;
                }
            }
            goToCrop(photo.uri);
        } catch (e) {
            console.error(e);
            Alert.alert(t('error_title'), t('camera_capture_failed'));
        } finally {
            setIsCapturing(false);
        }
    };

    const openGallery = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert(t('camera_access_required'), t('camera_gallery_permission'));
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.9,
        });
        if (!result.canceled && result.assets[0]) goToCrop(result.assets[0].uri);
    };

    const toggleFlash = () => setFlash((f) => (f === 'off' ? 'on' : 'off'));
    const flipCamera = () => {
        setFacing((f) => (f === 'back' ? 'front' : 'back'));
        setFlash('off');
    };
    const close = () => navigation.navigate('MainTabs' as never, { screen: 'Home' } as never);

    if (!permission) {
        return (
            <View style={s.container}>
                <Text style={s.loading}>{t('camera_loading')}</Text>
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <View style={s.container}>
                <Text style={s.loading}>{t('camera_no_access')}</Text>
                <Pressable style={s.btn} onPress={() => requestPermission()}>
                    <Text style={s.btnText}>{t('camera_allow')}</Text>
                </Pressable>
                <Pressable style={[s.btn, s.btnSecondary]} onPress={close}>
                    <Text style={s.btnText}>{t('camera_back')}</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={[s.container, { backgroundColor: '#000' }]}>
            <View style={[s.header, { backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.55)', borderBottomColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)' }]}>
                <Pressable onPress={toggleFlash} style={({ pressed }) => [s.iconBtn, { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)', borderColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.25)' }, flash === 'on' && s.iconBtnActive, pressed && s.iconBtnPressed]}>
                    <Ionicons name={flash === 'on' ? 'flash' : 'flash-outline'} size={22} color="#fff" />
                </Pressable>
                <View style={s.headerCenter}>
                    <View style={[s.headerBadge, { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)', borderColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.25)' }]}>
                        <Text style={[s.title, { color: '#fff' }]} numberOfLines={2} ellipsizeMode="tail">
                            {plantName ? plantName : t('camera_title_ai')}
                        </Text>
                    </View>
                </View>
                <Pressable onPress={close} style={({ pressed }) => [s.iconBtn, { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)', borderColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.25)' }, pressed && s.iconBtnPressed]}>
                    <Ionicons name="close" size={22} color="#fff" />
                </Pressable>
            </View>

            {/* Область превью — только между панелями, без наложения */}
            <View
                style={s.previewArea}
                onLayout={(e) => {
                    const { width, height } = e.nativeEvent.layout;
                    if (width > 0 && height > 0) setPreviewSize({ width, height });
                }}
            >
                <CameraView
                    ref={cameraRef}
                    style={s.camera}
                    facing={facing}
                    flash={flash}
                    enableTorch={flash === 'on'}
                    zoom={zoom}
                    mode="picture"
                    ratio="4:3"
                />
                <View style={s.frameOverlay} pointerEvents="none">
                    <View style={[s.frameCorner, s.frameTopLeft]} />
                    <View style={[s.frameCorner, s.frameTopRight]} />
                    <View style={[s.frameCorner, s.frameBottomLeft]} />
                    <View style={[s.frameCorner, s.frameBottomRight]} />
                </View>
            </View>

            <View style={s.zoomStrip}>
                <Ionicons name="remove" size={20} color="rgba(255,255,255,0.7)" />
                <Slider
                    style={s.slider}
                    minimumValue={0}
                    maximumValue={1}
                    value={zoom}
                    onValueChange={setZoom}
                    minimumTrackTintColor="#10b981"
                    maximumTrackTintColor="rgba(255,255,255,0.15)"
                    thumbTintColor="#10b981"
                />
                <Ionicons name="add" size={20} color="rgba(255,255,255,0.7)" />
            </View>

            <View style={s.footer}>
                <Pressable onPress={openGallery} style={({ pressed }) => [s.footerIcon, pressed && s.iconBtnPressed]}>
                    <Ionicons name="images-outline" size={26} color="rgba(255,255,255,0.95)" />
                </Pressable>
                <Pressable
                    onPress={capturePhoto}
                    disabled={isCapturing}
                    style={[s.shutter, isCapturing && s.shutterDisabled]}
                >
                    <View style={s.shutterInner} />
                </Pressable>
                <Pressable onPress={flipCamera} style={({ pressed }) => [s.footerIcon, pressed && s.iconBtnPressed]}>
                    <Ionicons name="camera-reverse-outline" size={26} color="rgba(255,255,255,0.95)" />
                </Pressable>
            </View>
        </View>
    );
};

const s = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor применяется через inline стили (всегда черный для камеры)
    },
    loading: {
        color: '#fff',
        fontSize: 16,
    },
    btn: {
        marginTop: 16,
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#10b981',
        borderRadius: 12,
    },
    btnSecondary: {
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    btnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingTop: 56,
        paddingBottom: 22,
        borderBottomWidth: 1,
        // backgroundColor и borderBottomColor применяются через inline стили
    },
    headerCenter: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 8,
    },
    headerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 14,
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.25)',
        maxWidth: '100%',
    },
    iconBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.25)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconBtnActive: {
        backgroundColor: 'rgba(251, 191, 36, 0.25)',
        borderColor: 'rgba(251, 191, 36, 0.45)',
    },
    iconBtnPressed: {
        opacity: 0.8,
    },
    title: {
        color: 'rgba(255,255,255,0.96)',
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.5,
        textAlign: 'center',
    },
    previewArea: {
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
        marginVertical: 0,
    },
    camera: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    frameOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    frameCorner: {
        position: 'absolute',
        width: 44,
        height: 44,
        borderColor: 'rgba(255, 255, 255, 0.75)',
        borderWidth: 2.5,
    },
    frameTopLeft: {
        top: '50%',
        left: '50%',
        marginTop: -122,
        marginLeft: -122,
        borderRightWidth: 0,
        borderBottomWidth: 0,
        borderTopLeftRadius: 14,
    },
    frameTopRight: {
        top: '50%',
        left: '50%',
        marginTop: -122,
        marginLeft: 78,
        borderLeftWidth: 0,
        borderBottomWidth: 0,
        borderTopRightRadius: 14,
    },
    frameBottomLeft: {
        top: '50%',
        left: '50%',
        marginTop: 78,
        marginLeft: -122,
        borderRightWidth: 0,
        borderTopWidth: 0,
        borderBottomLeftRadius: 14,
    },
    frameBottomRight: {
        top: '50%',
        left: '50%',
        marginTop: 78,
        marginLeft: 78,
        borderLeftWidth: 0,
        borderTopWidth: 0,
        borderBottomRightRadius: 14,
    },
    zoomStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 20,
        gap: 12,
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        borderTopWidth: 0,
        borderTopColor: 'transparent',
    },
    slider: {
        flex: 1,
        height: 28,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 36,
        paddingVertical: 24,
        paddingBottom: 48,
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        borderTopWidth: 0,
        borderTopColor: 'transparent',
    },
    footerIcon: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.25)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    shutter: {
        width: 72,
        height: 72,
        borderRadius: 36,
        borderWidth: 3,
        borderColor: 'rgba(16, 185, 129, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 14,
        elevation: 8,
    },
    shutterDisabled: {
        opacity: 0.7,
    },
    shutterInner: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#fff',
    },
});

export default NewCameraScreen;
