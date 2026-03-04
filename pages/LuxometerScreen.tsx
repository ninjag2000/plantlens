import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, Animated, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
// Direct import to avoid loading Pedometer (and other sensors) native modules
import LightSensor from 'expo-sensors/build/LightSensor';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

const LuxometerScreen: React.FC = () => {
    const navigation = useNavigation();
    const { t } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const [sensorAvailable, setSensorAvailable] = useState<boolean | null>(null);
    const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
    
    const [lux, setLux] = useState(0);
    const [maxLux, setMaxLux] = useState(0);
    const [showGuide, setShowGuide] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    
    const luxAnim = useRef(new Animated.Value(0)).current;
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        (async () => {
            const available = await LightSensor.isAvailableAsync();
            if (!mountedRef.current) return;
            setSensorAvailable(available);
            if (!available) return;
            const { granted } = await LightSensor.getPermissionsAsync();
            if (!mountedRef.current) return;
            setPermissionGranted(granted);
        })();
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        if (sensorAvailable !== true || permissionGranted !== true) return;
        LightSensor.setUpdateInterval(500);
        const sub = LightSensor.addListener((data) => {
            const val = Math.round(data.illuminance);
            setLux(val);
            setMaxLux(prev => Math.max(prev, val));
            Animated.timing(luxAnim, {
                toValue: val,
                duration: 300,
                useNativeDriver: false,
            }).start();
        });
        return () => sub.remove();
    }, [sensorAvailable, permissionGranted]);

    const handleReset = () => {
        setIsResetting(true);
        setLux(0);
        setMaxLux(0);
        setTimeout(() => setIsResetting(false), 700);
    };

    const handleBack = () => {
        navigation.goBack();
    };

    const getLightVerdict = (val: number): { titleKey: string; descKey: string; adviceKey: string; plantsKey: string; color: string; icon: 'moon' | 'cloud' | 'partly-sunny' | 'sunny' | 'flash' } => {
        if (val < 100) return { titleKey: 'lux_deep_shade', descKey: 'lux_deep_shade_desc', adviceKey: 'lux_deep_shade_advice', plantsKey: 'lux_deep_shade_plants', color: "#6b7280", icon: "moon" };
        if (val < 500) return { titleKey: 'lux_shade', descKey: 'lux_shade_desc', adviceKey: 'lux_shade_advice', plantsKey: 'lux_shade_plants', color: "#60a5fa", icon: "cloud" };
        if (val < 1500) return { titleKey: 'lux_diffused', descKey: 'lux_diffused_desc', adviceKey: 'lux_diffused_advice', plantsKey: 'lux_diffused_plants', color: "#34d399", icon: "partly-sunny" };
        if (val < 3500) return { titleKey: 'lux_bright', descKey: 'lux_bright_desc', adviceKey: 'lux_bright_advice', plantsKey: 'lux_bright_plants', color: "#fbbf24", icon: "sunny" };
        return { titleKey: 'lux_direct_sun', descKey: 'lux_direct_sun_desc', adviceKey: 'lux_direct_sun_advice', plantsKey: 'lux_direct_sun_plants', color: "#fb923c", icon: "flash" };
    };

    const info = getLightVerdict(lux);

    const MAX_GAUGE_VAL = 4000;
    const radius = 100;
    const strokeWidth = 12;
    const normalizedValue = Math.min(lux, MAX_GAUGE_VAL);
    const percent = normalizedValue / MAX_GAUGE_VAL;
    const arcLength = Math.PI * radius;
    const strokeDashoffset = arcLength * (1 - percent);

    const getIconComponent = (iconName: string, size: number, color: string) => {
        switch (iconName) {
            case 'moon':
                return <Ionicons name="moon" size={size} color={color} />;
            case 'cloud':
                return <Ionicons name="cloud" size={size} color={color} />;
            case 'partly-sunny':
                return <Ionicons name="partly-sunny" size={size} color={color} />;
            case 'sunny':
                return <Ionicons name="sunny" size={size} color={color} />;
            case 'flash':
                return <Ionicons name="flash" size={size} color={color} />;
            default:
                return <Ionicons name="sunny" size={size} color={color} />;
        }
    };

    const requestSensorPermission = async () => {
        const { granted } = await LightSensor.requestPermissionsAsync();
        setPermissionGranted(granted);
    };

    if (sensorAvailable === null) {
        return (
            <View style={styles.container}>
                <Text style={styles.loadingText}>{t('lux_loading')}</Text>
            </View>
        );
    }

    if (sensorAvailable === false) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Ionicons name="sunny-outline" size={64} color="#6b7280" style={{ marginBottom: 16 }} />
                <Text style={styles.permissionText}>
                    {Platform.OS === 'android'
                        ? t('lux_sensor_unavailable_android')
                        : t('lux_sensor_unavailable_ios')}
                </Text>
                <Pressable onPress={handleBack} style={styles.permissionButton}>
                    <Text style={styles.permissionButtonText}>{t('lux_back')}</Text>
                </Pressable>
            </View>
        );
    }

    if (sensorAvailable === true && permissionGranted === null) {
        return (
            <View style={styles.container}>
                <Text style={[styles.loadingText, { alignSelf: 'center', marginTop: 80 }]}>{t('lux_checking_sensor')}</Text>
            </View>
        );
    }

    if (permissionGranted === false) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Text style={styles.permissionText}>{t('lux_sensor_permission_required')}</Text>
                <Pressable onPress={requestSensorPermission} style={styles.permissionButton}>
                    <Text style={styles.permissionButtonText}>{t('lux_grant_permission')}</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.contentWrapper}>
                <View style={styles.header}>
                    <Pressable onPress={handleBack} style={styles.headerButton}>
                        <Ionicons name="arrow-back" size={24} color="#ffffff" />
                    </Pressable>
                    <Text style={styles.headerTitle}>{t('lux_header_title')}</Text>
                    <Pressable onPress={() => setShowGuide(true)} style={styles.headerButton}>
                        <Ionicons name="information-circle" size={24} color="#ffffff" />
                    </Pressable>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                    <View style={styles.gaugeContainer}>
                        <Svg width={240} height={140} viewBox="0 0 240 140">
                            <Defs>
                                <LinearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <Stop offset="0%" stopColor="#6b7280" />
                                    <Stop offset="25%" stopColor="#3b82f6" />
                                    <Stop offset="50%" stopColor="#10b981" />
                                    <Stop offset="75%" stopColor="#eab308" />
                                    <Stop offset="100%" stopColor="#f97316" />
                                </LinearGradient>
                            </Defs>
                            <Path
                                d="M 20 120 A 100 100 0 0 1 220 120"
                                fill="none"
                                stroke="#333"
                                strokeWidth={strokeWidth}
                                strokeLinecap="round"
                            />
                            <Path
                                d="M 20 120 A 100 100 0 0 1 220 120"
                                fill="none"
                                stroke="url(#gaugeGradient)"
                                strokeWidth={strokeWidth}
                                strokeLinecap="round"
                                strokeDasharray={arcLength}
                                strokeDashoffset={strokeDashoffset}
                            />
                        </Svg>
                        <View style={styles.gaugeValue}>
                            <Text style={styles.luxValue}>{lux}</Text>
                            <Text style={styles.luxUnit}>lx</Text>
                        </View>
                    </View>

                    <View style={styles.controlsRow}>
                        <View style={styles.peakBox}>
                            <Ionicons name="arrow-up" size={16} color="#9ca3af" />
                            <View>
                                <Text style={styles.peakLabel}>Peak</Text>
                                <Text style={styles.peakValue}>{maxLux}</Text>
                            </View>
                        </View>
                        <Pressable 
                            onPress={handleReset}
                            style={[styles.resetButton, isResetting && styles.resetButtonActive]}
                        >
                            <Ionicons 
                                name="refresh" 
                                size={18} 
                                color={isResetting ? "#ffffff" : "#9ca3af"} 
                            />
                        </Pressable>
                    </View>

                    <View style={[styles.verdictCard, { borderColor: `${info.color}33` }]}>
                        <View style={styles.verdictIcon}>
                            {getIconComponent(info.icon, 120, info.color)}
                        </View>
                        <View style={styles.verdictHeader}>
                            <View style={[styles.verdictIconSmall, { backgroundColor: `${info.color}33` }]}>
                                {getIconComponent(info.icon, 24, info.color)}
                            </View>
                            <View>
                                <Text style={[styles.verdictTitle, { color: info.color }]}>{t(info.titleKey)}</Text>
                                <Text style={styles.verdictSubtitle}>Анализ среды</Text>
                            </View>
                        </View>
                        <ScrollView style={styles.verdictContent}>
                            <Text style={styles.verdictDesc}>{t(info.descKey)}</Text>
                            <View style={styles.adviceBox}>
                                <View style={styles.adviceHeader}>
                                    <Ionicons name="flash" size={14} color="#60a5fa" />
                                    <Text style={styles.adviceLabel}>Совет эксперта</Text>
                                </View>
                                <Text style={styles.adviceText}>{t(info.adviceKey)}</Text>
                            </View>
                            <View style={styles.plantsBox}>
                                <View style={styles.plantsHeader}>
                                    <Ionicons name="leaf" size={14} color="#34d399" />
                                    <Text style={styles.plantsLabel}>Подходит для:</Text>
                                </View>
                                <Text style={styles.plantsText}>{t(info.plantsKey)}</Text>
                            </View>
                        </ScrollView>
                    </View>

                    <Text style={styles.disclaimer}>{t('lux_disclaimer')}</Text>
                </ScrollView>
            </View>

            <Modal
                visible={showGuide}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowGuide(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('lux_how_to_use')}</Text>
                            <Pressable onPress={() => setShowGuide(false)} style={styles.modalClose}>
                                <Ionicons name="close" size={24} color="#9ca3af" />
                            </Pressable>
                        </View>
                        <View style={styles.modalBody}>
                            <View style={styles.modalItem}>
                                <View style={styles.modalItemIcon}>
                                    <Ionicons name="leaf" size={20} color="#60a5fa" />
                                </View>
                                <View>
                                    <Text style={styles.modalItemTitle}>{t('lux_position')}</Text>
                                    <Text style={styles.modalItemText}>{t('lux_position_desc')}</Text>
                                </View>
                            </View>
                            <View style={styles.modalItem}>
                                <View style={styles.modalItemIcon}>
                                    <Ionicons name="sunny" size={20} color="#fbbf24" />
                                </View>
                                <View>
                                    <Text style={styles.modalItemTitle}>{t('lux_shadow')}</Text>
                                    <Text style={styles.modalItemText}>{t('lux_shadow_desc')}</Text>
                                </View>
                            </View>
                            <View style={styles.modalItem}>
                                <View style={styles.modalItemIcon}>
                                    <Ionicons name="warning" size={20} color="#a78bfa" />
                                </View>
                                <View>
                                    <Text style={styles.modalItemTitle}>{t('lux_accuracy')}</Text>
                                    <Text style={styles.modalItemText}>{t('lux_accuracy_desc')}</Text>
                                </View>
                            </View>
                        </View>
                        <Pressable onPress={() => setShowGuide(false)} style={styles.modalButton}>
                            <Text style={styles.modalButtonText}>{t('settings_ok')}</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1e221f',
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    contentWrapper: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        paddingTop: 40,
    },
    headerButton: {
        padding: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 9999,
    },
    headerTitle: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 4.8,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    gaugeContainer: {
        width: 256,
        height: 144,
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginBottom: 16,
        alignSelf: 'center',
    },
    gaugeValue: {
        position: 'absolute',
        bottom: -10,
        alignItems: 'center',
        flexDirection: 'row',
        gap: 4,
    },
    luxValue: {
        fontSize: 48,
        fontWeight: '900',
        fontFamily: 'monospace',
        color: '#ffffff',
        textShadowColor: 'rgba(255, 255, 255, 0.2)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20,
    },
    luxUnit: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#6b7280',
        marginBottom: 8,
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 24,
    },
    peakBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        flex: 1,
    },
    peakLabel: {
        fontSize: 7,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 3.2,
        color: '#6b7280',
    },
    peakValue: {
        fontSize: 14,
        fontWeight: '700',
        fontFamily: 'monospace',
        color: '#ffffff',
    },
    resetButton: {
        padding: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    resetButtonActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    verdictCard: {
        padding: 24,
        borderRadius: 32,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        position: 'relative',
        overflow: 'hidden',
        flex: 1,
    },
    verdictIcon: {
        position: 'absolute',
        top: 24,
        right: 24,
        opacity: 0.03,
    },
    verdictHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 16,
    },
    verdictIconSmall: {
        padding: 12,
        borderRadius: 24,
    },
    verdictTitle: {
        fontSize: 20,
        fontWeight: '900',
        marginBottom: 4,
    },
    verdictSubtitle: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#6b7280',
    },
    verdictContent: {
        flex: 1,
    },
    verdictDesc: {
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 22,
        color: '#e5e7eb',
        marginBottom: 16,
    },
    adviceBox: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 24,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        marginBottom: 16,
    },
    adviceHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    adviceLabel: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#60a5fa',
    },
    adviceText: {
        fontSize: 12,
        fontWeight: '700',
        lineHeight: 20,
        color: '#d1d5db',
    },
    plantsBox: {
        paddingTop: 4,
    },
    plantsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    plantsLabel: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#34d399',
    },
    plantsText: {
        fontSize: 12,
        fontWeight: '700',
        lineHeight: 20,
        color: '#ffffff',
        fontStyle: 'italic',
        opacity: 0.9,
    },
    disclaimer: {
        textAlign: 'center',
        fontSize: 8,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#6b7280',
        marginTop: 16,
        opacity: 0.4,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        justifyContent: 'center',
        padding: 24,
    },
    modalContent: {
        backgroundColor: '#1e221f',
        borderRadius: 40,
        padding: 32,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
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
        textTransform: 'uppercase',
        letterSpacing: -0.5,
        color: '#ffffff',
    },
    modalClose: {
        padding: 8,
    },
    modalBody: {
        gap: 24,
        marginBottom: 32,
    },
    modalItem: {
        flexDirection: 'row',
        gap: 16,
    },
    modalItemIcon: {
        width: 40,
        height: 40,
        borderRadius: 16,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.2)',
    },
    modalItemTitle: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1,
        color: '#ffffff',
        marginBottom: 4,
    },
    modalItemText: {
        fontSize: 11,
        fontWeight: '500',
        lineHeight: 18,
        color: '#9ca3af',
    },
    modalButton: {
        width: '100%',
        backgroundColor: '#ffffff',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    modalButtonText: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#000000',
    },
    loadingText: {
        color: '#ffffff',
        fontSize: 16,
    },
    permissionText: {
        color: '#ffffff',
        fontSize: 16,
        marginBottom: 16,
    },
    permissionButton: {
        backgroundColor: '#10b981',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 16,
    },
    permissionButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
    },
});

export default LuxometerScreen;
