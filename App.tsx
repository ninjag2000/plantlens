import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { OnboardingProvider } from './context/OnboardingContext';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScannedDocument, Plant } from './types';
import { getDocuments, getPlants, savePlant, deletePlant } from './services/storageService';
import BottomNav from './components/BottomNav';
import SplashScreen from './pages/SplashScreen';
import OnboardingScreen from './pages/OnboardingScreen';
import SubscriptionScreen from './pages/SubscriptionScreen';
import SubscriptionManageScreen from './pages/SubscriptionManageScreen';
import NewCameraScreen from './pages/NewCameraScreen';
import NewCropScreen from './pages/NewCropScreen';
import NewPreviewScreen from './pages/NewPreviewScreen';
import ProcessingScreen from './pages/ProcessingScreen';
import DocumentsScreen from './pages/DocumentsScreen';
import DetailScreen from './pages/DetailScreen';
import MyPlantsScreen from './pages/MyPlantsScreen';
import PlantDetailScreen from './pages/PlantDetailScreen';
import PlantAnalysisScreen from './pages/PlantAnalysisScreen';
import PhotoGuideScreen from './pages/PhotoGuideScreen';
import HomeScreen from './pages/HomeScreen';
import CategoryCatalogScreen from './pages/CategoryCatalogScreen';
import ArticleDetailScreen from './pages/ArticleDetailScreen';
import ArticlesCatalogScreen from './pages/ArticlesCatalogScreen';
import DiagnosisScreen from './pages/DiagnosisScreen';
import DiagnosisResultScreen from './pages/DiagnosisResultScreen';
import MoreScreen from './pages/MoreScreen';
import ProblemDetailScreen from './pages/ProblemDetailScreen';
import LuxometerScreen from './pages/LuxometerScreen';
import WaterCalculatorScreen from './pages/WaterCalculatorScreen';
import ResultScreen from './pages/ResultScreen';
import SettingsScreen from './pages/SettingsScreen';
import RepottingResultScreen from './pages/RepottingResultScreen';
import { ThemeProvider, useTheme } from './hooks/useTheme';
import { I18nProvider } from './hooks/useI18n';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { Image as ExpoImage } from 'expo-image';
import { getLibraryFallbackUrls } from './services/contentService';
import { requestNotificationPermission } from './services/notificationService';

const ONBOARDING_COMPLETE_KEY = 'plantlens_app_onboarding_complete';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const OfflineBanner: React.FC = () => {
    const isOnline = useOnlineStatus();
    if (isOnline) return null;

    return (
        <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>Оффлайн режим: Функции ИИ ограничены</Text>
        </View>
    );
};

const MainTabs = ({ plants, updatePlant, deletePlant }: { plants: Plant[]; updatePlant: (plant: Plant) => void; deletePlant: (id: string) => void }) => {
    return (
        <Tab.Navigator
            screenOptions={{ headerShown: false }}
            tabBar={(props) => <BottomNav {...props} />}
        >
            <Tab.Screen name="Home">
                {(props) => <HomeScreen {...props} plants={plants || []} updatePlant={updatePlant} />}
            </Tab.Screen>
            <Tab.Screen name="Diagnosis" component={DiagnosisScreen} />
            <Tab.Screen name="MyPlants" key={`myplants-${(plants || []).length === 0 ? 'empty' : 'loaded'}`}>
                {(props) => <MyPlantsScreen {...props} plants={plants || []} updatePlant={updatePlant} deletePlant={deletePlant} />}
            </Tab.Screen>
            <Tab.Screen name="More" component={MoreScreen} />
        </Tab.Navigator>
    );
};

