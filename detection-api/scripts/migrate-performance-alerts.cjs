/*
 * One-off migration to align performance_alerts schema with code expectations
 * Old schema columns: id INTEGER PK, alert_type TEXT, metadata TEXT, ...
 * New schema columns: id TEXT PK, type TEXT, metrics TEXT, ...
 */
const Database = require('better-sqlite3')
const path = require('path')

function migrate(dbPath) {
  const db = new Database(dbPath)
  try {
    const cols = db.prepare("PRAGMA table_info(performance_alerts)").all()
    if (!Array.isArray(cols) || cols.length === 0) {
      console.log('performance_alerts table not found, nothing to migrate')
      return
    }
    const hasMetrics = cols.some(c => c.name === 'metrics')
    const hasType = cols.some(c => c.name === 'type')
    const hasAlertType = cols.some(c => c.name === 'alert_type')
    const idCol = cols.find(c => c.name === 'id')
    const idIsText = idCol && String(idCol.type || '').toUpperCase().includes('TEXT')

    if (hasMetrics && hasType && !hasAlertType && idIsText) {
      console.log('performance_alerts schema already up-to-date')
      return
    }

    console.log('Migrating performance_alerts schema...')
    const sql = `
BEGIN;
CREATE TABLE IF NOT EXISTS performance_alerts_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  metrics TEXT NOT NULL,
  threshold REAL NOT NULL,
  current_value REAL NOT NULL,
  acknowledged BOOLEAN DEFAULT FALSE,
  resolved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO performance_alerts_new (
  id, type, severity, title, message, timestamp, metrics, threshold, current_value, acknowledged, resolved_at, created_at
)
SELECT 
  'legacy_' || id,
  alert_type,
  severity,
  title,
  message,
  timestamp,
  COALESCE(metadata, '{}'),
  threshold,
  current_value,
  acknowledged,
  resolved_at,
  CURRENT_TIMESTAMP
FROM performance_alerts;
DROP TABLE performance_alerts;
ALTER TABLE performance_alerts_new RENAME TO performance_alerts;
COMMIT;`
    db.exec(sql)
    console.log('Migration completed')
  } finally {
    db.close()
  }
}

const dbPath = path.join(__dirname, '..', 'data', 'portal.db')
migrate(dbPath)

