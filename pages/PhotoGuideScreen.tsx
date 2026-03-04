import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Animated, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';

const PhotoGuideScreen: React.FC = () => {
    const navigation = useNavigation();
    const { t } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const [currentStep, setCurrentStep] = useState(0);
    const fadeAnim = React.useRef(new Animated.Value(1)).current;

    const steps = [
        {
            title: t('guide_step1_title'),
            desc: t('guide_step1_desc'),
            image: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Nerium_oleander_Flower.jpg/400px-Nerium_oleander_Flower.jpg",
            icon: 'sunny' as const,
            color: '#fbbf24',
            bg: 'rgba(251, 191, 36, 0.2)',
        },
        {
            title: t('guide_step2_title'),
            desc: t('guide_step2_desc'),
            image: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Pilea_peperomioides_Chinese_money_plant.jpg/400px-Pilea_peperomioides_Chinese_money_plant.jpg",
            icon: 'camera' as const,
            color: '#60a5fa',
            bg: 'rgba(96, 165, 250, 0.2)',
        },
        {
            title: t('guide_step3_title'),
            desc: t('guide_step3_desc'),
            image: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Digitalis_purpurea_004.JPG/400px-Digitalis_purpurea_004.JPG",
            icon: 'scan' as const,
            color: '#10b981',
            bg: 'rgba(16, 185, 129, 0.2)',
        },
        {
            title: t('guide_step4_title'),
            desc: t('guide_step4_desc'),
            image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Centaurea_cyanus_001.jpg/400px-Centaurea_cyanus_001.jpg",
            icon: 'grid' as const,
            color: '#a78bfa',
            bg: 'rgba(167, 139, 250, 0.2)',
        }
    ];

    const handleComplete = async () => {
        await AsyncStorage.setItem('plantlens_seen_guide', 'true');
        navigation.goBack();
    };

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            Animated.sequence([
                Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();
            setCurrentStep(prev => prev + 1);
        } else {
            handleComplete();
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            Animated.sequence([
                Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();
            setCurrentStep(prev => prev - 1);
        } else {
            navigation.goBack();
        }
    };

    const currentSlide = steps[currentStep];
    const isLastStep = currentStep === steps.length - 1;

    return (
        <View style={styles.container}>
            <Image 
                source={{ uri: currentSlide.image }} 
                style={styles.backgroundImage}
                resizeMode="cover"
            />
            <View style={styles.overlay} />

            <View style={styles.header}>
                <Pressable 
                    onPress={handleBack} 
                    style={({ pressed }) => [
                        styles.headerButton,
                        pressed && styles.headerButtonPressed,
                    ]}
                >
                    <Ionicons name="arrow-back" size={20} color="#ffffff" />
                </Pressable>
                
                <View style={styles.indicators}>
                    {steps.map((_, idx) => (
                        <View 
                            key={idx} 
                            style={[
                                styles.indicator,
                                idx === currentStep && styles.indicatorActive,
                            ]} 
                        />
                    ))}
                </View>

                <Pressable 
                    onPress={handleComplete} 
                    style={({ pressed }) => [
                        styles.headerButton,
                        pressed && styles.headerButtonPressed,
                    ]}
                >
                    <Ionicons name="close" size={20} color="#ffffff" />
                </Pressable>
            </View>

            <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                <View style={styles.contentInner}>
                    <View style={[styles.iconContainer, { backgroundColor: currentSlide.bg }]}>
                        <Ionicons name={currentSlide.icon} size={32} color={currentSlide.color} />
                    </View>
                    
                    <Text style={styles.title}>{currentSlide.title}</Text>
                    <Text style={styles.desc}>{currentSlide.desc}</Text>

                    {isLastStep && (
                        <View style={styles.checklist}>
                            <Text style={styles.checklistTitle}>
                                <MaterialIcons name="auto-awesome" size={14} color="#10b981" /> {t('guide_golden_standard')}
                            </Text>
                            <View style={styles.checklistItems}>
                                <View style={styles.checklistItem}>
                                    <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                                    <Text style={styles.checklistText}>{t('guide_optimal_time_desc')}</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                                    <Text style={styles.checklistText}>{t('guide_macro_dist_desc')}</Text>
                                </View>
                                <View style={styles.checklistItem}>
                                    <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                                    <Text style={styles.checklistText}>{t('guide_integrity_desc')}</Text>
                                </View>
                            </View>
                        </View>
                    )}
                </View>
            </Animated.View>

            <View style={styles.footer}>
                <Pressable
                    onPress={handleNext}
                    style={({ pressed }) => [
                        styles.nextButton,
                        pressed && styles.nextButtonPressed,
                    ]}
                >
                    {isLastStep ? (
                        <>
                            <Ionicons name="camera" size={22} color="#000000" />
                            <Text style={styles.nextButtonText}>{t('guide_scan')}</Text>
                        </>
                    ) : (
                        <>
                            <Text style={styles.nextButtonText}>{t('guide_next')}</Text>
                            <Ionicons name="chevron-forward" size={22} color="#000000" />
                        </>
                    )}
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    backgroundImage: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        opacity: 0.8,
    },
    overlay: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: 24,
        paddingTop: 60,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 20,
    },
    headerButton: {
        padding: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    headerButtonPressed: {
        transform: [{ scale: 0.9 }],
    },
    indicators: {
        flexDirection: 'row',
        gap: 6,
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        padding: 6,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    indicator: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    indicatorActive: {
        width: 24,
        backgroundColor: '#ffffff',
    },
    content: {
        flex: 1,
        justifyContent: 'flex-end',
        padding: 32,
        paddingBottom: 120,
        zIndex: 10,
    },
    contentInner: {
        alignItems: 'flex-start',
    },
    iconContainer: {
        padding: 14,
        borderRadius: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    title: {
        fontSize: 36,
        fontWeight: '900',
        color: '#ffffff',
        marginBottom: 12,
        letterSpacing: -1,
    },
    desc: {
        fontSize: 18,
        color: '#d1d5db',
        lineHeight: 28,
        maxWidth: 300,
    },
    checklist: {
        marginTop: 32,
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    checklistTitle: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 3.2,
        color: '#10b981',
        marginBottom: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    checklistItems: {
        gap: 12,
    },
    checklistItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    checklistText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#e5e7eb',
        flex: 1,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 32,
        paddingBottom: 40,
        zIndex: 20,
    },
    nextButton: {
        width: '100%',
        backgroundColor: '#ffffff',
        paddingVertical: 20,
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
    },
    nextButtonPressed: {
        transform: [{ scale: 0.95 }],
    },
    nextButtonText: {
        color: '#000000',
        fontSize: 18,
        fontWeight: '900',
    },
});

export default PhotoGuideScreen;
