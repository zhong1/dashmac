import { app } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { AppSettings } from '../../src/types'

export const DEFAULTS: AppSettings = {
  realtimeInterval: 2000,
  historyInterval: 60000,
  retentionDays: 90,
  trayDisplayMetric: 'memory',
  launchAtLogin: false,
  language: 'auto',
  resolvedLanguage: 'en',
  fileShortcuts: [],
  showHiddenFiles: false,
  customCommands: [],
  toolbox: {
    screenshotEnabled: false,
    screenshot: {
      captureHotkey: 'CommandOrControl+Shift+A',
      pinHotkey: 'CommandOrControl+Shift+S',
      hideAllPinsHotkey: 'CommandOrControl+Shift+H',
      saveDir: path.join(os.homedir(), 'Pictures', 'DashMac'),
      defaultPenColor: '#FF0000',
      defaultStrokeWidth: 'medium',
    },
  },
}

function defaultPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function mergeNested<T>(defaults: T, parsed: Partial<T> | undefined): T {
  return { ...defaults, ...(parsed ?? {}) }
}

export function loadSettings(filepath?: string): AppSettings {
  const p = filepath ?? defaultPath()
  try {
    const raw = fs.readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      ...DEFAULTS,
      ...parsed,
      toolbox: {
        ...DEFAULTS.toolbox,
        ...(parsed.toolbox ?? {}),
        screenshot: mergeNested(DEFAULTS.toolbox.screenshot, parsed.toolbox?.screenshot),
      },
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: AppSettings, filepath?: string): void {
  const p = filepath ?? defaultPath()
  const { resolvedLanguage: _drop, ...persisted } = settings
  fs.writeFileSync(p, JSON.stringify(persisted, null, 2), 'utf8')
}
