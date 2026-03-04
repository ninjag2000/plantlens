import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';

const tokens = {
    primary: '#10b981',
    primaryGlow: 'rgba(16, 185, 129, 0.25)',
    violet: '#8b5cf6',
    violetGlow: 'rgba(139, 92, 246, 0.12)',
    glassBg: 'rgba(255, 255, 255, 0.72)',
    glassBorder: 'rgba(255, 255, 255, 0.85)',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    surface: '#f9fafb',
    surfaceBorder: 'rgba(243, 244, 246, 0.9)',
    radiusCard: 24,
    radiusButton: 9999,
};

const ONBOARDING_COMPLETE_KEY = 'plantlens_app_onboarding_complete';

type Goal = 'identify' | 'care' | 'diagnosis';
type Experience = 'beginner' | 'pro';

const OnboardingScreen: React.FC = () => {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { t } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const [currentStep, setCurrentStep] = useState(0);
    const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
    const [experience, setExperience] = useState<Experience | null>(null);
    const [isInitialFlow, setIsInitialFlow] = useState(true);
    const fadeAnim = React.useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const checkOnboarding = async () => {
            const completed = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
            setIsInitialFlow(completed !== 'true');
        };
        checkOnboarding();
    }, []);

    const handleFinish = () => {
        if (isInitialFlow) {
            navigation.navigate('Subscription' as never);
        } else {
            navigation.goBack();
        }
    };

    const handleNext = () => {
        if (currentStep === 0 && !selectedGoal) return;
        if (currentStep === 2 && !experience) return;

        if (currentStep < 3) {
            Animated.sequence([
                Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();
            setCurrentStep(currentStep + 1);
        } else {
            handleFinish();
        }
    };

    const handleSkip = () => {
        handleFinish();
    };

    // Step 0 Content: Goal Selection (fallbacks so labels never blank)
    const goalLabels = {
        identify: t('onboarding_goal_identify') || 'Identify Plants',
        care: t('onboarding_goal_care') || 'Learn Care',
        diagnosis: t('onboarding_goal_diagnosis') || 'Treat Disease',
    };
    const goals = [
        { 
            id: 'identify' as Goal, 
            label: goalLabels.identify, 
            icon: 'leaf' as const, 
            color: tokens.primary,
            bg: 'rgba(16, 185, 129, 0.12)'
        },
        { 
            id: 'care' as Goal, 
            label: goalLabels.care, 
            icon: 'water' as const, 
            color: '#0ea5e9',
            bg: 'rgba(14, 165, 233, 0.12)'
        },
        { 
            id: 'diagnosis' as Goal, 
            label: goalLabels.diagnosis, 
            icon: 'shield-checkmark' as const, 
            color: '#ef4444',
            bg: 'rgba(239, 68, 68, 0.1)'
        },
    ];

    // Dynamic Step 1 Content: Based on Goal (green/violet palette per rule)
    const getDynamicFeature = () => {
        switch (selectedGoal) {
            case 'care': 
                return { 
                    icon: 'water' as const, 
                    title: t('onboarding_feature_care_title'), 
                    desc: t('onboarding_feature_care_desc'), 
                    color: '#0ea5e9',
                    bg: 'rgba(14, 165, 233, 0.12)'
                };
            case 'diagnosis': 
                return { 
                    icon: 'shield-checkmark' as const, 
                    title: t('onboarding_feature_diag_title'), 
                    desc: t('onboarding_feature_diag_desc'), 
                    color: '#ef4444',
                    bg: 'rgba(254, 226, 226, 0.9)'
                };
            default: 
                return { 
                    icon: 'scan' as const, 
                    title: t('onboarding_feature_identify_title'), 
                    desc: t('onboarding_feature_identify_desc'), 
                    color: tokens.primary,
                    bg: 'rgba(16, 185, 129, 0.12)'
                };
        }
    };

    const renderStepContent = () => {
        if (currentStep === 0) {
            return (
                <>
                    <Text style={[styles.stepTitle, { color: colors.text }]}>{t('onboarding_goal_title')}</Text>
                    <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>{t('onboarding_goal_subtitle')}</Text>
                    <View style={styles.goalsContainer}>
                        {goals.map((goal) => (
                            <Pressable
                                key={goal.id}
                                onPress={() => setSelectedGoal(goal.id)}
                                android_ripple={null}
                                style={({ pressed }) => [
                                    styles.goalButton,
                                    { backgroundColor: colors.card, borderColor: colors.borderLight },
                                    selectedGoal === goal.id && [styles.goalButtonSelected, { borderColor: colors.primary }],
                                    pressed && styles.goalButtonPressed,
                                ]}
                            >
                                <View style={[styles.goalIconContainer, { backgroundColor: goal.bg }]}>
                                    <Ionicons name={goal.icon} size={24} color={goal.color} />
                                </View>
                                <View style={styles.goalLabelWrap}>
                                    <Text style={[styles.goalLabel, { color: colors.text }]} numberOfLines={2}>{goal.label}</Text>
                                </View>
                                {selectedGoal === goal.id && (
                                    <View style={styles.checkContainer}>
                                        <Ionicons name="checkmark" size={20} color={colors.primary} />
                                    </View>
                                )}
                            </Pressable>
                        ))}
                    </View>
                </>
            );
        }

        if (currentStep === 1) {
            const feature = getDynamicFeature();
            return (
                <View style={styles.featureContainer}>
                    <View style={[styles.featureIconContainer, { borderColor: feature.color }]}>
                        <Ionicons name={feature.icon} size={72} color={feature.color} />
                    </View>
                    <Text style={[styles.featureTitle, { color: colors.text }]}>{feature.title}</Text>
                    <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>{feature.desc}</Text>
                </View>
            );
        }

        if (currentStep === 2) {
            return (
                <>
                    <Text style={[styles.stepTitle, { color: colors.text }]}>{t('onboarding_exp_title')}</Text>
                    <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>{t('onboarding_exp_subtitle')}</Text>
                    <View style={styles.experienceContainer}>
                        <Pressable
                            onPress={() => setExperience('beginner')}
                            android_ripple={null}
                            style={[
                                styles.experienceButton,
                                { backgroundColor: colors.card, borderColor: colors.borderLight },
                                experience === 'beginner' && [styles.experienceButtonSelected, { borderColor: colors.primary }],
                            ]}
                        >
                            <View style={styles.experienceIconContainer}>
                                <Ionicons name="person" size={32} color="#eab308" />
                            </View>
                            <View style={styles.experienceTextContainer}>
                                <Text style={[styles.experienceTitle, { color: colors.text }]}>{t('onboarding_exp_beginner') || 'Newbie'}</Text>
                                <Text style={[styles.experienceSubtitle, { color: colors.textSecondary }]}>{t('onboarding_exp_beginner_desc') || 'Just starting my journey'}</Text>
                            </View>
                        </Pressable>
                        <Pressable
                            onPress={() => setExperience('pro')}
                            android_ripple={null}
                            style={[
                                styles.experienceButton,
                                { backgroundColor: colors.card, borderColor: colors.borderLight },
                                experience === 'pro' && [styles.experienceButtonSelected, { borderColor: colors.primary }],
                            ]}
                        >
                            <View style={[styles.experienceIconContainer, { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)' }]}>
                                <Ionicons name="trophy" size={32} color={colors.primary} />
                            </View>
                            <View style={styles.experienceTextContainer}>
                                <Text style={[styles.experienceTitle, { color: colors.text }]}>{t('onboarding_exp_pro') || 'Gardener'}</Text>
                                <Text style={[styles.experienceSubtitle, { color: colors.textSecondary }]}>{t('onboarding_exp_pro_desc') || 'I have a green thumb'}</Text>
                            </View>
                        </Pressable>
                    </View>
                </>
            );
        }

        if (currentStep === 3) {
            return (
                <View style={styles.readyContainer}>
                    <View style={[styles.readyIconContainer, { backgroundColor: colors.primary }]}>
                        <MaterialIcons name="rocket-launch" size={72} color="#ffffff" />
                    </View>
                    <Text style={[styles.readyTitle, { color: colors.text }]}>{t('onboarding_ready_title')}</Text>
                    <Text style={[styles.readyDesc, { color: colors.textSecondary }]}>{t('onboarding_ready_desc')}</Text>
                </View>
            );
        }

        return null;
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 56, paddingHorizontal: 24 }]}>
            <View style={StyleSheet.absoluteFill}>
                <Svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
                    <Defs>
                        <LinearGradient id="onboardingBg" x1="0" y1="0" x2="1" y2="1">
                            <Stop offset="0" stopColor={theme === 'dark' ? colors.background : "#f0fdf4"} stopOpacity="1" />
                            <Stop offset="0.5" stopColor={theme === 'dark' ? colors.surface : "#faf5ff"} stopOpacity={theme === 'dark' ? 0.8 : 0.6} />
                            <Stop offset="1" stopColor={theme === 'dark' ? colors.card : "#ffffff"} stopOpacity="1" />
                        </LinearGradient>
                    </Defs>
                    <Rect x="0" y="0" width="1" height="1" fill="url(#onboardingBg)" />
                </Svg>
            </View>
            <View style={styles.header}>
                <Pressable onPress={handleSkip} hitSlop={12}>
                    <Text style={[styles.skipButton, { color: colors.textMuted }]}>
                        {isInitialFlow ? t('onboarding_skip') : t('onboarding_close')}
                    </Text>
                </Pressable>
            </View>

            <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    {renderStepContent()}
                </ScrollView>
            </Animated.View>

            <View style={styles.footer}>
                <View style={styles.indicatorContainer}>
                    {[0, 1, 2, 3].map((index) => (
                        <View
                            key={index}
                            style={[
                                styles.indicator,
                                currentStep === index && styles.indicatorActive,
                            ]}
                        />
                    ))}
                </View>
                <Pressable
                    onPress={handleNext}
                    disabled={(currentStep === 0 && !selectedGoal) || (currentStep === 2 && !experience)}
                    style={({ pressed }) => [
                        styles.nextButton,
                        { backgroundColor: ((currentStep === 0 && !selectedGoal) || (currentStep === 2 && !experience)) ? colors.surface : colors.primary, shadowColor: colors.primary },
                        ((currentStep === 0 && !selectedGoal) || (currentStep === 2 && !experience)) && styles.nextButtonDisabled,
                        pressed && styles.nextButtonPressed,
                    ]}
                >
                    <Text style={[
                        styles.nextButtonText,
                        { color: ((currentStep === 0 && !selectedGoal) || (currentStep === 2 && !experience)) ? colors.textMuted : '#ffffff' },
                        ((currentStep === 0 && !selectedGoal) || (currentStep === 2 && !experience)) && styles.nextButtonTextDisabled,
                    ]}>
                        {currentStep === 0 
                            ? t('onboarding_start') 
                            : (currentStep === 3 
                                ? t('onboarding_finish') 
                                : t('onboarding_next'))}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        width: '100%',
        alignItems: 'flex-end',
        marginTop: 12,
        marginBottom: 16,
    },
    skipButton: {
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        // color применяется через inline стили
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'stretch',
        width: '100%',
        alignSelf: 'stretch',
        backgroundColor: 'transparent',
    },
    scrollView: {
        backgroundColor: 'transparent',
        flexGrow: 1,
        width: '100%',
        alignSelf: 'stretch',
    },
    scrollContent: {
        alignItems: 'stretch',
        width: '100%',
        paddingVertical: 24,
        backgroundColor: 'transparent',
    },
    stepTitle: {
        fontSize: 28,
        fontWeight: '900',
        marginBottom: 10,
        textAlign: 'center',
        letterSpacing: -0.5,
        alignSelf: 'center',
        // color применяется через inline стили
    },
    stepSubtitle: {
        marginBottom: 28,
        fontSize: 15,
        lineHeight: 22,
        // color применяется через inline стили
        textAlign: 'center',
        alignSelf: 'center',
    },
    goalsContainer: {
        width: '100%',
        gap: 14,
    },
    goalButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 18,
        borderRadius: tokens.radiusCard,
        borderWidth: 1,
        backgroundColor: 'transparent',
        gap: 16,
        // borderColor применяется через inline стили
    },
    goalButtonSelected: {
        backgroundColor: 'transparent',
        borderWidth: 2,
        shadowColor: 'transparent',
        shadowOpacity: 0,
        elevation: 0,
        // borderColor применяется через inline стили
    },
    goalButtonPressed: {
        transform: [{ scale: 0.98 }],
    },
    goalIconContainer: {
        padding: 14,
        borderRadius: 18,
    },
    goalLabelWrap: {
        flex: 1,
        minHeight: 44,
        minWidth: 120,
        justifyContent: 'center',
        paddingRight: 40,
        backgroundColor: 'transparent',
    },
    goalLabel: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
        backgroundColor: 'transparent',
        // color применяется через inline стили
    },
    checkContainer: {
        position: 'absolute',
        right: 18,
        padding: 6,
        borderRadius: 12,
    },
    featureContainer: {
        width: '100%',
        alignItems: 'center',
    },
    featureIconContainer: {
        marginBottom: 32,
        padding: 36,
        borderRadius: tokens.radiusCard + 8,
        borderWidth: 1,
        backgroundColor: 'transparent',
        shadowColor: 'transparent',
        shadowOpacity: 0,
        elevation: 0,
    },
    featureTitle: {
        fontSize: 26,
        fontWeight: '900',
        marginBottom: 14,
        textAlign: 'center',
        letterSpacing: -0.3,
        alignSelf: 'center',
        // color применяется через inline стили
    },
    featureDesc: {
        fontSize: 16,
        lineHeight: 26,
        textAlign: 'center',
        alignSelf: 'center',
        // color применяется через inline стили
    },
    experienceContainer: {
        width: '100%',
        gap: 14,
    },
    experienceButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        borderRadius: tokens.radiusCard + 4,
        borderWidth: 1,
        backgroundColor: 'transparent',
        gap: 18,
        // borderColor применяется через inline стили
    },
    experienceButtonSelected: {
        backgroundColor: 'transparent',
        borderWidth: 2,
        shadowColor: 'transparent',
        shadowOpacity: 0,
        elevation: 0,
        // borderColor применяется через inline стили
    },
    experienceIconContainer: {
        padding: 16,
        backgroundColor: 'rgba(234, 179, 8, 0.12)',
        borderRadius: 18,
    },
    experienceTextContainer: {
        flex: 1,
        minHeight: 48,
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    experienceTitle: {
        fontSize: 17,
        fontWeight: '800',
        marginBottom: 4,
        backgroundColor: 'transparent',
        // color применяется через inline стили
    },
    experienceSubtitle: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        backgroundColor: 'transparent',
        // color применяется через inline стили
    },
    readyContainer: {
        width: '100%',
        alignItems: 'center',
    },
    readyIconContainer: {
        marginBottom: 32,
        padding: 36,
        borderRadius: tokens.radiusCard + 8,
        borderWidth: 0,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 4,
        // backgroundColor и shadowColor применяются через inline стили
    },
    readyTitle: {
        fontSize: 28,
        fontWeight: '900',
        marginBottom: 14,
        textAlign: 'center',
        letterSpacing: -0.5,
        alignSelf: 'center',
        // color применяется через inline стили
    },
    readyDesc: {
        fontSize: 16,
        lineHeight: 26,
        textAlign: 'center',
        alignSelf: 'center',
        // color применяется через inline стили
    },
    footer: {
        width: '100%',
        paddingTop: 8,
    },
    indicatorContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        marginBottom: 28,
    },
    indicator: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: tokens.surfaceBorder,
    },
    indicatorActive: {
        backgroundColor: tokens.primary,
        width: 28,
    },
    nextButton: {
        width: '100%',
        paddingVertical: 18,
        borderRadius: tokens.radiusButton,
        alignItems: 'center',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 14,
        elevation: 4,
        // backgroundColor и shadowColor применяются через inline стили
    },
    nextButtonDisabled: {
        shadowOpacity: 0,
        elevation: 0,
        // backgroundColor применяется через inline стили
    },
    nextButtonTextDisabled: {
        // color применяется через inline стили
    },
    nextButtonPressed: {
        transform: [{ scale: 0.98 }],
    },
    nextButtonText: {
        fontSize: 17,
        fontWeight: '800',
        letterSpacing: 0.5,
        // color применяется через inline стили
    },
});

export default OnboardingScreen;
