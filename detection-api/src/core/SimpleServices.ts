/**
 * Simple Supporting Services
 * 
 * These are minimal implementations of the supporting services
 * required by the core architecture. They can be enhanced later.
 */

import { readdir, stat, writeFile, copyFile, unlink } from 'fs/promises'
import { join, basename } from 'path'
import { existsSync, readFileSync } from 'fs'
import { spawn, ChildProcess } from 'child_process'
import ConfigService from '../services/configService'
import type {
  Application,
  FileScanner,
  TechStackAnalyzer,
  ProcessManager,
  ApplicationRepository,
  DetectionIssue,
  WebAppAnalysisResult,
  WebAppType,
  WebAppFeatures
} from './types'
import {
  NON_WEB_EXCLUSION_DEPS,
  WEB_DEPENDENCY_INDICATORS
} from './types'
import {
  ENHANCED_WEB_DETECTION_RULES,
  CONFIDENCE_WEIGHTS,
  CONFIDENCE_THRESHOLDS,
  STATIC_SITE_INDICATORS,
  getSortedDetectionRules
} from './WebAppDetectionConfig'
import { logger } from '../utils/logger'

// =============================================================================
// FILE SCANNER - Enhanced Web Application Detection
// =============================================================================

export class SimpleFileScanner implements FileScanner {
  // 默认扫描深度
  private static readonly DEFAULT_MAX_DEPTH = 5
  // 应用目录内继续下探的最大层级（用于识别 monorepo/fullstack 子应用）
  private static readonly APP_NESTED_SCAN_DEPTH = 3
  // 扫描时跳过的目录，避免无意义的大量遍历
  private static readonly SKIP_DIRS = new Set([
    'node_modules', 'dist', 'build', 'coverage',
    '.next', '.nuxt', '.cache', '__pycache__',
    'vendor', 'target', 'bin', 'obj', 'out'
  ])

