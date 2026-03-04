
export interface AIInsights {
    summary: string;
    actionItems: string[];
    keyEntities: { type: string; value: string }[];
}

export interface ScannedDocument {
    id: string;
    title: string;
    imageUrl: string;
    storageUrl?: string; // To simulate Firebase storage
    createdAt: string;
    ocrText?: string;
    aiInsights?: AIInsights;
    error?: string;
}

export interface Collection {
    id: string;
    name: string;
    iconName: string;
    plantIds: string[];
}

export interface CatalogPlant {
    commonName: string;
    scientificName: string;
    description: string;
    imageUrl?: string; // Added for specific trend images
    floweringTime?: string;
    flowerColor?: string;
}

export interface CatalogCategory {
    title: string;
    description: string;
    plants: CatalogPlant[];
}

export interface DiagnosisRecord {
    id: string;
    date: string;
    plantName: string;
    problemTitle: string;
    severity: 'low' | 'medium' | 'high';
    isHealthy: boolean;
    symptoms: string;
    treatment: string;
    prevention: string;
    image?: string;
    healthAssessment?: {
        healthy: number;
        pests: number;
        diseases: number;
        nutrition: number;
        abiotic: number;
    };
}

export interface RepottingAnalysis {
    needsRepotting: boolean;
    urgency: 'low' | 'medium' | 'high';
    reason: string;
    instructions: string[];
    potSizeRecommendation: string;
    soilType: string;
}

export interface GeminiPlantResponse {
    commonName: string;
    scientificName: string;
    description: string;
    isWeed?: string;
    plantType?: string;
    lifespan?: string;
    habitat?: string;
    about?: string;
    adaptationStrategy?: string;
    historyAndLegends?: string;
    nameHistory?: string;
    nameMeaning?: string;
    faq?: {
        question: string;
        answer: string;
    }[];
    careTips: {
        watering: string;
        sunlight: string;
        soil: string;
        temperature?: string;
    };
    taxonomy?: {
        kingdom: string;
        phylum: string;
        class: string;
        order: string;
        family: string;
        genus: string;
        species: string;
    };
    characteristics?: {
        mature?: {
            plantGroup?: string;
            maxHeight?: string;
            maxWidth?: string;
            leafColor?: string;
            leafType?: string;
            plantingTime?: string;
        };
        flower?: {
            floweringTime?: string;
            flowerSize?: string;
            flowerColor?: string;
        };
        fruit?: {
            fruitName?: string;
            harvestTime?: string;
            fruitColor?: string;
        };
    };
    safety?: {
        toxicity: {
            humans: string;
            pets: string;
        };
        allergies: {
            humans: string;
            pets: string;
        };
    };
    similarPlants?: {
        commonName: string;
        scientificName: string;
        imageUrl?: string;
    }[];
    pros?: string[];
    cons?: string[];
    error?: string;
}

export type CareType = 'watered' | 'fertilized' | 'repotted' | 'misting';

/** Language of text fields (description, FAQ, etc.). Used to detect mismatch with app language. */
export type ContentLanguage = 'en' | 'ru' | 'de' | 'fr' | 'es';

export interface Plant extends GeminiPlantResponse {
    id: string;
    imageUrl: string;
    storageUrl?: string; // To simulate Firebase storage
    identificationDate: string;
    /** Language in which content (description, faq, adaptationStrategy, etc.) is stored. */
    contentLanguage?: ContentLanguage;
    isInGarden?: boolean;
    /** false = скрыто из вкладки «История» (удалено из истории). Добавление в сад снова выставляет true. */
    showInHistory?: boolean;
    notes?: string;
    tags?: string[];
    generatedImages?: string[];
    userPhotos?: string[];
    latestDiagnosis?: DiagnosisRecord;
    diagnosisHistory?: DiagnosisRecord[];
    reminders?: {
        watering?: { frequency: number; lastSet: string; };
        fertilizing?: { frequency: number; lastSet: string; };
        repotting?: { frequency: number; lastSet: string; };
        misting?: { frequency: number; lastSet: string; };
    };
    careHistory?: { type: CareType; date: string }[];
}

export interface SafetyStatus {
    level: 0 | 1 | 2;
    labelKey: 'safety_safe' | 'safety_caution' | 'safety_toxic';
    style: string;
}
