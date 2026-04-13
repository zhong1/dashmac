import * as si from 'systeminformation'
import type { RawMemoryData } from './types'

export async function collectMemory(): Promise<RawMemoryData> {
  const mem = await si.mem()
  const usagePercent = (mem.used / mem.total) * 100

  let pressureLevel: 'normal' | 'warn' | 'critical' = 'normal'
  if (usagePercent >= 90) pressureLevel = 'critical'
  else if (usagePercent >= 75) pressureLevel = 'warn'

  return {
    total: mem.total,
    used: mem.used,
    free: mem.free,
    cached: mem.cached,
    swapUsed: mem.swapused,
    swapTotal: mem.swaptotal,
    pressureLevel,
    usagePercent,
  }
}
