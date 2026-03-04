import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect, ClipPath } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Plant, CareType } from '../types';
import { getPlants } from '../services/storageService';
import { getCachedPlantDetail, setCachedPlantDetail } from '../services/plantCacheService';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';
import { calculateCareDifficulty } from '../services/careCalculator';
import jsPDF from 'jspdf';
import { loadCyrillicFont, drawPdfLogo, getBase64ImageFromUrl } from '../services/pdfUtils';
import { savePdfToReportsFolder } from '../services/pdfSaveService';
import { SaveSuccessModal } from '../components/SaveSuccessModal';

interface PlantAnalysisScreenProps {
    plants: Plant[];
}

const SubMetricScale: React.FC<{ label: string, value: number, color: string, colors: any }> = ({ label, value, color, colors }) => {
    const colorHex = color.includes('rgb') ? color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)?.[1] ? `rgb(${color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)![1]}, ${color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)![2]}, ${color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)![3]})` : '#3b82f6' : '#3b82f6';
    return (
        <View style={styles.subMetricContainer}>
            <View style={styles.subMetricHeader}>
                <Text style={[styles.subMetricLabel, { color: colors.textMuted }]} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
                <Text style={[styles.subMetricValue, { color: colorHex }]}>{value}%</Text>
            </View>
            <View style={[styles.subMetricBar, { backgroundColor: colors.surface }]}>
                <View style={[styles.subMetricBarFill, { width: `${value}%`, backgroundColor: colorHex }]} />
            </View>
        </View>
    );
};