  async findApplicationDirectories(workspacePath: string, options?: { maxDepth?: number }): Promise<string[]> {
    const directories: string[] = []
    
    // 规范化路径：将正斜杠转换为系统路径分隔符
    const normalizedPath = workspacePath.replace(/\//g, '\\')
    
    // 使用配置的扫描深度，默认为 5
    const maxDepth = options?.maxDepth ?? SimpleFileScanner.DEFAULT_MAX_DEPTH
    
    // 【重要调试日志】确认扫描深度配置
    logger.warn('=== SCAN DEPTH DEBUG ===', { 
      workspacePath, 
      normalizedPath, 
      optionsReceived: options,
      maxDepthUsed: maxDepth,
      isDefaultDepth: maxDepth === SimpleFileScanner.DEFAULT_MAX_DEPTH
    })
    
    try {
      await this.scanDirectory(normalizedPath, directories, 0, maxDepth)
      logger.info('File scan completed', { workspacePath: normalizedPath, found: directories.length, maxDepth, directories })
      return directories
    } catch (error) {
      logger.error('File scanning failed', { workspacePath: normalizedPath, error })
      return []
    }
  }

  private async scanDirectory(
    dirPath: string, 
    results: string[], 
    currentDepth: number, 
    maxDepth: number,
    insideApp = false,
    nestedDepth = 0
  ): Promise<void> {
    try {
      logger.info('Scanning directory', { dirPath, currentDepth, maxDepth, insideApp, nestedDepth })
      const entries = await readdir(dirPath)
      logger.info('Directory entries found', { dirPath, entryCount: entries.length, entries: entries.slice(0, 10) }) // 只显示前10个
      
      // 先检查当前目录是否是应用（不受深度限制）
      const isApplicationDir = this.isApplicationDirectory(dirPath, entries)
      if (isApplicationDir) {
        logger.info('Found application directory, adding to results', { dirPath })
        this.addResult(results, dirPath)
      }
      
      // 深度检查：如果已达到最大深度，不再扫描子目录
      if (currentDepth >= maxDepth) {
        logger.info('Reached max depth, stopping deeper scan', { dirPath, currentDepth, maxDepth })
        return
      }

      // 应用目录内扫描额外限制：防止在单个项目中无限向下遍历
      if (insideApp && nestedDepth >= SimpleFileScanner.APP_NESTED_SCAN_DEPTH) {
        logger.debug('Reached nested app scan depth limit', {
          dirPath,
          nestedDepth,
          limit: SimpleFileScanner.APP_NESTED_SCAN_DEPTH
        })
        return
      }

      // 一旦命中应用目录，后续子目录按“应用内部”策略继续扫描
      const nextInsideApp = insideApp || isApplicationDir
      const nextNestedDepth = nextInsideApp
        ? (insideApp ? nestedDepth + 1 : 1)
        : 0
      
      // Scan subdirectories
      for (const entry of entries) {
        if (this.shouldSkipDirectory(entry)) {
          logger.debug('Skipping excluded directory', { dirPath, entry })
          continue
        }
        
        const fullPath = join(dirPath, entry)
        const stats = await stat(fullPath)
        
        if (stats.isDirectory()) {
          logger.debug('Scanning subdirectory', { fullPath, currentDepth })
          await this.scanDirectory(
            fullPath,
            results,
            currentDepth + 1,
            maxDepth,
            nextInsideApp,
            nextNestedDepth
          )
        }
      }
    } catch (error) {
      // Skip directories we can't read
      logger.debug('Directory scan error', { dirPath, error: error instanceof Error ? error.message : String(error) })
    }
  }

  private shouldSkipDirectory(entry: string): boolean {
    return entry.startsWith('.') || SimpleFileScanner.SKIP_DIRS.has(entry)
  }

  private addResult(results: string[], dirPath: string): void {
    if (!results.includes(dirPath)) {
      results.push(dirPath)
    }
  }

  private isApplicationDirectory(dirPath: string, entries: string[]): boolean {
    // Enhanced Web application detection logic

    // First check: Must have package.json for Node.js-based web apps
    const hasPackageJson = entries.includes('package.json')
    if (!hasPackageJson) {
      // Check for static websites (HTML files)
      const hasHtmlFiles = entries.some(entry =>
        entry.endsWith('.html') || entry.endsWith('.htm')
      )

      if (hasHtmlFiles) {
        logger.info('Found static website directory', { dirPath, htmlFiles: entries.filter(e => e.endsWith('.html') || e.endsWith('.htm')) })
        return true
      }

      logger.debug('No package.json or HTML files found', { dirPath })
      return false
    }

    // Second check: Analyze package.json to determine if it's a web application
    try {
      const packageJsonPath = join(dirPath, 'package.json')
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      }
      const depKeys = Object.keys(allDeps)

      logger.debug('Analyzing package.json for web app detection', {
        dirPath,
        depCount: depKeys.length,
        deps: depKeys.slice(0, 10) // Log first 10 dependencies
      })

      // Third check: Exclude non-web applications
      const hasNonWebDeps = depKeys.some(dep =>
        NON_WEB_EXCLUSION_DEPS.includes(dep as any)
      )

      if (hasNonWebDeps) {
        const nonWebDeps = depKeys.filter(dep =>
          NON_WEB_EXCLUSION_DEPS.includes(dep as any)
        )
        logger.info('Excluding non-web application', {
          dirPath,
          nonWebDeps,
          reason: 'Contains non-web dependencies'
        })
        return false
      }

      // Fourth check: Look for web-specific dependencies
      const hasWebDeps = depKeys.some(dep =>
        WEB_DEPENDENCY_INDICATORS.includes(dep as any)
      )

      if (hasWebDeps) {
        const webDeps = depKeys.filter(dep =>
          WEB_DEPENDENCY_INDICATORS.includes(dep as any)
        )
        logger.info('Found web application directory', {
          dirPath,
          webDeps,
          reason: 'Contains web-specific dependencies'
        })
        return true
      }

      // Fifth check: Look for web-related scripts
      const scripts = packageJson.scripts || {}
      const scriptNames = Object.keys(scripts)
      const webScripts = ['start', 'dev', 'serve', 'build', 'preview']
      const hasWebScripts = scriptNames.some(script =>
        webScripts.includes(script)
      )

      if (hasWebScripts) {
        const foundWebScripts = scriptNames.filter(script =>
          webScripts.includes(script)
        )
        logger.info('Found web application directory', {
          dirPath,
          webScripts: foundWebScripts,
          reason: 'Contains web-related scripts'
        })
        return true
      }

      // Sixth check: Look for web-related configuration files
      const webConfigFiles = [
        'webpack.config.js', 'vite.config.js', 'vue.config.js',
        'next.config.js', 'angular.json', 'svelte.config.js',
        'nuxt.config.js', 'gatsby-config.js', 'remix.config.js'
      ]
      const hasWebConfigFiles = entries.some(entry =>
        webConfigFiles.includes(entry)
      )

      if (hasWebConfigFiles) {
        const foundConfigFiles = entries.filter(entry =>
          webConfigFiles.includes(entry)
        )
        logger.info('Found web application directory', {
          dirPath,
          configFiles: foundConfigFiles,
          reason: 'Contains web configuration files'
        })
        return true
      }

      // If we have package.json but no clear web indicators,
      // it might still be a generic Node.js web app
      if (depKeys.length > 0) {
        logger.info('Found potential web application directory', {
          dirPath,
          depCount: depKeys.length,
          reason: 'Has package.json with dependencies but unclear web indicators'
        })
        return true
      }

      logger.debug('Package.json found but no web indicators', { dirPath })
      return false

    } catch (error) {
      logger.error('Error reading package.json', {
        dirPath,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }
}

// =============================================================================
// TECH STACK ANALYZER - Simple pattern matching
// =============================================================================

export class SimpleTechStackAnalyzer implements TechStackAnalyzer {
  private configService = ConfigService.getInstance();
  async analyze(directory: string): Promise<WebAppAnalysisResult> {
    try {
      logger.info('Starting enhanced web app analysis', { directory })

      // Step 1: Check for package.json (Node.js-based apps) - Higher Priority
      const packageJsonPath = join(directory, 'package.json')
      if (existsSync(packageJsonPath)) {
        logger.info('Found package.json, analyzing as Node.js web app', { directory })
        return await this.analyzeNodeJsWebApp(directory, packageJsonPath)
      }

      // Step 2: Fallback to static website detection
      const staticSiteResult = await this.analyzeStaticSite(directory)
      if (staticSiteResult) {
        return staticSiteResult
      }

      // Step 3: Unable to determine app type
      logger.info('No package.json or HTML files found, unknown app type', { directory })
      return {
        techStack: 'unknown',
        appType: 'non-web',
        confidence: 0.1,
        features: this.createEmptyFeatures(),
        issues: [{
          type: 'error',
          code: 'NO_PACKAGE_JSON',
          message: 'No package.json found and not a static website'
        }]
      }

    } catch (error) {
      logger.error('Web app analysis failed', { directory, error: error instanceof Error ? error.message : String(error) })
      return {
        techStack: 'unknown',
        appType: 'non-web',
        confidence: 0.1,
        features: this.createEmptyFeatures(),
        issues: [{
          type: 'error',
          code: 'ANALYSIS_FAILED',
          message: `Analysis failed: ${error}`
        }]
      }
    }
  }

  // =============================================================================
  // STATIC WEBSITE ANALYSIS
  // =============================================================================

  private async analyzeStaticSite(directory: string): Promise<WebAppAnalysisResult | null> {
    try {
      const entries = await readdir(directory)

      // Check for HTML files
      const htmlFiles = entries.filter(entry =>
        STATIC_SITE_INDICATORS.HTML_FILES.some(pattern =>
          entry.toLowerCase().includes(pattern.replace('.html', '').replace('.htm', ''))
        ) || entry.endsWith('.html') || entry.endsWith('.htm')
      )

      if (htmlFiles.length === 0) {
        return null // Not a static site
      }

      // Check for static directories
      const staticDirs = entries.filter(entry =>
        STATIC_SITE_INDICATORS.STATIC_DIRS.includes(entry.toLowerCase() as any)
      )

      // Calculate confidence based on static site indicators
      let confidence = 0.6 // Base confidence for having HTML files

      if (staticDirs.length > 0) {
        confidence += 0.2 // Bonus for static directories
      }

      // Check if it has build tools (might be a built static site)
      const packageJsonPath = join(directory, 'package.json')
      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
          const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
          const hasBuildTools = Object.keys(deps).some(dep =>
            STATIC_SITE_INDICATORS.BUILD_TOOLS.includes(dep as any)
          )

          if (hasBuildTools) {
            confidence += 0.1 // Small bonus for build tools
          }
        } catch (error) {
          // Ignore package.json parsing errors for static sites
        }
      }

      logger.info('Detected static website', {
        directory,
        htmlFiles,
        staticDirs,
        confidence
      })

      return {
        techStack: 'static-html',
        appType: 'static',
        confidence: Math.min(confidence, 0.9),
        features: {
          hasPackageJson: existsSync(packageJsonPath),
          configFiles: [],
          directories: staticDirs,
          scripts: [],
          dependencies: [],
          devDependencies: []
        },
        issues: []
      }

    } catch (error) {
      logger.debug('Error analyzing static site', { directory, error })
      return null
    }
  }

  // =============================================================================
  // NODE.JS WEB APPLICATION ANALYSIS
  // =============================================================================

  private async analyzeNodeJsWebApp(directory: string, packageJsonPath: string): Promise<WebAppAnalysisResult> {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    const dependencies = packageJson.dependencies || {}
    const devDependencies = packageJson.devDependencies || {}
    const allDeps = { ...dependencies, ...devDependencies }
    const scripts = packageJson.scripts || {}

    logger.info('Analyzing Node.js web app', {
      directory,
      depCount: Object.keys(allDeps).length,
      scriptCount: Object.keys(scripts).length
    })

    // Get directory entries and config files
    const entries = await readdir(directory)
    const features = await this.extractWebAppFeatures(directory, packageJson, entries)

    // Try to detect tech stack using dynamic rules
    const techStackResult = await this.detectTechStackDynamic(directory, allDeps, scripts, entries)
    if (techStackResult && techStackResult.techStack && techStackResult.appType) {
      return {
        techStack: techStackResult.techStack,
        appType: techStackResult.appType,
        confidence: techStackResult.confidence || 0.5,
        features,
        issues: techStackResult.issues || []
      }
    }

    // Fallback to static detection rules if dynamic detection fails
    const detectionRules = getSortedDetectionRules()

    for (const rule of detectionRules) {
      const matchResult = this.matchDetectionRule(rule, features, allDeps, scripts, entries)

      if (matchResult.matches) {
        logger.info('Matched static detection rule', {
          directory,
          rule: rule.name,
          confidence: matchResult.confidence,
          matchedFeatures: matchResult.matchedFeatures
        })

        return {
          techStack: rule.name,
          appType: rule.appType,
          confidence: matchResult.confidence,
          features,
          issues: matchResult.issues
        }
      }
    }

    // Fallback: Generic Node.js web app
    logger.info('No specific rule matched, treating as generic Node.js web app', { directory })

    return {
      techStack: 'nodejs-web',
      appType: 'backend',
      confidence: 0.4,
      features,
      issues: [{
        type: 'info',
        code: 'GENERIC_NODEJS_WEB_APP',
        message: 'Detected as generic Node.js web application'
      }]
    }
  }

  // =============================================================================
  // DYNAMIC TECH STACK DETECTION
  // =============================================================================

  private async detectTechStackDynamic(
    directory: string, 
    allDeps: Record<string, any>, 
    scripts: Record<string, any>, 
    entries: string[]
  ): Promise<Partial<WebAppAnalysisResult> | null> {
    try {
      // Load dynamic tech stack rules from configuration
      const response = await fetch('http://localhost:8001/api/config/tech-stack-rules');
      const result = await response.json();
      
      if (!result.success || !result.data) {
        logger.warn('Failed to load dynamic tech stack rules, using fallback');
        return null;
      }

      const rules = result.data;
      const detectedStacks: Array<{ techStack: string; priority: number; confidence: number }> = [];

      // Check package.json dependencies
      for (const rule of rules.packageJsonRules) {
        if (allDeps[rule.dependency]) {
          const confidence = this.calculateDependencyConfidence(rule.dependency, allDeps);
          detectedStacks.push({
            techStack: rule.techStack,
            priority: rule.priority,
            confidence
          });
          
          logger.info('Dynamic tech stack detected via dependency', {
            directory,
            dependency: rule.dependency,
            techStack: rule.techStack,
            confidence
          });
        }
      }

      // Check file patterns
      for (const rule of rules.filePatternRules) {
        const matchingFiles = entries.filter(entry => {
          if (rule.pattern.includes('*')) {
            const regex = new RegExp(rule.pattern.replace(/\*/g, '.*'));
            return regex.test(entry);
          }
          return entry === rule.pattern;
        });

        if (matchingFiles.length > 0) {
          const confidence = this.calculateFilePatternConfidence(rule.pattern, matchingFiles.length);
          detectedStacks.push({
            techStack: rule.techStack,
            priority: rule.priority,
            confidence
          });

          logger.info('Dynamic tech stack detected via file pattern', {
            directory,
            pattern: rule.pattern,
            matchingFiles,
            techStack: rule.techStack,
            confidence
          });
        }
      }

      // Check scripts
      for (const rule of rules.scriptRules) {
        const matchingScripts = Object.keys(scripts).filter(scriptName => {
          const scriptContent = scripts[scriptName];
          return scriptContent && scriptContent.includes(rule.script);
        });

        if (matchingScripts.length > 0) {
          const confidence = this.calculateScriptConfidence(rule.script, matchingScripts.length);
          detectedStacks.push({
            techStack: rule.techStack,
            priority: rule.priority,
            confidence
          });

          logger.info('Dynamic tech stack detected via script', {
            directory,
            script: rule.script,
            matchingScripts,
            techStack: rule.techStack,
            confidence
          });
        }
      }

      // If no stacks detected, return null
      if (detectedStacks.length === 0) {
        return null;
      }

      // Sort by priority (lower number = higher priority) and confidence
      detectedStacks.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return b.confidence - a.confidence;
      });

      const bestMatch = detectedStacks[0];
      const appType = this.getAppTypeFromTechStack(bestMatch.techStack);

      return {
        techStack: bestMatch.techStack.toLowerCase().replace(/[\s.]/g, '-'),
        appType,
        confidence: Math.min(bestMatch.confidence, 0.95), // Cap confidence at 95%
        issues: [{
          type: 'info',
          code: 'DYNAMIC_DETECTION',
          message: `Detected using dynamic configuration: ${bestMatch.techStack}`
        }]
      };

    } catch (error) {
      logger.error('Dynamic tech stack detection failed', { directory, error });
      return null;
    }
  }

  private calculateDependencyConfidence(dependency: string, allDeps: Record<string, any>): number {
    // Base confidence for having the dependency
    let confidence = 0.7;

    // Boost confidence if it's a production dependency
    if (allDeps[dependency] && typeof allDeps[dependency] === 'string') {
      confidence += 0.1;
    }

    // Framework-specific adjustments
    const frameworkDeps = ['react', 'vue', '@angular/core', 'next', 'nuxt', 'express'];
    if (frameworkDeps.includes(dependency)) {
      confidence += 0.15;
    }

    return Math.min(confidence, 1.0);
  }

  private calculateFilePatternConfidence(pattern: string, matchCount: number): number {
    let confidence = 0.6;

    // Higher confidence for config files
    const configFiles = ['angular.json', 'next.config.js', 'nuxt.config.js', 'vite.config.*'];
    if (configFiles.some(config => pattern.includes(config.replace('.*', '')))) {
      confidence += 0.2;
    }

    // Slight boost for multiple matches
    if (matchCount > 1) {
      confidence += Math.min(matchCount * 0.05, 0.15);
    }

    return Math.min(confidence, 1.0);
  }

  private calculateScriptConfidence(script: string, matchCount: number): number {
    let confidence = 0.5;

    // Higher confidence for common framework scripts
    const frameworkScripts = ['react-scripts', 'vue-cli-service', 'ng serve', 'next dev', 'nuxt dev'];
    if (frameworkScripts.includes(script)) {
      confidence += 0.3;
    }

    // Slight boost for multiple script matches
    if (matchCount > 1) {
      confidence += Math.min(matchCount * 0.1, 0.2);
    }

    return Math.min(confidence, 1.0);
  }

  private getAppTypeFromTechStack(techStack: string): 'frontend' | 'backend' | 'fullstack' | 'static' | 'unknown' {
    const frontendStacks = ['React', 'Vue', 'Angular'];
    const backendStacks = ['Express', 'Node.js'];
    const fullstackStacks = ['Next.js', 'Nuxt.js'];
    const toolStacks = ['Vite', 'Webpack'];

    if (frontendStacks.includes(techStack)) return 'frontend';
    if (backendStacks.includes(techStack)) return 'backend';
    if (fullstackStacks.includes(techStack)) return 'fullstack';
    if (toolStacks.includes(techStack)) return 'frontend'; // Tools usually for frontend

    return 'unknown';
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private createEmptyFeatures(): WebAppFeatures {
    return {
      hasPackageJson: false,
      configFiles: [],
      directories: [],
      scripts: [],
      dependencies: [],
      devDependencies: []
    }
  }

  private async extractWebAppFeatures(
    directory: string,
    packageJson: any,
    entries: string[]
  ): Promise<WebAppFeatures> {
    const dependencies = Object.keys(packageJson.dependencies || {})
    const devDependencies = Object.keys(packageJson.devDependencies || {})
    const scripts = Object.keys(packageJson.scripts || {})

    // Find config files
    const allConfigFiles = [
      'webpack.config.js', 'vite.config.js', 'vue.config.js', 'next.config.js',
      'angular.json', 'svelte.config.js', 'nuxt.config.js', 'gatsby-config.js',
      'remix.config.js', 'nest-cli.json', 'tsconfig.json', '.parcelrc',
      'rollup.config.js', 'craco.config.js'
    ]
    const configFiles = entries.filter(entry => allConfigFiles.includes(entry))

    // Find relevant directories (only check first level)
    const relevantDirs = ['src', 'public', 'pages', 'app', 'components', 'routes',
                         'controllers', 'middleware', 'api', 'server', 'lib']
    const directories = entries.filter(entry => {
      try {
        const fullPath = join(directory, entry)
        const stats = require('fs').statSync(fullPath)
        return stats.isDirectory() && relevantDirs.includes(entry)
      } catch {
        return false
      }
    })

    return {
      hasPackageJson: true,
      configFiles,
      directories,
      scripts,
      dependencies,
      devDependencies
    }
  }

  private matchDetectionRule(
    rule: any,
    features: WebAppFeatures,
    allDeps: Record<string, string>,
    scripts: Record<string, string>,
    entries: string[]
  ): { matches: boolean; confidence: number; matchedFeatures: string[]; issues: DetectionIssue[] } {

    logger.debug('Matching detection rule', {
      ruleName: rule.name,
      ruleType: rule.appType,
      rulePriority: rule.priority,
      availableDeps: Object.keys(allDeps).slice(0, 10),
      availableScripts: Object.keys(scripts),
      availableConfigFiles: entries.filter(e => e.includes('config') || e.includes('.json'))
    })

    const matchedFeatures: string[] = []
    const issues: DetectionIssue[] = []
    let totalScore = 0
    const scoreBreakdown: Record<string, number> = {}

    // Check dependency matches
    const depMatches = rule.dependencies.filter((dep: string) => dep in allDeps)
    const depScore = depMatches.length / Math.max(rule.dependencies.length, 1)
    const depContribution = depScore * CONFIDENCE_WEIGHTS.DEPENDENCY_USAGE
    totalScore += depContribution
    scoreBreakdown.dependencies = depContribution

    logger.debug('Dependency matching', {
      ruleName: rule.name,
      requiredDeps: rule.dependencies,
      foundDeps: depMatches,
      depScore,
      depContribution
    })

    if (depMatches.length > 0) {
      matchedFeatures.push(`dependencies: ${depMatches.join(', ')}`)
    }

    // Check exclusion dependencies
    if (rule.excludeDependencies) {
      const exclusionMatches = rule.excludeDependencies.filter((dep: string) => dep in allDeps)
      if (exclusionMatches.length > 0) {
        const penalty = CONFIDENCE_WEIGHTS.EXCLUSION_PENALTY
        totalScore -= penalty
        scoreBreakdown.exclusionPenalty = -penalty

        logger.debug('Exclusion dependencies found', {
          ruleName: rule.name,
          exclusionDeps: exclusionMatches,
          penalty
        })

        issues.push({
          type: 'warning',
          code: 'EXCLUSION_DEPENDENCY_FOUND',
          message: `Found exclusion dependencies: ${exclusionMatches.join(', ')}`
        })
      }
    }

    // Check config file matches
    const configMatches = rule.configFiles.filter((file: string) => entries.includes(file))
    const configScore = configMatches.length / Math.max(rule.configFiles.length, 1)
    totalScore += configScore * CONFIDENCE_WEIGHTS.CONFIG_ANALYSIS

    if (configMatches.length > 0) {
      matchedFeatures.push(`config files: ${configMatches.join(', ')}`)
    }

    // Check directory matches
    const dirMatches = rule.directories.filter((dir: string) => features.directories.includes(dir))
    const dirScore = dirMatches.length / Math.max(rule.directories.length, 1)
    totalScore += dirScore * CONFIDENCE_WEIGHTS.FILE_STRUCTURE

    if (dirMatches.length > 0) {
      matchedFeatures.push(`directories: ${dirMatches.join(', ')}`)
    }

    // Check script matches
    const scriptMatches = rule.scripts.filter((script: string) => script in scripts)
    const scriptScore = scriptMatches.length / Math.max(rule.scripts.length, 1)
    totalScore += scriptScore * CONFIDENCE_WEIGHTS.SCRIPT_CONTENT

    if (scriptMatches.length > 0) {
      matchedFeatures.push(`scripts: ${scriptMatches.join(', ')}`)
    }

    // Determine if this rule matches
    const matches = depMatches.length > 0 && totalScore >= CONFIDENCE_THRESHOLDS.LOW
    const finalConfidence = Math.min(Math.max(totalScore, 0.1), 1.0)

    logger.debug('Rule matching result', {
      ruleName: rule.name,
      matches,
      finalConfidence,
      scoreBreakdown,
      totalScore,
      threshold: CONFIDENCE_THRESHOLDS.LOW,
      matchedFeatures,
      issueCount: issues.length
    })

    if (matches) {
      logger.info('Detection rule matched successfully', {
        ruleName: rule.name,
        appType: rule.appType,
        confidence: finalConfidence,
        matchedFeatures: matchedFeatures.join('; ')
      })
    }

    return {
      matches,
      confidence: finalConfidence,
      matchedFeatures,
      issues
    }
  }
}

