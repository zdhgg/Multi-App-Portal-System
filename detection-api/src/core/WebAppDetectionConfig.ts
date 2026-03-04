/**
 * Web Application Detection Configuration
 * 
 * This file contains all the configuration and constants needed for 
 * intelligent web application detection and classification.
 */

import type { WebAppDetectionRule } from './types.js'

// =============================================================================
// CONFIDENCE CALCULATION WEIGHTS
// =============================================================================

export const CONFIDENCE_WEIGHTS = {
  DEPENDENCY_USAGE: 0.25,       // 25% weight for dependency usage analysis
  FILE_STRUCTURE: 0.25,         // 25% weight for file structure analysis
  SCRIPT_CONTENT: 0.20,         // 20% weight for script content analysis
  CONFIG_ANALYSIS: 0.15,        // 15% weight for config file analysis
  RUNTIME_FEATURES: 0.15,       // 15% weight for runtime features
  EXCLUSION_PENALTY: 0.3        // 30% penalty for exclusion dependencies
} as const

export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.85,     // High confidence threshold (increased)
  MEDIUM: 0.65,   // Medium confidence threshold (increased)
  LOW: 0.45       // Low confidence threshold (increased from 0.3)
} as const

// Enhanced confidence calculation weights for smart classifier
export const ENHANCED_CONFIDENCE_WEIGHTS = {
  DEPENDENCY_USAGE: 0.25,       // 依赖项实际使用分析
  FILE_STRUCTURE: 0.25,         // 文件结构和类型分布
  SCRIPT_CONTENT: 0.20,         // 启动脚本内容分析
  CONFIG_ANALYSIS: 0.15,        // 配置文件深度分析
  RUNTIME_FEATURES: 0.15        // 运行时特征检测
} as const

// =============================================================================
// STATIC WEBSITE DETECTION
// =============================================================================

export const STATIC_SITE_INDICATORS = {
  HTML_FILES: ['index.html', 'index.htm'],
  STATIC_DIRS: ['css', 'js', 'images', 'assets', 'static', 'dist', 'build'],
  BUILD_TOOLS: ['webpack', 'vite', 'gulp', 'grunt', 'parcel', 'rollup'],
  EXCLUDE_FEATURES: ['server.js', 'app.js', 'api', 'routes', 'controllers']
} as const

// =============================================================================
// ENHANCED WEB APPLICATION DETECTION RULES
// =============================================================================

