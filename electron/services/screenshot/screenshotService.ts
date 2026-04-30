import { clipboard, Notification, BrowserWindow } from 'electron'
import { takeScreenshots } from './capture'
import { OverlayManager } from './overlayManager'
import { checkScreenRecordingPermission, showDeniedDialog } from './permissions'
import { cssRectToNativePx, clampRectToBounds, type Rect } from './coordTransform'
import { CaptureHotkey } from './hotkeys'

export type CaptureSource = 'card' | 'hotkey'

export interface ConfirmPayload {
  action: 'copy'
  displayId: number
  selection: Rect
}

export class ScreenshotService {
  private overlayManager = new OverlayManager()
  hotkey = new CaptureHotkey()
  private currentSource: CaptureSource = 'hotkey'
  private mainWindow: BrowserWindow | null = null
  private t: (key: string) => string = (k) => k

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win
  }

  setTranslator(t: (key: string) => string): void {
    this.t = t
  }

  async runCapture(source: CaptureSource): Promise<void> {
    this.currentSource = source

    const status = checkScreenRecordingPermission()
    if (status === 'denied' || status === 'restricted') {
      await showDeniedDialog(this.t)
      return
    }

    try {
      const captures = await takeScreenshots()
      const after = checkScreenRecordingPermission()
      if (after === 'denied') {
        await showDeniedDialog(this.t)
        return
      }
      await this.overlayManager.openAll(captures)
    } catch (err) {
      console.error('[screenshot] capture failed:', err)
    }
  }

  async handleConfirm(payload: ConfirmPayload): Promise<void> {
    if (payload.action !== 'copy') return

    const cap = this.overlayManager.getCaptureFor(payload.displayId)
    if (!cap) {
      console.warn('[screenshot] no capture for displayId', payload.displayId)
      this.overlayManager.closeAll()
      return
    }

    const nativeBounds = cssRectToNativePx(payload.selection, cap.scaleFactor)
    const imageSize = cap.image.getSize()
    const clamped = clampRectToBounds(nativeBounds, { w: imageSize.width, h: imageSize.height })
    if (clamped.w === 0 || clamped.h === 0) {
      this.overlayManager.closeAll()
      return
    }
    const cropped = cap.image.crop({ x: clamped.x, y: clamped.y, width: clamped.w, height: clamped.h })

    clipboard.writeImage(cropped)
    this.overlayManager.closeAll()
    this.notifyCopied()
  }

  handleCancel(): void {
    this.overlayManager.closeAll()
  }

  private notifyCopied(): void {
    const message = this.t('screenshot.toast.copied')
    if (this.currentSource === 'card' && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('toast:push', { kind: 'success', message })
    } else {
      new Notification({ title: 'DashMac', body: message }).show()
    }
  }
}
