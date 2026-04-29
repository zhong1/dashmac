# Custom Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-configurable custom commands to Settings; expose them in the Files-page right-click menu; execute `<command> [static args] <selected-path>` per file sequentially, with progress UI.

**Architecture:** Two new Electron-main services (`shlex` for parsing, `customCommandRunner` for spawning), plus a `shellPath` helper that resolves the GUI-app PATH from a login shell at startup. New IPC method `runCommand` returns a `runId` immediately; the runner emits `cmd:progress` events to all windows. Renderer adds a Settings UI section, extends the FilesPage row context menu with Finder-style multi-select, and renders a bottom-right status strip via a new Zustand store + component.

**Tech Stack:** Electron, Node `child_process`, TypeScript strict, Vitest, React 19, Zustand, Tailwind 4. No new npm dependencies (`crypto.randomUUID` and `child_process.spawn` are built-ins).

**Reference:** Spec at `docs/superpowers/specs/2026-04-29-custom-commands-design.md` is the source of truth. If the plan and spec disagree, the spec wins — flag the discrepancy and stop.

**Worktree:** Implement from `~/.config/superpowers/worktrees/dashmac/custom-commands` on branch `feature/custom-commands`.

---

## File Structure

**New files (8):**
- `electron/services/shlex.ts` — pure `parseShellArgs(input)` function.
- `electron/services/shellPath.ts` — `initShellPath()` + `getShellPath()`.
- `electron/services/customCommandRunner.ts` — `CustomCommandRunner` class with `run()` and `disposeAll()`; emits `ProgressEvent`s.
- `src/stores/commandRunStore.ts` — Zustand store for active runs.
- `src/components/common/CommandRunStatus.tsx` — bottom-right status strip + failure-details dialog.
- `tests/electron/shlex.test.ts`
- `tests/electron/shellPath.test.ts`
- `tests/electron/customCommandRunner.test.ts`

**Modified files (10):**
- `src/types.ts` — add `CustomCommand`, `ProgressEvent`, extend `AppSettings`, extend `DashMacAPI`.
- `electron/services/settingsStore.ts` — add `customCommands: []` to `DEFAULTS`.
- `electron/preload.ts` — expose `runCommand` and `onCommandProgress`.
- `electron/main.ts` — `initShellPath()` on ready; instantiate runner; register `query:run-command`; SIGTERM active runs on `before-quit`.
- `src/i18n/locales/en.ts` — add `settings.customCommands.*` and `commandRun.*`.
- `src/i18n/locales/zh-CN.ts` — same keys, zh translations.
- `src/components/settings/Settings.tsx` — new "自定义命令" section + local DEFAULTS update.
- `src/components/files/FilesPage.tsx` — extend `rowMenuItems` with custom-command items.
- `src/App.tsx` — mount `<CommandRunStatus />` and the `onCommandProgress` subscription in `MainApp`.
- `tests/electron/settingsStore.test.ts` — assert default and migration of `customCommands`.

---

## Task 1: shlex parser

**Files:**
- Create: `electron/services/shlex.ts`
- Test: `tests/electron/shlex.test.ts`

- [ ] **Step 1.1: Write the failing tests**

```ts
// tests/electron/shlex.test.ts
import { describe, expect, test } from 'vitest'
import { parseShellArgs } from '../../electron/services/shlex'

describe('parseShellArgs', () => {
  test('single bare token', () => {
    expect(parseShellArgs('bup')).toEqual(['bup'])
  })

  test('multiple tokens split on whitespace', () => {
    expect(parseShellArgs('bup --foo bar')).toEqual(['bup', '--foo', 'bar'])
  })

  test('double-quoted token preserves spaces', () => {
    expect(parseShellArgs('bup --foo "a b"')).toEqual(['bup', '--foo', 'a b'])
  })

  test('single-quoted token preserves spaces (no escapes)', () => {
    expect(parseShellArgs("bup 'a b'")).toEqual(['bup', 'a b'])
  })

  test('escaped double-quote inside double quotes', () => {
    expect(parseShellArgs('bup "a\\"b"')).toEqual(['bup', 'a"b'])
  })

  test('escaped backslash inside double quotes', () => {
    expect(parseShellArgs('bup "a\\\\b"')).toEqual(['bup', 'a\\b'])
  })

  test('backslash escape outside quotes', () => {
    expect(parseShellArgs('bup a\\ b')).toEqual(['bup', 'a b'])
  })

  test('throws on unclosed double quote', () => {
    expect(() => parseShellArgs('bup "unclosed')).toThrow('unclosed quote')
  })

  test('throws on unclosed single quote', () => {
    expect(() => parseShellArgs("bup 'unclosed")).toThrow('unclosed quote')
  })

  test('empty string returns empty array', () => {
    expect(parseShellArgs('')).toEqual([])
  })

  test('whitespace-only returns empty array', () => {
    expect(parseShellArgs('   \t  ')).toEqual([])
  })

  test('adjacent quoted segments concatenate into one token', () => {
    expect(parseShellArgs('"a""b"')).toEqual(['ab'])
  })
})
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npx vitest run tests/electron/shlex.test.ts`
Expected: FAIL — "Cannot find module '.../electron/services/shlex'".

- [ ] **Step 1.3: Implement `parseShellArgs`**

```ts
// electron/services/shlex.ts
// Minimal shell-style argument parser.
// Supports: whitespace splitting, single quotes (no escapes), double quotes (\" \\),
// backslash escape outside quotes. Throws Error('unclosed quote') on imbalance.
export function parseShellArgs(input: string): string[] {
  const out: string[] = []
  let i = 0
  const n = input.length
  let token = ''
  let inToken = false

  while (i < n) {
    const ch = input[i]

    if (!inToken && (ch === ' ' || ch === '\t' || ch === '\n')) {
      i++
      continue
    }

    if (ch === '"') {
      inToken = true
      i++
      while (i < n && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < n && (input[i + 1] === '"' || input[i + 1] === '\\')) {
          token += input[i + 1]
          i += 2
        } else {
          token += input[i]
          i++
        }
      }
      if (i >= n) throw new Error('unclosed quote')
      i++ // consume closing "
      continue
    }

    if (ch === "'") {
      inToken = true
      i++
      while (i < n && input[i] !== "'") {
        token += input[i]
        i++
      }
      if (i >= n) throw new Error('unclosed quote')
      i++ // consume closing '
      continue
    }

    if (ch === '\\' && i + 1 < n) {
      inToken = true
      token += input[i + 1]
      i += 2
      continue
    }

    if (ch === ' ' || ch === '\t' || ch === '\n') {
      out.push(token)
      token = ''
      inToken = false
      i++
      continue
    }

    inToken = true
    token += ch
    i++
  }

  if (inToken) out.push(token)
  return out
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npx vitest run tests/electron/shlex.test.ts`
Expected: PASS — all 12 tests green.

- [ ] **Step 1.5: Commit**

```bash
git add electron/services/shlex.ts tests/electron/shlex.test.ts
git commit -m "feat(custom-cmd): add shlex parser for command strings"
```

---

## Task 2: shellPath helper

**Files:**
- Create: `electron/services/shellPath.ts`
- Test: `tests/electron/shellPath.test.ts`

- [ ] **Step 2.1: Write the failing tests**

