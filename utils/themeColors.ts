import { Theme } from '../hooks/useTheme';

export interface ThemeColors {
    // Backgrounds
    background: string;
    surface: string;
    card: string;
    
    // Text
    text: string;
    textSecondary: string;
    textMuted: string;
    
    // Borders
    border: string;
    borderLight: string;
    
    // Primary colors (brand)
    primary: string;
    primaryLight: string;
    primaryDark: string;
    
    // Status colors
    success: string;
    warning: string;
    error: string;
    info: string;
    
    // Interactive
    pressed: string;
    disabled: string;
    
    // Special
    overlay: string;
    shadow: string;
}

export const lightColors: ThemeColors = {
    background: '#ffffff',
    surface: '#f9fafb',
    card: '#ffffff',
    
    text: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    
    border: 'rgba(0, 0, 0, 0.1)',
    borderLight: 'rgba(0, 0, 0, 0.05)',
    
    primary: '#10b981',
    primaryLight: 'rgba(16, 185, 129, 0.1)',
    primaryDark: '#059669',
    
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
    
    pressed: 'rgba(0, 0, 0, 0.05)',
    disabled: '#d1d5db',
    
    overlay: 'rgba(0, 0, 0, 0.5)',
    shadow: 'rgba(0, 0, 0, 0.1)',
};

export const darkColors: ThemeColors = {
    background: '#111827',
    surface: '#1f2937',
    card: '#374151',
    
    text: '#f9fafb',
    textSecondary: '#d1d5db',
    textMuted: '#9ca3af',
    
    border: 'rgba(255, 255, 255, 0.1)',
    borderLight: 'rgba(255, 255, 255, 0.05)',
    
    primary: '#10b981',
    primaryLight: 'rgba(16, 185, 129, 0.2)',
    primaryDark: '#059669',
    
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
    
    pressed: 'rgba(255, 255, 255, 0.1)',
    disabled: '#4b5563',
    
    overlay: 'rgba(0, 0, 0, 0.7)',
    shadow: 'rgba(0, 0, 0, 0.3)',
};

export const getThemeColors = (theme: Theme): ThemeColors => {
    return theme === 'dark' ? darkColors : lightColors;
};
