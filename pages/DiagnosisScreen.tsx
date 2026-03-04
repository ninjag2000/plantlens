import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Image, FlatList } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { PottedPlantIcon } from '../components/CareIcons';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';
import { getReliableImage, GENERIC_FALLBACK_IMAGE } from '../services/geminiService';
import { DISEASE_ZONE_PLANT_IMAGES, getDiseaseZoneImageIndex } from '../assets/images/plants';
import type { TranslationKey } from '../services/translations';

/** Маппинг русских названий диагнозов на ключи переводов. */
const DISEASE_TITLE_TO_KEY: Record<string, TranslationKey> = {
    'Мучнистая роса': 'diag_disease_powdery_mildew', 'Антракноз': 'diag_disease_anthracnose', 'Септориоз': 'diag_disease_septoria', 'Ржавчина': 'diag_disease_rust', 'Хлороз': 'diag_disease_chlorosis', 'Краевой некроз': 'diag_disease_marginal_necrosis', 'Бактериальная пятнистость': 'diag_disease_bacterial_spot', 'Ложная мучнистая роса': 'diag_disease_downy_mildew', 'Мозаичный вирус': 'diag_disease_mosaic_virus', 'Солнечный ожог': 'diag_disease_sunburn',
    'Стеблевая гниль': 'diag_disease_stem_rot', 'Черная ножка': 'diag_disease_black_leg', 'Бактериальный рак': 'diag_disease_bacterial_canker', 'Фузариозное увядание': 'diag_disease_fusarium_wilt', 'Вертициллез': 'diag_disease_verticillium_wilt', 'Фитофтороз стебля': 'diag_disease_stem_blight', 'Механический разрыв коры': 'diag_disease_bark_split', 'Этиоляция': 'diag_disease_etiolation', 'Камедетечение': 'diag_disease_gummosis', 'Стеблевая нематода': 'diag_disease_stem_nematode',
    'Корневая гниль': 'diag_disease_root_rot', 'Залив корней': 'diag_disease_root_flooding', 'Солевой ожог': 'diag_disease_salt_burn', 'Галловая нематода': 'diag_disease_root_knot_nematode', 'Закисание почвы': 'diag_disease_soil_souring', 'Трахеомикоз': 'diag_disease_tracheomycosis', 'Переохлаждение корней': 'diag_disease_root_chill', 'Питиоз': 'diag_disease_pythium', 'Ризоктониоз': 'diag_disease_rhizoctonia', 'Корневой червец': 'diag_disease_root_mealybug',
    'Паутинный клещ': 'diag_disease_spider_mite', 'Трипсы': 'diag_disease_thrips', 'Мучнистый червец': 'diag_disease_mealybug', 'Щитовка': 'diag_disease_scale', 'Тля': 'diag_disease_aphid', 'Белокрылка': 'diag_disease_whitefly', 'Сциариды': 'diag_disease_fungus_gnats', 'Минирующая моль': 'diag_disease_leaf_miner', 'Цикадки': 'diag_disease_leafhopper', 'Улитки и слизни': 'diag_disease_snails_slugs',
    'Серая гниль бутонов': 'diag_disease_bud_gray_mold', 'Опадание бутонов': 'diag_disease_bud_drop', 'Трипс цветочный': 'diag_disease_flower_thrips', 'Деформация лепестков': 'diag_disease_petal_deformity', 'Вирусное пестрение': 'diag_disease_virus_variegation', 'Мумификация завязей': 'diag_disease_ovary_mummification', 'Ботритис': 'diag_disease_botrytis', 'Нехватка бора': 'diag_disease_boron_deficiency', 'Ожог пыльцы': 'diag_disease_pollen_burn', 'Короткое цветение': 'diag_disease_short_bloom',
    'Вершинная гниль': 'diag_disease_blossom_end_rot', 'Горькая ямчатость': 'diag_disease_bitter_pit', 'Парша': 'diag_disease_scab', 'Плодовая гниль': 'diag_disease_fruit_rot', 'Растрескивание плодов': 'diag_disease_fruit_cracking', 'Фитофтороз плодов': 'diag_disease_fruit_blight', 'Черная плесень': 'diag_disease_black_mold', 'Недоразвитость семян': 'diag_disease_seed_underdevelopment', 'Медянка': 'diag_disease_medyanka', 'Мумификация': 'diag_disease_mummification',
    'Общее увядание': 'diag_disease_general_wilt', 'Азотное голодание': 'diag_disease_nitrogen_starvation', 'Тепловой шок': 'diag_disease_heat_shock', 'Химическое отравление': 'diag_disease_chemical_poisoning', 'Световое голодание': 'diag_disease_light_starvation', 'Передозировка удобрений': 'diag_disease_fertilizer_overdose', 'Засыхание точки роста': 'diag_disease_growing_point_dry', 'Стагнация развития': 'diag_disease_development_stagnation', 'Критический дефицит влаги': 'diag_disease_critical_water_deficit', 'Кислотный стресс почвы': 'diag_disease_soil_acid_stress',
};

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
    titleKey: TranslationKey;
    desc: string;
    severity: 'low' | 'medium' | 'high';
    imageUrl: string;
    imageIndex?: number;
    content: ProblemContent;
}

