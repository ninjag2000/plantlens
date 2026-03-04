import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image, Animated, Dimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { RepottingAnalysis } from '../types';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';

const RepottingResultScreen: React.FC = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const insets = useSafeAreaInsets();
    const { t } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const { result, image } = (route.params as any) || {};

    React.useEffect(() => {
        if (!result) {
            navigation.navigate('MainTabs' as never, { screen: 'Home' } as never);
        }
    }, [result, navigation]);

    if (!result) {
        return null;
    }

    const urgencyStyles = {
        high: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.2)', labelKey: 'repot_urgency_high' as const },
        medium: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.1)', border: 'rgba(249, 115, 22, 0.2)', labelKey: 'repot_urgency_medium' as const },
        low: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.2)', labelKey: 'repot_urgency_low' as const }
    };

    const style = result.needsRepotting ? urgencyStyles[result.urgency] : { color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.2)', labelKey: 'repot_optimal' as const };
    const imageHeight = Math.round(Dimensions.get('window').height * 0.38);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: colors.card, borderBottomColor: colors.borderLight }]}>
                <Pressable onPress={() => navigation.navigate('MainTabs' as never, { screen: 'Home' } as never)} style={[styles.headerButton, { backgroundColor: colors.surface }]}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Text style={[styles.headerSubtitle, { color: colors.textMuted }]} numberOfLines={1} ellipsizeMode="tail">AI Помощник</Text>
                    <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">Анализ кашпо</Text>
                </View>
                <Pressable onPress={() => navigation.navigate('MainTabs' as never, { screen: 'Home' } as never)} style={[styles.headerButton, { backgroundColor: colors.surface }]}>
                    <Ionicons name="home" size={24} color={colors.text} />
                </Pressable>
            </View>

            <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + 72 + 24 + insets.bottom }]} showsVerticalScrollIndicator={true}>
                <View style={[styles.imageContainer, { height: imageHeight }]}>
                    <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
                </View>

                <View style={styles.content}>
                    <View style={[styles.statusBadge, { backgroundColor: style.bg, borderColor: style.border }]}>
                        <Ionicons 
                            name={result.needsRepotting ? "warning" : "checkmark-circle"} 
                            size={16} 
                            color={style.color} 
                            style={styles.statusBadgeIcon}
                        />
                        <View style={styles.statusBadgeTextWrap}>
                            <Text style={[styles.statusText, { color: style.color }]} numberOfLines={3}>
                                {result.needsRepotting ? `${t('repot_needed_label')}: ${t(style.labelKey)}` : t('repot_optimal')}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.titleWrap}>
                        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                            {result.needsRepotting ? "Растению стало тесно" : "Размер горшка в норме"}
                        </Text>
                    </View>

                    <View style={[styles.reminderBar, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                        <View style={[styles.reminderIcon, { backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
                            <Ionicons name="time" size={18} color={colors.info} />
                        </View>
                        <View style={styles.reminderContent}>
                            <Text style={[styles.reminderLabel, { color: colors.text }]}>Напоминание</Text>
                            <Text style={[styles.reminderText, { color: colors.textSecondary }]}>
                                {result.needsRepotting 
                                    ? "Рекомендуется выполнить пересадку в течение ближайшего месяца." 
                                    : "Корневая система развивается корректно. Проверьте снова через 3 месяца."}
                            </Text>
                        </View>
                    </View>

                    <View style={[styles.analysisCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                        <View style={styles.analysisHeader}>
                            <View style={[styles.analysisIcon, { backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
                                <Ionicons name="information-circle" size={24} color={colors.info} />
                            </View>
                            <Text style={[styles.analysisTitle, { color: colors.text }]}>Биологическое обоснование</Text>
                        </View>
                        <Text style={[styles.analysisText, { color: colors.textSecondary }]}>{result.reason}</Text>
                    </View>

                    {result.needsRepotting && (
                        <>
                            <View style={styles.requirementsGrid}>
                                <View style={[styles.requirementCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                                    <View style={styles.requirementHeader}>
                                        <MaterialIcons name="inventory-2" size={16} color="#a78bfa" />
                                        <Text style={[styles.requirementLabel, { color: colors.textMuted }]}>Горшок</Text>
                                    </View>
                                    <Text style={[styles.requirementText, { color: colors.text }]}>{result.potSizeRecommendation}</Text>
                                </View>
                                <View style={[styles.requirementCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                                    <View style={styles.requirementHeader}>
                                        <Ionicons name="leaf" size={16} color={colors.primary} />
                                        <Text style={[styles.requirementLabel, { color: colors.textMuted }]}>Субстрат</Text>
                                    </View>
                                    <Text style={[styles.requirementText, { color: colors.text }]}>{result.soilType}</Text>
                                </View>
                            </View>

                            <View style={[styles.instructionsCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                                <View style={styles.instructionsHeader}>
                                    <View style={[styles.instructionsIcon, { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)' }]}>
                                        <Ionicons name="shield-checkmark" size={28} color={colors.primary} />
                                    </View>
                                    <View style={styles.instructionsHeaderTextWrap}>
                                        <Text style={[styles.instructionsTitle, { color: colors.text }]} numberOfLines={2}>Протокол пересадки</Text>
                                        <Text style={[styles.instructionsSubtitle, { color: colors.textMuted }]} numberOfLines={1}>Step-by-step guide</Text>
                                    </View>
                                </View>

                                <View style={styles.instructionsList}>
                                    {result.instructions.map((step, idx) => (
                                        <View key={idx} style={[styles.instructionStep, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                                            <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                                                <Text style={styles.stepNumberText}>{idx + 1}</Text>
                                            </View>
                                            <View style={styles.stepTextWrap}>
                                                <Text style={[styles.stepText, { color: colors.textSecondary }]}>{step}</Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </>
                    )}

                    {!result.needsRepotting && (
                        <View style={[styles.okCard, { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.05)', borderColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)' }]}>
                            <View style={[styles.okIconContainer, { backgroundColor: colors.primary }]}>
                                <Ionicons name="shield-checkmark" size={32} color="#ffffff" />
                            </View>
                            <Text style={[styles.okTitle, { color: colors.text }]}>Все в порядке</Text>
                            <Text style={[styles.okText, { color: colors.textSecondary }]}>
                                Текущий горшок обеспечивает достаточно места для развития корневой системы. Повторите анализ через 3-4 месяца.
                            </Text>
                        </View>
                    )}
                </View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: 24 + insets.bottom, backgroundColor: colors.card, borderTopColor: colors.borderLight }]}>
                <Pressable
                    onPress={() => navigation.navigate('MainTabs' as never, { screen: 'Home' } as never)}
                    style={({ pressed }) => [
                        styles.footerButton,
                        { backgroundColor: colors.primary, shadowColor: colors.primary },
                        pressed && styles.footerButtonPressed,
                    ]}
                >
                    <Text style={styles.footerButtonText}>Завершить анализ</Text>
                    <Ionicons name="chevron-forward" size={20} color="#ffffff" />
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor применяется через inline стили
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        minHeight: 56,
        // backgroundColor и borderBottomColor применяются через inline стили
    },
    headerButton: {
        padding: 10,
        borderRadius: 9999,
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        // backgroundColor применяется через inline стили
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        minWidth: 0,
        maxWidth: '100%',
    },
    headerSubtitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        maxWidth: '100%',
        // color применяется через inline стили
    },
    headerTitle: {
        fontSize: 14,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: -0.5,
        maxWidth: '100%',
        // color применяется через inline стили
    },
    scrollView: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    scrollContent: {
        paddingBottom: 24,
        backgroundColor: 'transparent',
    },
    imageContainer: {
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    content: {
        padding: 24,
        gap: 24,
        backgroundColor: 'transparent',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 9999,
        borderWidth: 1,
        alignSelf: 'stretch',
        maxWidth: '100%',
        // backgroundColor и borderColor применяются через inline стили
    },
    statusBadgeIcon: {
        flexShrink: 0,
    },
    statusBadgeTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    titleWrap: {
        width: '100%',
        maxWidth: '100%',
    },
    title: {
        fontSize: 36,
        fontWeight: '900',
        lineHeight: 44,
        letterSpacing: -1,
        maxWidth: '100%',
        // color применяется через inline стили
    },
    reminderBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 16,
        borderRadius: 24,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    reminderIcon: {
        padding: 10,
        borderRadius: 12,
        // backgroundColor применяется через inline стили
    },
    reminderContent: {
        flex: 1,
    },
    reminderLabel: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginBottom: 4,
        // color применяется через inline стили
    },
    reminderText: {
        fontSize: 12,
        fontWeight: '700',
        // color применяется через inline стили
    },
    analysisCard: {
        padding: 32,
        borderRadius: 40,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    analysisHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 16,
    },
    analysisIcon: {
        padding: 12,
        borderRadius: 16,
        // backgroundColor применяется через inline стили
    },
    analysisTitle: {
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: -0.5,
        // color применяется через inline стили
    },
    analysisText: {
        fontSize: 14,
        fontWeight: '700',
        lineHeight: 24,
        fontStyle: 'italic',
        // color применяется через inline стили
    },
    requirementsGrid: {
        flexDirection: 'row',
        gap: 16,
    },
    requirementCard: {
        flex: 1,
        padding: 24,
        borderRadius: 32,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    requirementHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    requirementLabel: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    requirementText: {
        fontSize: 12,
        fontWeight: '900',
        lineHeight: 18,
        textTransform: 'uppercase',
        letterSpacing: -0.5,
        // color применяется через inline стили
    },
    instructionsCard: {
        padding: 32,
        borderRadius: 40,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    instructionsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 32,
    },
    instructionsIcon: {
        padding: 12,
        borderRadius: 16,
        flexShrink: 0,
        // backgroundColor применяется через inline стили
    },
    instructionsHeaderTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    instructionsTitle: {
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: -0.5,
        maxWidth: '100%',
        // color применяется через inline стили
    },
    instructionsSubtitle: {
        fontSize: 9,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    instructionsList: {
        gap: 16,
    },
    instructionStep: {
        flexDirection: 'row',
        gap: 16,
        padding: 16,
        borderRadius: 24,
        borderWidth: 1,
        backgroundColor: 'transparent',
        alignItems: 'flex-start',
        // borderColor применяется через inline стили
    },
    stepNumber: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        // backgroundColor применяется через inline стили
    },
    stepNumberText: {
        fontSize: 12,
        fontWeight: '900',
        color: '#ffffff',
    },
    stepTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    stepText: {
        fontSize: 14,
        fontWeight: '700',
        lineHeight: 22,
        maxWidth: '100%',
        // color применяется через inline стили
    },
    okCard: {
        padding: 32,
        borderRadius: 40,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
        alignItems: 'center',
    },
    okIconContainer: {
        width: 64,
        height: 64,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
        // backgroundColor и shadowColor применяются через inline стили
    },
    okTitle: {
        fontSize: 20,
        fontWeight: '900',
        marginBottom: 8,
        // color применяется через inline стили
    },
    okText: {
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 22,
        textAlign: 'center',
        // color применяется через inline стили
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
    footerButton: {
        width: '100%',
        paddingVertical: 20,
        borderRadius: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
        // backgroundColor и shadowColor применяются через inline стили
    },
    footerButtonPressed: {
        transform: [{ scale: 0.95 }],
    },
    footerButtonText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
});

export default RepottingResultScreen;