const HealthProgressBar: React.FC<{ label: string, value: number, colorClass: string, colors: any }> = ({ label, value, colorClass, colors }) => {
    const colorHex = colorClass.includes('blue') ? '#3b82f6' : 
                     colorClass.includes('purple') ? '#8b5cf6' : 
                     colorClass.includes('red') ? '#ef4444' : 
                     colorClass.includes('yellow') ? '#eab308' : '#3b82f6';
    return (
        <View style={styles.healthProgressContainer}>
            <View style={styles.healthProgressHeader}>
                <Text style={[styles.healthProgressLabel, { color: colors.textMuted }]}>{label}</Text>
                <Text style={[styles.healthProgressValue, { color: colorHex }]}>{value}%</Text>
            </View>
            <View style={[styles.healthProgressBar, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                <View style={[styles.healthProgressBarFill, { width: `${value}%`, backgroundColor: colorHex }]} />
            </View>
        </View>
    );
};

/** Цвет градиента шкалы рисков (зелёный→жёлтый→красный) в точке p (0–100). */
const getVulnerabilityGradientColorAt = (p: number): string => {
    const t = Math.max(0, Math.min(100, p)) / 100;
    let r: number, g: number, b: number;
    if (t <= 0.5) {
        const s = t * 2; // 0..1 на отрезке зелёный–жёлтый
        r = Math.round(34 + (234 - 34) * s);
        g = Math.round(197 + (179 - 197) * s);
        b = Math.round(94 + (8 - 94) * s);
    } else {
        const s = (t - 0.5) * 2; // 0..1 на отрезке жёлтый–красный
        r = Math.round(234 + (239 - 234) * s);
        g = Math.round(179 + (68 - 179) * s);
        b = Math.round(8 + (68 - 8) * s);
    }
    return `rgb(${r}, ${g}, ${b})`;
};

const PlantAnalysisScreen: React.FC<PlantAnalysisScreenProps> = ({ plants }) => {
    const navigation = useNavigation();
    const route = useRoute();
    const { t } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const insets = useSafeAreaInsets();
    const params = (route.params as any) || {};
    const id = params.id || params.plantId;
    const [plant, setPlant] = useState<Plant | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isReportMenuOpen, setIsReportMenuOpen] = useState(false);
    const [showPdfSavedModal, setShowPdfSavedModal] = useState(false);
    const [careIndexBarSize, setCareIndexBarSize] = useState<{ width: number; height: number } | null>(null);

    useEffect(() => {
        const loadPlant = async () => {
            if (params.plant) {
                setPlant(params.plant);
                setCachedPlantDetail(params.plant).catch(() => {});
                return;
            }
            const cached = await getCachedPlantDetail(id);
            if (cached) setPlant(cached);
            const foundPlant = plants.find(p => p.id === id);
            if (foundPlant) {
                setPlant(foundPlant);
                setCachedPlantDetail(foundPlant).catch(() => {});
            } else {
                try {
                    const freshPlants = await getPlants();
                    if (freshPlants && Array.isArray(freshPlants)) {
                        const freshFound = freshPlants.find(p => p.id === id);
                        if (freshFound) {
                            setPlant(freshFound);
                            setCachedPlantDetail(freshFound).catch(() => {});
                        } else if (!cached) {
                            const parent = navigation.getParent();
                            if (parent) {
                                parent.navigate('MainTabs' as never, { screen: 'MyPlants' } as never);
                            } else {
                                navigation.navigate('MainTabs' as never, { screen: 'MyPlants' } as never);
                            }
                        }
                    } else if (!cached) {
                        const parent = navigation.getParent();
                        if (parent) {
                            parent.navigate('MainTabs' as never, { screen: 'MyPlants' } as never);
                        } else {
                            navigation.navigate('MainTabs' as never, { screen: 'MyPlants' } as never);
                        }
                    }
                } catch (error) {
                    console.error('Failed to load plants:', error);
                    if (!cached) {
                        const parent = navigation.getParent();
                        if (parent) {
                            parent.navigate('MainTabs' as never, { screen: 'MyPlants' } as never);
                        } else {
                            navigation.navigate('MainTabs' as never, { screen: 'MyPlants' } as never);
                        }
                    }
                }
            }
        };
        loadPlant();
    }, [id, plants, navigation, params]);

    useEffect(() => {
        if (plant?.id) setCachedPlantDetail(plant).catch(() => {});
    }, [plant]);

    const confidenceScore = useMemo(() => {
        if (!plant) return 0;
        return plant.latestDiagnosis ? 98 : 82;
    }, [plant]);

    const healthCheckData = useMemo(() => {
        if (!plant || !plant.latestDiagnosis) return null;
        const diagnosis = plant.latestDiagnosis;
        const assessment = diagnosis?.healthAssessment;
        
        // Синхронизация с DiagnosisResultScreen: используем ту же логику
        const healthStats = assessment ?? (diagnosis?.isHealthy
            ? { healthy: 100, pests: 0, diseases: 0, nutrition: 0, abiotic: 0 }
            : { healthy: 95, pests: 5, diseases: 5, nutrition: 5, abiotic: 5 });
        
        // Минимум 1% для всех значений (синхронизировано с DiagnosisResultScreen)
        const pestsValue = Math.max(1, healthStats.pests ?? 0);
        const diseasesValue = Math.max(1, healthStats.diseases ?? 0);
        const nutritionValue = Math.max(1, healthStats.nutrition ?? 0);
        const fungusValue = diseasesValue; // Грибок использует то же значение, что и болезни

        return [
            { labelKey: 'vuln_pests' as const, value: pestsValue, color: "bg-orange-500", rgb: [249, 115, 22] },
            { labelKey: 'vuln_fungus' as const, value: fungusValue, color: "bg-purple-500", rgb: [168, 85, 247] },
            { labelKey: 'vuln_diseases' as const, value: diseasesValue, color: "bg-red-500", rgb: [239, 68, 68] },
            { labelKey: 'vuln_nutrition' as const, value: nutritionValue, color: "bg-yellow-500", rgb: [234, 179, 8] }
        ];
    }, [plant]);

    const vulnerabilities = useMemo(() => {
        if (!plant) return [];
        const watering = (plant.careTips.watering || "").toLowerCase();
        const sunlight = (plant.careTips.sunlight || "").toLowerCase();
        const isSucculent = (plant.plantType || "").toLowerCase().includes('succulent') || (plant.commonName || "").toLowerCase().includes('cactus');
        
        const possibleRisks: { riskKey: 'risk_gray_mold' | 'risk_chlorosis' | 'risk_spider_mite' | 'risk_root_rot' | 'risk_etiolation'; base: number; icon: 'warning' | 'water' | 'bug' | 'pulse' | 'sunny' }[] = [
            { riskKey: "risk_gray_mold", base: 40, icon: 'warning' as const },
            { riskKey: "risk_chlorosis", base: 35, icon: 'water' as const },
            { riskKey: "risk_spider_mite", base: 45, icon: 'bug' as const },
            { riskKey: "risk_root_rot", base: 50, icon: 'pulse' as const },
            { riskKey: "risk_etiolation", base: 30, icon: 'sunny' as const }
        ];

        const seed = plant.scientificName.length;
        return possibleRisks
            .map(risk => {
                let modifier = (seed % 15);
                if (risk.riskKey === "risk_root_rot" && (watering.includes('often') || watering.includes('moist'))) modifier += 25;
                if (risk.riskKey === "risk_spider_mite" && isSucculent) modifier -= 20;
                if (risk.riskKey === "risk_etiolation" && sunlight.includes('bright')) modifier -= 15;
                return { ...risk, risk: Math.min(95, Math.max(15, risk.base + modifier)) };
            })
            .sort((a, b) => b.risk - a.risk)
            .slice(0, 4);
    }, [plant]);

    const topVulnerability = vulnerabilities[0];

    const mineralStatus = useMemo(() => {
        if (!plant) return [];
        const diagnosis = plant.latestDiagnosis;
        const diagText = (diagnosis ? diagnosis.problemTitle + " " + diagnosis.symptoms : "").toLowerCase();
        
        const list = [
            { symbol: 'N', labelKey: 'mineral_nitrogen' as const, keywords: ['азот', 'nitrogen'] }, 
            { symbol: 'P', labelKey: 'mineral_phosphorus' as const, keywords: ['фосфор', 'phosphorus'] },
            { symbol: 'K', labelKey: 'mineral_potassium' as const, keywords: ['калий', 'potassium'] },
            { symbol: 'Fe', labelKey: 'mineral_iron' as const, keywords: ['желез', 'iron', 'хлороз', 'chlorosis'] },
            { symbol: 'Mg', labelKey: 'mineral_magnesium' as const, keywords: ['магний', 'magnesium'] },
            { symbol: 'Ca', labelKey: 'mineral_calcium' as const, keywords: ['кальций', 'calcium'] },
        ];

        return list.map(m => {
            let status: 'none' | 'healthy' | 'deficiency' = 'none';
            if (diagnosis) {
                const found = m.keywords.some(k => diagText.includes(k));
                status = found ? 'deficiency' : 'healthy';
            }
            return { ...m, status };
        });
    }, [plant]);

    const analysisData = useMemo(() => {
        if (!plant) return null;
        const care = calculateCareDifficulty(plant);
        const textContext = (plant.description + (plant.pros?.join(' ') || '')).toLowerCase();
        let growthLabelKey: 'quick_growth_moderate' | 'quick_growth_fast' = "quick_growth_moderate";
        let growthIcon = 'leaf';
        let growthColor = "text-emerald-500";
        let growthBg = "bg-emerald-500/10";
        let growthRGB = [16, 185, 129];

        if (textContext.includes('fast') || textContext.includes('rapid') || textContext.includes('быстр')) {
            growthLabelKey = "quick_growth_fast";
            growthIcon = 'flash';
            growthColor = "text-yellow-500";
            growthBg = "bg-yellow-500/10";
            growthRGB = [234, 179, 8];
        }

        return {
            ...care,
            careIndex: Math.round(care.difficulty),
            quickStats: [
                { labelKey: growthLabelKey, icon: growthIcon, color: growthColor, bg: growthBg, rgb: growthRGB },
                { labelKey: care.resilience > 60 ? "quick_resilient" : "quick_sensitive", icon: 'shield-checkmark', color: "text-green-600", bg: "bg-green-600/10", rgb: [5, 150, 105] },
                { labelKey: "quick_water_balance", icon: 'water', color: "text-blue-500", bg: "bg-blue-500/10", rgb: [59, 130, 246] }
            ],
            resilienceSub: [
                { labelKey: "analysis_drought", val: care.resilienceDetails.drought, color: [59, 130, 246] },
                { labelKey: "analysis_humidity", val: care.resilienceDetails.humidity, color: [6, 182, 212] },
                { labelKey: "analysis_climate", val: care.resilienceDetails.climate, color: [99, 102, 241] },
                { labelKey: "analysis_immune_response", val: care.resilienceDetails.pest, color: [16, 185, 129] },
            ],
            maintenanceSub: [
                { labelKey: "analysis_nutrition", val: care.maintenanceDetails.nutrition, color: [234, 179, 8] },
                { labelKey: "analysis_pruning", val: care.maintenanceDetails.pruning, color: [249, 115, 22] },
                { labelKey: "analysis_precision", val: care.maintenanceDetails.precision, color: [239, 68, 68] },
                { labelKey: "analysis_monitoring_level", val: care.maintenanceDetails.frequency, color: [168, 85, 247] },
            ],
            protocols: [
                { id: 'hydration', titleKey: "protocol_hydration", icon: 'water', tag: "H20 REPORT", desc: plant.careTips.watering, color: [59, 130, 246] },
                { id: 'light', titleKey: "protocol_light_integration", icon: 'sunny', tag: "PHOTON YIELD", desc: plant.careTips.sunlight, color: [234, 179, 8] },
                { id: 'aeration', titleKey: "protocol_aeration", icon: 'swap-horizontal', tag: "ATMOSPHERIC FLOW", descKey: 'protocol_aeration_desc' as const, color: [6, 182, 212] },
                { id: 'substrate', titleKey: "protocol_substrate", icon: 'layers', tag: "SUBSTRATE MATRIX", desc: plant.careTips.soil, color: [168, 85, 247] },
                { id: 'thermal', titleKey: "protocol_thermal", icon: 'thermometer', tag: "THERMAL BUFFER", desc: plant.careTips.temperature || "18-26°C", color: [239, 68, 68] },
                { id: 'bioprotect', titleKey: "protocol_bioprotect", icon: 'shield-checkmark', tag: "IMMUNE SUPPORT", descKey: 'protocol_bioprotect_desc' as const, color: [16, 185, 129] },
            ]
        };
    }, [plant]);

    const generatePdf = async (tFn: (key: string) => string = t) => {
        if (!plant || !analysisData) return null;
        const pdf = new jsPDF();
        await loadCyrillicFont(pdf);
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 20;
        let y = 15;

        // --- HEADER ---
        drawPdfLogo(pdf, margin, y, 15, 'dark');
        pdf.setTextColor(16, 185, 129);
        pdf.setFontSize(14);
        pdf.setFont('Roboto', 'bold');
        pdf.text(tFn('biometric_report_full').toUpperCase(), margin + 20, y + 8);
        
        pdf.setTextColor(156, 163, 175);
        pdf.setFontSize(8);
        pdf.setFont('Roboto', 'normal');
        pdf.text(`Generated by PlantLens AI • ID: ${plant.id.slice(0, 8).toUpperCase()}`, margin + 20, y + 13);

        // Gauge
        const indexX = pageWidth - margin - 12;
        const indexY = y + 8;
        const indexRadius = 8;
        pdf.setDrawColor(243, 244, 246);
        pdf.setLineWidth(2);
        pdf.circle(indexX, indexY, indexRadius, 'S');
        
        const diff = analysisData.careIndex;
        const segments = 40;
        const portion = diff / 100;
        const startAngle = -Math.PI / 2;
        for (let i = 0; i < segments * portion; i++) {
            const step = i / segments;
            let r, g, b;
            if (step < 0.5) {
                r = Math.floor(16 + (245 - 16) * (step * 2));
                g = Math.floor(185 + (158 - 185) * (step * 2));
                b = Math.floor(129 + (11 - 129) * (step * 2));
            } else {
                r = Math.floor(245 + (239 - 245) * ((step - 0.5) * 2));
                g = Math.floor(158 + (68 - 158) * ((step - 0.5) * 2));
                b = Math.floor(11 + (68 - 11) * ((step - 0.5) * 2));
            }
            pdf.setDrawColor(r, g, b);
            pdf.setLineWidth(2.5);
            const a1 = startAngle + (i / segments) * Math.PI * 2;
            const a2 = startAngle + ((i + 1) / segments) * Math.PI * 2;
            pdf.line(indexX + indexRadius * Math.cos(a1), indexY + indexRadius * Math.sin(a1), indexX + indexRadius * Math.cos(a2), indexY + indexRadius * Math.sin(a2));
        }
        pdf.setTextColor(31, 41, 55);
        pdf.setFontSize(10);
        pdf.setFont('Roboto', 'bold');
        pdf.text(`${diff}`, indexX, indexY + 1.2, { align: 'center' });

        y += 35;

        // --- HERO AREA (plant photo) ---
        const heroImageSize = 65;
        try {
            let imgData = plant.imageUrl || '';
            if (imgData.startsWith('file://')) {
                const b64 = await FileSystem.readAsStringAsync(imgData, { encoding: FileSystem.EncodingType.Base64 });
                const ext = (imgData.split('.').pop() || '').toLowerCase();
                const format = ext === 'png' ? 'PNG' : 'JPEG';
                imgData = `data:image/${format === 'PNG' ? 'png' : 'jpeg'};base64,${b64}`;
            } else if (imgData.startsWith('http')) {
                const b64 = await getBase64ImageFromUrl(imgData);
                if (b64) imgData = b64;
            }
            if (imgData.startsWith('data:')) {
                const format = imgData.indexOf('image/png') !== -1 ? 'PNG' : 'JPEG';
                pdf.addImage(imgData, format, margin, y, heroImageSize, heroImageSize);
            }
        } catch (e) {
            console.warn('PDF: could not add plant image', e);
        }

        const contentX = margin + heroImageSize + 5;
        const contentWidth = pageWidth - margin - contentX;
        let cursorY = y + 4;

        pdf.setTextColor(31, 41, 55);
        pdf.setFontSize(18);
        pdf.setFont('Roboto', 'bold');
        const titleLines = pdf.splitTextToSize(plant.commonName.toUpperCase(), contentWidth);
        pdf.text(titleLines, contentX, cursorY);
        cursorY += (titleLines.length * 7);

        pdf.setTextColor(156, 163, 175);
        pdf.setFontSize(9);
        pdf.setFont('Roboto', 'normal');
        pdf.text(plant.scientificName, contentX, cursorY);
        cursorY += 10;

        const statBoxW = (contentWidth - 4) / 3;
        const statBoxH = 12;
        analysisData.quickStats.forEach((stat, idx) => {
            const curX = contentX + idx * (statBoxW + 2);
            pdf.setFillColor(stat.rgb[0], stat.rgb[1], stat.rgb[2]);
            pdf.roundedRect(curX, cursorY, statBoxW, statBoxH, 2, 2, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(6);
            pdf.setFont('Roboto', 'bold');
            pdf.text(t((stat as { labelKey: string }).labelKey).toUpperCase(), curX + statBoxW / 2, cursorY + 7.5, { align: 'center' });
        });
        cursorY += 16;

        pdf.setFillColor(249, 250, 251);
        pdf.roundedRect(contentX, cursorY, contentWidth, 24, 3, 3, 'F');
        pdf.setTextColor(156, 163, 175);
        pdf.setFontSize(6);
        pdf.setFont('Roboto', 'bold');
        pdf.text('EXPERT BIOMETRIC CONCLUSION:', contentX + 4, cursorY + 5);
        pdf.setTextColor(75, 85, 99);
        pdf.setFontSize(8);
        pdf.setFont('Roboto', 'normal');
        const conclusion = (analysisData.careIndex < 40 ? tFn('expert_conclusion_level_beginner') : tFn('expert_conclusion_level_experienced')) + ' ' + (analysisData.resilience > 60 ? tFn('expert_conclusion_adaptation_high') : tFn('expert_conclusion_adaptation_moderate'));
        pdf.text(pdf.splitTextToSize(conclusion, contentWidth - 8), contentX + 4, cursorY + 10);

        y += 75;

        pdf.setTextColor(156, 163, 175);
        pdf.setFontSize(9);
        pdf.setFont('Roboto', 'bold');
        pdf.text('PERFORMANCE CORE (METRICS)', margin, y);
        y += 8;

        const drawScale = (title: string, val: number, subItems: any[], startX: number, startY: number, color: number[]) => {
            pdf.setTextColor(31, 41, 55);
            pdf.setFontSize(8);
            pdf.setFont('Roboto', 'bold');
            pdf.text(title.toUpperCase(), startX, startY);
            pdf.setTextColor(color[0], color[1], color[2]);
            pdf.text(`${val}%`, startX + 75, startY, { align: 'right' });
            
            pdf.setFillColor(243, 244, 246);
            pdf.roundedRect(startX, startY + 4, 75, 2.5, 1, 1, 'F');
            pdf.setFillColor(color[0], color[1], color[2]);
            pdf.roundedRect(startX, startY + 4, (75 * val) / 100, 2.5, 1, 1, 'F');
            
            let subY = startY + 14;
            subItems.forEach(item => {
                pdf.setTextColor(156, 163, 175);
                pdf.setFontSize(7);
                pdf.text(t((item as { labelKey: string }).labelKey), startX, subY);
                pdf.setTextColor(color[0], color[1], color[2]);
                pdf.text(`${item.val}%`, startX + 75, subY, { align: 'right' });
                
                pdf.setFillColor(243, 244, 246);
                pdf.roundedRect(startX, subY + 2, 75, 1.2, 0.5, 0.5, 'F');
                pdf.setFillColor(color[0], color[1], color[2]);
                pdf.roundedRect(startX, subY + 2, (75 * item.val) / 100, 1.2, 0.5, 0.5, 'F');
                subY += 10;
            });
        };

        drawScale(t('analysis_resilience'), analysisData.resilience, analysisData.resilienceSub, margin, y, [59, 130, 246]);
        drawScale(t('analysis_maintenance'), analysisData.maintenance, analysisData.maintenanceSub, margin + 95, y, [249, 115, 22]);

        y += 58;
        pdf.setTextColor(156, 163, 175);
        pdf.setFontSize(9);
        pdf.setFont('Roboto', 'bold');
        pdf.text('VULNERABILITY MATRIX (RISK PROFILE)', margin, y);
        y += 8;

        const vulnColW = (pageWidth - margin * 2 - 10) / 2;
        vulnerabilities.forEach((v, idx) => {
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            const curX = margin + col * (vulnColW + 10);
            const curY = y + row * 15;

            pdf.setTextColor(75, 85, 99);
            pdf.setFontSize(8);
            pdf.text(t(v.riskKey), curX, curY);
            pdf.setTextColor(239, 68, 68);
            pdf.text(`${v.risk}%`, curX + vulnColW, curY, { align: 'right' });
            
            pdf.setFillColor(243, 244, 246);
            pdf.roundedRect(curX, curY + 2, vulnColW, 1.5, 0.5, 0.5, 'F');
            pdf.setFillColor(239, 68, 68);
            pdf.roundedRect(curX, curY + 2, (vulnColW * v.risk) / 100, 1.5, 0.5, 0.5, 'F');
        });

        pdf.addPage();
        y = 20;
        pdf.setTextColor(31, 41, 55);
        pdf.setFontSize(16);
        pdf.setFont('Roboto', 'bold');
        pdf.text('INTELLIGENT CARE PROTOCOLS', margin, y);
        y += 15;

        analysisData.protocols.forEach((p) => {
            pdf.setFillColor(249, 250, 251);
            pdf.roundedRect(margin, y, pageWidth - margin * 2, 22, 4, 4, 'F');
            pdf.setFillColor(p.color[0], p.color[1], p.color[2]);
            pdf.rect(margin, y, 2, 22, 'F');
            
            pdf.setTextColor(p.color[0], p.color[1], p.color[2]);
            pdf.setFontSize(9);
            pdf.setFont('Roboto', 'bold');
            pdf.text(p.title, margin + 6, y + 7);
            
            pdf.setTextColor(156, 163, 175);
            pdf.setFontSize(7);
            pdf.text(p.tag, pageWidth - margin - 5, y + 7, { align: 'right' });
            
            pdf.setTextColor(75, 85, 99);
            pdf.setFontSize(8);
            pdf.setFont('Roboto', 'normal');
            const descLines = pdf.splitTextToSize(p.desc, pageWidth - margin * 2 - 20);
            pdf.text(descLines, margin + 6, y + 14);
            y += 28;
        });

        if (plant.latestDiagnosis) {
            const diag = plant.latestDiagnosis;
            pdf.addPage();
            y = 20;
            pdf.setTextColor(31, 41, 55);
            pdf.setFontSize(16);
            pdf.setFont('Roboto', 'bold');
            pdf.text('AI HEALTH DIAGNOSTIC', margin, y);
            y += 14;
            const contentW = pageWidth - margin * 2;
            pdf.setFillColor(249, 250, 251);
            pdf.roundedRect(margin, y, contentW, 28, 3, 3, 'F');
            pdf.setTextColor(156, 163, 175);
            pdf.setFontSize(7);
            pdf.setFont('Roboto', 'bold');
            pdf.text('PLANT', margin + 6, y + 6);
            pdf.text('SCAN DATE', margin + 6, y + 14);
            pdf.text('STATUS', margin + 6, y + 22);
            pdf.setTextColor(31, 41, 55);
            pdf.setFontSize(8);
            pdf.setFont('Roboto', 'normal');
            pdf.text(plant.commonName || '—', margin + 32, y + 6);
            pdf.text(new Date(diag.date).toLocaleDateString(), margin + 32, y + 14);
            pdf.setTextColor(diag.isHealthy ? 16 : 239, diag.isHealthy ? 185 : 68, diag.isHealthy ? 129 : 68);
            pdf.setFont('Roboto', 'bold');
            pdf.text(diag.isHealthy ? tFn('pdf_biometry_ok') : (diag.problemTitle?.trim() || tFn('pdf_deviations')), margin + 32, y + 22);
            y += 36;
            const ha = diag.healthAssessment;
            if (ha && (ha.diseases !== undefined || ha.pests !== undefined || ha.nutrition !== undefined || ha.abiotic !== undefined)) {
                pdf.setTextColor(156, 163, 175);
                pdf.setFontSize(9);
                pdf.setFont('Roboto', 'bold');
                pdf.text('THREAT ASSESSMENT (%)', margin, y);
                pdf.setFontSize(7);
                pdf.setFont('Roboto', 'normal');
                pdf.text(tFn('pdf_threat_note'), margin + 55, y);
                y += 8;
                const labels: { key: string; labelKey: 'vuln_diseases' | 'vuln_pests' | 'vuln_nutrition' | 'threat_abiotic' }[] = [
                    { key: 'diseases', labelKey: 'vuln_diseases' },
                    { key: 'pests', labelKey: 'vuln_pests' },
                    { key: 'nutrition', labelKey: 'vuln_nutrition' },
                    { key: 'abiotic', labelKey: 'threat_abiotic' }
                ];
                const barW = contentW - 20;
                labels.forEach(({ key, labelKey }) => {
                    const val = (ha as Record<string, number>)[key] ?? 0;
                    pdf.setTextColor(75, 85, 99);
                    pdf.setFontSize(8);
                    pdf.setFont('Roboto', 'normal');
                    pdf.text(tFn(labelKey), margin, y);
                    pdf.setTextColor(val >= 50 ? 239 : val >= 20 ? 245 : 59, val >= 50 ? 68 : val >= 20 ? 158 : 130, val >= 50 ? 68 : val >= 20 ? 11 : 246);
                    pdf.text(`${val}%`, margin + contentW - 15, y, { align: 'right' });
                    pdf.setFillColor(243, 244, 246);
                    pdf.roundedRect(margin, y + 2, barW, 2.5, 0.5, 0.5, 'F');
                    pdf.setFillColor(val >= 50 ? 239 : val >= 20 ? 245 : 59, val >= 50 ? 68 : val >= 20 ? 158 : 11, val >= 50 ? 68 : val >= 20 ? 11 : 246);
                    pdf.roundedRect(margin, y + 2, (barW * Math.min(100, val)) / 100, 2.5, 0.5, 0.5, 'F');
                    y += 12;
                });
            }
            y += 10;
            const diagText = ((diag.problemTitle || '') + ' ' + (diag.symptoms || '')).toLowerCase();
            const mineralList = [
                { symbol: 'N', labelKey: 'mineral_nitrogen', keywords: ['азот', 'nitrogen'] },
                { symbol: 'P', labelKey: 'mineral_phosphorus', keywords: ['фосфор', 'phosphorus'] },
                { symbol: 'K', labelKey: 'mineral_potassium', keywords: ['калий', 'potassium'] },
                { symbol: 'Fe', labelKey: 'mineral_iron', keywords: ['желез', 'iron', 'хлороз', 'chlorosis'] },
                { symbol: 'Mg', labelKey: 'mineral_magnesium', keywords: ['магний', 'magnesium'] },
                { symbol: 'Ca', labelKey: 'mineral_calcium', keywords: ['кальций', 'calcium'] },
            ].map(m => {
                let status: 'none' | 'healthy' | 'deficiency' = 'none';
                if (diag) {
                    status = m.keywords.some(k => diagText.includes(k)) ? 'deficiency' : 'healthy';
                }
                return { ...m, status };
            });
            const cardPadding = 8;
            const cardX = margin;
            const cardW = contentW;
            const headerH = 22;
            const gridRows = 2;
            const gridGap = 6;
            const cellH = 50;
            const gridHeight = gridRows * cellH + gridGap;
            const cardHeight = headerH + 2 + 6 + gridHeight;
            pdf.setFillColor(255, 255, 255);
            pdf.roundedRect(cardX, y, cardW, cardHeight, 4, 4, 'F');
            pdf.setFillColor(249, 248, 252);
            pdf.roundedRect(cardX + cardPadding, y + cardPadding, 14, 14, 2, 2, 'F');
            pdf.setTextColor(156, 163, 175);
            pdf.setFontSize(7);
            pdf.setFont('Roboto', 'bold');
            pdf.text(t('useful_elements').toUpperCase(), cardX + cardPadding + 16, y + cardPadding + 4);
            pdf.setTextColor(31, 41, 55);
            pdf.setFontSize(10);
            pdf.setFont('Roboto', 'bold');
            pdf.text(t('bio_mineral_balance'), cardX + cardPadding + 16, y + cardPadding + 11);
            const gridY = y + headerH + 6;
            const gap = gridGap;
            const cols = 3;
            const cellW = (cardW - cardPadding * 2 - gap * (cols - 1)) / cols;
            const circleR = 5;
            mineralList.forEach((m, idx) => {
                const col = idx % cols;
                const row = Math.floor(idx / cols);
                const cx = cardX + cardPadding + col * (cellW + gap);
                const cy = gridY + row * (cellH + gap);
                pdf.setFillColor(249, 250, 251);
                pdf.roundedRect(cx, cy, cellW, cellH, 3, 3, 'F');
                pdf.setDrawColor(229, 231, 235);
                pdf.setLineWidth(0.2);
                pdf.roundedRect(cx, cy, cellW, cellH, 3, 3, 'S');
                const symX = cx + cellW / 2;
                const symY = cy + 8 + circleR;
                const fillRgb = m.status === 'deficiency' ? [239, 68, 68] : m.status === 'healthy' ? [16, 185, 129] : [243, 244, 246];
                const borderRgb = m.status === 'deficiency' ? [239, 68, 68] : m.status === 'healthy' ? [16, 185, 129] : [229, 231, 235];
                pdf.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
                pdf.setDrawColor(borderRgb[0], borderRgb[1], borderRgb[2]);
                pdf.setLineWidth(0.5);
                pdf.circle(symX, symY, circleR, 'FD');
                const textColor = m.status === 'none' ? [209, 213, 219] : [255, 255, 255];
                pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
                pdf.setFontSize(9);
                pdf.setFont('Roboto', 'bold');
                pdf.text(m.symbol, symX, symY + 1.2, { align: 'center' });
                pdf.setTextColor(31, 41, 55);
                pdf.setFontSize(8);
                pdf.setFont('Roboto', 'bold');
                pdf.text(t((m as { labelKey: string }).labelKey), cx + cellW / 2, cy + 8 + circleR * 2 + 6, { align: 'center' });
                const statusText = m.status === 'deficiency' ? t('mineral_status_critical') : m.status === 'healthy' ? t('mineral_status_balanced') : t('data_no_data');
                pdf.setTextColor(156, 163, 175);
                pdf.setFontSize(6);
                pdf.setFont('Roboto', 'bold');
                pdf.text(statusText.toUpperCase(), cx + cellW / 2, cy + 8 + circleR * 2 + 12, { align: 'center' });
            });
            y += cardHeight + 8;
        }

        const pageCount = pdf.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            pdf.setPage(i);
            pdf.setFontSize(8);
            pdf.setTextColor(156, 163, 175);
            pdf.setFont('Roboto', 'normal');
            pdf.text(`PlantLens ${tFn('biometric_report_full')} • Page ${i} / ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        }

        return pdf;
    };

    const handleDownloadOnly = async () => {
        if (!plant) return;
        setIsReportMenuOpen(false);
        setIsExporting(true);
        try {
            const pdf = await generatePdf(t);
            if (pdf) {
                const pdfBase64 = pdf.output('datauristring');
                const fileName = `Analysis_${plant.commonName.replace(/\s+/g, '_')}.pdf`;
                const path = await savePdfToReportsFolder(fileName, pdfBase64.split(',')[1]);
                if (path) setShowPdfSavedModal(true);
            }
        } catch (e) {
            console.error(e);
            Alert.alert(t('error_title'), t('error_pdf_save'));
        } finally {
            setIsExporting(false);
        }
    };

    const handleShareOnly = async () => {
        if (!plant) return;
        setIsReportMenuOpen(false);
        setIsExporting(true);
        try {
            const pdf = await generatePdf(t);
            if (pdf) {
                const pdfBase64 = pdf.output('datauristring');
                const fileName = `Analysis_${plant.commonName.replace(/\s+/g, '_')}.pdf`;
                const fileUri = `${FileSystem.documentDirectory}${fileName}`;
                
                await FileSystem.writeAsStringAsync(fileUri, pdfBase64.split(',')[1], {
                    encoding: FileSystem.EncodingType.Base64,
                });
                
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(fileUri);
                } else {
                    Alert.alert('PDF сохранен', `Файл сохранен: ${fileName}`);
                }
            }
        } catch (e: any) {
            console.error("Sharing failed", e);
            Alert.alert(t('error_title'), t('error_pdf_share'));
        } finally {
            setIsExporting(false);
        }
    };

    if (!plant || !analysisData) return null;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.heroContainer, { backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)' }]}>
                <View style={[styles.header, { paddingTop: 16 + insets.top, backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)', borderBottomColor: colors.borderLight }]}>
                    <Pressable onPress={() => navigation.goBack()} style={[styles.headerButton, { backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.1)', borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.1)' }]}>
                        <Ionicons name="arrow-back" size={20} color="#ffffff" />
                    </Pressable>
                    <View style={styles.headerTitleContainer}>
                        <Text style={[styles.headerSubtitle, { color: 'rgba(255, 255, 255, 0.5)' }]}>{t('biometric_report_title').toUpperCase()}</Text>
                        <Text style={[styles.headerTitle, { color: '#ffffff' }]} numberOfLines={1}>{plant.commonName}</Text>
                    </View>
                    
                    <View style={styles.headerActions}>
                        <Pressable 
                            onPress={() => setIsReportMenuOpen(!isReportMenuOpen)} 
                            disabled={isExporting}
                            style={[styles.reportButton, { backgroundColor: colors.primary }, isExporting && styles.reportButtonDisabled]}
                        >
                            {isExporting ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <Ionicons name="share-outline" size={18} color="#ffffff" />
                            )}
                            <Text style={styles.reportButtonText}>{t('report_button')}</Text>
                        </Pressable>
                        {isReportMenuOpen && (
                            <View style={[styles.exportMenu, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                                <Pressable onPress={handleDownloadOnly} style={styles.exportMenuItem}>
                                    <Ionicons name="download-outline" size={18} color={colors.info} />
                                    <View style={styles.exportMenuItemText}>
                                        <Text style={[styles.exportMenuTitle, { color: colors.text }]}>{t('export_pdf_download')}</Text>
                                        <Text style={[styles.exportMenuSubtitle, { color: colors.textSecondary }]}>{t('export_pdf_download_desc')}</Text>
                                    </View>
                                </Pressable>
                                <Pressable onPress={handleShareOnly} style={styles.exportMenuItem}>
                                    <Ionicons name="share-outline" size={18} color={colors.success} />
                                    <View style={styles.exportMenuItemText}>
                                        <Text style={[styles.exportMenuTitle, { color: colors.text }]}>{t('share_report')}</Text>
                                        <Text style={[styles.exportMenuSubtitle, { color: colors.textSecondary }]}>{t('share_report_desc')}</Text>
                                    </View>
                                </Pressable>
                            </View>
                        )}
                    </View>
                </View>
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                {/* 1. MAIN PERFORMANCE INDEX CARD */}
                <View style={[styles.performanceCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                    <View style={styles.performanceCardBackground}>
                        <Ionicons name="leaf" size={220} color={colors.text} style={{ opacity: theme === 'dark' ? 0.05 : 0.02 }} />
                    </View>
                    
                    <View style={[styles.performanceContent, { alignItems: 'center' }]}>
                        <View style={[styles.careIndexBadge, { backgroundColor: colors.success + '20' }]}>
                            <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                            <Text style={[styles.careIndexBadgeText, { color: colors.success }]} numberOfLines={2} adjustsFontSizeToFit={true}>{t('analysis_care_index').toUpperCase()}</Text>
                        </View>
                        
                        <View style={styles.careIndexNumberContainer}>
                            <View style={styles.careIndexBackgroundIcon}>
                                <Ionicons name="pulse" size={180} color={colors.text} style={{ opacity: theme === 'dark' ? 0.05 : 0.03 }} />
                            </View>
                            <Text style={[styles.careIndexNumber, { color: colors.text }]}>{analysisData.careIndex}</Text>
                            <Text style={[styles.careIndexDenominator, { color: colors.success }]}>/100</Text>
                        </View>
                        
                        <View
                            style={[styles.careIndexProgressBar, { backgroundColor: colors.surface }]}
                            onLayout={(e) => {
                                const { width, height } = e.nativeEvent.layout;
                                if (width > 0 && height > 0) setCareIndexBarSize({ width, height });
                            }}
                        >
                            {careIndexBarSize && careIndexBarSize.width > 0 && (
                                <Svg
                                    width={careIndexBarSize.width}
                                    height={careIndexBarSize.height}
                                    style={StyleSheet.absoluteFill}
                                >
                                    <Defs>
                                        <LinearGradient id="careIndexGradient" x1="0" y1="0" x2="1" y2="0">
                                            <Stop offset="0" stopColor="#22c55e" />
                                            <Stop offset="0.5" stopColor="#eab308" />
                                            <Stop offset="1" stopColor="#ef4444" />
                                        </LinearGradient>
                                    </Defs>
                                    <Rect x={0} y={0} width={careIndexBarSize.width} height={careIndexBarSize.height} fill="url(#careIndexGradient)" rx={careIndexBarSize.height / 2} ry={careIndexBarSize.height / 2} />
                                </Svg>
                            )}
                            <View style={[styles.careIndexProgressMarker, { left: `${analysisData.careIndex}%`, marginLeft: -12, backgroundColor: colors.card, borderColor: colors.borderLight }]} />
                        </View>

                        <View style={styles.careIndexStatsGrid}>
                            <View style={styles.careIndexStatsColumn}>
                                <View style={styles.careIndexStat}>
                                    <View style={styles.careIndexStatHeader}>
                                        <View style={styles.careIndexStatLabelContainer}>
                                            <Ionicons name="shield-checkmark" size={14} color={colors.info} />
                                            <Text style={[styles.careIndexStatLabel, { color: colors.textMuted }]}>{t('analysis_resilience')}</Text>
                                        </View>
                                        <Text style={[styles.careIndexStatValue, { color: colors.info }]}>{analysisData.resilience}%</Text>
                                    </View>
                                    <View style={[styles.careIndexStatBar, { backgroundColor: colors.surface }]}>
                                        <View style={[styles.careIndexStatBarFill, { width: `${analysisData.resilience}%`, backgroundColor: colors.info }]} />
                                    </View>
                                </View>
                                <View style={styles.subMetricsContainer}>
                                    {analysisData.resilienceSub.map((s, i) => (
                                        <SubMetricScale key={i} label={t((s as { labelKey: string }).labelKey)} value={s.val} color={`rgb(${s.color.join(',')})`} colors={colors} />
                                    ))}
                                </View>
                            </View>
                            <View style={styles.careIndexStatsColumn}>
                                <View style={styles.careIndexStat}>
                                    <View style={styles.careIndexStatHeader}>
                                        <View style={styles.careIndexStatLabelContainer}>
                                            <Ionicons name="pulse" size={14} color={colors.warning} />
                                            <Text style={[styles.careIndexStatLabel, { color: colors.textMuted }]}>{t('analysis_maintenance')}</Text>
                                        </View>
                                        <Text style={[styles.careIndexStatValue, { color: colors.warning }]}>{analysisData.maintenance}%</Text>
                                    </View>
                                    <View style={[styles.careIndexStatBar, { backgroundColor: colors.surface }]}>
                                        <View style={[styles.careIndexStatBarFill, { width: `${analysisData.maintenance}%`, backgroundColor: colors.warning }]} />
                                    </View>
                                </View>
                                <View style={styles.subMetricsContainer}>
                                    {analysisData.maintenanceSub.map((s, i) => (
                                        <SubMetricScale key={i} label={t((s as { labelKey: string }).labelKey)} value={s.val} color={`rgb(${s.color.join(',')})`} colors={colors} />
                                    ))}
                                </View>
                            </View>
                        </View>

                        <View style={styles.quickStatsGrid}>
                            {analysisData.quickStats.map((stat, idx) => (
                                <View key={idx} style={[styles.quickStatCard, { backgroundColor: colors.surface }]}>
                                    <View style={[styles.quickStatIcon, { backgroundColor: stat.bg.includes('emerald') ? colors.success + '20' : stat.bg.includes('green') ? colors.success + '20' : colors.info + '20' }]}>
                                        <Ionicons name={stat.icon} size={18} color={stat.color.includes('emerald') ? colors.success : stat.color.includes('green') ? colors.success : colors.info} />
                                    </View>
                                    <Text style={[styles.quickStatLabel, { color: colors.text }]}>{t((stat as { labelKey: string }).labelKey)}</Text>
                                </View>
                            ))}
                        </View>

                        <View style={[styles.expertBox, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                            <View style={[styles.expertBoxBorder, { backgroundColor: colors.primary }]} />
                            <View style={styles.expertBoxHeader}>
                                <View style={[styles.expertBoxIconContainer, { backgroundColor: colors.primaryLight }]}>
                                    <Ionicons name="bulb-outline" size={20} color={colors.primary} />
                                </View>
                                <Text style={[styles.expertBoxTitle, { color: colors.text }]}>{t('analysis_expert_conclusion').toUpperCase()}</Text>
                            </View>
                            <Text style={[styles.expertBoxText, { color: colors.text }]}>
                                {t(analysisData.careIndex < 40 ? 'expert_conclusion_level_beginner' : 'expert_conclusion_level_experienced')} {t(analysisData.resilience > 60 ? 'expert_conclusion_adaptation_high' : 'expert_conclusion_adaptation_moderate')}
                            </Text>

                            <View style={styles.prosConsGrid}>
                                <View style={styles.prosConsColumn}>
                                    <View style={styles.prosConsHeader}>
                                        <Ionicons name="thumbs-up-outline" size={16} color={colors.success} />
                                        <Text style={[styles.prosConsTitle, { color: colors.success }]}>{t('pros_label').toUpperCase()}</Text>
                                    </View>
                                    <View style={styles.prosConsList}>
                                        {plant.pros?.slice(0, 3).map((pro, i) => (
                                            <View key={i} style={styles.prosConsItem}>
                                                <Text style={[styles.prosConsBullet, { color: colors.success }]}>•</Text>
                                                <View style={styles.prosConsTextWrap}>
                                                    <Text style={[styles.prosConsText, { color: colors.text }]}>{pro}</Text>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                                <View style={styles.prosConsColumn}>
                                    <View style={styles.prosConsHeader}>
                                        <Ionicons name="thumbs-down-outline" size={16} color={colors.error} />
                                        <Text style={[styles.prosConsTitle, { color: colors.error }]}>{t('cons_label').toUpperCase()}</Text>
                                    </View>
                                    <View style={styles.prosConsList}>
                                        {plant.cons?.slice(0, 3).map((con, i) => (
                                            <View key={i} style={styles.prosConsItem}>
                                                <Text style={[styles.prosConsBullet, { color: colors.error }]}>•</Text>
                                                <View style={styles.prosConsTextWrap}>
                                                    <Text style={[styles.prosConsText, { color: colors.text }]}>{con}</Text>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* 2. INTELLIGENT PROTOCOLS SECTION */}
                <View style={styles.protocolsSection}>
                    <View style={styles.protocolsHeader}>
                        <View style={styles.protocolsHeaderLeft}>
                            <View style={styles.protocolsIconContainer}>
                                <Ionicons name="sparkles" size={18} color="#ffffff" />
                            </View>
                            <Text style={styles.protocolsTitle}>{t('analysis_protocols').toUpperCase()}</Text>
                        </View>
                    </View>
                    <View style={styles.protocolsList}>
                        {analysisData.protocols.map((protocol) => (
                            <View key={protocol.id} style={[styles.protocolCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                                <View style={[styles.protocolIconContainer, { backgroundColor: `rgba(${protocol.color.join(',')}, ${theme === 'dark' ? 0.2 : 0.1})` }]}>
                                    <Ionicons name={protocol.icon} size={26} color={`rgb(${protocol.color.join(',')})`} />
                                </View>
                                <View style={styles.protocolContent}>
                                    <Text style={[styles.protocolTitle, { color: colors.text }]}>{t((protocol as { titleKey: string }).titleKey)}</Text>
                                    <View style={styles.protocolDescWrap}>
                                        <Text style={[styles.protocolDesc, { color: colors.textSecondary }]}>{('descKey' in protocol && protocol.descKey) ? t(protocol.descKey) : (protocol as { desc?: string }).desc}</Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>

                {/* 3. VULNERABILITY MATRIX */}
                <View style={[styles.vulnerabilityCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                    <View style={styles.vulnerabilityBackground}>
                        <Ionicons name="alert-circle" size={150} color={colors.error} style={{ opacity: theme === 'dark' ? 0.05 : 0.03 }} />
                    </View>
                    
                    <View style={styles.vulnerabilityHeader}>
                        <View style={[styles.vulnerabilityIconContainer, { backgroundColor: colors.error + '20' }]}>
                            <Ionicons name="pulse" size={24} color={colors.error} />
                        </View>
                        <View>
                            <Text style={[styles.vulnerabilitySubtitle, { color: colors.textMuted }]}>{t('vulnerability_matrix_subtitle').toUpperCase()}</Text>
                            <Text style={[styles.vulnerabilityTitle, { color: colors.text }]}>{t('vulnerability_matrix_title')}</Text>
                        </View>
                    </View>
                    
                    <View style={styles.vulnerabilityList}>
                        {vulnerabilities.map((vuln, idx) => (
                            <View key={idx} style={styles.vulnerabilityItem}>
                                <View style={styles.vulnerabilityItemHeader}>
                                    <Text style={[styles.vulnerabilityItemName, { color: colors.text }]}>{t(vuln.riskKey)}</Text>
                                    <Text style={[styles.vulnerabilityItemRisk, { color: getVulnerabilityGradientColorAt(vuln.risk) }]}>{vuln.risk}%</Text>
                                </View>
                                <View style={styles.vulnerabilityItemBar}>
                                    <Svg width="100%" height={8} viewBox="0 0 100 8" preserveAspectRatio="none" style={styles.vulnerabilityItemBarSvg}>
                                        <Defs>
                                            <LinearGradient id={`vulnGrad-${idx}`} x1="0" y1="0" x2="1" y2="0">
                                                <Stop offset="0" stopColor="#22c55e" />
                                                <Stop offset="0.5" stopColor="#eab308" />
                                                <Stop offset="1" stopColor="#ef4444" />
                                            </LinearGradient>
                                            <ClipPath id={`vulnClip-${idx}`}>
                                                <Rect x={0} y={0} width={Math.min(100, Math.max(0, vuln.risk))} height={8} rx={3} ry={3} />
                                            </ClipPath>
                                        </Defs>
                                        <Rect x={0} y={0} width={100} height={8} fill={`url(#vulnGrad-${idx})`} clipPath={`url(#vulnClip-${idx})`} />
                                    </Svg>
                                </View>
                            </View>
                        ))}
                    </View>

                    {topVulnerability && (
                        <View style={[styles.topVulnerabilityCard, { backgroundColor: colors.error + '10', borderColor: colors.error + '30' }]}>
                            <View style={styles.topVulnerabilityBackground}>
                                <Ionicons name="shield" size={80} color={colors.error} style={{ opacity: theme === 'dark' ? 0.15 : 0.1, transform: [{ rotate: '-12deg' }, { scale: 1.5 }] }} />
                            </View>
                            <View style={styles.topVulnerabilityHeader}>
                                <Ionicons name="shield" size={20} color={colors.error} />
                                <Text style={[styles.topVulnerabilityLabel, { color: colors.error }]}>{t('critical_zone_control')}</Text>
                            </View>
                            <Text style={[styles.topVulnerabilityTitle, { color: colors.text }]}>{t(topVulnerability.riskKey)}</Text>
                            <Text style={[styles.topVulnerabilityDesc, { color: colors.textSecondary, borderLeftColor: colors.error + '30' }]}>
                                "{t(topVulnerability.riskKey + '_desc' as any)}"
                            </Text>
                            <View style={[styles.topVulnerabilityPrevention, { borderTopColor: colors.error + '20' }]}>
                                <View style={styles.topVulnerabilityPreventionHeader}>
                                    <Ionicons name="shield-checkmark" size={16} color={colors.success} />
                                    <Text style={[styles.topVulnerabilityPreventionTitle, { color: colors.success }]}>{t('protocol_prevention_label')}</Text>
                                </View>
                                <View style={[styles.topVulnerabilityPreventionBox, { backgroundColor: colors.success + '10', borderColor: colors.success + '20' }]}>
                                    <Text style={[styles.topVulnerabilityPreventionText, { color: colors.text }]}>
                                        {t(topVulnerability.riskKey + '_prevention' as any)}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    )}
                </View>

                {/* 4. AI HEALTH SCAN DETAILED */}
                <View style={[styles.healthScanCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                    <View style={styles.healthScanCardBackground}>
                        <Ionicons name="server-outline" size={150} color={colors.info} style={{ opacity: theme === 'dark' ? 0.05 : 0.03 }} />
                    </View>
                    <View style={styles.healthScanCardHeader}>
                        <View style={[styles.healthScanCardIconContainer, { backgroundColor: colors.info + '20', borderColor: colors.info + '20' }]}>
                            <Ionicons name="search-outline" size={28} color={colors.info} />
                        </View>
                        <View>
                            <Text style={[styles.healthScanCardTitle, { color: colors.text }]}>{t('analysis_health_check')}</Text>
                            <Text style={[styles.healthScanCardSubtitle, { color: colors.textMuted }]}>{t('clinical_analysis_subtitle')}</Text>
                        </View>
                    </View>

                    <View>
                        {plant.latestDiagnosis ? (
                            <View style={styles.healthScanContent}>
                                <View style={styles.healthScanBars}>
                                    {healthCheckData?.map((item, idx) => (
                                        <HealthProgressBar key={idx} label={t((item as { labelKey: string }).labelKey)} value={item.value} colorClass={item.color} colors={colors} />
                                    ))}
                                </View>
                                
                                {/* Диагноз растения */}
                                {plant.latestDiagnosis.problemTitle && (
                                    <View style={[styles.diagnosisSection, { borderTopColor: colors.borderLight }]}>
                                        <View style={styles.diagnosisHeader}>
                                            <View style={[styles.diagnosisIconContainer, { 
                                                backgroundColor: plant.latestDiagnosis.isHealthy ? colors.success + '20' : colors.error + '20',
                                                borderColor: plant.latestDiagnosis.isHealthy ? colors.success + '30' : colors.error + '30'
                                            }]}>
                                                <Ionicons 
                                                    name={plant.latestDiagnosis.isHealthy ? "checkmark-circle" : "alert-circle"} 
                                                    size={20} 
                                                    color={plant.latestDiagnosis.isHealthy ? colors.success : colors.error} 
                                                />
                                            </View>
                                            <View style={styles.diagnosisHeaderText}>
                                                <Text style={[styles.diagnosisTitle, { color: colors.text }]}>ДИАГНОЗ</Text>
                                                <Text style={[styles.diagnosisProblemTitle, { color: plant.latestDiagnosis.isHealthy ? colors.success : colors.error }]}>
                                                    {plant.latestDiagnosis.problemTitle}
                                                </Text>
                                            </View>
                                        </View>
                                        
                                        {plant.latestDiagnosis.symptoms && (
                                            <View style={styles.diagnosisContent}>
                                                <View style={styles.diagnosisContentRow}>
                                                    <Ionicons name="eye-outline" size={14} color={colors.textMuted} />
                                                    <View style={styles.diagnosisContentText}>
                                                        <Text style={[styles.diagnosisContentLabel, { color: colors.textMuted }]}>Симптомы</Text>
                                                        <Text style={[styles.diagnosisContentValue, { color: colors.text }]}>{plant.latestDiagnosis.symptoms}</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        )}
                                        
                                        {plant.latestDiagnosis.treatment && (
                                            <View style={styles.diagnosisContent}>
                                                <View style={styles.diagnosisContentRow}>
                                                    <Ionicons name="medical-outline" size={14} color={colors.success} />
                                                    <View style={styles.diagnosisContentText}>
                                                        <Text style={[styles.diagnosisContentLabel, { color: colors.textMuted }]}>Лечение</Text>
                                                        <Text style={[styles.diagnosisContentValue, { color: colors.text }]}>{plant.latestDiagnosis.treatment}</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        )}
                                        
                                        {plant.latestDiagnosis.prevention && (
                                            <View style={styles.diagnosisContent}>
                                                <View style={styles.diagnosisContentRow}>
                                                    <Ionicons name="shield-checkmark-outline" size={14} color={colors.info} />
                                                    <View style={styles.diagnosisContentText}>
                                                        <Text style={[styles.diagnosisContentLabel, { color: colors.textMuted }]}>Профилактика</Text>
                                                        <Text style={[styles.diagnosisContentValue, { color: colors.text }]}>{plant.latestDiagnosis.prevention}</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                )}
                                
                                <View style={[styles.confidenceSection, { borderTopColor: colors.borderLight }]}>
                                    <View style={styles.confidenceContent}>
                                        <Text style={[styles.confidenceLabel, { color: colors.textMuted }]}>VERIFICATION CONFIDENCE</Text>
                                        <View style={styles.confidenceRow}>
                                            <View style={styles.confidenceIconContainer}>
                                                <Ionicons name="locate" size={22} color={colors.success} />
                                            </View>
                                            <Text style={[styles.confidenceNumber, { color: colors.success }]}>{confidenceScore}%</Text>
                                            <View style={styles.confidenceBarContainer}>
                                                <View style={styles.confidenceBarLabels}>
                                                    <Text style={[styles.confidenceBarLabel, { color: colors.textMuted }]}>Reliability Index</Text>
                                                    <Text style={[styles.confidenceBarLabel, { color: colors.textMuted }]}>Validated</Text>
                                                </View>
                                                <View style={[styles.confidenceBar, { backgroundColor: colors.surface }]}>
                                                    <View style={[styles.confidenceBarFill, { width: `${confidenceScore}%`, backgroundColor: colors.success }]} />
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                    
                                    <View style={styles.confidenceFooter}>
                                        <View style={styles.confidenceFooterItem}>
                                            <Ionicons name="key" size={12} color={colors.success} />
                                            <Text style={[styles.confidenceFooterText, { color: colors.textMuted }]}>2,400+ BIO-POINTS</Text>
                                        </View>
                                        <View style={styles.confidenceFooterItem}>
                                            <Ionicons name="shield-checkmark" size={12} color={colors.success} />
                                            <Text style={[styles.confidenceFooterText, { color: colors.textMuted }]}>GPT-4O VISION AI</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        ) : (
                            <View style={[styles.healthScanEmpty, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                                <View style={[styles.healthScanEmptyIcon, { backgroundColor: colors.info + '20' }]}>
                                    <Ionicons name="scan-outline" size={38} color={colors.info} />
                                </View>
                                <Text style={[styles.healthScanEmptyTitle, { color: colors.text }]}>{t('report_not_generated')}</Text>
                                <Text style={[styles.healthScanEmptyText, { color: colors.textSecondary }]}>
                                    {t('clinical_scan_prompt')}
                                </Text>
                                <Pressable 
                                    onPress={() => navigation.navigate('NewCameraScreen' as never, { analysisMode: 'diagnosis', plantName: plant.commonName, plantId: plant.id } as never)}
                                    style={[styles.healthScanEmptyButton, { backgroundColor: colors.primary }]}
                                >
                                    <Text style={styles.healthScanEmptyButtonText}>{t('start_clinical_analysis').toUpperCase()}</Text>
                                    <Ionicons name="chevron-forward" size={14} color="#ffffff" />
                                </Pressable>
                            </View>
                        )}
                    </View>
                </View>

                {/* 5. BIO-MINERAL BALANCE */}
                <View style={[styles.mineralCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                    <View style={styles.mineralHeader}>
                        <View style={[styles.mineralIconContainer, { backgroundColor: colors.info + '20' }]}>
                            <Ionicons name="flask" size={24} color={colors.info} />
                        </View>
                        <View>
                            <Text style={[styles.mineralSubtitle, { color: colors.textMuted }]}>{t('useful_elements').toUpperCase()}</Text>
                            <Text style={[styles.mineralTitle, { color: colors.text }]}>{t('bio_mineral_balance')}</Text>
                        </View>
                    </View>
                    <View style={styles.mineralGrid}>
                        {mineralStatus.map(m => (
                            <View key={m.symbol} style={[styles.mineralItem, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                                <View style={[
                                    styles.mineralSymbol,
                                    m.status === 'deficiency' && styles.mineralSymbolDeficiency,
                                    m.status === 'healthy' && styles.mineralSymbolHealthy,
                                    m.status === 'none' && [styles.mineralSymbolNone, { backgroundColor: colors.card, borderColor: colors.borderLight }]
                                ]}>
                                    <Text style={[
                                        styles.mineralSymbolText,
                                        m.status === 'deficiency' && styles.mineralSymbolTextDeficiency,
                                        m.status === 'healthy' && styles.mineralSymbolTextHealthy,
                                        m.status === 'none' && { color: colors.textMuted }
                                    ]}>{m.symbol}</Text>
                                </View>
                                <View style={styles.mineralInfo}>
                                    <Text style={[
                                        styles.mineralName,
                                        m.status === 'deficiency' && { color: colors.error },
                                        m.status === 'healthy' && { color: colors.success },
                                        m.status === 'none' && { color: colors.textMuted }
                                    ]}>{t((m as { labelKey: string }).labelKey)}</Text>
                                    <Text style={[styles.mineralStatus, { color: colors.textMuted }]}>
                                        {m.status === 'deficiency' ? t('mineral_status_critical') : m.status === 'healthy' ? t('mineral_status_balanced') : t('data_no_data')}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>
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
    heroContainer: {
        // backgroundColor применяется через inline стили
    },
    header: {
        paddingVertical: 16,
        paddingHorizontal: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        zIndex: 50,
        // backgroundColor и borderBottomColor применяются через inline стили
    },
    headerButton: {
        padding: 10,
        borderRadius: 999,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    headerTitleContainer: {
        flex: 1,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    headerSubtitle: {
        fontSize: 8,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.2,
        marginBottom: 4,
        // color применяется через inline стили
    },
    headerTitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили
    },
    headerActions: {
        position: 'relative',
    },
    reportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 999,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        // backgroundColor и shadowColor применяются через inline стили
    },
    reportButtonDisabled: {
        opacity: 0.5,
    },
    reportButtonText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        color: '#ffffff',
    },
    exportMenu: {
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 12,
        width: 224,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
        zIndex: 100,
        // backgroundColor и borderColor применяются через inline стили
    },
    exportMenuItem: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 16,
        borderBottomWidth: 1,
        // borderBottomColor применяется через inline стили
    },
    exportMenuItemText: {
        flex: 1,
    },
    exportMenuTitle: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили
    },
    exportMenuSubtitle: {
        fontSize: 8,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        // color применяется через inline стили
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
        marginTop: 16,
    },
    contentContainer: {
        paddingBottom: 96,
        gap: 16,
    },
    performanceCard: {
        paddingVertical: 32,
        paddingHorizontal: 16,
        borderRadius: 40,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        position: 'relative',
        overflow: 'hidden',
        // backgroundColor и borderColor применяются через inline стили
    },
    performanceCardBackground: {
        position: 'absolute',
        top: 0,
        right: 0,
        padding: 16,
        opacity: 0.02,
    },
    performanceContent: {
        alignItems: 'center',
        zIndex: 10,
        width: '100%',
        paddingHorizontal: 0,
    },
    performanceBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.1)',
        marginBottom: 40,
    },
    performanceBadgeText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        color: '#10b981',
    },
    performanceNumberContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'baseline',
        gap: 4,
        marginBottom: 16,
        position: 'relative',
    },
    performanceNumberBackground: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.03,
        transform: [{ scale: 1.5 }],
    },
    performanceNumber: {
        fontSize: 96,
        fontWeight: '900',
        color: '#1f2937',
        letterSpacing: -2,
        zIndex: 10,
    },
    performanceDenominator: {
        fontSize: 36,
        fontWeight: '900',
        color: '#10b981',
        zIndex: 10,
    },
    performanceProgressBar: {
        height: 16,
        width: '100%',
        borderRadius: 999,
        marginBottom: 48,
        overflow: 'hidden',
        position: 'relative',
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили (если используется)
    },
    performanceProgressGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#10b981',
        opacity: 0.8,
    },
    performanceProgressMarker: {
        position: 'absolute',
        top: '50%',
        marginTop: -12,
        width: 24,
        height: 24,
        borderWidth: 4,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        zIndex: 10,
        // backgroundColor и borderColor применяются через inline стили (если используется)
    },
    careIndexBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 999,
        marginBottom: 40,
        // backgroundColor применяется через inline стили
    },
    careIndexBadgeText: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        flex: 1,
        flexShrink: 1,
        // color применяется через inline стили
    },
    careIndexNumberContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'baseline',
        gap: 4,
        marginBottom: 16,
        position: 'relative',
    },
    careIndexBackgroundIcon: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    careIndexNumber: {
        fontSize: 96,
        fontWeight: '900',
        color: '#1f2937',
        letterSpacing: -2,
        zIndex: 10,
    },
    careIndexDenominator: {
        fontSize: 36,
        fontWeight: '900',
        zIndex: 10,
        // color применяется через inline стили
    },
    careIndexProgressBar: {
        height: 16,
        width: '100%',
        borderRadius: 8,
        marginBottom: 32,
        position: 'relative',
        // backgroundColor применяется через inline стили
    },
    careIndexProgressMarker: {
        position: 'absolute',
        top: '50%',
        marginTop: -12,
        width: 24,
        height: 24,
        borderWidth: 2,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        // backgroundColor и borderColor применяются через inline стили
    },
    careIndexStats: {
        flexDirection: 'row',
        gap: 20,
        paddingHorizontal: 0,
        marginBottom: 40,
        width: '100%',
    },
    careIndexStat: {
        flex: 1,
        minWidth: 0,
    },
    careIndexStatHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        width: '100%',
    },
    careIndexStatLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flex: 1,
        minWidth: 0,
    },
    careIndexStatLabel: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        flexShrink: 1,
        // color применяется через inline стили
    },
    careIndexStatValue: {
        fontSize: 10,
        fontWeight: '900',
        // color применяется через inline стили
    },
    careIndexStatBar: {
        height: 10,
        backgroundColor: '#f3f4f6',
        borderRadius: 999,
        overflow: 'hidden',
    },
    careIndexStatBarFill: {
        height: '100%',
        borderRadius: 999,
    },
    careIndexStatsGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 40,
        width: '100%',
        alignSelf: 'stretch',
    },
    careIndexStatsColumn: {
        flex: 1,
        gap: 12,
        minWidth: 0,
    },
    metricsGrid: {
        flexDirection: 'row',
        gap: 32,
        marginBottom: 40,
        paddingTop: 40,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0, 0, 0, 0.05)',
        paddingHorizontal: 8,
    },
    metricsColumn: {
        flex: 1,
        gap: 12,
    },
    metricsColumnTitle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    metricsColumnTitleText: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: '#3b82f6',
    },
    metricHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    metricHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    metricLabel: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        color: '#9ca3af',
    },
    metricValue: {
        fontSize: 12,
        fontWeight: '900',
        color: '#3b82f6',
    },
    metricBar: {
        height: 6,
        backgroundColor: '#f3f4f6',
        borderRadius: 999,
        overflow: 'hidden',
    },
    metricBarFill: {
        height: '100%',
        borderRadius: 999,
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    subMetricsContainer: {
        gap: 16,
        paddingLeft: 8,
        borderLeftWidth: 2,
        borderLeftColor: 'rgba(59, 130, 246, 0.1)',
        minWidth: 0,
    },
    subMetricContainer: {
        gap: 4,
        minWidth: 0,
    },
    subMetricHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 0,
        gap: 4,
    },
    subMetricLabel: {
        fontSize: 7,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        color: '#9ca3af',
        flex: 1,
        minWidth: 0,
    },
    subMetricValue: {
        fontSize: 8,
        fontWeight: '900',
    },
    subMetricBar: {
        height: 4,
        borderRadius: 999,
        overflow: 'hidden',
        // backgroundColor применяется через inline стили
    },
    subMetricBarFill: {
        height: '100%',
        borderRadius: 999,
    },
    quickStatsGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 40,
    },
    quickStatCard: {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: 16,
        borderRadius: 28,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    quickStatIcon: {
        padding: 10,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    quickStatLabel: {
        fontSize: 8,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        color: '#6b7280',
        textAlign: 'center',
    },
    expertBox: {
        paddingVertical: 32,
        paddingHorizontal: 16,
        borderRadius: 40,
        borderWidth: 1,
        position: 'relative',
        overflow: 'hidden',
        // backgroundColor и borderColor применяются через inline стили
    },
    expertBoxBorder: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 4,
        height: '100%',
        opacity: 0.3,
        // backgroundColor применяется через inline стили
    },
    expertBoxHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
    },
    expertBoxIconContainer: {
        padding: 8,
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderRadius: 12,
    },
    expertBoxTitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.2,
        // color применяется через inline стили
    },
    expertBoxText: {
        fontSize: 14,
        fontWeight: 'bold',
        lineHeight: 24,
        fontStyle: 'italic',
        marginBottom: 32,
        paddingLeft: 4,
        // color применяется через inline стили
    },
    prosConsGrid: {
        flexDirection: 'row',
        gap: 32,
        paddingTop: 24,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0, 0, 0, 0.05)',
    },
    prosConsColumn: {
        flex: 1,
        gap: 16,
    },
    prosConsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    prosConsTitle: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили
    },
    prosConsList: {
        gap: 12,
    },
    prosConsItem: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
    },
    prosConsTextWrap: {
        flex: 1,
        flexShrink: 1,
        minWidth: 0,
    },
    prosConsBullet: {
        fontSize: 11,
        fontWeight: 'bold',
        // color применяется через inline стили
    },
    prosConsText: {
        fontSize: 11,
        fontWeight: 'bold',
        lineHeight: 16,
        // color применяется через inline стили
    },
    prosConsEmpty: {
        fontSize: 10,
        color: '#9ca3af',
        fontStyle: 'italic',
    },
    protocolsSection: {
        gap: 16,
        paddingTop: 24,
    },
    protocolsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    protocolsHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    protocolsIconContainer: {
        padding: 8,
        backgroundColor: '#10b981',
        borderRadius: 12,
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
    },
    protocolsTitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.2,
        color: '#9ca3af',
    },
    protocolsBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.1)',
    },
    protocolsBadgeText: {
        fontSize: 8,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        color: '#10b981',
    },
    protocolsList: {
        gap: 12,
    },
    protocolCard: {
        padding: 24,
        borderRadius: 36,
        borderWidth: 1,
        flexDirection: 'row',
        gap: 20,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        // backgroundColor и borderColor применяются через inline стили
    },
    protocolIconContainer: {
        padding: 16,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        // backgroundColor применяется через inline стили
    },
    protocolContent: {
        flex: 1,
        minWidth: 0,
    },
    protocolDescWrap: {
        flex: 1,
        flexShrink: 1,
        minWidth: 0,
    },
    protocolHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 6,
    },
    protocolTitle: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        // color применяется через inline стили
    },
    protocolTag: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили (если используется)
    },
    protocolTagText: {
        fontSize: 7,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили (если используется)
    },
    protocolDesc: {
        fontSize: 12,
        fontWeight: 'bold',
        lineHeight: 18,
        fontStyle: 'italic',
        // color применяется через inline стили
    },
    vulnerabilityCard: {
        padding: 32,
        borderRadius: 40,
        borderWidth: 1,
        marginTop: 24,
        overflow: 'hidden',
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        // backgroundColor и borderColor применяются через inline стили
    },
    vulnerabilityBackground: {
        position: 'absolute',
        top: 0,
        right: 0,
        padding: 32,
        opacity: 0.03,
    },
    vulnerabilityHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 40,
        zIndex: 10,
    },
    vulnerabilityIconContainer: {
        padding: 12,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    vulnerabilitySubtitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        marginBottom: 4,
        // color применяется через inline стили
    },
    vulnerabilityTitle: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        // color применяется через inline стили
    },
    vulnerabilityList: {
        gap: 24,
        marginBottom: 48,
        zIndex: 10,
    },
    vulnerabilityItem: {
        flexDirection: 'column',
        gap: 10,
    },
    vulnerabilityItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    vulnerabilityItemName: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        color: '#4b5563',
    },
    vulnerabilityItemRisk: {
        fontSize: 10,
        fontWeight: '900',
        color: '#ef4444',
    },
    vulnerabilityItemBar: {
        height: 8,
        borderRadius: 3,
        overflow: 'hidden',
        // backgroundColor применяется через inline стили (если нужно)
    },
    vulnerabilityItemBarSvg: {
        width: '100%',
        height: 8,
    },
    topVulnerabilityCard: {
        borderRadius: 36,
        padding: 28,
        borderWidth: 1,
        position: 'relative',
        overflow: 'hidden',
        // backgroundColor и borderColor применяются через inline стили
    },
    topVulnerabilityBackground: {
        position: 'absolute',
        top: 0,
        right: 0,
        padding: 16,
        opacity: 0.1,
        transform: [{ rotate: '-12deg' }, { scale: 1.5 }],
    },
    topVulnerabilityHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
        zIndex: 10,
    },
    topVulnerabilityLabel: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.2,
        color: '#dc2626',
    },
    topVulnerabilityTitle: {
        fontSize: 20,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 12,
        zIndex: 10,
        // color применяется через inline стили
    },
    topVulnerabilityDesc: {
        fontSize: 14,
        fontWeight: 'bold',
        lineHeight: 20,
        fontStyle: 'italic',
        marginBottom: 32,
        paddingLeft: 16,
        borderLeftWidth: 2,
        zIndex: 10,
        // color и borderLeftColor применяются через inline стили
    },
    topVulnerabilityPrevention: {
        gap: 16,
        paddingTop: 24,
        borderTopWidth: 1,
        zIndex: 10,
        // borderTopColor применяется через inline стили
    },
    topVulnerabilityPreventionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    topVulnerabilityPreventionTitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        color: '#059669',
    },
    topVulnerabilityPreventionBox: {
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    topVulnerabilityPreventionText: {
        fontSize: 12,
        fontWeight: 'bold',
        lineHeight: 18,
        // color применяется через inline стили
    },
    healthScanCard: {
        padding: 32,
        borderRadius: 40,
        borderWidth: 1,
        marginTop: 24,
        position: 'relative',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        // backgroundColor и borderColor применяются через inline стили
    },
    healthScanCardBackground: {
        position: 'absolute',
        top: 0,
        right: 0,
        padding: 32,
        opacity: 0.03,
    },
    healthScanCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 40,
        zIndex: 10,
    },
    healthScanCardIconContainer: {
        padding: 12,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    healthScanCardTitle: {
        fontSize: 20,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
        // color применяется через inline стили
    },
    healthScanCardSubtitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили
    },
    healthScanContent: {
        gap: 28,
        zIndex: 10,
    },
    healthScanBars: {
        gap: 24,
    },
    healthProgressContainer: {
        gap: 8,
    },
    healthProgressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    healthProgressLabel: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили
    },
    healthProgressValue: {
        fontSize: 10,
        fontWeight: '900',
    },
    healthProgressBar: {
        height: 8,
        borderRadius: 999,
        overflow: 'hidden',
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    healthProgressBarFill: {
        height: '100%',
        borderRadius: 999,
    },
    diagnosisSection: {
        marginTop: 40,
        paddingTop: 40,
        borderTopWidth: 1,
        gap: 24,
    },
    diagnosisHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 16,
        marginBottom: 20,
    },
    diagnosisIconContainer: {
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    diagnosisHeaderText: {
        flex: 1,
        minWidth: 0,
    },
    diagnosisTitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.2,
        marginBottom: 6,
    },
    diagnosisProblemTitle: {
        fontSize: 16,
        fontWeight: '900',
        lineHeight: 22,
        fontStyle: 'italic',
    },
    diagnosisContent: {
        marginBottom: 20,
    },
    diagnosisContentRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    diagnosisContentText: {
        flex: 1,
        minWidth: 0,
    },
    diagnosisContentLabel: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.2,
        marginBottom: 6,
    },
    diagnosisContentValue: {
        fontSize: 13,
        fontWeight: '600',
        lineHeight: 20,
    },
    confidenceSection: {
        marginTop: 40,
        paddingTop: 40,
        borderTopWidth: 1,
        gap: 24,
    },
    confidenceHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    confidenceIconContainer: {
        padding: 10,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.1)',
    },
    confidenceContent: {
        flex: 1,
        minWidth: 0,
    },
    confidenceLabel: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.2,
        color: '#9ca3af',
        marginBottom: 6,
    },
    confidenceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    confidenceNumber: {
        fontSize: 36,
        fontWeight: '900',
        letterSpacing: -1,
        minWidth: 72,
        textAlign: 'right',
        // color применяется через inline стили
    },
    confidenceBarContainer: {
        flex: 1,
        minWidth: 0,
    },
    confidenceBarLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    confidenceBarLabel: {
        fontSize: 8,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        color: 'rgba(16, 185, 129, 0.6)',
    },
    confidenceBar: {
        height: 4,
        borderRadius: 999,
        overflow: 'hidden',
        // backgroundColor применяется через inline стили
    },
    confidenceBarFill: {
        height: '100%',
        borderRadius: 999,
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        // backgroundColor применяется через inline стили
    },
    confidenceFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0, 0, 0, 0.05)',
        borderStyle: 'dashed',
    },
    confidenceFooterItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    confidenceFooterText: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.2,
        color: '#9ca3af',
    },
    healthScanEmpty: {
        paddingVertical: 48,
        paddingHorizontal: 24,
        borderRadius: 36,
        borderWidth: 2,
        borderStyle: 'dashed',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        // backgroundColor и borderColor применяются через inline стили
    },
    healthScanEmptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        zIndex: 10,
        // backgroundColor применяется через inline стили
    },
    healthScanEmptyTitle: {
        fontSize: 16,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 12,
        textAlign: 'center',
        zIndex: 10,
        // color применяется через inline стили
    },
    healthScanEmptyText: {
        fontSize: 12,
        fontWeight: 'bold',
        lineHeight: 18,
        marginBottom: 40,
        maxWidth: 200,
        textAlign: 'center',
        zIndex: 10,
        // color применяется через inline стили
    },
    healthScanEmptyButton: {
        width: '100%',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        zIndex: 10,
        // backgroundColor применяется через inline стили
    },
    healthScanEmptyButtonText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.2,
        color: '#ffffff',
        textAlign: 'center',
    },
    mineralCard: {
        padding: 32,
        borderRadius: 40,
        borderWidth: 1,
        marginTop: 24,
        position: 'relative',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        // backgroundColor и borderColor применяются через inline стили
    },
    mineralHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 40,
        zIndex: 10,
    },
    mineralIconContainer: {
        padding: 12,
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(99, 102, 241, 0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    mineralSubtitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        marginBottom: 4,
        // color применяется через inline стили
    },
    mineralTitle: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        // color применяется через inline стили
    },
    mineralGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 20,
        zIndex: 10,
    },
    mineralItem: {
        flex: 1,
        minWidth: '30%',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: 20,
        borderRadius: 32,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    mineralSymbol: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    mineralSymbolDeficiency: {
        backgroundColor: '#ef4444',
        borderColor: 'rgba(239, 68, 68, 0.2)',
    },
    mineralSymbolHealthy: {
        backgroundColor: '#10b981',
        borderColor: 'rgba(16, 185, 129, 0.2)',
    },
    mineralSymbolNone: {
        backgroundColor: '#ffffff',
        borderColor: '#f3f4f6',
    },
    mineralSymbolText: {
        fontSize: 14,
        fontWeight: '900',
    },
    mineralSymbolTextDeficiency: {
        color: '#ffffff',
    },
    mineralSymbolTextHealthy: {
        color: '#ffffff',
    },
    mineralSymbolTextNone: {
        color: '#d1d5db',
    },
    mineralInfo: {
        alignItems: 'center',
    },
    mineralName: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        marginBottom: 6,
    },
    mineralStatus: {
        fontSize: 7,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.1,
        // color применяется через inline стили
    },
});

export default PlantAnalysisScreen;