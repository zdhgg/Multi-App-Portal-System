<template>
  <el-dialog
    v-model="visible"
    title="PM2 问题诊断与修复"
    width="600px"
    :close-on-click-modal="false"
  >
    <div class="pm2-fix-dialog">
      <!-- 错误信息 -->
      <el-alert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        :closable="false"
        show-icon
        class="mb-4"
      />

      <!-- 诊断结果 -->
      <div v-if="diagnosis" class="diagnosis-section">
        <h3 class="section-title">
          <el-icon><Warning /></el-icon>
          诊断结果
        </h3>
        
        <div class="diagnosis-info">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="操作系统">
              {{ diagnosis.platform }}
              <el-tag v-if="diagnosis.isWindows" type="warning" size="small">Windows</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="PM2 状态">
              <el-tag :type="diagnosis.pm2Enabled ? 'success' : 'danger'" size="small">
                {{ diagnosis.pm2Enabled ? '已启用' : '未启用' }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- 问题列表 -->
        <div v-if="(diagnosis.issues?.length || 0) > 0" class="issues-list mt-4">
          <h4 class="subsection-title">发现的问题：</h4>
          <el-timeline>
            <el-timeline-item
              v-for="(issue, index) in (diagnosis.issues || [])"
              :key="index"
              :type="getSeverityType(issue.severity)"
              :icon="getSeverityIcon(issue.severity)"
            >
              <div class="issue-item">
                <div class="issue-header">
                  <el-tag :type="getSeverityType(issue.severity)" size="small">
                    {{ getSeverityLabel(issue.severity) }}
                  </el-tag>
                  <span class="issue-type">{{ issue.type }}</span>
                </div>
                <p class="issue-message">{{ issue.message }}</p>
                <el-alert
                  :title="'解决方案: ' + issue.solution"
                  type="info"
                  :closable="false"
                  class="mt-2"
                />
              </div>
            </el-timeline-item>
          </el-timeline>
        </div>

        <!-- 自动修复按钮 -->
        <div v-if="Boolean(diagnosis.canAutoFix)" class="fix-actions mt-4">
          <el-button
            type="primary"
            :loading="fixing"
            :disabled="fixing"
            @click="handleAutoFix"
          >
            <el-icon><Tools /></el-icon>
            自动修复
          </el-button>
          <el-button @click="handleDiagnose">
            <el-icon><Refresh /></el-icon>
            重新诊断
          </el-button>
        </div>

        <!-- 在诊断阶段就显示手动修复选项（如果检测到 PM2 问题） -->
        <div v-if="Boolean(diagnosis.canAutoFix) && !fixResult" class="manual-fix-section mt-4">
          <el-alert
            title="如果自动修复失败，可以使用以下手动修复方案"
            type="info"
            :closable="false"
            class="mb-3"
          >
            <p class="mt-2">
              <strong>说明：</strong>由于 Windows 安全机制，后端服务无法自动提升到管理员权限。如果自动修复失败，请使用以下方案。
            </p>
          </el-alert>

          <div class="manual-fix-options">
            <div class="fix-option highlight-option">
              <div class="option-header">
                <el-tag type="danger" size="small">最简单</el-tag>
                <span class="option-title">方案 1：使用修复脚本（推荐）</span>
              </div>
              <p class="option-description">
                下载修复脚本，右键选择"以管理员身份运行"即可自动修复
              </p>
              <div class="command-box">
                <div class="script-info">
                  <el-icon class="script-icon"><Document /></el-icon>
                  <span class="script-name">fix-pm2-admin.bat</span>
                  <span class="script-desc">（自动检测权限并修复 PM2）</span>
                </div>
                <el-button
                  type="danger"
                  size="default"
                  @click="downloadFixScript"
                >
                  <el-icon><Download /></el-icon>
                  下载修复脚本
                </el-button>
              </div>
              <div class="usage-steps mt-2">
                <p class="step-title">使用步骤：</p>
                <ol>
                  <li>点击上方按钮下载脚本</li>
                  <li>找到下载的 <code>fix-pm2-admin.bat</code> 文件</li>
                  <li>右键点击，选择 <strong>"以管理员身份运行"</strong></li>
                  <li>等待脚本执行完成</li>
                  <li>返回此界面，点击"重新诊断"</li>
                </ol>
              </div>
            </div>

            <div class="fix-option mt-3">
              <div class="option-header">
                <el-tag type="primary" size="small">快速</el-tag>
                <span class="option-title">方案 2：一键复制命令</span>
              </div>
              <p class="option-description">
                复制以下命令，然后粘贴到<strong>以管理员身份运行的 PowerShell</strong> 中执行
              </p>
              <div class="command-box">
                <code class="command-text">pm2 kill; pm2 ping</code>
                <el-button
                  type="primary"
                  size="small"
                  @click="copyCommand"
                >
                  <el-icon><CopyDocument /></el-icon>
                  复制命令
                </el-button>
              </div>
            </div>

            <div class="fix-option mt-3">
              <div class="option-header">
                <el-tag type="info" size="small">备选</el-tag>
                <span class="option-title">方案 3：手动输入</span>
              </div>
              <p class="option-description">
                以管理员身份打开 PowerShell，然后依次运行：
              </p>
              <ol class="manual-steps">
                <li><code>pm2 kill</code></li>
                <li><code>pm2 ping</code></li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <!-- 修复进度 -->
      <div v-if="fixResult" class="fix-result-section mt-4">
        <h3 class="section-title">
          <el-icon><Tools /></el-icon>
          修复进度
        </h3>

        <!-- 详细步骤列表 - 添加滚动容器 -->
        <div class="fix-steps-container mb-4">
          <el-scrollbar max-height="300px">
            <div class="fix-steps-detail">
              <el-timeline>
                <el-timeline-item
                  v-for="(step, index) in (fixResult.steps || [])"
                  :key="index"
                  :timestamp="`步骤 ${index + 1}`"
                  placement="top"
                  :type="getStepType(step)"
                  :icon="getStepIcon(step)"
                >
                  <div class="step-content" :class="getStepClass(step)">
                    <template v-if="isLongText(step)">
                      <!-- 长文本使用折叠显示 -->
                      <el-collapse v-model="expandedSteps" accordion>
                        <el-collapse-item :name="`step-${index}`">
                          <template #title>
                            <span class="step-preview">{{ getStepPreview(step) }}</span>
                          </template>
                          <pre class="step-full-text">{{ step }}</pre>
                        </el-collapse-item>
                      </el-collapse>
                    </template>
                    <template v-else>
                      {{ step }}
                    </template>
                  </div>
                </el-timeline-item>
              </el-timeline>
            </div>
          </el-scrollbar>
        </div>

        <el-alert
          :title="fixResult.message"
          :type="fixResult.success ? 'success' : 'error'"
          :closable="false"
          show-icon
          class="mt-4"
        >
          <template v-if="!fixResult.success && fixResult.message.includes('管理员权限')">
            <p class="mt-2">
              <strong>原因：</strong>后端 API 服务没有以管理员权限运行，无法执行 PM2 修复命令。
            </p>
            <p class="mt-2">
              <strong>解决方案：</strong>
            </p>
            <ol class="mt-1">
              <li>使用下方的手动修复方案（推荐）</li>
              <li>或者以管理员身份重启后端服务后再试</li>
            </ol>
          </template>
        </el-alert>

        <div v-if="fixResult.success" class="success-actions mt-4">
          <el-button type="success" @click="handleRetry">
            <el-icon><RefreshRight /></el-icon>
            重试启动应用
          </el-button>
        </div>

        <!-- 如果自动修复失败，提供手动修复选项 -->
        <div v-if="!fixResult.success" class="manual-fix-section mt-4">
          <el-alert
            title="自动修复失败，请尝试手动修复"
            type="warning"
            :closable="false"
            class="mb-3"
          >
            <p class="mt-2">
              <strong>原因：</strong>后端服务运行在普通用户权限下，无法自动提升到管理员权限。这是 Windows 的安全机制。
            </p>
          </el-alert>

          <div class="manual-fix-options">
            <div class="fix-option highlight-option">
              <div class="option-header">
                <el-tag type="danger" size="small">最简单</el-tag>
                <span class="option-title">方案 1：使用修复脚本（推荐）</span>
              </div>
              <p class="option-description">
                下载修复脚本，右键选择"以管理员身份运行"即可自动修复
              </p>

              <!-- 批处理脚本 -->
              <div class="command-box mb-2">
                <div class="script-info">
                  <el-icon class="script-icon"><Document /></el-icon>
                  <span class="script-name">fix-pm2-admin.bat</span>
                  <span class="script-desc">（批处理脚本，兼容性好）</span>
                </div>
                <el-button
                  type="danger"
                  size="default"
                  @click="downloadFixScript"
                >
                  <el-icon><Download /></el-icon>
                  下载 BAT 脚本
                </el-button>
              </div>

              <!-- PowerShell 脚本 -->
              <div class="command-box">
                <div class="script-info">
                  <el-icon class="script-icon"><Document /></el-icon>
                  <span class="script-name">fix-pm2-admin.ps1</span>
                  <span class="script-desc">（PowerShell 脚本，功能更强）</span>
                </div>
                <el-button
                  type="primary"
                  size="default"
                  @click="downloadPowerShellScript"
                >
                  <el-icon><Download /></el-icon>
                  下载 PS1 脚本
                </el-button>
              </div>

              <div class="usage-steps mt-2">
                <p class="step-title">使用步骤：</p>
                <ol>
                  <li>点击上方按钮下载脚本（推荐 BAT 版本，更简单）</li>
                  <li>找到下载的脚本文件</li>
                  <li>
                    <strong>BAT 脚本：</strong>右键点击，选择 <strong>"以管理员身份运行"</strong><br>
                    <strong>PS1 脚本：</strong>右键点击，选择 <strong>"使用 PowerShell 运行"</strong>
                  </li>
                  <li>等待脚本执行完成</li>
                  <li>返回此界面，点击"重试启动应用"</li>
                </ol>
              </div>
            </div>

            <div class="fix-option mt-3">
              <div class="option-header">
                <el-tag type="primary" size="small">快速</el-tag>
                <span class="option-title">方案 2：一键复制命令</span>
              </div>
              <p class="option-description">
                复制以下命令，然后粘贴到<strong>以管理员身份运行的 PowerShell</strong> 中执行
              </p>
              <div class="command-box">
                <code class="command-text">pm2 kill; pm2 ping</code>
                <el-button
                  type="primary"
                  size="small"
                  @click="copyCommand"
                >
                  <el-icon><CopyDocument /></el-icon>
                  复制命令
                </el-button>
              </div>
            </div>

            <div class="fix-option mt-3">
              <div class="option-header">
                <el-tag type="info" size="small">备选</el-tag>
                <span class="option-title">方案 3：手动输入</span>
              </div>
              <p class="option-description">
                以管理员身份打开 PowerShell，然后依次运行：
              </p>
              <ol class="manual-steps">
                <li><code>pm2 kill</code></li>
                <li><code>pm2 ping</code></li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <!-- 备用方案 -->
      <div class="alternative-section mt-4">
        <h3 class="section-title">
          <el-icon><QuestionFilled /></el-icon>
          备用方案
        </h3>
        <el-card shadow="hover">
          <p>如果自动修复失败，您可以尝试以下方案：</p>
          <ol>
            <li>
              <strong>使用直接启动模式：</strong>
              <el-button size="small" type="primary" plain @click="handleDirectStart">
                直接启动应用
              </el-button>
            </li>
            <li>
              <strong>手动修复 PM2：</strong>
              <ul>
                <li>以管理员身份打开 PowerShell</li>
                <li>运行: <code>pm2 kill</code></li>
                <li>运行: <code>pm2 ping</code></li>
              </ul>
            </li>
            <li>
              <strong>临时禁用 PM2：</strong>
              在环境变量中设置 <code>PM2_ENABLED=0</code>
            </li>
          </ol>
        </el-card>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button v-if="!diagnosis" type="primary" :loading="diagnosing" @click="handleDiagnose">
        开始诊断
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Warning, Tools, Refresh, RefreshRight, QuestionFilled, CopyDocument, Download, Document } from '@element-plus/icons-vue'
import { apiService } from '@/services/api'

