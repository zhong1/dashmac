import { systemPreferences, shell, dialog } from 'electron'

export type ScreenPermission = 'granted' | 'denied' | 'not-determined' | 'restricted'

const TCC_DEEPLINK = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

export function checkScreenRecordingPermission(): ScreenPermission {
  if (process.platform !== 'darwin') return 'granted'
  return systemPreferences.getMediaAccessStatus('screen') as ScreenPermission
}

export function openSystemSettings(): void {
  shell.openExternal(TCC_DEEPLINK)
}

export async function showDeniedDialog(t: (key: string) => string): Promise<void> {
  const result = await dialog.showMessageBox({
    type: 'info',
    title: t('screenshot.permission.title'),
    message: t('screenshot.permission.message'),
    detail: t('screenshot.permission.detail'),
    buttons: [
      t('screenshot.permission.openSettings'),
      t('screenshot.permission.later'),
    ],
    defaultId: 0,
    cancelId: 1,
  })
  if (result.response === 0) {
    openSystemSettings()
  }
}
