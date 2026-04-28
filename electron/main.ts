import { app, BrowserWindow, ipcMain, shell, Tray, nativeImage, Menu } from 'electron'
import path from 'path'
import { getDatabase, closeDatabase } from './database/index'
import { insertMemoryStats, insertDiskStats, insertNetworkStats, queryHistory, cleanupOldData } from './database/queries'
import { collectMemory } from './collectors/memory'
import { collectDisk } from './collectors/disk'
import { collectNetwork, collectConnections } from './collectors/network'
import { collectProcesses } from './collectors/process'
import { Scheduler } from './services/scheduler'
import { downsampleOldData } from './services/aggregator'
import { loadSettings, saveSettings as persistSettings } from './services/settingsStore'
import { resolveLang, setLang, getLang, t } from './i18n/index'
import type { AppSettings } from '../src/types'

let mainWindow: BrowserWindow | null = null
let trayWindow: BrowserWindow | null = null
let tray: Tray | null = null
let scheduler: Scheduler | null = null

function sendToAllWindows(channel: string, data: any): void {
  mainWindow?.webContents.send(channel, data)
  trayWindow?.webContents.send(channel, data)
}

async function realtimeTick(): Promise<void> {
  const [memory, disk, network] = await Promise.all([
    collectMemory(),
    collectDisk(),
    collectNetwork(),
  ])
  sendToAllWindows('realtime:memory', memory)
  sendToAllWindows('realtime:disk', disk)
  sendToAllWindows('realtime:network', network)
}

async function persistTick(): Promise<void> {
  const db = getDatabase()
  const now = Date.now()
  const [memory, disk, network] = await Promise.all([
    collectMemory(),
    collectDisk(),
    collectNetwork(),
  ])

  insertMemoryStats(db, {
    timestamp: now, total: memory.total, used: memory.used, free: memory.free,
    cached: memory.cached, swapUsed: memory.swapUsed, swapTotal: memory.swapTotal,
    pressureLevel: memory.pressureLevel,
  })

  for (const vol of disk.volumes) {
    insertDiskStats(db, {
      timestamp: now, mountPoint: vol.mountPoint, total: vol.total,
      used: vol.used, available: vol.available,
      readSpeed: disk.io.readSpeed, writeSpeed: disk.io.writeSpeed,
    })
  }

  insertNetworkStats(db, {
    timestamp: now, iface: network.interfaces[0]?.iface ?? 'unknown',
    rxBytes: network.speed.rxBytes, txBytes: network.speed.txBytes,
    rxSpeed: network.speed.rxSpeed, txSpeed: network.speed.txSpeed,
  })
}

function registerIpcHandlers(): void {
  const db = getDatabase()

  ipcMain.handle('query:history', async (_event, query) => {
    return queryHistory(db, query.type, query.range)
  })
  ipcMain.handle('query:processes', async () => {
    return collectProcesses()
  })
  ipcMain.handle('query:disk-scan', async (_event, scanPath: string) => {
    return { path: scanPath, name: path.basename(scanPath), size: 0, isDirectory: true, children: [] }
  })
  ipcMain.handle('query:connections', async () => {
    return collectConnections()
  })
  ipcMain.handle('query:app-traffic', async (_event, _range: string) => {
    return []
  })
  ipcMain.handle('action:export', async (_event, _format: string, _type: string) => {
    return ''
  })
  ipcMain.handle('get:settings', async () => {
    const stored = loadSettings()
    return { ...stored, resolvedLanguage: resolveLang(stored.language, app.getLocale()) }
  })
  ipcMain.handle('save:settings', async (_event, settings: AppSettings) => {
    persistSettings(settings)
    const newResolved = resolveLang(settings.language, app.getLocale())
    if (newResolved !== getLang()) {
      setLang(newResolved)
      rebuildTrayMenu()
      sendToAllWindows('i18n:lang-changed', newResolved)
    }
  })

  ipcMain.on('action:reveal-file', (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })
  ipcMain.on('action:open-main-window', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus() } else { createMainWindow() }
  })
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600,
    titleBarStyle: 'hiddenInset', backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      sandbox: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  mainWindow.on('closed', () => { mainWindow = null })
}

function rebuildTrayMenu(): void {
  if (!tray) return
  tray.setToolTip(t('tray.tooltip'))
  const contextMenu = Menu.buildFromTemplate([
    { label: t('tray.open'), click: () => {
      if (mainWindow) { mainWindow.show(); mainWindow.focus() } else { createMainWindow() }
    }},
    { type: 'separator' },
    { label: t('tray.quit'), click: () => app.quit() },
  ])
  tray.setContextMenu(contextMenu)
}

function createTray(): void {
  const iconPath = path.join(__dirname, '../../resources/trayTemplate.png')
  let icon: Electron.NativeImage
  try { icon = nativeImage.createFromPath(iconPath) } catch { icon = nativeImage.createEmpty() }
  tray = new Tray(icon)
  rebuildTrayMenu()
}

function startScheduler(): void {
  scheduler = new Scheduler({
    realtimeInterval: 2000, persistInterval: 60000,
    onRealtimeTick: realtimeTick, onPersistTick: persistTick,
  })
  scheduler.start()

  setInterval(() => {
    const db = getDatabase()
    downsampleOldData(db, 7)
    cleanupOldData(db, 90)
  }, 24 * 60 * 60 * 1000)
}

app.whenReady().then(() => {
  const stored = loadSettings()
  const resolved = resolveLang(stored.language, app.getLocale())
  setLang(resolved)
  registerIpcHandlers()
  createMainWindow()
  createTray()
  startScheduler()
})

app.on('window-all-closed', () => {})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
})

app.on('before-quit', () => {
  scheduler?.stop()
  closeDatabase()
})
