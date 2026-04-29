import * as si from 'systeminformation'
import type { RawProcessData } from './types'

export async function collectProcesses(): Promise<RawProcessData[]> {
  const data = await si.processes()
  return data.list
    .map((p) => ({
      pid: p.pid,
      name: p.name,
      memoryUsage: ((p as any).memRss ?? 0) * 1024,
      cpuUsage: p.cpu,
    }))
    .sort((a, b) => b.memoryUsage - a.memoryUsage)
    .slice(0, 100)
}
