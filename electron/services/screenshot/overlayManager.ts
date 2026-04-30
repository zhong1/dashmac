import { BrowserWindow, type NativeImage } from 'electron'
import path from 'path'
import type { DisplayCapture } from './capture'

export class OverlayManager {
  private windows: BrowserWindow[] = []
  private captures = new Map<number, { image: NativeImage; scaleFactor: number }>()

  async openAll(captures: DisplayCapture[]): Promise<void> {
    this.captures.clear()
    for (const cap of captures) {
      this.captures.set(cap.displayId, { image: cap.image, scaleFactor: cap.scaleFactor })
    }
    const wins = await Promise.all(captures.map((cap) => this.createWindow(cap)))
    this.windows = wins
  }

  closeAll(): void {
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.close()
    }
    this.windows = []
    this.captures.clear()
  }

  getCaptureFor(displayId: number): { image: NativeImage; scaleFactor: number } | null {
    return this.captures.get(displayId) ?? null
  }

  private async createWindow(cap: DisplayCapture): Promise<BrowserWindow> {
    const win = new BrowserWindow({
      x: cap.bounds.x,
      y: cap.bounds.y,
      width: cap.bounds.width,
      height: cap.bounds.height,
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      fullscreenable: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload-overlay.cjs'),
        contextIsolation: true,
      },
    })
    win.setAlwaysOnTop(true, 'screen-saver')

    if (process.env['ELECTRON_RENDERER_URL']) {
      await win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`)
    } else {
      await win.loadFile(path.join(__dirname, '../renderer/overlay.html'))
    }

    win.webContents.once('did-finish-load', () => {
      win.webContents.send('screenshot:overlay-init', {
        imageDataURL: cap.image.toDataURL(),
        displayId: cap.displayId,
        bounds: cap.bounds,
        scaleFactor: cap.scaleFactor,
      })
    })

    return win
  }
}
