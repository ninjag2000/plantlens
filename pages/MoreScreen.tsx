import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSubscription } from '../hooks/useSubscription';
import { useI18n } from '../hooks/useI18n';
import { useOnboarding } from '../context/OnboardingContext';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';

const MoreScreen: React.FC = () => {
    const navigation = useNavigation();
    const { isSubscribed } = useSubscription();
    const { t } = useI18n();
    const { resetOnboarding } = useOnboarding();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);

    const menuSections = [
        {
            title: t('more_tools_care'),
            items: [
                { 
                    icon: 'water' as const, 
                    text: t('more_tool_water_calc'), 
                    subtext: t('more_tool_water_calc_desc'), 
                    action: () => navigation.navigate('NewCameraScreen' as never, { analysisMode: 'water' } as never), 
                    color: '#60a5fa'
                },
                { 
                    icon: 'sunny' as const, 
                    text: t('more_tool_luxometer'), 
                    subtext: t('more_tool_luxometer_desc'), 
                    action: () => navigation.navigate('Luxometer' as never), 
                    color: '#fbbf24'
                },
                { 
                    icon: 'arrow-up-circle' as const, 
                    text: t('more_tool_repot_assist'), 
                    subtext: t('more_tool_repot_assist_desc'), 
                    action: () => navigation.navigate('NewCameraScreen' as never, { analysisMode: 'repotting' } as never), 
                    color: '#fb923c'
                },
                { 
                    icon: 'pulse' as const, 
                    text: t('more_tool_diagnosis'), 
                    subtext: t('more_tool_diagnosis_desc'), 
                    action: () => navigation.navigate('Diagnosis' as never), 
                    color: '#f87171'
                },
            ]
        },
        {
            title: t('more_content'),
            items: [
                { 
                    icon: 'book' as const, 
                    text: t('more_content_library'), 
                    subtext: t('more_content_library_desc'), 
                    action: () => navigation.navigate('Articles' as never), 
                    color: '#34d399'
                },
                { 
                    icon: 'heart' as const, 
                    text: t('more_content_favorites'), 
                    subtext: t('more_content_favorites_desc'), 
                    action: () => navigation.navigate('Articles' as never, { filter: 'favorites' } as never), 
                    color: '#f472b6'
                },
            ]
        },
        {
            title: t('more_account'),
            items: [
                { 
                    icon: 'settings' as const, 
                    text: t('more_account_settings'), 
                    subtext: '', 
                    action: () => navigation.navigate('Settings' as never), 
                    color: '#6b7280'
                },
                { 
                    icon: 'school' as const, 
                    text: t('more_account_tutorial'), 
                    subtext: t('more_account_tutorial_desc'),
                    action: () => resetOnboarding(),
                    color: '#3b82f6'
                },
                { 
                    icon: 'chatbubble' as const, 
                    text: t('more_account_contact'), 
                    subtext: '', 
                    action: () => {}, 
                    color: '#10b981'
                },
                { 
                    icon: 'help-circle' as const, 
                    text: t('more_account_help'), 
                    subtext: '', 
                    action: () => {}, 
                    color: '#f97316'
                },
                { 
                    icon: 'shield-checkmark' as const, 
                    text: t('more_account_privacy'), 
                    subtext: '', 
                    action: () => {}, 
                    color: '#10b981'
                },
            ]
        }
    ];

    return (
        <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
            <Text style={[styles.title, { color: colors.text }]}>{t('more_title')}</Text>
            
            <Pressable 
                onPress={() => navigation.navigate('SubscriptionManage' as never)} 
                style={({ pressed }) => [
                    styles.premiumCard,
                    { backgroundColor: colors.card, borderColor: colors.borderLight },
                    pressed && styles.premiumCardPressed,
                ]}
            >
                <View style={[styles.premiumIconContainer, { backgroundColor: colors.primary }]}>
                    <MaterialIcons name="diamond" size={28} color="#ffffff" />
                </View>
                <View style={styles.premiumContent}>
                    <Text style={[styles.premiumTitle, { color: colors.text }]}>
                        {isSubscribed ? t('settings_premium_active') : t('settings_premium_get')}
                    </Text>
                    <Text style={[styles.premiumSubtitle, { color: colors.textSecondary }]}>
                        {isSubscribed ? t('settings_premium_features_unlocked') : t('settings_premium_unlock_all')}
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>

            <View style={styles.menuContainer}>
                {menuSections.map((section, sIdx) => (
                    <View key={sIdx} style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{section.title}</Text>
                        <View style={[styles.sectionItems, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                            {section.items.map((item, iIdx) => (
                                <Pressable 
                                    key={iIdx} 
                                    onPress={item.action} 
                                    style={({ pressed }) => [
                                        styles.menuItem,
                                        iIdx < section.items.length - 1 && [styles.menuItemBorder, { borderBottomColor: colors.borderLight }],
                                        pressed && { backgroundColor: colors.pressed },
                                    ]}
                                >
                                    <View style={[styles.menuIconContainer, { backgroundColor: `${item.color}20` }]}>
                                        <Ionicons name={item.icon} size={20} color={item.color} />
                                    </View>
                                    <View style={styles.menuTextContainer}>
                                        <Text style={[styles.menuText, { color: colors.text }]}>{item.text}</Text>
                                        {item.subtext ? (
                                            <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>{item.subtext}</Text>
                                        ) : null}
                                    </View>
                                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                                </Pressable>
                            ))}
                        </View>
                    </View>
                ))}
            </View>

            <View style={styles.versionContainer}>
                <Text style={[styles.versionText, { color: colors.textMuted }]}>{t('settings_version')}</Text>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f9fafb',
    },
    content: {
        padding: 24,
        paddingBottom: 100,
    },
    title: {
        fontSize: 30,
        fontWeight: '900',
        color: '#111827',
        marginBottom: 32,
    },
    premiumCard: {
        width: '100%',
        padding: 24,
        backgroundColor: '#ffffff',
        borderRadius: 40,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 40,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    premiumCardPressed: {
        transform: [{ scale: 0.98 }],
    },
    premiumIconContainer: {
        padding: 16,
        backgroundColor: '#10b981',
        borderRadius: 16,
        marginRight: 20,
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    premiumContent: {
        flex: 1,
    },
    premiumTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: '#111827',
        marginBottom: 4,
    },
    premiumSubtitle: {
        fontSize: 14,
        color: '#6b7280',
    },
    menuContainer: {
        gap: 40,
    },
    section: {
        gap: 16,
    },
    sectionTitle: {
        color: '#9ca3af',
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 3.2,
        marginLeft: 8,
    },
    sectionItems: {
        backgroundColor: '#ffffff',
        borderRadius: 32,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
    },
    menuItemBorder: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    },
    menuItemPressed: {
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
    },
    menuIconContainer: {
        padding: 10,
        borderRadius: 12,
        marginRight: 16,
    },
    menuTextContainer: {
        flex: 1,
    },
    menuText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 2,
    },
    menuSubtext: {
        fontSize: 10,
        color: '#6b7280',
    },
    versionContainer: {
        alignItems: 'center',
        marginTop: 48,
    },
    versionText: {
        color: '#9ca3af',
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
});

export default MoreScreen;
