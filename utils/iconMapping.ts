// Icon mapping from lucide-react to @expo/vector-icons
import { MaterialIcons, Ionicons, Feather } from '@expo/vector-icons';

export type IconLibrary = 'MaterialIcons' | 'Ionicons' | 'Feather';

export interface IconComponent {
  name: string;
  library: IconLibrary;
}

// Mapping lucide-react icons to @expo/vector-icons
export const iconMap: Record<string, IconComponent> = {
  // Navigation
  ArrowLeft: { name: 'arrow-back', library: 'Ionicons' },
  ArrowRight: { name: 'arrow-forward', library: 'Ionicons' },
  ChevronRight: { name: 'chevron-forward', library: 'Ionicons' },
  ChevronLeft: { name: 'chevron-back', library: 'Ionicons' },
  Home: { name: 'home', library: 'Ionicons' },
  
  // Actions
  Search: { name: 'search', library: 'Ionicons' },
  Share: { name: 'share', library: 'Ionicons' },
  Download: { name: 'download', library: 'Ionicons' },
  Trash2: { name: 'trash', library: 'Ionicons' },
  Edit: { name: 'create', library: 'Ionicons' },
  Check: { name: 'checkmark', library: 'Ionicons' },
  X: { name: 'close', library: 'Ionicons' },
  Plus: { name: 'add', library: 'Ionicons' },
  Minus: { name: 'remove', library: 'Ionicons' },
  
  // Media
  Camera: { name: 'camera', library: 'Ionicons' },
  Image: { name: 'image', library: 'Ionicons' },
  FileText: { name: 'document-text', library: 'Ionicons' },
  FilePlus: { name: 'document-text-outline', library: 'Ionicons' },
  
  // Plants & Nature
  Leaf: { name: 'leaf', library: 'Ionicons' },
  Flower: { name: 'flower', library: 'Ionicons' },
  Sprout: { name: 'flower-outline', library: 'Ionicons' },
  Trees: { name: 'leaf', library: 'Ionicons' },
  Scan: { name: 'scan', library: 'Ionicons' },
  
  // Weather
  Sun: { name: 'sunny', library: 'Ionicons' },
  Cloud: { name: 'cloud', library: 'Ionicons' },
  CloudRain: { name: 'rainy', library: 'Ionicons' },
  CloudSun: { name: 'partly-sunny', library: 'Ionicons' },
  Moon: { name: 'moon', library: 'Ionicons' },
  
  // UI Elements
  BookOpen: { name: 'book', library: 'Ionicons' },
  Heart: { name: 'heart', library: 'Ionicons' },
  Bookmark: { name: 'bookmark', library: 'Ionicons' },
  Settings: { name: 'settings', library: 'Ionicons' },
  Info: { name: 'information-circle', library: 'Ionicons' },
  AlertCircle: { name: 'alert-circle', library: 'Ionicons' },
  AlertTriangle: { name: 'warning', library: 'Ionicons' },
  
  // Actions & Tools
  Zap: { name: 'flash', library: 'Ionicons' },
  Droplets: { name: 'water', library: 'Ionicons' },
  Activity: { name: 'pulse', library: 'Ionicons' },
  Navigation: { name: 'navigate', library: 'Ionicons' },
  Timer: { name: 'timer', library: 'Ionicons' },
  RefreshCw: { name: 'refresh', library: 'Ionicons' },
  RotateCcw: { name: 'refresh', library: 'Ionicons' },
  ZoomIn: { name: 'zoom-in', library: 'Ionicons' },
  ZoomOut: { name: 'zoom-out', library: 'Ionicons' },
  Crop: { name: 'crop', library: 'Ionicons' },
  
  // Status
  WifiOff: { name: 'wifi-off', library: 'Ionicons' },
  Loader2: { name: 'hourglass', library: 'Ionicons' },
  CheckCircle: { name: 'checkmark-circle', library: 'Ionicons' },
  
  // Misc
  Wand2: { name: 'auto-awesome', library: 'MaterialIcons' },
  Bot: { name: 'robot', library: 'Ionicons' },
  Tag: { name: 'pricetag', library: 'Ionicons' },
  MapPin: { name: 'location', library: 'Ionicons' },
  Globe: { name: 'globe', library: 'Ionicons' },
  Scissors: { name: 'cut', library: 'Ionicons' },
  ArrowUpCircle: { name: 'arrow-up-circle', library: 'Ionicons' },
  ArrowUpRight: { name: 'arrow-up-right', library: 'Ionicons' },
  Wind: { name: 'swap-horizontal', library: 'Ionicons' },
  Skull: { name: 'skull', library: 'Ionicons' },
  Gem: { name: 'diamond', library: 'Ionicons' },
  ShieldCheck: { name: 'shield-checkmark', library: 'Ionicons' },
  Database: { name: 'server', library: 'Ionicons' },
  Fingerprint: { name: 'finger-print', library: 'Ionicons' },
  Cpu: { name: 'hardware-chip', library: 'Ionicons' },
};

// Helper function to get icon component
export const getIcon = (iconName: string, size: number = 24, color: string = '#000') => {
  const icon = iconMap[iconName];
  if (!icon) {
    console.warn(`Icon ${iconName} not found in mapping, using default`);
    return <MaterialIcons name="help-outline" size={size} color={color} />;
  }
  
  const props = { size, color };
  
  switch (icon.library) {
    case 'MaterialIcons':
      return <MaterialIcons name={icon.name as any} {...props} />;
    case 'Ionicons':
      return <Ionicons name={icon.name as any} {...props} />;
    case 'Feather':
      return <Feather name={icon.name as any} {...props} />;
    default:
      return <MaterialIcons name="help-outline" {...props} />;
  }
};

// Helper to create icon component for use in JSX
export const createIcon = (iconName: string) => {
  return ({ size = 24, color = '#000', ...props }: { size?: number; color?: string; [key: string]: any }) => {
    const icon = iconMap[iconName];
    if (!icon) {
      return <MaterialIcons name="help-outline" size={size} color={color} {...props} />;
    }
    
    switch (icon.library) {
      case 'MaterialIcons':
        return <MaterialIcons name={icon.name as any} size={size} color={color} {...props} />;
      case 'Ionicons':
        return <Ionicons name={icon.name as any} size={size} color={color} {...props} />;
      case 'Feather':
        return <Feather name={icon.name as any} size={size} color={color} {...props} />;
      default:
        return <MaterialIcons name="help-outline" size={size} color={color} {...props} />;
    }
  };
};
