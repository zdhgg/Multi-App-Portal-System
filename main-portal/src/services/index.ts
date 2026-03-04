// API服务模块统一导出
import { apiService, ApiError } from './api'
import { authApiService } from './authApi'
import { appsApiService } from './appsApi'
import { publicApiService } from './publicApi'
import { detectionApiService } from './detectionApi'
import { filesystemApiService } from './filesystemApi'
import { websocketManager, wsManager } from './websocketApi'
import { configApiService } from './configApi'
import { userSettingsApiService } from './userSettingsApi'
import { systemSettingsApiService } from './systemSettingsApi'
import { appConfigApiService } from './appConfigApi'
import { pm2ApiService } from './pm2Api'
import { portManagementApiService } from './portManagementApi'
import { portPerformanceApiService } from './portPerformanceApi'
import { logService } from './logService'

// 重新导出所有服务
export { apiService, ApiError }
export { authApiService }
export { appsApiService }
export { publicApiService }
export { detectionApiService }
export { filesystemApiService }
export { websocketManager, wsManager }
export { configApiService }
export { userSettingsApiService }
export { systemSettingsApiService }
export { appConfigApiService }
export { pm2ApiService }
export { portManagementApiService }
export { portPerformanceApiService }
export { logService }

// 类型导出
export type { 
  ApiResponse, 
  PaginatedResponse, 
  RequestConfig 
} from './api'

export type {
  LoginResponse,
  TokenRefreshResponse,
  UserProfileResponse,
  ChangePasswordRequest
} from './authApi'

export type {
  App,
  AppCreateRequest,
  AppUpdateRequest,
  AppStatusUpdateRequest,
  AppQueryParams,
  AppStats,
  PortDetectionResult,
  PortConflictCheck
} from './appsApi'

export type {
  PublicApp,
  SystemHealth,
  SystemStats,
  PortalConfig
} from './publicApi'

export type {
  DetectionResult,
  ScanConfig,
  ScanStatus,
  ScanResults
} from './detectionApi'

export type {
  FileSystemItem,
  BrowseResult,
  PathValidation,
  HomeDirectory
} from './filesystemApi'

export type {
  TechStackConfig,
  TechStackConfigResponse,
  SystemConfig
} from './configApi'

export type {
  UserSettings,
  PresetPath
} from './userSettingsApi'

export type {
  SystemSettingsResponse,
  SystemStatistics
} from './systemSettingsApi'

export type {
  AppConfiguration,
  ConfigurationTemplate,
  EnvironmentVariable,
  StartupParameter,
  PortConfiguration,
  BuildConfiguration,
  RuntimeConfiguration,
  ValidationResult,
  ValidationError,
  ValidationWarning
} from './appConfigApi'

export type {
  PM2Process,
  PM2Config,
  PM2EcosystemConfig,
  PM2Stats,
  PM2LogType,
  PM2LogResponse,
  AppLaunchMethodRequest
} from './pm2Api'

export type {
  PortScanResult,
  PortScanConfig,
  ScanTask,
  PortConflict,
  PortStatistics
} from './portManagementApi'

export type {
  PerformanceMetric,
  PerformanceAlert,
  PerformanceTrend,
  MonitoringConfig,
  PerformanceOverview,
  PerformanceSummary
} from './portPerformanceApi'

// 初始化API服务的函数
export function initializeApiServices(authStore: any): Record<string, unknown> {
  // 将认证store注入到API服务中
  apiService.setAuthStore(authStore)

  // 可以在这里设置其他全局配置
  return {
    apiService,
    authApiService,
    appsApiService,
    publicApiService,
    detectionApiService,
    filesystemApiService,
    websocketManager,
    configApiService,
  userSettingsApiService,
  systemSettingsApiService,
    appConfigApiService,
    pm2ApiService,
    portManagementApiService,
    portPerformanceApiService,
    logService
  }
}

// 默认导出主要服务
const servicesRegistry: Record<string, unknown> = {
  api: apiService,
  auth: authApiService,
  apps: appsApiService,
  public: publicApiService,
  detection: detectionApiService,
  filesystem: filesystemApiService,
  websocket: websocketManager,
  config: configApiService,
  userSettings: userSettingsApiService,
  systemSettings: systemSettingsApiService,
  appConfig: appConfigApiService,
  pm2: pm2ApiService,
  portManagement: portManagementApiService,
  portPerformance: portPerformanceApiService,
  logs: logService
}

export default servicesRegistry
