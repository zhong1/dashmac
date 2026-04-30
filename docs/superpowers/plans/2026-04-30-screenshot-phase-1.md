# Screenshot Phase 1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Press `⌘+⇧+A` (or click the toolbox screenshot card) → permission check → grab screen per display → frameless overlay window per display → drag rectangle selection → small toolbar (Copy / Cancel) below selection with handles for resize/move → confirm copies cropped image to clipboard. Includes basic Snipaste-style magnifier showing pixel info.

**Architecture:** Five layers, each in its own commit-cluster.
1. **Data:** extend `AppSettings.toolbox.screenshot` with full 6-field shape (all phases included now to avoid future schema migrations) + 3-level nested merge in `loadSettings`.
2. **Main-process services** (TDD where mockable): `permissions.ts`, `coordTransform.ts`, `capture.ts`, `overlayManager.ts`, `hotkeys.ts`, `screenshotService.ts` + IPC handlers in `main.ts`.
3. **Overlay renderer** (no tests, manual verify): new electron-vite renderer input `overlay.html` + dedicated preload + React app with state machine, selection layer, magnifier, toolbar.
4. **Wiring:** ToolboxPage card click rewires from "Coming soon" placeholder to capture trigger; Settings UI gains capture hotkey input + live permission status.
5. **Final integration:** manual checklist + bug fixes.

**Tech Stack:** Electron `desktopCapturer` + `globalShortcut` + `systemPreferences` + `Notification` + `clipboard`, React 19 with `useReducer` for the overlay state machine, native `<canvas>` + `<img>` for magnifier, no new npm dependencies.

**Reference:** Spec at `docs/superpowers/specs/2026-04-30-toolbox-screenshot-design.md` (commit `5706c97`) — sections 1-5, 10, 11. Phases 2-5 are out of scope for this plan; their settings fields are persisted but UI-inaccessible until later plans.

**Worktree:** Implement from `~/.config/superpowers/worktrees/dashmac/screenshot-phase-1` on branch `feature/screenshot-phase-1`.

---

## File Structure

**New files (15):**

Main-process services:
- `electron/services/screenshot/permissions.ts`
- `electron/services/screenshot/coordTransform.ts`
- `electron/services/screenshot/capture.ts`
- `electron/services/screenshot/overlayManager.ts`
- `electron/services/screenshot/hotkeys.ts`
- `electron/services/screenshot/screenshotService.ts`

Overlay window:
- `overlay.html`
- `src/overlay-main.tsx`
- `electron/preload-overlay.ts`
- `src/components/screenshot/OverlayApp.tsx`
- `src/components/screenshot/SelectionLayer.tsx`
- `src/components/screenshot/Magnifier.tsx`
- `src/components/screenshot/Toolbar.tsx`

Tests:
- `tests/electron/screenshot/permissions.test.ts`
- `tests/electron/screenshot/coordTransform.test.ts`
- `tests/electron/screenshot/capture.test.ts`
- `tests/electron/screenshot/overlayManager.test.ts`
- `tests/electron/screenshot/hotkeys.test.ts`

**Modified files (10):**
- `src/types.ts` — add `ScreenshotSettings`, extend `ToolboxSettings`, extend `DashMacAPI`.
- `electron/services/settingsStore.ts` — `mergeNested` helper, `screenshot` defaults, 3-level merge.
- `tests/electron/settingsStore.test.ts` — 4 new tests for `screenshot` shape.
- `tests/electron/customCommandRunner.test.ts` — `makeSettings()` fixture extension.
- `electron.vite.config.ts` — add `overlay` renderer input + new preload entrypoint.
- `electron/main.ts` — wire IPC handlers, register hotkey on settings load, re-register on settings change.
- `electron/preload.ts` — expose new `DashMacAPI` methods.
- `src/components/toolbox/ToolboxPage.tsx` — remove ComingSoonDialog, send `screenshot:trigger-capture` on card click.
- `src/components/settings/Settings.tsx` — add capture hotkey input + permission status to Toolbox sub-region.
- `src/i18n/locales/en.ts` + `src/i18n/locales/zh-CN.ts` — Phase 1 keys (~14 keys each).

---

## Task 1: Settings shape extension + 3-level nested merge

**Files:**
- Modify: `src/types.ts`, `electron/services/settingsStore.ts`, `src/components/settings/Settings.tsx`, `tests/electron/settingsStore.test.ts`, `tests/electron/customCommandRunner.test.ts`

- [ ] **Step 1.1: Write failing tests in `tests/electron/settingsStore.test.ts`**

Append inside the existing `describe('settingsStore', ...)` block:

```ts
import * as os from 'os'
import * as path from 'path'

test('DEFAULTS includes full screenshot settings', () => {
  expect(DEFAULTS.toolbox.screenshot).toEqual({
    captureHotkey: 'CommandOrControl+Shift+A',
    pinHotkey: 'CommandOrControl+Shift+S',
    hideAllPinsHotkey: 'CommandOrControl+Shift+H',
    saveDir: path.join(os.homedir(), 'Pictures', 'DashMac'),
    defaultPenColor: '#FF0000',
    defaultStrokeWidth: 'medium',
  })
})

test('round-trip preserves screenshot.captureHotkey', () => {
  const f = tmpFile()
  created.push(f)
  const next = {
    ...DEFAULTS,
    toolbox: { ...DEFAULTS.toolbox, screenshot: { ...DEFAULTS.toolbox.screenshot, captureHotkey: 'F1' } },
  }
  saveSettings(next, f)
  expect(loadSettings(f).toolbox.screenshot.captureHotkey).toBe('F1')
})

test('migration: settings.json without toolbox.screenshot gets full defaults', () => {
  const f = tmpFile()
  created.push(f)
  fs.writeFileSync(f, JSON.stringify({ toolbox: { screenshotEnabled: true } }), 'utf8')
  const result = loadSettings(f)
  expect(result.toolbox.screenshotEnabled).toBe(true)
  expect(result.toolbox.screenshot).toEqual(DEFAULTS.toolbox.screenshot)
})

test('migration: partial toolbox.screenshot gets remaining fields filled in', () => {
  const f = tmpFile()
  created.push(f)
  fs.writeFileSync(f, JSON.stringify({ toolbox: { screenshot: { captureHotkey: 'F1' } } }), 'utf8')
  const result = loadSettings(f)
  expect(result.toolbox.screenshot.captureHotkey).toBe('F1')
  expect(result.toolbox.screenshot.saveDir).toBe(DEFAULTS.toolbox.screenshot.saveDir)
})
```

- [ ] **Step 1.2: Run the tests, expect failure**

Run: `npx vitest run tests/electron/settingsStore.test.ts`
Expected: 4 new tests fail (DEFAULTS.toolbox.screenshot is undefined).

- [ ] **Step 1.3: Extend `src/types.ts`**

Find the `ToolboxSettings` interface (around line 191):

```ts
export interface ToolboxSettings {
  screenshotEnabled: boolean
}
```

Replace with:

```ts
export interface ToolboxSettings {
  screenshotEnabled: boolean
  screenshot: ScreenshotSettings
}

export interface ScreenshotSettings {
  captureHotkey: string
  pinHotkey: string
  hideAllPinsHotkey: string
  saveDir: string
  defaultPenColor: string
  defaultStrokeWidth: 'thin' | 'medium' | 'thick'
}
```

- [ ] **Step 1.4: Update `electron/services/settingsStore.ts`**

Replace the entire file:

```ts
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
```

- [ ] **Step 1.5: Update `src/components/settings/Settings.tsx` local DEFAULTS**

Find the `DEFAULTS` constant (top of file, around line 5-12) and replace its `toolbox` field:

```ts
toolbox: {
  screenshotEnabled: false,
  screenshot: {
    captureHotkey: 'CommandOrControl+Shift+A',
    pinHotkey: 'CommandOrControl+Shift+S',
    hideAllPinsHotkey: 'CommandOrControl+Shift+H',
    saveDir: '',                                      // resolved by IPC on mount
    defaultPenColor: '#FF0000',
    defaultStrokeWidth: 'medium',
  },
},
```

