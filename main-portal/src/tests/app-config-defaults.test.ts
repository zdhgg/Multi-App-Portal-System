import { describe, expect, it } from 'vitest'
import { appConfigApiService } from '@/services/appConfigApi'

describe('appConfigApiService.getDefaultConfiguration', () => {
  it('应该保留传入的 appId，避免新建配置保存到空应用下', () => {
    const config = appConfigApiService.getDefaultConfiguration(
      'React',
      'CLI Proxy API',
      'D:/cliproxyapi_6.8.40',
      'app-123'
    )

    expect(config.appId).toBe('app-123')
    expect(config.workingDirectory).toBe('D:/cliproxyapi_6.8.40')
    expect(config.startCommand).toBe('npm start')
  })

  it('未传 appId 时仍保持兼容，默认返回空字符串', () => {
    const config = appConfigApiService.getDefaultConfiguration(
      'Vue',
      'Portal',
      'D:/portal'
    )

    expect(config.appId).toBe('')
    expect(config.startCommand).toBe('npm run dev')
  })
})
