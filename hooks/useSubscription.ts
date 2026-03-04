import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUBSCRIPTION_KEY = 'plant_app_subscription_status';

export const useSubscription = () => {
    const [isSubscribed, setIsSubscribed] = useState(false);

    // Load subscription status on mount
    useEffect(() => {
        AsyncStorage.getItem(SUBSCRIPTION_KEY).then(status => {
            setIsSubscribed(status === 'active');
        }).catch(() => {});
    }, []);

    const checkSubscription = useCallback(async () => {
        try {
            const status = await AsyncStorage.getItem(SUBSCRIPTION_KEY);
            const isActive = status === 'active';
            setIsSubscribed(isActive);
            return isActive;
        } catch (e) {
            return false;
        }
    }, []);

    const updateSubscription = async (status: 'active' | 'inactive') => {
        try {
            await AsyncStorage.setItem(SUBSCRIPTION_KEY, status);
            setIsSubscribed(status === 'active');
        } catch (e) {
            console.warn('Failed to update subscription status');
        }
    };

    return { isSubscribed, checkSubscription, updateSubscription };
};
