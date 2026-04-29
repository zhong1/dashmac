import { describe, expect, test, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { CREATE_TABLES, CREATE_INDEXES } from '../../electron/database/schema'
import {
  flushAndPersistInto, queryRangeFrom, queryAllSumFrom,
} from '../../electron/services/networkAggregator'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(CREATE_TABLES)
  db.exec(CREATE_INDEXES)
})

describe('networkAggregator', () => {
  test('flushAndPersistInto writes a row with todays date', () => {
    flushAndPersistInto(db, [{ name: 'Chrome', rxDelta: 1000, txDelta: 500 }])
    const rows = db.prepare('SELECT app_name, rx_total, tx_total FROM app_traffic').all() as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].app_name).toBe('Chrome')
    expect(rows[0].rx_total).toBe(1000)
    expect(rows[0].tx_total).toBe(500)
  })

  test('repeated flushes for same day same app accumulate (UPSERT)', () => {
    flushAndPersistInto(db, [{ name: 'Chrome', rxDelta: 1000, txDelta: 500 }])
    flushAndPersistInto(db, [{ name: 'Chrome', rxDelta: 200, txDelta: 100 }])
    const rows = db.prepare('SELECT rx_total, tx_total FROM app_traffic').all() as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].rx_total).toBe(1200)
    expect(rows[0].tx_total).toBe(600)
  })

  test('queryRangeFrom("today") returns rows grouped by app', () => {
    flushAndPersistInto(db, [
      { name: 'Chrome', rxDelta: 1000, txDelta: 500 },
      { name: 'zoom.us', rxDelta: 2000, txDelta: 1500 },
    ])
    const results = queryRangeFrom(db, 'today')
    expect(results).toHaveLength(2)
    const chrome = results.find((r) => r.appName === 'Chrome')
    expect(chrome?.rxTotal).toBe(1000)
    expect(chrome?.txTotal).toBe(500)
  })

  test('queryAllSumFrom("30d") sums everything across all apps', () => {
    flushAndPersistInto(db, [
      { name: 'A', rxDelta: 100, txDelta: 50 },
      { name: 'B', rxDelta: 200, txDelta: 75 },
    ])
    const total = queryAllSumFrom(db, '30d')
    expect(total.rxTotal).toBe(300)
    expect(total.txTotal).toBe(125)
  })
})
