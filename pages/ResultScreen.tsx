import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';

const GLASS_WIDTH = 160;
const GLASS_HEIGHT = 160;
const STROKE_PADDING = 4; // запас сверху/снизу, чтобы обводка не обрезалась
const GLASS_VIEW_HEIGHT = GLASS_HEIGHT + STROKE_PADDING * 2;
// Трапеция равнобедренная: верх шире, основание уже, боковые стороны равны (симметрия по центру)
const TRAP_TOP_W = 136;
const TRAP_BOT_W = 96;
const TRAP_LEFT = (GLASS_WIDTH - TRAP_TOP_W) / 2;
const TRAP_RIGHT = TRAP_LEFT + TRAP_TOP_W;
const TRAP_BOT_LEFT = (GLASS_WIDTH - TRAP_BOT_W) / 2;
const TRAP_BOT_RIGHT = TRAP_BOT_LEFT + TRAP_BOT_W;
const TRAP_R = 10; // радиус скругления углов трапеции
// Трапеция со скруглёнными углами (Path с Q в вершинах)
const trapAx = TRAP_LEFT + TRAP_R;
const trapBx = TRAP_RIGHT - TRAP_R;
const trapRightLen = Math.hypot(TRAP_BOT_RIGHT - TRAP_RIGHT, GLASS_HEIGHT);
const trapLeftLen = Math.hypot(TRAP_BOT_LEFT - TRAP_LEFT, GLASS_HEIGHT);
const TRAP_PATH =
  `M ${trapAx} 0 L ${trapBx} 0 Q ${TRAP_RIGHT} 0 ${TRAP_RIGHT} ${TRAP_R}` +
  ` L ${TRAP_BOT_RIGHT - (TRAP_BOT_RIGHT - TRAP_RIGHT) * TRAP_R / trapRightLen} ${GLASS_HEIGHT - GLASS_HEIGHT * TRAP_R / trapRightLen}` +
  ` Q ${TRAP_BOT_RIGHT} ${GLASS_HEIGHT} ${TRAP_BOT_RIGHT - TRAP_R} ${GLASS_HEIGHT}` +
  ` L ${TRAP_BOT_LEFT + TRAP_R} ${GLASS_HEIGHT} Q ${TRAP_BOT_LEFT} ${GLASS_HEIGHT} ${TRAP_BOT_LEFT} ${GLASS_HEIGHT - TRAP_R}` +
  ` L ${TRAP_LEFT + (TRAP_BOT_LEFT - TRAP_LEFT) * TRAP_R / trapLeftLen} ${TRAP_R} Q ${TRAP_LEFT} 0 ${trapAx} 0 Z`;
// Полоски параллельно левой стороне: x(y) = левая грань + отступ (чуть влево)
const dashXAt = (y: number) => TRAP_LEFT + ((TRAP_BOT_LEFT - TRAP_LEFT) * y) / GLASS_HEIGHT + 14;
const DASH_TOP = 24;
const DASH_BOT = 136;
const DASH_GAP = 8;
// Верхняя полоска в 4 раза длиннее нижней: (112 - gap) = 5 * lower => lower = 20.8, upper = 83.2
const DASH_LOWER_LEN = (DASH_BOT - DASH_TOP - DASH_GAP) / 5;
const DASH_UPPER_LEN = DASH_LOWER_LEN * 4;
const DASH_MID = DASH_TOP + DASH_UPPER_LEN;
const DASH_LOWER_START = DASH_MID + DASH_GAP;
const STRIPE_WIDTH = 5;
const STRIPE_R = 2; // радиус скругления углов полосок
// Единичный вектор и перпендикуляр для полоски
const stripeVectors = (x1: number, y1: number, x2: number, y2: number, w: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = (dy / len) * w;
    const py = (-dx / len) * w;
    return { ax: x1, ay: y1, bx: x2, by: y2, cx: x2 + px, cy: y2 + py, dx: x1 + px, dy: y1 + py };
};
// Полоска со скруглёнными углами: параллелограмм A→B→C→D с радиусом r
const stripePathRounded = (x1: number, y1: number, x2: number, y2: number, w: number, r: number): string => {
    const { ax, ay, bx, by, cx, cy, dx, dy } = stripeVectors(x1, y1, x2, y2, w);
    const u = (x: number, y: number) => {
        const l = Math.hypot(x, y) || 1;
        return { x: x / l, y: y / l };
    };
    const uAB = u(bx - ax, by - ay);
    const uBC = u(cx - bx, cy - by);
    const uCD = u(dx - cx, dy - cy);
    const uDA = u(ax - dx, ay - dy);
    const p1x = ax + uAB.x * r;
    const p1y = ay + uAB.y * r;
    const p2x = bx - uAB.x * r;
    const p2y = by - uAB.y * r;
    const p3x = bx + uBC.x * r;
    const p3y = by + uBC.y * r;
    const p4x = cx - uBC.x * r;
    const p4y = cy - uBC.y * r;
    const p5x = cx + uCD.x * r;
    const p5y = cy + uCD.y * r;
    const p6x = dx - uCD.x * r;
    const p6y = dy - uCD.y * r;
    const p7x = dx + uDA.x * r;
    const p7y = dy + uDA.y * r;
    const p8x = ax - uDA.x * r;
    const p8y = ay - uDA.y * r;
    return `M ${p1x} ${p1y} L ${p2x} ${p2y} Q ${bx} ${by} ${p3x} ${p3y} L ${p4x} ${p4y} Q ${cx} ${cy} ${p5x} ${p5y} L ${p6x} ${p6y} Q ${dx} ${dy} ${p7x} ${p7y} L ${p8x} ${p8y} Q ${ax} ${ay} ${p1x} ${p1y} Z`;
};

