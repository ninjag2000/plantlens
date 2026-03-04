import React from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import PlantLensLogo from '../components/ScanLensLogo';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';

const SplashScreen: React.FC = () => {
    const navigation = useNavigation();
    const { t } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    const fadeAnim = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
        }).start();
    }, []);

    const handleContinue = () => {
        navigation.navigate('Onboarding' as never);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.content}>
                <Animated.View style={[styles.logoContainer, { opacity: fadeAnim }]}>
                    <PlantLensLogo size={80} />
                </Animated.View>
                <Animated.View style={[styles.titleContainer, { opacity: fadeAnim }]}>
                    <Text style={[styles.title, { color: colors.text }]}>PlantLens</Text>
                    <Text style={[styles.tagline, { color: colors.textMuted }]}>{t('splash_tagline')}</Text>
                </Animated.View>
            </View>
            <View style={styles.footer}>
                <Animated.View style={[styles.agreementContainer, { opacity: fadeAnim }]}>
                    <Text style={[styles.agreement, { color: colors.textMuted }]}>
                        {t('splash_agreement')}{' '}
                        <Text style={[styles.link, { color: colors.text }]}>{t('splash_terms')}</Text>{' '}
                        {t('splash_and')}{' '}
                        <Text style={[styles.link, { color: colors.text }]}>{t('splash_privacy')}</Text>.
                    </Text>
                </Animated.View>
                <Pressable
                    onPress={handleContinue}
                    style={({ pressed }) => [
                        styles.button,
                        { backgroundColor: colors.primary, shadowColor: colors.primary },
                        pressed && styles.buttonPressed,
                    ]}
                >
                    <Text style={styles.buttonText}>{t('splash_get_started')}</Text>
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 32,
        justifyContent: 'space-between',
        alignItems: 'center',
        overflow: 'hidden',
        width: '100%',
        // backgroundColor применяется через inline стили
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoContainer: {
        marginBottom: 24,
    },
    titleContainer: {
        alignItems: 'center',
    },
    title: {
        fontSize: 36,
        fontWeight: '900',
        letterSpacing: -0.5,
        // color применяется через inline стили
    },
    tagline: {
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 3.2,
        marginTop: 4,
        // color применяется через inline стили
    },
    footer: {
        width: '100%',
    },
    agreementContainer: {
        marginBottom: 24,
    },
    agreement: {
        fontSize: 10,
        lineHeight: 16,
        textAlign: 'center',
        // color применяется через inline стили
    },
    link: {
        textDecorationLine: 'underline',
        fontWeight: '700',
        // color применяется через inline стили
    },
    button: {
        width: '100%',
        paddingVertical: 20,
        borderRadius: 9999,
        alignItems: 'center',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
        // backgroundColor и shadowColor применяются через inline стили
    },
    buttonPressed: {
        transform: [{ scale: 0.95 }],
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '900',
    },
});

export default SplashScreen;
