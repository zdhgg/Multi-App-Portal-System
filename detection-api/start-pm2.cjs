/**
 * PM2 启动包装脚本 - 解决 Windows CMD 窗口问题
 * 
 * 这个脚本使用 windowsHide: true 来隐藏 CMD 窗口
 */

const { spawn } = require('child_process');
const path = require('path');

const tsxPath = path.join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const serverPath = path.join(__dirname, 'src', 'server.ts');

// 确保 PM2_HOME 环境变量正确设置
const pm2Home = process.env.PM2_HOME || require('path').join(require('os').homedir(), '.pm2');

// 使用 windowsHide: true 启动 tsx
const child = spawn(process.execPath, [tsxPath, serverPath], {
  cwd: __dirname,
  stdio: 'inherit',
  windowsHide: true,  // 关键：隐藏 Windows CMD 窗口
  env: {
    ...process.env,
    PM2_ENABLED: '1',
    PM2_HOME: pm2Home  // 确保子进程能找到 PM2 daemon
  }
});

// 传递退出信号
child.on('close', (code) => {
  process.exit(code || 0);
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});