const GLASS_VOLUME_ML = 1000; // объём стакана 1 л
const FILL_R = 6; // радиус скругления углов заливки (низ)
const FILL_R_TOP = 3; // верхнее скругление чуть меньше
const u = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
};
// Путь заливки воды: трапеция от дна до fillTopY со скруглёнными углами
const waterFillPath = (volumeMl: number): string | null => {
    const ratio = Math.min(volumeMl, GLASS_VOLUME_ML) / GLASS_VOLUME_ML;
    if (ratio <= 0) return null;
    const fillTopY = GLASS_HEIGHT * (1 - ratio);
    const ax = TRAP_LEFT + ((TRAP_BOT_LEFT - TRAP_LEFT) * fillTopY) / GLASS_HEIGHT;
    const ay = fillTopY;
    const bx = TRAP_RIGHT + ((TRAP_BOT_RIGHT - TRAP_RIGHT) * fillTopY) / GLASS_HEIGHT;
    const by = fillTopY;
    const cx = TRAP_BOT_RIGHT;
    const cy = GLASS_HEIGHT;
    const dx = TRAP_BOT_LEFT;
    const dy = GLASS_HEIGHT;
    const r = Math.min(FILL_R, (bx - ax) / 4, (cy - by) / 4);
    const rTop = Math.min(FILL_R_TOP, (bx - ax) / 4);
    const uAB = u(ax, ay, bx, by);
    const uBC = u(bx, by, cx, cy);
    const uCD = u(cx, cy, dx, dy);
    const uDA = u(dx, dy, ax, ay);
    const p1x = ax + uAB.x * rTop, p1y = ay + uAB.y * rTop;
    const p2x = bx - uAB.x * rTop, p2y = by - uAB.y * rTop;
    const p3x = bx + uBC.x * r, p3y = by + uBC.y * r;
    const p4x = cx - uBC.x * r, p4y = cy - uBC.y * r;
    const p5x = cx + uCD.x * r, p5y = cy + uCD.y * r;
    const p6x = dx - uCD.x * r, p6y = dy - uCD.y * r;
    const p7x = dx + uDA.x * r, p7y = dy + uDA.y * r;
    const p8x = ax - uDA.x * r, p8y = ay - uDA.y * r;
    return `M ${p1x} ${p1y} L ${p2x} ${p2y} Q ${bx} ${by} ${p3x} ${p3y} L ${p4x} ${p4y} Q ${cx} ${cy} ${p5x} ${p5y} L ${p6x} ${p6y} Q ${dx} ${dy} ${p7x} ${p7y} L ${p8x} ${p8y} Q ${ax} ${ay} ${p1x} ${p1y} Z`;
};

interface WaterResultState {
    image: string;
    waterContext: {
        location: string;
        light: string;
        potDiameter: string;
        potHeight: string;
    };
}

