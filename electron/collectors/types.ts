export interface RawMemoryData {
  total: number
  used: number
  free: number
  cached: number
  swapUsed: number
  swapTotal: number
  pressureLevel: 'normal' | 'warn' | 'critical'
  usagePercent: number
}

export interface RawDiskData {
  volumes: {
    mountPoint: string
    total: number
    used: number
    available: number
    usagePercent: number
  }[]
  io: {
    readSpeed: number
    writeSpeed: number
  }
}

export interface RawNetworkData {
  interfaces: {
    iface: string
    ip4: string
    type: string
    speed: number
  }[]
  speed: {
    rxSpeed: number
    txSpeed: number
    rxBytes: number
    txBytes: number
  }
}

export interface RawProcessData {
  pid: number
  name: string
  memoryUsage: number
  cpuUsage: number
}
