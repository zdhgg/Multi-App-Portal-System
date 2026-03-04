#!/usr/bin/env node

/**
 * Migration CLI Tool
 * 
 * Usage: npm run migrate
 * 
 * This tool executes the database migration from v1 to v2.
 * It's designed to be run once during the system upgrade.
 */

import { join } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { runMigration } from '../core/migration'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function main() {
  console.log('🔥 Linus-style Database Migration v1 -> v2')
  console.log('=========================================')
  console.log('')
  
  // Find database path
  const dbPath = join(__dirname, '../../data/portal.db')
  
  if (!existsSync(dbPath)) {
    console.log('❌ Database not found at:', dbPath)
    console.log('   Creating new database with v2 schema...')
    
    // Create new database with v2 schema
    const Database = (await import('better-sqlite3')).default
    const { readFileSync } = await import('fs')
    
    const db = new Database(dbPath)
    const schemaPath = join(__dirname, '../core/schema.sql')
    const schemaSql = readFileSync(schemaPath, 'utf-8')
    
    db.exec(schemaSql)
    db.close()
    
    console.log('✅ New database created with v2 schema')
    return
  }
  
  console.log('📂 Database found at:', dbPath)
  console.log('')
  console.log('⚠️  WARNING: This migration is DESTRUCTIVE!')
  console.log('   - All v1 tables will be DROPPED')
  console.log('   - Data will be converted to v2 format')
  console.log('   - There is NO automatic rollback')
  console.log('')
  
  // In a real implementation, you'd want user confirmation here
  // For now, we'll proceed automatically
  
  console.log('🚀 Starting migration...')
  console.log('')
  
  try {
    const result = await runMigration(dbPath)
    
    if (result.success) {
      console.log('✅ Migration completed successfully!')
      console.log('   📊 Statistics:')
      console.log(`   - Applications migrated: ${result.migratedApps}`)
      console.log(`   - Sessions migrated: ${result.migratedSessions}`)
      console.log(`   - Duration: ${result.duration}ms`)
      
      if (result.errors.length > 0) {
        console.log('   ⚠️  Warnings:')
        result.errors.forEach(error => console.log(`     - ${error}`))
      }
      
    } else {
      console.log('❌ Migration failed!')
      console.log('   Errors:')
      result.errors.forEach(error => console.log(`     - ${error}`))
      process.exit(1)
    }
    
  } catch (error) {
    console.log('💥 Migration crashed!')
    console.error(error)
    process.exit(1)
  }
  
  console.log('')
  console.log('🎉 Database is now running on v2 schema!')
  console.log('   You can start the server with: npm start')
  console.log('')
}

// Execute if called directly (ES module compatible)

// Always execute for now
main().catch(console.error)