const ResultScreen: React.FC = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { t } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const state = (route.params as any) as WaterResultState;
    const [volume, setVolume] = useState<number>(0);
    const [isCalculating, setIsCalculating] = useState(true);

    useEffect(() => {
        if (!state?.waterContext) {
            navigation.navigate('MainTabs' as never, { screen: 'Home' } as never);
            return;
        }

        const timer = setTimeout(() => {
            const d = parseFloat(state.waterContext.potDiameter);
            const h = parseFloat(state.waterContext.potHeight);
            
            const potVolume = Math.PI * Math.pow(d / 2, 2) * h;
            let multiplier = 0.22;

            if (state.waterContext.light === 'High') multiplier *= 1.2;
            else if (state.waterContext.light === 'Low') multiplier *= 0.8;

            if (state.waterContext.location.includes('Outdoor')) multiplier *= 1.3;
            if (state.waterContext.location.includes('far')) multiplier *= 0.8;

            const waterAmount = Math.round(potVolume * multiplier);
            setVolume(waterAmount);
            setIsCalculating(false);

        }, 1500);

        return () => clearTimeout(timer);
    }, [state, navigation]);

    const handleBack = () => {
        navigation.goBack();
    };
    
    const handleDone = () => navigation.navigate('MainTabs' as never, { screen: 'Home' } as never);

    const getRecommendations = (): { icon: 'time-outline' | 'thermometer-outline' | 'water-outline' | 'sunny-outline' | 'home-outline' | 'cloudy-outline'; titleKey: string; textKey: string; color: string; bg: string }[] => {
        const recs = [
            { icon: 'time-outline' as const, titleKey: 'result_best_time', textKey: 'result_best_time_text', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.1)' },
            { icon: 'thermometer-outline' as const, titleKey: 'result_water_temp', textKey: 'result_water_temp_text', color: '#f87171', bg: 'rgba(248, 113, 113, 0.1)' },
            { icon: 'water-outline' as const, titleKey: 'result_drainage', textKey: 'result_drainage_text', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' }
        ];

        if (state?.waterContext?.location?.includes('Outdoor')) {
            recs.push({ icon: 'sunny-outline' as const, titleKey: 'result_outdoor', textKey: 'result_outdoor_text', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)' });
        } else {
            recs.push({ icon: 'home-outline' as const, titleKey: 'result_indoor_climate', textKey: 'result_indoor_climate_text', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.1)' });
        }

        if (state?.waterContext?.light === 'Low') {
            recs.push({ icon: 'cloudy-outline' as const, titleKey: 'result_shade_warning', textKey: 'result_shade_warning_text', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.1)' });
        }

        return recs;
    };

    if (isCalculating) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
                <View style={styles.loadingSpinner}>
                    <ActivityIndicator size="large" color={colors.info} />
                    <Ionicons name="wine-outline" size={32} color={colors.info} style={styles.loadingIcon} />
                </View>
                <Text style={[styles.loadingTitle, { color: colors.text }]}>{t('water_calculate')}...</Text>
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>Анализируем объем почвы</Text>
            </View>
        );
    }

    const recommendations = getRecommendations();

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.borderLight }]}>
                <Pressable onPress={handleBack} style={[styles.headerButton, { backgroundColor: colors.surface }]}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </Pressable>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Результат</Text>
                <Pressable onPress={handleDone} style={[styles.headerButton, { backgroundColor: colors.surface }]}>
                    <Ionicons name="home" size={24} color={colors.text} />
                </Pressable>
            </View>

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                <View style={styles.glassContainer}>
                    <Svg width={GLASS_WIDTH} height={GLASS_VIEW_HEIGHT} style={styles.glassSvg} viewBox={`0 ${-STROKE_PADDING} ${GLASS_WIDTH} ${GLASS_VIEW_HEIGHT}`}>
                        {(() => {
                            const fillD = waterFillPath(volume);
                            return fillD ? <Path d={fillD} fill="#93c5fd" /> : null;
                        })()}
                        <Path
                            d={TRAP_PATH}
                            fill="rgba(59, 130, 246, 0.1)"
                            stroke="#3b82f6"
                            strokeWidth={STRIPE_WIDTH}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                        <Path d={stripePathRounded(dashXAt(DASH_TOP), DASH_TOP, dashXAt(DASH_MID), DASH_MID, STRIPE_WIDTH, STRIPE_R)} fill="#3b82f6" />
                        <Path d={stripePathRounded(dashXAt(DASH_LOWER_START), DASH_LOWER_START, dashXAt(DASH_BOT), DASH_BOT, STRIPE_WIDTH, STRIPE_R)} fill="#3b82f6" />
                    </Svg>
                    <Ionicons name="water" size={44} color="#3b82f6" style={styles.glassIcon} />
                </View>

                <View style={styles.volumeContainer}>
                    <View style={styles.volumeRow}>
                        <Text style={[styles.volumeText, { color: colors.text }]}>{volume}</Text>
                        <Text style={[styles.volumeUnit, { color: colors.textSecondary }]}>ml</Text>
                    </View>
                    <Text style={[styles.volumeLabel, { color: colors.info }]}>Рекомендуемый объем</Text>
                </View>

                <View style={styles.infoGrid}>
                    <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Размер горшка</Text>
                        <Text style={[styles.infoValue, { color: colors.text }]}>
                            {state.waterContext.potDiameter} <Text style={[styles.infoUnit, { color: colors.textSecondary }]}>x</Text> {state.waterContext.potHeight} <Text style={[styles.infoUnitSmall, { color: colors.textSecondary }]}>cm</Text>
                        </Text>
                    </View>
                    <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Освещение</Text>
                        <Text style={[styles.infoValue, { color: colors.text }]}>{state.waterContext.light}</Text>
                    </View>
                </View>

                <View style={styles.recommendationsContainer}>
                    <Text style={[styles.recommendationsTitle, { color: colors.textMuted }]}>Рекомендации эксперта</Text>
                    {recommendations.map((rec, idx) => (
                        <View key={idx} style={[styles.recommendationCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                            <View style={[styles.recommendationIcon, { backgroundColor: rec.bg }]}>
                                <Ionicons name={rec.icon} size={20} color={rec.color} />
                            </View>
                            <View style={styles.recommendationContent}>
                                <Text style={[styles.recommendationTitle, { color: colors.text }]}>{t(rec.titleKey)}</Text>
                                <Text style={[styles.recommendationText, { color: colors.textSecondary }]}>{t(rec.textKey)}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>

            <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.borderLight }]}>
                <Pressable
                    onPress={handleDone}
                    style={({ pressed }) => [
                        styles.footerButton,
                        { backgroundColor: colors.primary },
                        pressed && styles.footerButtonPressed,
                    ]}
                >
                    <Ionicons name="checkmark" size={20} color="#ffffff" />
                    <Text style={styles.footerButtonText}>Завершить</Text>
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
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        // backgroundColor применяется через inline стили
    },
    loadingSpinner: {
        width: 96,
        height: 96,
        marginBottom: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingIcon: {
        position: 'absolute',
    },
    loadingTitle: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 8,
        // color применяется через inline стили
    },
    loadingText: {
        fontSize: 14,
        // color применяется через inline стили
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 24,
        paddingTop: 60,
        borderBottomWidth: 1,
        // backgroundColor и borderBottomColor применяются через inline стили
    },
    headerButton: {
        padding: 8,
        borderRadius: 9999,
        // backgroundColor применяется через inline стили
    },
    headerTitle: {
        fontSize: 14,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        alignItems: 'center',
        padding: 24,
        paddingBottom: 100,
    },
    glassContainer: {
        width: GLASS_WIDTH,
        height: GLASS_VIEW_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        position: 'relative',
    },
    glassSvg: {
        position: 'absolute',
        left: 0,
        top: 0,
    },
    glassIcon: {
        position: 'absolute',
        zIndex: 10,
    },
    volumeContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    volumeRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 16,
        marginBottom: 4,
    },
    volumeText: {
        fontSize: 72,
        fontWeight: '900',
        letterSpacing: -2,
        // color применяется через inline стили
    },
    volumeUnit: {
        fontSize: 24,
        // color применяется через inline стили
    },
    volumeLabel: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 3.2,
        // color применяется через inline стили
    },
    infoGrid: {
        flexDirection: 'row',
        gap: 16,
        width: '100%',
        maxWidth: 400,
        marginBottom: 32,
        alignSelf: 'center',
        justifyContent: 'center',
    },
    infoCard: {
        flex: 1,
        padding: 16,
        borderRadius: 32,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        // backgroundColor и borderColor применяются через inline стили
    },
    infoLabel: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginBottom: 4,
        textAlign: 'center',
        // color применяется через inline стили
    },
    infoValue: {
        fontSize: 16,
        fontWeight: '700',
        fontFamily: 'monospace',
        textAlign: 'center',
        // color применяется через inline стили
    },
    infoUnit: {
        fontSize: 12,
        // color применяется через inline стили
    },
    infoUnitSmall: {
        fontSize: 10,
        // color применяется через inline стили
    },
    recommendationsContainer: {
        width: '100%',
        maxWidth: 400,
        gap: 16,
    },
    recommendationsTitle: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginLeft: 8,
        marginBottom: 8,
        // color применяется через inline стили
    },
    recommendationCard: {
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        flexDirection: 'row',
        gap: 16,
        // backgroundColor и borderColor применяются через inline стили
    },
    recommendationIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
    },
    recommendationContent: {
        flex: 1,
    },
    recommendationTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 4,
        // color применяется через inline стили
    },
    recommendationText: {
        fontSize: 12,
        lineHeight: 20,
        fontWeight: '500',
        // color применяется через inline стили
    },
    footer: {
        padding: 24,
        paddingBottom: 40,
        borderTopWidth: 1,
        // backgroundColor и borderTopColor применяются через inline стили
    },
    footerButton: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
        // backgroundColor применяется через inline стили
    },
    footerButtonPressed: {
        transform: [{ scale: 0.95 }],
    },
    footerButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '900',
    },
});

export default ResultScreen;