const AppContent: React.FC = () => {
    const [documents, setDocuments] = useState<ScannedDocument[]>([]);
    const [plants, setPlants] = useState<Plant[]>([]);
    const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

    console.log('[AppContent] Render, onboardingComplete:', onboardingComplete);

    useEffect(() => {
        const urls = getLibraryFallbackUrls();
        if (urls.length) ExpoImage.prefetch(urls, 'disk').catch(() => {});
    }, []);
    useEffect(() => {
        console.log('[AppContent] useEffect started');
        const loadData = async () => {
            try {
                console.log('[AppContent] Loading AsyncStorage...');
                const onboarding = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
                console.log('[AppContent] onboarding value:', onboarding);
                setOnboardingComplete(onboarding === 'true');
                console.log('[AppContent] Loading documents...');
                const docs = await getDocuments();
                console.log('[AppContent] Loading plants...');
                const plantsData = await getPlants();
                setDocuments(docs);
                setPlants(plantsData);
                console.log('[AppContent] Data loaded successfully');
            } catch (error) {
                console.error('[AppContent] Error loading data:', error);
                setOnboardingComplete(false);
            }
        };
        loadData();
    }, []);

    // Запрос разрешения на уведомления при первом открытии приложения (после загрузки)
    useEffect(() => {
        if (onboardingComplete === null) return;
        requestNotificationPermission().catch(() => {});
    }, [onboardingComplete]);

    const refreshDocuments = async () => {
        const docs = await getDocuments();
        setDocuments(docs);
    };

    const addPlant = (plant: Plant) => {
        const newPlants = [plant, ...plants.filter(p => p.id !== plant.id)];
        setPlants(newPlants);
        savePlant(plant);
    };

    const updatePlant = (updatedPlant: Plant) => {
        setPlants(prevPlants => {
            const newPlants = prevPlants.map(p => p.id === updatedPlant.id ? updatedPlant : p);
            savePlant(updatedPlant);
            return newPlants;
        });
    };

    const removePlant = (plantId: string) => {
        const newPlants = plants.filter(p => p.id !== plantId);
        setPlants(newPlants);
        deletePlant(plantId);
    };

    const handleOnboardingFinish = () => {
        setOnboardingComplete(true);
        AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true').catch(() => {});
    };

    const resetOnboarding = async () => {
        await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY);
        setOnboardingComplete(false);
    };

    if (onboardingComplete === null) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingTitle}>PlantLens</Text>
                <Text style={styles.loadingSubtitle}>Загрузка...</Text>
            </View>
        );
    }

    return (
        <OnboardingProvider value={{ resetOnboarding, finishOnboarding: handleOnboardingFinish }}>
            <NavigationContainer key={onboardingComplete ? 'main' : 'onboarding'}>
                <OfflineBanner />
                <Stack.Navigator
                    key={onboardingComplete ? 'main' : 'onboarding'}
                    screenOptions={{ headerShown: false }}
                    initialRouteName={onboardingComplete ? 'MainTabs' : 'Splash'}
                >
                {!onboardingComplete ? (
                    <>
                        <Stack.Screen name="Splash" component={SplashScreen} />
                        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                        <Stack.Screen name="Subscription">
                            {(props) => <SubscriptionScreen {...props} onFinish={handleOnboardingFinish} />}
                        </Stack.Screen>
                    </>
                ) : (
                    <>
                        <Stack.Screen name="MainTabs">
                            {(props) => <MainTabs {...props} plants={plants} updatePlant={updatePlant} deletePlant={removePlant} />}
                        </Stack.Screen>
                        <Stack.Screen name="Catalog" component={CategoryCatalogScreen} />
                        <Stack.Screen name="Articles" component={ArticlesCatalogScreen} />
                        <Stack.Screen name="ArticleDetail" component={ArticleDetailScreen} />
                        <Stack.Screen name="ProblemDetail" component={ProblemDetailScreen} />
                        <Stack.Screen name="DiagnosisResult">
                            {(props) => (
                                <DiagnosisResultScreen
                                    {...props}
                                    plants={plants}
                                    addPlant={addPlant}
                                    updatePlant={updatePlant}
                                />
                            )}
                        </Stack.Screen>
                        <Stack.Screen name="NewCameraScreen" component={NewCameraScreen} />
                        <Stack.Screen name="NewCropScreen" component={NewCropScreen} />
                        <Stack.Screen name="NewPreview" component={NewPreviewScreen} />
                        <Stack.Screen name="Processing">
                            {(props) => (
                                <ProcessingScreen
                                    {...props}
                                    plants={plants}
                                    refreshDocuments={refreshDocuments}
                                    addPlant={addPlant}
                                />
                            )}
                        </Stack.Screen>
                        <Stack.Screen name="Documents">
                            {(props) => <DocumentsScreen {...props} documents={documents} />}
                        </Stack.Screen>
                        <Stack.Screen name="Detail" component={DetailScreen} />
                        <Stack.Screen name="SubscriptionManage" component={SubscriptionManageScreen} />
                        <Stack.Screen name="PlantDetail">
                            {(props) => (
                                <PlantDetailScreen
                                    {...props}
                                    plants={plants}
                                    updatePlant={updatePlant}
                                    addPlant={addPlant}
                                    deletePlant={removePlant}
                                />
                            )}
                        </Stack.Screen>
                        <Stack.Screen name="PlantAnalysis">
                            {(props) => <PlantAnalysisScreen {...props} plants={plants} />}
                        </Stack.Screen>
                        <Stack.Screen name="Guide" component={PhotoGuideScreen} />
                        <Stack.Screen name="Luxometer" component={LuxometerScreen} />
                        <Stack.Screen name="WaterCalculator" component={WaterCalculatorScreen} />
                        <Stack.Screen name="Result" component={ResultScreen} />
                        <Stack.Screen name="RepottingResult" component={RepottingResultScreen} />
                        <Stack.Screen name="Settings" component={SettingsScreen} />
                        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                    </>
                )}
            </Stack.Navigator>
            </NavigationContainer>
        </OnboardingProvider>
    );
};

const AppWithTheme: React.FC = () => {
    const { theme } = useTheme();
    
    return (
        <>
            <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />
            <AppContent />
        </>
    );
};

const App: React.FC = () => {
    return (
        <ThemeProvider>
            <I18nProvider>
                <AppWithTheme />
            </I18nProvider>
        </ThemeProvider>
    );
};

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        backgroundColor: '#ffffff',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        width: '100%',
    },
    loadingTitle: {
        fontSize: 36,
        fontWeight: '900',
        color: '#111827',
        marginBottom: 8,
    },
    loadingSubtitle: {
        fontSize: 14,
        color: '#6b7280',
    },
    offlineBanner: {
        backgroundColor: '#f97316',
        paddingVertical: 6,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
    },
    offlineText: {
        color: '#ffffff',
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.2,
    },
});

export default App;
