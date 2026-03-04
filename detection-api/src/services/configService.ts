import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PresetPath {
  path: string;
  description: string;
  category: 'common' | 'project' | 'workspace' | 'custom';
  isDefault?: boolean;
}

interface UserSettings {
  id?: string;
  userId?: string;
  presetPaths: PresetPath[];
  defaultScanPath?: string;
  recentPaths: string[];
  preferences: {
    smartFilter: boolean;
    realTimePreview: boolean;
    maxRecentPaths: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface UIConfig {
  techStackIcons: Record<string, string>;
  techStackDisplayNames: Record<string, string>;
  statusIcons: Record<string, string>;
  statusColors: Record<string, string>;
  appTypeIcons: Record<string, string>;
  defaultSettings: {
    itemsPerPage: number;
    autoRefreshInterval: number;
    maxLogLines: number;
    defaultPort: number;
    portRange: {
      min: number;
      max: number;
    };
  };
}

class ConfigService {
  private static instance: ConfigService;
  private config: UIConfig | null = null;
  private configPath: string;
  private userSettings: UserSettings | null = null;
  private userSettingsPath: string;

  private constructor() {
    this.configPath = path.join(__dirname, '../config/ui-config.json');
    this.userSettingsPath = path.join(__dirname, '../config/user-settings.json');
  }

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * Load configuration from file
   */
  public async loadConfig(): Promise<UIConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(configData);
      return this.config!;
    } catch (error) {
      console.error('Failed to load UI configuration:', error);
      // Return default configuration
      this.config = this.getDefaultConfig();
      return this.config;
    }
  }

  /**
   * Get tech stack icon
   */
  public async getTechStackIcon(techStack: string): Promise<string> {
    const config = await this.loadConfig();
    const normalizedTech = this.normalizeTechStackName(techStack);
    return config.techStackIcons[normalizedTech] || config.techStackIcons.Default || '📱';
  }

  /**
   * Get tech stack display name
   */
  public async getTechStackDisplayName(techStack: string): Promise<string> {
    const config = await this.loadConfig();
    const normalizedTech = techStack.toLowerCase().replace(/[\s-_.]/g, '');
    return config.techStackDisplayNames[normalizedTech] || this.capitalizeFirst(techStack);
  }

  /**
   * Get status icon
   */
  public async getStatusIcon(status: string): Promise<string> {
    const config = await this.loadConfig();
    return config.statusIcons[status.toLowerCase()] || config.statusIcons.unknown || '❓';
  }

  /**
   * Get status color
   */
  public async getStatusColor(status: string): Promise<string> {
    const config = await this.loadConfig();
    return config.statusColors[status.toLowerCase()] || config.statusColors.unknown || '#C0C4CC';
  }

  /**
   * Get app type icon
   */
  public async getAppTypeIcon(type: string): Promise<string> {
    const config = await this.loadConfig();
    return config.appTypeIcons[type.toLowerCase()] || config.appTypeIcons.web || '🌐';
  }

  /**
   * Get all tech stack display names
   */
  public async getAllTechStackDisplayNames(): Promise<Record<string, string>> {
    const config = await this.loadConfig();
    return config.techStackDisplayNames;
  }

  /**
   * Get default settings
   */
  public async getDefaultSettings(): Promise<UIConfig['defaultSettings']> {
    const config = await this.loadConfig();
    return config.defaultSettings;
  }

  /**
   * Normalize tech stack name for lookup
   */
  private normalizeTechStackName(techStack: string): string {
    const normalized = techStack.toLowerCase().replace(/[\s-_.]/g, '');
    
    // Handle common mappings
    const mappings: Record<string, string> = {
      'nodejs': 'Node.js',
      'node': 'Node.js',
      'nextjs': 'Next.js',
      'next': 'Next.js',
      'nuxtjs': 'Nuxt.js',
      'nuxt': 'Nuxt.js',
      'vuejs': 'Vue',
      'vue': 'Vue',
      'reactjs': 'React',
      'react': 'React',
      'angular': 'Angular',
      'typescript': 'TypeScript',
      'ts': 'TypeScript',
      'javascript': 'JavaScript',
      'js': 'JavaScript'
    };

    return mappings[normalized] || this.capitalizeFirst(techStack);
  }

