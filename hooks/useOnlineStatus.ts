import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export const useOnlineStatus = () => {
    const [isOnline, setIsOnline] = useState(true);

    useEffect(() => {
        // Initial check
        NetInfo.fetch().then(state => {
            setIsOnline(state.isConnected ?? true);
        });

        // Subscribe to network state updates
        const unsubscribe = NetInfo.addEventListener(state => {
            setIsOnline(state.isConnected ?? true);
        });

        return () => unsubscribe();
    }, []);

    return isOnline;
};
