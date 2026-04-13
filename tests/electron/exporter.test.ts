import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createDatabase, insertMemoryStats } from '../../electron/database/queries'
import { exportToCSV, exportToJSON } from '../../electron/services/exporter'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  createDatabase(db)
  const now = Date.now()
  insertMemoryStats(db, { timestamp: now, total: 16e9, used: 12e9, free: 4e9, cached: 2e9, swapUsed: 0, swapTotal: 2e9, pressureLevel: 'normal' })
  insertMemoryStats(db, { timestamp: now + 1000, total: 16e9, used: 13e9, free: 3e9, cached: 2e9, swapUsed: 0, swapTotal: 2e9, pressureLevel: 'warn' })
})

afterEach(() => {
  db.close()
})

describe('exportToCSV', () => {
  it('generates CSV with headers', () => {
    const csv = exportToCSV(db, 'memory_stats')
    const lines = csv.trim().split('\n')
    expect(lines[0]).toContain('timestamp')
    expect(lines[0]).toContain('total')
    expect(lines).toHaveLength(3)
  })
})

describe('exportToJSON', () => {
  it('generates valid JSON array', () => {
    const json = exportToJSON(db, 'memory_stats')
    const parsed = JSON.parse(json)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].total).toBe(16e9)
  })
})