  /**
   * Capitalize first letter
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Get user settings
   */
  public async getUserSettings(): Promise<UserSettings> {
    if (this.userSettings) {
      return this.userSettings;
    }

    try {
      const settingsData = await fs.readFile(this.userSettingsPath, 'utf-8');
      this.userSettings = JSON.parse(settingsData);
      return this.userSettings!;
    } catch (error) {
      logger.debug('No existing user settings found, using defaults');
      this.userSettings = this.getDefaultUserSettings();
      return this.userSettings;
    }
  }

  /**
   * Update user settings
   */
  public async updateUserSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    const currentSettings = await this.getUserSettings();
    const updatedSettings = {
      ...currentSettings,
      ...settings,
      updatedAt: new Date().toISOString()
    };

    try {
      await fs.writeFile(this.userSettingsPath, JSON.stringify(updatedSettings, null, 2));
      this.userSettings = updatedSettings;
      return updatedSettings;
    } catch (error) {
      console.error('Failed to save user settings:', error);
      throw error;
    }
  }

  /**
   * Add preset path
   */
  public async addPresetPath(path: PresetPath): Promise<UserSettings> {
    const settings = await this.getUserSettings();
    const existingIndex = settings.presetPaths.findIndex(p => p.path === path.path);
    
    if (existingIndex >= 0) {
      settings.presetPaths[existingIndex] = path;
    } else {
      settings.presetPaths.push(path);
    }

    return this.updateUserSettings(settings);
  }

  /**
   * Remove preset path
   */
  public async removePresetPath(pathValue: string): Promise<UserSettings> {
    const settings = await this.getUserSettings();
    settings.presetPaths = settings.presetPaths.filter(p => p.path !== pathValue);
    return this.updateUserSettings(settings);
  }

  /**
   * Add recent path
   */
  public async addRecentPath(pathValue: string): Promise<UserSettings> {
    const settings = await this.getUserSettings();
    
    // Remove if already exists
    settings.recentPaths = settings.recentPaths.filter(p => p !== pathValue);
    
    // Add to beginning
    settings.recentPaths.unshift(pathValue);
    
    // Keep only maxRecentPaths
    settings.recentPaths = settings.recentPaths.slice(0, settings.preferences.maxRecentPaths);
    
    return this.updateUserSettings(settings);
  }

  /**
   * Clear recent paths
   */
  public async clearRecentPaths(): Promise<UserSettings> {
    const settings = await this.getUserSettings();
    settings.recentPaths = [];
    return this.updateUserSettings(settings);
  }

  /**
   * Get default user settings
   */
  private getDefaultUserSettings(): UserSettings {
    return {
      presetPaths: [
        { path: 'D:\\Projects', description: '项目根目录', category: 'project', isDefault: true },
        { path: 'D:\\Development', description: '开发目录', category: 'workspace', isDefault: true },
        { path: 'C:\\Code', description: '代码目录', category: 'common', isDefault: true },
        { path: 'E:\\WorkSpace', description: '工作空间', category: 'workspace', isDefault: true }
      ],
      recentPaths: [],
      preferences: {
        smartFilter: true,
        realTimePreview: true,
        maxRecentPaths: 10
      },
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): UIConfig {
    return {
      techStackIcons: {
        'React': '🔵',
        'Vue': '🟢',
        'Angular': '🔴',
        'Node.js': '🟡',
        'Default': '📱'
      },
      techStackDisplayNames: {
        'react': 'React',
        'vue': 'Vue.js',
        'angular': 'Angular',
        'nodejs': 'Node.js'
      },
      statusIcons: {
        'running': '▶️',
        'stopped': '⏹️',
        'error': '❌',
        'unknown': '❓'
      },
      statusColors: {
        'running': '#67C23A',
        'stopped': '#909399',
        'error': '#F56C6C',
        'unknown': '#C0C4CC'
      },
      appTypeIcons: {
        'web': '🌐',
        'api': '🔌',
        'desktop': '💻',
        'mobile': '📱'
      },
      defaultSettings: {
        itemsPerPage: 10,
        autoRefreshInterval: 5000,
        maxLogLines: 1000,
        defaultPort: 3000,
        portRange: {
          min: 3000,
          max: 9999
        }
      }
    };
  }
}

export default ConfigService;
export type { UIConfig, UserSettings, PresetPath };