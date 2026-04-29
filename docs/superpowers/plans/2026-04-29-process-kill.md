# Process Kill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the Memory page as memory management — move ProcessList to the top, add single-select with kill (SIGTERM/SIGKILL) via right-click menu and a top-right dropdown button, with native macOS confirmation dialog and a small safety blacklist.

**Architecture:** New `electron/services/processControl.ts` wraps `process.kill` into a discriminated-union result. A new IPC handler in `main.ts` shows a confirmation dialog, runs the safety blacklist (DashMac itself, `launchd`, `kernel_task`, `WindowServer`), maps errnos to i18n strings, and protects against re-entry. The renderer's `ProcessList.tsx` gains selection state and reuses the existing `ContextMenu` component for both right-click and the dropdown button. The main-process `t()` is extended with `{var}` interpolation by reusing the existing `interpolate` helper.

**Tech Stack:** Electron + React 19 + TypeScript strict + Zustand + Tailwind 4. No new dependencies. Native `dialog.showMessageBox` for confirmation; `process.kill` for signals.

**Spec:** `docs/superpowers/specs/2026-04-29-process-kill-design.md`

---

## File Structure

**New main-process files:**
- `electron/services/processControl.ts` — `killProcess(pid, signal)` returning a discriminated `KillResult`.

**New tests:**
- `tests/electron/processControl.test.ts`
- `tests/electron/i18n.test.ts` — extends existing tests with interpolation cases (file already exists from i18n work)

**Modified:**
- `src/types.ts` — add `killProcess` method to `DashMacAPI`
- `electron/i18n/index.ts` — extend `t()` with optional `vars` parameter
- `electron/i18n/locales/en.ts` — add `processControl.*` namespace + `common.cancel`
- `electron/i18n/locales/zh-CN.ts` — same shape, Chinese values
- `src/i18n/locales/en.ts` — change `pages.memory`, add `processControl.*` namespace
- `src/i18n/locales/zh-CN.ts` — same
- `electron/main.ts` — register `'action:kill-process'` handler with dialog, safety guards, errno→i18n mapping, re-entry flag
- `electron/preload.ts` — expose `killProcess`
- `src/components/memory/ProcessList.tsx` — selection state, top-right kill dropdown button, right-click menu, kill dispatch
- `src/components/memory/MemoryOverview.tsx` — reorder children so ProcessList is at top

---

## Conventions

- **Commit per task** with lowercase conventional-commit messages (`feat(memory): …`, `feat(i18n): …`, `test: …`, `refactor: …`).
- **TDD where it applies** — service module and i18n function gain tests first.
- **No `.ts`/`.tsx` extensions** in imports.
- **Tests** live in `tests/electron/`. Run a single file: `npx vitest run tests/electron/<file>.test.ts`. All: `npm test`.
- **Build verification:** `npm run build` (electron-vite); type errors surface during build.
- **Working directory** is the project root or worktree root (the executing skill will set this up).

---

## Task 1: processControl service + tests

**Files:**
- Create: `electron/services/processControl.ts`
- Test: `tests/electron/processControl.test.ts`

Pure service: wraps `process.kill` into a discriminated union. Tests use `vi.spyOn(process, 'kill')` to avoid actually killing real PIDs.

- [ ] **Step 1: Write the failing tests**

Create `tests/electron/processControl.test.ts`:

```ts
import { describe, expect, test, vi, afterEach } from 'vitest'
import { killProcess } from '../../electron/services/processControl'

afterEach(() => vi.restoreAllMocks())

describe('killProcess', () => {
  test('returns ok=true on successful kill and forwards args correctly', () => {
    const spy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    expect(killProcess(12345, 'SIGTERM')).toEqual({ ok: true })
    expect(spy).toHaveBeenCalledWith(12345, 'SIGTERM')
  })

  test('SIGKILL is forwarded as the second arg', () => {
    const spy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    killProcess(99, 'SIGKILL')
    expect(spy).toHaveBeenCalledWith(99, 'SIGKILL')
  })

  test('returns errno=EPERM with message when kill throws EPERM', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('Operation not permitted') as NodeJS.ErrnoException
      err.code = 'EPERM'
      throw err
    })
    const r = killProcess(1, 'SIGTERM')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errno).toBe('EPERM')
      expect(r.message).toBe('Operation not permitted')
    }
  })

  test('returns errno=ESRCH for missing process', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('No such process') as NodeJS.ErrnoException
      err.code = 'ESRCH'
      throw err
    })
    const r = killProcess(999999, 'SIGTERM')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errno).toBe('ESRCH')
  })

  test('returns errno=EUNKNOWN for non-Error throws', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => { throw 'weird' })
    const r = killProcess(1, 'SIGTERM')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errno).toBe('EUNKNOWN')
  })
})
```

