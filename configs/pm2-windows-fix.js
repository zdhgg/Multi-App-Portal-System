// Windows环境下PM2配置修复工具
// 解决npm命令在Windows下反复启动cmd的问题

const fs = require('fs')
const path = require('path')

class WindowsPM2Fix {
  /**
   * 修复Windows下的npm命令配置
   */
  static fixNpmCommand(script) {
    if (process.platform !== 'win32') {
      return { script, args: undefined }
    }

    if (script.startsWith('npm run ') || script === 'npm start') {
      // 方案1：使用npm.cmd直接执行
      const npmCmd = this.findNpmCommand()
      
      if (script.startsWith('npm run ')) {
        const scriptName = script.replace('npm run ', '')
        return {
          script: npmCmd,
          args: ['run', scriptName]
        }
      }
      
      if (script === 'npm start') {
        return {
          script: npmCmd,
          args: ['start']
        }
      }
    }

    return { script, args: undefined }
  }

  /**
   * 查找npm命令的完整路径
   */
  static findNpmCommand() {
    // 常见的npm路径
    const possiblePaths = [
      'npm.cmd',
      'npm',
      path.join(process.env.APPDATA || '', 'npm', 'npm.cmd'),
      path.join(process.env.ProgramFiles || '', 'nodejs', 'npm.cmd'),
      path.join(process.env['ProgramFiles(x86)'] || '', 'nodejs', 'npm.cmd')
    ]

    for (const npmPath of possiblePaths) {
      try {
        if (fs.existsSync(npmPath)) {
          return npmPath
        }
      } catch (error) {
        // 继续尝试下一个路径
      }
    }

    // 如果都找不到，返回默认值
    return 'npm.cmd'
  }

  /**
   * 生成Windows兼容的PM2配置
   */
  static generateWindowsConfig(apps) {
    return {
      apps: apps.map(app => {
        const fixed = this.fixNpmCommand(app.script)
        
        return {
          ...app,
          script: fixed.script,
          args: fixed.args,
          // Windows特定配置
          windowsHide: true,
          kill_timeout: 5000,
          listen_timeout: 8000,
          // 确保使用正确的工作目录
          cwd: app.cwd ? path.resolve(app.cwd) : process.cwd(),
          // 环境变量
          env: {
            ...app.env,
            // 确保npm能找到正确的路径
            PATH: process.env.PATH
          }
        }
      })
    }
  }

  /**
   * 修复现有的PM2配置文件
   */
  static fixEcosystemConfig(configPath = './ecosystem.config.js') {
    try {
      const config = require(path.resolve(configPath))
      
      if (config.apps && Array.isArray(config.apps)) {
        const fixedConfig = this.generateWindowsConfig(config.apps)
        
        // 备份原配置
        const backupPath = configPath.replace('.js', '.backup.js')
        fs.copyFileSync(configPath, backupPath)
        
        // 写入修复后的配置
        const configContent = `// Windows修复后的PM2配置
// 原配置备份: ${backupPath}
// 修复时间: ${new Date().toISOString()}

module.exports = ${JSON.stringify(fixedConfig, null, 2)}`

        fs.writeFileSync(configPath, configContent, 'utf8')
        
        console.log('✅ PM2配置已修复，原配置已备份到:', backupPath)
        return true
      }
    } catch (error) {
      console.error('❌ 修复PM2配置失败:', error.message)
      return false
    }
  }
}

module.exports = WindowsPM2Fix

// 如果直接运行此脚本，则修复默认配置
if (require.main === module) {
  console.log('🔧 开始修复Windows下的PM2配置...')
  WindowsPM2Fix.fixEcosystemConfig()
}
