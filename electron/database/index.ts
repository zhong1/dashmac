import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { createDatabase } from './queries'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (db) return db
  const dbPath = path.join(app.getPath('userData'), 'dashmac-data.db')
  db = new Database(dbPath)
  createDatabase(db)
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
