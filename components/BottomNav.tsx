import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';

const BottomNav: React.FC<BottomTabBarProps> = ({ state, navigation, descriptors }) => {
    const { t } = useI18n();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);
    
    const handleScanClick = () => {
        // Центральная кнопка: режим analysis → Plant Detail
        const parent = navigation.getParent();
        const params = { analysisMode: 'analysis' };
        if (parent) {
            (parent as any).navigate('NewCameraScreen', params);
        } else {
            navigation.navigate('NewCameraScreen' as never, params as never);
        }
    };

    const navItems = [
        { route: 'Home', icon: 'home' as const, label: t('nav_home') },
        { route: 'Diagnosis', icon: 'pulse' as const, label: t('nav_diagnosis') },
        { route: 'MyPlants', icon: 'leaf' as const, label: t('nav_my_plants') },
        { route: 'More', icon: 'ellipsis-horizontal' as const, label: t('nav_more') },
    ];

    const activeRoute = state.routes[state.index]?.name;
    
    if (!state || !navigation) {
        console.warn('BottomNav: Missing state or navigation props');
        return null;
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.surface, borderTopColor: colors.borderLight }]}>
            <View style={styles.navContainer}>
                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const label = options.tabBarLabel !== undefined
                        ? options.tabBarLabel
                        : options.title !== undefined
                        ? options.title
                        : route.name;
                    
                    const isFocused = state.index === index;
                    const navItem = navItems.find(item => item.route === route.name);
                    
                    if (!navItem) return null;
                    
                    const onPress = () => {
                        const event = navigation.emit({
                            type: 'tabPress',
                            target: route.key,
                            canPreventDefault: true,
                        });

                        if (!isFocused && !event.defaultPrevented) {
                            navigation.navigate(route.name as never);
                        }
                    };

                    // Insert scan button after second item (between Diagnosis and MyPlants)
                    const shouldShowScanButton = index === 1;
                    
                    return (
                        <React.Fragment key={route.key}>
                            <Pressable
                                onPress={onPress}
                                style={styles.navItem}
                            >
                                <Ionicons 
                                    name={navItem.icon} 
                                    size={22} 
                                    color={isFocused ? colors.primary : colors.textMuted} 
                                />
                                <Text style={[
                                    styles.navLabel,
                                    { color: isFocused ? colors.primary : colors.textMuted }
                                ]}>
                                    {navItem.label}
                                </Text>
                            </Pressable>
                            {shouldShowScanButton && (
                                <View style={styles.scanButtonContainer}>
                                    <Pressable 
                                        onPress={handleScanClick}
                                        style={({ pressed }) => [
                                            styles.scanButton,
                                            { 
                                                backgroundColor: colors.primary, 
                                                borderColor: colors.surface,
                                                shadowColor: colors.primary,
                                            },
                                            pressed && styles.scanButtonPressed,
                                        ]}
                                    >
                                        <Ionicons name="scan" size={28} color="#ffffff" />
                                    </Pressable>
                                    <Text style={[styles.scanLabel, { color: colors.primary }]}>{t('nav_scan')}</Text>
                                </View>
                            )}
                        </React.Fragment>
                    );
                })}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        // backgroundColor и borderTopColor будут переопределены через inline стили
        borderTopWidth: 1,
        paddingBottom: 12,
        position: 'relative',
    },
    scanButtonContainer: {
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 2,
        width: 64,
    },
    scanButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        // backgroundColor и borderColor будут переопределены через inline стили
        justifyContent: 'center',
        alignItems: 'center',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 8,
        borderWidth: 4,
        marginBottom: -24,
    },
    scanButtonPressed: {
        transform: [{ scale: 0.9 }],
    },
    scanLabel: {
        marginTop: 4,
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        // color будет переопределен через inline стили
        letterSpacing: 0.5,
        textAlign: 'center',
    },
    navContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-end',
        height: 60,
        paddingHorizontal: 4,
        paddingBottom: 4,
    },
    navItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 2,
    },
    navLabel: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        marginTop: 4,
        // color будет переопределен через inline стили
        letterSpacing: 0.5,
    },
});

export default BottomNav;
