import { configApiService, type TechStackConfig, type TechStackConfigResponse } from '@/services/configApi'
import techStackConfig from '@/config/techStackConfig.json'
import { Platform, Box, ChromeFilled, DataBoard } from '@element-plus/icons-vue'

export interface TechStackInfo {
  icon: string
  displayName: string
  color: string
  tagType: 'primary' | 'success' | 'info' | 'warning' | 'danger'
}

export function getTechStackElIcon(techStack?: string) {
  const ts = (techStack || '').toLowerCase()
  if (ts.includes('vue') || ts.includes('react') || ts.includes('angular') || ts.includes('vite') || ts.includes('html') || ts.includes('nuxt') || ts.includes('next')) return ChromeFilled
  if (ts.includes('node') || ts.includes('express')) return DataBoard
  if (ts.includes('full')) return Box
  return Platform
}

export interface TechStackOption {
  label: string
  value: string
}

// Cache for dynamic configuration
let dynamicTechStackConfig: TechStackConfigResponse | null = null

/**
 * 获取技术栈配置（优先使用动态配置，后备使用静态配置）
 */
async function getTechStackConfig(): Promise<TechStackConfigResponse> {
  if (!dynamicTechStackConfig) {
    try {
      dynamicTechStackConfig = await configApiService.getTechStackConfig()
    } catch (error) {
      console.warn('Using static tech stack config as fallback:', error)
      // 使用静态配置作为后备
      dynamicTechStackConfig = techStackConfig as unknown as TechStackConfigResponse
    }
  }
  return dynamicTechStackConfig
}

/**
 * 获取技术栈信息
 */
export function getTechStackInfo(techStack: string): TechStackInfo {
  const normalizedTechStack = techStack?.toLowerCase() || ''
  
  // 使用静态配置进行同步操作
  // 直接匹配
  if (techStackConfig.techStacks[normalizedTechStack as keyof typeof techStackConfig.techStacks]) {
    return techStackConfig.techStacks[normalizedTechStack as keyof typeof techStackConfig.techStacks] as TechStackInfo
  }
  
  // 模糊匹配
  for (const [key, config] of Object.entries(techStackConfig.techStacks)) {
    if (normalizedTechStack.includes(key) || key.includes(normalizedTechStack)) {
      return config as TechStackInfo
    }
  }
  
  // 返回默认配置
  return techStackConfig.defaultTechStack as TechStackInfo
}

/**
 * 获取技术栈信息（异步版本，使用动态配置）
 */
export async function getTechStackInfoAsync(techStack: string): Promise<TechStackInfo> {
  const config = await getTechStackConfig()
  const normalizedTechStack = techStack?.toLowerCase() || ''
  
  // 直接匹配
  if (config.techStacks[normalizedTechStack]) {
    return config.techStacks[normalizedTechStack]
  }
  
  // 模糊匹配
  for (const [key, configItem] of Object.entries(config.techStacks)) {
    if (normalizedTechStack.includes(key) || key.includes(normalizedTechStack)) {
      return configItem
    }
  }
  
  // 返回默认配置
  return config.defaultTechStack
}

/**
 * 获取技术栈图标
 */
export function getTechStackIcon(techStack: string): string {
  return getTechStackInfo(techStack).icon
}

/**
 * 获取技术栈显示名称
 */
export function getTechStackDisplayName(techStack: string): string {
  return getTechStackInfo(techStack).displayName
}

/**
 * 获取技术栈颜色
 */
export function getTechStackColor(techStack: string): string {
  return getTechStackInfo(techStack).color
}

/**
 * 获取技术栈标签类型
 */
export function getTechStackTagType(techStack: string): 'primary' | 'success' | 'info' | 'warning' | 'danger' {
  return getTechStackInfo(techStack).tagType
}

/**
 * 获取所有技术栈选项（用于下拉选择）
 */
export function getTechStackOptions(): TechStackOption[] {
  return Object.entries(techStackConfig.techStacks).map(([value, config]) => ({
    label: config.displayName,
    value: value
  })).sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * 获取所有技术栈选项（异步版本，使用动态配置）
 */
export async function getTechStackOptionsAsync(): Promise<TechStackOption[]> {
  const config = await getTechStackConfig()
  return Object.entries(config.techStacks).map(([value, configItem]) => ({
    label: configItem.displayName,
    value: value
  })).sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * 从应用列表中提取唯一的技术栈选项
 */
export function extractTechStackOptions(apps: Array<{ tech_stack?: string }>): TechStackOption[] {
  const uniqueTechStacks = new Set<string>()
  
  apps.forEach(app => {
    if (app.tech_stack) {
      uniqueTechStacks.add(app.tech_stack)
    }
  })
  
  return Array.from(uniqueTechStacks)
    .map(techStack => ({
      value: techStack,
      label: getTechStackDisplayName(techStack)
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * 验证技术栈是否被支持
 */
export function isTechStackSupported(techStack: string): boolean {
  const normalizedTechStack = techStack?.toLowerCase() || ''
  return Object.keys(techStackConfig.techStacks).includes(normalizedTechStack)
}