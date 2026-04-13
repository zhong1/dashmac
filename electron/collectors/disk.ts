import * as si from 'systeminformation'
import type { RawDiskData } from './types'

export async function collectDisk(): Promise<RawDiskData> {
  const [fsSizes, diskIO] = await Promise.all([si.fsSize(), si.disksIO()])

  const volumes = fsSizes.map((fs) => ({
    mountPoint: fs.mount,
    total: fs.size,
    used: fs.used,
    available: fs.available,
    usagePercent: fs.use,
  }))

  return {
    volumes,
    io: {
      readSpeed: diskIO?.rIO_sec ?? 0,
      writeSpeed: diskIO?.wIO_sec ?? 0,
    },
  }
}
