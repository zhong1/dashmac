import { contextBridge, ipcRenderer } from 'electron'

interface OverlayInitPayload {
  imageDataURL: string
  displayId: number
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
}

interface ConfirmPayload {
  action: 'copy'
  displayId: number
  selection: { x: number; y: number; w: number; h: number }
}

contextBridge.exposeInMainWorld('overlay', {
  onInit: (cb: (payload: OverlayInitPayload) => void) => {
    const handler = (_e: unknown, p: OverlayInitPayload) => cb(p)
    ipcRenderer.on('screenshot:overlay-init', handler)
    return () => ipcRenderer.removeListener('screenshot:overlay-init', handler)
  },
  confirm: (payload: ConfirmPayload) => ipcRenderer.send('screenshot:confirm', payload),
  cancel: () => ipcRenderer.send('screenshot:cancel'),
})

declare global {
  interface Window {
    overlay: {
      onInit: (cb: (payload: OverlayInitPayload) => void) => () => void
      confirm: (payload: ConfirmPayload) => void
      cancel: () => void
    }
  }
}