(`saveDir` placeholder is empty string — not user-visible until Phase 2's UI ships, and the real value arrives via `getSettings()` on mount.)

- [ ] **Step 1.6: Update `tests/electron/customCommandRunner.test.ts` fixture**

Find `makeSettings()` (around line 25-32):

```ts
function makeSettings(commands: AppSettings['customCommands']): AppSettings {
  return {
    realtimeInterval: 2000, historyInterval: 60000, retentionDays: 90,
    trayDisplayMetric: 'memory', launchAtLogin: false,
    language: 'en', resolvedLanguage: 'en',
    fileShortcuts: [], showHiddenFiles: false,
    customCommands: commands,
    toolbox: { screenshotEnabled: false },
  }
}
```

Replace with:

```ts
function makeSettings(commands: AppSettings['customCommands']): AppSettings {
  return {
    realtimeInterval: 2000, historyInterval: 60000, retentionDays: 90,
    trayDisplayMetric: 'memory', launchAtLogin: false,
    language: 'en', resolvedLanguage: 'en',
    fileShortcuts: [], showHiddenFiles: false,
    customCommands: commands,
    toolbox: {
      screenshotEnabled: false,
      screenshot: {
        captureHotkey: 'CommandOrControl+Shift+A',
        pinHotkey: 'CommandOrControl+Shift+S',
        hideAllPinsHotkey: 'CommandOrControl+Shift+H',
        saveDir: '/tmp/dashmac-test',
        defaultPenColor: '#FF0000',
        defaultStrokeWidth: 'medium',
      },
    },
  }
}
```

- [ ] **Step 1.7: Run settingsStore tests**

Run: `npx vitest run tests/electron/settingsStore.test.ts`
Expected: all tests pass.

- [ ] **Step 1.8: Run full test suite**

Run: `npm test`
Expected: all tests pass; no regression.

- [ ] **Step 1.9: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -E "^(src|tests|electron)" | grep -v "network.ts\|HistoryChart\|RealtimeChart\|Treemap"`
Expected: no output (no new errors). Pre-existing errors in `network.ts` etc. exist on master; ignore.

- [ ] **Step 1.10: Commit**

```bash
git add src/types.ts electron/services/settingsStore.ts src/components/settings/Settings.tsx \
        tests/electron/settingsStore.test.ts tests/electron/customCommandRunner.test.ts
git commit -m "$(cat <<'EOF'
feat(settings): extend toolbox.screenshot with full 6-field shape and nested merge

All phases' fields land at once to avoid repeated schema migrations.
Phase 1 only renders the captureHotkey field in UI; others persist silently
until later phases expose them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: i18n keys for Phase 1

**Files:**
- Modify: `src/i18n/locales/en.ts`, `src/i18n/locales/zh-CN.ts`

The shape parity test (`tests/electron/i18n-shape.test.ts`) enforces en/zh-CN identity. We rely on it.

- [ ] **Step 2.1: Add a top-level `screenshot` block to `src/i18n/locales/en.ts`**

Insert after the existing `toolbox` block, before the `settings` block:

```ts
screenshot: {
  permission: {
    title: 'Screen Recording permission required',
    message: 'DashMac needs Screen Recording permission to capture screenshots.',
    detail: 'Steps to grant:\n1. Click "Open System Settings" below\n2. In "Privacy & Security → Screen Recording", enable DashMac\n3. Restart DashMac (macOS requires a restart for new permissions to take effect)',
    openSettings: 'Open System Settings',
    later: 'Later',
    statusGranted: 'Status: Granted',
    statusDenied: 'Status: Denied',
    statusNotDetermined: 'Status: Not yet determined',
    recheck: 'Re-check',
  },
  toolbar: {
    copy: 'Copy',
    cancel: 'Cancel',
  },
  toast: {
    copied: 'Screenshot copied',
  },
  settings: {
    captureHotkey: 'Capture hotkey',
    invalidHotkey: 'Invalid shortcut',
  },
},
```

- [ ] **Step 2.2: Add the matching `screenshot` block to `src/i18n/locales/zh-CN.ts`**

Same insertion point. Translations:

```ts
screenshot: {
  permission: {
    title: '需要屏幕录制权限',
    message: 'DashMac 需要屏幕录制权限来截屏。',
    detail: '请按以下步骤授权：\n1. 点击下方"打开系统设置"\n2. 在"隐私与安全性 → 屏幕录制"中勾选 DashMac\n3. 重启 DashMac（macOS 要求新授予的权限重启后生效）',
    openSettings: '打开系统设置',
    later: '稍后再说',
    statusGranted: '状态：已授权',
    statusDenied: '状态：未授权',
    statusNotDetermined: '状态：未确定',
    recheck: '重新检查',
  },
  toolbar: {
    copy: '复制',
    cancel: '取消',
  },
  toast: {
    copied: '截图已复制',
  },
  settings: {
    captureHotkey: '截图快捷键',
    invalidHotkey: '快捷键无效',
  },
},
```

- [ ] **Step 2.3: Run shape parity test**

Run: `npx vitest run tests/electron/i18n-shape.test.ts`
Expected: PASS.

- [ ] **Step 2.4: Run TypeScript build (zh-CN.ts uses `typeof en`)**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 2.5: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/zh-CN.ts
git commit -m "$(cat <<'EOF'
feat(i18n): add screenshot Phase 1 keys (permission dialog, toolbar, toast, settings)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `permissions.ts` (main process)

**Files:**
- Create: `electron/services/screenshot/permissions.ts`
- Test: `tests/electron/screenshot/permissions.test.ts`

- [ ] **Step 3.1: Write failing tests**

Create `tests/electron/screenshot/permissions.test.ts`:

```ts
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
    openSystemSettings()
    expect(shell.openExternal).toHaveBeenCalledWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  })
})

describe('showDeniedDialog', () => {
  test('opens system settings when user clicks first button', async () => {
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
```

- [ ] **Step 3.2: Run tests, expect failure**

Run: `npx vitest run tests/electron/screenshot/permissions.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3.3: Implement `electron/services/screenshot/permissions.ts`**

```ts
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
```

- [ ] **Step 3.4: Run tests, expect pass**

Run: `npx vitest run tests/electron/screenshot/permissions.test.ts`
Expected: 7 tests pass.

- [ ] **Step 3.5: Run full test suite**

Run: `npm test`
Expected: all pass; no regression.

- [ ] **Step 3.6: Commit**

```bash
git add electron/services/screenshot/permissions.ts tests/electron/screenshot/permissions.test.ts
git commit -m "$(cat <<'EOF'
feat(screenshot): add permissions.ts with denied dialog and TCC deeplink

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `coordTransform.ts` (pure utility)

**Files:**
- Create: `electron/services/screenshot/coordTransform.ts`
- Test: `tests/electron/screenshot/coordTransform.test.ts`

- [ ] **Step 4.1: Write failing tests**

Create `tests/electron/screenshot/coordTransform.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { cssRectToNativePx, clampRectToBounds } from '../../../electron/services/screenshot/coordTransform'

describe('cssRectToNativePx', () => {
  test('1x scale: returns same numbers', () => {
    expect(cssRectToNativePx({ x: 10, y: 20, w: 100, h: 50 }, 1)).toEqual({ x: 10, y: 20, w: 100, h: 50 })
  })

  test('2x scale (retina): doubles all numbers', () => {
    expect(cssRectToNativePx({ x: 10, y: 20, w: 100, h: 50 }, 2)).toEqual({ x: 20, y: 40, w: 200, h: 100 })
  })

  test('rounds to integer pixels (banker friendly)', () => {
    expect(cssRectToNativePx({ x: 10.4, y: 20.6, w: 100.5, h: 50.5 }, 2)).toEqual({ x: 21, y: 41, w: 201, h: 101 })
  })
})

describe('clampRectToBounds', () => {
  test('rect entirely inside bounds: unchanged', () => {
    expect(clampRectToBounds({ x: 10, y: 10, w: 50, h: 50 }, { w: 200, h: 200 })).toEqual({ x: 10, y: 10, w: 50, h: 50 })
  })

  test('rect overflows right edge: w clipped', () => {
    expect(clampRectToBounds({ x: 150, y: 10, w: 100, h: 50 }, { w: 200, h: 200 })).toEqual({ x: 150, y: 10, w: 50, h: 50 })
  })

  test('negative origin: clipped to 0,0', () => {
    expect(clampRectToBounds({ x: -10, y: -20, w: 50, h: 50 }, { w: 200, h: 200 })).toEqual({ x: 0, y: 0, w: 40, h: 30 })
  })

  test('rect entirely outside: returns 0-area rect', () => {
    expect(clampRectToBounds({ x: 300, y: 300, w: 50, h: 50 }, { w: 200, h: 200 })).toEqual({ x: 200, y: 200, w: 0, h: 0 })
  })
})
```

- [ ] **Step 4.2: Run tests, expect failure**

Run: `npx vitest run tests/electron/screenshot/coordTransform.test.ts`
Expected: FAIL.

- [ ] **Step 4.3: Implement `electron/services/screenshot/coordTransform.ts`**

```ts
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function cssRectToNativePx(rect: Rect, scaleFactor: number): Rect {
  return {
    x: Math.round(rect.x * scaleFactor),
    y: Math.round(rect.y * scaleFactor),
    w: Math.round(rect.w * scaleFactor),
    h: Math.round(rect.h * scaleFactor),
  }
}

export function clampRectToBounds(rect: Rect, bounds: { w: number; h: number }): Rect {
  const x0 = Math.max(0, Math.min(rect.x, bounds.w))
  const y0 = Math.max(0, Math.min(rect.y, bounds.h))
  const x1 = Math.max(0, Math.min(rect.x + rect.w, bounds.w))
  const y1 = Math.max(0, Math.min(rect.y + rect.h, bounds.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
```

- [ ] **Step 4.4: Run tests, expect pass**

Run: `npx vitest run tests/electron/screenshot/coordTransform.test.ts`
Expected: 7 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add electron/services/screenshot/coordTransform.ts tests/electron/screenshot/coordTransform.test.ts
git commit -m "$(cat <<'EOF'
feat(screenshot): add coordTransform.ts with CSS px↔native px and bounds clamp

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `capture.ts` (desktopCapturer wrapper)

**Files:**
- Create: `electron/services/screenshot/capture.ts`
- Test: `tests/electron/screenshot/capture.test.ts`

- [ ] **Step 5.1: Write failing tests**

Create `tests/electron/screenshot/capture.test.ts`:

```ts
import { describe, expect, test, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  desktopCapturer: {
    getSources: vi.fn(),
  },
  screen: {
    getAllDisplays: vi.fn(),
  },
}))

import { desktopCapturer, screen } from 'electron'
import { takeScreenshots } from '../../../electron/services/screenshot/capture'

const fakeNativeImage = { __nativeImage: true, isEmpty: () => false } as any

describe('takeScreenshots', () => {
  beforeEach(() => {
    vi.mocked(desktopCapturer.getSources).mockReset()
    vi.mocked(screen.getAllDisplays).mockReset()
  })

  test('single display: returns one source matched by display_id', async () => {
    vi.mocked(screen.getAllDisplays).mockReturnValue([
      { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 2 } as any,
    ])
    vi.mocked(desktopCapturer.getSources).mockResolvedValue([
      { id: 'screen:1:0', display_id: '1', name: 'Screen 1', thumbnail: fakeNativeImage } as any,
    ])

    const result = await takeScreenshots()
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      displayId: 1,
      image: fakeNativeImage,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 2,
    })
    expect(desktopCapturer.getSources).toHaveBeenCalledWith({
      types: ['screen'],
      thumbnailSize: { width: 3840, height: 2160 },  // 1920*2 × 1080*2
    })
  })

  test('multi display: matches each by display_id', async () => {
    vi.mocked(screen.getAllDisplays).mockReturnValue([
      { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 } as any,
      { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 720 }, size: { width: 1280, height: 720 }, scaleFactor: 1 } as any,
    ])
    vi.mocked(desktopCapturer.getSources).mockResolvedValue([
      { id: 'screen:1:0', display_id: '1', thumbnail: fakeNativeImage } as any,
      { id: 'screen:2:0', display_id: '2', thumbnail: fakeNativeImage } as any,
    ])

    const result = await takeScreenshots()
    expect(result).toHaveLength(2)
    expect(result[0].displayId).toBe(1)
    expect(result[1].displayId).toBe(2)
  })

  test('display_id not found in sources: falls back to first source', async () => {
    vi.mocked(screen.getAllDisplays).mockReturnValue([
      { id: 99, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 } as any,
    ])
    vi.mocked(desktopCapturer.getSources).mockResolvedValue([
      { id: 'screen:0:0', display_id: '1', thumbnail: fakeNativeImage } as any,
    ])

    const result = await takeScreenshots()
    expect(result).toHaveLength(1)
    expect(result[0].image).toBe(fakeNativeImage)
  })
})
```

- [ ] **Step 5.2: Run tests, expect failure**

Run: `npx vitest run tests/electron/screenshot/capture.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 5.3: Implement `electron/services/screenshot/capture.ts`**

```ts
import { desktopCapturer, screen, type NativeImage, type Rectangle } from 'electron'

export interface DisplayCapture {
  displayId: number
  image: NativeImage
  bounds: Rectangle
  scaleFactor: number
}

export async function takeScreenshots(): Promise<DisplayCapture[]> {
  const displays = screen.getAllDisplays()
  // One getSources call returns sources for ALL displays — call once and match.
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: thumbnailSizeFor(displays),
  })
  return displays.map((display) => {
    const matched = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
    return {
      displayId: display.id,
      image: matched.thumbnail,
      bounds: display.bounds,
      scaleFactor: display.scaleFactor,
    }
  })
}

