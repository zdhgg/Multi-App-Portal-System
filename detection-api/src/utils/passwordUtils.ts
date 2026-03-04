/**
 * 密码工具类
 * 处理密码加密、验证和安全相关功能
 */

import bcrypt from 'bcryptjs'
import { logger } from './logger'

const SALT_ROUNDS = 10

export class PasswordUtils {
  /**
   * 加密密码
   */
  static async hashPassword(password: string): Promise<string> {
    try {
      const hash = await bcrypt.hash(password, SALT_ROUNDS)
      return hash
    } catch (error) {
      logger.error('密码加密失败', { error })
      throw new Error('Password hashing failed')
    }
  }

  /**
   * 验证密码
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      const isValid = await bcrypt.compare(password, hash)
      return isValid
    } catch (error) {
      logger.error('密码验证失败', { error })
      return false
    }
  }

  /**
   * 检查密码是否已加密（bcrypt哈希以$2a$, $2b$, $2y$开头）
   */
  static isPasswordHashed(password: string): boolean {
    return /^\$2[ayb]\$\d{2}\$/.test(password)
  }

  /**
   * 批量处理用户密码加密
   * 只加密未加密的密码
   */
  static async processUsersPasswords(users: any[]): Promise<any[]> {
    const processedUsers = await Promise.all(
      users.map(async (user) => {
        if (user.password && !this.isPasswordHashed(user.password)) {
          // 密码未加密，需要加密
          const hashedPassword = await this.hashPassword(user.password)
          logger.info('用户密码已加密', { username: user.username })
          return { ...user, password: hashedPassword }
        }
        // 密码已加密或不存在，保持不变
        return user
      })
    )
    return processedUsers
  }

  /**
   * 验证密码强度
   */
  static validatePasswordStrength(password: string): { valid: boolean; message?: string } {
    if (!password || password.length < 8) {
      return { valid: false, message: '密码至少需要8个字符' }
    }

    let strength = 0
    if (/[a-z]/.test(password)) strength++
    if (/[A-Z]/.test(password)) strength++
    if (/[0-9]/.test(password)) strength++
    if (/[^a-zA-Z0-9]/.test(password)) strength++

    if (strength < 3) {
      return { 
        valid: false, 
        message: '密码强度不足，建议包含大小写字母、数字和特殊字符' 
      }
    }

    return { valid: true }
  }
}

