import { contextBridge, ipcRenderer } from 'electron'
import type { DashMacAPI } from '../src/types'

const api: DashMacAPI = {
  onRealtimeMemory: (callback) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('realtime:memory', handler)
    return () => ipcRenderer.removeListener('realtime:memory', handler)
  },
  onRealtimeDisk: (callback) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('realtime:disk', handler)
    return () => ipcRenderer.removeListener('realtime:disk', handler)
  },
  onRealtimeNetwork: (callback) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('realtime:network', handler)
    return () => ipcRenderer.removeListener('realtime:network', handler)
  },
  onLangChanged: (callback: (lang: 'en' | 'zh-CN') => void) => {
    const listener = (_event: Electron.IpcRendererEvent, lang: 'en' | 'zh-CN') => callback(lang)
    ipcRenderer.on('i18n:lang-changed', listener)
    return () => ipcRenderer.removeListener('i18n:lang-changed', listener)
  },
  onDirChanged: (callback: (path: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, p: string) => callback(p)
    ipcRenderer.on('fs:dir-changed', listener)
    return () => ipcRenderer.removeListener('fs:dir-changed', listener)
  },
  queryHistory: (query) => ipcRenderer.invoke('query:history', query),
  queryProcesses: () => ipcRenderer.invoke('query:processes'),
  queryDiskScan: (path) => ipcRenderer.invoke('query:disk-scan', path),
  queryConnections: () => ipcRenderer.invoke('query:connections'),
  queryAppTraffic: (range) => ipcRenderer.invoke('query:app-traffic', range),
  listDirectory: (p: string) => ipcRenderer.invoke('fs:list', p),
  fsCreateFolder: (parent: string, name: string) => ipcRenderer.invoke('fs:create-folder', parent, name),
  fsCreateFile: (parent: string, name: string) => ipcRenderer.invoke('fs:create-file', parent, name),
  fsRename: (oldPath: string, newName: string) => ipcRenderer.invoke('fs:rename', oldPath, newName),
  fsTrash: (paths: string[]) => ipcRenderer.invoke('fs:trash', paths),
  fsCopy: (paths: string[], destDir: string) => ipcRenderer.invoke('fs:copy', paths, destDir),
  fsMove: (paths: string[], destDir: string) => ipcRenderer.invoke('fs:move', paths, destDir),
  fsZip: (paths: string[], destDir: string) => ipcRenderer.invoke('fs:zip', paths, destDir),
  fsOpen: (p: string) => ipcRenderer.invoke('fs:open', p),
  exportData: (format, type) => ipcRenderer.invoke('action:export', format, type),
  revealFile: (path) => ipcRenderer.send('action:reveal-file', path),
  openMainWindow: () => ipcRenderer.send('action:open-main-window'),
  killProcess: (pid: number, name: string, signal: 'SIGTERM' | 'SIGKILL') =>
    ipcRenderer.invoke('action:kill-process', pid, name, signal),
  getSettings: () => ipcRenderer.invoke('get:settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save:settings', settings),
}

contextBridge.exposeInMainWorld('api', api)