- [ ] **Step 2: Run tests; confirm failure**

Run: `npx vitest run tests/electron/processControl.test.ts`
Expected: failure (module not found).

- [ ] **Step 3: Implement the service**

Create `electron/services/processControl.ts`:

```ts
export type KillSignal = 'SIGTERM' | 'SIGKILL'

export type KillResult =
  | { ok: true }
  | { ok: false; errno: string; message: string }

export function killProcess(pid: number, signal: KillSignal): KillResult {
  try {
    process.kill(pid, signal)
    return { ok: true }
  } catch (err: any) {
    return {
      ok: false,
      errno: err?.code ?? 'EUNKNOWN',
      message: err?.message ?? String(err),
    }
  }
}
```

- [ ] **Step 4: Run tests; confirm pass**

Run: `npx vitest run tests/electron/processControl.test.ts`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add electron/services/processControl.ts tests/electron/processControl.test.ts
git commit -m "feat(memory): add processControl service with errno-discriminated kill"
```

---

## Task 2: Type extensions in src/types.ts

**Files:**
- Modify: `src/types.ts`

Add `killProcess` to the `DashMacAPI` interface. The renderer never sees `errno` directly — the IPC handler maps it to a translated message before returning.

- [ ] **Step 1: Add the method to `DashMacAPI`**

Find the `DashMacAPI` interface in `src/types.ts`. Add this method (place it grouped with the file-browser methods or just below them):

```ts
  killProcess: (
    pid: number,
    name: string,
    signal: 'SIGTERM' | 'SIGKILL',
  ) => Promise<
    | { ok: true }
    | { ok: false; cancelled: true }
    | { ok: false; message: string }
  >
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "types\.ts" || echo "no errors in types.ts"`
Expected: `no errors in types.ts`. (Other files will report errors because the contract isn't yet implemented — those are expected and fixed in Tasks 5–6.)

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(memory): extend DashMacAPI with killProcess"
```

---

## Task 3: Main-process t() with interpolation

**Files:**
- Modify: `electron/i18n/index.ts`
- Modify: `tests/electron/i18n.test.ts`

Extend the existing `t()` in `electron/i18n/index.ts` to accept an optional `vars` parameter and reuse the existing `interpolate` from `src/i18n/lookup.ts`.

- [ ] **Step 1: Read the current main `t()` implementation**

Run: `cat electron/i18n/index.ts`
Confirm the current signature is `export function t(key: string): string`.

- [ ] **Step 2: Update the import**

The current import is:
```ts
import { lookup } from '../../src/i18n/lookup'
import type { NestedDict } from '../../src/i18n/lookup'
```

Add `interpolate` to the named import:
```ts
import { lookup, interpolate } from '../../src/i18n/lookup'
import type { NestedDict } from '../../src/i18n/lookup'
```

- [ ] **Step 3: Extend the `t()` signature**

Find:
```ts
export function t(key: string): string {
  const dict = (currentLang === 'zh-CN' ? zhCN : en) as unknown as NestedDict
  const enDict = en as unknown as NestedDict
  return lookup(dict, key) ?? lookup(enDict, key) ?? key
}
```

Replace with:
```ts
export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = (currentLang === 'zh-CN' ? zhCN : en) as unknown as NestedDict
  const enDict = en as unknown as NestedDict
  const v = lookup(dict, key) ?? lookup(enDict, key) ?? key
  return interpolate(v, vars)
}
```

- [ ] **Step 4: Add tests for interpolation**

