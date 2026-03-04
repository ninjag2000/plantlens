import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

export interface WeatherData {
    temperature: number;
    humidity: number;
    precipitation: number;
    windSpeed: number;
    /** WMO weather code (0=clear, 1-3=partly cloudy/overcast, 45/48=fog, 51-67=rain, 71-77=snow, 80-82=rain showers, 85-86=snow, 95-99=thunderstorm) */
    weatherCode?: number;
}

const CACHE_KEY = 'plantlens_last_weather';
/** Не запрашивать прогноз погоды чаще 1 раза в 10 минут */
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;

interface WeatherCacheEntry {
    data: WeatherData;
    fetchedAt: number;
    lat: number;
    lon: number;
}

const DEFAULT_WEATHER: WeatherData = { temperature: 22, humidity: 45, precipitation: 0, windSpeed: 0 };

/**
 * Fetches current weather data for a given location using the Open-Meteo API.
 * Uses AsyncStorage for caching (React Native compatible).
 * Запрос к API выполняется не чаще 1 раза в 10 минут для одной и той же локации.
 */
export const getCurrentWeather = async (lat: number, lon: number): Promise<WeatherData> => {
    const getCachedEntry = async (): Promise<WeatherCacheEntry | null> => {
        try {
            const saved = await AsyncStorage.getItem(CACHE_KEY);
            if (!saved) return null;
            const parsed = JSON.parse(saved) as WeatherCacheEntry;
            return parsed?.data && typeof parsed.fetchedAt === 'number' ? parsed : null;
        } catch (e) {
            return null;
        }
    };

    const now = Date.now();
    const cached = await getCachedEntry();
    const sameLocation = cached && Math.abs(cached.lat - lat) < 0.01 && Math.abs(cached.lon - lon) < 0.01;
    if (cached && sameLocation && now - cached.fetchedAt < WEATHER_CACHE_TTL_MS) {
        return cached.data;
    }

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
        if (cached?.data) return cached.data;
        try {
            const legacy = await AsyncStorage.getItem(CACHE_KEY + '_legacy');
            const data = legacy ? JSON.parse(legacy) : null;
            return (data && typeof data.temperature === 'number') ? data : DEFAULT_WEATHER;
        } catch {
            return DEFAULT_WEATHER;
        }
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&timezone=auto`;

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Weather API Error: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.current) {
            throw new Error("Invalid weather data format");
        }

        const result: WeatherData = {
            temperature: Math.round(data.current.temperature_2m),
            humidity: data.current.relative_humidity_2m,
            precipitation: data.current.precipitation || 0,
            windSpeed: Math.round(data.current.wind_speed_10m || 0),
            weatherCode: data.current.weather_code ?? 0
        };

        const entry: WeatherCacheEntry = { data: result, fetchedAt: now, lat, lon };
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry));
        await AsyncStorage.setItem(CACHE_KEY + '_legacy', JSON.stringify(result));
        return result;
    } catch (error) {
        console.warn("Weather service unavailable, switching to fallback data.");
        if (cached?.data) return cached.data;
        try {
            const legacy = await AsyncStorage.getItem(CACHE_KEY + '_legacy');
            const data = legacy ? JSON.parse(legacy) : null;
            return (data && typeof data.temperature === 'number') ? data : DEFAULT_WEATHER;
        } catch {
            return DEFAULT_WEATHER;
        }
    }
};
