import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useI18n } from '../hooks/useI18n';
import { getThemeColors } from '../utils/themeColors';

interface SaveSuccessModalProps {
    visible: boolean;
    onClose: () => void;
    title: string;
    message: string;
    autoCloseMs?: number;
}

export const SaveSuccessModal: React.FC<SaveSuccessModalProps> = ({
    visible,
    onClose,
    title,
    message,
    autoCloseMs = 2500,
}) => {
    const { theme } = useTheme();
    const { t } = useI18n();
    const colors = getThemeColors(theme);
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!visible) {
            scaleAnim.setValue(0.9);
            opacityAnim.setValue(0);
            return;
        }
        Animated.parallel([
            Animated.spring(scaleAnim, {
                toValue: 1,
                useNativeDriver: true,
                friction: 8,
                tension: 100,
            }),
            Animated.timing(opacityAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start();

        if (autoCloseMs > 0) {
            const t = setTimeout(onClose, autoCloseMs);
            return () => clearTimeout(t);
        }
    }, [visible, autoCloseMs, onClose]);

    if (!visible) return null;

    const cardBg = theme === 'dark' ? 'rgba(55, 65, 81, 0.98)' : 'rgba(255, 255, 255, 0.98)';
    const glowShadow = theme === 'dark' ? { shadowColor: colors.success, shadowOpacity: 0.35 } : { shadowColor: colors.success, shadowOpacity: 0.2 };

    return (
        <Modal transparent visible={visible} animationType="fade" statusBarTranslucent>
            <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={onClose}>
                <Animated.View
                    style={[
                        styles.cardWrap,
                        {
                            opacity: opacityAnim,
                            transform: [{ scale: scaleAnim }],
                        },
                    ]}
                >
                    <Pressable
                        style={[
                            styles.card,
                            {
                                backgroundColor: cardBg,
                                borderColor: colors.borderLight,
                                ...glowShadow,
                            },
                        ]}
                        onPress={(e) => e.stopPropagation()}
                    >
                        <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
                            <Ionicons name="checkmark-circle" size={40} color={colors.success} />
                        </View>
                        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                            {title}
                        </Text>
                        <Text style={[styles.message, { color: colors.textSecondary }]}>
                            {message}
                        </Text>
                        <Pressable
                            onPress={onClose}
                            style={[styles.button, { backgroundColor: colors.primary }]}
                            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                        >
                            <Text style={styles.buttonText}>{t('common_ok')}</Text>
                        </Pressable>
                    </Pressable>
                </Animated.View>
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    cardWrap: {
        width: '100%',
        maxWidth: 320,
    },
    card: {
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 24,
        elevation: 12,
        alignItems: 'center',
    },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: -0.3,
        marginBottom: 8,
    },
    message: {
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
        marginBottom: 20,
    },
    button: {
        width: '100%',
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#ffffff',
    },
});
