import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { TABLES } from '../../electron/database/schema'
import { createDatabase, insertMemoryStats, insertDiskStats, insertNetworkStats, queryHistory, cleanupOldData } from '../../electron/database/queries'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  createDatabase(db)
})

afterEach(() => {
  db.close()
})

describe('schema', () => {
  it('creates all tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[]
    const names = tables.map((t) => t.name)
    expect(names).toContain('memory_stats')
    expect(names).toContain('disk_stats')
    expect(names).toContain('network_stats')
    expect(names).toContain('process_snapshots')
    expect(names).toContain('app_traffic')
  })

  it('creates indexes', () => {
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
    ).all() as { name: string }[]
    const names = indexes.map((i) => i.name)
    expect(names).toContain('idx_memory_timestamp')
    expect(names).toContain('idx_disk_timestamp')
    expect(names).toContain('idx_network_timestamp')
    expect(names).toContain('idx_app_traffic_date_app')
  })
})

describe('insertMemoryStats', () => {
  it('inserts and retrieves memory stats', () => {
    const now = Date.now()
    insertMemoryStats(db, {
      timestamp: now, total: 16000000000, used: 12000000000, free: 4000000000,
      cached: 3000000000, swapUsed: 500000000, swapTotal: 2000000000, pressureLevel: 'normal',
    })
    const rows = db.prepare('SELECT * FROM memory_stats').all() as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].total).toBe(16000000000)
    expect(rows[0].pressure_level).toBe('normal')
  })
})

describe('insertDiskStats', () => {
  it('inserts disk stats', () => {
    insertDiskStats(db, {
      timestamp: Date.now(), mountPoint: '/', total: 500e9, used: 300e9,
      available: 200e9, readSpeed: 150.5, writeSpeed: 80.2,
    })
    const rows = db.prepare('SELECT * FROM disk_stats').all() as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].mount_point).toBe('/')
  })
})

describe('insertNetworkStats', () => {
  it('inserts network stats', () => {
    insertNetworkStats(db, {
      timestamp: Date.now(), iface: 'en0', rxBytes: 1000000, txBytes: 500000,
      rxSpeed: 1200.5, txSpeed: 600.3,
    })
    const rows = db.prepare('SELECT * FROM network_stats').all() as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].interface).toBe('en0')
  })
})

describe('queryHistory', () => {
  it('returns memory history within time range', () => {
    const now = Date.now()
    insertMemoryStats(db, { timestamp: now - 1000, total: 16e9, used: 10e9, free: 6e9, cached: 2e9, swapUsed: 0, swapTotal: 2e9, pressureLevel: 'normal' })
    insertMemoryStats(db, { timestamp: now - 500, total: 16e9, used: 12e9, free: 4e9, cached: 2e9, swapUsed: 0, swapTotal: 2e9, pressureLevel: 'normal' })
    insertMemoryStats(db, { timestamp: now - 7200001, total: 16e9, used: 8e9, free: 8e9, cached: 2e9, swapUsed: 0, swapTotal: 2e9, pressureLevel: 'normal' })

    const results = queryHistory(db, 'memory', '1h')
    expect(results).toHaveLength(2)
    expect(results[0].value).toBe(10e9)
    expect(results[1].value).toBe(12e9)
  })
})

describe('cleanupOldData', () => {
  it('deletes data older than retention period', () => {
    const now = Date.now()
    const oldTimestamp = now - 91 * 24 * 60 * 60 * 1000
    insertMemoryStats(db, { timestamp: oldTimestamp, total: 16e9, used: 10e9, free: 6e9, cached: 2e9, swapUsed: 0, swapTotal: 2e9, pressureLevel: 'normal' })
    insertMemoryStats(db, { timestamp: now, total: 16e9, used: 12e9, free: 4e9, cached: 2e9, swapUsed: 0, swapTotal: 2e9, pressureLevel: 'normal' })

    cleanupOldData(db, 90)
    const rows = db.prepare('SELECT * FROM memory_stats').all()
    expect(rows).toHaveLength(1)
  })
})
