import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const systemColorScheme = useColorScheme();
    // Инициализируем с системной темой, затем загружаем сохраненную
    const [theme, setThemeState] = useState<Theme>(() => {
        // Начальное значение - системная тема
        return systemColorScheme === 'dark' ? 'dark' : 'light';
    });

    // Load saved theme on mount
    useEffect(() => {
        AsyncStorage.getItem('plantlens_theme')
            .then(saved => {
                if (saved === 'dark' || saved === 'light') {
                    console.log('[ThemeProvider] Loaded saved theme:', saved);
                    setThemeState(saved);
                } else {
                    console.log('[ThemeProvider] No saved theme, using system:', systemColorScheme);
                }
            })
            .catch((err) => {
                console.warn('[ThemeProvider] Failed to load theme:', err);
            });
    }, []); // Загружаем только один раз при монтировании

    const setTheme = (newTheme: Theme) => {
        console.log('[ThemeProvider] Setting theme to:', newTheme, 'Current theme:', theme);
        if (theme !== newTheme) {
            setThemeState(newTheme);
            AsyncStorage.setItem('plantlens_theme', newTheme)
                .then(() => {
                    console.log('[ThemeProvider] Theme saved successfully:', newTheme);
                })
                .catch((err) => {
                    console.warn('[ThemeProvider] Failed to save theme:', err);
                });
        } else {
            console.log('[ThemeProvider] Theme already set to:', newTheme);
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
