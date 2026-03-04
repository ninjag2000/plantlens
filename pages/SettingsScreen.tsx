import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, Switch, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSubscription } from '../hooks/useSubscription';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';
import { useI18n } from '../hooks/useI18n';
import { Language } from '../services/translations';
import { exportAllAppData, importAllAppData } from '../services/storageService';
import { clearDiscoverPlantCache, clearPlantDetailCache, clearTrendsCache } from '../services/plantCacheService';
import { clearImageCaches, measureAIImageGenerationSpeed } from '../services/plantImageService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SettingsScreen: React.FC = () => {
    const navigation = useNavigation();
    const { isSubscribed } = useSubscription();
    const { theme, setTheme } = useTheme();
    const { language, setLanguage, t } = useI18n();
    const colors = getThemeColors(theme);
    
    const [isLangModalOpen, setIsLangModalOpen] = useState(false);
    const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
    const [permissionsStatus, setPermissionsStatus] = useState<Record<string, string>>({});
    const [isSyncing, setIsSyncing] = useState(false);

    const isDark = theme === 'dark';

    // Отладка: логируем изменения темы
    useEffect(() => {
        console.log('[SettingsScreen] Theme changed to:', theme);
        console.log('[SettingsScreen] Colors:', colors);
    }, [theme, colors]);

    const languages: { code: Language; label: string; native: string, flag: string }[] = [
        { code: 'ru', label: 'Russian', native: 'Русский', flag: '🇷🇺' },
        { code: 'en', label: 'English', native: 'English', flag: '🇺🇸' },
        { code: 'de', label: 'German', native: 'Deutsch', flag: '🇩🇪' },
        { code: 'fr', label: 'French', native: 'Français', flag: '🇫🇷' },
        { code: 'es', label: 'Spanish', native: 'Español', flag: '🇪🇸' },
    ];

    const handleSelectLanguage = (code: Language) => {
        setLanguage(code);
        setIsLangModalOpen(false);
    };

    const handleBack = () => {
        navigation.goBack();
    };

    const handleExport = async () => {
        try {
            const data = exportAllAppData();
            const fileName = `PlantLens_Backup_${new Date().toISOString().split('T')[0]}.json`;
            const fileUri = `${FileSystem.documentDirectory}${fileName}`;
            
            await FileSystem.writeAsStringAsync(fileUri, data);
            
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri);
            } else {
                Alert.alert(t('success_title'), t('settings_sync_export_desc'));
            }
        } catch (e) {
            console.error("Export failed:", e);
            Alert.alert('Ошибка', "Не удалось экспортировать данные. Попробуйте позже.");
        }
    };

    const handleImportClick = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/json',
                copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets[0]) {
                const fileUri = result.assets[0].uri;
                const content = await FileSystem.readAsStringAsync(fileUri);
                const success = importAllAppData(content);
                
                if (success) {
                        Alert.alert(t('success_title'), t('settings_sync_import_success'));
                    // Reload app would require navigation reset
                } else {
                    Alert.alert('Ошибка', t('settings_sync_import_error'));
                }
            }
        } catch (e) {
            console.error("Import failed:", e);
            Alert.alert('Ошибка', 'Не удалось импортировать данные');
        }
    };

    const handleSimulateSync = () => {
        if (!isSubscribed) {
            navigation.navigate('SubscriptionManage' as never);
            return;
        }
        setIsSyncing(true);
        setTimeout(() => {
            setIsSyncing(false);
            Alert.alert(t('success_title'), t('settings_sync_success'));
        }, 2000);
    };

    const checkPermissions = async () => {
        const statuses: Record<string, string> = {};
        
        // For React Native, permissions are handled by Expo modules
        // This is a simplified version - in production, use expo-notifications, expo-camera, expo-location
        statuses['notifications'] = 'granted'; // Simplified
        statuses['camera'] = 'granted'; // Simplified
        statuses['geolocation'] = 'granted'; // Simplified
        
        setPermissionsStatus(statuses);
    };

    const handleOpenPermissions = () => {
        checkPermissions();
        setIsPermissionsModalOpen(true);
    };

    const handleClearCache = () => {
        Alert.alert(
            t('settings_clear_cache'),
            t('settings_clear_cache_confirm'),
            [
                { text: t('settings_cancel'), style: 'cancel' },
                {
                    text: t('settings_clear'),
                    style: 'destructive',
                    onPress: async () => {
                        const keysToRemove = [
                            'plantlens_cache_suggestions',
                            'plantlens_cache_details',
                            'plantlens_cache_trends',
                            'plantlens_cache_catalog',
                            'plantlens_seen_guide'
                        ];
                        await Promise.all(keysToRemove.map(key => AsyncStorage.removeItem(key)));
                        await clearDiscoverPlantCache();
                        await clearPlantDetailCache();
                        await clearTrendsCache();
                        await clearImageCaches();
                        Alert.alert(t('success_title'), t('settings_clear_cache_success'));
                    }
                }
            ]
        );
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'granted': return '#10b981';
            case 'denied': return '#ef4444';
            case 'prompt': return '#f59e0b';
            default: return '#6b7280';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'granted': return t('settings_perm_granted');
            case 'denied': return t('settings_perm_denied');
            case 'prompt': return t('settings_perm_prompt');
            default: return t('settings_perm_unknown');
        }
    };
    
    const settingsItems = [
        { icon: 'language', text: t('settings_language'), subtext: languages.find(l => l.code === language)?.native, action: () => setIsLangModalOpen(true), color: "#3b82f6" },
        { icon: 'lock-closed', text: t('settings_permissions'), subtext: t('settings_permissions_desc'), action: handleOpenPermissions, color: "#a78bfa" },
        { icon: 'trash', text: t('settings_clear_cache'), subtext: t('settings_clear_cache_desc'), action: handleClearCache, color: "#ef4444" },
        { icon: 'shield-checkmark', text: t('settings_privacy_policy'), action: () => {}, color: "#10b981" },
        { icon: 'help-circle', text: t('settings_help'), action: () => {}, color: "#f97316" },
        { icon: 'star', text: t('settings_rate_app'), action: () => {}, color: "#fbbf24" },
    ];

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.borderLight }]}>
                <Pressable onPress={handleBack} style={[styles.headerButton, { backgroundColor: colors.pressed }]}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </Pressable>
                <Text style={[styles.headerTitle, { color: colors.text }]}>{t('settings_title')}</Text>
            </View>
            
            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                <Pressable 
                    onPress={() => navigation.navigate('SubscriptionManage' as never)}
                    style={[styles.premiumCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
                >
                    <View style={styles.premiumIcon}>
                        <MaterialIcons name="diamond" size={24} color="#ffffff" />
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

                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('settings_appearance')}</Text>
                    <View style={[styles.themeCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                        <View style={styles.themeContent}>
                            <View style={[styles.themeIcon, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.1)' : 'rgba(234, 179, 8, 0.1)' }]}>
                                {isDark ? (
                                    <Ionicons name="moon" size={20} color="#a78bfa" />
                                ) : (
                                    <Ionicons name="sunny" size={20} color="#eab308" />
                                )}
                            </View>
                            <Text style={[styles.themeText, { color: colors.text }]}>
                                {isDark ? t('settings_theme_dark') : t('settings_theme_light')}
                            </Text>
                        </View>
                        <Switch
                            value={isDark}
                            onValueChange={(value) => {
                                console.log('[SettingsScreen] Theme switch changed:', value, 'Setting theme to:', value ? 'dark' : 'light');
                                setTheme(value ? 'dark' : 'light');
                            }}
                            trackColor={{ false: colors.disabled, true: colors.primary }}
                            thumbColor={isDark ? '#ffffff' : '#ffffff'}
                        />
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('settings_sync_title')}</Text>
                    <View style={[styles.syncCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                        <Pressable onPress={handleSimulateSync} style={styles.syncItem}>
                            <View style={[styles.syncIcon, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                                <Ionicons 
                                    name="refresh" 
                                    size={20} 
                                    color="#10b981"
                                    style={isSyncing && { transform: [{ rotate: '360deg' }] }}
                                />
                            </View>
                            <View style={styles.syncContent}>
                                <Text style={[styles.syncTitle, { color: colors.text }]}>{t('settings_sync_cloud')}</Text>
                                <Text style={[styles.syncSubtitle, { color: colors.textSecondary }]}>{t('settings_sync_cloud_desc')}</Text>
                            </View>
                        </Pressable>

                        <Pressable onPress={handleExport} style={[styles.syncItem, styles.syncItemBorder, { borderTopColor: colors.borderLight }]}>
                            <View style={[styles.syncIcon, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                                <Ionicons name="download" size={20} color="#3b82f6" />
                            </View>
                            <View style={styles.syncContent}>
                                <Text style={[styles.syncTitle, { color: colors.text }]}>{t('settings_sync_export')}</Text>
                                <Text style={[styles.syncSubtitle, { color: colors.textSecondary }]}>{t('settings_sync_export_desc')}</Text>
                            </View>
                        </Pressable>

                        <Pressable onPress={handleImportClick} style={styles.syncItem}>
                            <View style={[styles.syncIcon, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
                                <Ionicons name="cloud-upload" size={20} color="#a78bfa" />
                            </View>
                            <View style={styles.syncContent}>
                                <Text style={[styles.syncTitle, { color: colors.text }]}>{t('settings_sync_import')}</Text>
                                <Text style={[styles.syncSubtitle, { color: colors.textSecondary }]}>{t('settings_sync_import_desc')}</Text>
                            </View>
                        </Pressable>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('settings_general')}</Text>
                    <View style={[styles.generalCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                        {settingsItems.map((item, index) => (
                            <Pressable 
                                key={item.text} 
                                onPress={item.action} 
                                style={[styles.generalItem, index < settingsItems.length - 1 && styles.generalItemBorder, index < settingsItems.length - 1 && { borderBottomColor: colors.borderLight }]}
                            >
                                <View style={[styles.generalIcon, { backgroundColor: `${item.color}1a` }]}>
                                    <Ionicons name={item.icon as any} size={20} color={item.color} />
                                </View>
                                <View style={styles.generalContent}>
                                    <Text style={[styles.generalText, { color: colors.text }]}>{item.text}</Text>
                                    {item.subtext && <Text style={[styles.generalSubtext, { color: colors.textSecondary }]}>{item.subtext}</Text>}
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                            </Pressable>
                        ))}
                    </View>
                </View>

                <View style={styles.footer}>
                    <Text style={[styles.footerText, { color: colors.textMuted }]}>{t('settings_version')}</Text>
                    <Text style={[styles.footerSubtext, { color: colors.textMuted }]}>{t('settings_designed_for')}</Text>
                </View>
            </ScrollView>

            <Modal
                visible={isLangModalOpen}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setIsLangModalOpen(false)}
            >
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('settings_select_language')}</Text>
                            <Pressable onPress={() => setIsLangModalOpen(false)} style={styles.modalClose}>
                                <Ionicons name="close" size={24} color={colors.textSecondary} />
                            </Pressable>
                        </View>
                        <ScrollView style={styles.modalBody}>
                            {languages.map((lang) => (
                                <Pressable
                                    key={lang.code}
                                    onPress={() => handleSelectLanguage(lang.code)}
                                    style={[
                                        styles.langItem,
                                        language === lang.code && [styles.langItemActive, { backgroundColor: colors.primaryLight }]
                                    ]}
                                >
                                    <View style={styles.langContent}>
                                        <Text style={styles.langFlag}>{lang.flag}</Text>
                                        <View>
                                            <Text style={[styles.langNative, { color: colors.text }, language === lang.code && styles.langNativeActive]}>
                                                {lang.native}
                                            </Text>
                                            <Text style={[styles.langLabel, { color: colors.textSecondary }]}>{lang.label}</Text>
                                        </View>
                                    </View>
                                    {language === lang.code && (
                                        <Ionicons name="checkmark" size={20} color={colors.primary} />
                                    )}
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={isPermissionsModalOpen}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setIsPermissionsModalOpen(false)}
            >
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('settings_manage_permissions')}</Text>
                            <Pressable onPress={() => setIsPermissionsModalOpen(false)} style={styles.modalClose}>
                                <Ionicons name="close" size={24} color={colors.textSecondary} />
                            </Pressable>
                        </View>
                        <View style={styles.modalBody}>
                            <View style={styles.permissionsInfo}>
                                <Text style={styles.permissionsInfoText}>{t('settings_permissions_info')}</Text>
                                <View style={styles.permissionsList}>
                                    <View style={styles.permissionItem}>
                                        <View style={[styles.permissionIcon, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                                            <Ionicons name="camera" size={20} color="#3b82f6" />
                                        </View>
                                        <Text style={styles.permissionLabel}>{t('settings_camera')}</Text>
                                        <Text style={[styles.permissionStatus, { color: getStatusColor(permissionsStatus['camera']) }]}>
                                            {getStatusText(permissionsStatus['camera'])}
                                        </Text>
                                    </View>
                                    <View style={styles.permissionItem}>
                                        <View style={[styles.permissionIcon, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                                            <Ionicons name="location" size={20} color="#10b981" />
                                        </View>
                                        <Text style={styles.permissionLabel}>{t('settings_geolocation')}</Text>
                                        <Text style={[styles.permissionStatus, { color: getStatusColor(permissionsStatus['geolocation']) }]}>
                                            {getStatusText(permissionsStatus['geolocation'])}
                                        </Text>
                                    </View>
                                    <View style={styles.permissionItem}>
                                        <View style={[styles.permissionIcon, { backgroundColor: 'rgba(234, 179, 8, 0.1)' }]}>
                                            <Ionicons name="notifications" size={20} color="#eab308" />
                                        </View>
                                        <Text style={styles.permissionLabel}>{t('settings_notifications')}</Text>
                                        <Text style={[styles.permissionStatus, { color: getStatusColor(permissionsStatus['notifications']) }]}>
                                            {getStatusText(permissionsStatus['notifications'])}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                            <Pressable 
                                onPress={() => setIsPermissionsModalOpen(false)}
                                style={styles.modalButton}
                            >
                                <Text style={styles.modalButtonText}>{t('settings_ok')}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f9fafb',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        padding: 24,
        paddingTop: 40,
        backgroundColor: 'rgba(249, 250, 251, 0.8)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    },
    headerButton: {
        padding: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        borderRadius: 9999,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '900',
        color: '#111827',
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 24,
        gap: 32,
    },
    premiumCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        borderRadius: 32,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    premiumIcon: {
        padding: 12,
        backgroundColor: '#10b981',
        borderRadius: 24,
        marginRight: 16,
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
        overflow: 'visible',
        alignItems: 'center',
        justifyContent: 'center',
    },
    premiumContent: {
        flex: 1,
    },
    premiumTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 2,
    },
    premiumSubtitle: {
        fontSize: 12,
        color: '#6b7280',
    },
    section: {
        gap: 12,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 3.2,
        color: '#9ca3af',
        marginLeft: 8,
    },
    themeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#ffffff',
        borderRadius: 32,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
    },
    themeContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    themeIcon: {
        padding: 10,
        borderRadius: 16,
    },
    themeText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
    },
    syncCard: {
        backgroundColor: '#ffffff',
        borderRadius: 32,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
    },
    syncItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
    },
    syncItemBorder: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    },
    syncIcon: {
        padding: 10,
        borderRadius: 16,
        marginRight: 16,
    },
    syncContent: {
        flex: 1,
    },
    syncTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 2,
    },
    syncSubtitle: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        color: '#6b7280',
    },
    generalCard: {
        backgroundColor: '#ffffff',
        borderRadius: 32,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
    },
    generalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
    },
    generalItemBorder: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    },
    generalIcon: {
        padding: 10,
        borderRadius: 16,
        marginRight: 16,
    },
    generalContent: {
        flex: 1,
    },
    generalText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 2,
    },
    generalSubtext: {
        fontSize: 12,
        color: '#6b7280',
    },
    footer: {
        alignItems: 'center',
        paddingTop: 32,
        paddingBottom: 16,
    },
    footerText: {
        fontSize: 12,
        fontWeight: '500',
        color: '#9ca3af',
    },
    footerSubtext: {
        fontSize: 10,
        color: '#6b7280',
        marginTop: 4,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
    },
    modalClose: {
        padding: 8,
    },
    modalBody: {
        padding: 16,
        gap: 8,
    },
    langItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 24,
        backgroundColor: '#f3f4f6',
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
        marginBottom: 8,
    },
    langItemActive: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: 'rgba(16, 185, 129, 0.5)',
    },
    langContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    langFlag: {
        fontSize: 20,
    },
    langNative: {
        fontSize: 14,
        fontWeight: '700',
        color: '#374151',
    },
    langNativeActive: {
        color: '#10b981',
    },
    langLabel: {
        fontSize: 10,
        color: '#6b7280',
        opacity: 0.7,
    },
    permissionsInfo: {
        backgroundColor: '#f3f4f6',
        borderRadius: 24,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
        marginBottom: 16,
    },
    permissionsInfoText: {
        fontSize: 12,
        lineHeight: 18,
        color: '#4b5563',
        marginBottom: 16,
    },
    permissionsList: {
        gap: 16,
    },
    permissionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    permissionIcon: {
        padding: 8,
        borderRadius: 12,
        marginRight: 12,
    },
    permissionLabel: {
        flex: 1,
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
    },
    permissionStatus: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    modalButton: {
        width: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        paddingVertical: 16,
        borderRadius: 24,
        alignItems: 'center',
    },
    modalButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
    },
});

export default SettingsScreen;
