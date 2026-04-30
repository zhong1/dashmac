import { describe, expect, test, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  globalShortcut: {
    register: vi.fn(),
    unregister: vi.fn(),
    isRegistered: vi.fn(),
  },
}))

import { globalShortcut } from 'electron'
import { CaptureHotkey } from '../../../electron/services/screenshot/hotkeys'

describe('CaptureHotkey', () => {
  beforeEach(() => {
    vi.mocked(globalShortcut.register).mockReset().mockReturnValue(true)
    vi.mocked(globalShortcut.unregister).mockReset()
    vi.mocked(globalShortcut.isRegistered).mockReset().mockReturnValue(false)
  })

  test('register installs the accelerator with the handler', () => {
    const handler = vi.fn()
    const hk = new CaptureHotkey()
    hk.register('CommandOrControl+Shift+A', handler)
    expect(globalShortcut.register).toHaveBeenCalledWith('CommandOrControl+Shift+A', handler)
  })

  test('register stores the current accelerator', () => {
    const hk = new CaptureHotkey()
    hk.register('CommandOrControl+Shift+A', vi.fn())
    expect(hk.currentAccelerator).toBe('CommandOrControl+Shift+A')
  })

  test('register returns false when register fails (e.g., conflict)', () => {
    vi.mocked(globalShortcut.register).mockReturnValue(false)
    const hk = new CaptureHotkey()
    expect(hk.register('Conflicting+Key', vi.fn())).toBe(false)
    expect(hk.currentAccelerator).toBeNull()
  })

  test('reregister unregisters the old accelerator before registering the new', () => {
    const hk = new CaptureHotkey()
    hk.register('CommandOrControl+Shift+A', vi.fn())
    hk.reregister('F1', vi.fn())
    expect(globalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+Shift+A')
    expect(globalShortcut.register).toHaveBeenLastCalledWith('F1', expect.any(Function))
    expect(hk.currentAccelerator).toBe('F1')
  })

  test('unregisterAll clears the registration', () => {
    const hk = new CaptureHotkey()
    hk.register('CommandOrControl+Shift+A', vi.fn())
    hk.unregisterAll()
    expect(globalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+Shift+A')
    expect(hk.currentAccelerator).toBeNull()
  })

  test('reregister with the same accelerator is a no-op when already current', () => {
    const hk = new CaptureHotkey()
    hk.register('CommandOrControl+Shift+A', vi.fn())
    vi.mocked(globalShortcut.register).mockClear()
    hk.reregister('CommandOrControl+Shift+A', vi.fn())
    expect(globalShortcut.register).not.toHaveBeenCalled()
  })
})
