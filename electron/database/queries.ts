import type Database from 'better-sqlite3'
import { CREATE_TABLES, CREATE_INDEXES } from './schema'

export function createDatabase(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.exec(CREATE_TABLES)
  db.exec(CREATE_INDEXES)
}

interface MemoryStatsInput {
  timestamp: number
  total: number
  used: number
  free: number
  cached: number
  swapUsed: number
  swapTotal: number
  pressureLevel: 'normal' | 'warn' | 'critical'
}

export function insertMemoryStats(db: Database.Database, data: MemoryStatsInput): void {
  db.prepare(
    `INSERT INTO memory_stats (timestamp, total, used, free, cached, swap_used, swap_total, pressure_level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(data.timestamp, data.total, data.used, data.free, data.cached, data.swapUsed, data.swapTotal, data.pressureLevel)
}

interface DiskStatsInput {
  timestamp: number
  mountPoint: string
  total: number
  used: number
  available: number
  readSpeed: number
  writeSpeed: number
}

export function insertDiskStats(db: Database.Database, data: DiskStatsInput): void {
  db.prepare(
    `INSERT INTO disk_stats (timestamp, mount_point, total, used, available, read_speed, write_speed)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(data.timestamp, data.mountPoint, data.total, data.used, data.available, data.readSpeed, data.writeSpeed)
}

interface NetworkStatsInput {
  timestamp: number
  iface: string
  rxBytes: number
  txBytes: number
  rxSpeed: number
  txSpeed: number
}

export function insertNetworkStats(db: Database.Database, data: NetworkStatsInput): void {
  db.prepare(
    `INSERT INTO network_stats (timestamp, interface, rx_bytes, tx_bytes, rx_speed, tx_speed)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(data.timestamp, data.iface, data.rxBytes, data.txBytes, data.rxSpeed, data.txSpeed)
}

interface ProcessSnapshotInput {
  timestamp: number
  pid: number
  name: string
  memoryUsage: number
  cpuUsage: number
  networkUsage: number
}

export function insertProcessSnapshot(db: Database.Database, data: ProcessSnapshotInput): void {
  db.prepare(
    `INSERT INTO process_snapshots (timestamp, pid, name, memory_usage, cpu_usage, network_usage)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(data.timestamp, data.pid, data.name, data.memoryUsage, data.cpuUsage, data.networkUsage)
}

const RANGE_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
}

export function queryHistory(
  db: Database.Database,
  type: 'memory' | 'disk' | 'network',
  range: string
): { timestamp: number; value: number; extra?: Record<string, number> }[] {
  const since = Date.now() - (RANGE_MS[range] ?? RANGE_MS['1h'])

  if (type === 'memory') {
    return db.prepare(
      `SELECT timestamp, used as value, free, cached, swap_used, swap_total
       FROM memory_stats WHERE timestamp > ? ORDER BY timestamp ASC`
    ).all(since) as any[]
  }
  if (type === 'disk') {
    return db.prepare(
      `SELECT timestamp, used as value, total, available
       FROM disk_stats WHERE timestamp > ? ORDER BY timestamp ASC`
    ).all(since) as any[]
  }
  return db.prepare(
    `SELECT timestamp, rx_speed as value, tx_speed
     FROM network_stats WHERE timestamp > ? ORDER BY timestamp ASC`
  ).all(since) as any[]
}

export function cleanupOldData(db: Database.Database, retentionDays: number): void {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  db.prepare('DELETE FROM memory_stats WHERE timestamp < ?').run(cutoff)
  db.prepare('DELETE FROM disk_stats WHERE timestamp < ?').run(cutoff)
  db.prepare('DELETE FROM network_stats WHERE timestamp < ?').run(cutoff)
  db.prepare('DELETE FROM process_snapshots WHERE timestamp < ?').run(cutoff)
}