const createTenProblems = (category: string): Problem[] => {
    const titles: Record<string, string[]> = {
        "diag_cat_leaves": ["Мучнистая роса", "Антракноз", "Септориоз", "Ржавчина", "Хлороз", "Краевой некроз", "Бактериальная пятнистость", "Ложная мучнистая роса", "Мозаичный вирус", "Солнечный ожог"],
        "diag_cat_stem": ["Стеблевая гниль", "Черная ножка", "Бактериальный рак", "Фузариозное увядание", "Вертициллез", "Фитофтороз стебля", "Механический разрыв коры", "Этиоляция", "Камедетечение", "Стеблевая нематода"],
        "diag_cat_roots": ["Корневая гниль", "Залив корней", "Солевой ожог", "Галловая нематода", "Закисание почвы", "Трахеомикоз", "Переохлаждение корней", "Питиоз", "Ризоктониоз", "Корневой червец"],
        "diag_cat_pests": ["Паутинный клещ", "Трипсы", "Мучнистый червец", "Щитовка", "Тля", "Белокрылка", "Сциариды", "Минирующая моль", "Цикадки", "Улитки и слизни"],
        "diag_cat_flowers": ["Серая гниль бутонов", "Опадание бутонов", "Трипс цветочный", "Деформация лепестков", "Вирусное пестрение", "Мумификация завязей", "Ботритис", "Нехватка бора", "Ожог пыльцы", "Короткое цветение"],
        "diag_cat_fruits": ["Вершинная гниль", "Горькая ямчатость", "Парша", "Плодовая гниль", "Растрескивание плодов", "Фитофтороз плодов", "Черная плесень", "Недоразвитость семян", "Медянка", "Мумификация"],
        "diag_cat_all": ["Общее увядание", "Азотное голодание", "Тепловой шок", "Химическое отравление", "Световое голодание", "Передозировка удобрений", "Засыхание точки роста", "Стагнация развития", "Критический дефицит влаги", "Кислотный стресс почвы"]
    };

    return (titles[category] || []).map((title, i) => {
        const titleKey = DISEASE_TITLE_TO_KEY[title] ?? 'diag_disease_general_wilt';
        return {
            title,
            titleKey,
            desc: '', // заполняется в UI через t('diag_pathology_desc').replace('{name}', t(titleKey))
            severity: i % 3 === 0 ? 'high' : i % 2 === 0 ? 'medium' : 'low',
            imageUrl: getReliableImage(title),
            imageIndex: getDiseaseZoneImageIndex(title),
            content: {
                symptoms: '',
                symptomsImg: getReliableImage(title + "symptom"),
                treatment: '',
                treatmentImg: getReliableImage(title + "treatment"),
                prevention: '',
                preventionImg: getReliableImage(title + "prevention")
            }
        };
    });
};

