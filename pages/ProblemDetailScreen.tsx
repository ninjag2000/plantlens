import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, ActivityIndicator, Animated, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { toggleFavoriteDiagnosis, getFavoriteDiagnosisIds } from '../services/storageService';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';
import jsPDF from 'jspdf';
import { loadCyrillicFont, drawPdfLogo, getBase64ImageFromUrl } from '../services/pdfUtils';
import { savePdfToReportsFolder } from '../services/pdfSaveService';
import { SaveSuccessModal } from '../components/SaveSuccessModal';
import { DISEASE_ZONE_PLANT_IMAGES } from '../assets/images/plants';

/** Минимальный валидный PNG (1×1) для проверки addImage в PDF. */
const FALLBACK_PDF_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

interface ProblemContent {
    symptoms: string;
    symptomsImg: string;
    treatment: string;
    treatmentImg: string;
    prevention: string;
    preventionImg: string;
}

interface Problem {
    title: string;
    titleKey?: string;
    desc: string;
    severity: 'low' | 'medium' | 'high';
    imageUrl: string;
    imageIndex?: number;
    content: ProblemContent;
}

const ProblemDetailScreen: React.FC = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const insets = useSafeAreaInsets();
    const { t } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const scrollY = React.useRef(new Animated.Value(0)).current;

    const [isBookmarked, setIsBookmarked] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [showPdfSavedModal, setShowPdfSavedModal] = useState(false);

    const { problem, categoryName } = (route.params as any) || {};

    React.useEffect(() => {
        if (!problem) {
            navigation.navigate('Diagnosis' as never);
            return;
        }

        const loadBookmark = async () => {
            const favorites = await getFavoriteDiagnosisIds();
            setIsBookmarked(Array.isArray(favorites) && favorites.includes(problem.title));
        };
        loadBookmark();
    }, [problem, navigation]);

    if (!problem) {
        return null;
    }

    const handleBack = () => {
        navigation.goBack();
    };

    const getReportImageDataUri = async (): Promise<string | null> => {
        // Сначала проверяем локальные изображения по imageIndex
        if (problem.imageIndex != null) {
            const local = DISEASE_ZONE_PLANT_IMAGES[problem.imageIndex]?.uri;
            if (local && typeof local === 'string' && local.startsWith('data:')) {
                return local;
            }
        }
        // Затем проверяем imageUrl
        const imageUrl = problem.imageUrl ?? '';
        if (imageUrl.startsWith('data:')) return imageUrl;
        if (imageUrl.startsWith('file://')) {
            const base64 = await FileSystem.readAsStringAsync(imageUrl, { encoding: FileSystem.EncodingType.Base64 });
            const ext = (imageUrl.split('.').pop() || '').toLowerCase();
            return `data:image/${ext === 'png' ? 'png' : 'jpeg'};base64,${base64}`;
        }
        if (imageUrl.startsWith('http')) return await getBase64ImageFromUrl(imageUrl);
        return null;
    };

    const generatePdfViaPrint = async (): Promise<string> => {
        let Print: typeof import('expo-print');
        try {
            Print = require('expo-print');
        } catch {
            throw new Error('ExpoPrint not available');
        }
        const pdfTitle = problem.titleKey ? t(problem.titleKey as any) : problem.title;
        const pdfSymptoms = problem.titleKey ? (t('diag_symptoms_p1').replace('{name}', pdfTitle) + '\n\n' + t('diag_symptoms_p2').replace('{name}', pdfTitle)) : problem.content.symptoms;
        const pdfTreatment = problem.titleKey ? (t('diag_treatment_p1').replace('{name}', pdfTitle) + '\n\n' + t('diag_treatment_p2').replace('{name}', pdfTitle)) : problem.content.treatment;
        const pdfPrevention = problem.titleKey ? (t('diag_prevention_p1').replace('{name}', pdfTitle) + '\n\n' + t('diag_prevention_p2').replace('{name}', pdfTitle)) : problem.content.prevention;
        const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        
        // Получаем изображение и вставляем в HTML
        let imgTag = '';
        let tempImageUri: string | null = null;
        try {
            const imgSrc = await getReportImageDataUri();
            console.log('[PDF] Image source available:', !!imgSrc);
            console.log('[PDF] Image source type:', imgSrc?.substring(0, 20) || 'null');
            console.log('[PDF] Image length:', imgSrc?.length || 0);
            
            if (imgSrc && imgSrc.startsWith('data:')) {
                // Пробуем несколько подходов для максимальной совместимости
                const base64Match = imgSrc.match(/^data:image\/(\w+);base64,(.+)$/);
                if (base64Match) {
                    const [, format, base64Data] = base64Match;
                    console.log('[PDF] Image format:', format, 'Base64 length:', base64Data.length);
                    
                    // Сохраняем во временный файл - expo-print лучше работает с file:// URI
                    try {
                        const ext = format === 'png' ? 'png' : 'jpg';
                        tempImageUri = `${FileSystem.cacheDirectory}pdf_image_${Date.now()}.${ext}`;
                        await FileSystem.writeAsStringAsync(tempImageUri, base64Data, {
                            encoding: FileSystem.EncodingType.Base64,
                        });
                        
                        // Проверяем, что файл создан
                        const fileInfo = await FileSystem.getInfoAsync(tempImageUri);
                        if (fileInfo.exists) {
                            console.log('[PDF] Temp file created and verified:', tempImageUri, 'Size:', fileInfo.size);
                            // WebView в expo-print на Android не грузит file:// — используем data URI в img
                            const safeDataUri = imgSrc.replace(/"/g, '&quot;');
                            imgTag = `<img src="${safeDataUri}" alt="" style="width:100%;max-width:320px;height:auto;display:block;margin:16px auto;border-radius:8px;" />`;
                            console.log('[PDF] Using data URI in img tag (file:// blocked in WebView)');
                        } else {
                            throw new Error('File was not created');
                        }
                    } catch (fileErr) {
                        console.warn('[PDF] Failed to create/verify temp file, using data URI:', fileErr);
                        // Fallback: используем data URI напрямую
                        imgTag = `<img src='${imgSrc}' alt="" style="width:100%;max-width:320px;height:auto;display:block;margin:16px auto;border-radius:8px;" />`;
                        console.log('[PDF] Fallback to data URI');
                    }
                } else {
                    console.warn('[PDF] Invalid data URI format, trying as-is');
                    // Fallback: пробуем как есть
                    imgTag = `<img src='${imgSrc}' alt="" style="width:100%;max-width:320px;height:auto;display:block;margin:16px auto;border-radius:8px;" />`;
                }
            } else if (imgSrc && imgSrc.startsWith('file://')) {
                // Если уже file:// URI, используем напрямую
                const safeFileUri = imgSrc.replace(/"/g, '&quot;');
                imgTag = `<img src="${safeFileUri}" alt="" style="width:100%;max-width:320px;height:auto;display:block;margin:16px auto;border-radius:8px;" />`;
                console.log('[PDF] Using existing file:// URI');
            } else {
                console.warn('[PDF] No valid image source found, imgSrc:', imgSrc?.substring(0, 50));
            }
        } catch (e) {
            console.error('[PDF] Error preparing image:', e);
        }
        
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
body{font-family:system-ui,-apple-system,sans-serif;padding:20px;color:#111827;font-size:14px;line-height:1.6;}
h1{color:#111827;font-size:22px;margin:0 0 4px 0;letter-spacing:0.04em;}
.sub{color:#6b7280;font-size:12px;margin-bottom:24px;}
.report-label{color:#10b981;font-weight:700;font-size:11px;margin-top:12px;letter-spacing:0.18em;text-transform:uppercase;}
.section{margin:28px 0 24px 0;}
.section-title{position:relative;font-weight:800;font-size:13px;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.12em;display:flex;align-items:center;color:#111827;}
.section-title::before{content:'';display:inline-block;width:3px;height:14px;border-radius:999px;margin-right:8px;background:#3b82f6;}
.section-title.blue{color:#3b82f6;}
.section-title.red{color:#ef4444;}
.section-title.green{color:#10b981;}
.section-title.red::before{background:#ef4444;}
.section-title.green::before{background:#10b981;}
.section-content{color:#374151;white-space:pre-wrap;font-size:13px;line-height:1.7;margin-left:11px;}
</style></head><body>
<p class="report-label">DIAGNOSIS REPORT</p>
<p class="sub">PlantLens AI • ${new Date().toLocaleDateString()}</p>
<h1>${esc(pdfTitle.toUpperCase())}</h1>
<p class="sub">${esc(categoryName)}</p>
${imgTag}
<div class="section"><div class="section-title blue">${esc(t('diag_symptoms').toUpperCase())}</div><div class="section-content">${esc(pdfSymptoms)}</div></div>
<div class="section"><div class="section-title red">${esc(t('diag_treatment').toUpperCase())}</div><div class="section-content">${esc(pdfTreatment)}</div></div>
<div class="section"><div class="section-title green">${esc(t('diag_prevention').toUpperCase())}</div><div class="section-content">${esc(pdfPrevention)}</div></div>
</body></html>`;
        
        console.log('[PDF] HTML length:', html.length);
        console.log('[PDF] Image tag present:', imgTag.length > 0);
        console.log('[PDF] Image tag preview:', imgTag.substring(0, 100));
        
        try {
            const { uri } = await Print.printToFileAsync({ html });
            // Удаляем временный файл после использования
            if (tempImageUri) {
                try {
                    await FileSystem.deleteAsync(tempImageUri, { idempotent: true });
                } catch (e) {
                    console.warn('[PDF] Failed to delete temp image:', e);
                }
            }
            return uri;
        } catch (e) {
            // Удаляем временный файл при ошибке
            if (tempImageUri) {
                try {
                    await FileSystem.deleteAsync(tempImageUri, { idempotent: true });
                } catch {}
            }
            throw e;
        }
    };

    const generatePdfBlob = async (): Promise<string> => {
        const pdfTitle = problem.titleKey ? t(problem.titleKey as any) : problem.title;
        const pdfSymptoms = problem.titleKey ? (t('diag_symptoms_p1').replace('{name}', pdfTitle) + '\n\n' + t('diag_symptoms_p2').replace('{name}', pdfTitle)) : problem.content.symptoms;
        const pdfTreatment = problem.titleKey ? (t('diag_treatment_p1').replace('{name}', pdfTitle) + '\n\n' + t('diag_treatment_p2').replace('{name}', pdfTitle)) : problem.content.treatment;
        const pdfPrevention = problem.titleKey ? (t('diag_prevention_p1').replace('{name}', pdfTitle) + '\n\n' + t('diag_prevention_p2').replace('{name}', pdfTitle)) : problem.content.prevention;

        const pdf = new jsPDF();
        await loadCyrillicFont(pdf);

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 20;
        let y = 15;

        drawPdfLogo(pdf, margin, y, 12, 'dark');
        
        pdf.setFont('Roboto', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(16, 185, 129);
        pdf.text("DIAGNOSIS REPORT", margin + 15, y + 6);
        
        pdf.setFont('Roboto', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(156, 163, 175);
        pdf.text(`PlantLens AI • ${new Date().toLocaleDateString()}`, margin + 15, y + 11);

        y = 50;

        pdf.setFont('Roboto', 'bold');
        pdf.setTextColor(31, 41, 55);
        pdf.setFontSize(26);
        pdf.text(pdfTitle.toUpperCase(), margin, y);
        y += 10;
        
        pdf.setFont('Roboto', 'normal');
        pdf.setTextColor(107, 114, 128);
        pdf.setFontSize(12);
        pdf.text(categoryName, margin, y);
        
        y += 35;

        const imgW = 100;
        const imgH = 65;
        const imgX = (pageWidth - imgW) / 2;
        let imageDrawn = false;
        try {
            let imgData: string | null = null;
            let format: 'JPEG' | 'PNG' = 'JPEG';
            const imageUrl = problem.imageUrl ?? '';
            if (imageUrl.startsWith('data:')) {
                imgData = imageUrl;
            } else if (imageUrl.startsWith('file://')) {
                const base64 = await FileSystem.readAsStringAsync(imageUrl, { encoding: FileSystem.EncodingType.Base64 });
                const ext = (imageUrl.split('.').pop() || '').toLowerCase();
                format = ext === 'png' ? 'PNG' : 'JPEG';
                imgData = `data:image/${format === 'PNG' ? 'png' : 'jpeg'};base64,${base64}`;
            } else if (imageUrl.startsWith('http')) {
                imgData = await getBase64ImageFromUrl(imageUrl);
            }
            if (!imgData && problem.imageIndex != null) {
                const local = DISEASE_ZONE_PLANT_IMAGES[problem.imageIndex]?.uri;
                if (local && typeof local === 'string' && local.startsWith('data:')) {
                    imgData = local;
                }
            }
            if (imgData && imgData.startsWith('data:')) {
                format = imgData.includes('image/png') || imgData.includes(';base64,iVBORw') ? 'PNG' : 'JPEG';
                const base64Only = imgData.includes('base64,') ? imgData.split('base64,')[1].replace(/\s/g, '') : imgData.replace(/\s/g, '');
                const useRawBase64 = base64Only.length > 400000;
                try {
                    if (useRawBase64) {
                        pdf.addImage(base64Only, format, imgX, y, imgW, imgH, undefined, 'FAST');
                    } else {
                        pdf.addImage(imgData, format, imgX, y, imgW, imgH, undefined, 'FAST');
                    }
                    imageDrawn = true;
                } catch (_) {
                    try {
                        pdf.addImage(base64Only, format, imgX, y, imgW, imgH, undefined, 'FAST');
                        imageDrawn = true;
                    } catch (__) {}
                }
            }
            if (!imageDrawn) {
                try {
                    pdf.addImage({
                        imageData: FALLBACK_PDF_IMAGE,
                        format: 'PNG',
                        x: imgX,
                        y,
                        width: imgW,
                        height: imgH,
                        compression: 'FAST',
                    });
                } catch (__) {
                    pdf.addImage(FALLBACK_PDF_IMAGE, 'PNG', imgX, y, imgW, imgH, undefined, 'FAST');
                }
            }
            pdf.setDrawColor(229, 231, 235);
            pdf.rect(imgX, y, imgW, imgH, 'S');
            y += imgH + 25;
        } catch (e) {
            try {
                pdf.addImage({
                    imageData: FALLBACK_PDF_IMAGE,
                    format: 'PNG',
                    x: imgX,
                    y,
                    width: imgW,
                    height: imgH,
                    compression: 'FAST',
                });
                pdf.rect(imgX, y, imgW, imgH, 'S');
                y += imgH + 25;
            } catch (__) {
                y += 10;
            }
        }

        const drawSection = async (title: string, content: string, _sectionImg: string, headerColor: [number, number, number]) => {
            if (y > pageHeight - 90) { pdf.addPage(); y = 25; }
            
            pdf.setFillColor(headerColor[0], headerColor[1], headerColor[2]);
            pdf.rect(margin, y, 3, 10, 'F'); 
            
            pdf.setFont('Roboto', 'bold');
            pdf.setFontSize(14);
            pdf.setTextColor(headerColor[0], headerColor[1], headerColor[2]);
            pdf.text(title.toUpperCase(), margin + 6, y + 8);
            y += 15;

            pdf.setFont('Roboto', 'normal');
            pdf.setFontSize(11);
            pdf.setTextColor(55, 65, 81);
            
            const lines = pdf.splitTextToSize(content, pageWidth - margin * 2);
            lines.forEach((line: string) => {
                if (y > pageHeight - margin) { pdf.addPage(); y = 25; }
                pdf.text(line, margin, y);
                y += 6;
            });
            y += 15;
        };

        await drawSection(t('diag_symptoms'), pdfSymptoms, problem.content.symptomsImg, [59, 130, 246]);
        await drawSection(t('diag_treatment'), pdfTreatment, problem.content.treatmentImg, [239, 68, 68]);
        await drawSection(t('diag_prevention'), pdfPrevention, problem.content.preventionImg, [16, 185, 129]);

        return pdf.output('datauristring');
    };

    const handleShare = async () => {
        setIsExporting(true);
        setIsExportMenuOpen(false);
        try {
            let fileUri: string;
            try {
                fileUri = await generatePdfViaPrint();
            } catch (_) {
                const dataUri = await generatePdfBlob();
                const base64 = dataUri.split(',')[1];
                const fileName = `Diagnosis_${(problem.titleKey ? t(problem.titleKey as any) : problem.title).replace(/\s+/g, '_')}.pdf`;
                fileUri = `${FileSystem.documentDirectory}${fileName}`;
                await FileSystem.writeAsStringAsync(fileUri, base64 || '', { encoding: FileSystem.EncodingType.Base64 });
            }
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportPdf = async () => {
        setIsExporting(true);
        setIsExportMenuOpen(false);
        const fileName = `Diagnosis_${(problem.titleKey ? t(problem.titleKey as any) : problem.title).replace(/\s+/g, '_')}.pdf`;
        try {
            const dataUri = await generatePdfBlob();
            const base64 = dataUri.split(',')[1];
            const path = await savePdfToReportsFolder(fileName, base64 || '');
            if (path) setShowPdfSavedModal(true);
        } catch (e) {
            console.error(e);
        } finally {
            setIsExporting(false);
        }
    };

    const handleToggleBookmark = async () => {
        await toggleFavoriteDiagnosis(problem.title);
        setIsBookmarked(!isBookmarked);
    };

    const severity = problem.severity === 'high' 
        ? { label: t('diag_severity_high'), color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.2)' } 
        : (problem.severity === 'medium' 
            ? { label: t('diag_severity_med'), color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)', border: 'rgba(251, 191, 36, 0.2)' } 
            : { label: t('diag_severity_low'), color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.1)', border: 'rgba(96, 165, 250, 0.2)' });

    const progressScale = scrollY.interpolate({
        inputRange: [0, 1000],
        outputRange: [0, 1],
        extrapolate: 'clamp',
    });

    const diseaseName = problem.titleKey ? t(problem.titleKey as any) : problem.title;
    const displayDesc = problem.titleKey ? t('diag_pathology_desc').replace('{name}', diseaseName) : problem.desc;
    const getSectionContent = (p1Key: 'diag_symptoms_p1' | 'diag_treatment_p1' | 'diag_prevention_p1', p2Key: 'diag_symptoms_p2' | 'diag_treatment_p2' | 'diag_prevention_p2') =>
        problem.titleKey ? (t(p1Key).replace('{name}', diseaseName) + '\n\n' + t(p2Key).replace('{name}', diseaseName)) : '';

    const sections = [
        { title: t('diag_symptoms'), icon: 'flask' as const, content: problem.titleKey ? getSectionContent('diag_symptoms_p1', 'diag_symptoms_p2') : problem.content.symptoms, img: problem.content.symptomsImg, color: '#60a5fa', accent: 'rgba(59, 130, 246, 0.2)' },
        { title: t('diag_treatment'), icon: 'medical' as const, content: problem.titleKey ? getSectionContent('diag_treatment_p1', 'diag_treatment_p2') : problem.content.treatment, img: problem.content.treatmentImg, color: '#ef4444', accent: 'rgba(239, 68, 68, 0.2)' },
        { title: t('diag_prevention'), icon: 'shield-checkmark' as const, content: problem.titleKey ? getSectionContent('diag_prevention_p1', 'diag_prevention_p2') : problem.content.prevention, img: problem.content.preventionImg, color: '#10b981', accent: 'rgba(16, 185, 129, 0.2)' }
    ];

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.borderLight, paddingTop: insets.top + 8 }]}>
                <View style={styles.headerContent}>
                    <Pressable onPress={handleBack} style={[styles.headerButton, { backgroundColor: colors.surface }]}>
                        <Ionicons name="arrow-back" size={20} color={colors.text} />
                    </Pressable>
                    <View style={styles.headerCenter}>
                        <Text style={[styles.headerCategory, { color: colors.textMuted }]}>{categoryName}</Text>
                        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{diseaseName}</Text>
                    </View>
                    <View style={styles.headerActions}>
                        <View style={styles.exportMenuContainer}>
                            <Pressable 
                                onPress={() => setIsExportMenuOpen(!isExportMenuOpen)} 
                                style={[styles.headerButton, { backgroundColor: colors.surface }]}
                            >
                                {isExporting ? (
                                    <ActivityIndicator size="small" color={colors.text} />
                                ) : (
                                    <Ionicons name="share" size={20} color={colors.text} />
                                )}
                            </Pressable>
                            <Modal
                                visible={isExportMenuOpen}
                                transparent={true}
                                animationType="fade"
                                onRequestClose={() => setIsExportMenuOpen(false)}
                            >
                                <Pressable 
                                    style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
                                    onPress={() => setIsExportMenuOpen(false)}
                                >
                                    <View 
                                        style={[
                                            styles.exportMenuPosition, 
                                            { top: insets.top + 76, right: 16 } 
                                        ]}
                                        onStartShouldSetResponder={() => true}
                                    >
                                        <View style={[styles.exportMenu, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                                            <Pressable 
                                                onPress={handleExportPdf}
                                                style={[styles.exportMenuItem, { borderBottomColor: colors.borderLight }]}
                                            >
                                                <Ionicons name="download" size={16} color={colors.info} />
                                                <Text style={[styles.exportMenuText, { color: colors.text }]}>{t('export_pdf')}</Text>
                                            </Pressable>
                                            <Pressable 
                                                onPress={handleShare}
                                                style={styles.exportMenuItem}
                                            >
                                                <Ionicons name="share" size={16} color={colors.primary} />
                                                <Text style={[styles.exportMenuText, { color: colors.text }]}>Share File</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                </Pressable>
                            </Modal>
                        </View>
                        <Pressable 
                            onPress={handleToggleBookmark}
                            style={[
                                styles.bookmarkButton,
                                { backgroundColor: colors.surface },
                                isBookmarked && styles.bookmarkButtonActive,
                            ]}
                        >
                            <Ionicons 
                                name={isBookmarked ? "bookmark" : "bookmark-outline"} 
                                size={20} 
                                color={isBookmarked ? colors.primary : colors.textMuted} 
                            />
                        </Pressable>
                    </View>
                </View>
            </View>

            <Animated.ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: false }
                )}
                scrollEventThrottle={16}
            >
                <View style={[styles.heroImageContainer, { backgroundColor: colors.surface }]}>
                    <Image
                        source={problem.imageIndex != null && DISEASE_ZONE_PLANT_IMAGES[problem.imageIndex]?.uri ? DISEASE_ZONE_PLANT_IMAGES[problem.imageIndex].uri : problem.imageUrl}
                        style={styles.heroImage}
                        contentFit="cover"
                        placeholder={colors.surface}
                        transition={200}
                    />
                    <View style={styles.heroOverlay} />
                    <View style={styles.heroContent}>
                        <View style={[styles.severityBadge, { backgroundColor: severity.bg, borderColor: severity.border }]}>
                            <Text style={[styles.severityText, { color: severity.color }]}>{severity.label}</Text>
                        </View>
                        <Text style={styles.heroTitle}>{diseaseName}</Text>
                    </View>
                </View>

                <View style={styles.content}>
                    <View style={styles.descCard}>
                        <Text style={styles.descText}>"{displayDesc}"</Text>
                    </View>

                    {sections.map((sec, i) => (
                        <View key={i} style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                            <View style={[styles.sectionHeaderRow, { borderBottomColor: colors.borderLight }]}>
                                <View style={[styles.sectionIconContainer, { backgroundColor: theme === 'dark' ? `${sec.color}30` : `${sec.color}18` }]}>
                                    <Ionicons name={sec.icon} size={22} color={sec.color} />
                                </View>
                                <Text style={[styles.sectionTitle, { color: colors.text }]}>{sec.title}</Text>
                            </View>
                            <View style={[styles.sectionTextContainer, { backgroundColor: colors.card }]} collapsable={false}>
                                <Text
                                    style={[styles.sectionText, { color: colors.textSecondary }]}
                                    selectable
                                    allowFontScaling
                                >
                                    {String(sec.content || '').trim() || '—'}
                                </Text>
                            </View>
                        </View>
                    ))}

                    <View style={styles.ctaCard}>
                        <View style={styles.ctaIconContainer}>
                            <Ionicons name="shield-checkmark" size={32} color="#ffffff" />
                        </View>
                        <Text style={styles.ctaTitle}>{t('diag_expert_cta_title')}</Text>
                        <Text style={styles.ctaDesc}>{t('diag_expert_cta_desc')}</Text>
                        <Pressable
                            onPress={() => navigation.navigate('NewCameraScreen' as never, { analysisMode: 'diagnosis' } as never)}
                            style={({ pressed }) => [
                                styles.ctaButton,
                                pressed && styles.ctaButtonPressed,
                            ]}
                        >
                            <Ionicons name="scan" size={20} color="#000000" />
                            <Text style={styles.ctaButtonText}>{t('nav_scan')}</Text>
                        </Pressable>
                    </View>
                </View>
            </Animated.ScrollView>

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
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 100,
    },
    header: {
        borderBottomWidth: 1,
        // paddingTop, backgroundColor, borderBottomColor — через inline
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    headerButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 9999,
        padding: 10,
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    headerCategory: {
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 3.2,
        color: '#9ca3af',
        marginBottom: 2,
    },
    headerTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#ffffff',
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    exportMenuContainer: {
        position: 'relative',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    exportMenuPosition: {
        position: 'absolute',
        alignSelf: 'flex-end',
    },
    exportMenu: {
        backgroundColor: '#ffffff',
        borderRadius: 24,
        overflow: 'hidden',
        minWidth: 192,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    exportMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    },
    exportMenuText: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#111827',
    },
    bookmarkButton: {
        borderRadius: 9999,
        padding: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    bookmarkButtonActive: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    heroImageContainer: {
        width: '100%',
        aspectRatio: 1,
        position: 'relative',
    },
    heroImage: {
        width: '100%',
        height: '100%',
    },
    heroOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '20%',
        backgroundColor: 'rgba(30, 34, 31, 0.75)',
    },
    heroContent: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 12,
        paddingVertical: 2,
    },
    severityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 9999,
        borderWidth: 1,
        alignSelf: 'flex-start',
        marginBottom: 2,
    },
    severityText: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
    },
    heroTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#ffffff',
        lineHeight: 28,
        letterSpacing: -0.5,
        marginBottom: 4,
    },
    content: {
        padding: 24,
        maxWidth: 768,
        alignSelf: 'center',
        width: '100%',
    },
    descCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 32,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        marginBottom: 40,
    },
    descText: {
        fontSize: 14,
        color: '#d1d5db',
        lineHeight: 22,
        fontStyle: 'italic',
        fontWeight: '500',
    },
    sectionCard: {
        borderRadius: 24,
        borderWidth: 1,
        marginBottom: 24,
        overflow: 'hidden',
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
    },
    sectionIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        flex: 1,
        flexShrink: 1,
    },
    sectionTextContainer: {
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 20,
        alignSelf: 'stretch',
        minHeight: 100,
    },
    sectionText: {
        fontSize: 15,
        lineHeight: 22,
        fontWeight: '400',
        flexShrink: 0,
    },
    ctaCard: {
        marginTop: 48,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        padding: 40,
        borderRadius: 48,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.2)',
        alignItems: 'center',
    },
    ctaIconContainer: {
        width: 64,
        height: 64,
        backgroundColor: '#10b981',
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    ctaTitle: {
        fontSize: 24,
        fontWeight: '900',
        color: '#ffffff',
        marginBottom: 8,
        textAlign: 'center',
    },
    ctaDesc: {
        fontSize: 14,
        color: '#9ca3af',
        marginBottom: 32,
        textAlign: 'center',
        maxWidth: 300,
        lineHeight: 22,
    },
    ctaButton: {
        width: '100%',
        backgroundColor: '#ffffff',
        paddingVertical: 20,
        borderRadius: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    ctaButtonPressed: {
        transform: [{ scale: 0.95 }],
    },
    ctaButtonText: {
        color: '#000000',
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
});

export default ProblemDetailScreen;