Append to the END of the existing `tests/electron/i18n.test.ts` (inside the existing `describe('t and setLang', ...)` block, before its closing brace):

```ts
  test('interpolates {var} placeholders when vars provided', () => {
    setLang('en')
    // tray.tooltip is 'DashMac' — no placeholder; verify pass-through with empty vars
    expect(t('tray.tooltip', {})).toBe('DashMac')
    // Use a key that doesn't exist; t() falls back to the key itself,
    // and interpolate should still process placeholders in the key string.
    expect(t('hello {name}', { name: 'world' })).toBe('hello world')
  })

  test('interpolation works when key resolves to a translated value', () => {
    // Add a synthetic translation via direct module manipulation is fragile;
    // we rely on the lookup fallback returning the key string and confirming
    // interpolate runs on it. The renderer-side i18n tests also cover real-key
    // interpolation more thoroughly.
    setLang('en')
    expect(t('a {x} b', { x: 'middle' })).toBe('a middle b')
  })

  test('omitting vars leaves placeholders intact', () => {
    setLang('en')
    expect(t('hello {name}')).toBe('hello {name}')
  })
```

- [ ] **Step 5: Run tests; confirm pass**

Run: `npx vitest run tests/electron/i18n.test.ts`
Expected: all existing 12 tests + 3 new = 15 passing.

- [ ] **Step 6: Commit**

```bash
git add electron/i18n/index.ts tests/electron/i18n.test.ts
git commit -m "feat(i18n): support {var} interpolation in main-process t()"
```

---

## Task 4: Main-process locale dictionaries

**Files:**
- Modify: `electron/i18n/locales/en.ts`
- Modify: `electron/i18n/locales/zh-CN.ts`

