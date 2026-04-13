import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null

function registerIpcHandlers(): void {
  ipcMain.handle('query:history', async (_event, query) => {
    // Implemented in Task 8
    return []
  })

  ipcMain.handle('query:processes', async () => {
    // Implemented in Task 7
    return []
  })

  ipcMain.handle('query:disk-scan', async (_event, scanPath: string) => {
    // Implemented in Task 14
    return { path: scanPath, name: '', size: 0, isDirectory: true, children: [] }
  })

  ipcMain.handle('query:connections', async () => {
    // Implemented in Task 6
    return []
  })

  ipcMain.handle('query:app-traffic', async (_event, range: string) => {
    // Implemented in Task 6
    return []
  })

  ipcMain.handle('action:export', async (_event, format: string, type: string) => {
    // Implemented in Task 19
    return ''
  })

  ipcMain.handle('get:settings', async () => {
    return {
      realtimeInterval: 2000,
      historyInterval: 60000,
      retentionDays: 90,
      trayDisplayMetric: 'memory',
      launchAtLogin: false,
    }
  })

  ipcMain.handle('save:settings', async (_event, settings) => {
    // Implemented in Task 17 (settings persistence)
  })

  ipcMain.on('action:reveal-file', (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.on('action:open-main-window', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d1117',
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

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
