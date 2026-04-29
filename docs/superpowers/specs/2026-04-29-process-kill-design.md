# Process Kill — Design Spec

**Date:** 2026-04-29
**Status:** Design approved, pending implementation plan

## Goals

Reframe the Memory page from analytics-only to general memory management. Surface the existing process list as the primary content, and let users select a process and terminate it (SIGTERM or SIGKILL) with a native confirmation dialog. Errors (permission denied, missing process) surface via the existing Toast system.

## Non-Goals

- Privilege escalation (sudo / TCC prompts) for killing protected processes
- Multi-select + bulk kill
- Suspend / continue (SIGSTOP / SIGCONT) operations
- Restart process / re-launch app
- Detailed process info panel (file descriptors, threads, CPU time)
- Filter by user, search by name, process-tree view
- Per-process memory history / charts
- Manual memory compaction or cache clearing operations
- "Show in Activity Monitor" or other handoffs

## Architecture

### Page reorganization (Memory page)

`MemoryOverview.tsx` is rearranged so the process list is the top section and the analytics cards/charts move below. Header label changes from `Memory Analysis` / `内存分析` to `Memory Management` / `内存管理`. Sidebar nav label stays `Memory` / `内存` (short labels don't need the "Management" qualifier).

```
┌──────────────────────────────────────────────────────────┐
│  进程排名                          [✕ 退出 {name} ▾]      │  ← top
│  ▶ Chrome      1234   4.5 GB    30%                      │
│    Code        5678   1.2 GB    15%                      │
│    ...                                                    │
├──────────────────────────────────────────────────────────┤
│  [Total][Used][Free][Cached][Pressure]                    │
│  [Swap Used][Swap Total]                                  │
│  [Real-time Memory Usage chart]                           │
│  [History 1h/24h/7d chart]                                │
└──────────────────────────────────────────────────────────┘
```

### Module decomposition

**Main process:**
- `electron/services/processControl.ts` — pure `killProcess(pid, signal)` returning a discriminated `{ ok: true } | { ok: false; errno; message }` result.

**IPC layer (in `electron/main.ts`):**
- One new channel `'action:kill-process'`.
- Handler shows native `dialog.showMessageBox` for confirmation, then calls `killProcess`. Returns `{ ok: true } | { ok: false; cancelled: true } | { ok: false; message }`.
- Module-level `isKillDialogOpen: boolean` guards against re-entry (user clicking the kill action twice while a dialog is up).
- Self-PID and protected-name list rejected before the dialog.

**Renderer:**
- `src/components/memory/MemoryOverview.tsx` — reorders existing children (ProcessList moves to top).
- `src/components/memory/ProcessList.tsx` — adds selection state, top-right kill dropdown button, right-click context menu reusing `src/components/files/ContextMenu.tsx`.
- No new component files in the renderer.

### State management

`ProcessList`'s local state grows by one field:

```ts
const [selectedPid, setSelectedPid] = useState<number | null>(null)
```

Plus a small piece of UI state for the dropdown menu:

```ts
const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)
```

Both are component-local — no store needed. Existing fetch/poll loop (5 s `setInterval`) is unchanged.

### IPC contract additions

`src/types.ts` — add to `DashMacAPI`:

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

The handler receives the process name from the renderer (already known there) so the confirmation dialog can show a human-readable label without main re-querying ps.

## Selection, menu, and button

### Selection model (single-select per Q3=A)

- Single click on a row → `setSelectedPid(proc.pid)`. Re-clicking the same row does nothing (no toggle off — the kill button being visible needs a stable target).
- Esc → `setSelectedPid(null)`.
- Click outside the table does **not** clear selection. Trade-off accepted: less "clean" visually, but avoids accidental clearing and keeps the kill button's target stable while the user moves the mouse to it.
- Right-click on a row that is **not** currently selected → also sets it as selected (Finder-consistent), then opens the context menu.

### Top kill button (top-right of the ProcessList header)

- Disabled (greyed) when `selectedPid === null`.
- Active state shows the selected process's name truncated to 20 chars: `[✕ 退出 Chrome ▾]`. Color: `text-status-red border-status-red` to communicate destructiveness.
- Click → opens the same dropdown menu as the right-click context menu (uses the same `ContextMenu` component, positioned below the button).

### Context menu (two items)

Reuses the existing `src/components/files/ContextMenu.tsx`. Two items:

| Label (en / zh-CN) | Action |
|---|---|
| Quit / 退出 | dispatch `killProcess(pid, name, 'SIGTERM')` |
| Force Quit / 强制退出 | dispatch `killProcess(pid, name, 'SIGKILL')` |

No separator, no other items. Both items dispatch the same IPC; the signal differs.

## Confirmation dialog

The IPC handler in `electron/main.ts` calls `dialog.showMessageBox(mainWindow, opts)` before doing anything destructive:

```ts
const result = await dialog.showMessageBox(mainWindow!, {
  type: 'warning',
  buttons: [t('common.cancel'), signal === 'SIGKILL' ? t('processControl.confirmForceButton') : t('processControl.confirmButton')],
  defaultId: 0,
  cancelId: 0,
  title: t('processControl.confirmTitle'),
  message: signal === 'SIGKILL'
    ? t('processControl.confirmForceMessage', { name, pid })
    : t('processControl.confirmTermMessage', { name, pid }),
})
if (result.response !== 1) return { ok: false, cancelled: true }
```

- Button order: Cancel left, Quit/Force Quit right (macOS native conventions).
- `defaultId: 0` and `cancelId: 0` make Enter and Esc both safely cancel.
- The dialog uses native locale buttons but our message and title still need i18n keys — see §i18n.

### Re-entry guard

Module-level flag in `main.ts`:

```ts
let isKillDialogOpen = false
```

Set to `true` before `await dialog.showMessageBox(...)`, set to `false` in a `finally`. If a second IPC arrives while a dialog is open, return `{ ok: false, cancelled: true }` immediately.

## Process control service

`electron/services/processControl.ts`:

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

Pure, synchronous (Node's `process.kill` is sync), no Electron deps. Easy to mock in tests.

## Safety guards

Reject in the IPC handler **before** the dialog:

```ts
const PROTECTED_NAMES = new Set(['launchd', 'kernel_task', 'WindowServer'])

if (pid === process.pid) {
  return { ok: false, message: t('processControl.cannotKillSelf') }
}
if (PROTECTED_NAMES.has(name)) {
  return { ok: false, message: t('processControl.protected') }
}
```

Rationale:
- Killing DashMac itself is a UX death-loop and the IPC handler can't even return its own success.
- `launchd` PID 1 — kernel panic on kill; OS prevents it but be defensive.
- `kernel_task` — meta-process for kernel; OS prevents it.
- `WindowServer` — running as root with SIP exceptions; killing it crashes the entire user GUI session. macOS does not always block this at the kernel level, so we add our own block.

The blacklist is small and intentional. We do **not** try to enumerate every system daemon; OS-level EPERM handles the rest naturally.

## Error handling

The renderer dispatches via `window.api.killProcess(...)`. The handler returns one of three shapes:

| Shape | Renderer action |
|---|---|
| `{ ok: true }` | success path: nothing to show; list will refresh in ≤ 5 s |
| `{ ok: false, cancelled: true }` | silent (user pressed Cancel) |
| `{ ok: false, message: string }` | `toast.error(translatedMessage)` |

For the third shape, the IPC handler maps known errnos to i18n keys before returning the `message` field so the renderer can display directly without further mapping:

| errno (from `processControl.killProcess`) | i18n key used in handler |
|---|---|
| `EPERM` | `processControl.error.permission` |
| `ESRCH` | `processControl.error.notFound` |
| `EINVAL` | `processControl.error.invalidSignal` |
| other | `processControl.error.generic` (templates `{message}`) |

Plus the safety-guard rejections (`cannotKillSelf`, `protected`) which are already strings.

## Auto-refresh after kill

ProcessList already polls every 5 seconds via `setInterval`. We do **not** add a "kick" refresh after a successful kill — the user observes the row disappear within ≤ 5 s naturally. If feedback is too slow in practice, a future tweak can do `fetch()` immediately on success, but that's not part of v1.

## i18n changes

### Renderer dictionaries

`src/i18n/locales/en.ts`:
- `pages.memory: 'Memory Analysis'` → `'Memory Management'`

`src/i18n/locales/zh-CN.ts`:
- `pages.memory: '内存分析'` → `'内存管理'`

Plus a new namespace `processControl` (renderer-only — used in toasts and the kill button label):

```ts
processControl: {
  killSelected: 'Quit {name}',         // dynamic button label
  killSelectedDisabled: 'Quit process', // disabled state
  menu: {
    quit: 'Quit',
    forceQuit: 'Force Quit',
  },
  error: {
    permission: 'No permission to kill this process. System processes or those owned by other users require admin privileges.',
    notFound: 'Process does not exist (may have already exited)',
    invalidSignal: 'Invalid signal',
    generic: 'Failed to kill process: {message}',
    cannotKillSelf: 'Cannot kill DashMac itself',
    protected: 'Cannot kill protected system process',
  },
},
```

Chinese:
```ts
processControl: {
  killSelected: '退出 {name}',
  killSelectedDisabled: '退出进程',
  menu: {
    quit: '退出',
    forceQuit: '强制退出',
  },
  error: {
    permission: '无权终止该进程。系统进程或其他用户的进程需要管理员权限。',
    notFound: '进程不存在（可能已退出）',
    invalidSignal: '无效的信号',
    generic: '终止进程失败：{message}',
    cannotKillSelf: '不能终止 DashMac 自身',
    protected: '不能终止受保护的系统进程',
  },
},
```

### Main-process dictionaries

`electron/i18n/locales/en.ts` and `zh-CN.ts` need new keys for the dialog:

```ts
processControl: {
  confirmTitle: 'Quit process?',
  confirmTermMessage: 'Are you sure you want to quit {name} (PID {pid})?',
  confirmForceMessage: 'Force quit {name} (PID {pid})? Unsaved data will be lost.',
  confirmButton: 'Quit',
  confirmForceButton: 'Force Quit',
},
common: {
  cancel: 'Cancel',
},
```

Chinese:
```ts
processControl: {
  confirmTitle: '终止进程？',
  confirmTermMessage: '确定要退出 {name}（PID {pid}）吗？',
  confirmForceMessage: '强制退出 {name}（PID {pid}）？未保存的数据将丢失。',
  confirmButton: '退出',
  confirmForceButton: '强制退出',
},
common: {
  cancel: '取消',
},
```

### Main-side `t()` interpolation

The current main-process `t(key)` doesn't support `{var}` interpolation — the renderer's `t()` does (via `interpolate` from `src/i18n/lookup.ts`). Extend the main `t()` to accept an optional `vars` parameter and reuse the existing `interpolate` helper:

```ts
// electron/i18n/index.ts
import { lookup, interpolate } from '../../src/i18n/lookup'

export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = (currentLang === 'zh-CN' ? zhCN : en) as unknown as NestedDict
  const enDict = en as unknown as NestedDict
  const v = lookup(dict, key) ?? lookup(enDict, key) ?? key
  return interpolate(v, vars)
}
```

This is a one-line addition (signature change + interpolate call). Existing callers passing only `key` still work; only the dialog calls use `vars`.

## Testing

### `tests/electron/processControl.test.ts`

Five unit tests using `vi.spyOn(process, 'kill')`:

1. Successful kill returns `{ ok: true }` and forwards args correctly.
2. SIGKILL is forwarded as the second arg to `process.kill`.
3. EPERM throw produces `{ ok: false, errno: 'EPERM', message }`.
4. ESRCH throw produces `{ ok: false, errno: 'ESRCH', ... }`.
5. Non-Error throw (e.g., a string) produces `{ ok: false, errno: 'EUNKNOWN', ... }`.

### Existing shape test

`tests/electron/i18n-shape.test.ts` will automatically catch en/zh-CN parity for both renderer and main dictionaries — no new test code needed.

### Out of scope for tests

- Real `process.kill` system calls (unsafe in CI; would risk killing real PIDs)
- `dialog.showMessageBox` rendering / interaction (requires Electron runtime)
- IPC handler end-to-end flow (no IPC test infrastructure)
- React component selection / menu / button behaviors (no renderer test infra)
- The protected-name blacklist (trivial string equality)
- Re-entry guard `isKillDialogOpen` flag (trivial; tested manually)

## Risks

1. **PID reuse** — A user sees PID 1234 = Chrome, but in the few seconds between fetch and kill, Chrome dies and the OS reuses 1234 for some other process. The dialog still shows "Chrome" (the renderer-supplied name). Worst case: user kills the wrong (newly-spawned) process. Probability is very low; mitigation isn't worth complexity. Document as accepted risk.

2. **Re-entry** — If the user clicks "Force Quit" twice quickly while the dialog is opening (network/UI hiccup), the second IPC call hits the open-dialog guard and returns `cancelled`. Acceptable.

3. **`pages.memory` rename surprise** — Header label changes from "Memory Analysis" to "Memory Management". This is intentional (per Q4=B) but flagging in case any external doc / screenshot references the old text.

4. **WindowServer protection assumes the name** — If macOS renames its window-server process in a future release (very unlikely), our blacklist becomes stale. Acceptable; OS still has its own protections.

5. **5-second refresh delay** — User kills a process and waits up to 5 s for the row to disappear. Could feel sluggish for "did it work?" feedback. Mitigation deferred to a future tweak (kick-refresh on success).

6. **No undo** — Killed processes cannot be restarted from DashMac. Acceptable; user re-launches the app via Finder/Spotlight.

## Acceptance criteria

- [ ] Memory page Header reads `内存管理 / Memory Management`; Sidebar label stays `内存 / Memory`
- [ ] ProcessList sits at the top of the Memory page; cards/charts below
- [ ] Single-clicking a process row highlights the row in blue
- [ ] Esc clears selection
- [ ] Top kill button shows `✕ 退出 {name} ▾` when selected (truncated to 20 chars), greyed when not
- [ ] Click button → dropdown with two items: 退出 / 强制退出
- [ ] Right-click row → same two-item menu
- [ ] Selecting "退出" / "强制退出" → native macOS confirm dialog with Cancel as default
- [ ] Cancel → no kill, no error toast
- [ ] Confirm SIGTERM → process killed gracefully; row disappears in ≤ 5 s
- [ ] Confirm SIGKILL → process killed forcefully; row disappears in ≤ 5 s
- [ ] Trying to kill DashMac itself or `launchd` / `WindowServer` → error toast, no dialog shown
- [ ] Killing a system process owned by root → EPERM-mapped error toast with permission guidance
- [ ] Killing a non-existent PID (e.g., process died between list refresh and kill) → ESRCH-mapped error toast
- [ ] Chinese locale: dialog title/message, menu items, button label, error toasts all in Chinese
- [ ] `npm test` passes (existing 103 + 5 new = 108)
- [ ] `npm run build` passes TS strict

## Files touched

**New:**
- `electron/services/processControl.ts`
- `tests/electron/processControl.test.ts`

**Modified:**
- `src/types.ts` — extend `DashMacAPI` with `killProcess`
- `electron/main.ts` — register `'action:kill-process'` handler with dialog + safety guards + re-entry flag
- `electron/preload.ts` — expose `killProcess`
- `electron/i18n/index.ts` — extend `t()` to support `{var}` interpolation
- `electron/i18n/locales/en.ts` — add `processControl.*` and `common.*` keys
- `electron/i18n/locales/zh-CN.ts` — same shape, Chinese values
- `src/i18n/locales/en.ts` — change `pages.memory`, add `processControl.*` namespace
- `src/i18n/locales/zh-CN.ts` — same
- `src/components/memory/MemoryOverview.tsx` — reorder children (ProcessList first)
- `src/components/memory/ProcessList.tsx` — add selection, top-right dropdown button, right-click menu, kill dispatch
