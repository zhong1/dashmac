import { describe, expect, test, vi, beforeEach } from 'vitest'

const { FakeBrowserWindow, constructorSpy } = vi.hoisted(() => {
  const constructorSpy = vi.fn()
  class FakeBrowserWindow {
    static instances: any[] = []
    webContents = {
      once: vi.fn(),
      send: vi.fn(),
    }
    loadFile = vi.fn().mockResolvedValue(undefined)
    loadURL = vi.fn().mockResolvedValue(undefined)
    setAlwaysOnTop = vi.fn()
    show = vi.fn()
    isDestroyedFlag = false
    close = vi.fn(function (this: any) { this.isDestroyedFlag = true })
    isDestroyed = vi.fn(function (this: any) { return !!this.isDestroyedFlag })

    constructor(opts: any) {
      constructorSpy(opts)
      FakeBrowserWindow.instances.push(this)
    }
  }
  return { FakeBrowserWindow, constructorSpy }
})

vi.mock('electron', () => ({
  BrowserWindow: FakeBrowserWindow,
}))

import { OverlayManager } from '../../../electron/services/screenshot/overlayManager'

const fakeImage = {
  toDataURL: () => 'data:image/png;base64,abc',
} as any

describe('OverlayManager', () => {
  beforeEach(() => {
    constructorSpy.mockReset()
    FakeBrowserWindow.instances = []
  })

  test('openAll creates one window per display', async () => {
    const mgr = new OverlayManager()
    await mgr.openAll([
      { displayId: 1, image: fakeImage, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 2 },
      { displayId: 2, image: fakeImage, bounds: { x: 1920, y: 0, width: 1280, height: 720 }, scaleFactor: 1 },
    ])
    expect(FakeBrowserWindow.instances).toHaveLength(2)
    expect(constructorSpy).toHaveBeenCalledWith(expect.objectContaining({
      x: 0, y: 0, width: 1920, height: 1080, frame: false,
    }))
    expect(constructorSpy).toHaveBeenCalledWith(expect.objectContaining({
      x: 1920, y: 0, width: 1280, height: 720,
    }))
  })

  test('openAll calls setAlwaysOnTop with screen-saver level', async () => {
    const mgr = new OverlayManager()
    await mgr.openAll([{ displayId: 1, image: fakeImage, bounds: { x: 0, y: 0, width: 800, height: 600 }, scaleFactor: 1 }])
    expect(FakeBrowserWindow.instances[0].setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
  })

  test('closeAll closes every window and clears the list', async () => {
    const mgr = new OverlayManager()
    await mgr.openAll([
      { displayId: 1, image: fakeImage, bounds: { x: 0, y: 0, width: 800, height: 600 }, scaleFactor: 1 },
      { displayId: 2, image: fakeImage, bounds: { x: 800, y: 0, width: 800, height: 600 }, scaleFactor: 1 },
    ])
    mgr.closeAll()
    expect(FakeBrowserWindow.instances[0].close).toHaveBeenCalled()
    expect(FakeBrowserWindow.instances[1].close).toHaveBeenCalled()
  })

  test('closeAll is idempotent (safe to call when nothing is open)', () => {
    const mgr = new OverlayManager()
    expect(() => mgr.closeAll()).not.toThrow()
  })

  test('getCaptureFor returns the captured image for a displayId', async () => {
    const mgr = new OverlayManager()
    await mgr.openAll([
      { displayId: 7, image: fakeImage, bounds: { x: 0, y: 0, width: 800, height: 600 }, scaleFactor: 2 },
    ])
    expect(mgr.getCaptureFor(7)).toEqual({ image: fakeImage, scaleFactor: 2 })
    expect(mgr.getCaptureFor(99)).toBeNull()
  })
})
