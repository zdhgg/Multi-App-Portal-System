/**
 * 生产环境启动脚本 - 使用 CommonJS 以兼容 PM2
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const dotenv = require('dotenv');

const tsxPath = path.join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const serverPath = path.join(__dirname, 'src', 'bootstrap.ts');
const envPath = path.join(__dirname, '.env');

dotenv.config({ path: envPath });

// 确保 PM2_HOME 环境变量正确设置
const pm2Home = process.env.PM2_HOME || path.join(os.homedir(), '.pm2');

const tsx = spawn(process.execPath, [tsxPath, serverPath], {
  cwd: __dirname,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,  // 隐藏Windows下的CMD窗口
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: '8002',
    HOST: '0.0.0.0',
    LOG_LEVEL: 'info',
    PM2_ENABLED: '1',
    PM2_HOME: pm2Home
  }
});

tsx.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
});

tsx.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
});

tsx.on('error', (error) => {
  console.error('[start-prod] Failed to launch child process:', error);
  process.exit(1);
});

tsx.on('close', (code) => {
  console.log(`Server process exited with code ${code}`);
  process.exit(code);
});

process.on('SIGINT', () => {
  tsx.kill('SIGINT');
});

process.on('SIGTERM', () => {
  tsx.kill('SIGTERM');
});

