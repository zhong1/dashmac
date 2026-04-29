import { spawn, ChildProcess } from 'child_process'
import { parseNettopLine } from './nettopParser'

export interface AppTrafficSnapshot {
  name: string
  rxRate: number   // bytes/sec, last 1s sample
  txRate: number   // bytes/sec
  rxBytes: number  // cumulative since last hourly flush
  txBytes: number
}

interface ProcEntry {
  rxRate: number
  txRate: number
  rxBytes: number
  txBytes: number
  lastSeenRx: number  // last absolute reading from nettop
  lastSeenTx: number
}

const MAX_RESTARTS_PER_MINUTE = 5
const RESTART_BACKOFF_MS = 5_000

let child: ChildProcess | null = null
let entries: Map<string, ProcEntry> = new Map()
let buffer = ''
let restartTimes: number[] = []
let unavailable = false
let onUnavailableCallbacks: Array<() => void> = []

export function onUnavailable(cb: () => void): void {
  onUnavailableCallbacks.push(cb)
}

export function isUnavailable(): boolean {
  return unavailable
}

export async function start(): Promise<void> {
  if (child) return  // already running
  await spawnNettop()
}

export function stop(): void {
  if (child) {
    child.kill('SIGTERM')
    child = null
  }
  entries.clear()
  buffer = ''
  restartTimes = []
}

export function getCurrent(): AppTrafficSnapshot[] {
  // Aggregate by base name (collapse ".GPU"/.Renderer/etc. suffixes)
  const aggregated = new Map<string, AppTrafficSnapshot>()
  for (const [key, e] of entries) {
    const baseName = key.split('.')[0]
    const existing = aggregated.get(baseName)
    if (existing) {
      existing.rxRate += e.rxRate
      existing.txRate += e.txRate
      existing.rxBytes += e.rxBytes
      existing.txBytes += e.txBytes
    } else {
      aggregated.set(baseName, {
        name: baseName,
        rxRate: e.rxRate, txRate: e.txRate,
        rxBytes: e.rxBytes, txBytes: e.txBytes,
      })
    }
  }
  return Array.from(aggregated.values())
}

export function flushHourly(): { name: string; rxDelta: number; txDelta: number }[] {
  const out: { name: string; rxDelta: number; txDelta: number }[] = []
  const aggregated = new Map<string, { rxDelta: number; txDelta: number }>()
  for (const [key, e] of entries) {
    const baseName = key.split('.')[0]
    const existing = aggregated.get(baseName) ?? { rxDelta: 0, txDelta: 0 }
    existing.rxDelta += e.rxBytes
    existing.txDelta += e.txBytes
    aggregated.set(baseName, existing)
    e.rxBytes = 0
    e.txBytes = 0
  }
  for (const [name, { rxDelta, txDelta }] of aggregated) {
    if (rxDelta > 0 || txDelta > 0) out.push({ name, rxDelta, txDelta })
  }
  return out
}

async function spawnNettop(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      child = spawn('nettop', ['-P', '-L', '0', '-s', '1', '-J', 'bytes_in,bytes_out', '-t', 'external', '-x'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      markUnavailable()
      reject(err)
      return
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      let idx
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        processLine(line)
      }
    })

    child.on('exit', (code) => {
      child = null
      if (code !== 0 && !unavailable) {
        scheduleRestart()
      }
    })

    child.on('error', () => {
      markUnavailable()
    })

    // Resolve immediately; nettop runs in background.
    resolve()
  })
}

function processLine(line: string): void {
  const row = parseNettopLine(line)
  if (!row) return
  const key = `${row.name}.${row.pid}`
  const existing = entries.get(key)
  if (!existing) {
    entries.set(key, {
      rxRate: 0, txRate: 0,
      rxBytes: 0, txBytes: 0,
      lastSeenRx: row.rxBytes, lastSeenTx: row.txBytes,
    })
    return
  }
  // nettop in interval mode (-s 1) prints per-interval bytes for that 1s window.
  // Use the printed value directly as the rate; accumulate for cumulative bytes.
  existing.rxRate = row.rxBytes
  existing.txRate = row.txBytes
  existing.rxBytes += row.rxBytes
  existing.txBytes += row.txBytes
  existing.lastSeenRx = row.rxBytes
  existing.lastSeenTx = row.txBytes
}

function scheduleRestart(): void {
  const now = Date.now()
  restartTimes = restartTimes.filter((t) => now - t < 60_000)
  restartTimes.push(now)
  if (restartTimes.length > MAX_RESTARTS_PER_MINUTE) {
    markUnavailable()
    return
  }
  setTimeout(() => { spawnNettop().catch(markUnavailable) }, RESTART_BACKOFF_MS)
}

function markUnavailable(): void {
  unavailable = true
  child = null
  for (const cb of onUnavailableCallbacks) {
    try { cb() } catch {}
  }
}
