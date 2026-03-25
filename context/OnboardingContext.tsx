import React, { createContext, useContext } from 'react';

export type OnboardingContextValue = { resetOnboarding: () => Promise<void>; finishOnboarding?: () => void };

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export const useOnboarding = (): OnboardingContextValue => {
    const ctx = useContext(OnboardingContext);
    if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
    return ctx;
};

export const OnboardingProvider = OnboardingContext.Provider;
