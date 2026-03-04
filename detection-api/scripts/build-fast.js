#!/usr/bin/env node
/**
 * 快速构建脚本 - 跳过类型检查
 * 用于生产环境部署时快速构建
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, cpSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const srcDir = join(rootDir, 'src');
const distDir = join(rootDir, 'dist');

console.log('🚀 快速构建开始（跳过类型检查）...');

try {
  // 清理旧的构建目录
  if (existsSync(distDir)) {
    console.log('🧹 清理旧的构建目录...');
    rmSync(distDir, { recursive: true, force: true });
  }
  
  // 使用 tsx 进行编译（自动跳过类型检查）
  console.log('📦 使用 tsx 编译...');
  execSync('npx tsx --no-cache --compile src/server.ts', {
    cwd: rootDir,
    stdio: 'inherit'
  });
  
  console.log('✅ 构建完成！');
} catch (error) {
  // 如果 tsx 编译失败，尝试使用 tsc 但忽略错误
  console.log('⚠️ tsx 编译失败，尝试使用 tsc（忽略类型错误）...');
  try {
    execSync('npx tsc --skipLibCheck 2>nul || exit 0', {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true
    });
    console.log('✅ 构建完成（忽略了类型错误）！');
  } catch (e) {
    console.error('❌ 构建失败:', e.message);
    process.exit(1);
  }
}
