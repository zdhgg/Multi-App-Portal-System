import type { Database } from 'better-sqlite3'
import { logger } from '../utils/logger.js'

/**
 * Ensure performance_alerts table matches the expected schema used by PerformanceMonitor.
 * If legacy schema detected (alert_type/metadata or id not TEXT), migrate in-place.
 */
export async function migratePerformanceAlerts(db: Database): Promise<void> {
  try {
    const cols = db.prepare("PRAGMA table_info(performance_alerts)").all() as any[]
    if (!Array.isArray(cols) || cols.length === 0) return

    const hasMetrics = cols.some(c => c.name === 'metrics')
    const hasType = cols.some(c => c.name === 'type')
    const hasAlertType = cols.some(c => c.name === 'alert_type')
    const idCol = cols.find(c => c.name === 'id')
    const idIsText = idCol && String(idCol.type || '').toUpperCase().includes('TEXT')

    // If any mismatch, perform migration
    if (!hasMetrics || !hasType || hasAlertType || !idIsText) {
      logger.warn('performance_alerts schema mismatch detected, migrating...')
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
  COALESCE(type, alert_type),
  severity,
  title,
  message,
  timestamp,
  COALESCE(metrics, metadata, '{}'),
  threshold,
  current_value,
  acknowledged,
  resolved_at,
  COALESCE(created_at, CURRENT_TIMESTAMP)
FROM performance_alerts;
DROP TABLE performance_alerts;
ALTER TABLE performance_alerts_new RENAME TO performance_alerts;
COMMIT;`
      db.exec(sql)
      logger.info('performance_alerts schema migrated successfully')
    }
  } catch (error) {
    logger.warn('performance_alerts schema migration failed', { error })
  }
}

export default { migratePerformanceAlerts }