const DiagnosisScreen: React.FC = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { t } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [imageErrors, setImageErrors] = useState<Record<string, number>>({});

    useEffect(() => {
        if ((route.params as any)?.prefilledPlant) {
            setSearchQuery((route.params as any).prefilledPlant);
        }
    }, [route.params]);

    const CATEGORIES = [
        { id: "diag_cat_all", icon: 'leaf' as const, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
        { id: "diag_cat_stem", icon: 'git-branch' as const, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
        { id: "diag_cat_leaves", icon: 'leaf' as const, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' },
        { id: "diag_cat_flowers", icon: 'flower' as const, color: '#ec4899', bg: 'rgba(236, 72, 153, 0.1)' },
        { id: "diag_cat_fruits", icon: 'nutrition' as const, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
        { id: "diag_cat_roots", icon: 'git-network' as const, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
        { id: "diag_cat_pests", icon: 'bug' as const, color: '#f97316', bg: 'rgba(249, 115, 22, 0.1)' }
    ];

    const diagnosisTools = [
        { id: "diag", icon: 'pulse' as const, titleKey: 'tool_ai_doctor_title' as const, descKey: 'tool_ai_doctor_desc' as const, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', action: () => navigation.navigate('NewCameraScreen' as never, { analysisMode: 'diagnosis' } as never) },
        { id: 'water', titleKey: 'care_water' as const, descKey: 'tool_watering_desc' as const, icon: 'water' as const, action: () => navigation.navigate('NewCameraScreen' as never, { analysisMode: 'water' } as never), color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
        { id: 'light', titleKey: 'tool_light_title' as const, descKey: 'tool_light_desc' as const, icon: 'sunny' as const, action: () => navigation.navigate('Luxometer' as never), color: '#eab308', bg: 'rgba(234, 179, 8, 0.1)' },
        { id: 'repot', titleKey: 'care_repot' as const, descKey: 'tool_repot_desc' as const, icon: 'arrow-up-circle' as const, action: () => navigation.navigate('NewCameraScreen' as never, { analysisMode: 'repotting' } as never), color: '#f97316', bg: 'rgba(249, 115, 22, 0.1)' },
    ];

    const getProblems = (catKey: string) => createTenProblems(catKey);

    const handleProblemSelect = (problem: Problem, categoryKey: string) => {
        const category = CATEGORIES.find(c => c.id === categoryKey);
        navigation.navigate('ProblemDetail' as never, { 
            problem, 
            categoryName: t(categoryKey as any),
            categoryColor: category?.color || '#22c55e'
        } as never);
    };

    const handleImageError = (key: string) => {
        const errorCount = imageErrors[key] || 0;
        if (errorCount === 0) {
            setImageErrors({ ...imageErrors, [key]: 1 });
        } else if (errorCount === 1) {
            setImageErrors({ ...imageErrors, [key]: 2 });
        }
    };

    const getImageSource = (problem: Problem) => {
        if (problem.imageIndex != null) {
            const local = DISEASE_ZONE_PLANT_IMAGES[problem.imageIndex];
            if (local?.uri) return local;
        }
        const errorCount = imageErrors[problem.title] || 0;
        if (errorCount === 0) {
            return { uri: problem.imageUrl };
        } else if (errorCount === 1) {
            return { uri: getReliableImage(problem.title) };
        } else {
            return { uri: GENERIC_FALLBACK_IMAGE };
        }
    };

    const searchResults = useMemo(() => {
        if (!searchQuery) return [];
        const results: {problem: Problem, categoryKey: string}[] = [];
        
        CATEGORIES.forEach(cat => {
            const problems = getProblems(cat.id);
            problems.forEach(p => {
                if (p.title.toLowerCase().includes(searchQuery.toLowerCase())) {
                    results.push({problem: p, categoryKey: cat.id});
                }
            });
        });
        return results;
    }, [searchQuery]);

    if (selectedCategoryKey) {
        const categoryStyle = CATEGORIES.find(c => c.id === selectedCategoryKey)!;
        const problems = getProblems(selectedCategoryKey);

        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.categoryHeader, { backgroundColor: colors.card, borderBottomColor: colors.borderLight }]}>
                    <Pressable onPress={() => setSelectedCategoryKey(null)} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={20} color={colors.textMuted} />
                        <Text style={[styles.backText, { color: colors.textMuted }]}>{t('diag_back')}</Text>
                    </Pressable>
                    <View style={styles.categoryHeaderContent}>
                        <View style={[styles.categoryIconContainer, { backgroundColor: categoryStyle.bg }]}>
                            <Ionicons name={categoryStyle.icon} size={28} color={categoryStyle.color} />
                        </View>
                        <View>
                            <Text style={[styles.categoryTitle, { color: colors.text }]}>{t(selectedCategoryKey as any)}</Text>
                            <Text style={[styles.categorySubtitle, { color: colors.textMuted }]}>{problems.length} {t('diag_articles_count')}</Text>
                        </View>
                    </View>
                </View>

                <FlatList
                    data={problems}
                    renderItem={({ item, index }) => (
                        <Pressable
                            key={index}
                            onPress={() => handleProblemSelect(item, selectedCategoryKey)}
                            style={({ pressed }) => [
                                styles.problemCard,
                                { backgroundColor: colors.card, borderColor: colors.borderLight },
                                pressed && styles.problemCardPressed,
                            ]}
                        >
                            <View style={[styles.problemImageContainer, { backgroundColor: colors.surface }]}>
                                <Image 
                                    source={getImageSource(item)}
                                    style={styles.problemImage}
                                    resizeMode="cover"
                                    onError={() => handleImageError(item.title)}
                                />
                            </View>
                            <View style={styles.problemContent}>
                                <Text style={[styles.problemTitle, { color: colors.text }]}>{t(item.titleKey)}</Text>
                                <Text style={[styles.problemDesc, { color: colors.textSecondary }]}>{t('diag_pathology_desc').replace('{name}', t(item.titleKey))}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={colors.primary} style={{ opacity: 0.5 }} />
                        </Pressable>
                    )}
                    keyExtractor={(item, index) => `${item.title}-${index}`}
                    contentContainerStyle={styles.problemsList}
                />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.borderLight }]}>
                <View style={styles.headerTop}>
                    <View style={[styles.headerIconContainer, { backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)' }]}>
                        <Ionicons name="pulse" size={24} color={colors.error} />
                    </View>
                    <View>
                        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('diagnosis_screen_title')}</Text>
                        <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>{t('diagnosis_ai_subtitle')}</Text>
                    </View>
                </View>

                <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
                    <TextInput 
                        value={searchQuery} 
                        onChangeText={setSearchQuery} 
                        placeholder={t('search_symptoms_placeholder')}
                        style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.borderLight }]}
                        placeholderTextColor={colors.textMuted}
                    />
                </View>
            </View>

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {searchQuery ? (
                    <View style={styles.searchResults}>
                        {searchResults.length > 0 ? searchResults.map((item, idx) => (
                            <Pressable
                                key={idx}
                                onPress={() => handleProblemSelect(item.problem, item.categoryKey)}
                                style={({ pressed }) => [
                                    styles.searchResultCard,
                                    { backgroundColor: colors.card, borderColor: colors.borderLight },
                                    pressed && styles.searchResultCardPressed,
                                ]}
                            >
                                <View style={[styles.searchResultImageContainer, { backgroundColor: colors.surface }]}>
                                    <Image 
                                        source={getImageSource(item.problem)}
                                        style={styles.searchResultImage}
                                        resizeMode="cover"
                                        onError={() => handleImageError(item.problem.title)}
                                    />
                                </View>
                                <View style={styles.searchResultContent}>
                                    <Text style={[styles.searchResultTitle, { color: colors.text }]}>{t(item.problem.titleKey)}</Text>
                                    <Text style={[styles.searchResultCategory, { color: colors.textMuted }]}>{t(item.categoryKey as any)}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                            </Pressable>
                        )) : (
                            <View style={styles.emptySearch}>
                                <Text style={[styles.emptySearchText, { color: colors.textMuted }]}>{t('search_no_results')}</Text>
                            </View>
                        )}
                    </View>
                ) : (
                    <>
                        <View style={styles.section}>
                            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('diag_tools_title')}</Text>
                            <View style={styles.toolsGrid}>
                                {diagnosisTools.map((tool) => (
                                    <Pressable 
                                        key={tool.id} 
                                        onPress={tool.action} 
                                        style={({ pressed }) => [
                                            styles.toolCard,
                                            { backgroundColor: colors.card, borderColor: colors.borderLight },
                                            pressed && styles.toolCardPressed,
                                        ]}
                                    >
                                        <View style={[styles.toolIconContainer, { backgroundColor: tool.bg }]}>
                                            <Ionicons name={tool.icon} size={22} color={tool.color} />
                                        </View>
                                        <View style={styles.toolContent}>
                                            <Text style={[styles.toolTitle, { color: colors.text }]}>{t(tool.titleKey)}</Text>
                                            <Text style={[styles.toolDesc, { color: colors.textMuted }]}>{t(tool.descKey)}</Text>
                                        </View>
                                    </Pressable>
                                ))}
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('diag_zones_title').toUpperCase()}</Text>
                            <View style={styles.categoriesGrid}>
                                {CATEGORIES.map((cat) => (
                                    <Pressable
                                        key={cat.id}
                                        onPress={() => setSelectedCategoryKey(cat.id)}
                                        style={({ pressed }) => [
                                            styles.categoryCard,
                                            pressed && styles.categoryCardPressed,
                                        ]}
                                    >
                                        <View style={[styles.categoryIcon, { backgroundColor: cat.bg, borderColor: colors.borderLight }]}>
                                            {cat.id === 'diag_cat_all' ? (
                                                <PottedPlantIcon size={24} color={cat.color} />
                                            ) : (
                                                <Ionicons name={cat.icon} size={24} color={cat.color} />
                                            )}
                                        </View>
                                        <Text style={[styles.categoryLabel, { color: colors.textSecondary }]} numberOfLines={2}>
                                            {t(cat.id as any)}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor применяется через inline стили
    },
    header: {
        padding: 24,
        paddingTop: 60,
        paddingBottom: 16,
        // backgroundColor и borderBottomColor применяются через inline стили
        borderBottomWidth: 1,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 24,
    },
    headerIconContainer: {
        padding: 12,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: 16,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '900',
        // color применяется через inline стили
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    searchContainer: {
        position: 'relative',
    },
    searchIcon: {
        position: 'absolute',
        left: 16,
        top: '50%',
        marginTop: -10,
        zIndex: 1,
    },
    searchInput: {
        width: '100%',
        borderRadius: 24,
        paddingLeft: 48,
        paddingRight: 16,
        paddingVertical: 16,
        fontSize: 14,
        borderWidth: 1,
        // backgroundColor, color и borderColor применяются через inline стили
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 24,
        paddingBottom: 100,
    },
    section: {
        marginBottom: 40,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 3.2,
        marginLeft: 8,
        marginBottom: 16,
        // color применяется через inline стили
    },
    toolsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
    },
    toolCard: {
        width: '47%',
        padding: 20,
        borderRadius: 32,
        borderWidth: 1,
        alignItems: 'center',
        gap: 12,
        // backgroundColor и borderColor применяются через inline стили
    },
    toolCardPressed: {
        transform: [{ scale: 0.95 }],
    },
    toolIconContainer: {
        padding: 12,
        borderRadius: 16,
    },
    toolContent: {
        alignItems: 'center',
    },
    toolTitle: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: -0.5,
        marginBottom: 2,
        // color применяется через inline стили
    },
    toolDesc: {
        fontSize: 10,
        fontWeight: '700',
        // color применяется через inline стили
    },
    categoriesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'space-between',
    },
    categoryCard: {
        width: '31%',
        alignItems: 'center',
        gap: 8,
    },
    categoryCardPressed: {
        transform: [{ scale: 0.95 }],
    },
    categoryIcon: {
        width: 64,
        height: 64,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        // borderColor применяется через inline стили
    },
    categoryLabel: {
        fontSize: 10,
        fontWeight: '700',
        textAlign: 'center',
        maxWidth: 80,
        // color применяется через inline стили
    },
    categoryHeader: {
        padding: 24,
        paddingTop: 60,
        borderBottomWidth: 1,
        // backgroundColor и borderBottomColor применяются через inline стили
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    backText: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    categoryHeaderContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    categoryIconContainer: {
        padding: 12,
        borderRadius: 16,
    },
    categoryTitle: {
        fontSize: 24,
        fontWeight: '900',
        // color применяется через inline стили
    },
    categorySubtitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    problemsList: {
        padding: 24,
        gap: 16,
    },
    problemCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 16,
        borderRadius: 32,
        borderWidth: 1,
        gap: 8,
        // backgroundColor и borderColor применяются через inline стили
    },
    problemCardPressed: {
        transform: [{ scale: 0.98 }],
    },
    problemImageContainer: {
        width: 80,
        height: 80,
        borderRadius: 16,
        overflow: 'hidden',
        // backgroundColor применяется через inline стили
    },
    problemImage: {
        width: '100%',
        height: '100%',
    },
    problemContent: {
        flex: 1,
        minWidth: 0,
    },
    problemTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 4,
        // color применяется через inline стили
    },
    problemDesc: {
        fontSize: 12,
        lineHeight: 18,
        // color применяется через inline стили
    },
    searchResults: {
        gap: 16,
    },
    searchResultCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 32,
        borderWidth: 1,
        gap: 16,
        // backgroundColor и borderColor применяются через inline стили
    },
    searchResultCardPressed: {
        transform: [{ scale: 0.98 }],
    },
    searchResultImageContainer: {
        width: 64,
        height: 64,
        borderRadius: 12,
        overflow: 'hidden',
        // backgroundColor применяется через inline стили
    },
    searchResultImage: {
        width: '100%',
        height: '100%',
    },
    searchResultContent: {
        flex: 1,
        minWidth: 0,
    },
    searchResultTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 4,
        // color применяется через inline стили
    },
    searchResultCategory: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    emptySearch: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    emptySearchText: {
        fontSize: 14,
        // color применяется через inline стили
    },
});

export default DiagnosisScreen;
