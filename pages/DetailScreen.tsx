import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image, TextInput, Modal, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { ScannedDocument } from '../types';
import { getDocumentById, saveDocument, deleteDocument } from '../services/storageService';
import { generateAiInsights } from '../services/geminiService';
import { useSubscription } from '../hooks/useSubscription';
import jsPDF from 'jspdf';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';
import { loadCyrillicFont, drawPdfLogo } from '../services/pdfUtils';
import { savePdfToReportsFolder } from '../services/pdfSaveService';
import { SaveSuccessModal } from '../components/SaveSuccessModal';

const DetailScreen: React.FC = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { t, language } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);

    const documentId = (route.params as any)?.documentId || (route.params as any)?.id;
    const [doc, setDoc] = useState<ScannedDocument | null>(null);
    const [activeTab, setActiveTab] = useState<'ocr' | 'ai'>('ocr');
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [title, setTitle] = useState('');
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [showPdfSavedModal, setShowPdfSavedModal] = useState(false);

    const { isSubscribed, checkSubscription } = useSubscription();
    const [isAiLoading, setIsAiLoading] = useState(false);

    useEffect(() => {
        checkSubscription();
        const loadDocument = async () => {
            if (documentId) {
                const foundDoc = await getDocumentById(documentId);
                if (foundDoc) {
                    setDoc(foundDoc);
                    setTitle(foundDoc.title);
                } else {
                    navigation.navigate('Documents' as never);
                }
            }
        };
        loadDocument();
    }, [documentId, navigation, checkSubscription]);

    const handleBack = () => {
        navigation.goBack();
    };

    const handleTabSwitch = async (tab: 'ocr' | 'ai') => {
        setActiveTab(tab);
        if (tab === 'ai' && !isAiLoading && isSubscribed && !doc?.aiInsights && doc?.ocrText) {
            setIsAiLoading(true);
            const result = await generateAiInsights(doc.ocrText, language);
            if (doc) { 
                if (!('error' in result)) {
                    const updatedDoc = { ...doc, aiInsights: result };
                    await saveDocument(updatedDoc);
                    setDoc(updatedDoc);
                }
            }
            setIsAiLoading(false);
        }
    };

    const generatePdfBlob = async (): Promise<string> => {
        if (!doc) throw new Error("No document data");
        const pdf = new jsPDF();
        
        await loadCyrillicFont(pdf);

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 20;

        pdf.setDrawColor(209, 213, 219);
        pdf.setLineWidth(0.5);
        pdf.line(margin, 35, pageWidth - margin, 35);

        drawPdfLogo(pdf, margin, 12, 18, 'dark');
        
        pdf.setFontSize(14);
        pdf.setTextColor(16, 185, 129);
        pdf.setFont('Roboto', 'bold');
        pdf.text('ScanLens DocScan', margin + 25, 20);
        
        pdf.setFontSize(10);
        pdf.setTextColor(55, 65, 81);
        pdf.setFont('Roboto', 'bold');
        const titleLines = pdf.splitTextToSize(doc.title.toUpperCase(), 80);
        pdf.text(titleLines, pageWidth - margin, 20, { align: 'right' });
        
        pdf.setFontSize(8);
        pdf.setTextColor(156, 163, 175);
        pdf.setFont('Roboto', 'normal');
        pdf.text(new Date(doc.createdAt).toLocaleDateString(), pageWidth - margin, 20 + (titleLines.length * 4), { align: 'right' });

        let y = 50;

        const addSectionTitle = (title: string) => {
            if (y > pageHeight - 30) { pdf.addPage(); y = 20; }
            pdf.setFillColor(243, 244, 246);
            pdf.rect(margin, y, pageWidth - margin*2, 8, 'F');
            
            pdf.setFontSize(10);
            pdf.setTextColor(31, 41, 55);
            pdf.setFont('Roboto', 'bold');
            pdf.text(title, margin + 5, y + 5.5);
            y += 12;
        };

        if (doc.aiInsights) {
            addSectionTitle('AI EXECUTIVE SUMMARY');
            
            pdf.setFontSize(10);
            pdf.setTextColor(55, 65, 81);
            pdf.setFont('Roboto', 'normal');
            const sumLines = pdf.splitTextToSize(doc.aiInsights.summary, pageWidth - margin * 2);
            pdf.text(sumLines, margin, y);
            y += sumLines.length * 5 + 8;

            if (doc.aiInsights.actionItems.length > 0) {
                addSectionTitle('ACTION ITEMS');
                doc.aiInsights.actionItems.forEach(item => {
                    if (y > pageHeight - 15) { pdf.addPage(); y = 20; }
                    pdf.setFillColor(16, 185, 129);
                    pdf.circle(margin + 2, y - 1.5, 1.5, 'F');
                    
                    const itemLines = pdf.splitTextToSize(item, pageWidth - margin * 2 - 10);
                    pdf.text(itemLines, margin + 8, y);
                    y += itemLines.length * 5 + 3;
                });
                y += 5;
            }
        }

        if (doc.ocrText) {
            addSectionTitle('EXTRACTED TEXT CONTENT');
            pdf.setFontSize(9);
            pdf.setFont('Courier', 'normal');
            pdf.setTextColor(55, 65, 81);
            
            const textLines = pdf.splitTextToSize(doc.ocrText, pageWidth - margin * 2);
            textLines.forEach((line: string) => {
                if (y > pageHeight - 15) { pdf.addPage(); y = 20; }
                pdf.text(line, margin, y);
                y += 5;
            });
        }

        const pageCount = pdf.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            pdf.setPage(i);
            pdf.setFontSize(8);
            pdf.setFont('Roboto', 'normal');
            pdf.setTextColor(156, 163, 175);
            pdf.text(`ScanLens Confidential • Page ${i} / ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        }

        return pdf.output('datauristring');
    };

    const handleShare = async () => {
        if (!doc) return;
        setIsExportMenuOpen(false);
        setIsExporting(true);
        try {
            const dataUri = await generatePdfBlob();
            const base64 = dataUri.split(',')[1];
            const fileName = `ScanLens_Doc_${doc.id.slice(0, 8)}.pdf`;
            const fileUri = `${FileSystem.documentDirectory}${fileName}`;
            await FileSystem.writeAsStringAsync(fileUri, base64 || '', { encoding: FileSystem.EncodingType.Base64 });
            if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri);
            setIsExporting(false);
        } catch (err) { 
            console.error(err);
            setIsExporting(false);
        }
    };

    const handleExport = async () => {
        if (!doc) return;
        setIsExportMenuOpen(false);
        setIsExporting(true);
        try {
            const dataUri = await generatePdfBlob();
            const base64 = dataUri.split(',')[1];
            const fileName = `ScanLens_Doc_${doc.id.slice(0, 8)}.pdf`;
            const path = await savePdfToReportsFolder(fileName, base64 || '');
            if (path) setShowPdfSavedModal(true);
            setIsExporting(false);
        } catch (err) {
            console.error(err);
            setIsExporting(false);
        }
    };

    const handleTitleSave = async () => {
        if (doc && title.trim()) {
            const updatedDoc = { ...doc, title: title.trim() };
            await saveDocument(updatedDoc);
            setDoc(updatedDoc);
            setIsEditingTitle(false);
        }
    };

    const handleDelete = () => {
        Alert.alert(
            t('delete_scan_title'),
            t('delete_plant_desc'),
            [
                { text: t('delete_cancel'), style: "cancel" },
                { 
                    text: t('delete_confirm'), 
                    style: "destructive",
                    onPress: async () => {
                        if (doc) {
                            await deleteDocument(doc.id);
                            navigation.navigate('MainTabs' as never, { screen: 'Home' } as never);
                        }
                    }
                }
            ]
        );
    };

    if (!doc) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#10b981" />
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.imageContainer}>
                <Image source={{ uri: doc.imageUrl }} style={styles.image} resizeMode="contain" />
                <View style={styles.imageOverlay} />
                <View style={styles.imageHeader}>
                    <Pressable onPress={handleBack} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#ffffff" />
                    </Pressable>
                </View>
            </View>

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                <View style={styles.titleContainer}>
                    {isEditingTitle ? (
                        <View style={styles.titleEditContainer}>
                            <TextInput
                                value={title}
                                onChangeText={setTitle}
                                onBlur={handleTitleSave}
                                onSubmitEditing={handleTitleSave}
                                style={styles.titleInput}
                                autoFocus
                            />
                            <Pressable onPress={handleTitleSave} style={styles.titleSaveButton}>
                                <Ionicons name="checkmark" size={24} color="#ffffff" />
                            </Pressable>
                        </View>
                    ) : (
                        <View style={styles.titleRow}>
                            <Text style={styles.title}>{doc.title}</Text>
                            <Pressable onPress={() => setIsEditingTitle(true)} style={styles.editButton}>
                                <Ionicons name="pricetag" size={20} color="#9ca3af" />
                            </Pressable>
                        </View>
                    )}
                    <Text style={styles.date}>{new Date(doc.createdAt).toLocaleString()}</Text>
                </View>

                <View style={styles.tabsContainer}>
                    <Pressable
                        onPress={() => handleTabSwitch('ocr')}
                        style={[styles.tab, activeTab === 'ocr' && styles.tabActive]}
                    >
                        <Ionicons name="document-text" size={18} color={activeTab === 'ocr' ? '#10b981' : '#9ca3af'} />
                        <Text style={[styles.tabText, activeTab === 'ocr' && styles.tabTextActive]}>Текст</Text>
                    </Pressable>
                    {isSubscribed && doc.ocrText && (
                        <Pressable
                            onPress={() => handleTabSwitch('ai')}
                            style={[styles.tab, activeTab === 'ai' && styles.tabActive]}
                        >
                            <MaterialIcons name="smart-toy" size={18} color={activeTab === 'ai' ? '#10b981' : '#9ca3af'} />
                            <Text style={[styles.tabText, activeTab === 'ai' && styles.tabTextActive]}>AI Анализ</Text>
                        </Pressable>
                    )}
                </View>

                <View style={styles.contentContainer}>
                    {activeTab === 'ocr' ? (
                        <Text style={styles.contentText}>
                            {doc.ocrText || <Text style={styles.emptyText}>Текст не найден.</Text>}
                        </Text>
                    ) : (
                        <View style={styles.aiContainer}>
                            {isAiLoading ? (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator size="large" color="#10b981" />
                                    <Text style={styles.loadingText}>AI анализирует документ...</Text>
                                </View>
                            ) : doc.aiInsights ? (
                                <View style={styles.aiCard}>
                                    <Text style={styles.aiSectionTitle}>Резюме:</Text>
                                    <Text style={styles.aiText}>{doc.aiInsights.summary}</Text>
                                    <Text style={[styles.aiSectionTitle, { marginTop: 24, color: '#3b82f6' }]}>Действия:</Text>
                                    {doc.aiInsights.actionItems.map((item, i) => (
                                        <View key={i} style={styles.actionItem}>
                                            <Text style={styles.bullet}>•</Text>
                                            <Text style={styles.actionItemText}>{item}</Text>
                                        </View>
                                    ))}
                                </View>
                            ) : null}
                        </View>
                    )}
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <View style={styles.exportMenuContainer}>
                    <Pressable 
                        onPress={() => setIsExportMenuOpen(!isExportMenuOpen)}
                        style={styles.footerButton}
                    >
                        {isExporting ? (
                            <ActivityIndicator size="small" color="#6b7280" />
                        ) : (
                            <Ionicons name="share" size={24} color="#6b7280" />
                        )}
                        <Text style={styles.footerButtonText}>{t('export_title')}</Text>
                    </Pressable>
                    <Modal
                        visible={isExportMenuOpen}
                        transparent={true}
                        animationType="fade"
                        onRequestClose={() => setIsExportMenuOpen(false)}
                    >
                        <Pressable 
                            style={styles.modalOverlay}
                            onPress={() => setIsExportMenuOpen(false)}
                        >
                            <View style={styles.exportMenu}>
                                <Pressable 
                                    onPress={handleExport}
                                    style={styles.exportMenuItem}
                                >
                                    <Ionicons name="download" size={18} color="#3b82f6" />
                                    <Text style={styles.exportMenuText}>{t('export_pdf')}</Text>
                                </Pressable>
                                <Pressable 
                                    onPress={handleShare}
                                    style={styles.exportMenuItem}
                                >
                                    <Ionicons name="share" size={18} color="#10b981" />
                                    <Text style={styles.exportMenuText}>{t('export_share')}</Text>
                                </Pressable>
                            </View>
                        </Pressable>
                    </Modal>
                </View>
                <Pressable onPress={handleDelete} style={styles.footerButton}>
                    <Ionicons name="trash" size={24} color="#ef4444" />
                    <Text style={[styles.footerButtonText, { color: '#ef4444' }]}>Удалить</Text>
                </Pressable>
            </View>

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
        backgroundColor: '#ffffff',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    loadingText: {
        color: '#6b7280',
        fontSize: 14,
        fontWeight: '700',
    },
    imageContainer: {
        height: 384,
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
        padding: 8,
    },
    imageOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '60%',
        backgroundColor: '#ffffff',
    },
    imageHeader: {
        position: 'absolute',
        top: 60,
        left: 24,
    },
    backButton: {
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 9999,
        padding: 10,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 100,
    },
    titleContainer: {
        padding: 24,
        paddingTop: 0,
        marginTop: -64,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    title: {
        fontSize: 30,
        fontWeight: '900',
        color: '#111827',
        letterSpacing: -0.5,
        flex: 1,
    },
    editButton: {
        padding: 8,
    },
    titleEditContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    titleInput: {
        flex: 1,
        backgroundColor: '#f3f4f6',
        fontSize: 24,
        fontWeight: '900',
        color: '#111827',
        padding: 12,
        borderRadius: 24,
        borderWidth: 2,
        borderColor: '#10b981',
    },
    titleSaveButton: {
        padding: 12,
        backgroundColor: '#10b981',
        borderRadius: 24,
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    date: {
        fontSize: 14,
        color: '#6b7280',
        fontWeight: '500',
        marginTop: 4,
    },
    tabsContainer: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
        paddingHorizontal: 24,
        marginBottom: 24,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: '#10b981',
    },
    tabText: {
        fontSize: 14,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#9ca3af',
    },
    tabTextActive: {
        color: '#10b981',
    },
    contentContainer: {
        paddingHorizontal: 24,
    },
    contentText: {
        fontSize: 16,
        color: '#374151',
        lineHeight: 24,
        whiteSpace: 'pre-wrap',
    },
    emptyText: {
        fontStyle: 'italic',
        color: '#9ca3af',
    },
    aiContainer: {
        gap: 24,
    },
    aiCard: {
        backgroundColor: '#f9fafb',
        padding: 24,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: '#f3f4f6',
    },
    aiSectionTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: '#10b981',
        marginBottom: 12,
    },
    aiText: {
        fontSize: 16,
        color: '#374151',
        lineHeight: 24,
        marginBottom: 24,
    },
    actionItem: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
    },
    bullet: {
        fontSize: 16,
        color: '#3b82f6',
        fontWeight: '700',
    },
    actionItemText: {
        flex: 1,
        fontSize: 14,
        color: '#374151',
        fontWeight: '500',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
        padding: 16,
        paddingBottom: 40,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    exportMenuContainer: {
        position: 'relative',
    },
    footerButton: {
        alignItems: 'center',
        gap: 6,
        padding: 8,
    },
    footerButtonText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: '#6b7280',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    exportMenu: {
        backgroundColor: '#ffffff',
        borderRadius: 32,
        overflow: 'hidden',
        minWidth: 208,
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
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
    },
});

export default DetailScreen;
