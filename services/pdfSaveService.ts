/**
 * Сохранение PDF в папку plantlens/reports на устройстве.
 * На Android используется Storage Access Framework: один раз пользователь выбирает папку plantlens,
 * создаётся подпапка reports, URI кэшируется — дальнейшие сохранения без диалога.
 * На iOS — fallback в documentDirectory.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const REPORTS_DIR_URI_KEY = 'plantlens_reports_directory_uri';
const PLANTLENS_FOLDER = 'plantlens';
const REPORTS_SUBFOLDER = 'reports';

const { StorageAccessFramework } = FileSystem;

async function getCachedReportsDirUri(): Promise<string | null> {
    try {
        return await AsyncStorage.getItem(REPORTS_DIR_URI_KEY);
    } catch {
        return null;
    }
}

async function setCachedReportsDirUri(uri: string): Promise<void> {
    try {
        await AsyncStorage.setItem(REPORTS_DIR_URI_KEY, uri);
    } catch {}
}

/**
 * Запросить у пользователя доступ к папке plantlens и создать в ней reports.
 * Вызывается один раз на Android; URI кэшируется.
 */
export async function requestAndCacheReportsDirectory(): Promise<string | null> {
    if (Platform.OS !== 'android') return null;
    try {
        const plantlensUri = StorageAccessFramework.getUriForDirectoryInRoot(PLANTLENS_FOLDER);
        const result = await StorageAccessFramework.requestDirectoryPermissionsAsync(plantlensUri);
        if (!result.granted || !result.directoryUri) return null;
        const parentUri = result.directoryUri;
        const reportsUri = await StorageAccessFramework.makeDirectoryAsync(parentUri, REPORTS_SUBFOLDER);
        await setCachedReportsDirUri(reportsUri);
        return reportsUri;
    } catch (e) {
        console.warn('[pdfSaveService] requestAndCacheReportsDirectory failed', e);
        return null;
    }
}

/**
 * Получить URI папки reports (из кэша или запросить разрешение).
 */
export async function getReportsDirectoryUri(): Promise<string | null> {
    if (Platform.OS !== 'android') return null;
    let uri = await getCachedReportsDirUri();
    if (uri) return uri;
    return requestAndCacheReportsDirectory();
}

/**
 * Сохранить PDF в plantlens/reports (на Android через SAF) или в documentDirectory (iOS / fallback).
 * @param fileName Имя файла с расширением, например PlantLens_Passport_Monstera.pdf
 * @param base64Content Base64-содержимое PDF (без префикса data:...;base64,)
 * @returns Путь для сообщения пользователю или null при ошибке
 */
export async function savePdfToReportsFolder(fileName: string, base64Content: string): Promise<string | null> {
    const nameWithoutExt = fileName.replace(/\.pdf$/i, '') || fileName;

    if (Platform.OS === 'android') {
        try {
            const reportsUri = await getReportsDirectoryUri();
            if (reportsUri) {
                const fileUri = await StorageAccessFramework.createFileAsync(
                    reportsUri,
                    nameWithoutExt,
                    'application/pdf'
                );
                await StorageAccessFramework.writeAsStringAsync(fileUri, base64Content, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                return `${PLANTLENS_FOLDER}/${REPORTS_SUBFOLDER}/${fileName}`;
            }
        } catch (e) {
            console.warn('[pdfSaveService] SAF save failed, fallback to documentDirectory', e);
        }
    }

    const dir = FileSystem.documentDirectory;
    if (!dir) return null;
    try {
        const fileUri = `${dir}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, base64Content, {
            encoding: FileSystem.EncodingType.Base64,
        });
        return fileName;
    } catch (e) {
        console.warn('[pdfSaveService] documentDirectory save failed', e);
        return null;
    }
}
