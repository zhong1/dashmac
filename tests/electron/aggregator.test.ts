import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createDatabase, insertMemoryStats } from '../../electron/database/queries'
import { downsampleOldData } from '../../electron/services/aggregator'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  createDatabase(db)
})

afterEach(() => {
  db.close()
})

describe('downsampleOldData', () => {
  it('replaces minute-level data older than 7 days with hourly averages', () => {
    const now = Date.now()
    const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000

    // Use 1-second intervals so all 60 points fit in one hourly bucket
    const hourAligned = Math.floor(eightDaysAgo / 3600000) * 3600000
    for (let i = 0; i < 60; i++) {
      insertMemoryStats(db, {
        timestamp: hourAligned + i * 1000,
        total: 16e9, used: 10e9 + i * 1e6, free: 6e9 - i * 1e6,
        cached: 2e9, swapUsed: 0, swapTotal: 2e9, pressureLevel: 'normal',
      })
    }

    insertMemoryStats(db, {
      timestamp: now, total: 16e9, used: 12e9, free: 4e9,
      cached: 2e9, swapUsed: 0, swapTotal: 2e9, pressureLevel: 'normal',
    })

    const beforeCount = db.prepare('SELECT COUNT(*) as count FROM memory_stats').get() as any
    expect(beforeCount.count).toBe(61)

    downsampleOldData(db, 7)

    const afterCount = db.prepare('SELECT COUNT(*) as count FROM memory_stats').get() as any
    expect(afterCount.count).toBe(2)
  })
})