```ts
// tests/electron/shellPath.test.ts
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

import { spawn } from 'node:child_process'
import { initShellPath, getShellPath, _resetForTest } from '../../electron/services/shellPath'

function makeFakeChild(): any {
  const emitter: any = new EventEmitter()
  emitter.stdout = new Readable({ read() {} })
  emitter.stderr = new Readable({ read() {} })
  emitter.kill = vi.fn()
  return emitter
}

describe('shellPath', () => {
  beforeEach(() => {
    _resetForTest()
    vi.mocked(spawn).mockReset()
  })

  test('getShellPath returns process.env.PATH before init', () => {
    expect(getShellPath()).toBe(process.env.PATH ?? '')
  })

  test('initShellPath resolves with stdout from login shell', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const promise = initShellPath()
    child.stdout.push('/usr/local/bin:/usr/bin:/bin\n')
    child.stdout.push(null)
    child.emit('close', 0)
    await promise
    expect(getShellPath()).toBe('/usr/local/bin:/usr/bin:/bin')
    expect(spawn).toHaveBeenCalledWith('bash', ['-lc', 'echo $PATH'], expect.any(Object))
  })

  test('falls back to process.env.PATH when spawn errors', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const promise = initShellPath()
    child.emit('error', new Error('boom'))
    await promise
    expect(getShellPath()).toBe(process.env.PATH ?? '')
  })

  test('falls back to process.env.PATH when child times out', async () => {
    vi.useFakeTimers()
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const promise = initShellPath()
    vi.advanceTimersByTime(2100)
    await promise
    expect(getShellPath()).toBe(process.env.PATH ?? '')
    expect(child.kill).toHaveBeenCalled()
    vi.useRealTimers()
  })

  test('caches: second initShellPath does not spawn again', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const p1 = initShellPath()
    child.stdout.push('/cached/path\n')
    child.stdout.push(null)
    child.emit('close', 0)
    await p1
    expect(spawn).toHaveBeenCalledTimes(1)

    await initShellPath()
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(getShellPath()).toBe('/cached/path')
  })

  test('falls back when exit code is non-zero', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const promise = initShellPath()
    child.stdout.push('')
    child.stdout.push(null)
    child.emit('close', 1)
    await promise
    expect(getShellPath()).toBe(process.env.PATH ?? '')
  })
})
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npx vitest run tests/electron/shellPath.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2.3: Implement `shellPath`**

```ts
// electron/services/shellPath.ts
import { spawn } from 'node:child_process'

let cached: string | null = null
let inFlight: Promise<string> | null = null

const TIMEOUT_MS = 2000

export async function initShellPath(): Promise<void> {
  if (cached !== null) return
  if (inFlight === null) inFlight = resolveShellPath()
  cached = await inFlight
}

export function getShellPath(): string {
  return cached ?? process.env.PATH ?? ''
}

// Exported only for tests.
export function _resetForTest(): void {
  cached = null
  inFlight = null
}