// =============================================================================
// PROCESS MANAGER - Real process handling with lifecycle management
// =============================================================================

import { platform } from 'os'

interface ProcessInfo {
  process: ChildProcess
  startedAt: Date
  command: string
  args: string[]
  cwd: string
  port?: number
  logs: string[]
  processType?: 'single' | 'frontend' | 'backend'
  parentAppId?: string // For fullstack processes
  appName?: string // 应用名称，用于日志显示
}

interface FullStackProcessGroup {
  appId: string
  frontendProcess?: ProcessInfo
  backendProcess?: ProcessInfo
  startedAt: Date
}

export class SimpleProcessManager implements ProcessManager {
  private processes = new Map<string, ProcessInfo>()
  private fullStackGroups = new Map<string, FullStackProcessGroup>()
  private modifiedConfigs?: Map<string, {
    configPath: string
    backupPath: string
    originalContent: string
  }> // 全栈项目进程组
  private readonly maxLogLines = 1000 // 增加日志容量
  private applicationRepository?: ApplicationRepository // 用于状态同步
  private healthCheckInterval?: NodeJS.Timeout // 健康检查定时器
  private wsService?: any // WebSocket服务，用于实时推送日志
  private db?: any // 数据库实例

  /**
   * 构造函数
   */
  constructor(wsService?: any, db?: any) {
    this.wsService = wsService
    this.db = db
  }

  /**
   * 初始化进程管理器，检查和恢复进程状态
   */
  async initialize(applicationRepository: ApplicationRepository): Promise<void> {
    this.applicationRepository = applicationRepository
    await this.recoverProcessStates()
    this.startHealthCheck()
  }

