import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ScannedDocument } from '../types';
import { useTheme } from '../hooks/useTheme';
import { getThemeColors } from '../utils/themeColors';

interface DocumentsScreenProps {
    documents: ScannedDocument[];
}

const DocumentsScreen: React.FC<DocumentsScreenProps> = ({ documents }) => {
    const navigation = useNavigation();
    const { theme } = useTheme();
    const colors = getThemeColors(theme);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    return (
        <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
            <Text style={[styles.title, { color: colors.text }]}>My Scans</Text>

            {documents.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="document-text-outline" size={64} color={colors.textMuted} />
                    <Text style={[styles.emptyTitle, { color: colors.text }]}>No Scans Yet</Text>
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Tap the camera button to create your first scan.</Text>
                </View>
            ) : (
                <View style={styles.listContainer}>
                    {documents.map(doc => (
                        <Pressable
                            key={doc.id}
                            onPress={() => navigation.navigate('Detail' as never, { documentId: doc.id } as never)}
                            style={({ pressed }) => [
                                styles.documentItem,
                                { backgroundColor: colors.card, borderColor: colors.borderLight },
                                pressed && [styles.documentItemPressed, { backgroundColor: colors.surface }],
                            ]}
                        >
                            <Image 
                                source={{ uri: doc.imageUrl }} 
                                style={styles.thumbnail}
                                resizeMode="cover"
                            />
                            <View style={styles.documentInfo}>
                                <Text style={[styles.documentTitle, { color: colors.text }]} numberOfLines={1}>{doc.title}</Text>
                                <Text style={[styles.documentDate, { color: colors.textSecondary }]}>{formatDate(doc.createdAt)}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                        </Pressable>
                    ))}
                </View>
            )}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor применяется через inline стили
    },
    content: {
        padding: 16,
    },
    title: {
        fontSize: 30,
        fontWeight: '700',
        marginBottom: 24,
        paddingHorizontal: 8,
        // color применяется через inline стили
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 400,
        paddingHorizontal: 32,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '600',
        marginTop: 16,
        marginBottom: 8,
        // color применяется через inline стили
    },
    emptyText: {
        fontSize: 14,
        textAlign: 'center',
        maxWidth: 300,
        // color применяется через inline стили
    },
    listContainer: {
        gap: 12,
    },
    documentItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 8,
        borderWidth: 1,
        // backgroundColor и borderColor применяются через inline стили
    },
    documentItemPressed: {
        // backgroundColor применяется через inline стили
    },
    thumbnail: {
        width: 48,
        height: 64,
        borderRadius: 6,
        backgroundColor: '#e5e7eb',
        marginRight: 16,
    },
    documentInfo: {
        flex: 1,
    },
    documentTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
        // color применяется через inline стили
    },
    documentDate: {
        fontSize: 14,
        // color применяется через inline стили
    },
});

export default DocumentsScreen;