Add `processControl.*` (used in the dialog) and `common.cancel` (used as the dialog's cancel button label).

The main dictionary needs both the dialog strings AND the error/safety strings, because the IPC handler in Task 6 returns translated messages directly (the renderer just toasts them).

- [ ] **Step 1: Update `electron/i18n/locales/en.ts`**

The current English main dictionary is:

```ts
const en = {
  tray: { tooltip: 'DashMac', open: 'Open DashMac', quit: 'Quit' },
}

export default en
```

Replace with:

```ts
const en = {
  tray: { tooltip: 'DashMac', open: 'Open DashMac', quit: 'Quit' },
  common: { cancel: 'Cancel' },
  processControl: {
    confirmTitle: 'Quit process?',
    confirmTermMessage: 'Are you sure you want to quit {name} (PID {pid})?',
    confirmForceMessage: 'Force quit {name} (PID {pid})? Unsaved data will be lost.',
    confirmButton: 'Quit',
    confirmForceButton: 'Force Quit',
    cannotKillSelf: 'Cannot kill DashMac itself',
    protected: 'Cannot kill protected system process',
    error: {
      permission: 'No permission to kill this process. System processes or those owned by other users require admin privileges.',
      notFound: 'Process does not exist (may have already exited)',
      invalidSignal: 'Invalid signal',
      generic: 'Failed to kill process: {message}',
    },
  },
}

export default en
```

- [ ] **Step 2: Update `electron/i18n/locales/zh-CN.ts`**

Mirror the structure in Chinese:

```ts
import en from './en'

const zhCN: typeof en = {
  tray: { tooltip: 'DashMac', open: '打开 DashMac', quit: '退出' },
  common: { cancel: '取消' },
  processControl: {
    confirmTitle: '终止进程？',
    confirmTermMessage: '确定要退出 {name}（PID {pid}）吗？',
    confirmForceMessage: '强制退出 {name}（PID {pid}）？未保存的数据将丢失。',
    confirmButton: '退出',
    confirmForceButton: '强制退出',
    cannotKillSelf: '不能终止 DashMac 自身',
    protected: '不能终止受保护的系统进程',
    error: {
      permission: '无权终止该进程。系统进程或其他用户的进程需要管理员权限。',
      notFound: '进程不存在（可能已退出）',
      invalidSignal: '无效的信号',
      generic: '终止进程失败：{message}',
    },
  },
}

export default zhCN
```

- [ ] **Step 3: Run shape parity test**

Run: `npx vitest run tests/electron/i18n-shape.test.ts`
Expected: 2 passing.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "electron/i18n/locales" || echo "no errors in main locales"`
Expected: `no errors in main locales`.

- [ ] **Step 5: Commit**

```bash
git add electron/i18n/locales/en.ts electron/i18n/locales/zh-CN.ts
git commit -m "feat(i18n): add processControl + common namespaces to main locales"
```

---

## Task 5: Renderer locale dictionaries

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh-CN.ts`

Change `pages.memory` value (from `Memory Analysis` to `Memory Management`) and add the `processControl.*` namespace used by the kill button label and the error toasts.

- [ ] **Step 1: Update `src/i18n/locales/en.ts`**

Find this in the existing dictionary:
```ts
pages: {
  ...
  memory: 'Memory Analysis',
  ...
},
```

Change `memory` value to `'Memory Management'`:
```ts
pages: {
  ...
  memory: 'Memory Management',
  ...
},
```

Then add this entire new top-level namespace as a sibling key (place it next to `tray`, `settings`, etc.):

```ts
processControl: {
  killSelected: 'Quit {name}',
  killSelectedDisabled: 'Quit process',
  menu: {
    quit: 'Quit',
    forceQuit: 'Force Quit',
  },
},
```

The renderer dictionary deliberately does NOT include `error.*` or `cannotKillSelf`/`protected` strings — those are kept only in the main dictionary because the IPC handler returns pre-translated strings.

- [ ] **Step 2: Update `src/i18n/locales/zh-CN.ts`**

Find:
```ts
pages: {
  ...
  memory: '内存分析',
  ...
},
```

Change to `'内存管理'`:
```ts
pages: {
  ...
  memory: '内存管理',
  ...
},
```

Add the matching `processControl` namespace:

```ts
processControl: {
  killSelected: '退出 {name}',
  killSelectedDisabled: '退出进程',
  menu: {
    quit: '退出',
    forceQuit: '强制退出',
  },
},
```

- [ ] **Step 3: Run shape parity test**

Run: `npx vitest run tests/electron/i18n-shape.test.ts`
Expected: 2 passing.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "i18n/locales" | grep -v "electron/" || echo "no errors in renderer locales"`
Expected: `no errors in renderer locales`.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/zh-CN.ts
git commit -m "feat(i18n): rename pages.memory to Memory Management and add processControl namespace"
```

---

## Task 6: main.ts IPC handler with dialog + safety guards

**Files:**
- Modify: `electron/main.ts`

Register the `'action:kill-process'` handler. Behavior:
1. Pre-checks (return early without dialog): self-PID, protected names, re-entry flag.
2. Show native confirmation dialog.
3. If confirmed, call `killProcess`. Map errno to i18n key and return as `message`.

- [ ] **Step 1: Add imports**

Near the top of `electron/main.ts`, add:

```ts
import { dialog } from 'electron'
import { killProcess } from './services/processControl'
```

The existing `electron` import already has `app, BrowserWindow, ipcMain, shell, Tray, nativeImage, Menu` — add `dialog` to that import line if it isn't already there. (As of writing it isn't.)

So change:
```ts
import { app, BrowserWindow, ipcMain, shell, Tray, nativeImage, Menu } from 'electron'
```
to:
```ts
import { app, BrowserWindow, ipcMain, shell, Tray, nativeImage, Menu, dialog } from 'electron'
```

And add the service import below (separate line to avoid mixing concerns).

- [ ] **Step 2: Add the protected-name set + re-entry flag + handler**

At a module-level position in `electron/main.ts` (after the imports, near the existing `let mainWindow: ...` declarations), add:

```ts
const PROTECTED_PROCESS_NAMES = new Set(['launchd', 'kernel_task', 'WindowServer'])
let isKillDialogOpen = false
```

Inside `registerIpcHandlers()` (after the existing handlers), add:

