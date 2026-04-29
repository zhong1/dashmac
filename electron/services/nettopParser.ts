export interface NettopRow {
  name: string
  pid: number
  rxBytes: number
  txBytes: number
}

/**
 * Parses one line of `nettop -P -L 0 -s 1 -J bytes_in,bytes_out -t external -x` CSV output.
 *
 * Expected format: ",NAME.PID,RX,TX," where NAME may contain spaces, dots and
 * trailing sub-suffixes (e.g. "Chrome.GPU"). RX/TX may be quoted strings with
 * thousands separators (e.g. "\"1,234,567\"").
 */
export function parseNettopLine(line: string): NettopRow | null {
  const trimmed = line.trim()
  if (trimmed.length === 0) return null
  if (trimmed.includes('bytes_in') || trimmed.includes('bytes_out')) return null

  // Split on commas not inside double-quotes.
  const fields = splitCsv(trimmed)
  if (fields.length < 4) return null

  // Layout: ['', 'name.pid', 'rxBytes', 'txBytes', ''] (leading/trailing may be empty)
  // Find the name+pid field by skipping leading empties.
  let i = 0
  while (i < fields.length && fields[i] === '') i++
  if (i + 2 >= fields.length) return null

  const namePidField = fields[i]
  const rxField = fields[i + 1]
  const txField = fields[i + 2]

  // Split "Name.PID" — last dot-separated segment is PID if numeric.
  const lastDot = namePidField.lastIndexOf('.')
  if (lastDot < 0) return null
  const pidStr = namePidField.slice(lastDot + 1)
  const pid = Number(pidStr)
  if (!Number.isFinite(pid) || !/^\d+$/.test(pidStr)) return null
  const name = namePidField.slice(0, lastDot)
  if (name.length === 0) return null

  const rxBytes = parseNumber(rxField)
  const txBytes = parseNumber(txField)
  if (rxBytes === null || txBytes === null) return null

  return { name, pid, rxBytes, txBytes }
}

function splitCsv(line: string): string[] {
  const out: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { out.push(current); current = ''; continue }
    current += ch
  }
  out.push(current)
  return out
}

function parseNumber(s: string): number | null {
  const cleaned = s.replace(/,/g, '').trim()
  if (cleaned.length === 0) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}
