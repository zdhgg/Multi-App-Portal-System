/**
 * 日志清理脚本
 * 清理过期的日志缓存记录，优化数据库性能
 */

const path = require('path');
const readline = require('readline');

// 动态加载better-sqlite3（从detection-api目录）
const Database = require(path.join(__dirname, '../detection-api/node_modules/better-sqlite3'));

const dbPath = path.join(__dirname, '../detection-api/data/portal.db');

// 创建命令行接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  try {
    const db = new Database(dbPath);
    
    console.log('=== 日志清理工具 ===\n');
    
    // 1. 显示当前状态
    const totalResult = db.prepare('SELECT COUNT(*) as total FROM log_cache').get();
    console.log(`当前日志总数: ${totalResult.total.toLocaleString()}`);
    
    const levelStats = db.prepare('SELECT level, COUNT(*) as count FROM log_cache GROUP BY level ORDER BY count DESC').all();
    console.log('\n按级别统计:');
    levelStats.forEach(row => {
      const percentage = ((row.count / totalResult.total) * 100).toFixed(1);
      console.log(`  ${row.level}: ${row.count.toLocaleString()} (${percentage}%)`);
    });
    
    const timeRange = db.prepare('SELECT MIN(timestamp) as start, MAX(timestamp) as end FROM log_cache').get();
    console.log('\n时间范围:');
    console.log(`  最早: ${timeRange.start}`);
    console.log(`  最晚: ${timeRange.end}`);
    
    // 计算数据库大小
    const fs = require('fs');
    const stats = fs.statSync(dbPath);
    const sizeInMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`\n数据库大小: ${sizeInMB} MB`);
    
    // 2. 提供清理选项
    console.log('\n=== 清理选项 ===');
    console.log('1. 保留最近7天的日志（推荐）');
    console.log('2. 保留最近30天的日志');
    console.log('3. 保留最近1天的日志');
    console.log('4. 仅保留最近1000条日志');
    console.log('5. 清空所有日志（危险）');
    console.log('6. 取消');
    
    const choice = await question('\n请选择清理选项 (1-6): ');
    
    let deleteCount = 0;
    let retentionDesc = '';
    
    switch (choice.trim()) {
      case '1': {
        // 保留最近7天
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 7);
        const cutoffStr = cutoffDate.toISOString().replace('T', ' ').substring(0, 19);
        
        const countResult = db.prepare('SELECT COUNT(*) as count FROM log_cache WHERE timestamp < ?').get(cutoffStr);
        deleteCount = countResult.count;
        retentionDesc = '最近7天';
        
        if (deleteCount > 0) {
          const confirm = await question(`\n将删除 ${deleteCount.toLocaleString()} 条日志，保留${retentionDesc}的日志。确认？(y/n): `);
          if (confirm.toLowerCase() === 'y') {
            db.prepare('DELETE FROM log_cache WHERE timestamp < ?').run(cutoffStr);
            console.log(`✅ 已删除 ${deleteCount.toLocaleString()} 条日志`);
          } else {
            console.log('❌ 已取消');
          }
        } else {
          console.log('ℹ️ 没有需要删除的日志');
        }
        break;
      }
      
      case '2': {
        // 保留最近30天
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        const cutoffStr = cutoffDate.toISOString().replace('T', ' ').substring(0, 19);
        
        const countResult = db.prepare('SELECT COUNT(*) as count FROM log_cache WHERE timestamp < ?').get(cutoffStr);
        deleteCount = countResult.count;
        retentionDesc = '最近30天';
        
        if (deleteCount > 0) {
          const confirm = await question(`\n将删除 ${deleteCount.toLocaleString()} 条日志，保留${retentionDesc}的日志。确认？(y/n): `);
          if (confirm.toLowerCase() === 'y') {
            db.prepare('DELETE FROM log_cache WHERE timestamp < ?').run(cutoffStr);
            console.log(`✅ 已删除 ${deleteCount.toLocaleString()} 条日志`);
          } else {
            console.log('❌ 已取消');
          }
        } else {
          console.log('ℹ️ 没有需要删除的日志');
        }
        break;
      }
      
      case '3': {
        // 保留最近1天
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 1);
        const cutoffStr = cutoffDate.toISOString().replace('T', ' ').substring(0, 19);
        
        const countResult = db.prepare('SELECT COUNT(*) as count FROM log_cache WHERE timestamp < ?').get(cutoffStr);
        deleteCount = countResult.count;
        retentionDesc = '最近1天';
        
        if (deleteCount > 0) {
          const confirm = await question(`\n将删除 ${deleteCount.toLocaleString()} 条日志，保留${retentionDesc}的日志。确认？(y/n): `);
          if (confirm.toLowerCase() === 'y') {
            db.prepare('DELETE FROM log_cache WHERE timestamp < ?').run(cutoffStr);
            console.log(`✅ 已删除 ${deleteCount.toLocaleString()} 条日志`);
          } else {
            console.log('❌ 已取消');
          }
        } else {
          console.log('ℹ️ 没有需要删除的日志');
        }
        break;
      }
      
      case '4': {
        // 仅保留最近1000条
        const countResult = db.prepare('SELECT COUNT(*) as count FROM log_cache').get();
        deleteCount = Math.max(0, countResult.count - 1000);
        retentionDesc = '最近1000条';
        
        if (deleteCount > 0) {
          const confirm = await question(`\n将删除 ${deleteCount.toLocaleString()} 条日志，保留${retentionDesc}日志。确认？(y/n): `);
          if (confirm.toLowerCase() === 'y') {
            db.prepare(`
              DELETE FROM log_cache 
              WHERE id NOT IN (
                SELECT id FROM log_cache 
                ORDER BY timestamp DESC 
                LIMIT 1000
              )
            `).run();
            console.log(`✅ 已删除 ${deleteCount.toLocaleString()} 条日志`);
          } else {
            console.log('❌ 已取消');
          }
        } else {
          console.log('ℹ️ 日志数量已少于1000条');
        }
        break;
      }
      
      case '5': {
        // 清空所有日志
        const confirm = await question(`\n⚠️ 警告：将清空所有 ${totalResult.total.toLocaleString()} 条日志！确认？(y/n): `);
        if (confirm.toLowerCase() === 'y') {
          const doubleConfirm = await question('⚠️ 再次确认清空所有日志？(yes/no): ');
          if (doubleConfirm.toLowerCase() === 'yes') {
            db.prepare('DELETE FROM log_cache').run();
            console.log(`✅ 已清空所有日志`);
          } else {
            console.log('❌ 已取消');
          }
        } else {
          console.log('❌ 已取消');
        }
        break;
      }
      
      case '6':
        console.log('❌ 已取消');
        break;
        
      default:
        console.log('❌ 无效选项');
    }
    
    // 3. 优化数据库
    if (choice >= '1' && choice <= '5' && choice !== '6') {
      console.log('\n正在优化数据库...');
      db.prepare('VACUUM').run();
      console.log('✅ 数据库优化完成');
      
      // 显示清理后的状态
      const newTotal = db.prepare('SELECT COUNT(*) as total FROM log_cache').get();
      const newStats = fs.statSync(dbPath);
      const newSizeInMB = (newStats.size / 1024 / 1024).toFixed(2);
      const savedMB = (sizeInMB - newSizeInMB).toFixed(2);
      
      console.log('\n=== 清理结果 ===');
      console.log(`剩余日志: ${newTotal.total.toLocaleString()} 条`);
      console.log(`数据库大小: ${newSizeInMB} MB (节省 ${savedMB} MB)`);
    }
    
    db.close();
    rl.close();
    
  } catch (error) {
    console.error('❌ 清理失败:', error.message);
    rl.close();
    process.exit(1);
  }
}

main();

