import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/routers';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useI18n } from '../hooks/useI18n';
import { getThemeColors } from '../utils/themeColors';

const NewPreviewScreen: React.FC = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { theme } = useTheme();
    const { t } = useI18n();
    const colors = getThemeColors(theme);
    const params = (route.params as any) || {};
    const { croppedImage, analysisMode, imagesQueue = [], plantName, plantId } = params;

    const goToPlantDetail = (params: { id: string; croppedImage?: string }) => {
        navigation.dispatch(
            CommonActions.reset({
                index: 1,
                routes: [
                    { name: 'MainTabs' },
                    { name: 'PlantDetail', params },
                ],
            })
        );
    };

    const handleBack = () => {
        if (isGalleryMode) {
            if (plantId) {
                goToPlantDetail({ id: plantId });
            } else {
                navigation.dispatch(
                    CommonActions.reset({
                        index: 0,
                        routes: [{ name: 'MainTabs' }],
                    })
                );
            }
        } else {
            navigation.goBack();
        }
    };

    const handleAddMore = () => {
        if (!croppedImage) return;
        const newQueue = [...imagesQueue, croppedImage];
        navigation.navigate('NewCameraScreen' as never, {
            imagesQueue: newQueue,
            analysisMode,
            plantName,
            plantId,
        } as never);
    };

    const handleStartRecognition = () => {
        if (!croppedImage) return;
        const newQueue = [...imagesQueue, croppedImage];
        if (analysisMode === 'water') {
            navigation.navigate('WaterCalculator' as never, { image: croppedImage, analysisMode } as never);
            return;
        }
        navigation.navigate('Processing' as never, {
            image: croppedImage,
            imagesQueue: newQueue,
            analysisMode,
            plantName,
            plantId,
        } as never);
    };

    const handleAddToGallery = () => {
        if (!croppedImage || !plantId) return;
        goToPlantDetail({ id: plantId, croppedImage });
    };

    const isGalleryMode = analysisMode === 'gallery';

    if (!croppedImage) {
        handleBack();
        return null;
    }

    return (
        <View style={[s.container, { backgroundColor: '#0a0a0a' }]}>
            <View style={[s.header, { backgroundColor: '#0a0a0a', borderBottomColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)' }]}>
                <Pressable onPress={handleBack} style={({ pressed }) => [s.iconBtn, { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)', borderColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.25)' }, pressed && s.iconBtnPressed]}>
                    <Ionicons name="arrow-back" size={22} color="#fff" />
                </Pressable>
                <View style={[s.headerBadge, { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)', borderColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.25)' }]}>
                    <Ionicons name="image" size={18} color={colors.primary} style={s.headerBadgeIcon} />
                    <Text style={[s.title, { color: '#fff' }]}>{isGalleryMode ? t('preview_add_to_gallery') : t('preview_title')}</Text>
                </View>
                <View style={s.iconBtnPlaceholder} />
            </View>

            <View style={s.imageArea}>
                <View style={s.imageWrapper}>
                    <Image
                        source={{ uri: croppedImage }}
                        style={s.image}
                        resizeMode="cover"
                    />
                </View>
            </View>

            <View style={[s.footer, { backgroundColor: '#0a0a0a', borderTopColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)' }]}>
                <View style={s.footerContent}>
                {isGalleryMode ? (
                    <>
                        <Text style={[s.footerHint, { color: 'rgba(255,255,255,0.6)' }]}>
                            {t('preview_hint_gallery')}
                        </Text>
                        <Pressable
                            onPress={handleAddMore}
                            style={({ pressed }) => [s.btnSecondary, { backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.1)' }, pressed && s.pressed]}
                        >
                            <Ionicons name="add-circle-outline" size={20} color="#fff" />
                            <Text style={s.btnSecondaryText}>{t('preview_add_more_photos')}</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleAddToGallery}
                            style={({ pressed }) => [s.btnPrimary, { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(16, 185, 129, 0.9)', borderColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(16, 185, 129, 0.4)' }, pressed && s.pressed]}
                        >
                            <Ionicons name="images" size={20} color="#fff" />
                            <Text style={s.btnPrimaryText}>{t('preview_add_to_gallery')}</Text>
                        </Pressable>
                    </>
                ) : (
                    <>
                        <Text style={[s.footerHint, { color: 'rgba(255,255,255,0.6)' }]}>
                            {t('preview_hint_more_or_start')}
                        </Text>
                        <Pressable
                            onPress={handleAddMore}
                            style={({ pressed }) => [s.btnSecondary, { backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.1)' }, pressed && s.pressed]}
                        >
                            <Ionicons name="add-circle-outline" size={20} color="#fff" />
                            <Text style={s.btnSecondaryText}>{t('preview_add_more_photos')}</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleStartRecognition}
                            style={({ pressed }) => [s.btnPrimary, { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(16, 185, 129, 0.9)', borderColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(16, 185, 129, 0.4)' }, pressed && s.pressed]}
                        >
                            <Ionicons name="scan" size={20} color="#fff" />
                            <Text style={s.btnPrimaryText}>{t('preview_start_recognition')}</Text>
                        </Pressable>
                    </>
                )}
                </View>
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
        paddingTop: 56,
        paddingBottom: 32,
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
    iconBtnPlaceholder: { width: 42, height: 42 },
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
    imageArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0a0a0a',
    },
    imageWrapper: {
        width: '100%',
        aspectRatio: 1,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    footer: {
        height: 312,
        paddingHorizontal: 24,
        justifyContent: 'center',
        borderTopWidth: 1,
        // backgroundColor и borderTopColor применяются через inline стили
    },
    footerContent: {},
    footerHint: {
        fontSize: 13,
        textAlign: 'center',
        marginBottom: 16,
        // color применяется через inline стили
    },
    btnSecondary: {
        flexDirection: 'row',
        gap: 10,
        paddingVertical: 18,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        // backgroundColor применяется через inline стили
    },
    btnSecondaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    btnPrimary: {
        flexDirection: 'row',
        gap: 10,
        paddingVertical: 18,
        borderRadius: 24,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        // backgroundColor и borderColor применяются через inline стили
    },
    btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    pressed: { opacity: 0.85 },
});

export default NewPreviewScreen;