export const ENHANCED_WEB_DETECTION_RULES: readonly WebAppDetectionRule[] = [
  // =============================================================================
  // FULLSTACK FRAMEWORKS (Priority: 90-100)
  // =============================================================================
  
  {
    name: 'nextjs',
    appType: 'fullstack',
    priority: 100,
    dependencies: ['next'],
    configFiles: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    directories: ['pages', 'app', 'components', 'api'],
    scripts: ['dev', 'build', 'start']
  },
  
  {
    name: 'nuxtjs',
    appType: 'fullstack',
    priority: 100,
    dependencies: ['nuxt'],
    configFiles: ['nuxt.config.js', 'nuxt.config.ts', 'nuxt.config.mjs'],
    directories: ['pages', 'components', 'server', 'api'],
    scripts: ['dev', 'build', 'generate', 'start']
  },
  
  {
    name: 'sveltekit',
    appType: 'fullstack',
    priority: 95,
    dependencies: ['@sveltejs/kit'],
    configFiles: ['svelte.config.js', 'vite.config.js', 'vite.config.ts'],
    directories: ['src/routes', 'src/lib', 'src/app.html'],
    scripts: ['dev', 'build', 'preview']
  },
  
  {
    name: 'remix',
    appType: 'fullstack',
    priority: 95,
    dependencies: ['@remix-run/node', '@remix-run/react'],
    configFiles: ['remix.config.js'],
    directories: ['app/routes', 'app/components'],
    scripts: ['dev', 'build', 'start']
  },
  
  {
    name: 'gatsby',
    appType: 'fullstack',
    priority: 90,
    dependencies: ['gatsby'],
    configFiles: ['gatsby-config.js', 'gatsby-node.js'],
    directories: ['src/pages', 'src/components'],
    scripts: ['develop', 'build', 'serve']
  },
  
  // =============================================================================
  // FRONTEND FRAMEWORKS (Priority: 70-89)
  // =============================================================================
  
  {
    name: 'react-vite',
    appType: 'frontend',
    priority: 88,
    dependencies: ['react', 'vite'],
    configFiles: ['vite.config.js', 'vite.config.ts'],
    directories: ['src', 'public'],
    scripts: ['dev', 'build', 'preview'],
    excludeDependencies: ['next', '@remix-run/react']
  },
  
  {
    name: 'vue-vite',
    appType: 'frontend',
    priority: 88,
    dependencies: ['vue', 'vite'],
    configFiles: ['vite.config.js', 'vite.config.ts'],
    directories: ['src', 'public'],
    scripts: ['dev', 'build', 'preview'],
    excludeDependencies: ['nuxt']
  },
  
  {
    name: 'angular',
    appType: 'frontend',
    priority: 85,
    dependencies: ['@angular/core'],
    configFiles: ['angular.json', 'ng-package.json'],
    directories: ['src/app', 'src/assets'],
    scripts: ['start', 'build', 'test', 'ng']
  },
  
  {
    name: 'svelte-vite',
    appType: 'frontend',
    priority: 82,
    dependencies: ['svelte', 'vite'],
    configFiles: ['vite.config.js', 'svelte.config.js'],
    directories: ['src', 'public'],
    scripts: ['dev', 'build'],
    excludeDependencies: ['@sveltejs/kit']
  },
  
  {
    name: 'react-webpack',
    appType: 'frontend',
    priority: 80,
    dependencies: ['react', 'webpack'],
    configFiles: ['webpack.config.js', 'craco.config.js'],
    directories: ['src', 'public'],
    scripts: ['start', 'build'],
    excludeDependencies: ['next', '@remix-run/react', 'vite']
  },
  
  {
    name: 'vue-webpack',
    appType: 'frontend',
    priority: 80,
    dependencies: ['vue', 'webpack'],
    configFiles: ['vue.config.js', 'webpack.config.js'],
    directories: ['src', 'public'],
    scripts: ['serve', 'build'],
    excludeDependencies: ['nuxt', 'vite']
  },
  
  {
    name: 'react-cra',
    appType: 'frontend',
    priority: 75,
    dependencies: ['react', 'react-scripts'],
    configFiles: [],
    directories: ['src', 'public'],
    scripts: ['start', 'build', 'test'],
    excludeDependencies: ['next', '@remix-run/react', 'vite', 'webpack']
  },
  
  {
    name: 'vue-cli',
    appType: 'frontend',
    priority: 75,
    dependencies: ['vue', '@vue/cli-service'],
    configFiles: ['vue.config.js'],
    directories: ['src', 'public'],
    scripts: ['serve', 'build'],
    excludeDependencies: ['nuxt', 'vite']
  },
  
  // =============================================================================
  // BACKEND FRAMEWORKS (Priority: 60-79)
  // =============================================================================
  
  {
    name: 'nestjs',
    appType: 'backend',
    priority: 78,
    dependencies: ['@nestjs/core', '@nestjs/common'],
    configFiles: ['nest-cli.json', 'tsconfig.json'],
    directories: ['src/controllers', 'src/services', 'src/modules'],
    scripts: ['start:dev', 'start:prod', 'build']
  },
  
  {
    name: 'express-typescript',
    appType: 'backend',
    priority: 75,
    dependencies: ['express', 'typescript'],
    configFiles: ['tsconfig.json'],
    directories: ['src', 'routes', 'controllers', 'middleware'],
    scripts: ['start', 'dev', 'build']
  },
  
  {
    name: 'fastify-typescript',
    appType: 'backend',
    priority: 75,
    dependencies: ['fastify', 'typescript'],
    configFiles: ['tsconfig.json'],
    directories: ['src', 'routes', 'plugins'],
    scripts: ['start', 'dev', 'build']
  },
  
  {
    name: 'express',
    appType: 'backend',
    priority: 70,
    dependencies: ['express'],
    configFiles: ['server.js', 'app.js', 'index.js'],
    directories: ['routes', 'controllers', 'middleware', 'models'],
    scripts: ['start', 'dev']
  },
  
  {
    name: 'fastify',
    appType: 'backend',
    priority: 70,
    dependencies: ['fastify'],
    configFiles: ['server.js', 'app.js'],
    directories: ['routes', 'plugins'],
    scripts: ['start', 'dev']
  },
  
  {
    name: 'koa',
    appType: 'backend',
    priority: 68,
    dependencies: ['koa'],
    configFiles: ['server.js', 'app.js'],
    directories: ['routes', 'middleware'],
    scripts: ['start', 'dev']
  },
  
  // =============================================================================
  // BUILD TOOLS & GENERIC (Priority: 40-59)
  // =============================================================================
  
  {
    name: 'vite-vanilla',
    appType: 'frontend',
    priority: 55,
    dependencies: ['vite'],
    configFiles: ['vite.config.js', 'vite.config.ts'],
    directories: ['src'],
    scripts: ['dev', 'build', 'preview'],
    excludeDependencies: ['react', 'vue', 'svelte']
  },
  
  {
    name: 'webpack-vanilla',
    appType: 'frontend',
    priority: 50,
    dependencies: ['webpack'],
    configFiles: ['webpack.config.js'],
    directories: ['src'],
    scripts: ['build', 'dev'],
    excludeDependencies: ['react', 'vue', '@angular/core']
  },
  
  {
    name: 'parcel',
    appType: 'frontend',
    priority: 45,
    dependencies: ['parcel'],
    configFiles: ['.parcelrc'],
    directories: ['src'],
    scripts: ['start', 'build']
  },
  
  {
    name: 'rollup',
    appType: 'frontend',
    priority: 45,
    dependencies: ['rollup'],
    configFiles: ['rollup.config.js'],
    directories: ['src'],
    scripts: ['build', 'dev']
  },
  
  // =============================================================================
  // GENERIC NODE.JS (Priority: 30-39)
  // =============================================================================
  
  {
    name: 'nodejs-web',
    appType: 'backend',
    priority: 35,
    dependencies: [],
    configFiles: ['package.json'],
    directories: [],
    scripts: ['start']
  }
] as const

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function getDetectionRuleByName(name: string): WebAppDetectionRule | undefined {
  return ENHANCED_WEB_DETECTION_RULES.find(rule => rule.name === name)
}

export function getDetectionRulesByAppType(appType: string): readonly WebAppDetectionRule[] {
  return ENHANCED_WEB_DETECTION_RULES.filter(rule => rule.appType === appType)
}

export function getSortedDetectionRules(): readonly WebAppDetectionRule[] {
  return [...ENHANCED_WEB_DETECTION_RULES].sort((a, b) => b.priority - a.priority)
}
