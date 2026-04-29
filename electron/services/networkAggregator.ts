import type Database from 'better-sqlite3'

export type AppTrafficRange = 'today' | '7d' | '30d'

export interface AppTrafficRow {
  appName: string
  rxTotal: number
  txTotal: number
}

function todayStr(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function rangeStart(range: AppTrafficRange): string {
  const d = new Date()
  if (range === 'today') return todayStr()
  if (range === '7d') d.setDate(d.getDate() - 6)
  else d.setDate(d.getDate() - 29)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Test-callable variant; production uses flushAndPersist with the singleton db. */
export function flushAndPersistInto(
  db: Database.Database,
  deltas: { name: string; rxDelta: number; txDelta: number }[],
): void {
  if (deltas.length === 0) return
  const date = todayStr()
  const upsert = db.prepare(`
    INSERT INTO app_traffic (date, app_name, rx_total, tx_total)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(date, app_name) DO UPDATE SET
      rx_total = rx_total + excluded.rx_total,
      tx_total = tx_total + excluded.tx_total
  `)
  const tx = db.transaction((rows: typeof deltas) => {
    for (const r of rows) upsert.run(date, r.name, r.rxDelta, r.txDelta)
  })
  tx(deltas)
}

export function queryRangeFrom(db: Database.Database, range: AppTrafficRange): AppTrafficRow[] {
  const since = rangeStart(range)
  const rows = db.prepare(`
    SELECT app_name AS appName, SUM(rx_total) AS rxTotal, SUM(tx_total) AS txTotal
    FROM app_traffic
    WHERE date >= ?
    GROUP BY app_name
    ORDER BY rxTotal DESC
  `).all(since) as AppTrafficRow[]
  return rows
}

export function queryAllSumFrom(db: Database.Database, range: AppTrafficRange): { rxTotal: number; txTotal: number } {
  const since = rangeStart(range)
  const row = db.prepare(`
    SELECT COALESCE(SUM(rx_total), 0) AS rxTotal, COALESCE(SUM(tx_total), 0) AS txTotal
    FROM app_traffic
    WHERE date >= ?
  `).get(since) as { rxTotal: number; txTotal: number }
  return row
}

// Production wrappers — read the db singleton lazily so tests can use the `From` variants.
import { getDatabase } from '../database'

export function flushAndPersist(deltas: { name: string; rxDelta: number; txDelta: number }[]): void {
  flushAndPersistInto(getDatabase(), deltas)
}

export function queryRange(range: AppTrafficRange): AppTrafficRow[] {
  return queryRangeFrom(getDatabase(), range)
}

export function queryAllSum(range: AppTrafficRange): { rxTotal: number; txTotal: number } {
  return queryAllSumFrom(getDatabase(), range)
}
