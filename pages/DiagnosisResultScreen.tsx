import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image, Modal, ActivityIndicator, Animated, Alert } from 'react-native';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { DiagnosisRecord, Plant, GeminiPlantResponse } from '../types';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';
import jsPDF from 'jspdf';
import { loadCyrillicFont, drawPdfLogo, getBase64ImageFromUrl } from '../services/pdfUtils';
import { savePdfToReportsFolder } from '../services/pdfSaveService';
import { SaveSuccessModal } from '../components/SaveSuccessModal';
import { identifyPlant } from '../services/geminiService';
import { generateUUID } from '../utils/uuid';

interface DiagnosisResultScreenProps {
    plants: Plant[];
    addPlant: (plant: Plant) => void;
    updatePlant: (plant: Plant) => void;
}

const DiagnosisResultScreen: React.FC<DiagnosisResultScreenProps> = ({ plants, addPlant, updatePlant }) => {
    const navigation = useNavigation();
    const route = useRoute();
    const { t, language } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const params = (route.params as any) || {};
    const { diagnosis, image, identifiedPlant, plantId, contextPlantName } = params;

    // Настоящее название: из диагноза API, контекста (карточка растения), идентификации по фото, научное имя
    const displayPlantName = (diagnosis?.plantName?.trim() || contextPlantName?.trim() || identifiedPlant?.commonName?.trim() || identifiedPlant?.scientificName?.trim() || 'Растение');

    const [saved, setSaved] = useState(!!plantId);
    const [savedPlantId, setSavedPlantId] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [showPdfSavedModal, setShowPdfSavedModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
    const pulseAnim = React.useRef(new Animated.Value(1)).current;
    const spinAnim = React.useRef(new Animated.Value(0)).current;

    const loadingMessages = [
        "Обновление медицинского профиля...",
        "Архивация снимка в истории...",
        "Пересчет индекса здоровья...",
        "Синхронизация с садом...",
        "Финальная проверка..."
    ];

    useEffect(() => {
        if (plantId && diagnosis) {
            const existing = plants.find(p => p.id === plantId);
            if (existing) {
                const updated: Plant = {
                    ...existing,
                    latestDiagnosis: diagnosis,
                    diagnosisHistory: [diagnosis, ...(existing.diagnosisHistory || [])]
                };
                updatePlant(updated);
            }
        }
    }, [plantId]);

    useEffect(() => {
        if (isSaving) {
            const interval = setInterval(() => {
                setCurrentMessageIndex((prev) => (prev >= loadingMessages.length - 1 ? prev : prev + 1));
            }, 1200);
            return () => clearInterval(interval);
        }
    }, [isSaving]);

    useEffect(() => {
        if (isSaving) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
                ])
            ).start();

            Animated.loop(
                Animated.timing(spinAnim, {
                    toValue: 1,
                    duration: 2000,
                    useNativeDriver: true,
                })
            ).start();
        }
    }, [isSaving]);

    const severityStyles: Record<string, { color: string; bg: string; border: string; labelKey: 'diag_severity_critical' | 'diag_severity_medium' | 'diag_severity_low'; rgb: number[] }> = {
        high: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.2)', labelKey: 'diag_severity_critical', rgb: [239, 68, 68] },
        medium: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.2)', labelKey: 'diag_severity_medium', rgb: [245, 158, 11] },
        low: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.2)', labelKey: 'diag_severity_low', rgb: [59, 130, 246] }
    };
    const defaultStatusStyle = { color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.2)', labelKey: 'diag_biometry_ok' as const, rgb: [16, 185, 129] as number[] };

    const threatPercent = (v: number | undefined): number => Math.min(100, Math.max(0, Number(v) || 0));
    const getThreatColor = (percent: number): string => {
        const p = threatPercent(percent);
        if (p >= 50) return '#ef4444';
        if (p >= 20) return '#f59e0b';
        if (p >= 10) return '#eab308';
        if (p > 0) return '#3b82f6';
        return '#22c55e';
    };
    const getSeverityLevel = (percent: number): 'high' | 'medium' | 'low' => {
        const p = threatPercent(percent);
        if (p >= 50) return 'high';
        if (p >= 20) return 'medium';
        return 'low';
    };

    const healthStats = diagnosis?.healthAssessment ?? (diagnosis?.isHealthy
        ? { healthy: 100, pests: 0, diseases: 0, nutrition: 0, abiotic: 0 }
        : { healthy: 95, pests: 5, diseases: 5, nutrition: 5, abiotic: 5 });
    const threatsFromStats = (healthStats.diseases ?? 0) > 0 || (healthStats.pests ?? 0) > 0 || (healthStats.nutrition ?? 0) > 0 || (healthStats.abiotic ?? 0) > 0;
    const hasThreats = diagnosis?.isHealthy === true ? false : threatsFromStats;
    const maxThreatPercent = Math.max(
        threatPercent(healthStats.diseases),
        threatPercent(healthStats.pests),
        threatPercent(healthStats.nutrition),
        threatPercent(healthStats.abiotic)
    );
    const severityFromPercent = getSeverityLevel(maxThreatPercent);
    const style = !hasThreats
        ? defaultStatusStyle
        : (severityStyles[severityFromPercent] ?? severityStyles.low);

    const handleSaveToGarden = async () => {
        if (saved || isSaving) return;
        
        setIsSaving(true);
        try {
            const existingMatch = plants.find(p => {
                const dispName = displayPlantName.toLowerCase().trim();
                const idenName = identifiedPlant?.commonName?.toLowerCase().trim();
                const idenSci = identifiedPlant?.scientificName?.toLowerCase().trim();
                
                const matchCommon = p.commonName?.toLowerCase().trim() === dispName || p.commonName?.toLowerCase().trim() === idenName;
                const matchSci = idenSci && p.scientificName?.toLowerCase().trim() === idenSci;
                
                return matchCommon || matchSci;
            });

            let targetId = existingMatch?.id;

            if (existingMatch) {
                const updated: Plant = {
                    ...existingMatch,
                    isInGarden: true,
                    latestDiagnosis: diagnosis,
                    diagnosisHistory: [diagnosis, ...(existingMatch.diagnosisHistory || [])]
                };
                updatePlant(updated);
            } else {
                let idData = identifiedPlant;
                if (!idData) {
                    try {
                        let base64Data = "";
                        let mimeType = "image/jpeg";

                        if (image.startsWith('data:')) {
                            const [mimePart, b64] = image.split(',');
                            mimeType = mimePart.split(':')[1].split(';')[0];
                            base64Data = b64;
                        } else if (image.startsWith('http')) {
                             const fullBase64 = await getBase64ImageFromUrl(image);
                             if (fullBase64 && fullBase64.startsWith('data:')) {
                                 const [mimePart, b64] = fullBase64.split(',');
                                 mimeType = mimePart.split(':')[1].split(';')[0];
                                 base64Data = b64;
                             }
                        }

                        if (base64Data) {
                            idData = await identifyPlant(base64Data, mimeType, language);
                        }
                    } catch (e) { console.error("Failed to identify plant from diagnosis image:", e); }
                }

                const newPlant: Plant = {
                    id: generateUUID(),
                    imageUrl: image,
                    identificationDate: new Date().toISOString(),
                    isInGarden: true,
                    latestDiagnosis: diagnosis,
                    diagnosisHistory: [diagnosis],
                    notes: '',
                    reminders: {},
                    careHistory: [],
                    ...(idData && !idData.error ? idData : {
                        commonName: displayPlantName,
                        scientificName: 'Specimen diagnosed',
                        description: diagnosis.problemTitle,
                        careTips: { watering: "As per diagnosis", sunlight: "As per diagnosis", soil: "Standard" },
                        pros: ["Resilient"], cons: ["Needs care"]
                    })
                };
                addPlant(newPlant);
                targetId = newPlant.id;
            }
            
            setTimeout(() => {
                setSaved(true);
                setSavedPlantId(targetId ?? null);
                setIsSaving(false);
            }, 800);
        } catch (error) {
            console.error(error);
            setIsSaving(false);
        }
    };

    const handleExportPdf = async () => {
        setIsExporting(true);
        try {
            const pdf = new jsPDF();
            await loadCyrillicFont(pdf);
            const pageWidth = pdf.internal.pageSize.getWidth();
            const margin = 20;
            let y = 20;

            drawPdfLogo(pdf, margin, y, 15, 'dark');
            pdf.setTextColor(16, 185, 129);
            pdf.setFontSize(14);
            pdf.setFont('Roboto', 'bold');
            pdf.text('PLANT DIAGNOSIS REPORT', margin + 20, y + 8);
            
            y += 25;
            pdf.setDrawColor(229, 231, 235);
            pdf.line(margin, y, pageWidth - margin, y);
            y += 15;

            pdf.setTextColor(31, 41, 55);
            pdf.setFontSize(22);
            pdf.text(displayPlantName.toUpperCase(), margin, y);
            y += 10;
            
            const [r, g, b] = style.rgb as number[];
            pdf.setTextColor(r, g, b);
            pdf.setFontSize(12);
            pdf.text(`${diagnosis.problemTitle} (${t(style.labelKey)})`, margin, y);
            y += 15;

            try {
                let imgData: string | null = null;
                if (image.startsWith('data:')) {
                    imgData = image;
                } else if (image.startsWith('file://')) {
                    const base64 = await FileSystem.readAsStringAsync(image, { encoding: FileSystem.EncodingType.Base64 });
                    const ext = (image.split('.').pop() || '').toLowerCase();
                    imgData = `data:image/${ext === 'png' ? 'png' : 'jpeg'};base64,${base64}`;
                } else if (image.startsWith('http')) {
                    imgData = await getBase64ImageFromUrl(image);
                }
                if (imgData && imgData.startsWith('data:')) {
                    const format = imgData.includes('png') ? 'PNG' : 'JPEG';
                    pdf.addImage(imgData, format, margin, y, 60, 60);
                    y += 70;
                } else {
                    y += 10;
                }
            } catch (e) { y += 10; }

            const addSection = (title: string, content: string) => {
                pdf.setTextColor(31, 41, 55);
                pdf.setFontSize(12);
                pdf.setFont('Roboto', 'bold');
                pdf.text(title, margin, y);
                y += 7;
                pdf.setFontSize(10);
                pdf.setFont('Roboto', 'normal');
                pdf.setTextColor(75, 85, 99);
                const lines = pdf.splitTextToSize(content, pageWidth - margin * 2);
                pdf.text(lines, margin, y);
                y += (lines.length * 5) + 10;
            };

            addSection('КЛИНИЧЕСКАЯ КАРТИНА:', diagnosis.symptoms);
            addSection('ТЕРАПЕВТИЧЕСКИЙ ПЛАН:', diagnosis.treatment);
            addSection('ПРЕВЕНТИВНЫЕ МЕРЫ:', diagnosis.prevention);

            const dataUri = pdf.output('datauristring');
            const base64 = dataUri.split(',')[1];
            const fileName = `Diagnosis_Report_${displayPlantName}.pdf`;
            const path = await savePdfToReportsFolder(fileName, base64 || '');
            if (path) setShowPdfSavedModal(true);
            setIsExporting(false);
        } catch (e) { 
            console.error(e);
            setIsExporting(false);
        }
    };

    const spin = spinAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const DiagnosisProbBar = ({ label, value, colors: themeColors }: { label: string, value: number | undefined, colors: any }) => {
        const p = threatPercent(value);
        const fillColor = getThreatColor(p);
        return (
            <View style={styles.probBarContainer}>
                <View style={styles.probBarHeader}>
                    <Text style={[styles.probBarLabel, { color: themeColors.textMuted }]}>{label}</Text>
                    <Text style={[styles.probBarValue, { color: themeColors.text }]}>{p}%</Text>
                </View>
                <View style={[styles.probBarTrack, { backgroundColor: themeColors.surface }]}>
                    <View style={[styles.probBarFill, { width: `${p}%` }]}>
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: fillColor }]} />
                    </View>
                </View>
            </View>
        );
    };

    if (!diagnosis) return null;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Modal visible={isSaving} transparent={true} animationType="fade">
                <View style={[styles.savingModal, { backgroundColor: colors.overlay }]}>
                    <View style={styles.savingSpinner}>
                        <Animated.View 
                            style={[
                                styles.spinnerRing,
                                { opacity: pulseAnim }
                            ]}
                        />
                        <Animated.View 
                            style={[
                                styles.spinnerRingActive,
                                { transform: [{ rotate: spin }] }
                            ]}
                        />
                        <Ionicons name="pulse" size={32} color={colors.primary} style={styles.spinnerIcon} />
                    </View>
                    <Text style={[styles.savingTitle, { color: colors.text }]}>AI Sync Process</Text>
                    <Text style={[styles.savingMessage, { color: colors.textSecondary }]}>
                        {loadingMessages[currentMessageIndex]}
                    </Text>
                </View>
            </Modal>

            <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.borderLight }]}>
                <Pressable onPress={() => {
                    // Полная очистка стека навигации и переход на главную без параметров
                    const parent = navigation.getParent();
                    if (parent) {
                        // Используем родительский навигатор для полной очистки стека
                        (parent as any).dispatch(
                            CommonActions.reset({
                                index: 0,
                                routes: [{ name: 'MainTabs' }],
                            })
                        );
                        // Переключаемся на вкладку Home без параметров
                        (parent as any).navigate('MainTabs', { screen: 'Home' });
                    } else {
                        // Fallback: используем текущий навигатор
                        navigation.dispatch(
                            CommonActions.reset({
                                index: 0,
                                routes: [{ name: 'MainTabs' }],
                            })
                        );
                    }
                }} style={[styles.headerButton, { backgroundColor: colors.surface }]}>
                    <Ionicons name="home" size={24} color={colors.text} />
                </Pressable>
                <View style={styles.headerTitleContainer}>
                    <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>Biometric ID</Text>
                    <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">{displayPlantName}</Text>
                </View>
                <View style={styles.headerActions}>
                    <Pressable onPress={handleExportPdf} style={[styles.headerButton, styles.exportButton, { backgroundColor: colors.surface }]}>
                        {isExporting ? (
                            <ActivityIndicator size="small" color={colors.info} />
                        ) : (
                            <Ionicons name="download" size={24} color={colors.info} />
                        )}
                    </Pressable>
                    {(plantId || savedPlantId) ? (
                        <Pressable 
                            onPress={() => navigation.navigate('PlantDetail' as never, { plantId: plantId || savedPlantId } as never)}
                            style={[styles.headerButton, styles.plantButton, { backgroundColor: colors.surface }]}
                        >
                            <Ionicons name="leaf" size={24} color={colors.primary} />
                        </Pressable>
                    ) : (
                        <Pressable 
                            onPress={handleSaveToGarden}
                            disabled={saved || isSaving}
                            style={[styles.headerButton, saved ? styles.savedButton : styles.addButton, { backgroundColor: saved ? colors.success : colors.primary }]}
                        >
                            {saved ? (
                                <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
                            ) : (
                                <Ionicons name="add" size={24} color="#ffffff" />
                            )}
                        </Pressable>
                    )}
                </View>
            </View>

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                <View style={styles.imageContainer}>
                    <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
                </View>

                <View style={styles.content}>
                    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                        <View style={styles.cardIcon}>
                            <MaterialIcons name="biotech" size={120} color={colors.success} style={{ opacity: theme === 'dark' ? 0.05 : 0.03 }} />
                        </View>
                        <Text style={[styles.plantNameInCard, { color: colors.text }]}>{displayPlantName}</Text>
                        <View style={[styles.statusBadgeContent, styles.statusBadgeInCard, { backgroundColor: style.bg, borderColor: style.border }]}>
                            {!hasThreats ? (
                                <Ionicons name="checkmark-circle" size={18} color={style.color} />
                            ) : (
                                <Ionicons name="warning" size={18} color={style.color} />
                            )}
                            <Text style={[styles.statusBadgeText, { color: style.color }]}>{t(style.labelKey)}</Text>
                        </View>

                        <View style={styles.statsGrid}>
                            <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Status</Text>
                                <Text style={[styles.statValue, { color: !hasThreats ? colors.success : colors.error }]}>
                                    {!hasThreats ? "OPTIMAL" : "PATHOGEN DETECTED"}
                                </Text>
                            </View>
                            <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Verification</Text>
                                <Text style={[styles.statValue, { color: colors.text }]}>AI CONFIRMED</Text>
                            </View>
                        </View>

                        <View style={styles.section}>
                            <View style={[styles.sectionIcon, { backgroundColor: colors.info + '20' }]}>
                                <Ionicons name="pulse" size={20} color={colors.info} />
                            </View>
                            <View style={styles.sectionContent}>
                                <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Клиническая симптоматика</Text>
                                <Text style={[styles.sectionText, { color: colors.text }]}>{diagnosis.symptoms?.trim() || 'По фото видимых симптомов не выявлено. Рекомендуется наблюдение и соблюдение базовых правил ухода.'}</Text>
                            </View>
                        </View>
                    </View>

                    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                        <View style={styles.cardIcon}>
                            <MaterialIcons name="medication" size={120} color={colors.error} style={{ opacity: theme === 'dark' ? 0.05 : 0.03 }} />
                        </View>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIcon, { backgroundColor: colors.error + '20' }]}>
                                <Ionicons name="flash" size={24} color={colors.error} />
                            </View>
                            <View style={styles.sectionHeaderTextWrap}>
                                <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>Терапия</Text>
                                <Text style={[styles.sectionHeaderSubtitle, { color: colors.textMuted }]}>Active Treatment Phase</Text>
                            </View>
                        </View>
                        <View style={[styles.treatmentBox, { backgroundColor: colors.error + '10', borderColor: colors.error + '20' }]}>
                            <Text style={[styles.treatmentText, { color: colors.text }]}>{diagnosis.treatment?.trim() || 'При лёгких отклонениях достаточно скорректировать полив, освещение и подкормку. При усугублении симптомов — изоляция растения и при необходимости обработка по рекомендациям специалиста.'}</Text>
                        </View>
                    </View>

                    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                        <View style={styles.cardIcon}>
                            <Ionicons name="shield-checkmark" size={120} color={colors.success} style={{ opacity: theme === 'dark' ? 0.05 : 0.03 }} />
                        </View>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIcon, { backgroundColor: colors.success + '20' }]}>
                                <MaterialIcons name="auto-awesome" size={24} color={colors.success} />
                            </View>
                            <View style={styles.sectionHeaderTextWrap}>
                                <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>Превентивные меры</Text>
                                <Text style={[styles.sectionHeaderSubtitle, { color: colors.textMuted }]}>Immune Support Protocol</Text>
                            </View>
                        </View>
                        <View style={[styles.preventionBox, { backgroundColor: colors.success + '10', borderColor: colors.success + '20' }]}>
                            <Text style={[styles.preventionText, { color: colors.text }]}>{diagnosis.prevention?.trim() || 'Поддерживайте стабильные условия: регулярный полив без переувлажнения, достаточное освещение, проветривание без сквозняков. Новые растения держите на карантине 2–3 недели.'}</Text>
                        </View>
                    </View>

                    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                        <Text style={[styles.analysisTitle, { color: colors.textMuted }]}>{t('diag_analysis_threat_title')}</Text>
                        <Text style={[styles.analysisSubtitle, { color: colors.textSecondary }]}>{t('diag_analysis_threat_subtitle')}</Text>
                        <View style={styles.analysisContainer}>
                            <DiagnosisProbBar label={t('vuln_diseases')} value={hasThreats ? Math.max(5, healthStats.diseases ?? 0) : 5} colors={colors} />
                            <DiagnosisProbBar label={t('vuln_pests')} value={hasThreats ? Math.max(5, healthStats.pests ?? 0) : 5} colors={colors} />
                            <DiagnosisProbBar label={t('vuln_nutrition')} value={hasThreats ? Math.max(5, healthStats.nutrition ?? 0) : 5} colors={colors} />
                            <DiagnosisProbBar label={t('threat_abiotic')} value={hasThreats ? Math.max(5, healthStats.abiotic ?? 0) : 5} colors={colors} />
                        </View>
                    </View>

                    {!isSaving && (
                        <View style={styles.actionButtonWrap}>
                            {(plantId || savedPlantId) ? (
                                <Pressable
                                    onPress={() => navigation.navigate('PlantDetail' as never, { plantId: plantId || savedPlantId } as never)}
                                    style={[styles.actionButton, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
                                >
                                    <Ionicons name="leaf" size={20} color="#ffffff" />
                                    <Text style={styles.actionButtonText}>{t('nav_back_to_profile')}</Text>
                                </Pressable>
                            ) : (
                                <Pressable
                                    onPress={handleSaveToGarden}
                                    disabled={saved}
                                    style={[styles.actionButton, { backgroundColor: colors.primary, shadowColor: colors.primary }, saved && styles.actionButtonDisabled]}
                                >
                                    <Ionicons name="add" size={20} color="#ffffff" />
                                    <Text style={styles.actionButtonText}>Добавить в мой сад</Text>
                                </Pressable>
                            )}
                        </View>
                    )}
                </View>
            </ScrollView>

            <SaveSuccessModal
                visible={showPdfSavedModal}
                onClose={() => setShowPdfSavedModal(false)}
                title={t('success_title')}
                message={t('export_pdf_saved')}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor применяется через inline стили
    },
    savingModal: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        // backgroundColor применяется через inline стили
    },
    savingSpinner: {
        width: 96,
        height: 96,
        marginBottom: 48,
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    spinnerRing: {
        position: 'absolute',
        width: 96,
        height: 96,
        borderRadius: 48,
        borderWidth: 4,
        borderColor: 'rgba(16, 185, 129, 0.2)',
    },
    spinnerRingActive: {
        position: 'absolute',
        width: 96,
        height: 96,
        borderRadius: 48,
        borderWidth: 4,
        borderColor: '#10b981',
        borderTopColor: 'transparent',
    },
    spinnerIcon: {
        position: 'absolute',
    },
    savingTitle: {
        fontSize: 18,
        fontWeight: '900',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: -0.5,
        // color применяется через inline стили
    },
    savingMessage: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 3.2,
        // color применяется через inline стили
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        padding: 16,
        paddingTop: 40,
        // backgroundColor и borderBottomColor применяются через inline стили
    },
    headerButton: {
        padding: 8,
        borderRadius: 9999,
        // backgroundColor применяется через inline стили
    },
    exportButton: {
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
    },
    addButton: {
        // backgroundColor применяется через inline стили
    },
    savedButton: {
        // backgroundColor применяется через inline стили
    },
    plantButton: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    headerTitleContainer: {
        flex: 1,
        minWidth: 0,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    headerSubtitle: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 3.2,
        marginBottom: 2,
        // color применяется через inline стили
    },
    headerTitle: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        textAlign: 'center',
        width: '100%',
        // color применяется через inline стили
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 48,
    },
    imageContainer: {
        width: '100%',
        aspectRatio: 1,
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    content: {
        padding: 24,
        gap: 24,
        marginTop: -16,
    },
    plantNameInCard: {
        fontSize: 16,
        fontWeight: '800',
        marginBottom: 4,
        textAlign: 'center',
        alignSelf: 'center',
        // color применяется через inline стили
    },
    statusBadgeInCard: {
        alignSelf: 'center',
        marginBottom: 12,
    },
    statusBadgeContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 9999,
        borderWidth: 1,
    },
    statusBadgeText: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    card: {
        padding: 32,
        borderRadius: 40,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 8,
        borderWidth: 1,
        position: 'relative',
        overflow: 'hidden',
        // backgroundColor и borderColor применяются через inline стили
    },
    cardIcon: {
        position: 'absolute',
        top: 32,
        right: 32,
        opacity: 0.03,
    },
    plantName: {
        fontSize: 28,
        fontWeight: '900',
        color: '#111827',
        lineHeight: 32,
        letterSpacing: -1,
        marginBottom: 4,
    },
    problemTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#10b981',
        fontStyle: 'italic',
        marginBottom: 24,
    },
    statsGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 32,
    },
    statBox: {
        flex: 1,
        padding: 16,
        borderRadius: 24,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    statLabel: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginBottom: 4,
        // color применяется через inline стили
    },
    statValue: {
        fontSize: 14,
        fontWeight: '700',
        // color применяется через inline стили
    },
    section: {
        flexDirection: 'row',
        gap: 16,
        alignItems: 'flex-start',
    },
    sectionIcon: {
        padding: 12,
        borderRadius: 24,
        // backgroundColor применяется через inline стили
    },
    sectionContent: {
        flex: 1,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginBottom: 4,
        // color применяется через inline стили
    },
    sectionText: {
        fontSize: 14,
        fontWeight: '700',
        lineHeight: 22,
        fontStyle: 'italic',
        // color применяется через inline стили
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 24,
    },
    sectionHeaderTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    sectionHeaderTitle: {
        fontSize: 18,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: -0.5,
        // color применяется через inline стили
    },
    sectionHeaderSubtitle: {
        fontSize: 9,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    treatmentBox: {
        padding: 24,
        borderRadius: 32,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    treatmentText: {
        fontSize: 15,
        fontWeight: '900',
        lineHeight: 24,
        // color применяется через inline стили
    },
    preventionBox: {
        padding: 24,
        borderRadius: 32,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    preventionText: {
        fontSize: 15,
        fontWeight: '700',
        lineHeight: 24,
        // color применяется через inline стили
    },
    analysisTitle: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginBottom: 8,
        // color применяется через inline стили
    },
    analysisSubtitle: {
        fontSize: 13,
        lineHeight: 20,
        marginBottom: 20,
        // color применяется через inline стили
    },
    analysisContainer: {
        gap: 16,
        opacity: 0.9,
    },
    probBarContainer: {
        marginBottom: 12,
    },
    probBarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    probBarLabel: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#9ca3af',
    },
    probBarValue: {
        fontSize: 10,
        fontWeight: '900',
        color: '#111827',
    },
    probBarTrack: {
        height: 8,
        backgroundColor: '#e5e7eb',
        borderRadius: 9999,
        overflow: 'hidden',
    },
    probBarFill: {
        height: '100%',
        borderRadius: 9999,
        overflow: 'hidden',
    },
    actionButtonWrap: {
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 32,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingVertical: 20,
        borderRadius: 24,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
        // backgroundColor и shadowColor применяются через inline стили
    },
    actionButtonDisabled: {
        opacity: 0.5,
    },
    actionButtonText: {
        fontSize: 16,
        fontWeight: '900',
        color: '#ffffff',
    },
});

export default DiagnosisResultScreen;
