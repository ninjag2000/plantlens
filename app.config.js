const fs = require('fs');
const path = require('path');

// Load .env.local file
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env.local');
  const env = {};
  
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
  }
  
  return env;
}

const env = loadEnvFile();

module.exports = {
  expo: {
    name: "plantlens",
    slug: "plantlens",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    extra: {
      OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || "",
      GEMINI_API_KEY: env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "",
      POLLINATIONS_API_KEY: env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_API_KEY || "",
      SUPABASE_URL: env.SUPABASE_URL || process.env.SUPABASE_URL || "",
      SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
      eas: {
        projectId: "ceac56c4-c654-4e5a-a4c0-c5f04d99c0bf"
      }
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.plantlens.app",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
        monochromeImage: "./assets/adaptive-icon.png"
      },
      package: "com.plantlens.app",
      permissions: [
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE"
      ]
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      [
        "expo-camera",
        {
          cameraPermission: "Allow $(PRODUCT_NAME) to access your camera to identify plants and take care photos."
        }
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission: "PlantLens uses your location to show regional flora and weather for your area."
        }
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "Allow $(PRODUCT_NAME) to access your photos to add plant images and export reports.",
          cameraPermission: "Allow $(PRODUCT_NAME) to access your camera."
        }
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/icon.png",
          color: "#ffffff",
          sounds: [],
          enableBackgroundRemoteNotifications: false
        }
      ],
      "expo-document-picker",
      "expo-asset",
      "expo-font",
      "expo-localization"
    ]
  }
};
