import * as Notifications from 'expo-notifications';
import { Plant } from '../types';

// Configure notification handler
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

const scheduledNotifications = new Map<string, string>(); // Map of notificationId -> Expo notification identifier

export const requestNotificationPermission = async (): Promise<boolean> => {
    try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        
        if (existingStatus === 'granted') {
            return true;
        }

        const { status } = await Notifications.requestPermissionsAsync();
        return status === 'granted';
    } catch (error) {
        console.warn("Failed to request notification permission:", error);
        return false;
    }
};

/**
 * Schedules a notification for a specific plant care task.
 * @param body - Already translated body text (e.g. from t('notif_water_reminder').replace('{name}', plant.commonName))
 */
export const scheduleCareNotification = async (
    plant: Plant,
    careType: string,
    body: string,
    daysUntilDue: number
) => {
    const notificationId = `${plant.id}-${careType}`;

    await cancelNotification(plant.id, careType);

    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
        console.log(`[Notification] Permission not granted for ${plant.commonName}.`);
        return;
    }

    let triggerSeconds = daysUntilDue * 24 * 60 * 60;
    if (triggerSeconds <= 0) triggerSeconds = 5;

    try {
        const identifier = await Notifications.scheduleNotificationAsync({
            content: {
                title: `PlantLens: ${plant.commonName}`,
                body,
                data: { plantId: plant.id, careType },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: triggerSeconds,
                repeats: true,
            },
        });

        scheduledNotifications.set(notificationId, identifier);
        console.log(`[Notification] Scheduled '${careType}' for '${plant.commonName}' in ${Math.round(triggerSeconds / 60)} minutes.`);
    } catch (error) {
        console.warn(`[Notification] Failed to schedule for ${plant.commonName}:`, error);
    }
};

const CARE_TYPES = ['watering', 'fertilizing', 'misting', 'repotting'] as const;

/**
 * Cancels all scheduled care reminders for a plant (e.g. when removed from garden).
 */
export const cancelAllNotificationsForPlant = async (plantId: string) => {
    for (const careType of CARE_TYPES) {
        await cancelNotification(plantId, careType);
    }
};

/**
 * Config passed from UI to compute and schedule all care reminders for a plant.
 */
export type ReminderConfigForSchedule = {
    key: string;
    actionType: string;
    defaultFreq: number;
};

/**
 * Schedules notifications for all care types for a plant.
 * @param getBody - Returns translated body for each care key (e.g. t('notif_water_reminder').replace('{name}', plant.commonName))
 */
export const scheduleAllCareNotificationsForPlant = async (
    plant: Plant,
    configs: ReminderConfigForSchedule[],
    getBody: (careKey: string) => string
) => {
    for (const config of configs) {
        const freq = plant.reminders?.[config.key as keyof typeof plant.reminders]?.frequency ?? config.defaultFreq;
        const lastAction = plant.careHistory?.find((h: { type: string }) => h.type === config.actionType);
        const lastDate = lastAction ? new Date(lastAction.date) : new Date(plant.identificationDate);
        const daysPassed = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysUntilDue = Math.max(0, Math.ceil(freq - daysPassed));
        await scheduleCareNotification(plant, config.key, getBody(config.key), daysUntilDue);
    }
};

/**
 * Cancels a scheduled notification for a plant care task.
 */
export const cancelNotification = async (plantId: string, careType: string) => {
    const notificationId = `${plantId}-${careType}`;
    const identifier = scheduledNotifications.get(notificationId);
    
    if (identifier) {
        try {
            await Notifications.cancelScheduledNotificationAsync(identifier);
            scheduledNotifications.delete(notificationId);
            console.log(`[Notification] Cancelled reminder for '${careType}' on plant ${plantId}.`);
        } catch (error) {
            console.warn(`[Notification] Failed to cancel notification:`, error);
        }
    }
};