function thumbnailSizeFor(displays: Electron.Display[]): { width: number; height: number } {
  // Pick the largest display's native pixel size; smaller displays' images are still requested at this size
  // and clipped/letterboxed by Electron. This is the simplest correct option.
  let maxW = 0
  let maxH = 0
  for (const d of displays) {
    const w = d.size.width * d.scaleFactor
    const h = d.size.height * d.scaleFactor
    if (w > maxW) maxW = w
    if (h > maxH) maxH = h
  }
  return { width: maxW, height: maxH }
}
```

- [ ] **Step 5.4: Run tests, expect pass**

Run: `npx vitest run tests/electron/screenshot/capture.test.ts`
Expected: 3 tests pass. (The first test's `thumbnailSize` assertion of `3840×2160` matches because there's only one display and its `1920*2 × 1080*2` is the max.)

- [ ] **Step 5.5: Commit**

```bash
git add electron/services/screenshot/capture.ts tests/electron/screenshot/capture.test.ts
git commit -m "$(cat <<'EOF'
feat(screenshot): add capture.ts wrapping desktopCapturer for per-display images

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: New electron-vite renderer entrypoint for overlay

**Files:**
- Modify: `electron.vite.config.ts`
- Create: `overlay.html`, `src/overlay-main.tsx`, `electron/preload-overlay.ts`

- [ ] **Step 6.1: Update `electron.vite.config.ts` with overlay entrypoint and second preload**

Replace the entire file:

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve('electron/main.ts'),
        output: {
          format: 'cjs',
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          preload: resolve('electron/preload.ts'),
          'preload-overlay': resolve('electron/preload-overlay.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    root: '.',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve('index.html'),
          overlay: resolve('overlay.html'),
        },
      },
    },
  },
})
```

Key changes:
- `preload.rollupOptions.input` becomes an object map → produces `out/preload/preload.cjs` AND `out/preload/preload-overlay.cjs`.
- `entryFileNames: '[name].cjs'` ensures both are `.cjs` (electron-vite default keeps `.cjs` for cjs-format outputs but explicit is safer).
- `renderer.rollupOptions.input` becomes an object map → produces `out/renderer/index.html` AND `out/renderer/overlay.html`.

- [ ] **Step 6.2: Create `overlay.html` at the repo root**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:" />
    <title>DashMac Capture</title>
    <style>
      html, body { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; cursor: crosshair; user-select: none; }
      body { background: transparent; }
    </style>
  </head>
  <body>
    <div id="overlay-root"></div>
    <script type="module" src="/src/overlay-main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6.3: Create `electron/preload-overlay.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'

interface OverlayInitPayload {
  imageDataURL: string
  displayId: number
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
}

interface ConfirmPayload {
  action: 'copy'  // Phase 2 adds 'save'; Phase 3+ also send imageDataURL; Phase 4 adds 'pin'
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
```

- [ ] **Step 6.4: Create `src/overlay-main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import OverlayApp from './components/screenshot/OverlayApp'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('overlay-root')!).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>,
)
```

- [ ] **Step 6.5: Create empty placeholder `src/components/screenshot/OverlayApp.tsx`**

This unblocks the build. Task 10 fills it in.

```tsx
export default function OverlayApp() {
  return <div>Overlay placeholder</div>
}
```

- [ ] **Step 6.6: Verify build produces both renderer + both preload outputs**

Run: `npm run build`
Expected: build succeeds. Then check:
```bash
ls out/renderer/
# Expected: index.html, overlay.html, assets/

