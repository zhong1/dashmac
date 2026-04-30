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

// Flat file-system entry returned by listDirectory. Distinct from FileEntry
// (which is recursive with `children` and used by the Treemap analytics view).
export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number          // 0 for directories
  modifiedAt: number    // ms since epoch
  ext: string           // lowercase, includes dot; '' for directories or no ext
}

export interface AppTraffic {
  appName: string
  rxTotal: number
  txTotal: number
}

export interface AppTrafficSnapshot {
  name: string
  rxRate: number   // bytes/sec, last 1s sample
  txRate: number   // bytes/sec
  rxBytes: number  // cumulative since last hourly flush
  txBytes: number
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
  queryAppTraffic: (range: 'today' | '7d' | '30d') => Promise<AppTraffic[]>
  queryAppTrafficCurrent: () => Promise<AppTrafficSnapshot[]>
  queryCumulativeTraffic: (range: 'today' | '7d' | '30d') => Promise<{ rxTotal: number; txTotal: number }>
  dnsReverse: (ips: string[]) => Promise<Record<string, string | null>>
  onAppTraffic: (callback: (snapshot: AppTrafficSnapshot[]) => void) => () => void
  exportData: (format: 'csv' | 'json', type: string) => Promise<string>
  revealFile: (path: string) => void
  openMainWindow: () => void
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<void>
  // File browser
  listDirectory: (path: string) => Promise<
    | { ok: true; entries: DirEntry[] }
    | { ok: false; errno: string; message: string }
  >
  fsCreateFolder: (parent: string, name: string) => Promise<
    | { ok: true; path: string }
    | { ok: false; message: string }
  >
  fsCreateFile: (parent: string, name: string) => Promise<
    | { ok: true; path: string }
    | { ok: false; message: string }
  >
  fsRename: (oldPath: string, newName: string) => Promise<
    | { ok: true; path: string }
    | { ok: false; message: string }
  >
  fsTrash: (paths: string[]) => Promise<
    | { ok: true }
    | { ok: false; failed: string[]; message: string }
  >
  fsCopy: (paths: string[], destDir: string) => Promise<
    | { ok: true }
    | { ok: false; failed: string[]; message: string }
  >
  fsMove: (paths: string[], destDir: string) => Promise<
    | { ok: true }
    | { ok: false; failed: string[]; message: string }
  >
  fsZip: (paths: string[], destDir: string) => Promise<
    | { ok: true; path: string }
    | { ok: false; message: string }
  >
  fsOpen: (path: string) => Promise<
    | { ok: true }
    | { ok: false; message: string }
  >
  onDirChanged: (callback: (path: string) => void) => () => void
  onLangChanged: (callback: (lang: 'en' | 'zh-CN') => void) => () => void
  // Process management
  killProcess: (
    pid: number,
    name: string,
    signal: 'SIGTERM' | 'SIGKILL',
  ) => Promise<
    | { ok: true }
    | { ok: false; cancelled: true }
    | { ok: false; message: string }
  >
  runCommand: (
    commandId: string,
    paths: string[],
  ) => Promise<
    | { ok: true; runId: string }
    | { ok: false; message: string }
  >
  onCommandProgress: (callback: (event: CustomCommandProgressEvent) => void) => () => void
}

export interface AppSettings {
  realtimeInterval: number
  historyInterval: number
  retentionDays: number
  trayDisplayMetric: 'memory' | 'cpu' | 'network' | 'none'
  launchAtLogin: boolean
  language: 'auto' | 'en' | 'zh-CN'
  resolvedLanguage: 'en' | 'zh-CN'
  fileShortcuts: string[]      // NEW; absolute paths; default []
  showHiddenFiles: boolean     // NEW; default false
  customCommands: CustomCommand[]
  toolbox: ToolboxSettings
}

export interface ToolboxSettings {
  screenshotEnabled: boolean   // default: false
}

export interface CustomCommand {
  id: string
  label: string
  command: string
  pathMode?: 'absolute' | 'basename'   // default 'absolute'
  useShell?: boolean                   // default false; set true for ~/.zshrc functions/aliases
}

export type CustomCommandProgressEvent =
  | { type: 'start'; runId: string; commandLabel: string; total: number }
  | { type: 'advance'; runId: string; done: number; current: string }
  | { type: 'fileError'; runId: string; path: string; message: string; stderr: string }
  | { type: 'finish'; runId: string; ok: number; failed: number }

declare global {
  interface Window {
    api: DashMacAPI
  }
}
