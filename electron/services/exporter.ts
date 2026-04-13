import type Database from 'better-sqlite3'

const VALID_TABLES = ['memory_stats', 'disk_stats', 'network_stats', 'process_snapshots', 'app_traffic']

export function exportToCSV(db: Database.Database, table: string): string {
  if (!VALID_TABLES.includes(table)) throw new Error(`Invalid table: ${table}`)

  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id ASC`).all() as Record<string, any>[]
  if (rows.length === 0) return ''

  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]

  for (const row of rows) {
    lines.push(headers.map((h) => {
      const val = row[h]
      if (typeof val === 'string' && val.includes(',')) return `"${val}"`
      return String(val ?? '')
    }).join(','))
  }

  return lines.join('\n')
}

export function exportToJSON(db: Database.Database, table: string): string {
  if (!VALID_TABLES.includes(table)) throw new Error(`Invalid table: ${table}`)

  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id ASC`).all()
  return JSON.stringify(rows, null, 2)
}
