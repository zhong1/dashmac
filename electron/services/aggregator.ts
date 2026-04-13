import type Database from 'better-sqlite3'

export function downsampleOldData(db: Database.Database, retentionDaysForRaw: number): void {
  downsampleTable(db, 'memory_stats', retentionDaysForRaw, ['total', 'used', 'free', 'cached', 'swap_used', 'swap_total'], 'pressure_level')
  downsampleTable(db, 'disk_stats', retentionDaysForRaw, ['total', 'used', 'available', 'read_speed', 'write_speed'], 'mount_point')
  downsampleTable(db, 'network_stats', retentionDaysForRaw, ['rx_bytes', 'tx_bytes', 'rx_speed', 'tx_speed'], 'interface')
}

function downsampleTable(
  db: Database.Database,
  table: string,
  retentionDaysForRaw: number,
  numericCols: string[],
  groupCol: string
): void {
  const cutoff = Date.now() - retentionDaysForRaw * 24 * 60 * 60 * 1000
  const hourMs = 3600000
  const avgSelects = numericCols.map((c) => `ROUND(AVG(${c})) as ${c}`).join(', ')
  const hourBucket = `(timestamp / ${hourMs}) * ${hourMs}`

  const aggregated = db.prepare(
    `SELECT ${hourBucket} as timestamp, ${groupCol}, ${avgSelects}
     FROM ${table}
     WHERE timestamp < ?
     GROUP BY ${hourBucket}, ${groupCol}`
  ).all(cutoff) as any[]

  const deleteStmt = db.prepare(`DELETE FROM ${table} WHERE timestamp < ?`)
  const cols = ['timestamp', groupCol, ...numericCols]
  const placeholders = cols.map(() => '?').join(', ')
  const insertStmt = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`)

  const transaction = db.transaction(() => {
    deleteStmt.run(cutoff)
    for (const row of aggregated) {
      const values = cols.map((c) => row[c])
      insertStmt.run(...values)
    }
  })

  transaction()
}
