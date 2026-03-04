import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image, TextInput, Modal, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { getGardenerTips } from '../services/contentService';
import { getFavoriteArticleIds, toggleFavoriteArticle, getCustomArticles, saveCustomArticle, TipArticle } from '../services/storageService';
import { getPersonalizedCareArticle } from '../services/geminiService';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { useSubscription } from '../hooks/useSubscription';
import { getThemeColors } from '../utils/themeColors';
import { generateUUID } from '../utils/uuid';
import jsPDF from 'jspdf';
import { loadCyrillicFont, drawPdfLogo, getBase64ImageFromUrl } from '../services/pdfUtils';
import { savePdfToReportsFolder } from '../services/pdfSaveService';
import { SaveSuccessModal } from '../components/SaveSuccessModal';
import { getPlantImageAIUrl } from '../services/plantImageService';

const getExtendedFallback = (category: string | undefined, plantName: string = "Растение"): string => {
    if (!category) return "";
    const catLower = category.toLowerCase();
    
    if (catLower.includes('полив') || catLower.includes('water')) {
        return `### 1. Физиология водного обмена\nВода для ${plantName} — это не просто средство утоления жажды, а ключевая транспортная среда для минеральных веществ. При поливе важно понимать структуру корневой системы. Для большинства видов критически важно избегать "эффекта болота": корни должны дышать. Полив должен осуществляться методом полного промачивания земляного кома до появления воды в поддоне, которую затем необходимо слить через 15-20 минут. Это обеспечивает удаление накопившихся солей и доставку влаги к самым нижним корням.\n\n### 2. Температурный режим и качество воды\nИспользуйте исключительно мягкую, отстоянную воду комнатной температуры (на 2-3 градуса выше температуры воздуха). Холодная вода вызывает осмотический шок, блокируя всасывающую способность корневых волосков, что парадоксальным образом приводит к увяданию даже во влажном грунте. Жесткая вода со временем защелачивает почву (хлороз), поэтому рекомендуется периодически добавлять несколько капель лимонного сока на литр воды для нейтрализации карбонатов.\n\n### 3. Диагностика потребности во влаге\nОткажитесь от полива "по расписанию" (например, каждую субботу). Потребность растения меняется в зависимости от освещения и температуры. Используйте правило фаланги: погрузите палец в грунт на 2-3 см. Если почва сухая — пора поливать. Для крупных кашпо используйте деревянную шпажку, опуская ее до дна: если она влажная и с прилипшей землей, полив категорически противопоказан, чтобы избежать анаэробного загнивания.\n\n### 4. Сезонная коррекция\nВ осенне-зимний период метаболизм ${plantName} замедляется из-за сокращения светового дня. В это время частоту полива следует сократить в 2-3 раза, допуская более глубокую просушку субстрата. Самая частая причина гибели зимой — сочетание мокрого грунта и холодного подоконника ("холодные ноги"), что ведет к фузариозу и корневой гнили. Летом же, в период активной вегетации и жары, транспирация (испарение с листьев) максимальна, и некоторым видам может требоваться ежедневный полив.\n\n### 5. Профессиональный лайфхак: Тургор и аэрация\nСледите за тургором (упругостью) листьев. Легкая потеря тургора — самый надежный сигнал к поливу. После каждого третьего полива рекомендуется аккуратно рыхлить верхний слой почвы для разрушения солевой корки и улучшения газообмена. Помните: ${plantName} легче восстановить после легкой засухи, чем спасти от залива.`;
    }
    return `### 1. Комплексный подход к здоровью\nЗдоровье ${plantName} зависит от баланса трех факторов: света, воды и температуры. Нельзя компенсировать недостаток света усиленным питанием или поливом — это лишь ускорит гибель. Всегда начинайте диагностику проблем с оценки условий содержания. Растение — это живой организм с инерцией: реакция на улучшение условий может наступить через 2-3 недели, наберитесь терпения.\n\n### 2. Профилактика стресса\nРастения ненавидят резкие перемены. Сквозняки, перемещение с места на место, резкие скачки температуры вызывают шоковое состояние, при котором останавливается рост и сбрасываются листья. Если необходимо переставить горшок или проветрить комнату зимой, делайте это максимально плавно. Адаптация к новому месту занимает от 2 до 4 недель.\n\n### 3. Питание и стимуляция\nПодкармливайте растение только в период активного роста (весна-лето). Избыток удобрений ("перекорм") гораздо опаснее их недостатка и может вызвать химический ожог корней. Используйте комплексные минеральные удобрения в половинной дозировке от указанной на упаковке. В зимний период и сразу после пересадки (в течение месяца) подкормки запрещены.\n\n### 4. Гигиена и осмотр\nРегулярно осматривайте нижнюю сторону листьев и пазухи — именно там прячутся вредители (клещи, червецы). Чистые листья лучше дышат и фотосинтезируют. Раз в месяц устраивайте растению "банный день" под теплым душем (закрыв грунт пленкой), чтобы смыть пыль и профилактировать появление паутинного клеща.\n\n### 5. Психология цветовода\nНе "залюбливайте" растение. Чрезмерное внимание часто выливается в лишний полив и ненужные манипуляции. Лучшее, что вы можете сделать для ${plantName} — это создать ему стабильные условия, приближенные к природным, и не мешать ему жить. Наблюдайте за языком растения: тургор листьев, цвет и скорость роста скажут вам больше, чем любые инструкции.`;
};

