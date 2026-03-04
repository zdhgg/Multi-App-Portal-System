/**
 * 检查日志缓存表的记录数量
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../detection-api/data/portal.db');

try {
  const db = new Database(dbPath, { readonly: true });
  
  console.log('=== 日志缓存表统计 ===\n');
  
  // 总记录数
  const totalResult = db.prepare('SELECT COUNT(*) as total FROM log_cache').get();
  console.log(`总记录数: ${totalResult.total.toLocaleString()}`);
  
  // 按级别统计
  console.log('\n按级别统计:');
  const levelStats = db.prepare('SELECT level, COUNT(*) as count FROM log_cache GROUP BY level ORDER BY count DESC').all();
  levelStats.forEach(row => {
    console.log(`  ${row.level}: ${row.count.toLocaleString()}`);
  });
  
  // 按来源统计
  console.log('\n按来源统计 (Top 10):');
  const sourceStats = db.prepare('SELECT source, COUNT(*) as count FROM log_cache GROUP BY source ORDER BY count DESC LIMIT 10').all();
  sourceStats.forEach(row => {
    console.log(`  ${row.source}: ${row.count.toLocaleString()}`);
  });
  
  // 时间范围
  console.log('\n时间范围:');
  const timeRange = db.prepare('SELECT MIN(timestamp) as start, MAX(timestamp) as end FROM log_cache').get();
  console.log(`  最早: ${timeRange.start}`);
  console.log(`  最晚: ${timeRange.end}`);
  
  // 表大小
  console.log('\n表信息:');
  const tableInfo = db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get();
  const sizeInMB = (tableInfo.size / 1024 / 1024).toFixed(2);
  console.log(`  数据库大小: ${sizeInMB} MB`);
  
  // 采样查看最新的几条记录
  console.log('\n最新5条日志:');
  const recentLogs = db.prepare('SELECT timestamp, level, source, message FROM log_cache ORDER BY timestamp DESC LIMIT 5').all();
  recentLogs.forEach((log, index) => {
    console.log(`  ${index + 1}. [${log.timestamp}] [${log.level}] [${log.source}]`);
    console.log(`     ${log.message.substring(0, 100)}${log.message.length > 100 ? '...' : ''}`);
  });
  
  db.close();
  
} catch (error) {
  console.error('查询失败:', error.message);
  process.exit(1);
}