```ts
  ipcMain.handle('action:kill-process', async (_e, pid: number, name: string, signal: 'SIGTERM' | 'SIGKILL') => {
    // Safety guards — checked before showing the dialog.
    if (pid === process.pid) {
      return { ok: false as const, message: t('processControl.cannotKillSelf') }
    }
    if (PROTECTED_PROCESS_NAMES.has(name)) {
      return { ok: false as const, message: t('processControl.protected') }
    }
    if (isKillDialogOpen) {
      return { ok: false as const, cancelled: true as const }
    }

    isKillDialogOpen = true
    try {
      const isForce = signal === 'SIGKILL'
      const result = await dialog.showMessageBox(mainWindow!, {
        type: 'warning',
        buttons: [
          t('common.cancel'),
          isForce ? t('processControl.confirmForceButton') : t('processControl.confirmButton'),
        ],
        defaultId: 0,
        cancelId: 0,
        title: t('processControl.confirmTitle'),
        message: isForce
          ? t('processControl.confirmForceMessage', { name, pid })
          : t('processControl.confirmTermMessage', { name, pid }),
      })
      if (result.response !== 1) {
        return { ok: false as const, cancelled: true as const }
      }

      const killResult = killProcess(pid, signal)
      if (killResult.ok) {
        return { ok: true as const }
      }

      // Map errno to i18n message before returning.
      let messageKey: string
      const vars: Record<string, string | number> = {}
      switch (killResult.errno) {
        case 'EPERM':
          messageKey = 'processControl.error.permission'
          break
        case 'ESRCH':
          messageKey = 'processControl.error.notFound'
          break
        case 'EINVAL':
          messageKey = 'processControl.error.invalidSignal'
          break
        default:
          messageKey = 'processControl.error.generic'
          vars.message = killResult.message
      }
      return { ok: false as const, message: t(messageKey, vars) }
    } finally {
      isKillDialogOpen = false
    }
  })
```