const getCategoryColorRGB = (category: string): [number, number, number] => {
    const c = (category || "").toLowerCase();
    if (c.includes('water') || c.includes('полив') || c.includes('влажн') || c.includes('гидратац')) return [59, 130, 246];
    if (c.includes('light') || c.includes('свет') || c.includes('солн') || c.includes('освещен')) return [245, 158, 11];
    if (c.includes('soil') || c.includes('грунт') || c.includes('земл') || c.includes('субстрат')) return [139, 92, 246];
    if (c.includes('temp') || c.includes('темп') || c.includes('климат')) return [239, 68, 68];
    if (c.includes('pruning') || c.includes('обрезк') || c.includes('уход')) return [249, 115, 22];
    if (c.includes('protect') || c.includes('защит') || c.includes('карантин')) return [220, 38, 38];
    return [16, 185, 129];
};

const ArticleDetailScreen: React.FC = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { t, language } = useI18n();
    const { theme } = useTheme();
    const { isSubscribed } = useSubscription();
    const colors = getThemeColors(theme);
    const scrollViewRef = useRef<ScrollView>(null);
    const { width: screenWidth } = useWindowDimensions();
    const [scrollProgress, setScrollProgress] = useState(0);

    const params = (route.params as any) || {};
    const articleId = params.id || params.articleId;
    const isDynamic = params.isDynamic || false;
    const plantName = params.plantName || "Растение";
    const category = params.category;
    const weather = params.weather;
    const fallbackTitle = params.fallbackTitle;
    const staticArticle = getGardenerTips(language).find(tip => tip.id === articleId) || customArticles.find(tip => tip.id === articleId);
    const articleFromParamsOrStatic = params.article || staticArticle;
    const articleImage = isDynamic
        ? params.plantImage
        : (params.image || (params.article && (params.article as { image?: string }).image) || (articleFromParamsOrStatic && (articleFromParamsOrStatic as { image?: string }).image));

    const [progress, setProgress] = useState(0);
    const [isBookmarked, setIsBookmarked] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [showPdfSavedModal, setShowPdfSavedModal] = useState(false);
    const [isLoadingDynamic, setIsLoadingDynamic] = useState(false);
    const [dynamicContent, setDynamicContent] = useState<{ title: string, text: string } | null>(null);
    const [showFallback, setShowFallback] = useState(false);
    const [customArticles, setCustomArticles] = useState<TipArticle[]>([]);

    const extendedFallbackText = showFallback 
        ? getExtendedFallback(category, plantName)
        : "";

    const article = isDynamic 
        ? (dynamicContent || (showFallback ? { title: fallbackTitle, text: extendedFallbackText, category: category } : null))
        : (params.article || staticArticle);

    useEffect(() => {
        getCustomArticles().then(setCustomArticles);
    }, []);

    useEffect(() => {
        if (isDynamic && isSubscribed && plantName && category) {
            const fetchDynamic = async () => {
                setIsLoadingDynamic(true);
                setShowFallback(false);
                const result = await getPersonalizedCareArticle(plantName, category, weather, language);
                if (result.error) {
                    setShowFallback(true);
                } else {
                    setDynamicContent(result);
                    const custom = await getCustomArticles();
                    if (custom.some(a => a.title === result.title)) {
                        const existing = custom.find(a => a.title === result.title)!;
                        const favorites = await getFavoriteArticleIds();
                        setIsBookmarked(Array.isArray(favorites) && favorites.includes(existing.id));
                    } else {
                        setIsBookmarked(false);
                    }
                }
                setIsLoadingDynamic(false);
            };
            fetchDynamic();
        }
    }, [isDynamic, isSubscribed, plantName, category, weather]);

    useEffect(() => {
        if (article && !isDynamic) {
            const load = async () => {
                const favorites = await getFavoriteArticleIds();
                setIsBookmarked(Array.isArray(favorites) && favorites.includes(article.id));
            };
            load();
        }
    }, [article, isDynamic]);

    const handleBookmarkToggle = async () => {
        if (!article) return;
        if (isDynamic) {
            if (isBookmarked) return;
            const custom = await getCustomArticles();
            if (custom.some(a => a.title === article.title)) return;

            const newArticle = {
                id: generateUUID(),
                title: article.title,
                text: article.text,
                category: category || 'AI Generated',
                color: 'text-purple-400',
                image: articleImage || '',
                plantName: plantName || '',
            };
            try {
                await saveCustomArticle(newArticle);
                await toggleFavoriteArticle(newArticle.id);
                const updated = await getCustomArticles();
                setCustomArticles(updated);
                setIsBookmarked(true);
            } catch (e) {
                console.error('Failed to add protocol to favorites:', e);
                Alert.alert(t('error_title'), t('error_add_favorite_protocol'));
            }
        } else {
            const isNowBookmarked = await toggleFavoriteArticle(article.id);
            setIsBookmarked(isNowBookmarked);
        }
    };

    const generatePdfBlob = async (): Promise<string> => {
        if (!article) throw new Error("No data");
        const pdf = new jsPDF();
        await loadCyrillicFont(pdf);
        
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 20;
        let y = 0;

        pdf.setDrawColor(229, 231, 235);
        pdf.setLineWidth(0.5);
        pdf.line(margin, 40, pageWidth - margin, 40);
        
        drawPdfLogo(pdf, pageWidth - margin - 25, 10, 25, 'dark');

        pdf.setTextColor(16, 185, 129);
        pdf.setFontSize(22);
        pdf.setFont('Roboto', 'bold');
        pdf.text('AI Protocol', margin, 22);
        
        pdf.setTextColor(107, 114, 128);
        pdf.setFontSize(9);
        pdf.setFont('Roboto', 'normal');
        pdf.text(`Generated by PlantLens • ${new Date().toLocaleDateString()}`, margin, 30);
        
        y = 55;

        let mainTitle = isDynamic ? plantName : article.title;
        let subTitle = isDynamic ? category : (article.category || "");

        if (!isDynamic && mainTitle.includes("Protocol:") && mainTitle.includes("-")) {
             const parts = mainTitle.replace("Protocol:", "").split("-");
             if (parts.length >= 2) {
                 mainTitle = parts[0].trim();
                 if (!subTitle) subTitle = parts.slice(1).join("-").trim();
             }
        }

        const catColor = getCategoryColorRGB(subTitle || mainTitle);
        const imgSize = 45; 
        const gap = 5;
        
        let imageToDraw: string | null = null;
        if (articleImage) {
            try {
                if (articleImage.startsWith('data:')) {
                    imageToDraw = articleImage;
                } else if (articleImage.startsWith('http')) {
                    const fullBase64 = await getBase64ImageFromUrl(articleImage);
                    if (fullBase64) imageToDraw = fullBase64;
                } else if (articleImage.startsWith('file://')) {
                    const base64 = await FileSystem.readAsStringAsync(articleImage, { encoding: FileSystem.EncodingType.Base64 });
                    const mime = articleImage.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg';
                    if (base64) imageToDraw = `data:${mime};base64,${base64}`;
                } else {
                    imageToDraw = articleImage;
                }
            } catch (e) {
                console.error('Error loading image for PDF:', e);
            }
        }
        if (!imageToDraw && isDynamic && plantName) {
            try {
                const fallbackUrl = getPlantImageAIUrl(plantName);
                if (fallbackUrl && fallbackUrl.startsWith('http')) {
                    const fullBase64 = await getBase64ImageFromUrl(fallbackUrl);
                    if (fullBase64) imageToDraw = fullBase64;
                }
            } catch (e) {
                console.error('Error loading fallback plant image for PDF:', e);
            }
        }

        const imageFormat = imageToDraw?.includes('image/png') ? 'PNG' : 'JPEG';
        if (imageToDraw) {
            try {
                pdf.addImage(imageToDraw, imageFormat, margin, y, imgSize, imgSize, undefined, 'FAST');
                pdf.setDrawColor(229, 231, 235);
                pdf.rect(margin, y, imgSize, imgSize, 'S');
            } catch (e) {
                console.error('Error drawing image in PDF:', e);
                pdf.setFillColor(243, 244, 246); 
                pdf.rect(margin, y, imgSize, imgSize, 'F');
            }
        } else {
             pdf.setFillColor(243, 244, 246); 
             pdf.rect(margin, y, imgSize, imgSize, 'F');
        }

        const dividerX = margin + imgSize + gap;
        const dividerW = 2; 
        pdf.setFillColor(catColor[0], catColor[1], catColor[2]);
        pdf.rect(dividerX, y, dividerW, imgSize, 'F');

        const textX = dividerX + dividerW + gap + 2; 
        const textW = pageWidth - textX - margin;

        pdf.setTextColor(catColor[0], catColor[1], catColor[2]);
        pdf.setFontSize(10);
        pdf.setFont('Roboto', 'bold');
        const subTitleStr = (subTitle || category || "PROTOCOL").toUpperCase();
        const titleLines = pdf.splitTextToSize(mainTitle, textW);
        const totalTextH = 5 + (titleLines.length * 7);
        let cursorY = y + (imgSize - totalTextH) / 2 + 4; 
        pdf.text(subTitleStr, textX, cursorY);
        cursorY += 6; 
        pdf.setTextColor(31, 41, 55); 
        pdf.setFontSize(16);
        pdf.setFont('Roboto', 'bold');
        pdf.text(titleLines, textX, cursorY);

        y += imgSize + 12;

        pdf.setTextColor(55, 65, 81);
        pdf.setFontSize(11);
        pdf.setFont('Roboto', 'normal');
        
        const textLines = pdf.splitTextToSize(article.text, pageWidth - margin * 2);
        
        textLines.forEach((line: string) => {
            if (y > pageHeight - margin) { pdf.addPage(); y = margin + 10; }
            if (line.trim().startsWith('###') || (line.length < 50 && !line.trim().endsWith('.') && line.trim().length > 3)) {
                 pdf.setFont('Roboto', 'bold');
                 pdf.setTextColor(catColor[0], catColor[1], catColor[2]);
                 pdf.text(line.replace(/#/g, ''), margin, y + 5);
                 y += 10;
                 pdf.setTextColor(55, 65, 81);
                 pdf.setFont('Roboto', 'normal');
            } else {
                 pdf.text(line, margin, y);
                 y += 6;
            }
        });

        const pageCount = pdf.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            pdf.setPage(i);
            pdf.setFontSize(8);
            pdf.setTextColor(156, 163, 175);
            pdf.text(`PlantLens Intelligent Care - Page ${i} / ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        }

        return pdf.output('datauristring');
    };

    const handleDownload = async () => {
        if (!article) return;
        setIsExportMenuOpen(false);
        setIsExporting(true);
        try {
            const dataUri = await generatePdfBlob();
            const base64 = dataUri.split(',')[1];
            const fileName = `ScanLens_AI_Protocol_${plantName || 'Article'}.pdf`;
            const path = await savePdfToReportsFolder(fileName, base64 || '');
            if (path) setShowPdfSavedModal(true);
            setIsExporting(false);
        } catch(e) {
            console.error(e);
            Alert.alert("Ошибка", "Ошибка генерации PDF");
            setIsExporting(false);
        }
    };

    const handleShare = async () => {
        if (!article) return;
        setIsExportMenuOpen(false);
        setIsExporting(true);
        try {
            const dataUri = await generatePdfBlob();
            const base64 = dataUri.split(',')[1];
            const fileName = `ScanLens_AI_Protocol_${plantName || 'Article'}.pdf`;
            const fileUri = `${FileSystem.documentDirectory}${fileName}`;
            await FileSystem.writeAsStringAsync(fileUri, base64 || '', { encoding: FileSystem.EncodingType.Base64 });
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri);
            }
            setIsExporting(false);
        } catch (e) { 
            console.error(e);
            setIsExporting(false);
        }
    };

    const handleBack = () => {
        navigation.goBack();
    };

    const handleScroll = (event: any) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        const scrollableHeight = contentSize.height - layoutMeasurement.height;
        if (scrollableHeight > 0) {
            setScrollProgress((contentOffset.y / scrollableHeight) * 100);
        }
    };

    if (isDynamic && !isSubscribed) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.borderLight }]}>
                    <View style={styles.headerContent}>
                        <Pressable onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: colors.surface }]}>
                            <Ionicons name="arrow-back" size={22} color={colors.text} />
                        </Pressable>
                        <View style={styles.headerTitleContainer}>
                            <Text style={[styles.headerCategory, { color: colors.textMuted }]}>{t('section_care_hub')}</Text>
                            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{t('settings_premium_get')}</Text>
                        </View>
                    </View>
                </View>
                <View style={[styles.loadingContainer, { flex: 1, justifyContent: 'center', padding: 24 }]}>
                    <View style={[styles.loadingCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                        <View style={[styles.loadingSpinnerWrap, { backgroundColor: colors.primaryLight, marginBottom: 16 }]}>
                            <Ionicons name="lock-closed" size={48} color={colors.primary} />
                        </View>
                        <Text style={[styles.loadingTitle, { color: colors.text }]}>{t('settings_premium_get')}</Text>
                        <Text style={[styles.loadingSubtitle, { color: colors.textSecondary, marginBottom: 20 }]}>
                            {t('settings_premium_unlock_all')}
                        </Text>
                        <Pressable
                            onPress={() => navigation.navigate('SubscriptionManage' as never)}
                            style={[styles.homeButton, { backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12 }]}
                        >
                            <Text style={[styles.homeButtonText, { color: '#fff' }]}>{t('settings_premium_get')}</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        );
    }

    if (isLoadingDynamic) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
                <View style={[
                    styles.loadingCard,
                    {
                        backgroundColor: colors.card,
                        borderColor: colors.borderLight,
                        shadowColor: colors.shadow,
                    },
                ]}>
                    <View style={[styles.loadingSpinnerWrap, { backgroundColor: colors.primaryLight }]}>
                        <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                    <Text style={[styles.loadingTitle, { color: colors.text }]}>{t('protocol_generating')}</Text>
                    <Text style={[styles.loadingSubtitle, { color: colors.textSecondary }]}>
                        {t('protocol_analyzing_plant').replace('{name}', plantName)}
                    </Text>
                </View>
            </View>
        );
    }

    if (!article) return null;

    const renderContent = (text: string) => {
        const cleanedLines = text.split('\n').filter(line => {
            const t = line.trim();
            if (t === '```' || t === '```markdown' || t === '```md') return false;
            if (t.startsWith('# ') || t === '#') return false;
            return true;
        });
        return cleanedLines.map((line, index) => {
            if (line.trim().startsWith('###')) {
                return (
                    <Text key={index} style={[styles.headerText, { color: colors.primary }]}>
                        {line.replace(/###/g, '').trim()}
                    </Text>
                );
            }
            if (line.trim() === '') return <View key={index} style={{ height: 8 }} />;
            return (
                <Text key={index} style={[styles.contentText, { color: colors.text }]}>
                    {line}
                </Text>
            );
        });
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.borderLight }]}>
                <View style={[styles.progressBar, { width: `${scrollProgress}%`, backgroundColor: colors.primary }]} />
                <View style={styles.headerContent}>
                    <Pressable onPress={handleBack} style={[styles.backButton, { backgroundColor: colors.surface }]}>
                        <Ionicons name="arrow-back" size={22} color={colors.text} />
                    </Pressable>
                    <View style={styles.headerTitleContainer}>
                        <Text style={[styles.headerCategory, { color: colors.textMuted }]}>
                            {isDynamic ? `${t('protocol_label')} ${category || ''}` : article.category}
                        </Text>
                        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                            {isDynamic ? plantName : article.title}
                        </Text>
                    </View>
                    <View style={styles.headerActions}>
                        {isDynamic && (
                            <>
                                <View style={styles.exportMenuContainer}>
                                    <Pressable 
                                        onPress={() => setIsExportMenuOpen(!isExportMenuOpen)}
                                        disabled={isExporting}
                                        style={[styles.headerButton, { backgroundColor: colors.surface }]}
                                    >
                                        {isExporting ? (
                                            <ActivityIndicator size="small" color={colors.textMuted} />
                                        ) : (
                                            <Ionicons name="download" size={20} color={colors.textMuted} />
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
                                                    styles.exportMenu, 
                                                    { backgroundColor: colors.card, borderColor: colors.borderLight },
                                                    styles.exportMenuPositionUnderHeader,
                                                    { top: 120, right: 16, maxWidth: screenWidth - 32 },
                                                ]}
                                                onStartShouldSetResponder={() => true}
                                            >
                                                <Pressable 
                                                    onPress={handleDownload}
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
                                        </Pressable>
                                    </Modal>
                                </View>
                                <Pressable 
                                    onPress={handleBookmarkToggle}
                                    style={[styles.headerButton, { backgroundColor: colors.surface }, isBookmarked && styles.bookmarkedButton]}
                                >
                                    <Ionicons 
                                        name={isBookmarked ? "bookmark" : "bookmark-outline"} 
                                        size={20} 
                                        color={isBookmarked ? colors.primary : colors.textMuted} 
                                    />
                                </Pressable>
                            </>
                        )}
                        {!isDynamic && (
                            <Pressable 
                                onPress={handleBookmarkToggle}
                                style={[styles.headerButton, { backgroundColor: colors.surface }, isBookmarked && styles.bookmarkedButton]}
                            >
                                <Ionicons 
                                    name={isBookmarked ? "bookmark" : "bookmark-outline"} 
                                    size={20} 
                                    color={isBookmarked ? colors.primary : colors.textMuted} 
                                />
                            </Pressable>
                        )}
                    </View>
                </View>
            </View>

            <ScrollView 
                ref={scrollViewRef}
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                onScroll={handleScroll}
                scrollEventThrottle={16}
            >
                {isDynamic && showFallback && (
                    <View style={styles.fallbackBanner}>
                        <View style={styles.fallbackIcon}>
                            <Ionicons name="alert-circle" size={24} color="#ffffff" />
                        </View>
                        <View>
                            <Text style={styles.fallbackTitle}>Standard Recommendation</Text>
                            <Text style={styles.fallbackText}>{t('protocol_fallback_message')}</Text>
                        </View>
                    </View>
                )}

                {isDynamic && !showFallback && (
                    <View style={styles.aiBanner}>
                        <View style={styles.aiIcon}>
                            <MaterialIcons name="auto-awesome" size={24} color="#ffffff" />
                        </View>
                        <View style={styles.aiBannerTextWrap}>
                            <Text style={styles.aiTitle}>{t('ai_climate_protocol_title')}</Text>
                            <Text style={styles.aiText}>{t('ai_climate_protocol_description')}</Text>
                        </View>
                    </View>
                )}

                <Text style={[styles.mainTitle, { color: colors.text }]}>{isDynamic ? plantName : article.title}</Text>
                <View style={styles.contentContainer}>
                    {renderContent(article.text)}
                </View>
                
                <View style={[styles.footer, { borderTopColor: colors.borderLight }]}>
                    <Pressable 
                        onPress={() => navigation.navigate('MainTabs' as never, { screen: 'Home' } as never)}
                        style={styles.homeButton}
                    >
                        <Ionicons name="home" size={16} color="#10b981" />
                        <Text style={styles.homeButtonText}>{t('nav_to_home')}</Text>
                    </Pressable>
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
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    loadingCard: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        paddingHorizontal: 32,
        borderRadius: 24,
        borderWidth: 1,
        minWidth: 280,
        maxWidth: 320,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
        elevation: 8,
    },
    loadingSpinnerWrap: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
    },
    loadingTitle: {
        fontSize: 22,
        fontWeight: '800',
        marginBottom: 10,
        letterSpacing: 0.3,
        textAlign: 'center',
    },
    loadingSubtitle: {
        fontSize: 15,
        fontWeight: '500',
        textAlign: 'center',
        lineHeight: 22,
        opacity: 0.9,
    },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        borderBottomWidth: 1,
        zIndex: 100,
        paddingTop: 40,
        // backgroundColor и borderBottomColor применяются через inline стили
    },
    progressBar: {
        height: 4,
        // backgroundColor применяется через inline стили
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    backButton: {
        borderRadius: 9999,
        padding: 10,
        // backgroundColor применяется через inline стили
    },
    headerTitleContainer: {
        flex: 1,
        alignItems: 'center',
        minWidth: 0,
    },
    headerCategory: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 3.2,
        // color применяется через inline стили
    },
    headerTitle: {
        fontSize: 14,
        fontWeight: '900',
        // color применяется через inline стили
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerButton: {
        borderRadius: 9999,
        padding: 10,
        // backgroundColor применяется через inline стили
    },
    bookmarkedButton: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    exportMenuContainer: {
        position: 'relative',
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        // backgroundColor применяется через inline стили
    },
    exportMenu: {
        borderRadius: 24,
        overflow: 'hidden',
        // backgroundColor и borderColor применяются через inline стили
        minWidth: 192,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    exportMenuPositionUnderHeader: {
        position: 'absolute',
    },
    exportMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 16,
        borderBottomWidth: 1,
        // borderBottomColor применяется через inline стили
    },
    exportMenuText: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    scrollView: {
        flex: 1,
        marginTop: 96,
    },
    scrollContent: {
        paddingHorizontal: 28,
        paddingTop: 40,
        paddingBottom: 96,
    },
    fallbackBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        padding: 24,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderRadius: 40,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.2)',
        marginBottom: 32,
    },
    fallbackIcon: {
        padding: 12,
        backgroundColor: '#f59e0b',
        borderRadius: 24,
    },
    fallbackTitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#f59e0b',
        marginBottom: 4,
    },
    fallbackText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#4b5563',
    },
    aiBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingVertical: 24,
        paddingLeft: 24,
        paddingRight: 28,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderRadius: 40,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.2)',
        marginTop: 16,
        marginBottom: 32,
    },
    aiBannerTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    aiIcon: {
        padding: 12,
        backgroundColor: '#10b981',
        borderRadius: 24,
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    aiTitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#10b981',
        marginBottom: 4,
    },
    aiText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#4b5563',
    },
    mainTitle: {
        fontSize: 36,
        fontWeight: '900',
        lineHeight: 40,
        marginBottom: 16,
        letterSpacing: -1,
        // color применяется через inline стили
    },
    contentContainer: {
        paddingBottom: 48,
        maxWidth: '100%',
    },
    headerText: {
        fontSize: 20,
        fontWeight: '900',
        marginTop: 32,
        marginBottom: 16,
        letterSpacing: -0.5,
        // color применяется через inline стили
    },
    contentText: {
        fontSize: 17,
        lineHeight: 30,
        fontWeight: '500',
        marginBottom: 16,
        maxWidth: '100%',
        // color применяется через inline стили
    },
    footer: {
        marginTop: 48,
        paddingTop: 48,
        borderTopWidth: 1,
        alignItems: 'center',
        // borderTopColor применяется через inline стили
    },
    homeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 9999,
    },
    homeButtonText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#10b981',
    },
});

export default ArticleDetailScreen;