interface PM2Issue {
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  solution: string
}

interface PM2Diagnosis {
  platform: string
  isWindows: boolean
  pm2Enabled: boolean
  issues: PM2Issue[]
  canAutoFix: boolean
}

interface PM2FixResult {
  success: boolean
  message: string
  steps: string[]
}

interface ApiEnvelope<T> {
  success?: boolean
  data?: T
  message?: string
}

const props = defineProps<{
  modelValue: boolean
  errorMessage?: string
  appId?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'retry'): void
  (e: 'directStart'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const diagnosing = ref(false)
const fixing = ref(false)
const diagnosis = ref<PM2Diagnosis | null>(null)
const fixResult = ref<PM2FixResult | null>(null)
const expandedSteps = ref<string>('')

const unwrapApiData = <T>(payload: T | ApiEnvelope<T>): T => {
  if (payload && typeof payload === 'object' && 'data' in (payload as any)) {
    return ((payload as ApiEnvelope<T>).data ?? ({} as T)) as T
  }
  return payload as T
}

const normalizeDiagnosis = (payload: any): PM2Diagnosis => {
  const source = (payload && typeof payload === 'object') ? payload : {}
  return {
    platform: String(source.platform || ''),
    isWindows: Boolean(source.isWindows),
    pm2Enabled: Boolean(source.pm2Enabled),
    issues: Array.isArray(source.issues) ? source.issues : [],
    canAutoFix: Boolean(source.canAutoFix)
  }
}

const normalizeFixResult = (payload: any): PM2FixResult => {
  const source = (payload && typeof payload === 'object') ? payload : {}
  return {
    success: Boolean(source.success),
    message: String(source.message || ''),
    steps: Array.isArray(source.steps) ? source.steps : []
  }
}

// 判断是否为长文本（超过100个字符）
const isLongText = (text: string): boolean => {
  return text.length > 100
}

// 获取步骤预览文本（前80个字符）
const getStepPreview = (text: string): string => {
  if (text.length <= 80) return text
  return text.substring(0, 80) + '...'
}

// 诊断 PM2 问题
const handleDiagnose = async () => {
  diagnosing.value = true
  fixResult.value = null
  
  try {
    const response = await apiService.post<PM2Diagnosis | ApiEnvelope<PM2Diagnosis>>('/pm2/diagnose', {})
    const diagnosisResult = normalizeDiagnosis(unwrapApiData(response))
    diagnosis.value = diagnosisResult
    
    if (diagnosisResult.issues.length === 0) {
      ElMessage.success('未发现 PM2 问题')
    }
  } catch (error) {
    ElMessage.error('诊断失败: ' + (error instanceof Error ? error.message : '未知错误'))
  } finally {
    diagnosing.value = false
  }
}

// 自动修复
const handleAutoFix = async () => {
  if (!diagnosis.value || diagnosis.value.issues.length === 0) {
    return
  }

  fixing.value = true
  
  try {
    const issueType = diagnosis.value.issues[0].type
    const response = await apiService.post<PM2FixResult | ApiEnvelope<PM2FixResult>>(
      '/pm2/fix',
      { issueType },
      { headers: { 'X-Confirm-Action': (import.meta as any).env?.VITE_PM2_CONFIRM_TOKEN || 'CONFIRM' } }
    )
    const autoFixResult = normalizeFixResult(unwrapApiData(response))
    fixResult.value = autoFixResult
    
    if (autoFixResult.success) {
      ElMessage.success('PM2 修复成功！')
      // 重新诊断
      setTimeout(() => handleDiagnose(), 1000)
    } else {
      ElMessage.warning('修复未完全成功，请查看详细信息')
    }
  } catch (error) {
    ElMessage.error('修复失败: ' + (error instanceof Error ? error.message : '未知错误'))
  } finally {
    fixing.value = false
  }
}

// 复制命令到剪贴板
const copyCommand = async () => {
  const command = 'pm2 kill; pm2 ping'

  try {
    await navigator.clipboard.writeText(command)
    ElMessage.success('命令已复制到剪贴板！请粘贴到管理员 PowerShell 中执行')
  } catch (error) {
    // 降级方案：使用旧的 execCommand 方法
    try {
      const textArea = document.createElement('textarea')
      textArea.value = command
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      ElMessage.success('命令已复制到剪贴板！请粘贴到管理员 PowerShell 中执行')
    } catch (fallbackError) {
      ElMessage.error('复制失败，请手动复制命令')
    }
  }
}

// 重试启动
const handleRetry = () => {
  visible.value = false
  emit('retry')
}

// 直接启动
const handleDirectStart = () => {
  visible.value = false
  emit('directStart')
}

// 下载修复脚本 (批处理版本)
const downloadFixScript = () => {
  const scriptContent = `@echo off
chcp 65001 >nul
echo ========================================
echo    PM2 修复工具 (需要管理员权限)
echo ========================================
echo.

REM 检查是否以管理员身份运行
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ❌ 错误：此脚本需要管理员权限！
    echo.
    echo 请右键点击此文件，选择"以管理员身份运行"
    echo.
    pause
    exit /b 1
)

echo ✅ 已确认管理员权限
echo.

REM 查找 PM2 命令
echo 正在查找 PM2 安装位置...
set PM2_CMD=
where pm2.cmd >nul 2>&1
if %errorLevel% equ 0 (
    set PM2_CMD=pm2.cmd
    echo ✅ 找到 PM2: pm2.cmd
) else (
    where pm2 >nul 2>&1
    if %errorLevel% equ 0 (
        set PM2_CMD=pm2
        echo ✅ 找到 PM2: pm2
    ) else (
        REM 尝试添加常见的 npm 全局路径
        echo ⚠️ PM2 不在 PATH 中，尝试添加常见路径...

        REM 添加用户级 npm 路径
        if exist "%APPDATA%\\npm" (
            set "PATH=%PATH%;%APPDATA%\\npm"
            echo   已添加: %APPDATA%\\npm
        )

        REM 添加全局 npm 路径
        if exist "%ProgramFiles%\\nodejs" (
            set "PATH=%PATH%;%ProgramFiles%\\nodejs"
            echo   已添加: %ProgramFiles%\\nodejs
        )

        REM 再次检查
        where pm2.cmd >nul 2>&1
        if %errorLevel% equ 0 (
            set PM2_CMD=pm2.cmd
            echo ✅ 找到 PM2: pm2.cmd
        ) else (
            where pm2 >nul 2>&1
            if %errorLevel% equ 0 (
                set PM2_CMD=pm2
                echo ✅ 找到 PM2: pm2
            ) else (
                echo.
                echo ❌ 错误：无法找到 PM2 命令！
                echo.
                echo 可能的原因：
                echo   1. PM2 未安装
                echo   2. PM2 安装路径不在系统 PATH 中
                echo.
                echo 解决方案：
                echo   1. 在普通 PowerShell 中运行: npm install -g pm2
                echo   2. 或使用 PowerShell 版本的修复脚本
                echo.
                pause
                exit /b 1
            )
        )
    )
)
echo.

echo 步骤 1/3: 终止 PM2 守护进程...
echo ----------------------------------------
%PM2_CMD% kill
if %errorLevel% equ 0 (
    echo ✅ PM2 守护进程已终止
) else (
    echo ⚠️ PM2 守护进程终止失败，但继续执行...
)
echo.

echo 等待 2 秒...
timeout /t 2 /nobreak >nul
echo.

echo 步骤 2/3: 重新初始化 PM2...
echo ----------------------------------------
%PM2_CMD% ping
if %errorLevel% equ 0 (
    echo ✅ PM2 守护进程已重新启动
) else (
    echo ❌ PM2 重新启动失败
    echo.
    echo 可能的原因：
    echo   1. PM2 未正确安装
    echo   2. 系统环境变量配置问题
    echo   3. 防病毒软件阻止
    echo.
    pause
    exit /b 1
)
echo.

echo 步骤 3/3: 验证 PM2 状态...
echo ----------------------------------------
%PM2_CMD% list
echo.

echo ========================================
echo    ✅ PM2 修复完成！
echo ========================================
echo.
echo 现在您可以：
echo   1. 关闭此窗口
echo   2. 返回应用管理界面
echo   3. 重新尝试启动应用
echo.
pause`

  // 创建 Blob 并下载
  const blob = new Blob([scriptContent], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'fix-pm2-admin.bat'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  ElMessage.success('批处理脚本已下载！请右键选择"以管理员身份运行"')
}

// 下载 PowerShell 版本的修复脚本
const downloadPowerShellScript = () => {
  const scriptContent = `# PM2 修复工具 (PowerShell 版本)
# 需要管理员权限

# 设置控制台编码为 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   PM2 修复工具 (需要管理员权限)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否以管理员身份运行
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ 错误：此脚本需要管理员权限！" -ForegroundColor Red
    Write-Host ""
    Write-Host "请右键点击此文件，选择 '使用 PowerShell 运行'" -ForegroundColor Yellow
    Write-Host "或者在管理员 PowerShell 中运行此脚本" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "按 Enter 键退出"
    exit 1
}

Write-Host "✅ 已确认管理员权限" -ForegroundColor Green
Write-Host ""

# 查找 PM2 命令
Write-Host "正在查找 PM2 安装位置..." -ForegroundColor Yellow

$pm2Command = $null

# 尝试使用 Get-Command 查找
try {
    $pm2Command = Get-Command pm2 -ErrorAction SilentlyContinue
    if ($pm2Command) {
        Write-Host "✅ 找到 PM2: $($pm2Command.Source)" -ForegroundColor Green
    }
} catch {
    # 忽略错误
}

# 如果没找到，尝试添加常见路径
if (-not $pm2Command) {
    Write-Host "⚠️ PM2 不在 PATH 中，尝试添加常见路径..." -ForegroundColor Yellow

    $npmPaths = @(
        "$env:APPDATA\\npm",
        "$env:ProgramFiles\\nodejs",
        "$env:ProgramFiles(x86)\\nodejs",
        "$env:USERPROFILE\\AppData\\Roaming\\npm"
    )

    foreach ($path in $npmPaths) {
        if (Test-Path $path) {
            $env:Path += ";$path"
            Write-Host "  已添加: $path" -ForegroundColor Gray
        }
    }

    # 再次尝试查找
    try {
        $pm2Command = Get-Command pm2 -ErrorAction SilentlyContinue
        if ($pm2Command) {
            Write-Host "✅ 找到 PM2: $($pm2Command.Source)" -ForegroundColor Green
        }
    } catch {
        # 忽略错误
    }
}

# 如果还是没找到，报错退出
if (-not $pm2Command) {
    Write-Host ""
    Write-Host "❌ 错误：无法找到 PM2 命令！" -ForegroundColor Red
    Write-Host ""
    Write-Host "可能的原因：" -ForegroundColor Yellow
    Write-Host "  1. PM2 未安装" -ForegroundColor Gray
    Write-Host "  2. PM2 安装路径不在系统 PATH 中" -ForegroundColor Gray
    Write-Host ""
    Write-Host "解决方案：" -ForegroundColor Yellow
    Write-Host "  1. 在普通 PowerShell 中运行: npm install -g pm2" -ForegroundColor Gray
    Write-Host "  2. 重新打开管理员 PowerShell 并运行此脚本" -ForegroundColor Gray
    Write-Host ""
    Read-Host "按 Enter 键退出"
    exit 1
}

Write-Host ""

# 步骤 1: 终止 PM2 守护进程
Write-Host "步骤 1/3: 终止 PM2 守护进程..." -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Gray

try {
    $result = & pm2 kill 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ PM2 守护进程已终止" -ForegroundColor Green
    } else {
        Write-Host "⚠️ PM2 守护进程终止失败，但继续执行..." -ForegroundColor Yellow
        Write-Host "输出: $result" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️ PM2 kill 执行出错: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "继续执行..." -ForegroundColor Gray
}

Write-Host ""

# 等待 2 秒
Write-Host "等待 2 秒..." -ForegroundColor Gray
Start-Sleep -Seconds 2
Write-Host ""

# 步骤 2: 重新初始化 PM2
Write-Host "步骤 2/3: 重新初始化 PM2..." -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Gray

try {
    $result = & pm2 ping 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ PM2 守护进程已重新启动" -ForegroundColor Green
    } else {
        Write-Host "❌ PM2 重新启动失败" -ForegroundColor Red
        Write-Host ""
        Write-Host "可能的原因：" -ForegroundColor Yellow
        Write-Host "  1. PM2 未正确安装" -ForegroundColor Gray
        Write-Host "  2. 系统环境变量配置问题" -ForegroundColor Gray
        Write-Host "  3. 防病毒软件阻止" -ForegroundColor Gray
        Write-Host ""
        Write-Host "输出: $result" -ForegroundColor Gray
        Write-Host ""
        Read-Host "按 Enter 键退出"
        exit 1
    }
} catch {
    Write-Host "❌ PM2 ping 执行出错: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Read-Host "按 Enter 键退出"
    exit 1
}

Write-Host ""

# 步骤 3: 验证 PM2 状态
Write-Host "步骤 3/3: 验证 PM2 状态..." -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Gray

try {
    & pm2 list
} catch {
    Write-Host "⚠️ 无法显示 PM2 列表: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   ✅ PM2 修复完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "现在您可以：" -ForegroundColor Yellow
Write-Host "  1. 关闭此窗口" -ForegroundColor Gray
Write-Host "  2. 返回应用管理界面" -ForegroundColor Gray
Write-Host "  3. 重新尝试启动应用" -ForegroundColor Gray
Write-Host ""
Read-Host "按 Enter 键退出"`

  // 创建 Blob 并下载
  const blob = new Blob([scriptContent], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'fix-pm2-admin.ps1'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  ElMessage.success('PowerShell 脚本已下载！请右键选择"使用 PowerShell 运行"')
}

// 辅助函数
const getSeverityType = (severity: string) => {
  const map: Record<string, any> = {
    low: 'info',
    medium: 'warning',
    high: 'warning',
    critical: 'danger'
  }
  return map[severity] || 'info'
}

const getSeverityIcon = (severity: string) => {
  return Warning
}

const getSeverityLabel = (severity: string) => {
  const map: Record<string, string> = {
    low: '低',
    medium: '中',
    high: '高',
    critical: '严重'
  }
  return map[severity] || severity
}

// 获取步骤的类型（用于时间线颜色）
const getStepType = (step: string): 'primary' | 'success' | 'warning' | 'danger' | 'info' => {
  if (step.includes('✅') || step.includes('成功')) {
    return 'success'
  }
  if (step.includes('❌') || step.includes('失败')) {
    return 'danger'
  }
  if (step.includes('⚠️') || step.includes('警告') || step.includes('权限')) {
    return 'warning'
  }
  if (step.includes('错误:') || step.includes('出错')) {
    return 'danger'
  }
  return 'primary'
}

// 获取步骤的图标
const getStepIcon = (step: string) => {
  if (step.includes('✅') || step.includes('成功')) {
    return 'SuccessFilled'
  }
  if (step.includes('❌') || step.includes('失败')) {
    return 'CircleCloseFilled'
  }
  if (step.includes('⚠️') || step.includes('警告') || step.includes('权限')) {
    return 'WarningFilled'
  }
  return undefined
}

// 获取步骤的样式类
const getStepClass = (step: string): string => {
  if (step.includes('输出:')) {
    return 'step-output'
  }
  if (step.includes('错误:')) {
    return 'step-error'
  }
  if (step.includes('⚠️') || step.includes('警告') || step.includes('权限')) {
    return 'step-warning'
  }
  return ''
}

// 监听对话框打开，自动执行诊断
watch(() => props.modelValue, (newValue) => {
  if (newValue && !diagnosis.value) {
    handleDiagnose()
  }
}, { immediate: true })
</script>

<style scoped lang="scss">
.pm2-fix-dialog {
  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 16px;
    color: #303133;
  }

  .subsection-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 12px;
    color: #606266;
  }

  .diagnosis-info {
    margin-bottom: 16px;
  }

  .issue-item {
    .issue-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;

      .issue-type {
        font-family: monospace;
        font-size: 12px;
        color: #909399;
      }
    }

    .issue-message {
      margin: 8px 0;
      color: #606266;
    }
  }

  .fix-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .success-actions {
    display: flex;
    justify-content: center;
  }

  .manual-fix-section {
    .manual-fix-options {
      .fix-option {
        padding: 16px;
        background: #f5f7fa;
        border-radius: 8px;
        border: 1px solid #e4e7ed;
        transition: all 0.3s ease;

        &.highlight-option {
          background: linear-gradient(135deg, #fff5f5 0%, #fff 100%);
          border: 2px solid #f56c6c;
          box-shadow: 0 2px 8px rgba(245, 108, 108, 0.1);
        }

        &:hover {
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
        }

        .option-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;

          .option-title {
            font-weight: 600;
            color: #303133;
            font-size: 15px;
          }
        }

        .option-description {
          margin: 8px 0;
          color: #606266;
          font-size: 14px;
          line-height: 1.6;

          strong {
            color: #409eff;
          }
        }

        .command-box {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #fff;
          border: 1px solid #dcdfe6;
          border-radius: 4px;
          margin-top: 12px;

          .command-text {
            flex: 1;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 14px;
            color: #409eff;
            background: #ecf5ff;
            padding: 8px 12px;
            border-radius: 4px;
            user-select: all;
          }
        }

        .script-info {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;

          .script-icon {
            font-size: 20px;
            color: #f56c6c;
          }

          .script-name {
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 14px;
            font-weight: 600;
            color: #303133;
          }

          .script-desc {
            font-size: 12px;
            color: #909399;
          }
        }

        .usage-steps {
          margin-top: 12px;
          padding: 12px;
          background: #fff;
          border-radius: 4px;
          border: 1px dashed #f56c6c;

          .step-title {
            font-weight: 600;
            color: #303133;
            margin-bottom: 8px;
          }

          ol {
            margin: 0;
            padding-left: 20px;

            li {
              margin: 6px 0;
              line-height: 1.6;
              color: #606266;

              code {
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                font-size: 12px;
                color: #f56c6c;
                background: #fef0f0;
                padding: 2px 6px;
                border-radius: 3px;
              }

              strong {
                color: #f56c6c;
              }
            }
          }
        }

        .manual-steps {
          margin: 12px 0;
          padding-left: 20px;

          li {
            margin: 8px 0;
            line-height: 1.6;

            code {
              font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
              font-size: 13px;
              color: #409eff;
              background: #ecf5ff;
              padding: 2px 8px;
              border-radius: 3px;
            }
          }
        }
      }
    }
  }

  .alternative-section {
    ol {
      margin: 12px 0;
      padding-left: 20px;

      li {
        margin: 8px 0;
        line-height: 1.6;

        ul {
          margin-top: 8px;
          padding-left: 20px;
          list-style-type: disc;

          li {
            margin: 4px 0;
          }
        }

        code {
          background: #f5f7fa;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: monospace;
          font-size: 12px;
          color: #e6a23c;
        }
      }
    }
  }

  // 修复步骤容器样式
  .fix-steps-container {
    border: 1px solid #e4e7ed;
    border-radius: 4px;
    background: #fafafa;
    padding: 8px;
  }

  // 修复步骤详情样式
  .fix-steps-detail {
    .step-content {
      font-size: 14px;
      line-height: 1.6;
      word-break: break-word;
      max-width: 100%;

      // 步骤预览样式
      .step-preview {
        font-size: 14px;
        color: #606266;
      }

      // 完整文本样式
      .step-full-text {
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        background-color: #f5f7fa;
        padding: 12px;
        border-radius: 4px;
        color: #606266;
        font-size: 12px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow-x: auto;
        margin: 0;
      }

      &.step-output {
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        background-color: #f5f7fa;
        padding: 8px 12px;
        border-radius: 4px;
        color: #606266;
        font-size: 13px;
      }

      &.step-error {
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        background-color: #fef0f0;
        padding: 8px 12px;
        border-radius: 4px;
        color: #f56c6c;
        font-size: 13px;
      }

      &.step-warning {
        background-color: #fdf6ec;
        padding: 8px 12px;
        border-radius: 4px;
        color: #e6a23c;
        font-weight: 500;
      }
    }

    // 折叠面板样式优化
    :deep(.el-collapse) {
      border: none;

      .el-collapse-item {
        margin-bottom: 0;

        .el-collapse-item__header {
          background: transparent;
          border: none;
          padding: 0;
          height: auto;
          line-height: 1.6;
        }

        .el-collapse-item__wrap {
          border: none;
          background: transparent;
        }

        .el-collapse-item__content {
          padding: 8px 0 0 0;
        }
      }
    }
  }
}
</style>
