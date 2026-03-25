import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSubscription } from '../hooks/useSubscription';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';
import SubscriptionScreen from './SubscriptionScreen';
import type { Language } from '../services/translations';

const formatEndDate = (date: Date | null, locale: Language): string => {
    if (!date) return '—';
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
};

const SubscriptionManageScreen: React.FC = () => {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { t, language } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const { isSubscribed, plan, endDate, updateSubscription, checkSubscription } = useSubscription();
    const [showChangePlan, setShowChangePlan] = useState(false);

    const handleClose = () => navigation.goBack();

    const handleCancelSubscription = () => {
        Alert.alert(
            t('sub_cancel_confirm_title'),
            t('sub_cancel_confirm_message'),
            [
                { text: t('delete_cancel'), style: 'cancel' },
                {
                    text: t('action_confirm'),
                    style: 'destructive',
                    onPress: async () => {
                        await updateSubscription('inactive');
                        navigation.goBack();
                    },
                },
            ]
        );
    };

    if (!isSubscribed && !showChangePlan) {
        return (
            <SubscriptionScreen
                onFinish={handleClose}
                isManaging={false}
            />
        );
    }

    if (isSubscribed && showChangePlan) {
        return (
            <SubscriptionScreen
                onFinish={() => {
                    setShowChangePlan(false);
                    checkSubscription();
                }}
                isManaging={true}
            />
        );
    }

    const planLabel = plan === 'yearly' ? t('sub_yearly') : plan === 'monthly' ? t('sub_monthly') : '—';
    const endDateStr = formatEndDate(endDate, language);

    return (
        <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 24, backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <Pressable onPress={handleClose} style={[styles.closeButton, { backgroundColor: colors.surface }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text} />
                </Pressable>
                <Text style={[styles.headerTitle, { color: colors.text }]}>{t('sub_desc_manage')}</Text>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                    <View style={[styles.iconWrap, { backgroundColor: colors.primary + '20' }]}>
                        <MaterialIcons name="diamond" size={32} color={colors.primary} />
                    </View>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{t('settings_premium_active')}</Text>

                    <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
                        <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{t('sub_current_plan')}</Text>
                        <Text style={[styles.rowValue, { color: colors.text }]}>{planLabel}</Text>
                    </View>
                    <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
                        <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{t('sub_ends_on')}</Text>
                        <Text style={[styles.rowValue, { color: colors.text }]}>{endDateStr}</Text>
                    </View>
                </View>

                <Pressable
                    onPress={() => setShowChangePlan(true)}
                    style={({ pressed }) => [
                        styles.primaryButton,
                        { backgroundColor: colors.primary, shadowColor: colors.primary },
                        pressed && styles.primaryButtonPressed,
                    ]}
                >
                    <Text style={styles.primaryButtonText}>{t('sub_change_plan')}</Text>
                </Pressable>

                <Pressable
                    onPress={handleCancelSubscription}
                    style={[styles.textButton, { marginTop: 12 }]}
                >
                    <Text style={[styles.textButtonText, { color: colors.textMuted }]}>{t('sub_cancel_subscription')}</Text>
                </Pressable>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    closeButton: {
        padding: 8,
        borderRadius: 9999,
        marginRight: 12,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '800',
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    card: {
        padding: 24,
        borderRadius: 24,
        borderWidth: 1,
        marginBottom: 24,
        alignItems: 'center',
    },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    cardTitle: {
        fontSize: 22,
        fontWeight: '900',
        marginBottom: 20,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        width: '100%',
    },
    rowLabel: {
        fontSize: 15,
        fontWeight: '600',
    },
    rowValue: {
        fontSize: 15,
        fontWeight: '700',
    },
    primaryButton: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
    },
    primaryButtonPressed: {
        opacity: 0.9,
    },
    primaryButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '800',
    },
    textButton: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    textButtonText: {
        fontSize: 14,
        fontWeight: '600',
    },
});

export default SubscriptionManageScreen;