ls out/preload/
# Expected: preload.cjs, preload-overlay.cjs
```

- [ ] **Step 6.7: Run tests**

Run: `npm test`
Expected: all pass; no regression.

- [ ] **Step 6.8: Commit**

```bash
git add electron.vite.config.ts overlay.html src/overlay-main.tsx \
        electron/preload-overlay.ts src/components/screenshot/OverlayApp.tsx
git commit -m "$(cat <<'EOF'
feat(screenshot): add overlay renderer entrypoint and dedicated preload

Sets up the second renderer bundle for the capture overlay window.
OverlayApp.tsx is a placeholder; Task 10 fills it in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `overlayManager.ts` (main process)

**Files:**
- Create: `electron/services/screenshot/overlayManager.ts`
- Test: `tests/electron/screenshot/overlayManager.test.ts`

- [ ] **Step 7.1: Write failing tests**

Create `tests/electron/screenshot/overlayManager.test.ts`:

```ts
import { describe, expect, test, vi, beforeEach } from 'vitest'

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
  close = vi.fn(function (this: any) { this.isDestroyedFlag = true })
  isDestroyed = vi.fn(function (this: any) { return !!this.isDestroyedFlag })

  constructor(opts: any) {
    constructorSpy(opts)
    FakeBrowserWindow.instances.push(this)
  }
}

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
```

- [ ] **Step 7.2: Run tests, expect failure**

Run: `npx vitest run tests/electron/screenshot/overlayManager.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 7.3: Implement `electron/services/screenshot/overlayManager.ts`**

```ts
import { BrowserWindow, type Rectangle, type NativeImage } from 'electron'
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
```

- [ ] **Step 7.4: Run tests, expect pass**

Run: `npx vitest run tests/electron/screenshot/overlayManager.test.ts`
Expected: 5 tests pass.

- [ ] **Step 7.5: Commit**

```bash
git add electron/services/screenshot/overlayManager.ts tests/electron/screenshot/overlayManager.test.ts
git commit -m "$(cat <<'EOF'
feat(screenshot): add overlayManager for opening/closing per-display overlays

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `hotkeys.ts` (global shortcut registration)

**Files:**
- Create: `electron/services/screenshot/hotkeys.ts`
- Test: `tests/electron/screenshot/hotkeys.test.ts`

- [ ] **Step 8.1: Write failing tests**

Create `tests/electron/screenshot/hotkeys.test.ts`:

```ts
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
```

- [ ] **Step 8.2: Run tests, expect failure**

Run: `npx vitest run tests/electron/screenshot/hotkeys.test.ts`
Expected: FAIL.

- [ ] **Step 8.3: Implement `electron/services/screenshot/hotkeys.ts`**

```ts
import { globalShortcut } from 'electron'

export class CaptureHotkey {
  private current: string | null = null

  get currentAccelerator(): string | null {
    return this.current
  }

  register(accelerator: string, handler: () => void): boolean {
    const ok = globalShortcut.register(accelerator, handler)
    if (ok) this.current = accelerator
    else this.current = null
    return ok
  }

  reregister(accelerator: string, handler: () => void): boolean {
    if (this.current === accelerator) return true
    if (this.current) globalShortcut.unregister(this.current)
    return this.register(accelerator, handler)
  }

  unregisterAll(): void {
    if (this.current) globalShortcut.unregister(this.current)
    this.current = null
  }
}
```

- [ ] **Step 8.4: Run tests, expect pass**

Run: `npx vitest run tests/electron/screenshot/hotkeys.test.ts`
Expected: 6 tests pass.

- [ ] **Step 8.5: Commit**

```bash
git add electron/services/screenshot/hotkeys.ts tests/electron/screenshot/hotkeys.test.ts
git commit -m "$(cat <<'EOF'
feat(screenshot): add CaptureHotkey wrapper for globalShortcut with re-register

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `screenshotService.ts` + IPC handlers + DashMacAPI extension + preload + main.ts wiring

This task is the biggest. It connects everything.

**Files:**
- Create: `electron/services/screenshot/screenshotService.ts`
- Modify: `src/types.ts`, `electron/preload.ts`, `electron/main.ts`

- [ ] **Step 9.1: Implement `electron/services/screenshot/screenshotService.ts`**

```ts
import { clipboard, Notification, dialog, BrowserWindow } from 'electron'
import { takeScreenshots } from './capture'
import { OverlayManager } from './overlayManager'
import { checkScreenRecordingPermission, showDeniedDialog } from './permissions'
import { cssRectToNativePx, clampRectToBounds, type Rect } from './coordTransform'
import { CaptureHotkey } from './hotkeys'

export type CaptureSource = 'card' | 'hotkey'

export interface ConfirmPayload {
  action: 'copy'   // Phase 1 only; Phase 2+ extends this
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
      // 'not-determined' transitions to 'granted' or 'denied' here.
      // If user denied during this call, captures contain empty/black images;
      // we re-check and bail.
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
    if (payload.action !== 'copy') return  // Phase 1

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
```

- [ ] **Step 9.2: Extend `src/types.ts` `DashMacAPI`**

Find the `DashMacAPI` interface and add:

```ts
// Inside DashMacAPI:
triggerScreenshotCapture: () => void
checkScreenshotPermission: () => Promise<'granted' | 'denied' | 'not-determined' | 'restricted'>
openScreenshotSystemSettings: () => void
chooseDirectory: (currentPath?: string) => Promise<string | null>
onToast: (callback: (event: { kind: 'success' | 'error' | 'info'; message: string }) => void) => () => void
```

- [ ] **Step 9.3: Update `electron/preload.ts` to expose the new API**

Find the `contextBridge.exposeInMainWorld('api', { ... })` block and add inside the object:

```ts
triggerScreenshotCapture: () => ipcRenderer.send('screenshot:trigger-capture'),
checkScreenshotPermission: () => ipcRenderer.invoke('screenshot:check-permission'),
openScreenshotSystemSettings: () => ipcRenderer.send('screenshot:open-system-settings'),
chooseDirectory: (currentPath?: string) => ipcRenderer.invoke('dialog:choose-directory', currentPath),
onToast: (callback: (event: { kind: 'success' | 'error' | 'info'; message: string }) => void) => {
  const handler = (_e: unknown, payload: { kind: 'success' | 'error' | 'info'; message: string }) => callback(payload)
  ipcRenderer.on('toast:push', handler)
  return () => ipcRenderer.removeListener('toast:push', handler)
},
```

- [ ] **Step 9.4: Wire IPC handlers in `electron/main.ts`**

Add these imports near the existing imports:

```ts
import { ScreenshotService } from './services/screenshot/screenshotService'
import { checkScreenRecordingPermission, openSystemSettings as openScreenshotSettings } from './services/screenshot/permissions'
```

Add a singleton near the existing `customCommandRunner` singleton:

```ts
const screenshotService = new ScreenshotService()
```

In the existing `app.whenReady().then(...)` block (or wherever the main window is created and `t` is available), add:

```ts
// After mainWindow is created and i18n is initialized:
screenshotService.setMainWindow(mainWindow)
screenshotService.setTranslator(t)

// Initial hotkey registration based on settings:
const initialSettings = loadSettings()
if (initialSettings.toolbox.screenshotEnabled) {
  screenshotService.hotkey.register(
    initialSettings.toolbox.screenshot.captureHotkey,
    () => screenshotService.runCapture('hotkey'),
  )
}
```

In the `registerIpcHandlers` function (or wherever existing IPC handlers like `query:export` are registered), add:

```ts
ipcMain.on('screenshot:trigger-capture', () => {
  void screenshotService.runCapture('card')
})

ipcMain.handle('screenshot:check-permission', () => {
  return checkScreenRecordingPermission()
})

ipcMain.on('screenshot:open-system-settings', () => {
  openScreenshotSettings()
})

ipcMain.on('screenshot:confirm', (_e, payload) => {
  void screenshotService.handleConfirm(payload)
})

ipcMain.on('screenshot:cancel', () => {
  screenshotService.handleCancel()
})

ipcMain.handle('dialog:choose-directory', async (_e, currentPath?: string) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: currentPath,
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})
```

In the existing `save:settings` handler (where settings are persisted), after saving, re-register the hotkey if `screenshotEnabled` or `captureHotkey` changed:

Find the existing `ipcMain.handle('save:settings', ...)` block. After `persistSettings(settings)` and the language re-emit, add:

```ts
if (settings.toolbox.screenshotEnabled) {
  screenshotService.hotkey.reregister(
    settings.toolbox.screenshot.captureHotkey,
    () => screenshotService.runCapture('hotkey'),
  )
} else {
  screenshotService.hotkey.unregisterAll()
}
```

In the `before-quit` handler (where `closeDatabase()` and `customCommandRunner.disposeAll()` are called), add:

```ts
screenshotService.hotkey.unregisterAll()
```

- [ ] **Step 9.5: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "^(src|tests|electron)" | grep -v "network.ts\|HistoryChart\|RealtimeChart\|Treemap"`
Expected: no new errors.

