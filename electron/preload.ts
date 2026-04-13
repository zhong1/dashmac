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
  queryHistory: (query) => ipcRenderer.invoke('query:history', query),
  queryProcesses: () => ipcRenderer.invoke('query:processes'),
  queryDiskScan: (path) => ipcRenderer.invoke('query:disk-scan', path),
  queryConnections: () => ipcRenderer.invoke('query:connections'),
  queryAppTraffic: (range) => ipcRenderer.invoke('query:app-traffic', range),
  exportData: (format, type) => ipcRenderer.invoke('action:export', format, type),
  revealFile: (path) => ipcRenderer.send('action:reveal-file', path),
  openMainWindow: () => ipcRenderer.send('action:open-main-window'),
  getSettings: () => ipcRenderer.invoke('get:settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save:settings', settings),
}

contextBridge.exposeInMainWorld('api', api)
