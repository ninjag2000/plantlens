import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';

const PlantWelcomeScreen: React.FC = () => {
    const navigation = useNavigation();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
                <View style={[styles.iconContainer, { backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)' }]}>
                    <Ionicons name="leaf" size={40} color={colors.primary} />
                </View>
                <Text style={[styles.title, { color: colors.text }]}>Ваш сад пока пуст</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                    Добавьте в мой сад свое первое растение.
                </Text>
                <Pressable
                    onPress={() => navigation.navigate('NewCameraScreen' as never)}
                    style={({ pressed }) => [
                        styles.button,
                        { backgroundColor: colors.primary, shadowColor: colors.primary },
                        pressed && styles.buttonPressed,
                    ]}
                >
                    <Ionicons name="scan" size={20} color="#ffffff" />
                    <Text style={styles.buttonText}>Сканировать</Text>
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        // backgroundColor применяется через inline стили
    },
    card: {
        padding: 40,
        borderRadius: 48,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
        borderWidth: 1,
        alignItems: 'center',
        maxWidth: 400,
        width: '100%',
        // backgroundColor и borderColor применяются через inline стили
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 9999,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        // backgroundColor применяется через inline стили
    },
    title: {
        fontSize: 20,
        fontWeight: '900',
        marginBottom: 8,
        textAlign: 'center',
        // color применяется через inline стили
    },
    subtitle: {
        fontSize: 14,
        marginBottom: 32,
        textAlign: 'center',
        // color применяется через inline стили
    },
    button: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
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
        fontSize: 16,
        fontWeight: '900',
    },
});

export default PlantWelcomeScreen;