- [ ] **Step 9.6: Run all tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 9.7: Commit**

```bash
git add src/types.ts electron/preload.ts electron/main.ts \
        electron/services/screenshot/screenshotService.ts
git commit -m "$(cat <<'EOF'
feat(screenshot): wire screenshotService, IPC handlers, and global hotkey

Top-level service orchestrates permission check, capture, overlay, confirm,
and notification routing (renderer toast for card-triggered, native macOS
notification for hotkey-triggered).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `OverlayApp.tsx` — state machine + IPC init

**Files:**
- Modify: `src/components/screenshot/OverlayApp.tsx` (replace placeholder)

- [ ] **Step 10.1: Replace `src/components/screenshot/OverlayApp.tsx`**

```tsx
import { useEffect, useReducer, useRef } from 'react'
import SelectionLayer from './SelectionLayer'
import Magnifier from './Magnifier'
import Toolbar from './Toolbar'

type Mode = 'IDLE' | 'DRAGGING' | 'CONFIRMED' | 'RESIZING' | 'MOVING'
type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface Selection { x: number; y: number; w: number; h: number }

interface State {
  imageDataURL: string | null
  imageSize: { w: number; h: number }
  scaleFactor: number
  displayId: number | null
  mode: Mode
  selection: Selection | null
  cursor: { x: number; y: number }
  dragAnchor: { x: number; y: number } | null
  resizeHandle: HandleId | null
  moveOffset: { dx: number; dy: number } | null
}

type Action =
  | { type: 'init'; imageDataURL: string; bounds: { width: number; height: number }; scaleFactor: number; displayId: number }
  | { type: 'cursor-move'; x: number; y: number }
  | { type: 'mouse-down'; x: number; y: number; on: 'empty' | 'inside' | { handle: HandleId } }
  | { type: 'mouse-up' }
  | { type: 'cancel' }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'init':
      return { ...s, imageDataURL: a.imageDataURL, imageSize: { w: a.bounds.width, h: a.bounds.height }, scaleFactor: a.scaleFactor, displayId: a.displayId }
    case 'cursor-move': {
      const next: State = { ...s, cursor: { x: a.x, y: a.y } }
      if (s.mode === 'DRAGGING' && s.dragAnchor) {
        next.selection = rectFromPoints(s.dragAnchor, { x: a.x, y: a.y })
      } else if (s.mode === 'RESIZING' && s.selection && s.resizeHandle) {
        next.selection = resizeRect(s.selection, s.resizeHandle, a.x, a.y)
      } else if (s.mode === 'MOVING' && s.selection && s.moveOffset) {
        next.selection = {
          ...s.selection,
          x: a.x - s.moveOffset.dx,
          y: a.y - s.moveOffset.dy,
        }
      }
      return next
    }
    case 'mouse-down': {
      if (s.mode === 'IDLE') {
        return { ...s, mode: 'DRAGGING', dragAnchor: { x: a.x, y: a.y }, selection: { x: a.x, y: a.y, w: 0, h: 0 } }
      }
      if (s.mode === 'CONFIRMED' && s.selection) {
        if (a.on === 'inside') {
          return { ...s, mode: 'MOVING', moveOffset: { dx: a.x - s.selection.x, dy: a.y - s.selection.y } }
        }
        if (typeof a.on === 'object') {
          return { ...s, mode: 'RESIZING', resizeHandle: a.on.handle }
        }
        return { ...s, mode: 'DRAGGING', dragAnchor: { x: a.x, y: a.y }, selection: { x: a.x, y: a.y, w: 0, h: 0 } }
      }
      return s
    }
    case 'mouse-up': {
      if (s.mode === 'DRAGGING' || s.mode === 'RESIZING' || s.mode === 'MOVING') {
        // Normalize negative width/height
        const sel = s.selection ? normalizeRect(s.selection) : null
        return { ...s, mode: sel && (sel.w > 2 && sel.h > 2) ? 'CONFIRMED' : 'IDLE', selection: sel, dragAnchor: null, resizeHandle: null, moveOffset: null }
      }
      return s
    }
    case 'cancel':
      return { ...s, mode: 'IDLE', selection: null, dragAnchor: null, resizeHandle: null, moveOffset: null }
  }
}

function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Selection {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}

function normalizeRect(r: Selection): Selection {
  return { x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) }
}

function resizeRect(r: Selection, h: HandleId, x: number, y: number): Selection {
  // Compute the opposite corner / edge as anchor; recompute rect from anchor to (x, y).
  let ax = r.x, ay = r.y, bx = r.x + r.w, by = r.y + r.h
  switch (h) {
    case 'nw': ax = bx; ay = by; bx = x; by = y; break
    case 'ne': ax = r.x; ay = by; bx = x; by = y; break
    case 'sw': ax = bx; ay = r.y; bx = x; by = y; break
    case 'se': ax = r.x; ay = r.y; bx = x; by = y; break
    case 'n': by = y; break
    case 's': by = y; break
    case 'e': bx = x; break
    case 'w': bx = x; break
  }
  if (h === 'n' || h === 's') return { x: r.x, y: Math.min(ay, by), w: r.w, h: Math.abs(by - ay) }
  if (h === 'e' || h === 'w') return { x: Math.min(ax, bx), y: r.y, w: Math.abs(bx - ax), h: r.h }
  return rectFromPoints({ x: ax, y: ay }, { x: bx, y: by })
}

const INITIAL: State = {
  imageDataURL: null,
  imageSize: { w: 0, h: 0 },
  scaleFactor: 1,
  displayId: null,
  mode: 'IDLE',
  selection: null,
  cursor: { x: 0, y: 0 },
  dragAnchor: null,
  resizeHandle: null,
  moveOffset: null,
}

export default function OverlayApp() {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsubscribe = window.overlay.onInit((p) => {
      dispatch({ type: 'init', imageDataURL: p.imageDataURL, bounds: p.bounds, scaleFactor: p.scaleFactor, displayId: p.displayId })
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.overlay.cancel()
      } else if (e.key === 'Enter' && state.mode === 'CONFIRMED' && state.selection && state.displayId !== null) {
        window.overlay.confirm({ action: 'copy', displayId: state.displayId, selection: state.selection })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state.mode, state.selection, state.displayId])

  if (!state.imageDataURL) return null

  const onConfirmCopy = () => {
    if (!state.selection || state.displayId === null) return
    window.overlay.confirm({ action: 'copy', displayId: state.displayId, selection: state.selection })
  }

  const onCancel = () => window.overlay.cancel()

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh' }}>
      <img
        src={state.imageDataURL}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none', userSelect: 'none' }}
        draggable={false}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', pointerEvents: 'none' }} />
      <SelectionLayer
        state={state}
        onCursorMove={(x, y) => dispatch({ type: 'cursor-move', x, y })}
        onMouseDown={(x, y, on) => dispatch({ type: 'mouse-down', x, y, on })}
        onMouseUp={() => dispatch({ type: 'mouse-up' })}
        onDoubleClickInside={onConfirmCopy}
      />
      <Magnifier state={state} />
      {state.mode === 'CONFIRMED' && state.selection && (
        <Toolbar selection={state.selection} viewport={state.imageSize} onCopy={onConfirmCopy} onCancel={onCancel} />
      )}
    </div>
  )
}
```

- [ ] **Step 10.2: Type-check**

Will fail because `SelectionLayer`, `Magnifier`, `Toolbar` don't exist yet. Create empty placeholders to unblock:

```tsx
// src/components/screenshot/SelectionLayer.tsx
export default function SelectionLayer(_p: any) { return null }

// src/components/screenshot/Magnifier.tsx
export default function Magnifier(_p: any) { return null }

