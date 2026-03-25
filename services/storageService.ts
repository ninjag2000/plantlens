import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Plant, ScannedDocument, Collection } from '../types';
import { MaterialIcons } from '@expo/vector-icons';
import * as data from '../lib/data';

const PLANTS_KEY = 'plant_app_plants';
const COLLECTIONS_KEY = 'plant_app_collections';
const FAVORITES_KEY = 'plantlens_favorite_articles';
const DIAGNOSIS_FAVORITES_KEY = 'plantlens_favorite_diagnosis';
const SEARCH_HISTORY_KEY = 'plantlens_search_history';
const DOCUMENTS_KEY = 'plantlens_app_documents';
const CUSTOM_ARTICLES_KEY = 'plantlens_custom_articles';

export interface TipArticle {
    id: string;
    title: string;
    category: string;
    text: string;
    icon: React.ElementType;
    color: string;
    image: string;
    plantName?: string;
}

/** Local-only read (AsyncStorage). Used by data layer when Supabase is off or as fallback. */
async function getPlantsLocal(): Promise<Plant[]> {
    try {
        const raw = await AsyncStorage.getItem(PLANTS_KEY);
        if (raw === null) {
            await AsyncStorage.setItem(PLANTS_KEY, JSON.stringify([]));
            return [];
        }
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

/** Local-only write full list (AsyncStorage). */
async function savePlantsLocal(plants: Plant[]): Promise<void> {
    await AsyncStorage.setItem(PLANTS_KEY, JSON.stringify(plants));
}

// Sync version for backward compatibility (returns cached or empty array)
let plantsCache: Plant[] | null = null;

export const getPlants = async (): Promise<Plant[]> => {
    const result = await data.getPlants(getPlantsLocal);
    plantsCache = result;
    return result;
};

export const getPlantsSync = (): Plant[] => {
    if (plantsCache) return plantsCache;
    return [];
};

export const savePlant = async (plant: Plant): Promise<void> => {
    await data.savePlant(plant, getPlantsLocal, savePlantsLocal);
    const list = await data.getPlants(getPlantsLocal);
    plantsCache = list;
};

export const updatePlantInStorage = async (plant: Plant): Promise<void> => {
    await savePlant(plant);
};

export const deletePlant = async (id: string): Promise<void> => {
    await data.deletePlant(id, getPlantsLocal, savePlantsLocal);
    const list = await data.getPlants(getPlantsLocal);
    plantsCache = list;
    const { removeCachedPlantDetail } = await import('./plantCacheService');
    await removeCachedPlantDetail(id);
};

export const getCollections = async (): Promise<Collection[]> => {
    try {
        const data = await AsyncStorage.getItem(COLLECTIONS_KEY);
        if (!data) return [];
        return JSON.parse(data);
    } catch (e) { return []; }
};

export const saveCollection = async (collection: Collection): Promise<void> => {
    const collections = await getCollections();
    const existingIndex = collections.findIndex(c => c.id === collection.id);
    if (existingIndex > -1) collections[existingIndex] = collection;
    else collections.push(collection);
    await AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
};

export const deleteCollection = async (id: string): Promise<void> => {
    const collections = (await getCollections()).filter(c => c.id !== id);
    await AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
};

export const getFavoriteArticleIds = async (): Promise<string[]> => {
    try {
        const data = await AsyncStorage.getItem(FAVORITES_KEY);
        if (!data) return [];
        return JSON.parse(data);
    } catch { return []; }
};

export const toggleFavoriteArticle = async (articleId: string): Promise<boolean> => {
    const ids = await getFavoriteArticleIds();
    const index = ids.indexOf(articleId);
    let isFav = false;
    if (index > -1) { ids.splice(index, 1); isFav = false; }
    else { ids.push(articleId); isFav = true; }
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
    return isFav;
};

export const getFavoriteDiagnosisIds = async (): Promise<string[]> => {
    try {
        const data = await AsyncStorage.getItem(DIAGNOSIS_FAVORITES_KEY);
        if (!data) return [];
        return JSON.parse(data);
    } catch { return []; }
};

export const toggleFavoriteDiagnosis = async (title: string): Promise<boolean> => {
    const ids = await getFavoriteDiagnosisIds();
    const index = ids.indexOf(title);
    let isFav = false;
    if (index > -1) { ids.splice(index, 1); isFav = false; }
    else { ids.push(title); isFav = true; }
    await AsyncStorage.setItem(DIAGNOSIS_FAVORITES_KEY, JSON.stringify(ids));
    return isFav;
};

export const getSearchHistory = async (): Promise<string[]> => {
    try {
        const data = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
        if (!data) return [];
        return JSON.parse(data);
    } catch { return []; }
};

export const saveSearchQuery = async (query: string): Promise<void> => {
    if (!query.trim()) return;
    let history = await getSearchHistory();
    history = history.filter(q => q.toLowerCase() !== query.toLowerCase());
    history.unshift(query.trim());
    if (history.length > 10) history = history.slice(0, 10);
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
};

export const deleteSearchQuery = async (query: string): Promise<void> => {
    let history = await getSearchHistory();
    history = history.filter(q => q !== query);
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
};

export const clearSearchHistory = async (): Promise<void> => {
    await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
};

export const getDocuments = async (): Promise<ScannedDocument[]> => {
    try {
        const data = await AsyncStorage.getItem(DOCUMENTS_KEY);
        if (!data) return [];
        const docs: ScannedDocument[] = JSON.parse(data);
        return docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (e) { return []; }
};

// Sync version for backward compatibility
let documentsCache: ScannedDocument[] | null = null;
export const getDocumentsSync = (): ScannedDocument[] => {
    if (documentsCache) return documentsCache;
    return [];
};

export const getDocumentById = async (id: string): Promise<ScannedDocument | undefined> => {
    const docs = await getDocuments();
    return docs.find(doc => doc.id === id);
};

export const saveDocument = async (doc: ScannedDocument): Promise<void> => {
    const docs = await getDocuments();
    const existingIndex = docs.findIndex(d => d.id === doc.id);
    if (existingIndex > -1) docs[existingIndex] = doc;
    else docs.unshift(doc);
    await AsyncStorage.setItem(DOCUMENTS_KEY, JSON.stringify(docs));
    documentsCache = docs;
};

export const deleteDocument = async (id: string): Promise<void> => {
    const docs = await getDocuments();
    const filtered = docs.filter(doc => doc.id !== id);
    await AsyncStorage.setItem(DOCUMENTS_KEY, JSON.stringify(filtered));
    documentsCache = filtered;
};

// Icon component for React Native using Expo vector icons
const WandIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = '#9333ea' }) => {
    return React.createElement(MaterialIcons, { 
        name: 'auto-awesome',
        size: size,
        color: color
    });
};

// --- CUSTOM ARTICLES (for dynamic AI content) ---
export const getCustomArticles = async (): Promise<TipArticle[]> => {
    try {
        const data = await AsyncStorage.getItem(CUSTOM_ARTICLES_KEY);
        if (!data) return [];
        // Re-hydrate icon component from name - use MaterialIcons for React Native
        return JSON.parse(data).map((article: any) => ({ ...article, icon: WandIcon }));
    } catch {
        return [];
    }
};

export const saveCustomArticle = async (article: Omit<TipArticle, 'icon' | 'image'> & { image?: string; plantName?: string }): Promise<void> => {
    const raw = await AsyncStorage.getItem(CUSTOM_ARTICLES_KEY);
    const articles: any[] = raw ? JSON.parse(raw) : [];
    const newArticle = { ...article, icon: 'Wand2', image: article.image ?? '', plantName: article.plantName ?? '' };
    articles.push(newArticle);
    await AsyncStorage.setItem(CUSTOM_ARTICLES_KEY, JSON.stringify(articles));
};


// --- SYNC & BACKUP LOGIC ---

export const exportAllAppData = async (): Promise<string> => {
    const data = {
        plants: await getPlants(),
        collections: await getCollections(),
        documents: await getDocuments(),
        favoriteArticles: await getFavoriteArticleIds(),
        favoriteDiagnosis: await getFavoriteDiagnosisIds(),
        customArticles: (await getCustomArticles()).map(({ icon, ...rest }) => rest), // Don't export component
        exportDate: new Date().toISOString(),
        version: '1.1'
    };
    return JSON.stringify(data, null, 2);
};

export const importAllAppData = async (jsonString: string): Promise<boolean> => {
    try {
        const data = JSON.parse(jsonString);
        if (!data.plants && !data.collections) throw new Error("Invalid format");
        
        if (data.plants) await AsyncStorage.setItem(PLANTS_KEY, JSON.stringify(data.plants));
        if (data.collections) await AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(data.collections));
        if (data.documents) await AsyncStorage.setItem(DOCUMENTS_KEY, JSON.stringify(data.documents));
        if (data.favoriteArticles) await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(data.favoriteArticles));
        if (data.favoriteDiagnosis) await AsyncStorage.setItem(DIAGNOSIS_FAVORITES_KEY, JSON.stringify(data.favoriteDiagnosis));
        if (data.customArticles) await AsyncStorage.setItem(CUSTOM_ARTICLES_KEY, JSON.stringify(data.customArticles));
        
        return true;
    } catch (e) {
        console.error("Failed to import data", e);
        return false;
    }
};