async function resolveShellPath(): Promise<string> {
  return new Promise<string>((resolve) => {
    const fallback = process.env.PATH ?? ''
    let resolved = false
    const finish = (value: string) => {
      if (resolved) return
      resolved = true
      resolve(value)
    }

    let child
    try {
      child = spawn('bash', ['-lc', 'echo $PATH'], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      finish(fallback)
      return
    }

    let stdout = ''
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.on('error', () => finish(fallback))
    child.on('close', (code: number | null) => {
      if (code === 0 && stdout.trim().length > 0) finish(stdout.trim())
      else finish(fallback)
    })

    setTimeout(() => {
      try { child.kill() } catch {}
      finish(fallback)
    }, TIMEOUT_MS)
  })
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npx vitest run tests/electron/shellPath.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 2.5: Commit**

```bash
git add electron/services/shellPath.ts tests/electron/shellPath.test.ts
git commit -m "feat(custom-cmd): resolve login-shell PATH for GUI launches"
```

---

## Task 3: types — CustomCommand, ProgressEvent, DashMacAPI extension

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 3.1: Add `CustomCommand` and `ProgressEvent` types**

Append to the bottom of `src/types.ts`, before the `declare global` block:

```ts
export interface CustomCommand {
  id: string
  label: string
  command: string
}

export type CustomCommandProgressEvent =
  | { type: 'start'; runId: string; commandLabel: string; total: number }
  | { type: 'advance'; runId: string; done: number; current: string }
  | { type: 'fileError'; runId: string; path: string; message: string; stderr: string }
  | { type: 'finish'; runId: string; ok: number; failed: number }
```

- [ ] **Step 3.2: Extend `AppSettings`**

Find the `AppSettings` interface (around line 169) and add `customCommands` after `showHiddenFiles`:

```ts
export interface AppSettings {
  realtimeInterval: number
  historyInterval: number
  retentionDays: number
  trayDisplayMetric: 'memory' | 'cpu' | 'network' | 'none'
  launchAtLogin: boolean
  language: 'auto' | 'en' | 'zh-CN'
  resolvedLanguage: 'en' | 'zh-CN'
  fileShortcuts: string[]
  showHiddenFiles: boolean
  customCommands: CustomCommand[]
}
```

- [ ] **Step 3.3: Extend `DashMacAPI`**

Find the `DashMacAPI` interface and add these two methods (place them after `killProcess`, before the closing brace):

```ts
  runCommand: (
    commandId: string,
    paths: string[],
  ) => Promise<
    | { ok: true; runId: string }
    | { ok: false; message: string }
  >
  onCommandProgress: (callback: (event: CustomCommandProgressEvent) => void) => () => void
```

- [ ] **Step 3.4: Type-check**

Run: `npx tsc --noEmit`
Expected: errors only in pre-existing files unrelated to custom commands. New code (types only) should not introduce new errors.

If `npx tsc --noEmit` is too noisy, run: `npx tsc --noEmit 2>&1 | grep -E "types\.ts" | head`
Expected: no output.

- [ ] **Step 3.5: Commit**

```bash
git add src/types.ts
git commit -m "feat(custom-cmd): add CustomCommand types and IPC contract"
```

---

## Task 4: settingsStore default + tests

**Files:**
- Modify: `electron/services/settingsStore.ts`
- Modify: `tests/electron/settingsStore.test.ts`

- [ ] **Step 4.1: Add failing test cases**

Append two tests to `tests/electron/settingsStore.test.ts` inside the `describe('settingsStore', ...)` block (before the closing `})`):

```ts
  test('DEFAULTS includes empty customCommands array', () => {
    expect(DEFAULTS.customCommands).toEqual([])
  })

  test('round-trip preserves customCommands', () => {
    const f = tmpFile()
    created.push(f)
    const next = {
      ...DEFAULTS,
      customCommands: [
        { id: 'a1', label: 'bup 上传', command: 'bup' },
        { id: 'b2', label: 'git status', command: 'git status' },
      ],
    }
    saveSettings(next, f)
    expect(loadSettings(f)).toEqual(next)
  })

  test('migration: existing settings.json without customCommands gets empty array', () => {
    const f = tmpFile()
    created.push(f)
    fs.writeFileSync(f, JSON.stringify({ retentionDays: 30 }), 'utf8')
    const result = loadSettings(f)
    expect(result.customCommands).toEqual([])
  })
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `npx vitest run tests/electron/settingsStore.test.ts`
Expected: FAIL — `DEFAULTS.customCommands` is undefined; round-trip fails because field is missing.

- [ ] **Step 4.3: Add `customCommands: []` to DEFAULTS**

Edit `electron/services/settingsStore.ts`:

```ts
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
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `npx vitest run tests/electron/settingsStore.test.ts`
Expected: PASS — all tests green including the three new ones.

- [ ] **Step 4.5: Commit**

```bash
git add electron/services/settingsStore.ts tests/electron/settingsStore.test.ts
git commit -m "feat(custom-cmd): default customCommands to empty array in settings"
```

---

## Task 5: customCommandRunner — types + skeleton

This task sets up the runner shape and a no-op success path for one file. Subsequent tasks add behavior.

**Files:**
- Create: `electron/services/customCommandRunner.ts`
- Test: `tests/electron/customCommandRunner.test.ts`

- [ ] **Step 5.1: Write the first failing test (start + finish events for a successful single path)**

```ts
// tests/electron/customCommandRunner.test.ts
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
vi.mock('../../electron/services/shellPath', () => ({
  getShellPath: () => '/usr/local/bin:/usr/bin:/bin',
}))

import { spawn } from 'node:child_process'
import { CustomCommandRunner } from '../../electron/services/customCommandRunner'
import type { AppSettings, CustomCommandProgressEvent } from '../../src/types'

function makeFakeChild(): any {
  const emitter: any = new EventEmitter()
  emitter.stdout = new Readable({ read() {} })
  emitter.stderr = new Readable({ read() {} })
  emitter.kill = vi.fn()
  return emitter
}

function makeSettings(commands: AppSettings['customCommands']): AppSettings {
  return {
    realtimeInterval: 2000, historyInterval: 60000, retentionDays: 90,
    trayDisplayMetric: 'memory', launchAtLogin: false,
    language: 'en', resolvedLanguage: 'en',
    fileShortcuts: [], showHiddenFiles: false,
    customCommands: commands,
  }
}

describe('CustomCommandRunner — single success', () => {
  beforeEach(() => { vi.mocked(spawn).mockReset() })

  test('emits start, advance, finish for one path with code 0', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)

    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'bup', command: 'bup' }])

    const promise = runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/tmp/a.txt'] },
      settings,
      (e) => events.push(e),
    )

    // Let the runner reach the spawn point.
    await Promise.resolve(); await Promise.resolve()
    child.emit('close', 0)
    await promise

    expect(events).toEqual([
      { type: 'start', runId: 'r1', commandLabel: 'bup', total: 1 },
      { type: 'advance', runId: 'r1', done: 1, current: 'a.txt' },
      { type: 'finish', runId: 'r1', ok: 1, failed: 0 },
    ])
  })

  test('spawns with shell:false, correct argv, cwd, and env.PATH', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)

    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'bup', command: 'bup --foo bar' }])

    const promise = runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/Users/me/My Docs/a.txt'] },
      settings,
      () => {},
    )
    await Promise.resolve(); await Promise.resolve()
    child.emit('close', 0)
    await promise

    expect(spawn).toHaveBeenCalledWith(
      'bup',
      ['--foo', 'bar', '/Users/me/My Docs/a.txt'],
      expect.objectContaining({
        cwd: '/Users/me/My Docs',
        shell: false,
        env: expect.objectContaining({ PATH: '/usr/local/bin:/usr/bin:/bin' }),
      }),
    )
  })
})
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `npx vitest run tests/electron/customCommandRunner.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 5.3: Implement skeleton runner**

```ts
// electron/services/customCommandRunner.ts
import { spawn, type ChildProcess } from 'node:child_process'
import * as path from 'node:path'
import { getShellPath } from './shellPath'
import { parseShellArgs } from './shlex'
import type { AppSettings, CustomCommandProgressEvent } from '../../src/types'

export interface RunRequest {
  runId: string
  commandId: string
  paths: string[]
}

const STDERR_CAP_BYTES = 4096

export class CustomCommandRunner {
  private active = new Set<ChildProcess>()

  async run(
    req: RunRequest,
    settings: AppSettings,
    emit: (e: CustomCommandProgressEvent) => void,
  ): Promise<void> {
    const cmd = settings.customCommands.find((c) => c.id === req.commandId)
    if (!cmd) {
      emit({ type: 'start', runId: req.runId, commandLabel: '', total: req.paths.length })
      for (const p of req.paths) {
        emit({ type: 'fileError', runId: req.runId, path: p, message: 'unknownCommand', stderr: '' })
      }
      emit({ type: 'finish', runId: req.runId, ok: 0, failed: req.paths.length })
      return
    }

    let argv: string[]
    try {
      argv = parseShellArgs(cmd.command)
    } catch (err: any) {
      emit({ type: 'start', runId: req.runId, commandLabel: cmd.label, total: req.paths.length })
      for (const p of req.paths) {
        emit({ type: 'fileError', runId: req.runId, path: p, message: `parseError:${err?.message ?? 'parse'}`, stderr: '' })
      }
      emit({ type: 'finish', runId: req.runId, ok: 0, failed: req.paths.length })
      return
    }

    if (argv.length === 0) {
      emit({ type: 'start', runId: req.runId, commandLabel: cmd.label, total: req.paths.length })
      for (const p of req.paths) {
        emit({ type: 'fileError', runId: req.runId, path: p, message: 'parseError:empty', stderr: '' })
      }
      emit({ type: 'finish', runId: req.runId, ok: 0, failed: req.paths.length })
      return
    }

    const [bin, ...staticArgs] = argv

    emit({ type: 'start', runId: req.runId, commandLabel: cmd.label, total: req.paths.length })

    let okCount = 0
    let failCount = 0

    for (let i = 0; i < req.paths.length; i++) {
      const filePath = req.paths[i]
      const result = await this.runOne(bin, staticArgs, filePath)

      if (result.ok) {
        okCount++
      } else {
        failCount++
        emit({
          type: 'fileError',
          runId: req.runId,
          path: filePath,
          message: result.message,
          stderr: result.stderr,
        })
      }

      emit({ type: 'advance', runId: req.runId, done: i + 1, current: path.basename(filePath) })
    }

    emit({ type: 'finish', runId: req.runId, ok: okCount, failed: failCount })
  }

  private runOne(
    bin: string,
    staticArgs: string[],
    filePath: string,
  ): Promise<{ ok: true } | { ok: false; message: string; stderr: string }> {
    return new Promise((resolve) => {
      const cwd = path.dirname(filePath)
      const argv = [...staticArgs, filePath]
      let child: ChildProcess
      try {
        child = spawn(bin, argv, {
          cwd,
          shell: false,
          env: { ...process.env, PATH: getShellPath() },
          stdio: ['ignore', 'ignore', 'pipe'],
        })
      } catch (err: any) {
        resolve({ ok: false, message: `spawnError:${err?.message ?? 'spawn'}`, stderr: '' })
        return
      }

      this.active.add(child)
      let stderrBuf = ''
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString('utf8')
        if (stderrBuf.length > STDERR_CAP_BYTES) {
          stderrBuf = stderrBuf.slice(-STDERR_CAP_BYTES)
        }
      })

      let settled = false
      const settle = (r: { ok: true } | { ok: false; message: string; stderr: string }) => {
        if (settled) return
        settled = true
        this.active.delete(child)
        resolve(r)
      }

      child.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          settle({ ok: false, message: `notFound:${bin}`, stderr: '' })
        } else {
          settle({ ok: false, message: `spawnError:${err.message}`, stderr: stderrBuf })
        }
      })
      child.on('close', (code: number | null) => {
        if (code === 0) settle({ ok: true })
        else settle({ ok: false, message: `exitCode:${code ?? 'null'}`, stderr: stderrBuf })
      })
    })
  }

  /**
   * Send SIGTERM to all in-flight children. Used on app quit so we don't leak
   * orphan processes.
   */
  disposeAll(): void {
    for (const c of this.active) {
      try { c.kill('SIGTERM') } catch {}
    }
    this.active.clear()
  }
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `npx vitest run tests/electron/customCommandRunner.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5.5: Commit**

```bash
git add electron/services/customCommandRunner.ts tests/electron/customCommandRunner.test.ts
git commit -m "feat(custom-cmd): add CustomCommandRunner with success path"
```

---

## Task 6: customCommandRunner — failure & error paths

**Files:**
- Modify: `tests/electron/customCommandRunner.test.ts`

- [ ] **Step 6.1: Add tests for failure modes**

Append to `tests/electron/customCommandRunner.test.ts`:

```ts
describe('CustomCommandRunner — failures and errors', () => {
  beforeEach(() => { vi.mocked(spawn).mockReset() })

  test('non-zero exit emits fileError with exitCode message and stderr', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)

    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'bup', command: 'bup' }])

    const promise = runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/tmp/a.txt'] },
      settings,
      (e) => events.push(e),
    )
    await Promise.resolve(); await Promise.resolve()
    child.stderr.emit('data', Buffer.from('boom\n'))
    child.emit('close', 1)
    await promise

    const fe = events.find((e) => e.type === 'fileError')
    expect(fe).toMatchObject({
      type: 'fileError',
      runId: 'r1',
      path: '/tmp/a.txt',
      message: 'exitCode:1',
      stderr: 'boom\n',
    })
    expect(events[events.length - 1]).toEqual({
      type: 'finish', runId: 'r1', ok: 0, failed: 1,
    })
  })

  test('ENOENT (missing binary) emits notFound', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)

    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'X', command: 'doesnotexist' }])

    const promise = runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/tmp/a.txt'] },
      settings,
      (e) => events.push(e),
    )
    await Promise.resolve(); await Promise.resolve()
    const err = new Error('spawn doesnotexist ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    child.emit('error', err)
    await promise

    const fe = events.find((e) => e.type === 'fileError')
    expect(fe).toMatchObject({ message: 'notFound:doesnotexist', stderr: '' })
    expect(events[events.length - 1]).toEqual({
      type: 'finish', runId: 'r1', ok: 0, failed: 1,
    })
  })

  test('unknown commandId emits all-failed finish', async () => {
    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([])

    await runner.run(
      { runId: 'r1', commandId: 'nope', paths: ['/tmp/a.txt', '/tmp/b.txt'] },
      settings,
      (e) => events.push(e),
    )

    expect(events.filter((e) => e.type === 'fileError')).toHaveLength(2)
    expect(events[events.length - 1]).toEqual({
      type: 'finish', runId: 'r1', ok: 0, failed: 2,
    })
    // spawn must NOT have been called.
    expect(spawn).not.toHaveBeenCalled()
  })

  test('parse error (unclosed quote) emits all-failed without spawning', async () => {
    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'X', command: 'bup "unclosed' }])

    await runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/tmp/a.txt'] },
      settings,
      (e) => events.push(e),
    )

    expect(spawn).not.toHaveBeenCalled()
    const fe = events.find((e) => e.type === 'fileError')
    expect(fe?.message).toMatch(/^parseError:/)
  })

  test('empty command field emits all-failed without spawning', async () => {
    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'X', command: '   ' }])

    await runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/tmp/a.txt'] },
      settings,
      (e) => events.push(e),
    )

    expect(spawn).not.toHaveBeenCalled()
    const fe = events.find((e) => e.type === 'fileError')
    expect(fe?.message).toBe('parseError:empty')
  })

  test('stderr capped at 4 KB', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)

    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'X', command: 'bup' }])

    const promise = runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/tmp/a.txt'] },
      settings,
      (e) => events.push(e),
    )
    await Promise.resolve(); await Promise.resolve()
    // Push 8 KB of stderr.
    child.stderr.emit('data', Buffer.alloc(8192, 0x41))
    child.emit('close', 1)
    await promise

    const fe = events.find((e) => e.type === 'fileError') as Extract<CustomCommandProgressEvent, { type: 'fileError' }>
    expect(fe.stderr.length).toBeLessThanOrEqual(4096)
  })
})
```

- [ ] **Step 6.2: Run tests to verify they pass**

Run: `npx vitest run tests/electron/customCommandRunner.test.ts`
Expected: PASS — all eight tests in this file green (two from Task 5 plus six new).

- [ ] **Step 6.3: Commit**

```bash
git add tests/electron/customCommandRunner.test.ts
git commit -m "test(custom-cmd): cover failure and error paths in runner"
```

---

## Task 7: customCommandRunner — sequential execution test

This test pins the most subtle behavior: paths run one at a time within a run.

**Files:**
- Modify: `tests/electron/customCommandRunner.test.ts`

- [ ] **Step 7.1: Add the sequential test**

Append to `tests/electron/customCommandRunner.test.ts`:

```ts
describe('CustomCommandRunner — sequential execution', () => {
  beforeEach(() => { vi.mocked(spawn).mockReset() })

  test('second spawn does not start until first close', async () => {
    const child1 = makeFakeChild()
    const child2 = makeFakeChild()
    const child3 = makeFakeChild()
    vi.mocked(spawn)
      .mockReturnValueOnce(child1)
      .mockReturnValueOnce(child2)
      .mockReturnValueOnce(child3)

    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'X', command: 'bup' }])

    const promise = runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/tmp/a', '/tmp/b', '/tmp/c'] },
      settings,
      (e) => events.push(e),
    )

    // After yielding a few microtasks, only the first spawn should have happened.
    await Promise.resolve(); await Promise.resolve()
    expect(spawn).toHaveBeenCalledTimes(1)

    child1.emit('close', 0)
    await Promise.resolve(); await Promise.resolve()
    expect(spawn).toHaveBeenCalledTimes(2)

    child2.emit('close', 0)
    await Promise.resolve(); await Promise.resolve()
    expect(spawn).toHaveBeenCalledTimes(3)

    child3.emit('close', 0)
    await promise

    // Three advance events with monotonically increasing done counts.
    const advances = events.filter((e) => e.type === 'advance') as Array<Extract<CustomCommandProgressEvent, { type: 'advance' }>>
    expect(advances.map((a) => a.done)).toEqual([1, 2, 3])
    expect(advances.map((a) => a.current)).toEqual(['a', 'b', 'c'])
    expect(events[events.length - 1]).toEqual({
      type: 'finish', runId: 'r1', ok: 3, failed: 0,
    })
  })
})
```

- [ ] **Step 7.2: Run tests to verify they pass**

Run: `npx vitest run tests/electron/customCommandRunner.test.ts`
Expected: PASS — all nine tests green.

- [ ] **Step 7.3: Commit**

```bash
git add tests/electron/customCommandRunner.test.ts
git commit -m "test(custom-cmd): assert sequential execution within a run"
```

---

## Task 8: preload — expose runCommand and onCommandProgress

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 8.1: Add the two methods**

Edit `electron/preload.ts` and add both methods inside the `api` object (place them after `onAppTraffic`, before the closing `}`):

```ts
  runCommand: (commandId: string, paths: string[]) =>
    ipcRenderer.invoke('query:run-command', commandId, paths),
  onCommandProgress: (callback: (event: import('../src/types').CustomCommandProgressEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ev: any) => callback(ev)
    ipcRenderer.on('cmd:progress', listener)
    return () => ipcRenderer.removeListener('cmd:progress', listener)
  },
```

- [ ] **Step 8.2: Type-check preload**

Run: `npx tsc --noEmit 2>&1 | grep "preload\.ts" | head`
Expected: no output for preload.ts.

- [ ] **Step 8.3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat(custom-cmd): expose runCommand IPC bridge in preload"
```

---

## Task 9: main.ts — initShellPath, runner, IPC handler, before-quit cleanup

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 9.1: Add imports**

Edit the import block at the top of `electron/main.ts`. Add:

```ts
import { randomUUID } from 'node:crypto'
import { initShellPath } from './services/shellPath'
import { CustomCommandRunner } from './services/customCommandRunner'
```

- [ ] **Step 9.2: Add the runner instance**

Find the line `let scheduler: Scheduler | null = null` (around line 27). Add this line just below:

```ts
const customCommandRunner = new CustomCommandRunner()
```

- [ ] **Step 9.3: Register the IPC handler**

Inside `registerIpcHandlers()`, just after the `ipcMain.handle('action:kill-process', ...)` block (the last existing handler, before the function's closing brace), add:

```ts
  ipcMain.handle('query:run-command', async (_e, commandId: string, paths: string[]) => {
    if (!Array.isArray(paths) || paths.length === 0) {
      return { ok: false as const, message: 'no paths' }
    }
    const settings = loadSettings()
    const runId = randomUUID()
    customCommandRunner
      .run({ runId, commandId, paths }, settings, (event) => {
        sendToAllWindows('cmd:progress', event)
      })
      .catch((err) => {
        // Should not happen — runner internalizes its errors. Log and emit a synthetic finish.
        console.error('[customCommandRunner] unexpected throw:', err)
        sendToAllWindows('cmd:progress', { type: 'finish', runId, ok: 0, failed: paths.length })
      })
    return { ok: true as const, runId }
  })
```

- [ ] **Step 9.4: Wire `initShellPath` and `disposeAll`**

Find the `app.whenReady().then(() => {` block (around line 346). Add `initShellPath()` as the first call inside (fire-and-forget), keeping the existing setup intact:

```ts
app.whenReady().then(() => {
  initShellPath().catch(() => { /* fallback already handled inside */ })
  const stored = loadSettings()
  // ... rest unchanged
})
```

Find the `app.on('before-quit', () => {` block at the end of the file. Add `customCommandRunner.disposeAll()` to it:

```ts
app.on('before-quit', () => {
  scheduler?.stop()
  nettopCollector.stop()
  customCommandRunner.disposeAll()
  closeDatabase()
})
```

- [ ] **Step 9.5: Build to verify no type errors**

Run: `npm run build`
Expected: build succeeds. (Pre-existing TypeScript errors in chart components or treemap that were not introduced by this work are out of scope; if the build fails, the failure must come from this task's changes.)

If the build fails with errors clearly outside `electron/main.ts`, `electron/preload.ts`, or `electron/services/**`, document them and continue. Otherwise, fix and rebuild.

- [ ] **Step 9.6: Commit**

```bash
git add electron/main.ts
git commit -m "feat(custom-cmd): wire runner, IPC handler, and shellPath in main"
```

---

## Task 10: i18n keys — English

**Files:**
- Modify: `src/i18n/locales/en.ts`

- [ ] **Step 10.1: Add `settings.customCommands.*` keys**

Inside the `settings` object in `src/i18n/locales/en.ts` (after the `export` sub-object, before the closing `}` of `settings`):

```ts
    customCommands: {
      title: 'Custom Commands',
      description: 'These commands appear at the bottom of the right-click menu in Files. They run as `<command> <selected-path>` from the file\'s parent directory.',
      add: 'Add Command',
      label: 'Label',
      command: 'Command',
      labelPlaceholder: 'e.g. bup upload',
      commandPlaceholder: 'e.g. bup',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      empty: 'No commands configured.',
      errorParse: 'Failed to parse command (unclosed quote?)',
      errorEmpty: 'Label and command must not be empty',
    },
```

- [ ] **Step 10.2: Add `commandRun.*` top-level keys**

Add this block at the same nesting level as `settings`, `processControl`, `dashboard`. Place it after `dashboard` (the last existing block), just before the file-level closing `}`:

```ts
  commandRun: {
    running: '{label} · {done}/{total} · {current}',
    successOne: '{label} done',
    successMany: '{label} done ({total})',
    someFailed: '{label} done {ok}, {fail} failed',
    allFailed: '{label} all failed ({total})',
    viewDetails: 'View Details',
    notFound: 'Command not found: {cmd}. Check PATH.',
    parseError: 'Could not parse command: {cmd}',
    exitCode: 'Exit code {code}',
    detailsTitle: 'Failure Details',
    detailsClose: 'Close',
  },
```

- [ ] **Step 10.3: Quick sanity-check shape**

Run: `npx vitest run tests/electron/i18n-shape.test.ts`
Expected: probably FAIL — Chinese translation hasn't been added yet (next task).

- [ ] **Step 10.4: Commit**

```bash
git add src/i18n/locales/en.ts
git commit -m "feat(custom-cmd): add English i18n keys"
```

---

## Task 11: i18n keys — Simplified Chinese

**Files:**
- Modify: `src/i18n/locales/zh-CN.ts`

- [ ] **Step 11.1: Mirror the structure from en.ts with zh translations**

Inside the `settings` object in `src/i18n/locales/zh-CN.ts` (placement matching en.ts):

```ts
    customCommands: {
      title: '自定义命令',
      description: '这些命令会出现在 Files 页右键菜单底部。执行时会在文件所在目录运行 `<命令> <文件路径>`。',
      add: '添加命令',
      label: '标签',
      command: '命令',
      labelPlaceholder: '例如：bup 上传',
      commandPlaceholder: '例如：bup',
      save: '保存',
      cancel: '取消',
      delete: '删除',
      edit: '编辑',
      empty: '尚未配置任何命令。',
      errorParse: '命令解析失败（引号未闭合？）',
      errorEmpty: '标签和命令都不能为空',
    },
```

After the `dashboard` block, before the file-level closing `}`:

```ts
  commandRun: {
    running: '{label} · {done}/{total} · {current}',
    successOne: '{label} 完成',
    successMany: '{label} 完成 ({total})',
    someFailed: '{label} 完成 {ok} 项，{fail} 项失败',
    allFailed: '{label} 全部失败 ({total})',
    viewDetails: '查看详情',
    notFound: '找不到命令 {cmd}，请检查 PATH。',
    parseError: '命令解析失败：{cmd}',
    exitCode: '退出码 {code}',
    detailsTitle: '失败详情',
    detailsClose: '关闭',
  },
```

- [ ] **Step 11.2: Run i18n shape tests**

Run: `npx vitest run tests/electron/i18n-shape.test.ts tests/electron/i18n.test.ts`
Expected: PASS — both files have identical key shapes.

- [ ] **Step 11.3: Commit**

```bash
git add src/i18n/locales/zh-CN.ts
git commit -m "feat(custom-cmd): add zh-CN i18n keys"
```

---

## Task 12: Settings UI — custom commands section

**Files:**
- Modify: `src/components/settings/Settings.tsx`

- [ ] **Step 12.1: Update local DEFAULTS**

Edit the top of `src/components/settings/Settings.tsx`:

```ts
const DEFAULTS: AppSettings = {
  realtimeInterval: 2000, historyInterval: 60000, retentionDays: 90,
  trayDisplayMetric: 'memory', launchAtLogin: false,
  language: 'auto', resolvedLanguage: 'en',
  fileShortcuts: [], showHiddenFiles: false,
  customCommands: [],
}
```

- [ ] **Step 12.2: Add imports**

At the top of the file:

```ts
import { useState, useEffect } from 'react'
import type { AppSettings, CustomCommand } from '../../types'
import { useTranslation } from '../../i18n/index'
```

(`CustomCommand` is the only addition.)

- [ ] **Step 12.3: Add the section to the JSX**

Insert this new `<Section>` block in the returned JSX, immediately after the `appearance` Section (around line 102) and before the `export` Section:

```tsx
      <Section title={t('settings.customCommands.title')}>
        <p className="text-xs text-text-secondary mb-3">{t('settings.customCommands.description')}</p>
        <CustomCommandsEditor
          commands={settings.customCommands}
          onChange={async (next) => {
            const updated = { ...settings, customCommands: next }
            setSettings(updated)
            await window.api.saveSettings(updated)
          }}
        />
      </Section>
```

- [ ] **Step 12.4: Add the `CustomCommandsEditor` component below the file**

Append below the existing `Field` helper at the bottom of `src/components/settings/Settings.tsx`:

```tsx
function CustomCommandsEditor({
  commands,
  onChange,
}: {
  commands: CustomCommand[]
  onChange: (next: CustomCommand[]) => void
}) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const handleAdd = (label: string, command: string) => {
    const id = (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    onChange([...commands, { id, label, command }])
    setAdding(false)
  }
  const handleEdit = (id: string, label: string, command: string) => {
    onChange(commands.map((c) => (c.id === id ? { ...c, label, command } : c)))
    setEditingId(null)
  }
  const handleDelete = (id: string) => {
    onChange(commands.filter((c) => c.id !== id))
    if (editingId === id) setEditingId(null)
  }

  return (
    <div className="space-y-2">
      {commands.length === 0 && !adding && (
        <div className="text-xs text-text-secondary italic">{t('settings.customCommands.empty')}</div>
      )}
      {commands.map((c) =>
        editingId === c.id ? (
          <CommandForm
            key={c.id}
            initial={c}
            onSave={(label, command) => handleEdit(c.id, label, command)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div key={c.id} className="flex items-center justify-between bg-bg-primary border border-border-primary rounded px-3 py-2">
            <div className="flex flex-col min-w-0">
              <span className="text-sm text-text-primary truncate">{c.label}</span>
              <span className="text-xs font-mono text-text-secondary truncate">{c.command}</span>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setEditingId(c.id)}
                className="text-xs px-2 py-1 border border-border-primary rounded hover:bg-bg-tertiary text-text-primary"
              >{t('settings.customCommands.edit')}</button>
              <button
                onClick={() => handleDelete(c.id)}
                className="text-xs px-2 py-1 border border-border-primary rounded hover:bg-bg-tertiary text-status-red"
              >{t('settings.customCommands.delete')}</button>
            </div>
          </div>
        ),
      )}
      {adding ? (
        <CommandForm onSave={handleAdd} onCancel={() => setAdding(false)} />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs px-3 py-1.5 border border-border-primary rounded hover:bg-bg-tertiary text-text-primary"
        >+ {t('settings.customCommands.add')}</button>
      )}
    </div>
  )
}

function CommandForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: CustomCommand
  onSave: (label: string, command: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [label, setLabel] = useState(initial?.label ?? '')
  const [command, setCommand] = useState(initial?.command ?? '')

  const labelTrim = label.trim()
  const cmdTrim = command.trim()
  const empty = labelTrim.length === 0 || cmdTrim.length === 0

  let parseError: string | null = null
  if (!empty) {
    try {
      // Lazy-import the same parser used by the runner to keep validation in sync.
      // We can't import from electron/services in renderer code, so duplicate the
      // critical "unclosed quote" check inline.
      let inDouble = false, inSingle = false
      for (let i = 0; i < command.length; i++) {
        const ch = command[i]
        if (inDouble) {
          if (ch === '\\' && i + 1 < command.length) { i++; continue }
          if (ch === '"') inDouble = false
        } else if (inSingle) {
          if (ch === "'") inSingle = false
        } else {
          if (ch === '"') inDouble = true
          else if (ch === "'") inSingle = true
        }
      }
      if (inDouble || inSingle) throw new Error('unclosed quote')
    } catch {
      parseError = t('settings.customCommands.errorParse')
    }
  }

  const disabled = empty || parseError !== null

  return (
    <div className="bg-bg-primary border border-border-primary rounded p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary w-16">{t('settings.customCommands.label')}</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('settings.customCommands.labelPlaceholder')}
          className="flex-1 bg-bg-secondary border border-border-primary rounded px-2 py-1 text-sm text-text-primary"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary w-16">{t('settings.customCommands.command')}</span>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={t('settings.customCommands.commandPlaceholder')}
          className="flex-1 bg-bg-secondary border border-border-primary rounded px-2 py-1 text-sm font-mono text-text-primary"
        />
      </div>
      {empty && (
        <div className="text-xs text-status-red">{t('settings.customCommands.errorEmpty')}</div>
      )}
      {parseError && (
        <div className="text-xs text-status-red">{parseError}</div>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => onSave(labelTrim, cmdTrim)}
          disabled={disabled}
          className="text-xs px-3 py-1.5 bg-status-blue text-white rounded disabled:opacity-50"
        >{t('settings.customCommands.save')}</button>
        <button
          onClick={onCancel}
          className="text-xs px-3 py-1.5 border border-border-primary rounded hover:bg-bg-tertiary text-text-primary"
        >{t('settings.customCommands.cancel')}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 12.5: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "Settings\.tsx" | head`
Expected: no output for Settings.tsx.

- [ ] **Step 12.6: Smoke-test the dev server**

Run: `npm run dev` in the background. Visit Settings → look for a new "自定义命令" / "Custom Commands" section between Appearance and Export Data. Add a command, edit it, delete it. Verify:
- Empty fields disable Save.
- Unclosed quote `bup "abc` shows the parse error and disables Save.

Stop the dev server when done.

- [ ] **Step 12.7: Commit**

```bash
git add src/components/settings/Settings.tsx
git commit -m "feat(custom-cmd): Settings UI section for custom commands"
```

---

## Task 13: commandRunStore — Zustand store

**Files:**
- Create: `src/stores/commandRunStore.ts`

- [ ] **Step 13.1: Implement the store**

```ts
// src/stores/commandRunStore.ts
import { create } from 'zustand'
import type { CustomCommandProgressEvent } from '../types'

export interface FailureEntry {
  path: string
  message: string
  stderr: string
}

export interface Run {
  runId: string
  commandLabel: string
  total: number
  done: number
  current?: string
  failures: FailureEntry[]
}

interface FinishedRun {
  runId: string
  commandLabel: string
  total: number
  failures: FailureEntry[]
}

interface CommandRunState {
  runs: Run[]
  // Last finished run held briefly so the status component can fire a toast.
  // Cleared by the consumer after toasting.
  lastFinished: FinishedRun | null

  start: (e: Extract<CustomCommandProgressEvent, { type: 'start' }>) => void
  advance: (e: Extract<CustomCommandProgressEvent, { type: 'advance' }>) => void
  fileError: (e: Extract<CustomCommandProgressEvent, { type: 'fileError' }>) => void
  finish: (e: Extract<CustomCommandProgressEvent, { type: 'finish' }>) => void
  consumeLastFinished: () => void
}

export const useCommandRunStore = create<CommandRunState>((set) => ({
  runs: [],
  lastFinished: null,

  start: (e) => set((s) => ({
    runs: [
      { runId: e.runId, commandLabel: e.commandLabel, total: e.total, done: 0, failures: [] },
      ...s.runs,
    ],
  })),

  advance: (e) => set((s) => ({
    runs: s.runs.map((r) =>
      r.runId === e.runId ? { ...r, done: e.done, current: e.current } : r,
    ),
  })),

  fileError: (e) => set((s) => ({
    runs: s.runs.map((r) =>
      r.runId === e.runId
        ? { ...r, failures: [...r.failures, { path: e.path, message: e.message, stderr: e.stderr }] }
        : r,
    ),
  })),

  finish: (e) => set((s) => {
    const r = s.runs.find((r) => r.runId === e.runId)
    if (!r) return s
    return {
      runs: s.runs.filter((x) => x.runId !== e.runId),
      lastFinished: {
        runId: r.runId,
        commandLabel: r.commandLabel,
        total: r.total,
        failures: r.failures,
      },
    }
  }),

  consumeLastFinished: () => set({ lastFinished: null }),
}))
```

- [ ] **Step 13.2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "commandRunStore" | head`
Expected: no output.

- [ ] **Step 13.3: Commit**

```bash
git add src/stores/commandRunStore.ts
git commit -m "feat(custom-cmd): commandRunStore zustand state"
```

---

## Task 14: CommandRunStatus component

**Files:**
- Create: `src/components/common/CommandRunStatus.tsx`

- [ ] **Step 14.1: Implement the component**

```tsx
// src/components/common/CommandRunStatus.tsx
import { useEffect, useRef, useState } from 'react'
import { useCommandRunStore, type FailureEntry } from '../../stores/commandRunStore'
import { useToast } from '../../stores/toastStore'
import { useTranslation } from '../../i18n/index'

export default function CommandRunStatus() {
  const { t } = useTranslation()
  const runs = useCommandRunStore((s) => s.runs)
  const lastFinished = useCommandRunStore((s) => s.lastFinished)
  const consumeLastFinished = useCommandRunStore((s) => s.consumeLastFinished)
  const toast = useToast()
  const [details, setDetails] = useState<{ title: string; failures: FailureEntry[] } | null>(null)

  // Fire toast when a run finishes; success/warning depending on failures.
  // Show the dialog inline by setting `details` from the toast action — but
  // toasts here are simple and don't support rich actions. Instead we put a
  // tiny inline banner-style "view details" button when there are failures.
  useEffect(() => {
    if (!lastFinished) return
    const f = lastFinished
    const ok = f.total - f.failures.length
    if (f.failures.length === 0) {
      toast.success(
        f.total === 1
          ? t('commandRun.successOne', { label: f.commandLabel })
          : t('commandRun.successMany', { label: f.commandLabel, total: f.total }),
      )
    } else if (ok === 0) {
      toast.error(t('commandRun.allFailed', { label: f.commandLabel, total: f.total }))
      // Auto-open details when everything failed so the user sees why.
      setDetails({ title: f.commandLabel, failures: f.failures })
    } else {
      toast.error(t('commandRun.someFailed', { label: f.commandLabel, ok, fail: f.failures.length }))
      setDetails({ title: f.commandLabel, failures: f.failures })
    }
    consumeLastFinished()
  }, [lastFinished, consumeLastFinished, toast, t])

  return (
    <>
      {runs.length > 0 && (
        <div className="fixed bottom-16 right-4 flex flex-col gap-1 z-40 pointer-events-none">
          {runs.map((r) => (
            <div
              key={r.runId}
              className="bg-bg-secondary border border-border-primary rounded px-3 py-1.5 text-xs font-mono text-text-primary shadow"
            >
              {t('commandRun.running', {
                label: r.commandLabel,
                done: r.done,
                total: r.total,
                current: r.current ?? '',
              })}
            </div>
          ))}
        </div>
      )}
      {details && (
        <FailureDialog
          title={details.title}
          failures={details.failures}
          onClose={() => setDetails(null)}
        />
      )}
    </>
  )
}

function FailureDialog({
  title,
  failures,
  onClose,
}: {
  title: string
  failures: FailureEntry[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])

  const formatMessage = (m: string): string => {
    if (m.startsWith('notFound:')) {
      return t('commandRun.notFound', { cmd: m.slice('notFound:'.length) })
    }
    if (m.startsWith('parseError:')) {
      return t('commandRun.parseError', { cmd: m.slice('parseError:'.length) })
    }
    if (m.startsWith('exitCode:')) {
      return t('commandRun.exitCode', { code: m.slice('exitCode:'.length) })
    }
    return m
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="bg-bg-secondary text-text-primary border border-border-primary rounded-lg p-4 w-[640px] max-w-[90vw] backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">
          {t('commandRun.detailsTitle')} — {title}
        </h3>
        <button
          onClick={() => ref.current?.close()}
          className="text-xs px-2 py-1 border border-border-primary rounded hover:bg-bg-tertiary"
        >{t('commandRun.detailsClose')}</button>
      </div>
      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {failures.map((f, i) => (
          <div key={i} className="bg-bg-primary border border-border-primary rounded p-2">
            <div className="text-xs font-mono text-text-primary truncate" title={f.path}>{f.path}</div>
            <div className="text-xs text-status-red mt-1">{formatMessage(f.message)}</div>
            {f.stderr && (
              <pre className="text-[10px] font-mono text-text-secondary mt-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                {f.stderr.slice(-1024)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </dialog>
  )
}
```

- [ ] **Step 14.2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "CommandRunStatus" | head`
Expected: no output.

- [ ] **Step 14.3: Commit**

```bash
git add src/components/common/CommandRunStatus.tsx
git commit -m "feat(custom-cmd): CommandRunStatus strip + failure dialog"
```

---

## Task 15: App.tsx — mount CommandRunStatus and IPC subscription

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 15.1: Add imports**

```ts
import { useEffect, useState } from 'react'
// ...existing imports...
import CommandRunStatus from './components/common/CommandRunStatus'
import { useCommandRunStore } from './stores/commandRunStore'
```

- [ ] **Step 15.2: Subscribe in `MainApp` and mount the component**

Replace the existing `MainApp` function with:

```tsx
function MainApp() {
  const [page, setPage] = useState<Page>('dashboard')
  const { t } = useTranslation()
  useRealtimeData()

  useEffect(() => {
    const unsubscribe = window.api.onCommandProgress((e) => {
      const store = useCommandRunStore.getState()
      switch (e.type) {
        case 'start':     store.start(e); break
        case 'advance':   store.advance(e); break
        case 'fileError': store.fileError(e); break
        case 'finish':    store.finish(e); break
      }
    })
    return unsubscribe
  }, [])

  return (
    <div className="h-screen flex bg-bg-primary text-text-primary">
      <Sidebar activePage={page} onNavigate={setPage} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={t(`pages.${page}`)} />
        <main className="flex-1 overflow-y-auto p-4">
          <PageContent page={page} onNavigate={setPage} />
        </main>
      </div>
      <CommandRunStatus />
    </div>
  )
}
```

- [ ] **Step 15.3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "App\.tsx" | head`
Expected: no output for App.tsx.

- [ ] **Step 15.4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(custom-cmd): mount CommandRunStatus and progress subscription"
```

---

## Task 16: FilesPage — extend rowMenuItems

**Files:**
- Modify: `src/components/files/FilesPage.tsx`

- [ ] **Step 16.1: Add a settings-loading hook for `customCommands`**

Inside the `FilesPage` component, after the existing `useFilesStore` lines and before `const [menu, setMenu] = useState...`, add a small effect-backed state that mirrors the persisted `customCommands`. We can't call `useSettingsStore` (no such store exists; settings are only loaded on demand). Use this pattern:

```tsx
import type { DirEntry, CustomCommand } from '../../types'
// (inside FilesPage component)
  const [customCommands, setCustomCommands] = useState<CustomCommand[]>([])
  useEffect(() => {
    let mounted = true
    window.api.getSettings().then((s) => { if (mounted) setCustomCommands(s.customCommands ?? []) })
    return () => { mounted = false }
  }, [])
  // Re-load when language changes is sufficient as a coarse trigger; settings
  // are saved in-page so we also reload on focus to pick up edits.
  useEffect(() => {
    const handler = () => {
      window.api.getSettings().then((s) => setCustomCommands(s.customCommands ?? []))
    }
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [])
```

- [ ] **Step 16.2: Extend `rowMenuItems`**

Replace the existing `rowMenuItems(entry: DirEntry)` function (around line 222–265) with the version that appends custom commands at the bottom:

```tsx
  const rowMenuItems = (entry: DirEntry): MenuItem[] => {
    const targets = targetsForRowMenu(entry)
    const isMulti = targets.length > 1
    const baseItems: MenuItem[] = [
      { label: t('files.contextMenu.open'), disabled: isMulti, onClick: async () => {
        const r = await window.api.fsOpen(entry.path)
        if (!r.ok) toast.error(r.message)
      }},
      { label: t('files.contextMenu.rename'), disabled: isMulti, onClick: () => setRenamingPath(entry.path) },
      { label: '', separator: true, onClick: () => {} },
      { label: t('files.contextMenu.copy'), onClick: () => setClipboard({ paths: targets, op: 'copy' }) },
      { label: t('files.contextMenu.cut'), onClick: () => setClipboard({ paths: targets, op: 'cut' }) },
      { label: t('files.contextMenu.trash'), onClick: async () => {
        const r = await window.api.fsTrash(targets)
        if (!r.ok) toast.error(r.message)
      }},
      { label: t('files.contextMenu.zip'), onClick: async () => {
        const r = await window.api.fsZip(targets, currentPath)
        if (!r.ok) toast.error(r.message)
      }},
      { label: '', separator: true, onClick: () => {} },
      { label: t('files.contextMenu.revealInFinder'), onClick: () => window.api.revealFile(entry.path) },
      { label: '', separator: true, onClick: () => {} },
      {
        label: t('files.contextMenu.addToShortcuts'),
        disabled: targets.some((p) => {
          const e = visible.find((v) => v.path === p)
          return !e || !e.isDirectory
        }),
        onClick: async () => {
          const settings = await window.api.getSettings()
          const existing = new Set(settings.fileShortcuts ?? [])
          const toAdd = targets.filter((p) => !existing.has(p))
          if (toAdd.length === 0) {
            toast.info(t('files.toast.shortcutExists'))
            return
          }
          const next = [...(settings.fileShortcuts ?? []), ...toAdd]
          await window.api.saveSettings({ ...settings, fileShortcuts: next })
          toast.success(t('files.toast.addedShortcut'))
        },
      },
    ]

    if (customCommands.length === 0) return baseItems

    const customItems: MenuItem[] = customCommands.map((c) => ({
      label: c.label,
      onClick: async () => {
        const r = await window.api.runCommand(c.id, targets)
        if (!r.ok) toast.error(r.message)
      },
    }))

    return [
      ...baseItems,
      { label: '', separator: true, onClick: () => {} },
      ...customItems,
    ]
  }
```

- [ ] **Step 16.3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "FilesPage\.tsx" | head`
Expected: no output for FilesPage.tsx.

- [ ] **Step 16.4: Commit**

```bash
git add src/components/files/FilesPage.tsx
git commit -m "feat(custom-cmd): append custom commands to Files row context menu"
```

---

## Task 17: Final verification

**Files:** none (verification only).

- [ ] **Step 17.1: Run full unit-test suite**

Run: `npm test`
Expected: all tests pass. New tests added in this plan: `shlex.test.ts` (12), `shellPath.test.ts` (6), `customCommandRunner.test.ts` (9), plus three new cases in `settingsStore.test.ts`.

- [ ] **Step 17.2: Run i18n shape parity**

Run: `npx vitest run tests/electron/i18n-shape.test.ts tests/electron/i18n.test.ts`
Expected: PASS.

- [ ] **Step 17.3: Build**

Run: `npm run build`
Expected: build succeeds. Pre-existing TypeScript errors (chart components, treemap) that were not introduced by this work are out of scope; failures must come from this plan's changes.

- [ ] **Step 17.4: Manual QA**

Run: `npm run dev` in the background. Walk the spec's QA checklist:

1. **Add a command.** Settings → 自定义命令 → + 添加命令. Label `printf path`, command `printf "%s\n"`. Save.
2. **Single-file run.** Files page → right-click any file → click `printf path`. The command runs (you can verify in terminal that no visible window output is shown — the toast appears with `printf path 完成`).
3. **Multi-file run.** ⌘-click 3 files → right-click one of them → click `printf path`. Status strip shows `1/3`, `2/3`, `3/3`, then a success toast.
4. **Right-click outside selection.** Multi-select 3 files, then right-click an unselected fourth file → click the command. It runs only on the fourth file.
5. **Directory target.** Right-click a folder → click the command → runs.
6. **Path with spaces.** Create a file `My Doc.txt` in a folder. Configure a command `bash -c 'printf "%s\n" "$@" > /tmp/dashmac-test.txt' --` (or simpler: just verify the command receives the right argv with a test binary). Optional smoke check.
7. **ENOENT.** Configure command `notexist`. Right-click any file → run. Toast says `找不到命令 notexist，请检查 PATH。` and details auto-open.
8. **Unclosed quote.** Edit a command and type `bup "abc`. Save button disabled, red error visible.
9. **Empty fields.** Empty label or command → Save disabled.
10. **Delete.** Delete a command in Settings. Right-click in Files → that command no longer appears.
11. **Empty list.** Delete all commands. Right-click → no separator, no extra menu items below `添加到快捷目录`.
12. **Quit-time cleanup.** Start a long-running command (e.g. `sleep 30`) on multiple files. Quit DashMac. Verify `ps aux | grep sleep` shows no orphans within a second.

Stop the dev server when done.

- [ ] **Step 17.5: Spec acceptance review**

Open `docs/superpowers/specs/2026-04-29-custom-commands-design.md` §8 (Acceptance Criteria). Tick off each item against the actual behavior. Any unchecked item is a gap — fix it before reporting the plan complete.

- [ ] **Step 17.6: Final commit (if any fixes during QA)**

If QA found issues, commit fixes with messages prefixed `fix(custom-cmd): ...` and re-run Step 17.1–17.4.

If everything is green, no further commit is needed; the feature branch is ready to merge.

---

## Self-Review Notes

Internal pass against the spec confirmed:

- §2 data model → Tasks 3, 4 (types + DEFAULTS).
- §2.3 Settings UI → Task 12.
- §2.4 i18n → Tasks 10, 11.
- §3.1 runner + §3.5 concurrency → Tasks 5, 6, 7. Concurrency is implicit: each call to `run()` is independent, and `disposeAll()` covers any in-flight children.
- §3.2 shlex → Task 1.
- §3.3 shellPath → Task 2.
- §3.4 IPC contract → Tasks 8, 9.
- §3.6 no cancel → not implemented (correct).
- §4.1 menu position → Task 16.
- §4.2 multi-select → Task 16 reuses existing `targetsForRowMenu` which already implements Finder-style behavior.
- §4.3 status strip + dialog → Tasks 13, 14, 15.
- §5 tests → Tasks 1, 2, 4, 6, 7.
- §6 out of scope → respected (no cancel, no placeholders, no env editor, no reorder UI).
- §7 risks — risk #6 (orphan processes on quit) is handled via `disposeAll()` in Task 9.
- §8 acceptance — covered by Task 17.4 manual QA.

One naming note: the spec calls the type `ProgressEvent` but TypeScript's lib already has a global `ProgressEvent` (DOM API). To avoid shadowing, this plan exports it as `CustomCommandProgressEvent`. Functionally identical to the spec.