// src/components/screenshot/Toolbar.tsx
export default function Toolbar(_p: any) { return null }
```

(These are filled in by Tasks 11/12/13.)

- [ ] **Step 10.3: Run build**

Run: `npm run build`
Expected: success.

- [ ] **Step 10.4: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 10.5: Commit**

```bash
git add src/components/screenshot/OverlayApp.tsx \
        src/components/screenshot/SelectionLayer.tsx \
        src/components/screenshot/Magnifier.tsx \
        src/components/screenshot/Toolbar.tsx
git commit -m "$(cat <<'EOF'
feat(screenshot): add OverlayApp shell with reducer-driven state machine

Sub-components SelectionLayer/Magnifier/Toolbar are placeholders for tasks 11-13.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `SelectionLayer.tsx` — drag, handles, resize, move

**Files:**
- Modify: `src/components/screenshot/SelectionLayer.tsx`

- [ ] **Step 11.1: Replace `SelectionLayer.tsx`**

```tsx
import type { Selection } from './OverlayApp'

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface OverlayState {
  mode: 'IDLE' | 'DRAGGING' | 'CONFIRMED' | 'RESIZING' | 'MOVING'
  selection: Selection | null
  imageSize: { w: number; h: number }
}

interface Props {
  state: OverlayState
  onCursorMove: (x: number, y: number) => void
  onMouseDown: (x: number, y: number, on: 'empty' | 'inside' | { handle: HandleId }) => void
  onMouseUp: () => void
  onDoubleClickInside: () => void
}

const HANDLE_SIZE = 8

export default function SelectionLayer({ state, onCursorMove, onMouseDown, onMouseUp, onDoubleClickInside }: Props) {
  const sel = state.selection
  const showHandles = state.mode === 'CONFIRMED' && sel !== null

  function handleMouseDown(e: React.MouseEvent) {
    const x = e.clientX, y = e.clientY
    if (sel && pointInsideRect(x, y, sel)) {
      onMouseDown(x, y, 'inside')
    } else {
      onMouseDown(x, y, 'empty')
    }
  }

  return (
    <div
      style={{ position: 'absolute', inset: 0, cursor: state.mode === 'IDLE' ? 'crosshair' : 'default' }}
      onMouseMove={(e) => onCursorMove(e.clientX, e.clientY)}
      onMouseDown={handleMouseDown}
      onMouseUp={onMouseUp}
      onDoubleClick={(e) => {
        if (sel && pointInsideRect(e.clientX, e.clientY, sel)) onDoubleClickInside()
      }}
    >
      {sel && (
        <div
          style={{
            position: 'absolute',
            left: sel.x,
            top: sel.y,
            width: sel.w,
            height: sel.h,
            // "Punch a hole" through the dimming overlay using box-shadow trick:
            boxShadow: '0 0 0 9999px rgba(0,0,0,0)',
            outline: '1px solid rgba(64, 153, 255, 0.9)',
            background: 'transparent',
            mixBlendMode: 'normal',
            // Make the dim overlay visible OUTSIDE the selection:
            // Use an inverted clip via two divs (next sibling outline).
          }}
        >
          {/* Reveal the un-dimmed portion of the screen image inside the selection */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(rgba(0,0,0,0.0), rgba(0,0,0,0.0))`,
              // Punch through using mix-blend-mode 'destination-out' on a sibling overlay would be ideal
              // but to keep this simple in Phase 1, we render the image again clipped to the selection:
            }}
          />
          {showHandles && (
            <>
              <Handle id="nw" pos={{ left: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 }} cursor="nwse-resize" onDown={onMouseDown} />
              <Handle id="n"  pos={{ left: sel.w / 2 - HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 }} cursor="ns-resize" onDown={onMouseDown} />
              <Handle id="ne" pos={{ right: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 }} cursor="nesw-resize" onDown={onMouseDown} />
              <Handle id="e"  pos={{ right: -HANDLE_SIZE / 2, top: sel.h / 2 - HANDLE_SIZE / 2 }} cursor="ew-resize" onDown={onMouseDown} />
              <Handle id="se" pos={{ right: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 }} cursor="nwse-resize" onDown={onMouseDown} />
              <Handle id="s"  pos={{ left: sel.w / 2 - HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 }} cursor="ns-resize" onDown={onMouseDown} />
              <Handle id="sw" pos={{ left: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 }} cursor="nesw-resize" onDown={onMouseDown} />
              <Handle id="w"  pos={{ left: -HANDLE_SIZE / 2, top: sel.h / 2 - HANDLE_SIZE / 2 }} cursor="ew-resize" onDown={onMouseDown} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Handle({ id, pos, cursor, onDown }: {
  id: HandleId
  pos: { left?: number; right?: number; top?: number; bottom?: number }
  cursor: string
  onDown: (x: number, y: number, on: { handle: HandleId }) => void
}) {
  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation()
        onDown(e.clientX, e.clientY, { handle: id })
      }}
      style={{
        position: 'absolute',
        ...pos,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        background: 'white',
        border: '1px solid rgba(64, 153, 255, 0.9)',
        cursor,
      }}
    />
  )
}

function pointInsideRect(x: number, y: number, r: Selection): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}
```

> **Implementation note**: the "punch a hole through the dim overlay" effect is left simplistic in Phase 1 — the selection rectangle is just outlined with a 1px blue border. The dim overlay (rendered in OverlayApp) covers the entire screen at 40% opacity. Pixel-perfect "hole punch" is a Phase 1 implementation brainstorm refinement (using `mix-blend-mode: destination-out` on an inner `<div>` or rendering the image again clipped to the selection). The user can still see the selection content because the underlying image is just slightly dimmed, not opaque.

- [ ] **Step 11.2: Type-check + build**

Run: `npm run build`
Expected: success.

- [ ] **Step 11.3: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 11.4: Commit**

```bash
git add src/components/screenshot/SelectionLayer.tsx
git commit -m "$(cat <<'EOF'
feat(screenshot): add SelectionLayer with 8 resize handles and inside/outside drag

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `Magnifier.tsx`

**Files:**
- Modify: `src/components/screenshot/Magnifier.tsx`

- [ ] **Step 12.1: Replace `Magnifier.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'

type Mode = 'IDLE' | 'DRAGGING' | 'CONFIRMED' | 'RESIZING' | 'MOVING'

interface OverlayState {
  imageDataURL: string | null
  imageSize: { w: number; h: number }
  scaleFactor: number
  cursor: { x: number; y: number }
  mode: Mode
  selection: { x: number; y: number; w: number; h: number } | null
}

const SIZE = 110
const ZOOM = 10
const SAMPLE = SIZE / ZOOM   // 11×11 source pixels

export default function Magnifier({ state }: { state: OverlayState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pixelInfo, setPixelInfo] = useState<{ r: number; g: number; b: number } | null>(null)

  useEffect(() => {
    if (!state.imageDataURL || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.onload = () => {
      // Native pixel coords for the cursor:
      const sx = state.cursor.x * state.scaleFactor - (SAMPLE * state.scaleFactor) / 2
      const sy = state.cursor.y * state.scaleFactor - (SAMPLE * state.scaleFactor) / 2
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, SIZE, SIZE)
      ctx.drawImage(img, sx, sy, SAMPLE * state.scaleFactor, SAMPLE * state.scaleFactor, 0, 0, SIZE, SIZE)
      // Crosshair through center pixel:
      ctx.strokeStyle = 'rgba(64, 153, 255, 0.9)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(SIZE / 2 - ZOOM / 2, SIZE / 2)
      ctx.lineTo(SIZE / 2 + ZOOM / 2, SIZE / 2)
      ctx.moveTo(SIZE / 2, SIZE / 2 - ZOOM / 2)
      ctx.lineTo(SIZE / 2, SIZE / 2 + ZOOM / 2)
      ctx.stroke()

      // Read center-pixel RGB:
      const data = ctx.getImageData(SIZE / 2, SIZE / 2, 1, 1).data
      setPixelInfo({ r: data[0], g: data[1], b: data[2] })
    }
    img.src = state.imageDataURL
  }, [state.cursor.x, state.cursor.y, state.imageDataURL, state.scaleFactor])

  const popX = Math.min(state.cursor.x + 16, state.imageSize.w - SIZE - 8)
  const popY = Math.min(state.cursor.y + 16, state.imageSize.h - SIZE - 32 - 8)

  const hex = pixelInfo
    ? '#' + [pixelInfo.r, pixelInfo.g, pixelInfo.b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()
    : '#------'

  return (
    <div
      style={{
        position: 'absolute',
        left: popX,
        top: popY,
        width: SIZE,
        height: SIZE + 32,
        pointerEvents: 'none',
        background: 'rgba(0,0,0,0.85)',
        border: '1px solid rgba(64, 153, 255, 0.9)',
        color: 'white',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 10,
        zIndex: 1000,
      }}
    >
      <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ display: 'block' }} />
      <div style={{ padding: '4px 6px', lineHeight: '14px' }}>
        <div>{`(${state.cursor.x}, ${state.cursor.y}) ${hex}`}</div>
        {state.selection && (state.mode === 'DRAGGING' || state.mode === 'CONFIRMED') && (
          <div>{`${Math.round(state.selection.w)} × ${Math.round(state.selection.h)}`}</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 12.2: Type-check + build**

Run: `npm run build`
Expected: success.

- [ ] **Step 12.3: Commit**

```bash
git add src/components/screenshot/Magnifier.tsx
git commit -m "$(cat <<'EOF'
feat(screenshot): add Magnifier with zoom + RGB/HEX + selection size

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: `Toolbar.tsx` (Phase 1 minimal)

