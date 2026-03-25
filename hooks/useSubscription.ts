import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUBSCRIPTION_KEY = 'plant_app_subscription_status';
const SUBSCRIPTION_PLAN_KEY = 'plant_app_subscription_plan';
const SUBSCRIPTION_END_DATE_KEY = 'plant_app_subscription_end_date';

export type SubscriptionPlan = 'yearly' | 'monthly';

function addMonths(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}

export const useSubscription = () => {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);

    const loadSubscription = useCallback(async () => {
        try {
            const [status, planRaw, endRaw] = await Promise.all([
                AsyncStorage.getItem(SUBSCRIPTION_KEY),
                AsyncStorage.getItem(SUBSCRIPTION_PLAN_KEY),
                AsyncStorage.getItem(SUBSCRIPTION_END_DATE_KEY),
            ]);
            const isActive = status === 'active';
            setIsSubscribed(isActive);
            setPlan((planRaw === 'yearly' || planRaw === 'monthly') ? planRaw : null);
            const parsed = endRaw ? new Date(endRaw) : null;
            setEndDate(parsed && !isNaN(parsed.getTime()) ? parsed : null);
            return isActive;
        } catch {
            return false;
        }
    }, []);

    useEffect(() => {
        loadSubscription();
    }, [loadSubscription]);

    const checkSubscription = useCallback(async () => {
        return loadSubscription();
    }, [loadSubscription]);

    const updateSubscription = async (status: 'active' | 'inactive', options?: { plan?: SubscriptionPlan }) => {
        try {
            await AsyncStorage.setItem(SUBSCRIPTION_KEY, status);
            if (status === 'active' && options?.plan) {
                const end = options.plan === 'yearly' ? addMonths(new Date(), 12) : addMonths(new Date(), 1);
                await AsyncStorage.setItem(SUBSCRIPTION_PLAN_KEY, options.plan);
                await AsyncStorage.setItem(SUBSCRIPTION_END_DATE_KEY, end.toISOString());
                setPlan(options.plan);
                setEndDate(end);
            } else if (status === 'inactive') {
                await AsyncStorage.removeItem(SUBSCRIPTION_PLAN_KEY);
                await AsyncStorage.removeItem(SUBSCRIPTION_END_DATE_KEY);
                setPlan(null);
                setEndDate(null);
            }
            setIsSubscribed(status === 'active');
        } catch (e) {
            console.warn('Failed to update subscription status');
        }
    };

    return { isSubscribed, plan, endDate, checkSubscription, updateSubscription };
};
