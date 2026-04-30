import { describe, expect, test, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  systemPreferences: {
    getMediaAccessStatus: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
  dialog: {
    showMessageBox: vi.fn(),
  },
}))

import { systemPreferences, shell, dialog } from 'electron'
import { checkScreenRecordingPermission, openSystemSettings, showDeniedDialog } from '../../../electron/services/screenshot/permissions'

describe('checkScreenRecordingPermission', () => {
  beforeEach(() => {
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReset()
  })

  test('returns "granted" on darwin when status is granted', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('granted')
    expect(checkScreenRecordingPermission()).toBe('granted')
  })

  test('returns "denied" on darwin when status is denied', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('denied')
    expect(checkScreenRecordingPermission()).toBe('denied')
  })

  test('returns "not-determined" on darwin when undetermined', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('not-determined')
    expect(checkScreenRecordingPermission()).toBe('not-determined')
  })

  test('returns "granted" on non-darwin (dev fallback)', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    expect(checkScreenRecordingPermission()).toBe('granted')
  })
})

describe('openSystemSettings', () => {
  test('calls shell.openExternal with TCC ScreenCapture deeplink', () => {
    vi.mocked(shell.openExternal).mockReset()
    openSystemSettings()
    expect(shell.openExternal).toHaveBeenCalledWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  })
})

describe('showDeniedDialog', () => {
  test('opens system settings when user clicks first button', async () => {
    vi.mocked(shell.openExternal).mockReset()
    vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 0, checkboxChecked: false })
    await showDeniedDialog((k) => k)
    expect(shell.openExternal).toHaveBeenCalled()
  })

  test('does nothing when user clicks "Later"', async () => {
    vi.mocked(shell.openExternal).mockReset()
    vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false })
    await showDeniedDialog((k) => k)
    expect(shell.openExternal).not.toHaveBeenCalled()
  })
})