**Files:**
- Modify: `src/components/screenshot/Toolbar.tsx`

- [ ] **Step 13.1: Replace `Toolbar.tsx`**

```tsx
import { useTranslation } from '../../i18n/index'

interface Props {
  selection: { x: number; y: number; w: number; h: number }
  viewport: { w: number; h: number }
  onCopy: () => void
  onCancel: () => void
}

const TOOLBAR_HEIGHT = 32
const GAP = 8

export default function Toolbar({ selection, viewport, onCopy, onCancel }: Props) {
  const { t } = useTranslation()

  // Position: below selection if there's room, else above, else bottom-right inside.
  const belowY = selection.y + selection.h + GAP
  const aboveY = selection.y - TOOLBAR_HEIGHT - GAP
  const insideY = selection.y + selection.h - TOOLBAR_HEIGHT - GAP

  let top: number
  if (belowY + TOOLBAR_HEIGHT <= viewport.h) top = belowY
  else if (aboveY >= 0) top = aboveY
  else top = insideY

  // Centered horizontally on selection
  const centerX = selection.x + selection.w / 2
  let left = centerX - 90 // estimated half-width of two buttons

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: Math.max(GAP, Math.min(left, viewport.w - 180 - GAP)),
        height: TOOLBAR_HEIGHT,
        background: 'rgba(20, 20, 20, 0.95)',
        border: '1px solid rgba(64, 153, 255, 0.6)',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        padding: '0 4px',
        gap: 4,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        color: 'white',
        zIndex: 1001,
      }}
    >
      <button
        onClick={onCopy}
        style={{
          background: 'rgb(31, 111, 235)', color: 'white', border: 'none', borderRadius: 3,
          padding: '4px 12px', cursor: 'pointer', fontSize: 12,
        }}
      >
        {t('screenshot.toolbar.copy')}
      </button>
      <button
        onClick={onCancel}
        style={{
          background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 3,
          padding: '4px 12px', cursor: 'pointer', fontSize: 12,
        }}
      >
        {t('screenshot.toolbar.cancel')}
      </button>
    </div>
  )
}
```

> The overlay React app is rendered inside `<I18nProvider>`-less context — it doesn't currently wrap. Wrap `OverlayApp` in `I18nProvider` in Task 13.2.

- [ ] **Step 13.2: Update `src/overlay-main.tsx` to provide i18n context**

Replace:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import OverlayApp from './components/screenshot/OverlayApp'
import { I18nProvider } from './i18n/index'
import './styles/globals.css'

async function bootstrap() {
  // Overlay needs the resolved language but doesn't have access to window.api directly.
  // For Phase 1, default to 'en' — language follows main app's resolved language for proper UX
  // is handled in a Phase 1 implementation brainstorm refinement.
  ReactDOM.createRoot(document.getElementById('overlay-root')!).render(
    <React.StrictMode>
      <I18nProvider initialLang="en">
        <OverlayApp />
      </I18nProvider>
    </React.StrictMode>,
  )
}

bootstrap()
```

> **Note**: Overlay always uses `'en'` in Phase 1. Properly resolving the user's language requires a small extra IPC channel exposed in `preload-overlay.ts` to fetch settings synchronously. This is a Phase 1 implementation brainstorm refinement; for now, English text in the overlay is acceptable since the only strings are "Copy" and "Cancel".

- [ ] **Step 13.3: Type-check + build**

Run: `npm run build`
Expected: success.

- [ ] **Step 13.4: Commit**

```bash
git add src/components/screenshot/Toolbar.tsx src/overlay-main.tsx
git commit -m "$(cat <<'EOF'
feat(screenshot): add Phase 1 toolbar (Copy/Cancel) with adaptive positioning

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: ToolboxPage card click rewire

**Files:**
- Modify: `src/components/toolbox/ToolboxPage.tsx`

- [ ] **Step 14.1: Replace `src/components/toolbox/ToolboxPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { AppSettings } from '../../types'
import { useTranslation } from '../../i18n/index'
import { TOOLBOX_TOOLS } from './registry'

export default function ToolboxPage() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    let mounted = true
    window.api.getSettings()
      .then((s) => { if (mounted) setSettings(s) })
      .catch(() => { if (mounted) setSettings(null) })
    return () => { mounted = false }
  }, [])

  if (settings === null) {
    return <div className="text-sm text-text-muted font-mono">{t('common.loading')}</div>
  }

  const enabled = TOOLBOX_TOOLS.filter((tool) => tool.isEnabled(settings))

  if (enabled.length === 0) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-8 text-center">
        <h3 className="text-sm font-medium text-text-primary mb-2">{t('toolbox.empty.title')}</h3>
        <p className="text-xs text-text-secondary">{t('toolbox.empty.hint')}</p>
      </div>
    )
  }

  function handleCardClick(toolId: string) {
    if (toolId === 'screenshot') {
      window.api.triggerScreenshotCapture()
    }
    // Future tools: dispatch by toolId
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {enabled.map((tool) => (
        <div
          key={tool.id}
          onClick={() => handleCardClick(tool.id)}
          className="bg-bg-secondary border border-border-primary rounded-lg p-4 hover:bg-bg-tertiary cursor-pointer flex flex-col"
        >
          <span className="text-2xl mb-2">{tool.icon}</span>
          <h3 className="text-sm font-medium text-text-primary">{t(tool.titleKey)}</h3>
          <p className="text-xs text-text-secondary mt-1 flex-1">{t(tool.descKey)}</p>
          <div className="flex justify-end mt-3">
            <span className="text-xs px-3 py-1.5 bg-status-blue text-white rounded">{t('toolbox.open')}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
```

The `ComingSoonDialog` helper is fully removed (was an internal function in the old file).

- [ ] **Step 14.2: Type-check + build**

Run: `npm run build`
Expected: success.

- [ ] **Step 14.3: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 14.4: Commit**

```bash
git add src/components/toolbox/ToolboxPage.tsx
git commit -m "$(cat <<'EOF'
feat(toolbox): replace Coming Soon dialog with screenshot capture trigger

Card click sends IPC 'screenshot:trigger-capture' for the screenshot tool.
Dispatch is by tool id so future tools route the same way.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Settings UI — capture hotkey + permission status

**Files:**
- Modify: `src/components/settings/Settings.tsx`

- [ ] **Step 15.1: Add the screenshot sub-region inside the Toolbox section**

Find the Toolbox `<Section>` block in `Settings.tsx` (added in toolbox-shell Task 5). It currently looks like:

```tsx
<Section title={t('settings.sections.toolbox')}>
  <p className="text-xs text-text-secondary mb-3">{t('settings.toolbox.description')}</p>
  <Field label={t('settings.toolbox.screenshotEnabled')}>
    <Toggle ... />
  </Field>
</Section>
```

Replace with:

```tsx
<Section title={t('settings.sections.toolbox')}>
  <p className="text-xs text-text-secondary mb-3">{t('settings.toolbox.description')}</p>
  <Field label={t('settings.toolbox.screenshotEnabled')}>
    <Toggle
      value={settings.toolbox.screenshotEnabled}
      onChange={async (v) => {
        const updated = {
          ...settings,
          toolbox: { ...settings.toolbox, screenshotEnabled: v },
        }
        setSettings(updated)
        await window.api.saveSettings(updated)
      }}
    />
  </Field>
  {settings.toolbox.screenshotEnabled && (
    <ScreenshotSubSection settings={settings} setSettings={setSettings} />
  )}