All `processControl.*` and `common.cancel` keys used in this handler are added in Task 4's main-process dictionary (including the `error.*` sub-namespace). The handler resolves them via the main-side `t()`.

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat(memory): IPC handler for kill-process with confirm dialog and safety guards"
```

---

## Task 7: preload bridge

**Files:**
- Modify: `electron/preload.ts`

Expose `killProcess` on `window.api`. Pattern matches existing `invoke` methods.

- [ ] **Step 1: Add the method**

Inside the `contextBridge.exposeInMainWorld('api', { ... })` object in `electron/preload.ts`, add this entry (place it grouped with other action-style methods or at the end):

```ts
  killProcess: (pid: number, name: string, signal: 'SIGTERM' | 'SIGKILL') =>
    ipcRenderer.invoke('action:kill-process', pid, name, signal),
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success — `DashMacAPI.killProcess` was declared in Task 2, so the bridge method now satisfies the contract.

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat(memory): expose killProcess via preload bridge"
```

---

## Task 8: ProcessList — selection, kill button, context menu

**Files:**
- Modify: `src/components/memory/ProcessList.tsx`

Selection state, top-right kill dropdown button, right-click context menu, and IPC dispatch for kill. Reuses the existing `ContextMenu` from `src/components/files/ContextMenu.tsx`.

- [ ] **Step 1: Replace the entire ProcessList component**

The current `src/components/memory/ProcessList.tsx` renders a static table. Replace it with this version:

```tsx
import { useState, useEffect } from 'react'
import type { ProcessInfo } from '../../types'
import { useTranslation } from '../../i18n/index'
import { useToast } from '../../stores/toastStore'
import ContextMenu, { type MenuItem } from '../files/ContextMenu'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export default function ProcessList() {
  const { t } = useTranslation()
  const toast = useToast()
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPid, setSelectedPid] = useState<number | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number; pid: number; name: string } | null>(null)

  useEffect(() => {
    let active = true
    const fetch = async () => {
      const data = await window.api.queryProcesses()
      if (active) { setProcesses(data); setLoading(false) }
    }
    fetch()
    const interval = setInterval(fetch, 5000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  // Esc clears selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedPid(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const selectedProc = processes.find((p) => p.pid === selectedPid) ?? null

  const dispatchKill = async (pid: number, name: string, signal: 'SIGTERM' | 'SIGKILL') => {
    const r = await window.api.killProcess(pid, name, signal)
    if (!r.ok && !('cancelled' in r)) {
      toast.error(r.message)
    }
  }

  const buildMenuItems = (pid: number, name: string): MenuItem[] => [
    { label: t('processControl.menu.quit'), onClick: () => dispatchKill(pid, name, 'SIGTERM') },
    { label: t('processControl.menu.forceQuit'), onClick: () => dispatchKill(pid, name, 'SIGKILL') },
  ]

  const handleRowContextMenu = (e: React.MouseEvent, proc: ProcessInfo) => {
    e.preventDefault()
    setSelectedPid(proc.pid)
    setMenuAnchor({ x: e.clientX, y: e.clientY, pid: proc.pid, name: proc.name })
  }

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!selectedProc) return
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuAnchor({
      x: rect.left,
      y: rect.bottom + 2,
      pid: selectedProc.pid,
      name: selectedProc.name,
    })
  }

  if (loading) return <div className="text-text-muted font-mono text-sm p-4">{t('memory.processList.loading')}</div>

  const buttonLabel = selectedProc
    ? t('processControl.killSelected', { name: truncate(selectedProc.name, 20) })
    : t('processControl.killSelectedDisabled')

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border-primary flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">{t('memory.processList.title')}</h3>
        <button
          onClick={handleButtonClick}
          disabled={!selectedProc}
          className={`px-3 py-1 text-xs font-mono rounded border ${
            selectedProc
              ? 'text-status-red border-status-red hover:bg-status-red/10 cursor-pointer'
              : 'text-text-muted border-border-primary opacity-30 cursor-not-allowed'
          }`}
        >
          ✕ {buttonLabel} ▾
        </button>
      </div>
      <div className="overflow-y-auto max-h-96">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-text-muted border-b border-border-secondary">
              <th className="text-left px-4 py-2 font-medium">{t('memory.processList.process')}</th>
              <th className="text-right px-4 py-2 font-medium">{t('memory.processList.pid')}</th>
              <th className="text-right px-4 py-2 font-medium">{t('memory.processList.memory')}</th>
              <th className="text-right px-4 py-2 font-medium">{t('memory.processList.cpu')}</th>
            </tr>
          </thead>
          <tbody>
            {processes.slice(0, 50).map((proc) => (
              <tr
                key={`${proc.pid}-${proc.name}`}
                onClick={() => setSelectedPid(proc.pid)}
                onContextMenu={(e) => handleRowContextMenu(e, proc)}
                className={`border-b border-border-secondary cursor-default ${
                  selectedPid === proc.pid
                    ? 'bg-status-blue/30 text-text-primary'
                    : 'hover:bg-bg-tertiary'
                }`}
              >
                <td className="px-4 py-1.5 truncate max-w-[200px]">{proc.name}</td>
                <td className="px-4 py-1.5 text-text-secondary text-right">{proc.pid}</td>
                <td className="px-4 py-1.5 text-right text-status-blue">{formatBytes(proc.memoryUsage)}</td>
                <td className="px-4 py-1.5 text-right text-text-secondary">{proc.cpuUsage.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {menuAnchor && (
        <ContextMenu
          x={menuAnchor.x}
          y={menuAnchor.y}
          items={buildMenuItems(menuAnchor.pid, menuAnchor.name)}
          onClose={() => setMenuAnchor(null)}
        />
      )}
    </div>
  )
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/memory/ProcessList.tsx
git commit -m "feat(memory): add selection, kill button, and right-click menu to ProcessList"
```

---

## Task 9: MemoryOverview — reorder so ProcessList is on top

**Files:**
- Modify: `src/components/memory/MemoryOverview.tsx`

Move `<ProcessList />` from the bottom of the JSX tree to the top. Everything else stays in place.

- [ ] **Step 1: Read the current file**

Run: `cat src/components/memory/MemoryOverview.tsx`

Confirm the current return statement renders, in order:
1. A grid of stat cards (Total / Used / Free / Cached / PressureGauge)
2. A 2-col grid of `Swap Used` / `Swap Total`
3. A "Real-time Memory Usage" chart card
4. A "History" card with chart and range buttons
5. `<ProcessList />` last

- [ ] **Step 2: Move `<ProcessList />` to the top**

In the return JSX, the structure is roughly:

```tsx
return (
  <div className="space-y-4">
    <div className="grid grid-cols-5 gap-4"> ... stat cards ... </div>
    <div className="grid grid-cols-2 gap-4"> ... swap ... </div>
    <div className="bg-bg-secondary..."> ... realtime chart ... </div>
    <div className="bg-bg-secondary..."> ... history chart ... </div>
    <ProcessList />
  </div>
)
```

Cut the `<ProcessList />` line from the end and paste it as the FIRST child:

```tsx
return (
  <div className="space-y-4">
    <ProcessList />
    <div className="grid grid-cols-5 gap-4"> ... stat cards ... </div>
    <div className="grid grid-cols-2 gap-4"> ... swap ... </div>
    <div className="bg-bg-secondary..."> ... realtime chart ... </div>
    <div className="bg-bg-secondary..."> ... history chart ... </div>
  </div>
)
```

(Don't change any other content. The exact JSX of the existing children stays as-is.)

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/memory/MemoryOverview.tsx
git commit -m "feat(memory): reorder Memory page so ProcessList sits at top"
```

---

## Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: existing tests + new tests all pass. New count: 5 (processControl) + 3 (i18n interpolation) = 8 new tests.

- [ ] **Step 2: Run the full build**

Run: `npm run build`
Expected: success across main, preload, and renderer.

- [ ] **Step 3: TypeScript strict-mode check**

Run: `npx tsc --noEmit`
Expected: no NEW errors. Pre-existing chart/network/treemap errors may persist; verify they predate this work via `git log -1 -- <file>`.

- [ ] **Step 4: Manual smoke test (macOS)**

Reset settings (optional, only if needed):
```bash
rm -f "$HOME/Library/Application Support/dashmac/settings.json"
```

Run: `npm run dev`

Click Memory in the sidebar. Verify:
- Header reads "Memory Management" / "内存管理"
- ProcessList is at the top of the page; cards/charts below
- Top-right kill button shows greyed `✕ Quit process ▾` initially
- Click any row → row highlights blue, button activates with selected name (e.g. `✕ Quit Chrome ▾`)
- Esc clears selection
- Click button → dropdown with two items: Quit / Force Quit
- Right-click row → same two-item menu
- Pick "Quit" → native macOS confirm dialog appears with Cancel as default
- Cancel the dialog → no kill
- Confirm the dialog → process killed; row disappears within 5 s
- Try to kill DashMac itself (find DashMac in the list) → error toast, no dialog
- Try to kill `WindowServer` → error toast, no dialog
- Switch to Chinese (Settings → Appearance → 简体中文) → all new strings render in Chinese, including dialog title/message and toast texts

- [ ] **Step 5: Commit any inline fixes from smoke testing**

If issues were found and fixed, commit them. Otherwise:

```bash
git status   # confirm clean tree
```

---

## Acceptance criteria recap

- [ ] Memory page Header reads `内存管理 / Memory Management`; Sidebar label stays `内存 / Memory`
- [ ] ProcessList is at the top of the Memory page
- [ ] Single-click a row → row highlights blue
- [ ] Esc clears selection; clicking outside the table does NOT clear (per spec)
- [ ] Top kill button shows `✕ Quit {name} ▾` when selected; greyed when not
- [ ] Click button → dropdown with Quit / Force Quit
- [ ] Right-click row → same two-item menu (also auto-selects the right-clicked row)
- [ ] Selecting either menu item → native macOS confirm dialog with Cancel as default button
- [ ] Cancel dialog → no kill, no error toast
- [ ] Confirm SIGTERM → process killed; row disappears in ≤ 5 s
- [ ] Confirm SIGKILL → process killed; row disappears in ≤ 5 s
- [ ] Trying to kill DashMac itself or `launchd`/`kernel_task`/`WindowServer` → error toast, no dialog shown
- [ ] Killing a system process owned by root → EPERM-mapped error toast
- [ ] Killing a non-existent PID → ESRCH-mapped error toast
- [ ] Chinese locale: dialog title/message, menu items, button label, error toasts all in Chinese
- [ ] `npm test` passes
- [ ] `npm run build` passes
