import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { getGardenerTips } from '../services/contentService';
import { getFavoriteArticleIds, getCustomArticles, TipArticle } from '../services/storageService';
import { useTheme } from '../hooks/useTheme';
import { useI18n } from '../hooks/useI18n';
import { getThemeColors } from '../utils/themeColors';

const ArticlesCatalogScreen: React.FC = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { language } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterMode, setFilterMode] = useState<'all' | 'favorites'>('all');
    const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
    const [customArticles, setCustomArticles] = useState<TipArticle[]>([]);

    useEffect(() => {
        getCustomArticles().then(setCustomArticles);
    }, []);

    const allArticles = useMemo(() => {
        const custom = Array.isArray(customArticles) ? customArticles : [];
        const staticTips = getGardenerTips(language);
        const staticArticles = staticTips.filter(tip => !custom.some(c => c.id === tip.id));
        return [...custom, ...staticArticles];
    }, [customArticles, language]);

    useEffect(() => {
        const loadFavorites = async () => {
            const favs = await getFavoriteArticleIds();
            setFavoriteIds(favs);
            
            if (route.params && (route.params as any).filter === 'favorites') {
                setFilterMode('favorites');
            }
        };
        loadFavorites();
    }, [route.params]);

    const handleBack = () => {
        navigation.goBack();
    };

    const filteredArticles = useMemo(() => {
        return allArticles.filter(article => {
            const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                 article.text.toLowerCase().includes(searchQuery.toLowerCase());
            
            const matchesFavorite = filterMode === 'favorites' ? favoriteIds.includes(article.id) : true;

            return matchesSearch && matchesFavorite;
        });
    }, [allArticles, searchQuery, filterMode, favoriteIds]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.borderLight }]}>
                <View style={styles.headerTop}>
                    <Pressable 
                        onPress={handleBack} 
                        style={({ pressed }) => [
                            styles.backButton,
                            { backgroundColor: colors.surface },
                            pressed && styles.backButtonPressed,
                        ]}
                    >
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </Pressable>
                    <Text style={[styles.title, { color: colors.text }]}>
                        {filterMode === 'favorites' ? 'Избранное' : 'Библиотека'}
                    </Text>
                </View>

                <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
                    <TextInput 
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder={filterMode === 'favorites' ? "Поиск в избранном..." : "Поиск по статьям..."}
                        style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.borderLight }]}
                        placeholderTextColor={colors.textMuted}
                    />
                </View>
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                {filterMode === 'favorites' && favoriteIds.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <View style={[styles.emptyIconContainer, { backgroundColor: colors.surface }]}>
                            <Ionicons name="heart" size={40} color={colors.textMuted} />
                        </View>
                        <Text style={[styles.emptyTitle, { color: colors.text }]}>Нет избранных статей</Text>
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                            Добавляйте полезные статьи в избранное, чтобы быстро находить их здесь.
                        </Text>
                        <Pressable 
                            onPress={() => setFilterMode('all')}
                            style={styles.emptyButton}
                        >
                            <Text style={[styles.emptyButtonText, { color: colors.primary }]}>Смотреть все статьи</Text>
                        </Pressable>
                    </View>
                ) : filteredArticles.length > 0 ? (
                    <View style={styles.articlesList}>
                        {filteredArticles.map(article => (
                            <Pressable
                                key={article.id}
                                onPress={() => navigation.navigate('ArticleDetail' as never, { articleId: article.id, article } as never)}
                                style={({ pressed }) => [
                                    styles.articleItem,
                                    { backgroundColor: colors.card, borderColor: colors.borderLight },
                                    pressed && styles.articleItemPressed,
                                ]}
                            >
                                <View style={[styles.articleIconContainer, { backgroundColor: article.image ? 'transparent' : `${article.color}20` }]}>
                                    {article.image && (article.image.startsWith('http') || article.image.startsWith('data:') || article.image.startsWith('file://')) ? (
                                        <Image source={{ uri: article.image }} style={styles.articleThumbImage} resizeMode="cover" />
                                    ) : typeof article.icon === 'function' ? (
                                        <article.icon size={24} color={article.color} />
                                    ) : (
                                        <Ionicons name={(article.icon as any) || 'book'} size={24} color={article.color} />
                                    )}
                                </View>
                                <View style={styles.articleContent}>
                                    <Text style={[styles.articleTitle, { color: colors.text }]} numberOfLines={1}>
                                        {'plantName' in article && article.plantName
                                            ? `Протокол: ${article.category}`
                                            : article.title}
                                    </Text>
                                    <Text style={[styles.articleCategory, { color: colors.textMuted }]} numberOfLines={1}>
                                        {'plantName' in article && article.plantName ? article.plantName : article.category}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                            </Pressable>
                        ))}
                    </View>
                ) : (
                    <View style={styles.emptyContainer}>
                        <View style={[styles.emptyIconContainer, { backgroundColor: colors.surface }]}>
                            <Ionicons name="book" size={40} color={colors.textMuted} />
                        </View>
                        <Text style={[styles.emptyTitle, { color: colors.text }]}>Ничего не найдено</Text>
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Попробуйте изменить запрос.</Text>
                    </View>
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
        paddingTop: 72,
        paddingBottom: 16,
        borderBottomWidth: 1,
        // backgroundColor и borderBottomColor применяются через inline стили
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 24,
    },
    backButton: {
        padding: 8,
        borderRadius: 9999,
        // backgroundColor применяется через inline стили
    },
    backButtonPressed: {
        opacity: 0.7,
    },
    title: {
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: -0.5,
        // color применяется через inline стили
    },
    searchContainer: {
        position: 'relative',
        marginBottom: 8,
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
    content: {
        flex: 1,
    },
    contentContainer: {
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 40,
    },
    articlesList: {
        gap: 12,
    },
    articleItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        borderRadius: 32,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
        // backgroundColor и borderColor применяются через inline стили
    },
    articleItemPressed: {
        transform: [{ scale: 0.98 }],
    },
    articleIconContainer: {
        padding: 12,
        borderRadius: 16,
        marginRight: 16,
        overflow: 'hidden',
    },
    articleThumbImage: {
        width: 48,
        height: 48,
        borderRadius: 16,
    },
    articleContent: {
        flex: 1,
        minWidth: 0,
    },
    articleTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 4,
        // color применяется через inline стили
    },
    articleCategory: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        // color применяется через inline стили
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
        paddingHorizontal: 32,
    },
    emptyIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 9999,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        // backgroundColor применяется через inline стили
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 8,
        textAlign: 'center',
        // color применяется через inline стили
    },
    emptyText: {
        fontSize: 14,
        textAlign: 'center',
        maxWidth: 300,
        marginBottom: 24,
        // color применяется через inline стили
    },
    emptyButton: {
        marginTop: 24,
    },
    emptyButtonText: {
        fontSize: 14,
        fontWeight: '700',
        textDecorationLine: 'underline',
        // color применяется через inline стили
    },
});

export default ArticlesCatalogScreen;