</Section>
```

Append the `ScreenshotSubSection` helper to the file (after the `Toggle` function):

```tsx
function ScreenshotSubSection({
  settings,
  setSettings,
}: {
  settings: AppSettings
  setSettings: (s: AppSettings) => void
}) {
  const { t } = useTranslation()
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'not-determined' | 'restricted' | null>(null)
  const [hotkeyDraft, setHotkeyDraft] = useState(settings.toolbox.screenshot.captureHotkey)
  const [hotkeyError, setHotkeyError] = useState<string | null>(null)

  useEffect(() => { setHotkeyDraft(settings.toolbox.screenshot.captureHotkey) }, [settings.toolbox.screenshot.captureHotkey])

  useEffect(() => {
    let mounted = true
    window.api.checkScreenshotPermission()
      .then((s) => { if (mounted) setPermissionStatus(s) })
      .catch(() => { if (mounted) setPermissionStatus(null) })
    return () => { mounted = false }
  }, [])

  const recheck = () => {
    window.api.checkScreenshotPermission().then(setPermissionStatus)
  }

  const saveHotkey = async () => {
    const trimmed = hotkeyDraft.trim()
    if (trimmed.length === 0 || !/^[A-Za-z0-9+]+$/.test(trimmed.replace(/\s/g, ''))) {
      setHotkeyError(t('screenshot.settings.invalidHotkey'))
      return
    }
    setHotkeyError(null)
    const updated: AppSettings = {
      ...settings,
      toolbox: {
        ...settings.toolbox,
        screenshot: { ...settings.toolbox.screenshot, captureHotkey: trimmed },
      },
    }
    setSettings(updated)
    await window.api.saveSettings(updated)
  }

  const statusLabel =
    permissionStatus === 'granted' ? t('screenshot.permission.statusGranted') :
    permissionStatus === 'denied' || permissionStatus === 'restricted' ? t('screenshot.permission.statusDenied') :
    t('screenshot.permission.statusNotDetermined')

  return (
    <div className="mt-3 pt-3 border-t border-border-primary space-y-3">
      <Field label={t('screenshot.settings.captureHotkey')}>
        <div className="flex gap-2 items-center">
          <input
            value={hotkeyDraft}
            onChange={(e) => setHotkeyDraft(e.target.value)}
            onBlur={saveHotkey}
            placeholder="CommandOrControl+Shift+A"
            className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-xs font-mono text-text-primary w-64"
          />
        </div>
      </Field>
      {hotkeyError && <div className="text-xs text-status-red">{hotkeyError}</div>}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">{statusLabel}</span>
        <button
          onClick={recheck}
          className="text-xs px-2 py-1 border border-border-primary rounded hover:bg-bg-tertiary"
        >
          {t('screenshot.permission.recheck')}
        </button>
        {(permissionStatus === 'denied' || permissionStatus === 'restricted') && (
          <button
            onClick={() => window.api.openScreenshotSystemSettings()}
            className="text-xs px-2 py-1 bg-status-blue text-white rounded"
          >
            {t('screenshot.permission.openSettings')}
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 15.2: Type-check + build**

Run: `npm run build`
Expected: success.

- [ ] **Step 15.3: Commit**

```bash
git add src/components/settings/Settings.tsx
git commit -m "$(cat <<'EOF'
feat(settings): add screenshot sub-section with capture hotkey + permission status

Renders only when screenshotEnabled is true. Hotkey field auto-saves on blur
with simple accelerator validation. Permission status fetched on mount and
on Re-check button.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Final manual verification + bug fixes

**Files:** none modified unless verification surfaces a bug.

- [ ] **Step 16.1: Run full test suite**

Run: `npm test`
Expected: all pass; no regressions.

- [ ] **Step 16.2: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -E "^(src|tests|electron)" | grep -v "network.ts\|HistoryChart\|RealtimeChart\|Treemap"`
Expected: no new errors. Only pre-existing 4 errors persist.

- [ ] **Step 16.3: Run dev server and walk the manual checklist**

Run: `npm run dev`

Walk through:

1. **First-time user, screenshot disabled**: Toolbox sidebar entry visible; clicking it shows "No tools enabled" empty state.
2. **Enable screenshot in Settings**: Toggle turns ON, sub-section appears showing capture hotkey field + permission status.
3. **Click Toolbox card while permission is "not-determined"**: macOS native permission prompt appears; on grant, capture overlay opens. On deny, denied dialog appears.
4. **Capture flow on a single display**: card click → overlay covers display, dim background visible, magnifier follows cursor showing pixel info.
5. **Drag rectangle**: rectangle is outlined in blue as you drag; magnifier shows current size in the bottom strip.
6. **Release**: handles appear at 8 positions; toolbar appears below selection (or above if no room).
7. **Resize via handles**: drag a corner or edge handle, rectangle resizes correctly.
8. **Drag inside selection**: selection moves with cursor.
9. **Drag outside selection**: starts a new selection (replaces the old).
10. **Click 复制**: overlay closes, image is on clipboard. Paste into another app to verify.
11. **macOS native notification appears** for hotkey-triggered captures (Cmd+Shift+A from another app).
12. **Click 取消**: overlay closes silently (no notification, no clipboard write).
13. **Press ESC** in any state: overlay closes silently.
14. **Press Enter** in CONFIRMED state: copies (same as 复制).
15. **Double-click inside selection**: copies.
16. **Multi-display**: open overlays on both; selection scoped to the display you started in. ESC anywhere closes both.
17. **Permission denied flow**: revoke screen recording permission in System Settings → DashMac, restart app, trigger capture → denied dialog appears with "Open System Settings" button → click it → System Settings opens to Screen Recording pane.
18. **Hotkey change**: change the hotkey in Settings, save, press the new hotkey → capture triggers; press the old hotkey → no effect.
19. **Disable screenshot toggle**: hotkey unregisters, sub-section hides.
20. **Language switch (en ↔ zh-CN)**: Settings UI labels translate; permission dialog text translates; toolbar text in overlay shows English (Phase 1 limitation, see §13.2 note).

If any step fails, fix the issue, re-run relevant tests, commit the fix as a separate commit.

- [ ] **Step 16.4: Push the branch**

```bash
git push -u origin feature/screenshot-phase-1
```

---

## Self-review notes

**Spec coverage check** — every Phase 1 section of the spec maps to at least one task:

| Spec section | Covered by |
|---|---|
| §2.1 architecture overview | Task 9 (orchestration) |
| §2.2 cross-phase decisions | Tasks 6 (overlay strategy), 9 (capture timing), 5 (multi-display per-window) |
| §2.3 file structure | Tasks 3-15 (each new file) |
| §2.4 IPC channels | Task 9 (handlers) + Task 6 (preload-overlay) |
| §2.5 notification strategy | Task 9 (`notifyCopied`) |
| §2.6 electron-vite entrypoints | Task 6 |
| §3.1-3.3 settings shape + nested merge | Task 1 |
| §3.4 Settings UI | Task 15 |
| §4 permission flow | Tasks 3 (lib) + 9 (entry-point check) + 15 (UI) |
| §5.1 trigger flow | Task 9 (IPC) + Task 14 (card click) |
| §5.2 capture | Task 5 |
| §5.3 overlay window | Task 7 |
| §5.4 OverlayApp state machine | Task 10 |
| §5.5 magnifier | Task 12 |
| §5.6 toolbar Phase 1 | Task 13 |
| §5.7 confirm-copy | Task 9 (`handleConfirm`) |
| §5.8 cancel | Task 9 (`handleCancel`) |
| §5.9 multi-display Phase 1 limit | Task 7 (overlay per display, no cross-display selection state) |
| §10 i18n keys (Phase 1 subset) | Task 2 |
| §11.1 automated tests | Tasks 3, 4, 5, 7, 8 each include tests; Task 1 extends settingsStore tests |
| §11.2 manual verification | Task 16 |

**Type consistency check** — `Rect`, `Selection`, `DisplayCapture`, `ScreenPermission`, `ScreenshotSettings`, `ConfirmPayload` all named consistently across tasks.

**Known phase-1 limitations documented** (will be polished in Phase 1 implementation brainstorm or punted to Phase 2+):
- Selection "hole punch" through dim overlay is simplistic — Task 11 just outlines the rectangle rather than fully un-dimming it.
- Overlay i18n is hardcoded to English — Task 13.2 notes the small IPC extension needed to follow main-app language.
- Hotkey input is plain `<input>` with weak validation — see spec §10's "key recorder is out of scope" note.
