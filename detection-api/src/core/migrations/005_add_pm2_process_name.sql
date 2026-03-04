-- Add pm2_process_name column to applications table
ALTER TABLE applications ADD COLUMN pm2_process_name TEXT;

-- Backfill existing rows with NULL value
UPDATE applications SET pm2_process_name = NULL WHERE pm2_process_name IS NULL;
