import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import Slider from '@react-native-community/slider';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { useSubscription } from '../hooks/useSubscription';
import { getThemeColors } from '../utils/themeColors';

interface WaterCalculatorState {
    image: string;
    base64: string;
    mimeType: string;
    analysisMode: string;
}

const WaterCalculatorScreen: React.FC = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const insets = useSafeAreaInsets();
    const { t } = useI18n();
    const { theme } = useTheme();
    const { isSubscribed } = useSubscription();
    const colors = getThemeColors(theme);
    const state = (route.params as any) as WaterCalculatorState;

    if (!isSubscribed) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.paywallHeader, { backgroundColor: colors.card, borderBottomColor: colors.borderLight }]}>
                    <Pressable onPress={() => navigation.goBack()} style={[styles.paywallBack, { backgroundColor: colors.surface }]}>
                        <Ionicons name="arrow-back" size={22} color={colors.text} />
                    </Pressable>
                    <Text style={[styles.paywallTitle, { color: colors.text }]}>{t('settings_premium_get')}</Text>
                </View>
                <View style={[styles.paywallContent, { backgroundColor: colors.background }]}>
                    <View style={[styles.paywallCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                        <View style={[styles.paywallIconWrap, { backgroundColor: colors.primary + '20' }]}>
                            <Ionicons name="lock-closed" size={48} color={colors.primary} />
                        </View>
                        <Text style={[styles.paywallCardTitle, { color: colors.text }]}>{t('settings_premium_get')}</Text>
                        <Text style={[styles.paywallCardSubtitle, { color: colors.textSecondary }]}>{t('settings_premium_unlock_all')}</Text>
                        <Pressable onPress={() => navigation.navigate('SubscriptionManage' as never)} style={[styles.paywallButton, { backgroundColor: colors.primary }]}>
                            <Text style={styles.paywallButtonText}>{t('settings_premium_get')}</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        );
    }

    const [activeSection, setActiveSection] = useState(0);
    const [answers, setAnswers] = useState({
        location: '',
        light: '',
        potDiameter: 15,
        potHeight: 12,
        geo: null as { lat: number, lon: number } | null
    });
    const [isLocating, setIsLocating] = useState(true);

    useEffect(() => {
        if (!state?.image) {
            navigation.navigate('Diagnosis' as never);
            return;
        }

        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted') {
                    const location = await Location.getCurrentPositionAsync({});
                    setAnswers(prev => ({ 
                        ...prev, 
                        geo: { lat: location.coords.latitude, lon: location.coords.longitude } 
                    }));
                }
            } catch (error) {
                console.log('Location error:', error);
            } finally {
                setIsLocating(false);
            }
        })();
    }, [state, navigation]);

    const handleBack = () => {
        navigation.goBack();
    };

    const handleSelect = (key: keyof typeof answers, value: any) => {
        setAnswers(prev => ({ ...prev, [key]: value }));
        if (key !== 'potDiameter' && key !== 'potHeight') {
            setTimeout(() => {
                if (activeSection < 2) setActiveSection(prev => prev + 1);
            }, 300);
        }
    };

    const handleCalculate = () => {
        navigation.navigate('Result' as never, { 
            ...state, 
            waterContext: {
                ...answers,
                potDiameter: answers.potDiameter.toString(),
                potHeight: answers.potHeight.toString()
            }
        } as never);
    };

    const isFormValid = answers.location && answers.light;

    const locationOptions = [
        { val: 'Indoor near window', label: t('water_q1_indoor_near'), icon: 'sunny' as const },
        { val: 'Indoor far from window', label: t('water_q1_indoor_far'), icon: 'home' as const },
        { val: 'Outdoor pot', label: t('water_q1_outdoor_pot'), icon: 'cube' as const },
        { val: 'Outdoor ground', label: t('water_q1_outdoor_ground'), icon: 'cloud' as const },
    ];

    const lightOptions = [
        { val: 'Low', label: t('water_q2_low'), desc: t('water_q2_low_desc'), icon: 'cloud' as const },
        { val: 'Medium', label: t('water_q2_med'), desc: t('water_q2_med_desc'), icon: 'partly-sunny' as const },
        { val: 'High', label: t('water_q2_high'), desc: t('water_q2_high_desc'), icon: 'sunny' as const },
    ];

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.borderLight }]}>
                <Pressable onPress={handleBack} style={[styles.headerButton, { backgroundColor: colors.surface }]}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Ionicons name="water" size={20} color={colors.info} />
                    <Text style={[styles.headerTitle, { color: colors.text }]}>{t('water_calc_title')}</Text>
                </View>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + 56 + 24 + insets.bottom }]} showsVerticalScrollIndicator={true}>
                <View style={styles.imageContainer}>
                    <Image source={{ uri: state.image }} style={styles.image} resizeMode="cover" />
                </View>

                <View style={styles.questionsContainer}>
                    <View style={[styles.questionSection, styles.questionSectionFirst, activeSection >= 0 && styles.questionSectionActive]}>
                        <View style={styles.questionHeader}>
                            <View style={styles.questionNumber}>
                                <Text style={styles.questionNumberText}>1</Text>
                            </View>
                            <Text style={styles.questionTitle}>{t('water_q1')}</Text>
                        </View>
                        <View style={styles.optionsGrid}>
                            {locationOptions.map((item, idx) => (
                                <Pressable
                                    key={idx}
                                    onPress={() => handleSelect('location', item.val)}
                                    style={[
                                        styles.optionButton,
                                        answers.location === item.val && styles.optionButtonSelected,
                                    ]}
                                >
                                    <Ionicons 
                                        name={item.icon} 
                                        size={20} 
                                        color={answers.location === item.val ? colors.info : colors.textMuted} 
                                    />
                                    <Text style={[
                                        styles.optionLabel,
                                        { color: answers.location === item.val ? colors.info : colors.textMuted },
                                        answers.location === item.val && styles.optionLabelSelected,
                                    ]} numberOfLines={2}>
                                        {item.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    <View style={[styles.questionSection, activeSection >= 1 && styles.questionSectionActive, styles.questionSectionSpaced]}>
                        <View style={styles.questionHeader}>
                            <View style={styles.questionNumber}>
                                <Text style={styles.questionNumberText}>2</Text>
                            </View>
                            <Text style={styles.questionTitle}>{t('water_q2')}</Text>
                        </View>
                        <View style={styles.optionsGrid3}>
                            {lightOptions.map((item, idx) => (
                                <Pressable
                                    key={idx}
                                    onPress={() => handleSelect('light', item.val)}
                                    style={[
                                        styles.optionButton,
                                        styles.optionButtonLight,
                                        answers.light === item.val && styles.optionButtonSelected,
                                    ]}
                                >
                                    <Ionicons 
                                        name={item.icon} 
                                        size={20} 
                                        color={answers.light === item.val ? colors.info : colors.textMuted} 
                                    />
                                    <Text style={[
                                        styles.optionLabel,
                                        { color: answers.light === item.val ? colors.info : colors.textMuted },
                                        answers.light === item.val && styles.optionLabelSelected,
                                    ]} numberOfLines={1}>
                                        {item.label}
                                    </Text>
                                    <Text style={[
                                        styles.optionDesc,
                                        { color: answers.light === item.val ? colors.textSecondary : colors.textMuted },
                                        answers.light === item.val && styles.optionDescSelected,
                                    ]} numberOfLines={2}>
                                        {item.desc}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    <View style={[styles.questionSection, styles.questionSectionLast, activeSection >= 2 && styles.questionSectionActive]}>
                        <View style={styles.questionHeader}>
                            <View style={styles.questionNumber}>
                                <Text style={styles.questionNumberText}>3</Text>
                            </View>
                            <Text style={styles.questionTitle}>{t('water_q3')}</Text>
                        </View>
                        <View style={styles.sliderContainer}>
                            <View style={styles.sliderItem}>
                                <View style={styles.sliderHeader}>
                                    <View style={styles.sliderLabelContainer}>
                                        <MaterialIcons name="straighten" size={16} color="#9ca3af" />
                                        <Text style={styles.sliderLabel}>{t('water_diameter')}</Text>
                                    </View>
                                    <Text style={styles.sliderValue}>{answers.potDiameter} cm</Text>
                                </View>
                                <Slider
                                    style={styles.slider}
                                    minimumValue={5}
                                    maximumValue={50}
                                    value={answers.potDiameter}
                                    onValueChange={(value) => handleSelect('potDiameter', Math.round(value))}
                                    minimumTrackTintColor="#60a5fa"
                                    maximumTrackTintColor="#374151"
                                    thumbTintColor="#60a5fa"
                                />
                            </View>
                            <View style={styles.sliderItem}>
                                <View style={styles.sliderHeader}>
                                    <View style={styles.sliderLabelContainer}>
                                        <MaterialIcons name="height" size={16} color="#9ca3af" />
                                        <Text style={styles.sliderLabel}>{t('water_height')}</Text>
                                    </View>
                                    <Text style={styles.sliderValue}>{answers.potHeight} cm</Text>
                                </View>
                                <Slider
                                    style={styles.slider}
                                    minimumValue={5}
                                    maximumValue={50}
                                    value={answers.potHeight}
                                    onValueChange={(value) => handleSelect('potHeight', Math.round(value))}
                                    minimumTrackTintColor="#60a5fa"
                                    maximumTrackTintColor="#374151"
                                    thumbTintColor="#60a5fa"
                                />
                            </View>
                        </View>
                    </View>
                </View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: 24 + insets.bottom, backgroundColor: colors.card, borderTopColor: colors.borderLight }]}>
                <Pressable
                    onPress={handleCalculate}
                    disabled={!isFormValid}
                    style={({ pressed }) => [
                        styles.calculateButton,
                        { backgroundColor: isFormValid ? colors.primary : colors.surface, shadowColor: isFormValid ? colors.primary : colors.surface },
                        !isFormValid && styles.calculateButtonDisabled,
                        pressed && styles.calculateButtonPressed,
                    ]}
                >
                    <Ionicons name="water" size={22} color="#ffffff" />
                    <Text style={styles.calculateButtonText}>{t('water_calculate')}</Text>
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    paywallHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        paddingTop: 48,
        borderBottomWidth: 1,
    },
    paywallBack: {
        padding: 8,
        borderRadius: 9999,
        marginRight: 12,
    },
    paywallTitle: {
        fontSize: 18,
        fontWeight: '800',
    },
    paywallContent: {
        flex: 1,
        justifyContent: 'center',
        padding: 24,
    },
    paywallCard: {
        padding: 32,
        borderRadius: 24,
        borderWidth: 1,
        alignItems: 'center',
    },
    paywallIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    paywallCardTitle: {
        fontSize: 20,
        fontWeight: '900',
        marginBottom: 8,
        textAlign: 'center',
    },
    paywallCardSubtitle: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
    },
    paywallButton: {
        paddingVertical: 14,
        paddingHorizontal: 28,
        borderRadius: 12,
    },
    paywallButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '800',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 24,
        paddingTop: 60,
        borderBottomWidth: 1,
        // backgroundColor и borderBottomColor применяются через inline стили
    },
    headerButton: {
        padding: 8,
        borderRadius: 9999,
        // backgroundColor применяется через inline стили
    },
    headerCenter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
        // color применяется через inline стили
    },
    headerSpacer: {
        width: 40,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 24,
        paddingBottom: 24,
    },
    imageContainer: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 4,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        marginBottom: 32,
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    questionsContainer: {
        gap: 24,
    },
    questionSection: {
        opacity: 0.5,
    },
    questionSectionActive: {
        opacity: 1,
    },
    questionSectionSpaced: {
        marginTop: 20,
    },
    questionSectionFirst: {
        marginBottom: 4,
    },
    questionSectionLast: {
        marginBottom: 40,
    },
    questionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    questionNumber: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    questionNumberText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#60a5fa',
    },
    questionTitle: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        color: '#6b7280',
    },
    optionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    optionsGrid3: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    optionButton: {
        width: '48%',
        maxWidth: '48%',
        padding: 10,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    optionButtonSelected: {
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderColor: '#60a5fa',
    },
    optionButtonLight: {
        flex: 1,
        minWidth: 0,
        padding: 8,
    },
    optionLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: '#6b7280',
        textAlign: 'center',
    },
    optionLabelSelected: {
        color: '#60a5fa',
    },
    optionDesc: {
        fontSize: 9,
        fontWeight: '500',
        color: '#9ca3af',
        textAlign: 'center',
        marginTop: 2,
    },
    optionDescSelected: {
        color: 'rgba(96, 165, 250, 0.9)',
    },
    sliderContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        gap: 24,
    },
    sliderItem: {
        gap: 8,
    },
    sliderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    sliderLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sliderLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: '#9ca3af',
    },
    sliderValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#ffffff',
        fontFamily: 'monospace',
    },
    slider: {
        width: '100%',
        height: 40,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 24,
        borderTopWidth: 1,
        // backgroundColor и borderTopColor применяются через inline стили
    },
    calculateButton: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
        // backgroundColor и shadowColor применяются через inline стили
    },
    calculateButtonDisabled: {
        opacity: 0.5,
    },
    calculateButtonPressed: {
        transform: [{ scale: 0.95 }],
    },
    calculateButtonText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '700',
    },
});

export default WaterCalculatorScreen;
