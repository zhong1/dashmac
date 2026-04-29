import { reverse } from 'dns/promises'

const TIMEOUT_MS = 1_000
const DEFAULT_CAP = 1000

let cap = DEFAULT_CAP
const cache = new Map<string, string | null>()
const inFlight = new Map<string, Promise<string | null>>()

export async function lookup(ip: string): Promise<string | null> {
  if (cache.has(ip)) {
    const value = cache.get(ip) as string | null
    // Touch for LRU
    cache.delete(ip); cache.set(ip, value)
    return value
  }
  const pending = inFlight.get(ip)
  if (pending) return pending

  const promise = doLookup(ip)
  inFlight.set(ip, promise)
  try {
    const result = await promise
    insertIntoCache(ip, result)
    return result
  } finally {
    inFlight.delete(ip)
  }
}

async function doLookup(ip: string): Promise<string | null> {
  try {
    const result = await Promise.race([
      reverse(ip),
      new Promise<string[]>((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS)),
    ])
    return result?.[0] ?? null
  } catch {
    return null
  }
}

function insertIntoCache(key: string, value: string | null): void {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  while (cache.size > cap) {
    const oldest = cache.keys().next().value as string | undefined
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

// Test-only helpers (prefixed with `_` to discourage normal use)
export function _resetCacheForTest(): void {
  cache.clear()
  inFlight.clear()
  cap = DEFAULT_CAP
}

export function _setCapForTest(n: number): void {
  cap = n
}