  /**
   * 启动进程健康检查
   */
  private startHealthCheck(): void {
    // 每30秒检查一次进程健康状态
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck()
    }, 30000)

    logger.info('Process health check started', { interval: '30s' })
  }

  /**
   * 执行进程健康检查
   */
  private async performHealthCheck(): Promise<void> {
    if (!this.applicationRepository) return

    try {
      const healthyProcesses: string[] = []
      const unhealthyProcesses: string[] = []

      for (const [appId, processInfo] of this.processes.entries()) {
        const isHealthy = await this.checkProcessHealth(appId, processInfo)

        if (isHealthy) {
          healthyProcesses.push(appId)
        } else {
          unhealthyProcesses.push(appId)
          // Enhanced cleanup for unhealthy processes
          await this.forceCleanupProcess(appId, processInfo)
          // 更新数据库状态
          await this.applicationRepository.updateState(appId, 'stopped')
          logger.warn('Unhealthy process detected and cleaned up', { appId })
        }
      }

      if (unhealthyProcesses.length > 0) {
        logger.info('Health check completed', {
          healthy: healthyProcesses.length,
          unhealthy: unhealthyProcesses.length,
          unhealthyApps: unhealthyProcesses
        })
      }
    } catch (error) {
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * 强制清理进程 - 确保进程完全停止并释放资源
   */
  private async forceCleanupProcess(appId: string, processInfo: ProcessInfo): Promise<void> {
    try {
      const { process: childProcess, port } = processInfo

      if (childProcess && !childProcess.killed) {
        logger.info('Force killing unhealthy process', { appId, pid: childProcess.pid })
        
        // 尝试优雅停止
        childProcess.kill('SIGTERM')
        
        // 等待2秒，如果还没退出就强制杀死
        await new Promise<void>((resolve) => {
          const forceTimeout = setTimeout(() => {
            if (!childProcess.killed && childProcess.exitCode === null) {
              logger.warn('Force killing process with SIGKILL', { appId, pid: childProcess.pid })
              try {
                childProcess.kill('SIGKILL')
              } catch (error) {
                logger.warn('Failed to force kill process', { appId, pid: childProcess.pid, error: error.message })
              }
            }
            resolve()
          }, 2000)

          childProcess.once('exit', () => {
            clearTimeout(forceTimeout)
            resolve()
          })
        })
      }

      // 如果有端口信息，尝试清理端口占用
      if (port) {
        await this.forceReleasePort(port, appId)
      }

      // 清理进程记录
      this.processes.delete(appId)
      
    } catch (error) {
      logger.error('Error during force process cleanup', {
        appId,
        error: error instanceof Error ? error.message : String(error)
      })
      
      // 即使清理失败也要移除进程记录
      this.processes.delete(appId)
    }
  }

  /**
   * 强制释放端口占用
   */
  private async forceReleasePort(port: number, appId: string): Promise<void> {
    try {
      const { spawn } = require('child_process')
      
      // 查找占用端口的进程
      return new Promise((resolve) => {
        const netstat = spawn('netstat', ['-ano'], { shell: true, windowsHide: true })
        let output = ''
        
        netstat.stdout.on('data', (data: Buffer) => {
          output += data.toString()
        })
        
        netstat.on('close', () => {
          const lines = output.split('\n')
          for (const line of lines) {
            if (line.includes(`:${port} `) && line.includes('LISTENING')) {
              const parts = line.trim().split(/\s+/)
              const pid = parseInt(parts[parts.length - 1])
              
              if (!isNaN(pid)) {
                logger.info('Found process occupying port, attempting to kill', { 
                  appId, port, pid 
                })
                
                // 尝试杀死占用端口的进程
                try {
                  process.kill(pid, 'SIGKILL')
                  logger.info('Successfully killed process occupying port', { 
                    appId, port, pid 
                  })
                } catch (killError) {
                  logger.warn('Failed to kill process occupying port', { 
                    appId, port, pid, error: killError.message 
                  })
                }
              }
              break
            }
          }
          resolve()
        })
        
        netstat.on('error', () => {
          resolve()
        })
        
        // Timeout after 3 seconds
        setTimeout(() => {
          netstat.kill()
          resolve()
        }, 3000)
      })
      
    } catch (error) {
      logger.warn('Failed to force release port', { 
        appId, port, error: error.message 
      })
    }
  }

  /**
   * 检查单个进程的健康状态
   */
  private async checkProcessHealth(appId: string, processInfo: ProcessInfo): Promise<boolean> {
    const { process: childProcess, port } = processInfo

    // 检查进程是否还存在
    if (!childProcess || childProcess.killed || childProcess.exitCode !== null) {
      return false
    }

    // 检查端口是否还在监听（如果有端口信息）
    if (port) {
      const isPortListening = await this.checkProcessRunning(port)
      if (!isPortListening) {
        return false
      }
    }

    return true
  }

  /**
   * 恢复进程状态 - 检查数据库中标记为running的应用是否真的在运行
   */
  private async recoverProcessStates(): Promise<void> {
    if (!this.applicationRepository) {
      logger.warn('ApplicationRepository not available for process recovery')
      return
    }

    try {
      // 获取所有标记为running的应用
      const runningApps = await this.applicationRepository.findByState('running')
      logger.info('Checking process states for recovery', { count: runningApps.length })

      for (const app of runningApps) {
        const isActuallyRunning = await this.checkProcessRunning(app.network.primaryPort)

        if (!isActuallyRunning) {
          // 应用标记为running但实际没有运行，更新状态
          logger.info('Recovering orphaned application state', {
            id: app.id,
            name: app.name,
            port: app.network.primaryPort
          })

          await this.applicationRepository.updateState(app.id, 'stopped')
        } else {
          logger.info('Application confirmed running', {
            id: app.id,
            name: app.name,
            port: app.network.primaryPort
          })
        }
      }

      logger.info('Process state recovery completed')
    } catch (error) {
      logger.error('Failed to recover process states', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * 检查指定端口是否有进程在监听
   */
  private async checkProcessRunning(port: number): Promise<boolean> {
    return new Promise(async (resolve) => {
      try {
        const { spawn } = await import('child_process')
        const isWindows = process.platform === 'win32'

        const command = isWindows ? 'netstat' : 'lsof'
        const args = isWindows ? ['-ano'] : ['-i', `:${port}`]

        const proc = spawn(command, args, { 
          stdio: 'pipe',
          shell: isWindows,
          windowsHide: true  // 隐藏Windows下的CMD窗口
        })
        let output = ''

        proc.stdout?.on('data', (data: Buffer) => {
          output += data.toString()
        })

        proc.on('close', (code) => {
          if (isWindows) {
            // Windows: 检查输出中是否包含端口
            const hasPort = output.includes(`:${port} `) || output.includes(`:${port}\t`)
            resolve(hasPort)
          } else {
            // Unix: lsof返回0表示找到进程
            resolve(code === 0)
          }
        })

        proc.on('error', () => {
          resolve(false)
        })

        // 5秒超时
        setTimeout(() => {
          proc.kill()
          resolve(false)
        }, 5000)
      } catch (error) {
        logger.error('Error checking process running', { port, error })
        resolve(false)
      }
    })
  }

  async start(app: Application): Promise<ChildProcess> {
    logger.info('Starting application process', {
      id: app.id,
      name: app.name,
      directory: app.directory,
      techStack: app.techStack.name,
      isFullStack: app.fullStack?.isFullStack || false
    })

    // 🔧 新增：启动前配置端口
    await this.configureAppPortsBeforeStart(app)

    // 检查是否为全栈项目
    if (app.fullStack?.isFullStack) {
      logger.info('Detected fullstack project, using fullstack startup', { appId: app.id })
      const result = await this.startFullStack(app)
      if (result.success && result.frontendProcess) {
        return result.frontendProcess // 返回前端进程作为主进程
      } else {
        throw new Error(`全栈应用启动失败: ${result.errors.join(', ')}`)
      }
    }

    // 单进程应用的原有逻辑
    return this.startSingleProcess(app)
  }

  /**
   * 启动前配置应用端口
   */
  private async configureAppPortsBeforeStart(app: Application): Promise<void> {
    try {
      // 导入配置服务
      const { AppConfigurationService } = await import('../services/appConfigurationService')
      const configService = new AppConfigurationService(this.db)

      // 准备端口配置
      const ports: any = {}

      if (app.network?.primaryPort) {
        // 根据应用类型确定端口用途
        if (app.fullStack?.isFullStack) {
          ports.frontend = app.network.primaryPort
          if (app.network.secondaryPorts && app.network.secondaryPorts.length > 0) {
            ports.backend = app.network.secondaryPorts[0]
          }
        } else {
          // 单一应用，根据技术栈判断
          const techStack = app.techStack?.name?.toLowerCase() || ''
          if (techStack.includes('vue') || techStack.includes('react') || techStack.includes('angular')) {
            ports.frontend = app.network.primaryPort
          } else {
            ports.backend = app.network.primaryPort
          }
        }
      }

      // 配置端口
      if (Object.keys(ports).length > 0) {
        const success = await configService.configureAppPorts(app, ports)
        if (success) {
          logger.info('应用端口配置成功', { appId: app.id, ports })
        } else {
          logger.warn('应用端口配置失败，继续使用默认配置', { appId: app.id })
        }
      }

    } catch (error) {
      logger.error('配置应用端口时发生错误', { error, appId: app.id })
      // 不阻塞启动流程，继续使用默认配置
    }
  }

  private async startSingleProcess(app: Application): Promise<ChildProcess> {
    const startTime = Date.now()  // ✅ 第六阶段：启动性能监控
    
    logger.info('Starting single application process', {
      id: app.id,
      name: app.name,
      directory: app.directory,
      techStack: app.techStack.name,
      targetPort: app.network.primaryPort,
      startTimestamp: startTime
    })

    // 预检查
    await this.validateApplication(app)

    // 如果已经在运行，先停止
    if (this.processes.has(app.id)) {
      logger.info('Application already has a process, stopping it first', { id: app.id })
      await this.stop(app.id)
    }

    // 获取启动命令和参数
    const { command, args, env, workingDirectory } = await this.getStartCommand(app)
    const actualWorkingDir = workingDirectory || app.directory

    logger.info('Spawning process', {
      appId: app.id,
      command,
      args: args.join(' '),
      cwd: actualWorkingDir,
      port: app.network.primaryPort
    })

    try {
      // 根据技术栈优化环境变量
      const optimizedEnv = this.buildSingleProcessEnvironmentVariables(app, env)
      
      // 启动真实进程
      const isWindows = platform() === 'win32'
      const childProcess = spawn(command, args, {
        cwd: actualWorkingDir,
        env: optimizedEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: isWindows,
        windowsHide: true  // 隐藏Windows下的CMD窗口
      })

      // 创建进程信息
      const processInfo: ProcessInfo = {
        process: childProcess,
        startedAt: new Date(),
        command,
        args,
        cwd: actualWorkingDir,
        port: app.network.primaryPort,
        logs: [],
        processType: 'single',
        appName: app.name // 添加应用名称
      }

      // 设置事件监听器
      this.setupProcessListeners(app.id, childProcess, processInfo)

      // 存储进程信息
      this.processes.set(app.id, processInfo)

      logger.info('Application process started successfully', {
        id: app.id,
        pid: childProcess.pid,
        port: app.network.primaryPort
      })

      // 等待进程稳定启动
      await this.waitForProcessStable(childProcess, 3000)

      logger.info('Process spawned successfully', {
        appId: app.id,
        pid: childProcess.pid
      })

      // ✅ 第五阶段新增：验证端口是否正确启动
      logger.info('Starting port validation phase', {
        appId: app.id,
        targetPort: app.network.primaryPort,
        pid: childProcess.pid
      })

      const portValid = await this.validatePortAfterStart(app, childProcess, 15000)
      if (!portValid) {
        logger.error('Port validation failed, terminating process', { 
          appId: app.id, 
          port: app.network.primaryPort,
          pid: childProcess.pid
        })
        
        // 终止进程
        childProcess.kill('SIGTERM')
        
        // 等待进程完全终止
        await new Promise(resolve => {
          const timeout = setTimeout(() => {
            childProcess.kill('SIGKILL') // 强制终止
            resolve(undefined)
          }, 5000)
          
          childProcess.once('exit', () => {
            clearTimeout(timeout)
            resolve(undefined)
          })
        })
        
        // 清理进程记录
        this.processes.delete(app.id)
        
        throw new Error(`应用启动失败：端口 ${app.network.primaryPort} 未能正确监听`)
      }

      const totalStartupTime = Date.now() - startTime  // ✅ 第六阶段：计算总启动时间
      
      logger.info('Port validation successful - Application fully started', {
        appId: app.id,
        appName: app.name,
        techStack: app.techStack.name,
        port: app.network.primaryPort,
        pid: childProcess.pid,
        status: 'ready',
        performance: {
          totalStartupTimeMs: totalStartupTime,
          totalStartupTimeSec: Math.round(totalStartupTime / 1000 * 100) / 100,
          startupPhase: 'completed'
        }
      })

      // ✅ 记录启动性能指标
      if (totalStartupTime > 30000) {  // 超过30秒
        logger.warn('Application startup took longer than expected', {
          appId: app.id,
          startupTimeMs: totalStartupTime,
          threshold: '30000ms',
          recommendation: 'Consider optimizing application dependencies or startup scripts'
        })
      } else if (totalStartupTime < 5000) {  // 少于5秒
        logger.info('Fast application startup detected', {
          appId: app.id,
          startupTimeMs: totalStartupTime,
          performance: 'excellent'
        })
      }

      return childProcess

    } catch (error) {
      logger.error('Failed to start application process', {
        id: app.id,
        error: error instanceof Error ? error.message : String(error)
      })
      throw new Error(`应用启动失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async validateApplication(app: Application): Promise<void> {
    // 检查目录存在
    if (!existsSync(app.directory)) {
      throw new Error(`应用目录不存在: ${app.directory}`)
    }

    // 检查是否为有效的项目目录
    const packageJsonPath = join(app.directory, 'package.json')
    if (!existsSync(packageJsonPath)) {
      logger.warn('package.json not found, will use default commands', { appId: app.id })
    }

    // 检查node_modules是否存在
    const nodeModulesPath = join(app.directory, 'node_modules')
    if (!existsSync(nodeModulesPath)) {
      logger.warn('node_modules not found, dependencies may not be installed', { appId: app.id })
    }
  }

  private async waitForProcessStable(childProcess: ChildProcess, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!childProcess.killed && childProcess.exitCode === null) {
          resolve() // 进程仍在运行，认为启动成功
        } else {
          reject(new Error('进程启动后立即退出'))
        }
      }, timeout)

      childProcess.once('exit', (code) => {
        clearTimeout(timer)
        if (code !== 0) {
          reject(new Error(`进程启动失败，退出码: ${code}`))
        }
      })

      childProcess.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
  }

  /**
   * 启动全栈项目（前端+后端）
   */
  async startFullStack(app: Application): Promise<import('./types').FullStackProcessResult> {
    logger.info('Starting fullstack application', { appId: app.id })

    const errors: string[] = []
    let frontendProcess: ChildProcess | undefined
    let backendProcess: ChildProcess | undefined

    try {
      // 停止现有进程
      if (this.fullStackGroups.has(app.id)) {
        await this.stopFullStack(app.id)
      }

      const fullStackConfig = app.fullStack!

      // 启动后端进程
      if (fullStackConfig.backendConfig) {
        try {
          logger.info('Starting backend process', { appId: app.id })
          backendProcess = await this.startProcess(
            app.id,
            fullStackConfig.backendConfig,
            'backend'
          )
          logger.info('Backend process started', {
            appId: app.id,
            pid: backendProcess.pid,
            port: fullStackConfig.backendConfig.port
          })
        } catch (error) {
          const errorMsg = `后端启动失败: ${error instanceof Error ? error.message : String(error)}`
          logger.error(errorMsg, { appId: app.id })
          errors.push(errorMsg)
        }
      }

      // 🔧 修复：为前端进程设置后端API地址（支持局域网访问）
      if (fullStackConfig.frontendConfig && fullStackConfig.backendConfig) {
        // 创建新的环境变量对象，避免修改只读属性
        const frontendEnvVars = {
          ...fullStackConfig.frontendConfig.environmentVariables
        }

        // 🌐 使用相对路径 /api，让 Vite proxy 自动处理
        // 这样无论是 localhost 还是局域网 IP 访问都能正常工作
        const backendUrl = '/api'  // 使用相对路径，由 Vite proxy 代理
        const backendPort = fullStackConfig.backendConfig.port

        // 设置所有可能的前端API环境变量
        frontendEnvVars.VITE_API_URL = backendUrl
        frontendEnvVars.VITE_API_BASE_URL = backendUrl
        frontendEnvVars.REACT_APP_API_URL = backendUrl
        frontendEnvVars.REACT_APP_API_BASE_URL = backendUrl
        frontendEnvVars.VUE_APP_API_URL = backendUrl
        frontendEnvVars.VUE_APP_API_BASE_URL = backendUrl
        frontendEnvVars.API_BASE_URL = backendUrl
        frontendEnvVars.API_URL = backendUrl
        frontendEnvVars.NEXT_PUBLIC_API_URL = backendUrl
        frontendEnvVars.NUXT_PUBLIC_API_BASE = backendUrl

        // 🔧 设置 Vite proxy 配置环境变量
        frontendEnvVars.VITE_PROXY_TARGET = `http://localhost:${backendPort}`
        frontendEnvVars.VITE_BACKEND_PORT = backendPort.toString()

        // 为后端设置CORS配置
        const frontendUrl = `http://localhost:${fullStackConfig.frontendConfig.port}`
        const backendEnvVars = {
          ...fullStackConfig.backendConfig.environmentVariables
        }
        // 添加局域网IP支持的CORS配置
        const lanFrontendUrl = `http://192.168.31.74:${fullStackConfig.frontendConfig.port}`
        backendEnvVars.CORS_ORIGINS = `${frontendUrl},${lanFrontendUrl},http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173,http://192.168.31.74:3000,http://192.168.31.74:5173`
        backendEnvVars.FRONTEND_URL = frontendUrl

        // 更新后端配置
        const newBackendConfig = {
          ...fullStackConfig.backendConfig,
          environmentVariables: backendEnvVars
        }

        // 创建新的前端配置对象
        const newFrontendConfig = {
          ...fullStackConfig.frontendConfig,
          environmentVariables: frontendEnvVars
        }

        // 替换整个fullStackConfig对象以避免只读属性问题
        Object.assign(fullStackConfig, {
          ...fullStackConfig,
          frontendConfig: newFrontendConfig,
          backendConfig: newBackendConfig
        })

        logger.info('Set frontend API URL and backend CORS for fullstack app', {
          appId: app.id,
          backendUrl,
          frontendUrl,
          frontendPort: fullStackConfig.frontendConfig.port,
          backendPort: fullStackConfig.backendConfig.port,
          apiUrlsSet: [
            'VITE_API_URL', 'VITE_API_BASE_URL',
            'REACT_APP_API_URL', 'VUE_APP_API_URL',
            'API_BASE_URL', 'NEXT_PUBLIC_API_URL'
          ],
          corsOriginsSet: backendEnvVars.CORS_ORIGINS
        })
      }

      // 🔧 修复：在启动前端前配置代理（此时后端已启动）
      if (fullStackConfig.frontendConfig && fullStackConfig.backendConfig) {
        await this.configureFullStackProxyIfNeeded(
          app.id,
          fullStackConfig.frontendConfig,
          fullStackConfig.backendConfig.port,
          `${app.id}-frontend`
        )
      }

      // 启动前端进程
      if (fullStackConfig.frontendConfig) {
        try {
          logger.info('Starting frontend process', { appId: app.id })
          frontendProcess = await this.startProcess(
            app.id,
            fullStackConfig.frontendConfig,
            'frontend'
          )
          logger.info('Frontend process started', {
            appId: app.id,
            pid: frontendProcess.pid,
            port: fullStackConfig.frontendConfig.port
          })
        } catch (error) {
          const errorMsg = `前端启动失败: ${error instanceof Error ? error.message : String(error)}`
          logger.error(errorMsg, { appId: app.id })
          errors.push(errorMsg)
        }
      }

      // 创建进程组记录
      if (frontendProcess || backendProcess) {
        const group: FullStackProcessGroup = {
          appId: app.id,
          frontendProcess: frontendProcess ? this.processes.get(`${app.id}-frontend`) : undefined,
          backendProcess: backendProcess ? this.processes.get(`${app.id}-backend`) : undefined,
          startedAt: new Date()
        }
        this.fullStackGroups.set(app.id, group)
      }

      const success = errors.length === 0 && !!(frontendProcess || backendProcess)

      logger.info('Fullstack startup completed', {
        appId: app.id,
        success,
        frontendStarted: !!frontendProcess,
        backendStarted: !!backendProcess,
        errors: errors.length
      })

      return {
        frontendProcess,
        backendProcess,
        success,
        errors
      }

    } catch (error) {
      const errorMsg = `全栈应用启动失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg, { appId: app.id })
      errors.push(errorMsg)

      return {
        frontendProcess,
        backendProcess,
        success: false,
        errors
      }
    }
  }

  /**
   * 启动单个进程（前端或后端）
   */
  private async startProcess(
    appId: string,
    config: import('./types').ProcessConfiguration,
    type: 'frontend' | 'backend'
  ): Promise<ChildProcess> {
    const processId = `${appId}-${type}`

    // 解析启动命令
    let [command, ...args] = config.startCommand.split(' ')

    // 🔧 为全栈应用的前端创建 Vite proxy 配置
    if (type === 'frontend' && config.environmentVariables?.VITE_BACKEND_PORT) {
      await this.createViteProxyConfig(config.workingDirectory, config.environmentVariables.VITE_BACKEND_PORT)
    }

    // 🔧 修复：为Vite/Vue前端项目添加端口参数
    if (type === 'frontend' && (args.includes('dev') || args.includes('serve'))) {
      const isNpmCommand = command.includes('npm')
      const isViteCommand = args.some(arg => arg === 'vite' || config.startCommand.includes('vite'))
      
      // 检测是否是Vite项目（vue/vite）
      const workingDir = config.workingDirectory
      let isViteProject = false
      try {
        const packageJsonPath = join(workingDir, 'package.json')
        if (existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
          const devDeps = { ...packageJson.dependencies, ...packageJson.devDependencies }
          isViteProject = 'vite' in devDeps || '@vitejs/plugin-vue' in devDeps
        }
      } catch (error) {
        logger.warn('Failed to check if project is Vite-based', { error, workingDir })
      }

      // 如果是Vite项目，添加端口和host参数以支持局域网访问
      if (isViteProject) {
        // 检查是否有自定义的 proxy 配置文件
        const proxyConfigPath = join(workingDir, 'vite.config.proxy.ts')
        const hasProxyConfig = existsSync(proxyConfigPath)

        if (isNpmCommand) {
          // npm run dev -- --config vite.config.proxy.ts --port 3041 --host 0.0.0.0
          const hasDoubleDash = args.includes('--')
          if (!hasDoubleDash) {
            args.push('--')
          }
          // 如果有 proxy 配置文件，使用它
          if (hasProxyConfig && !args.includes('--config')) {
            args.push('--config', 'vite.config.proxy.ts')
          }
          if (!args.includes('--port')) {
            args.push('--port', config.port.toString())
          }
          if (!args.includes('--host')) {
            args.push('--host', '0.0.0.0')
          }
          logger.info('Added port and host parameters for Vite/Vue project (LAN access enabled)', {
            processId,
            port: config.port,
            host: '0.0.0.0',
            hasProxyConfig,
            originalCommand: config.startCommand,
            newArgs: args.join(' ')
          })
        } else if (isViteCommand) {
          // vite --config vite.config.proxy.ts --port 3041 --host 0.0.0.0
          if (hasProxyConfig && !args.includes('--config')) {
            args.push('--config', 'vite.config.proxy.ts')
          }
          if (!args.includes('--port')) {
            args.push('--port', config.port.toString())
          }
          if (!args.includes('--host')) {
            args.push('--host', '0.0.0.0')
          }
          logger.info('Added port and host parameters for Vite command (LAN access enabled)', {
            processId,
            port: config.port,
            host: '0.0.0.0',
            hasProxyConfig,
            newArgs: args.join(' ')
          })
        }
      }
    }

    logger.info('Spawning process', {
      processId,
      type,
      command,
      args: args.join(' '),
      cwd: config.workingDirectory,
      port: config.port
    })

    // 根据进程类型构建环境变量
    const processEnv = this.buildProcessEnvironmentVariables(type, config)

    const childProcess = spawn(command, args, {
      cwd: config.workingDirectory,
      env: processEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: platform() === 'win32',
      windowsHide: true  // 隐藏Windows下的CMD窗口
    })

    // 创建进程信息
    const processInfo: ProcessInfo = {
      process: childProcess,
      startedAt: new Date(),
      command,
      args,
      cwd: config.workingDirectory,
      port: config.port,
      logs: [],
      processType: type,
      parentAppId: appId,
      appName: `${appId}-${type}` // 添加应用名称（全栈应用的子进程）
    }

    // 设置事件监听器
    this.setupProcessListeners(processId, childProcess, processInfo)

    // 存储进程信息
    this.processes.set(processId, processInfo)

    // 等待进程稳定启动
    await this.waitForProcessStable(childProcess, 3000)

    return childProcess
  }

  /**
   * 为 Vite 前端创建 proxy 配置文件
   * 这样前端可以通过 /api 访问后端，无论是 localhost 还是局域网 IP 都能正常工作
   */
  private async createViteProxyConfig(workingDir: string, backendPort: string): Promise<void> {
    try {
      const configPath = join(workingDir, 'vite.config.proxy.ts')
      const backendTarget = `http://localhost:${backendPort}`

      const proxyConfig = `// 自动生成的 Vite proxy 配置 - 支持局域网访问
// 由智能门户系统自动创建，请勿手动修改
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',  // 支持局域网访问
    strictPort: false,
    proxy: {
      '/api': {
        target: '${backendTarget}',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
`

      await writeFile(configPath, proxyConfig, 'utf-8')

      logger.info('Created Vite proxy configuration for LAN access', {
        workingDir,
        backendPort,
        backendTarget,
        configPath
      })
    } catch (error) {
      logger.error('Failed to create Vite proxy config', { error, workingDir, backendPort })
    }
  }

  /**
   * 根据进程类型构建环境变量
   */
  private buildProcessEnvironmentVariables(
    type: 'frontend' | 'backend',
    config: import('./types').ProcessConfiguration
  ): Record<string, string> {
    const baseEnv = {
      ...process.env,
      ...config.environmentVariables,
      NODE_ENV: process.env.NODE_ENV || 'development'
    }

    // 根据进程类型设置特定的环境变量
    if (type === 'frontend') {
      const frontendEnv: Record<string, string> = {
        ...baseEnv,
        // 前端特定环境变量
        PORT: config.port.toString(),
        VITE_PORT: config.port.toString(),
        VITE_DEV_PORT: config.port.toString(),
        REACT_APP_PORT: config.port.toString(),
        VUE_APP_PORT: config.port.toString()
      }

      // 🔧 修复：确保所有可能的API URL环境变量被正确设置
      const apiUrlVars = [
        'VITE_API_URL', 'VITE_API_BASE_URL',
        'REACT_APP_API_URL', 'REACT_APP_API_BASE_URL',
        'VUE_APP_API_URL', 'VUE_APP_API_BASE_URL',
        'API_BASE_URL', 'API_URL',
        'NEXT_PUBLIC_API_URL', 'NUXT_PUBLIC_API_BASE'
      ]

      apiUrlVars.forEach(varName => {
        if (config.environmentVariables?.[varName]) {
          frontendEnv[varName] = config.environmentVariables[varName]
        }
      })

      // 收集所有API URL环境变量用于日志记录
      const apiUrls: Record<string, string | undefined> = {}
      apiUrlVars.forEach(varName => {
        if (frontendEnv[varName]) {
          apiUrls[varName] = frontendEnv[varName]
        }
      })

      logger.info('Frontend environment variables configured', {
        port: config.port,
        totalApiUrls: Object.keys(apiUrls).length,
        apiUrls,
        allEnvVars: Object.keys(frontendEnv).filter(key => key.includes('API')).length
      })

      return frontendEnv
    } else {
      // 后端环境变量
      const backendEnv: Record<string, string> = {
        ...baseEnv,
        // 后端特定环境变量
        PORT: config.port.toString(),
        SERVER_PORT: config.port.toString()
      }

      // 移除前端特定的环境变量
      const frontendVars = ['VITE_PORT', 'VITE_DEV_PORT', 'REACT_APP_PORT', 'VUE_APP_PORT']
      frontendVars.forEach(varName => {
        delete backendEnv[varName]
      })

      return backendEnv
    }
  }

  /**
   * 停止全栈项目的所有进程
   */
  async stopFullStack(appId: string): Promise<void> {
    logger.info('Stopping fullstack application', { appId })

    const group = this.fullStackGroups.get(appId)
    if (!group) {
      logger.warn('Fullstack group not found', { appId })
      return
    }

    const stopPromises: Promise<void>[] = []

    // 停止前端进程
    if (group.frontendProcess) {
      stopPromises.push(this.stop(`${appId}-frontend`))
    }

    // 停止后端进程
    if (group.backendProcess) {
      stopPromises.push(this.stop(`${appId}-backend`))
    }

    // 等待所有进程停止
    await Promise.all(stopPromises)

    // 恢复被修改的配置文件
    await this.restoreModifiedConfig(appId)

    // 清理进程组记录
    this.fullStackGroups.delete(appId)

    logger.info('Fullstack application stopped', { appId })
  }

  /**
   * 为全栈项目配置前端代理（临时修改vite.config）
   */
  private async configureFullStackProxyIfNeeded(
    appId: string,
    frontendConfig: import('./types').ProcessConfiguration,
    backendPort: number,
    processId: string
  ): Promise<void> {
    logger.info('🔧 开始配置全栈项目代理', {
      appId,
      processId,
      backendPort,
      frontendWorkingDir: frontendConfig.workingDirectory
    })

    try {
      // 查找vite.config文件
      const workingDir = frontendConfig.workingDirectory
      const viteConfigPath = this.findViteConfig(workingDir)
      
      if (!viteConfigPath) {
        logger.warn('⚠️ 未找到vite.config文件，跳过代理配置', { 
          processId,
          workingDir,
          searchedFiles: ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']
        })
        return
      }

      logger.info('✅ 找到vite.config文件', { processId, viteConfigPath })

      // 读取配置文件
      const configContent = readFileSync(viteConfigPath, 'utf8')
      logger.info('📄 成功读取vite.config文件', { 
        processId, 
        contentLength: configContent.length 
      })
      
      // 检查是否有硬编码的代理配置
      const proxyRegex = /proxy:\s*{[^}]*target:\s*['"]http:\/\/localhost:(\d+)['"]/
      const match = configContent.match(proxyRegex)
      
      if (!match) {
        logger.warn('⚠️ 未找到硬编码的代理配置', { 
          processId,
          hint: '配置文件中可能没有proxy设置或格式不匹配'
        })
        return
      }

      const hardcodedPort = match[1]
      
      logger.info('🔍 发现代理配置', {
        processId,
        hardcodedPort,
        allocatedBackendPort: backendPort,
        needsUpdate: hardcodedPort !== backendPort.toString()
      })

      // 如果端口不同，需要临时修改配置
      if (hardcodedPort !== backendPort.toString()) {
        logger.info('🔄 开始临时更新vite.config代理目标', {
          processId,
          from: `localhost:${hardcodedPort}`,
          to: `localhost:${backendPort}`,
          configPath: viteConfigPath
        })

        // 备份原始配置
        const backupPath = `${viteConfigPath}.portal-backup`
        if (!existsSync(backupPath)) {
          logger.info('📦 创建配置备份...', { backupPath })
          await copyFile(viteConfigPath, backupPath)
          logger.info('✅ 配置已备份', { backupPath })
        } else {
          logger.info('ℹ️ 备份文件已存在，跳过备份', { backupPath })
        }

        // 替换端口
        const updatedContent = configContent.replace(
          /target:\s*['"]http:\/\/localhost:\d+['"]/g,
          `target: 'http://localhost:${backendPort}'`
        )

        logger.info('✏️ 写入修改后的配置...', { 
          processId,
          originalLength: configContent.length,
          updatedLength: updatedContent.length
        })

        // 写入修改后的配置
        await writeFile(viteConfigPath, updatedContent, 'utf8')
        
        logger.info('✅ Vite config代理已临时更新', {
          processId,
          backendPort,
          configPath: viteConfigPath,
          from: hardcodedPort,
          to: backendPort
        })

        // 记录需要恢复的配置
        if (!this.modifiedConfigs) {
          this.modifiedConfigs = new Map()
        }
        this.modifiedConfigs.set(appId, {
          configPath: viteConfigPath,
          backupPath,
          originalContent: configContent
        })
        
        logger.info('📝 已记录配置修改信息，停止时将自动恢复', { 
          appId,
          totalModified: this.modifiedConfigs.size
        })
      } else {
        logger.info('✅ 端口已匹配，无需修改配置', {
          processId,
          port: backendPort
        })
      }
    } catch (error) {
      logger.error('❌ 配置全栈代理失败', {
        processId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      // 不抛出错误，让应用继续启动
    }
  }

  /**
   * 查找vite配置文件
   */
  private findViteConfig(directory: string): string | null {
    const possibleNames = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']
    for (const name of possibleNames) {
      const configPath = join(directory, name)
      if (existsSync(configPath)) {
        return configPath
      }
    }
    return null
  }

  /**
   * 恢复被修改的配置文件
   */
  private async restoreModifiedConfig(appId: string): Promise<void> {
    if (!this.modifiedConfigs) return
    
    const configInfo = this.modifiedConfigs.get(appId)
    if (!configInfo) return

    try {
      const { configPath, backupPath } = configInfo
      
      if (existsSync(backupPath)) {
        await copyFile(backupPath, configPath)
        await unlink(backupPath)
        logger.info('Vite config restored from backup', {
          appId,
          configPath
        })
      }
      
      this.modifiedConfigs.delete(appId)
    } catch (error) {
      logger.error('Failed to restore vite config', {
        appId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * 获取全栈项目状态
   */
  async getFullStackStatus(appId: string): Promise<import('./types').FullStackStatus> {
    const group = this.fullStackGroups.get(appId)

    if (!group) {
      return {
        frontendRunning: false,
        backendRunning: false
      }
    }

    const frontendRunning = group.frontendProcess ?
      await this.isRunning(`${appId}-frontend`) : false
    const backendRunning = group.backendProcess ?
      await this.isRunning(`${appId}-backend`) : false

    return {
      frontendRunning,
      backendRunning,
      frontendPort: group.frontendProcess?.port,
      backendPort: group.backendProcess?.port,
      startedAt: group.startedAt
    }
  }

  async stop(appId: string): Promise<void> {
    logger.info('Stopping application process', { id: appId })

    // 检查是否为全栈项目
    if (this.fullStackGroups.has(appId)) {
      await this.stopFullStack(appId)
      return
    }

    const processInfo = this.processes.get(appId)
    if (!processInfo) {
      logger.warn('Process not found for stopping', { appId })
      return
    }

    try {
      const { process: childProcess } = processInfo

      if (childProcess && !childProcess.killed) {
        // 优雅关闭流程
        logger.info('Sending SIGTERM to process', { appId, pid: childProcess.pid })
        childProcess.kill('SIGTERM')

        // 等待进程退出，超时后强制杀死
        const gracefulTimeout = setTimeout(() => {
          if (!childProcess.killed) {
            logger.warn('Force killing process after graceful timeout', { appId, pid: childProcess.pid })
            childProcess.kill('SIGKILL')
          }
        }, 10000) // 10秒优雅关闭时间

        // 等待进程退出
        await new Promise<void>((resolve) => {
          childProcess.once('exit', () => {
            clearTimeout(gracefulTimeout)
            resolve()
          })
        })
      }

      this.processes.delete(appId)
      logger.info('Application process stopped successfully', { id: appId })

    } catch (error) {
      logger.error('Error stopping application process', {
        id: appId,
        error: error instanceof Error ? error.message : String(error)
      })
      // 即使出错也要清理进程记录
      this.processes.delete(appId)
      throw error
    }
  }

  async isRunning(appId: string): Promise<boolean> {
    const processInfo = this.processes.get(appId)
    if (!processInfo) {
      return false
    }

    const { process: childProcess } = processInfo
    return childProcess && !childProcess.killed && childProcess.exitCode === null
  }

  // 获取进程信息
  getProcessInfo(appId: string): ProcessInfo | undefined {
    return this.processes.get(appId)
  }



  /**
   * 为单进程应用构建环境变量
   */
  private buildSingleProcessEnvironmentVariables(
    app: Application,
    cmdEnv: Record<string, string>
  ): Record<string, string> {
    const techStack = app.techStack.name.toLowerCase()
    const baseEnv = {
      ...process.env,
      ...cmdEnv,
      NODE_ENV: process.env.NODE_ENV || 'development',
      PORT: app.network.primaryPort.toString()
    }

    // 根据技术栈类型设置特定环境变量
    if (this.isFrontendStack(techStack)) {
      logger.info('Setting frontend-specific environment variables', { 
        appId: app.id, 
        techStack,
        port: app.network.primaryPort 
      })
      
      return {
        ...baseEnv,
        // 前端特定环境变量
        VITE_PORT: app.network.primaryPort.toString(),
        VITE_DEV_PORT: app.network.primaryPort.toString(),
        REACT_APP_PORT: app.network.primaryPort.toString(),
        VUE_APP_PORT: app.network.primaryPort.toString(),
        // 为 Next.js 设置特殊端口
        ...(techStack.includes('next') && {
          NEXT_PORT: app.network.primaryPort.toString()
        })
      }
    } else if (this.isBackendStack(techStack)) {
      logger.info('Setting backend-specific environment variables', { 
        appId: app.id, 
        techStack,
        port: app.network.primaryPort 
      })
      
      const backendEnv: Record<string, string> = {
        ...baseEnv,
        // 后端通用环境变量 - 修复：使用标准的 PORT 变量
        PORT: app.network.primaryPort.toString(),           // ✅ 标准端口变量
        SERVER_PORT: app.network.primaryPort.toString(),    // ✅ 备用端口变量
        HOST: '0.0.0.0',                                     // ✅ 绑定所有接口
        NODE_ENV: process.env.NODE_ENV || 'development'
      }

      // ✅ 修复：正确清理前端环境变量（使用 delete 而不是 undefined）
      const frontendVars = ['VITE_PORT', 'VITE_DEV_PORT', 'REACT_APP_PORT', 'VUE_APP_PORT', 'NEXT_PORT', 'NUXT_PORT']
      frontendVars.forEach(varName => {
        delete backendEnv[varName]
      })
      
      logger.debug('Backend environment variables configured', {
        appId: app.id,
        port: app.network.primaryPort,
        envVars: Object.keys(backendEnv).filter(key => key.toLowerCase().includes('port')),
        cleanedFrontendVars: frontendVars.length
      })
      
      return backendEnv
    } else {
      // 未知或混合技术栈，使用基本配置
      logger.info('Setting generic environment variables', { 
        appId: app.id, 
        techStack,
        port: app.network.primaryPort 
      })
      
      return baseEnv
    }
  }

  /**
   * 判断是否为前端技术栈
   */
  private isFrontendStack(techStack: string): boolean {
    const frontendIndicators = [
      'vue', 'react', 'angular', 'svelte', 
      'vite', 'webpack', 'next', 'nuxt',
      'gatsby', 'create-react-app'
    ]
    
    return frontendIndicators.some(indicator => 
      techStack.includes(indicator)
    )
  }

  /**
   * 检查脚本是否支持端口参数 - 第四阶段新增
   */
  private scriptSupportsPortParam(script: string): boolean {
    const portSupportingTools = [
      'vite', 'webpack-dev-server', 'ng serve', 'nuxt',
      'vue-cli-service', 'react-scripts', 'next dev',
      'svelte-kit', 'parcel', 'snowpack'
    ]
    
    const lowerScript = script.toLowerCase()
    const hasSupport = portSupportingTools.some(tool => lowerScript.includes(tool))
    
    logger.debug('Script port parameter support check', {
      script: script,
      hasSupport: hasSupport,
      matchedTools: portSupportingTools.filter(tool => lowerScript.includes(tool))
    })
    
    return hasSupport
  }

  /**
   * 判断是否为后端技术栈 - 第二阶段增强版
   */
  private isBackendStack(techStack: string): boolean {
    const backendIndicators = [
      // Node.js 相关
      'express', 'fastify', 'koa', 'hapi',
      'nestjs', 'nodejs', 'node.js', 'node',
      // 其他后端框架标识
      'server', 'api', 'backend',
      // 特定的依赖特征
      'body-parser', 'cors', 'helmet',
      'prisma', 'sequelize', 'mongoose'
    ]
    
    const lowerTechStack = techStack.toLowerCase()
    const isBackend = backendIndicators.some(indicator => 
      lowerTechStack.includes(indicator.toLowerCase())
    )
    
    // 记录技术栈判断结果用于调试
    logger.debug('Backend stack detection', {
      techStack: techStack,
      isBackend: isBackend,
      matchedIndicators: backendIndicators.filter(indicator => 
        lowerTechStack.includes(indicator.toLowerCase())
      )
    })
    
    return isBackend
  }

  /**
   * 根据应用配置生成启动命令
   */
  private async getStartCommand(app: Application): Promise<{
    command: string
    args: string[]
    env: Record<string, string>
    workingDirectory?: string
  }> {
    const techStack = app.techStack.name.toLowerCase()
    const isWindows = platform() === 'win32'

    // 检查是否为全栈项目（有frontend和backend子目录）
    const frontendDir = join(app.directory, 'frontend')
    const backendDir = join(app.directory, 'backend')
    const isFullStackProject = existsSync(frontendDir) && existsSync(backendDir)

    // 确定工作目录和package.json路径
    let workingDirectory = app.directory
    let packageJsonPath = join(app.directory, 'package.json')

    if (isFullStackProject) {
      // 对于全栈项目，启动前端部分
      workingDirectory = frontendDir
      packageJsonPath = join(frontendDir, 'package.json')
      logger.info('Detected full-stack project, using frontend directory', {
        appId: app.id,
        frontendDir,
        backendDir
      })
    }

    // 检查package.json是否存在
    let packageJson: any = {}

    if (existsSync(packageJsonPath)) {
      try {
        packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      } catch (error) {
        logger.warn('Failed to parse package.json', { appId: app.id, error })
      }
    }

    const scripts = packageJson.scripts || {}
    let command: string
    let args: string[] = []
    const env: Record<string, string> = {}

    // 根据技术栈确定启动命令
    if (techStack.includes('next')) {
      // Next.js项目 - 第六阶段优化
      const port = app.network.primaryPort.toString()
      
      if (scripts.dev) {
        command = isWindows ? 'npm.cmd' : 'npm'
        args = ['run', 'dev']
      } else {
        command = isWindows ? 'npx.cmd' : 'npx'
        args = ['next', 'dev']
      }
      
      // ✅ Next.js 端口配置（环境变量方式）
      env.NEXT_PORT = port
      env.PORT = port  // 备用端口变量
      
      logger.info('Next.js port configuration applied', {
        appId: app.id,
        port: port,
        command: command,
        args: args.join(' '),
        envVars: ['NEXT_PORT', 'PORT'],
        note: 'Next.js uses NEXT_PORT environment variable'
      })
    } else if (techStack.includes('vue') || techStack.includes('vite')) {
      // Vue/Vite项目 - 添加端口和host参数以支持局域网访问
      const port = app.network.primaryPort.toString()

      if (scripts.dev) {
        command = isWindows ? 'npm.cmd' : 'npm'
        args = ['run', 'dev', '--', '--port', port, '--host', '0.0.0.0']  // ✅ 添加端口和host参数
      } else if (scripts.serve) {
        command = isWindows ? 'npm.cmd' : 'npm'
        args = ['run', 'serve', '--', '--port', port, '--host', '0.0.0.0']  // ✅ 添加端口和host参数
      } else {
        command = isWindows ? 'npx.cmd' : 'npx'
        args = ['vite', 'dev', '--port', port, '--host', '0.0.0.0']  // ✅ 直接添加端口和host参数
      }

      // ✅ 环境变量作为备用方案
      env.VITE_PORT = port
      env.PORT = port

      logger.info('Vue/Vite port and host configuration applied (LAN access enabled)', {
        appId: app.id,
        port: port,
        host: '0.0.0.0',
        command: command,
        args: args.join(' '),
        hasPortInArgs: args.includes('--port'),
        hasHostInArgs: args.includes('--host'),
        envVars: ['VITE_PORT', 'PORT'],
        note: 'Application is now accessible from LAN'
      })
    } else if (techStack.includes('react')) {
      // React项目 - 第三阶段优化
      const port = app.network.primaryPort.toString()
      
      if (scripts.start) {
        command = isWindows ? 'npm.cmd' : 'npm'
        args = ['start']
      } else if (scripts.dev) {
        command = isWindows ? 'npm.cmd' : 'npm'
        args = ['run', 'dev']
      } else {
        command = isWindows ? 'npx.cmd' : 'npx'
        args = ['react-scripts', 'start']
      }
      
      // ✅ React CRA 使用 PORT 环境变量
      env.PORT = port
      env.REACT_APP_PORT = port  // 用于应用内访问
      
      logger.info('React port configuration applied', {
        appId: app.id,
        port: port,
        command: command,
        args: args.join(' '),
        envVars: ['PORT', 'REACT_APP_PORT']
      })
    } else if (techStack.includes('angular')) {
      // Angular项目 - 第四阶段修复：添加完整端口配置
      const port = app.network.primaryPort.toString()
      
      if (scripts.start) {
        command = isWindows ? 'npm.cmd' : 'npm'
        args = ['start', '--', '--port', port]  // ✅ 添加端口参数
        logger.info('Using npm start for Angular with port parameter', {
          appId: app.id,
          port: port,
          startScript: scripts.start
        })
      } else {
        command = isWindows ? 'npx.cmd' : 'npx'
        args = ['ng', 'serve', '--port', port]  // ✅ 直接使用ng命令
        logger.info('Using ng serve for Angular with port parameter', {
          appId: app.id,
          port: port
        })
      }
      
      // ✅ Angular 环境变量设置
      env.PORT = port
      env.NG_PORT = port  // Angular特定环境变量
      
      logger.info('Angular port configuration applied', {
        appId: app.id,
        port: port,
        command: command,
        args: args.join(' '),
        hasPortInArgs: args.includes('--port'),
        envVars: ['PORT', 'NG_PORT'],
        startMethod: scripts.start ? 'npm-start' : 'ng-serve'
      })
    } else if (techStack.includes('express') || techStack.includes('node')) {
      // Node.js/Express项目 - 第四阶段优化
      const port = app.network.primaryPort.toString()
      
      if (scripts.dev) {
        command = isWindows ? 'npm.cmd' : 'npm'
        args = ['run', 'dev']
      } else if (scripts.start) {
        command = isWindows ? 'npm.cmd' : 'npm'
        args = ['start']
      } else {
        // 尝试找到入口文件
        const entryFile = packageJson.main || 'index.js'
        command = 'node'
        args = [entryFile]
      }
      
      // ✅ Express/Node.js 标准环境变量
      env.PORT = port
      env.HOST = '0.0.0.0'  // 绑定所有网络接口
      
      logger.info('Express/Node.js port configuration applied', {
        appId: app.id,
        port: port,
        command: command,
        args: args.join(' '),
        envVars: ['PORT', 'HOST'],
        entryFile: packageJson.main || 'index.js'
      })
    } else {
      // 默认启动命令 - 第四阶段优化：智能端口处理
      const port = app.network.primaryPort.toString()
      
      if (scripts.dev) {
        command = isWindows ? 'npm.cmd' : 'npm'
        args = ['run', 'dev']
        
        // ✅ 尝试为开发脚本添加端口参数（如果支持）
        if (this.scriptSupportsPortParam(scripts.dev)) {
          args.push('--', '--port', port)
          logger.info('Added port parameter to dev script', {
            appId: app.id,
            port: port,
            script: scripts.dev
          })
        }
      } else if (scripts.start) {
        command = isWindows ? 'npm.cmd' : 'npm'
        args = ['start']
      } else {
        command = isWindows ? 'npm.cmd' : 'npm'
        args = ['start']
      }
      
      // ✅ 通用环境变量设置
      env.PORT = port
      
      logger.info('Default port configuration applied', {
        appId: app.id,
        techStack: app.techStack.name,
        port: port,
        command: command,
        args: args.join(' '),
        hasPortParam: args.includes('--port'),
        envVars: ['PORT'],
        detectedAsUnknown: true
      })
    }

    // 增强的端口配置日志
    logger.info('Generated startup command with enhanced port configuration', {
      appId: app.id,
      appName: app.name,
      techStack: app.techStack.name,
      targetPort: app.network.primaryPort,
      command: command,
      args: args.join(' '),
      workingDirectory: workingDirectory || app.directory,
      envPortVars: Object.keys(env).filter(key => key.toLowerCase().includes('port')),
      envVarsCount: Object.keys(env).length,
      hasPortInArgs: args.some(arg => arg === '--port' || arg.includes('port')),
      fullCommand: `${command} ${args.join(' ')}`
    })

    // 显示完整的环境变量（仅端口相关）
    const portEnvVars = Object.entries(env).filter(([key]) => key.toLowerCase().includes('port'))
    if (portEnvVars.length > 0) {
      logger.info('Port-related environment variables', {
        appId: app.id,
        portVars: Object.fromEntries(portEnvVars)
      })
    }

    return { command, args, env, workingDirectory }
  }

  /**
   * 设置进程事件监听器
   */
  private setupProcessListeners(appId: string, childProcess: ChildProcess, processInfo: ProcessInfo): void {
    // 获取应用信息（用于日志）
    const appName = processInfo.appName || 'Unknown App'

    // 输出日志监听
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        const message = data.toString().trim()
        const logLine = `[STDOUT] ${new Date().toISOString()}: ${message}`
        this.addLog(processInfo, logLine)
        logger.debug('Process stdout', { appId, data: message })

        // 实时推送到 WebSocket
        this.broadcastLog(appId, appName, 'info', message, 'application')
      })
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        const message = data.toString().trim()
        const logLine = `[STDERR] ${new Date().toISOString()}: ${message}`
        this.addLog(processInfo, logLine)
        logger.debug('Process stderr', { appId, data: message })

        // 实时推送到 WebSocket（stderr 通常是错误或警告）
        this.broadcastLog(appId, appName, 'error', message, 'application')
      })
    }

    // 进程退出监听
    childProcess.on('exit', (code, signal) => {
      logger.info('Process exited', { appId, code, signal, pid: childProcess.pid })
      const message = `Process exited with code ${code}, signal ${signal}`
      const logLine = `[EXIT] ${new Date().toISOString()}: ${message}`
      this.addLog(processInfo, logLine)

      // 推送退出日志
      this.broadcastLog(appId, appName, 'warn', message, 'system')
    })

    // 进程错误监听
    childProcess.on('error', (error) => {
      logger.error('Process error', { appId, error: error.message, pid: childProcess.pid })
      const logLine = `[ERROR] ${new Date().toISOString()}: ${error.message}`
      this.addLog(processInfo, logLine)

      // 推送错误日志
      this.broadcastLog(appId, appName, 'error', error.message, 'system')
    })

    // 进程启动成功监听
    childProcess.on('spawn', () => {
      logger.info('Process spawned successfully', { appId, pid: childProcess.pid })
      const message = `Process spawned with PID ${childProcess.pid}`
      const logLine = `[SPAWN] ${new Date().toISOString()}: ${message}`
      this.addLog(processInfo, logLine)

      // 推送启动成功日志
      this.broadcastLog(appId, appName, 'info', message, 'system')
    })
  }

  /**
   * 添加日志行
   */
  private addLog(processInfo: ProcessInfo, logLine: string): void {
    processInfo.logs.push(logLine)

    // 保持日志数量在限制内
    if (processInfo.logs.length > this.maxLogLines) {
      processInfo.logs = processInfo.logs.slice(-this.maxLogLines)
    }
  }

  /**
   * 通过 WebSocket 广播日志
   */
  private broadcastLog(
    appId: string,
    appName: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    source: string
  ): void {
    if (!this.wsService || !this.wsService.broadcastLog) {
      return
    }

    try {
      // 生成日志ID
      const logId = `${appId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      // 构造日志对象
      const logUpdate = {
        id: logId,
        timestamp: new Date().toISOString(),
        level,
        message,
        source,
        appId,
        appName
      }

      // 通过 WebSocket 广播
      this.wsService.broadcastLog(logUpdate)
    } catch (error) {
      logger.error('Failed to broadcast log via WebSocket', {
        appId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * 获取进程日志
   */
  getProcessLogs(
    appId: string,
    lines?: number,
    target: 'all' | 'frontend' | 'backend' = 'all'
  ): string[] {
    const safeLines = lines && lines > 0 ? Math.floor(lines) : undefined
    const normalizedTarget =
      target === 'frontend' || target === 'backend' || target === 'all'
        ? target
        : 'all'

    const sliceLogs = (entries: string[]): string[] => {
      if (!safeLines) {
        return entries
      }
      return entries.slice(-safeLines)
    }

    const resolveProcessLogs = (processId: string): string[] => {
      const info = this.processes.get(processId)
      return info?.logs || []
    }

    const extractTimestamp = (line: string): number => {
      const match = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/)
      if (!match) return 0
      const time = new Date(match[0]).getTime()
      return Number.isFinite(time) ? time : 0
    }

    const formatWithSource = (entries: string[], source: 'frontend' | 'backend'): string[] => {
      return entries.map(line => `[${source.toUpperCase()}] ${line}`)
    }

    if (normalizedTarget === 'frontend') {
      const frontendLogs = resolveProcessLogs(`${appId}-frontend`)
      if (frontendLogs.length > 0) {
        return sliceLogs(frontendLogs)
      }
      return sliceLogs(resolveProcessLogs(appId))
    }

    if (normalizedTarget === 'backend') {
      const backendLogs = resolveProcessLogs(`${appId}-backend`)
      if (backendLogs.length > 0) {
        return sliceLogs(backendLogs)
      }
      return sliceLogs(resolveProcessLogs(appId))
    }

    const frontendLogs = resolveProcessLogs(`${appId}-frontend`)
    const backendLogs = resolveProcessLogs(`${appId}-backend`)
    if (frontendLogs.length > 0 || backendLogs.length > 0) {
      const mergedLogs = [
        ...formatWithSource(frontendLogs, 'frontend'),
        ...formatWithSource(backendLogs, 'backend')
      ].sort((a, b) => extractTimestamp(a) - extractTimestamp(b))

      return sliceLogs(mergedLogs)
    }

    return sliceLogs(resolveProcessLogs(appId))
  }

  /**
   * 获取所有运行中的进程
   */
  getRunningProcesses(): Map<string, ProcessInfo> {
    const runningProcesses = new Map<string, ProcessInfo>()

    for (const [appId, processInfo] of this.processes.entries()) {
      if (processInfo.process && !processInfo.process.killed && processInfo.process.exitCode === null) {
        runningProcesses.set(appId, processInfo)
      }
    }

    return runningProcesses
  }

  /**
   * 清理已退出的进程
   */
  cleanupExitedProcesses(): void {
    const toDelete: string[] = []

    for (const [appId, processInfo] of this.processes.entries()) {
      if (!processInfo.process || processInfo.process.killed || processInfo.process.exitCode !== null) {
        toDelete.push(appId)
      }
    }

    toDelete.forEach(appId => {
      logger.info('Cleaning up exited process', { appId })
      this.processes.delete(appId)
    })
  }

  /**
   * 获取进程统计信息
   */
  getProcessStats(): {
    total: number
    running: number
    stopped: number
    uptime: Record<string, number>
  } {
    const stats = {
      total: this.processes.size,
      running: 0,
      stopped: 0,
      uptime: {} as Record<string, number>
    }

    for (const [appId, processInfo] of this.processes.entries()) {
      if (processInfo.process && !processInfo.process.killed && processInfo.process.exitCode === null) {
        stats.running++
        stats.uptime[appId] = Date.now() - processInfo.startedAt.getTime()
      } else {
        stats.stopped++
      }
    }

    return stats
  }

  /**
   * 验证端口是否在指定时间内开始监听
   * 这是第一阶段新增的端口验证工具
   */
  async validatePortAfterStart(
    app: Application, 
    childProcess: ChildProcess, 
    timeoutMs: number = 15000
  ): Promise<boolean> {
    const port = app.network.primaryPort
    const startTime = Date.now()
    
    logger.info('Starting port validation', { 
      appId: app.id, 
      port, 
      timeoutMs,
      processId: childProcess.pid 
    })
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        // 检查端口是否被监听
        const isListening = await this.isPortListening(port)
        if (isListening) {
          const elapsedMs = Date.now() - startTime
          logger.info('Port validation successful', { 
            appId: app.id, 
            port,
            elapsedMs,
            status: 'listening'
          })
          return true
        }
        
        // 检查进程是否还在运行
        if (childProcess.killed || childProcess.exitCode !== null) {
          logger.error('Process exited before port became available', { 
            appId: app.id, 
            port,
            exitCode: childProcess.exitCode,
            killed: childProcess.killed
          })
          return false
        }
        
        // 等待500ms后重试
        await new Promise(resolve => setTimeout(resolve, 500))
        
      } catch (error) {
        logger.warn('Port validation check failed', { 
          appId: app.id, 
          port, 
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    
    logger.error('Port validation timed out', { 
      appId: app.id, 
      port, 
      timeoutMs,
      status: 'timeout'
    })
    return false
  }

  /**
   * 检查指定端口是否正在监听
   * 使用TCP连接测试端口可用性 - 修复ES模块兼容性
   */
  private async isPortListening(port: number): Promise<boolean> {
    return new Promise(async (resolve) => {
      try {
        // ✅ 修复：使用动态导入替代require
        const { default: net } = await import('net')
        const client = new net.Socket()
        
        const timeout = setTimeout(() => {
          client.destroy()
          resolve(false) // 超时认为端口未监听
        }, 1000)
        
        client.connect(port, '127.0.0.1', () => {
          clearTimeout(timeout)
          client.destroy()
          resolve(true) // 连接成功，端口正在监听
        })
        
        client.on('error', () => {
          clearTimeout(timeout)
          client.destroy()
          resolve(false) // 连接失败，端口未监听
        })
        
      } catch (importError) {
        logger.error('Failed to import net module', { 
          port, 
          error: importError instanceof Error ? importError.message : String(importError)
        })
        resolve(false)
      }
    })
  }

  /**
   * 获取端口连接状态详情（调试用）
   */
  async getPortConnectionInfo(port: number): Promise<{
    port: number
    isListening: boolean
    connectionTime: number
    status: string
  }> {
    const startTime = Date.now()
    const isListening = await this.isPortListening(port)
    const connectionTime = Date.now() - startTime
    
    return {
      port,
      isListening,
      connectionTime,
      status: isListening ? 'listening' : 'closed'
    }
  }

  /**
   * 停止健康检查
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = undefined
      logger.info('Process health check stopped')
    }
  }

  /**
   * 自动重启应用（可选功能）
   */
  async autoRestart(appId: string): Promise<boolean> {
    if (!this.applicationRepository) {
      logger.warn('Cannot auto-restart: ApplicationRepository not available', { appId })
      return false
    }

    try {
      const app = await this.applicationRepository.findById(appId)
      if (!app) {
        logger.warn('Cannot auto-restart: Application not found', { appId })
        return false
      }

      logger.info('Attempting auto-restart', { appId, name: app.name })

      // 清理旧进程记录
      this.processes.delete(appId)

      // 重新启动应用
      await this.start(app)
      await this.applicationRepository.updateState(appId, 'running')

      logger.info('Auto-restart successful', { appId, name: app.name })
      return true
    } catch (error) {
      logger.error('Auto-restart failed', {
        appId,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }
}
