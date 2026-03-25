import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSubscription } from '../hooks/useSubscription';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';

const tokens = {
    primary: '#10b981',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    radiusCard: 24,
    radiusButton: 9999,
};

interface SubscriptionScreenProps {
    onFinish: () => void;
    isManaging?: boolean;
}

const SubscriptionScreen: React.FC<SubscriptionScreenProps> = ({ onFinish, isManaging = false }) => {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { updateSubscription } = useSubscription();
    const { t } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const [selectedPlan, setSelectedPlan] = useState<'yearly' | 'monthly'>('yearly');

    const handleContinue = () => {
        updateSubscription('active', { plan: selectedPlan });
        onFinish();
    };

    const closingByButton = useRef(false);

    const handleClose = () => {
        closingByButton.current = true;
        onFinish();
    };

    useEffect(() => {
        if (isManaging) return;
        const unsubscribe = navigation.addListener('beforeRemove', (e) => {
            if (closingByButton.current) return;
            e.preventDefault();
            onFinish();
        });
        return unsubscribe;
    }, [navigation, onFinish, isManaging]);

    const features = [
        t('sub_feature_unlimited'),
        t('sub_feature_sync'),
        t('sub_feature_ai'),
        t('sub_feature_export'),
        t('sub_feature_ads'),
    ];

    return (
        <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }]}>
            <View style={StyleSheet.absoluteFill}>
                <Svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
                    <Defs>
                        <LinearGradient id="subBg" x1="0" y1="0" x2="1" y2="1">
                            <Stop offset="0" stopColor={theme === 'dark' ? colors.background : "#f0fdf4"} stopOpacity="1" />
                            <Stop offset="0.5" stopColor={theme === 'dark' ? colors.surface : "#faf5ff"} stopOpacity={theme === 'dark' ? 0.8 : 0.6} />
                            <Stop offset="1" stopColor={theme === 'dark' ? colors.card : "#ffffff"} stopOpacity="1" />
                        </LinearGradient>
                    </Defs>
                    <Rect x="0" y="0" width="1" height="1" fill="url(#subBg)" />
                </Svg>
            </View>
            <View style={styles.header}>
                <Pressable onPress={handleClose} style={styles.closeButton}>
                    <Ionicons name="close" size={24} color={colors.text} />
                </Pressable>
            </View>

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.content}>
                    <View style={styles.titleContainer}>
                        <View style={[styles.iconContainer, { borderColor: colors.primary }]}>
                            <Ionicons name="diamond" size={48} color={colors.primary} />
                        </View>
                        <Text style={[styles.title, { color: colors.text }]}>{t('sub_title')}</Text>
                        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                            {isManaging ? t('sub_desc_manage') : t('sub_desc_initial')}
                        </Text>
                    </View>

                    <View style={styles.plansContainer}>
                        <Pressable
                            onPress={() => setSelectedPlan('yearly')}
                            android_ripple={null}
                            style={[
                                styles.planButton,
                                { borderColor: colors.borderLight },
                                selectedPlan === 'yearly' && [styles.planButtonSelected, { borderColor: colors.primary }],
                            ]}
                        >
                            <View style={styles.planContent}>
                                <View style={styles.planHeader}>
                                    <Text style={styles.planTitle}>{t('sub_yearly')}</Text>
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>{t('sub_best_value')}</Text>
                                    </View>
                                </View>
                                <Text style={styles.freeTrial}>{t('sub_free_trial')}</Text>
                                <Text style={styles.oldPrice}>$59.99</Text>
                            </View>
                            <View style={styles.priceContainer}>
                                <Text style={styles.price}>{t('sub_price_yearly')}</Text>
                            </View>
                        </Pressable>

                        <Pressable
                            onPress={() => setSelectedPlan('monthly')}
                            android_ripple={null}
                            style={[
                                styles.planButton,
                                { borderColor: colors.borderLight },
                                selectedPlan === 'monthly' && [styles.planButtonSelected, { borderColor: colors.primary }],
                            ]}
                        >
                            <Text style={styles.planTitle}>{t('sub_monthly')}</Text>
                            <Text style={styles.price}>{t('sub_price_monthly')}</Text>
                        </Pressable>
                    </View>

                    <View style={styles.featuresContainer}>
                        {features.map((feature, index) => (
                            <View key={index} style={styles.featureItem}>
                                <View style={styles.checkContainer}>
                                    <Ionicons name="checkmark" size={16} color={colors.primary} />
                                </View>
                                <Text style={[styles.featureText, { color: colors.text }]}>{feature}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <Text style={[styles.footerText, { color: colors.textMuted }]}>
                    {selectedPlan === 'yearly' ? t('sub_footer_yearly') : t('sub_footer_monthly')}
                </Text>
                <Pressable
                    onPress={handleContinue}
                    style={({ pressed }) => [
                        styles.continueButton,
                        { backgroundColor: colors.primary, shadowColor: colors.primary },
                        pressed && styles.continueButtonPressed,
                    ]}
                >
                    <Text style={styles.continueButtonText}>
                        {isManaging 
                            ? t('sub_button_manage') 
                            : (selectedPlan === 'yearly' 
                                ? t('sub_button_free') 
                                : t('sub_button_continue'))}
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
    scrollView: {
        flexGrow: 1,
        backgroundColor: 'transparent',
    },
    scrollContent: {
        paddingBottom: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginBottom: 16,
    },
    closeButton: {
        padding: 8,
        backgroundColor: 'transparent',
        borderRadius: 9999,
    },
    content: {
        flex: 1,
    },
    titleContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    iconContainer: {
        padding: 16,
        backgroundColor: 'transparent',
        borderRadius: tokens.radiusCard + 8,
        borderWidth: 1,
        marginBottom: 24,
        // borderColor применяется через inline стили
    },
    title: {
        fontSize: 28,
        fontWeight: '900',
        marginBottom: 8,
        textAlign: 'center',
        letterSpacing: -0.5,
        // color применяется через inline стили
    },
    subtitle: {
        fontSize: 16,
        textAlign: 'center',
        // color применяется через inline стили
    },
    plansContainer: {
        gap: 14,
        marginBottom: 32,
    },
    planButton: {
        width: '100%',
        padding: 20,
        borderRadius: tokens.radiusCard,
        borderWidth: 1,
        backgroundColor: 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        // borderColor применяется через inline стили
    },
    planButtonSelected: {
        backgroundColor: 'transparent',
        borderWidth: 2,
        shadowColor: 'transparent',
        shadowOpacity: 0,
        elevation: 0,
        // borderColor применяется через inline стили
    },
    planContent: {
        flex: 1,
    },
    planHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    planTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: tokens.textPrimary,
    },
    badge: {
        backgroundColor: tokens.primary,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 9999,
    },
    badgeText: {
        color: '#ffffff',
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 2,
    },
    freeTrial: {
        fontSize: 14,
        fontWeight: '700',
        color: tokens.primary,
        marginBottom: 4,
    },
    oldPrice: {
        fontSize: 12,
        color: tokens.textMuted,
        textDecorationLine: 'line-through',
        opacity: 0.5,
    },
    priceContainer: {
        alignItems: 'flex-end',
    },
    price: {
        fontSize: 20,
        fontWeight: '900',
        color: tokens.textPrimary,
    },
    featuresContainer: {
        gap: 16,
        marginBottom: 32,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkContainer: {
        backgroundColor: 'transparent',
        borderRadius: 9999,
        padding: 4,
        marginRight: 16,
    },
    featureText: {
        fontSize: 14,
        fontWeight: '700',
        flex: 1,
        backgroundColor: 'transparent',
        // color применяется через inline стили
    },
    footer: {
        width: '100%',
        paddingTop: 8,
    },
    footerText: {
        fontSize: 10,
        marginBottom: 24,
        textAlign: 'center',
        lineHeight: 16,
        // color применяется через inline стили
    },
    continueButton: {
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
    continueButtonPressed: {
        transform: [{ scale: 0.95 }],
    },
    continueButtonText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '900',
    },
});

export default SubscriptionScreen;
