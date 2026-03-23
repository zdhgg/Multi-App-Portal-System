/**
 * 生成管理员密码脚本
 * 用于生成加密后的默认管理员密码
 */

import bcrypt from 'bcryptjs'

async function generateAdminPassword() {
  const password = 'admin123'
  const hash = await bcrypt.hash(password, 10)
  
  console.log('========================================')
  console.log('默认管理员账户信息')
  console.log('========================================')
  console.log('用户名: admin')
  console.log('密码: admin123')
  console.log('加密后的密码哈希:')
  console.log(hash)
  console.log('========================================')
  console.log('\n请将此哈希值添加到项目根目录 configs/system-config.json 文件的 accounts.users 部分')
  
  // 输出完整的配置示例
  const config = {
    "accounts": {
      "users": [
        {
          "id": "admin-001",
          "username": "admin",
          "password": hash,
          "role": "admin",
          "enabled": true,
          "mustChangePassword": false,
          "createdAt": new Date().toISOString(),
          "createdBy": "system"
        }
      ]
    }
  }
  
  console.log('\n完整配置示例:')
  console.log(JSON.stringify(config, null, 2))
}

generateAdminPassword().catch(console.error)

