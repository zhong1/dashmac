export interface MemoryData {
  total: number
  used: number
  free: number
  cached: number
  swapUsed: number
  swapTotal: number
  pressureLevel: 'normal' | 'warn' | 'critical'
  usagePercent: number
}

export interface DiskVolume {
  mountPoint: string
  total: number
  used: number
  available: number
  usagePercent: number
}

export interface DiskIO {
  readSpeed: number
  writeSpeed: number
}

export interface NetworkInterface {
  iface: string
  ip4: string
  type: string
  speed: number
}

export interface NetworkSpeed {
  rxSpeed: number
  txSpeed: number
  rxBytes: number
  txBytes: number
}

export interface ProcessInfo {
  pid: number
  name: string
  memoryUsage: number
  cpuUsage: number
}

export interface NetworkConnection {
  protocol: string
  localAddress: string
  localPort: number
  peerAddress: string
  peerPort: number
  state: string
  process: string
}

export interface FileEntry {
  path: string
  name: string
  size: number
  isDirectory: boolean
  children?: FileEntry[]
}

export interface AppTraffic {
  appName: string
  rxTotal: number
  txTotal: number
}

export interface HistoryQuery {
  type: 'memory' | 'disk' | 'network'
  range: '1h' | '24h' | '7d' | '30d' | '90d'
}

export interface HistoryPoint {
  timestamp: number
  value: number
  extra?: Record<string, number>
}

export interface DashMacAPI {
  onRealtimeMemory: (callback: (data: MemoryData) => void) => () => void
  onRealtimeDisk: (callback: (data: { volumes: DiskVolume[]; io: DiskIO }) => void) => () => void
  onRealtimeNetwork: (callback: (data: { interfaces: NetworkInterface[]; speed: NetworkSpeed }) => void) => () => void
  queryHistory: (query: HistoryQuery) => Promise<HistoryPoint[]>
  queryProcesses: () => Promise<ProcessInfo[]>
  queryDiskScan: (path: string) => Promise<FileEntry>
  queryConnections: () => Promise<NetworkConnection[]>
  queryAppTraffic: (range: '24h' | '7d' | '30d') => Promise<AppTraffic[]>
  exportData: (format: 'csv' | 'json', type: string) => Promise<string>
  revealFile: (path: string) => void
  openMainWindow: () => void
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<void>
  onLangChanged: (callback: (lang: 'en' | 'zh-CN') => void) => () => void
}

export interface AppSettings {
  realtimeInterval: number
  historyInterval: number
  retentionDays: number
  trayDisplayMetric: 'memory' | 'cpu' | 'network' | 'none'
  launchAtLogin: boolean
  language: 'auto' | 'en' | 'zh-CN'
  resolvedLanguage: 'en' | 'zh-CN'
}

declare global {
  interface Window {
    api: DashMacAPI
  }
}
