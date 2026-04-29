# File Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Finder-like file browser as a new top-level "Files" page — sidebar shortcuts + system roots, editable path bar with history, sortable 4-column listing with multi-select, full file operations (open/rename/trash/zip, copy/cut/paste, new folder/file), context menus, inline rename, and a shared toast system for feedback.

**Architecture:** Three new main-process services (`fileSystem`, `zipService`, `clipboard`) own all real IO and state. 10 new IPC channels follow the existing discriminated-union `{ ok: true | false }` contract. Renderer state lives in two new Zustand stores (`filesStore` for the page, `toastStore` for global toasts). UI is decomposed into focused components: `FilesPage` (container), `FileSidebar`, `PathBar`, `FileList`, `ContextMenu`, `RenameInline`, plus a shared `Toast`. Auto-refresh after mutating ops via a new `'fs:dir-changed'` push channel.

**Tech Stack:** Electron + React 19 + TypeScript strict + Zustand + Tailwind 4. macOS-only ZIP via `ditto` (built-in). Trash via `shell.trashItem`. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-04-28-file-browser-design.md`

---

## File Structure

**New main-process files:**
- `electron/services/fileSystem.ts` — listDirectory, validateName, mkdir, createFile, rename, copyMany, moveMany, resolveDuplicateName, trashMany
- `electron/services/zipService.ts` — zipPaths via spawning `ditto`
- `electron/services/clipboard.ts` — module state: `setClip`, `getClip`, `clearClip`

**New renderer files:**
- `src/i18n/time.ts` — pure `formatRelativeTime(ms, lang)` helper
- `src/stores/filesStore.ts` — page state + actions
- `src/stores/toastStore.ts` — toast queue
- `src/components/common/Toast.tsx` — toast root + `useToast()` hook
- `src/components/files/FilesPage.tsx` — page container
- `src/components/files/FileSidebar.tsx` — left pane: shortcuts + system + add button
- `src/components/files/PathBar.tsx` — top toolbar
- `src/components/files/FileList.tsx` — table with sort + selection
- `src/components/files/ContextMenu.tsx` — both right-click variants
- `src/components/files/RenameInline.tsx` — inline rename input

**New tests:**
- `tests/electron/timeFormat.test.ts`
- `tests/electron/fileSystem.test.ts`
- `tests/electron/zipService.test.ts`
- `tests/electron/clipboard.test.ts`

**Modified:**
- `src/types.ts` — add `DirEntry`, extend `AppSettings`, extend `DashMacAPI`
- `src/i18n/locales/en.ts` — add `files.*`, `pages.files`, `sidebar.files`
- `src/i18n/locales/zh-CN.ts` — same shape, Chinese values
- `electron/services/settingsStore.ts` — extend `DEFAULTS`
- `electron/main.ts` — register 9 new IPC handlers
- `electron/preload.ts` — expose 10 new methods
- `src/App.tsx` — add `'files'` to Page union; case in PageContent; mount Toast
- `src/components/layout/Sidebar.tsx` — add `'files'` to NAV_ORDER / NAV_ICONS

---

## Conventions

- **Commit per task** with message in lowercase conventional-commit style (`feat(files): …` for files-feature work; `feat(i18n): …` for locale-only changes; `test: …` for test-only commits).
- **TDD**: tests first, see them fail, then implement, see them pass, commit.
- **Imports** in main and shared code: no `.js`/`.ts`/`.tsx` suffixes.
- **Tests live in** `tests/electron/` (existing convention; jsdom env handles renderer-side pure functions).
- **Run a single test file:** `npx vitest run tests/electron/<file>.test.ts`. Full suite: `npm test`.
- **Build verification:** `npm run build` compiles main + preload + renderer; type errors show during build.
- **No `as const`** on locale dicts (preserves the `typeof en` mirroring trick).
- **Working directory** is the project root or worktree root (the executing skill will set this up).

---

## Task 1: Pure relative-time helper

**Files:**
- Create: `src/i18n/time.ts`
- Test: `tests/electron/timeFormat.test.ts`

Pure function `formatRelativeTime(ms, lang, now?)` taking a timestamp and a language tag, returning the localized human-readable string. The optional `now` parameter exists for deterministic testing.

- [ ] **Step 1: Write the failing tests**

Create `tests/electron/timeFormat.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { formatRelativeTime } from '../../src/i18n/time'

const NOW = new Date('2026-04-28T15:00:00').getTime()

describe('formatRelativeTime (en)', () => {
  test('30 seconds ago → "just now"', () => {
    expect(formatRelativeTime(NOW - 30_000, 'en', NOW)).toBe('just now')
  })

  test('5 minutes ago → "5 min ago"', () => {
    expect(formatRelativeTime(NOW - 5 * 60_000, 'en', NOW)).toBe('5 min ago')
  })

  test('90 minutes ago → "1 hour ago"', () => {
    expect(formatRelativeTime(NOW - 90 * 60_000, 'en', NOW)).toBe('1 hour ago')
  })

  test('same calendar day, 6 hours ago → "Today HH:mm"', () => {
    expect(formatRelativeTime(NOW - 6 * 60 * 60_000, 'en', NOW)).toBe('Today 09:00')
  })

  test('yesterday → "Yesterday HH:mm"', () => {
    const yesterday = new Date('2026-04-27T14:30:00').getTime()
    expect(formatRelativeTime(yesterday, 'en', NOW)).toBe('Yesterday 14:30')
  })

  test('5 days ago → "5 days ago"', () => {
    expect(formatRelativeTime(NOW - 5 * 24 * 60 * 60_000, 'en', NOW)).toBe('5 days ago')
  })

  test('30 days ago → absolute YYYY-MM-DD', () => {
    const old = new Date('2026-03-29T10:00:00').getTime()
    expect(formatRelativeTime(old, 'en', NOW)).toBe('2026-03-29')
  })
})

describe('formatRelativeTime (zh-CN)', () => {
  test('30 seconds ago → "刚刚"', () => {
    expect(formatRelativeTime(NOW - 30_000, 'zh-CN', NOW)).toBe('刚刚')
  })

  test('5 minutes ago → "5 分钟前"', () => {
    expect(formatRelativeTime(NOW - 5 * 60_000, 'zh-CN', NOW)).toBe('5 分钟前')
  })

  test('same day → "今天 HH:mm"', () => {
    expect(formatRelativeTime(NOW - 6 * 60 * 60_000, 'zh-CN', NOW)).toBe('今天 09:00')
  })

  test('yesterday → "昨天 HH:mm"', () => {
    const yesterday = new Date('2026-04-27T14:30:00').getTime()
    expect(formatRelativeTime(yesterday, 'zh-CN', NOW)).toBe('昨天 14:30')
  })

  test('5 days ago → "5 天前"', () => {
    expect(formatRelativeTime(NOW - 5 * 24 * 60 * 60_000, 'zh-CN', NOW)).toBe('5 天前')
  })

  test('30 days ago → YYYY-MM-DD (absolute, not localized)', () => {
    const old = new Date('2026-03-29T10:00:00').getTime()
    expect(formatRelativeTime(old, 'zh-CN', NOW)).toBe('2026-03-29')
  })
})
```

- [ ] **Step 2: Run tests; confirm failure**

Run: `npx vitest run tests/electron/timeFormat.test.ts`
Expected: failure (module not found).

- [ ] **Step 3: Implement the helper**

Create `src/i18n/time.ts`:

```ts
export type Lang = 'en' | 'zh-CN'

const STR = {
  en: {
    justNow: 'just now',
    minutesAgo: (n: number) => `${n} min ago`,
    hoursAgo: (n: number) => `${n} hour ago`,
    today: (hm: string) => `Today ${hm}`,
    yesterday: (hm: string) => `Yesterday ${hm}`,
    daysAgo: (n: number) => `${n} days ago`,
  },
  'zh-CN': {
    justNow: '刚刚',
    minutesAgo: (n: number) => `${n} 分钟前`,
    hoursAgo: (n: number) => `${n} 小时前`,
    today: (hm: string) => `今天 ${hm}`,
    yesterday: (hm: string) => `昨天 ${hm}`,
    daysAgo: (n: number) => `${n} 天前`,
  },
}

function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}` }
function hhmm(d: Date): string { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}` }
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

export function formatRelativeTime(ms: number, lang: Lang, now: number = Date.now()): string {
  const s = STR[lang]
  const target = new Date(ms)
  const nowDate = new Date(now)
  const deltaMs = now - ms
  const deltaSec = Math.floor(deltaMs / 1000)
  const deltaMin = Math.floor(deltaSec / 60)
  const deltaHr = Math.floor(deltaMin / 60)

  if (deltaSec < 60) return s.justNow
  if (deltaMin < 60) return s.minutesAgo(deltaMin)
  if (deltaHr < 24 && isSameDay(target, nowDate)) return s.today(hhmm(target))

  const yesterday = new Date(nowDate)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(target, yesterday)) return s.yesterday(hhmm(target))

  const deltaDay = Math.floor(deltaMs / (24 * 60 * 60 * 1000))
  if (deltaDay < 7) return s.daysAgo(deltaDay)

  return ymd(target)
}
```

- [ ] **Step 4: Run tests; confirm pass**

Run: `npx vitest run tests/electron/timeFormat.test.ts`
Expected: 13 passing.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/time.ts tests/electron/timeFormat.test.ts
git commit -m "feat(files): add formatRelativeTime pure helper for file timestamps"
```

---

## Task 2: Type extensions in src/types.ts

**Files:**
- Modify: `src/types.ts`

Add `DirEntry` interface, extend `AppSettings` with `fileShortcuts` + `showHiddenFiles`, extend `DashMacAPI` with the 10 new methods.

- [ ] **Step 1: Read the current file structure**

Run: `cat src/types.ts | head -10 && echo '...' && cat src/types.ts | tail -25`
Familiarize yourself with the existing `FileEntry` interface (used by Treemap) — your new type is named `DirEntry` to avoid the collision.

- [ ] **Step 2: Add `DirEntry` interface**

Insert this block in `src/types.ts` near the existing `FileEntry` (e.g., right after it):

```ts
// Flat file-system entry returned by listDirectory. Distinct from FileEntry
// (which is recursive with `children` and used by the Treemap analytics view).
export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number          // 0 for directories
  modifiedAt: number    // ms since epoch
  ext: string           // lowercase, includes dot; '' for directories or no ext
}
```

- [ ] **Step 3: Extend `AppSettings`**

Find the `AppSettings` interface and add two fields:

```ts
export interface AppSettings {
  realtimeInterval: number
  historyInterval: number
  retentionDays: number
  trayDisplayMetric: 'memory' | 'cpu' | 'network' | 'none'
  launchAtLogin: boolean
  language: 'auto' | 'en' | 'zh-CN'
  resolvedLanguage: 'en' | 'zh-CN'
  fileShortcuts: string[]      // NEW; absolute paths; default []
  showHiddenFiles: boolean     // NEW; default false
}
```

- [ ] **Step 4: Extend `DashMacAPI` with 10 new methods**

Add the following inside the `DashMacAPI` interface (group them together for readability, e.g., right above `onLangChanged`):

```ts
  // File browser
  listDirectory: (path: string) => Promise<
    | { ok: true; entries: DirEntry[] }
    | { ok: false; errno: string; message: string }
  >
  fsCreateFolder: (parent: string, name: string) => Promise<
    | { ok: true; path: string }
    | { ok: false; message: string }
  >
  fsCreateFile: (parent: string, name: string) => Promise<
    | { ok: true; path: string }
    | { ok: false; message: string }
  >
  fsRename: (oldPath: string, newName: string) => Promise<
    | { ok: true; path: string }
    | { ok: false; message: string }
  >
  fsTrash: (paths: string[]) => Promise<
    | { ok: true }
    | { ok: false; failed: string[]; message: string }
  >
  fsCopy: (paths: string[], destDir: string) => Promise<
    | { ok: true }
    | { ok: false; failed: string[]; message: string }
  >
  fsMove: (paths: string[], destDir: string) => Promise<
    | { ok: true }
    | { ok: false; failed: string[]; message: string }
  >
  fsZip: (paths: string[], destDir: string) => Promise<
    | { ok: true; path: string }
    | { ok: false; message: string }
  >
  fsOpen: (path: string) => Promise<
    | { ok: true }
    | { ok: false; message: string }
  >
  onDirChanged: (callback: (path: string) => void) => () => void
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "types\.ts" || echo "no errors in types.ts"`
Expected: `no errors in types.ts`. (Other files will have errors because they consume the new contract — those are expected and fixed in subsequent tasks.)

- [ ] **Step 6: Commit**

```bash
git add src/types.ts
git commit -m "feat(files): add DirEntry, extend AppSettings and DashMacAPI for file browser"
```

---

## Task 3: fileSystem service — read-only ops + name validation

**Files:**
- Create: `electron/services/fileSystem.ts`
- Test: `tests/electron/fileSystem.test.ts`

Read-side functions (`listDirectory`) and the validation helper (`validateName`). Subsequent tasks add mutating ops to the same file.

- [ ] **Step 1: Write the failing tests**

Create `tests/electron/fileSystem.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { listDirectory, validateName } from '../../electron/services/fileSystem'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dashmac-fs-test-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('validateName', () => {
  test('rejects empty string', () => { expect(validateName('')).toBe(false) })
  test('rejects "/"', () => { expect(validateName('a/b')).toBe(false) })
  test('rejects NUL byte', () => { expect(validateName('a\0b')).toBe(false) })
  test('rejects "."', () => { expect(validateName('.')).toBe(false) })
  test('rejects ".."', () => { expect(validateName('..')).toBe(false) })
  test('accepts plain name', () => { expect(validateName('foo')).toBe(true) })
  test('accepts name with extension', () => { expect(validateName('foo.txt')).toBe(true) })
  test('accepts unicode', () => { expect(validateName('文件.txt')).toBe(true) })
})

describe('listDirectory', () => {
  test('returns entries for a directory', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'hello')
    fs.mkdirSync(path.join(tmp, 'sub'))
    const entries = await listDirectory(tmp)
    expect(entries.length).toBe(2)
    const file = entries.find((e) => e.name === 'a.txt')!
    expect(file.isDirectory).toBe(false)
    expect(file.size).toBe(5)
    expect(file.ext).toBe('.txt')
    expect(file.path).toBe(path.join(tmp, 'a.txt'))
    expect(typeof file.modifiedAt).toBe('number')
    const dir = entries.find((e) => e.name === 'sub')!
    expect(dir.isDirectory).toBe(true)
    expect(dir.size).toBe(0)
    expect(dir.ext).toBe('')
  })

  test('returns hidden entries (filtering is renderer-side)', async () => {
    fs.writeFileSync(path.join(tmp, '.hidden'), 'x')
    fs.writeFileSync(path.join(tmp, 'visible.txt'), 'y')
    const entries = await listDirectory(tmp)
    expect(entries.map((e) => e.name).sort()).toEqual(['.hidden', 'visible.txt'])
  })

  test('expands ~ to home directory', async () => {
    const entries = await listDirectory('~')
    // ~ should resolve to homedir; just confirm we got an array (whatever home contains)
    expect(Array.isArray(entries)).toBe(true)
  })

  test('throws ENOENT for missing path', async () => {
    await expect(listDirectory(path.join(tmp, 'nope'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('throws ENOTDIR for a file path', async () => {
    const file = path.join(tmp, 'f.txt')
    fs.writeFileSync(file, '')
    await expect(listDirectory(file)).rejects.toMatchObject({ code: 'ENOTDIR' })
  })
})
```

- [ ] **Step 2: Run tests; confirm failure**

Run: `npx vitest run tests/electron/fileSystem.test.ts`
Expected: failure (module not found).

- [ ] **Step 3: Implement the read-only API + validateName**

Create `electron/services/fileSystem.ts`:

```ts
import * as fs from 'fs/promises'
import * as fssync from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { DirEntry } from '../../src/types'

function expandTilde(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

export function validateName(name: string): boolean {
  if (name.length === 0) return false
  if (name.includes('/')) return false
  if (name.includes('\0')) return false
  if (name === '.' || name === '..') return false
  return true
}

export async function listDirectory(rawPath: string): Promise<DirEntry[]> {
  const dir = path.resolve(expandTilde(rawPath))
  const stat = await fs.stat(dir)
  if (!stat.isDirectory()) {
    const err = new Error(`Not a directory: ${dir}`) as NodeJS.ErrnoException
    err.code = 'ENOTDIR'
    throw err
  }
  const names = await fs.readdir(dir)
  const entries: DirEntry[] = []
  for (const name of names) {
    const p = path.join(dir, name)
    try {
      const s = await fs.stat(p)
      const isDir = s.isDirectory()
      entries.push({
        name,
        path: p,
        isDirectory: isDir,
        size: isDir ? 0 : s.size,
        modifiedAt: s.mtimeMs,
        ext: isDir ? '' : path.extname(name).toLowerCase(),
      })
    } catch {
      // Skip entries we can't stat (broken symlinks etc.) silently.
    }
  }
  return entries
}
```

Note the synchronous `fssync` import is included for use by later tasks (placeholder; if linter complains about unused, remove for now and add it back in Task 4).

Actually clean it up — don't import what you don't use yet:

```ts
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import type { DirEntry } from '../../src/types'
```

- [ ] **Step 4: Run tests; confirm pass**

Run: `npx vitest run tests/electron/fileSystem.test.ts`
Expected: 13 passing (8 validateName + 5 listDirectory).

- [ ] **Step 5: Commit**

```bash
git add electron/services/fileSystem.ts tests/electron/fileSystem.test.ts
git commit -m "feat(files): add fileSystem.listDirectory and validateName with tests"
```

---

## Task 4: fileSystem — single mutating ops (mkdir, createFile, rename)

**Files:**
- Modify: `electron/services/fileSystem.ts`
- Modify: `tests/electron/fileSystem.test.ts`

Append three more functions plus their tests.

- [ ] **Step 1: Append failing tests**

Add to `tests/electron/fileSystem.test.ts` (after the existing `describe` blocks):

```ts
import { mkdir, createFile, rename } from '../../electron/services/fileSystem'

describe('mkdir', () => {
  test('creates a folder and returns its absolute path', async () => {
    const p = await mkdir(tmp, 'newfolder')
    expect(p).toBe(path.join(tmp, 'newfolder'))
    expect(fs.statSync(p).isDirectory()).toBe(true)
  })

  test('throws when target exists', async () => {
    fs.mkdirSync(path.join(tmp, 'exists'))
    await expect(mkdir(tmp, 'exists')).rejects.toMatchObject({ code: 'EEXIST' })
  })
})

describe('createFile', () => {
  test('creates an empty file', async () => {
    const p = await createFile(tmp, 'a.txt')
    expect(p).toBe(path.join(tmp, 'a.txt'))
    expect(fs.statSync(p).isFile()).toBe(true)
    expect(fs.readFileSync(p, 'utf8')).toBe('')
  })

  test('throws when target exists', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'x')
    await expect(createFile(tmp, 'a.txt')).rejects.toMatchObject({ code: 'EEXIST' })
  })
})

describe('rename', () => {
  test('renames a file in place', async () => {
    const old = path.join(tmp, 'old.txt')
    fs.writeFileSync(old, 'x')
    const p = await rename(old, 'new.txt')
    expect(p).toBe(path.join(tmp, 'new.txt'))
    expect(fs.existsSync(old)).toBe(false)
    expect(fs.existsSync(p)).toBe(true)
  })

  test('rejects invalid new name', async () => {
    const old = path.join(tmp, 'old.txt')
    fs.writeFileSync(old, 'x')
    await expect(rename(old, '')).rejects.toThrow(/invalid name/i)
    await expect(rename(old, 'a/b')).rejects.toThrow(/invalid name/i)
  })

  test('rejects when target exists', async () => {
    const a = path.join(tmp, 'a.txt'); fs.writeFileSync(a, '')
    fs.writeFileSync(path.join(tmp, 'b.txt'), '')
    await expect(rename(a, 'b.txt')).rejects.toMatchObject({ code: 'EEXIST' })
  })
})
```

- [ ] **Step 2: Run; confirm failure**

Run: `npx vitest run tests/electron/fileSystem.test.ts`
Expected: failures because the new symbols aren't exported.

- [ ] **Step 3: Add the implementations**

Append to `electron/services/fileSystem.ts`:

```ts
export async function mkdir(parent: string, name: string): Promise<string> {
  if (!validateName(name)) throw new Error(`Invalid name: ${name}`)
  const target = path.join(path.resolve(expandTilde(parent)), name)
  await fs.mkdir(target)
  return target
}

export async function createFile(parent: string, name: string): Promise<string> {
  if (!validateName(name)) throw new Error(`Invalid name: ${name}`)
  const target = path.join(path.resolve(expandTilde(parent)), name)
  // Use 'wx' to fail if target exists
  const handle = await fs.open(target, 'wx')
  await handle.close()
  return target
}

export async function rename(oldPath: string, newName: string): Promise<string> {
  if (!validateName(newName)) throw new Error(`Invalid name: ${newName}`)
  const dir = path.dirname(oldPath)
  const target = path.join(dir, newName)
  // Manually check existence to throw EEXIST instead of clobbering
  try {
    await fs.access(target)
    const err = new Error(`Target exists: ${target}`) as NodeJS.ErrnoException
    err.code = 'EEXIST'
    throw err
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err  // re-throw EEXIST or unexpected
  }
  await fs.rename(oldPath, target)
  return target
}
```

- [ ] **Step 4: Run tests; confirm pass**

Run: `npx vitest run tests/electron/fileSystem.test.ts`
Expected: 13 + 7 = 20 passing.

- [ ] **Step 5: Commit**

```bash
git add electron/services/fileSystem.ts tests/electron/fileSystem.test.ts
git commit -m "feat(files): add mkdir, createFile, rename to fileSystem service"
```

---

## Task 5: fileSystem — bulk ops + duplicate-name resolution

**Files:**
- Modify: `electron/services/fileSystem.ts`
- Modify: `tests/electron/fileSystem.test.ts`

Add `resolveDuplicateName`, `copyMany`, `moveMany`, and `trashMany`. Bulk ops use `resolveDuplicateName` to auto-suffix collisions.

- [ ] **Step 1: Append failing tests**

Add to `tests/electron/fileSystem.test.ts`:

```ts
import { resolveDuplicateName, copyMany, moveMany } from '../../electron/services/fileSystem'

describe('resolveDuplicateName', () => {
  test('returns name unchanged when no collision', async () => {
    expect(await resolveDuplicateName('foo.txt', tmp)).toBe('foo.txt')
  })

  test('appends "(copy)" before the extension', async () => {
    fs.writeFileSync(path.join(tmp, 'foo.txt'), '')
    expect(await resolveDuplicateName('foo.txt', tmp)).toBe('foo (copy).txt')
  })

  test('appends "(copy 2)" when "(copy)" also exists', async () => {
    fs.writeFileSync(path.join(tmp, 'foo.txt'), '')
    fs.writeFileSync(path.join(tmp, 'foo (copy).txt'), '')
    expect(await resolveDuplicateName('foo.txt', tmp)).toBe('foo (copy 2).txt')
  })

  test('handles names without an extension', async () => {
    fs.writeFileSync(path.join(tmp, 'foo'), '')
    expect(await resolveDuplicateName('foo', tmp)).toBe('foo (copy)')
  })

  test('handles directories (no extension)', async () => {
    fs.mkdirSync(path.join(tmp, 'mydir'))
    expect(await resolveDuplicateName('mydir', tmp)).toBe('mydir (copy)')
  })
})

describe('copyMany', () => {
  test('copies a single file to a destination directory', async () => {
    const src = path.join(tmp, 'a.txt')
    fs.writeFileSync(src, 'hello')
    const dest = path.join(tmp, 'sub'); fs.mkdirSync(dest)
    await copyMany([src], dest)
    expect(fs.readFileSync(path.join(dest, 'a.txt'), 'utf8')).toBe('hello')
    expect(fs.existsSync(src)).toBe(true)  // copy preserves source
  })

  test('appends "(copy)" suffix on collision', async () => {
    const src = path.join(tmp, 'a.txt')
    fs.writeFileSync(src, 'hello')
    const dest = path.join(tmp, 'sub'); fs.mkdirSync(dest)
    fs.writeFileSync(path.join(dest, 'a.txt'), 'pre-existing')
    await copyMany([src], dest)
    expect(fs.readFileSync(path.join(dest, 'a.txt'), 'utf8')).toBe('pre-existing')
    expect(fs.readFileSync(path.join(dest, 'a (copy).txt'), 'utf8')).toBe('hello')
  })

  test('recursively copies a directory', async () => {
    const srcDir = path.join(tmp, 'src'); fs.mkdirSync(srcDir)
    fs.writeFileSync(path.join(srcDir, 'a.txt'), 'x')
    fs.mkdirSync(path.join(srcDir, 'inner'))
    fs.writeFileSync(path.join(srcDir, 'inner', 'b.txt'), 'y')
    const dest = path.join(tmp, 'dest'); fs.mkdirSync(dest)
    await copyMany([srcDir], dest)
    expect(fs.readFileSync(path.join(dest, 'src', 'a.txt'), 'utf8')).toBe('x')
    expect(fs.readFileSync(path.join(dest, 'src', 'inner', 'b.txt'), 'utf8')).toBe('y')
  })
})

describe('moveMany', () => {
  test('moves a file (source removed)', async () => {
    const src = path.join(tmp, 'a.txt')
    fs.writeFileSync(src, 'hello')
    const dest = path.join(tmp, 'sub'); fs.mkdirSync(dest)
    await moveMany([src], dest)
    expect(fs.readFileSync(path.join(dest, 'a.txt'), 'utf8')).toBe('hello')
    expect(fs.existsSync(src)).toBe(false)
  })

  test('rejects when destination equals source parent', async () => {
    const src = path.join(tmp, 'a.txt')
    fs.writeFileSync(src, 'x')
    await expect(moveMany([src], tmp)).rejects.toThrow(/source/i)
  })

  test('rejects when destination is inside source (ancestor)', async () => {
    const srcDir = path.join(tmp, 'parent'); fs.mkdirSync(srcDir)
    const innerDir = path.join(srcDir, 'inner'); fs.mkdirSync(innerDir)
    await expect(moveMany([srcDir], innerDir)).rejects.toThrow(/ancestor|inside/i)
  })
})
```

- [ ] **Step 2: Run; confirm failure**

Run: `npx vitest run tests/electron/fileSystem.test.ts`
Expected: failures (new functions not yet exported).

- [ ] **Step 3: Implement**

Append to `electron/services/fileSystem.ts`:

```ts
function splitExt(name: string): { base: string; ext: string } {
  const ext = path.extname(name)
  const base = ext ? name.slice(0, -ext.length) : name
  return { base, ext }
}

export async function resolveDuplicateName(name: string, dirPath: string): Promise<string> {
  const dir = path.resolve(expandTilde(dirPath))
  try { await fs.access(path.join(dir, name)); }
  catch { return name }  // ENOENT → no collision

  const { base, ext } = splitExt(name)
  const firstAttempt = `${base} (copy)${ext}`
  try { await fs.access(path.join(dir, firstAttempt)); }
  catch { return firstAttempt }

  for (let i = 2; i < 1000; i++) {
    const attempt = `${base} (copy ${i})${ext}`
    try { await fs.access(path.join(dir, attempt)); }
    catch { return attempt }
  }
  throw new Error(`Could not find available name for ${name} in ${dir}`)
}

async function copyRecursive(src: string, dest: string): Promise<void> {
  const stat = await fs.stat(src)
  if (stat.isDirectory()) {
    await fs.mkdir(dest)
    const entries = await fs.readdir(src)
    for (const e of entries) await copyRecursive(path.join(src, e), path.join(dest, e))
  } else {
    await fs.copyFile(src, dest)
  }
}

export async function copyMany(srcs: string[], destDir: string): Promise<void> {
  const dest = path.resolve(expandTilde(destDir))
  for (const src of srcs) {
    const baseName = path.basename(src)
    const finalName = await resolveDuplicateName(baseName, dest)
    await copyRecursive(src, path.join(dest, finalName))
  }
}

export async function moveMany(srcs: string[], destDir: string): Promise<void> {
  const dest = path.resolve(expandTilde(destDir))
  for (const src of srcs) {
    const srcParent = path.dirname(src)
    if (srcParent === dest) {
      throw new Error(`Cannot move into the source folder itself: ${src}`)
    }
    // Reject if dest is inside src (would move folder into its own subtree)
    const relative = path.relative(src, dest)
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      throw new Error(`Cannot move into a subdirectory or ancestor of source: ${src}`)
    }
    const baseName = path.basename(src)
    const finalName = await resolveDuplicateName(baseName, dest)
    await fs.rename(src, path.join(dest, finalName))
  }
}
```

- [ ] **Step 4: Run tests; confirm pass**

Run: `npx vitest run tests/electron/fileSystem.test.ts`
Expected: 20 + 11 = 31 passing.

- [ ] **Step 5: Commit**

```bash
git add electron/services/fileSystem.ts tests/electron/fileSystem.test.ts
git commit -m "feat(files): add copyMany, moveMany, resolveDuplicateName to fileSystem service"
```

---

## Task 6: zipService — spawn ditto

**Files:**
- Create: `electron/services/zipService.ts`
- Test: `tests/electron/zipService.test.ts`

Wraps `ditto -c -k --sequesterRsrc` for macOS-native zip creation. Tests are platform-gated (`skipIf(platform !== 'darwin')`).

- [ ] **Step 1: Write the failing tests**

Create `tests/electron/zipService.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { zipPaths } from '../../electron/services/zipService'

const isDarwin = process.platform === 'darwin'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dashmac-zip-test-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe.skipIf(!isDarwin)('zipPaths (macOS only)', () => {
  test('zips a single file as <name>.zip', async () => {
    const f = path.join(tmp, 'a.txt')
    fs.writeFileSync(f, 'hello')
    const out = await zipPaths([f], tmp)
    expect(out).toBe(path.join(tmp, 'a.txt.zip'))
    expect(fs.existsSync(out)).toBe(true)
    // Verify by unzipping (requires unzip in PATH; macOS has it)
    const dest = path.join(tmp, 'unzipped'); fs.mkdirSync(dest)
    spawnSync('unzip', [out, '-d', dest])
    expect(fs.readFileSync(path.join(dest, 'a.txt'), 'utf8')).toBe('hello')
  })

  test('zips multiple files as Archive.zip', async () => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'A')
    fs.writeFileSync(path.join(tmp, 'b.txt'), 'B')
    const out = await zipPaths(
      [path.join(tmp, 'a.txt'), path.join(tmp, 'b.txt')],
      tmp,
    )
    expect(out).toBe(path.join(tmp, 'Archive.zip'))
    expect(fs.existsSync(out)).toBe(true)
  })

  test('zips a directory recursively', async () => {
    const d = path.join(tmp, 'mydir'); fs.mkdirSync(d)
    fs.writeFileSync(path.join(d, 'inner.txt'), 'x')
    const out = await zipPaths([d], tmp)
    expect(out).toBe(path.join(tmp, 'mydir.zip'))
    const dest = path.join(tmp, 'unzipped'); fs.mkdirSync(dest)
    spawnSync('unzip', [out, '-d', dest])
    expect(fs.readFileSync(path.join(dest, 'mydir', 'inner.txt'), 'utf8')).toBe('x')
  })

  test('appends "(copy)" suffix when output name already exists', async () => {
    const f = path.join(tmp, 'a.txt')
    fs.writeFileSync(f, 'hello')
    fs.writeFileSync(path.join(tmp, 'a.txt.zip'), 'pre-existing')
    const out = await zipPaths([f], tmp)
    expect(out).toBe(path.join(tmp, 'a.txt (copy).zip'))
  })
})
```

- [ ] **Step 2: Run; confirm failure (or skip on non-darwin)**

Run: `npx vitest run tests/electron/zipService.test.ts`
Expected on macOS: failures (module not found). Expected on Linux: 0 ran (all skipped).

- [ ] **Step 3: Implement**

Create `electron/services/zipService.ts`:

```ts
import { spawn } from 'child_process'
import * as path from 'path'
import { resolveDuplicateName } from './fileSystem'

export async function zipPaths(srcs: string[], destDir: string): Promise<string> {
  if (srcs.length === 0) throw new Error('No sources to zip')

  const baseName = srcs.length === 1 ? `${path.basename(srcs[0])}.zip` : 'Archive.zip'
  const finalName = await resolveDuplicateName(baseName, destDir)
  const outPath = path.join(destDir, finalName)

  return new Promise<string>((resolve, reject) => {
    const args = ['-c', '-k', '--sequesterRsrc', '--', ...srcs, outPath]
    const child = spawn('ditto', args)
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('close', (code) => {
      if (code === 0) resolve(outPath)
      else reject(new Error(`ditto exited with code ${code}: ${stderr.trim()}`))
    })
    child.on('error', reject)
  })
}
```

- [ ] **Step 4: Run tests on macOS; pass**

Run: `npx vitest run tests/electron/zipService.test.ts`
Expected on macOS: 4 passing. On Linux: 0 ran (skipped).

- [ ] **Step 5: Commit**

```bash
git add electron/services/zipService.ts tests/electron/zipService.test.ts
git commit -m "feat(files): add zipService using macOS ditto"
```

---

## Task 7: clipboard service

**Files:**
- Create: `electron/services/clipboard.ts`
- Test: `tests/electron/clipboard.test.ts`

In-memory module state. Three functions: `setClip`, `getClip`, `clearClip`.

- [ ] **Step 1: Write the failing tests**

Create `tests/electron/clipboard.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'vitest'
import { setClip, getClip, clearClip } from '../../electron/services/clipboard'

beforeEach(() => { clearClip() })

describe('clipboard', () => {
  test('initial state is null', () => {
    expect(getClip()).toBeNull()
  })

  test('setClip with copy persists state', () => {
    setClip(['/a', '/b'], 'copy')
    expect(getClip()).toEqual({ paths: ['/a', '/b'], op: 'copy' })
  })

  test('setClip with cut persists state', () => {
    setClip(['/a'], 'cut')
    expect(getClip()).toEqual({ paths: ['/a'], op: 'cut' })
  })

  test('clearClip resets to null', () => {
    setClip(['/a'], 'copy')
    clearClip()
    expect(getClip()).toBeNull()
  })

  test('setClip overwrites previous state', () => {
    setClip(['/a'], 'copy')
    setClip(['/b'], 'cut')
    expect(getClip()).toEqual({ paths: ['/b'], op: 'cut' })
  })
})
```

- [ ] **Step 2: Run; confirm failure**

Run: `npx vitest run tests/electron/clipboard.test.ts`
Expected: failure.

- [ ] **Step 3: Implement**

Create `electron/services/clipboard.ts`:

```ts
export type ClipOp = 'copy' | 'cut'
export type Clipboard = { paths: string[]; op: ClipOp } | null

let state: Clipboard = null

export function setClip(paths: string[], op: ClipOp): void {
  state = { paths: [...paths], op }
}

export function getClip(): Clipboard {
  return state
}

export function clearClip(): void {
  state = null
}
```

- [ ] **Step 4: Run tests; pass**

Run: `npx vitest run tests/electron/clipboard.test.ts`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add electron/services/clipboard.ts tests/electron/clipboard.test.ts
git commit -m "feat(files): add in-memory clipboard service"
```

---

## Task 8: Locale dictionary additions

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh-CN.ts`

Add `pages.files`, `sidebar.files`, and the `files.*` namespace (~50 keys).

- [ ] **Step 1: Update `src/i18n/locales/en.ts`**

Find the `pages` block and add the `files` key. Find the `sidebar` block and add `files`. Then add an entire new top-level `files: { ... }` namespace.

In the `pages` section, change:
```ts
pages: {
  dashboard: 'Dashboard',
  memory: 'Memory Analysis',
  disk: 'Disk Analysis',
  network: 'Network Analysis',
  settings: 'Settings',
},
```
to:
```ts
pages: {
  dashboard: 'Dashboard',
  memory: 'Memory Analysis',
  disk: 'Disk Analysis',
  network: 'Network Analysis',
  files: 'Files',
  settings: 'Settings',
},
```

In the `sidebar` section, change:
```ts
sidebar: {
  dashboard: 'Dashboard',
  memory: 'Memory',
  disk: 'Disk',
  network: 'Network',
  settings: 'Settings',
},
```
to:
```ts
sidebar: {
  dashboard: 'Dashboard',
  memory: 'Memory',
  disk: 'Disk',
  network: 'Network',
  files: 'Files',
  settings: 'Settings',
},
```

Add this entire new top-level namespace inside the default-exported object (e.g., right before `tray: { ... }`):

```ts
files: {
  sidebar: {
    shortcuts: 'Shortcuts',
    system: 'System',
    root: 'Root',
    home: 'Home',
    add: 'Add current folder',
    addDisabled: 'Already in shortcuts',
    removeFromShortcuts: 'Remove from shortcuts',
  },
  toolbar: {
    back: 'Back',
    forward: 'Forward',
    up: 'Up',
    refresh: 'Refresh',
    toggleHidden: 'Show hidden files',
  },
  list: {
    columns: { name: 'Name', size: 'Size', modified: 'Modified', type: 'Type' },
    empty: 'Empty folder',
  },
  type: {
    folder: 'Folder',
    text: 'Text',
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    archive: 'Archive',
    pdf: 'PDF document',
    app: 'Application',
    code: 'Source code',
    unknown: '{ext} file',
  },
  contextMenu: {
    open: 'Open',
    rename: 'Rename',
    copy: 'Copy',
    cut: 'Cut',
    trash: 'Move to Trash',
    zip: 'Compress to ZIP',
    revealInFinder: 'Show in Finder',
    newFolder: 'New Folder',
    newFile: 'New File',
    paste: 'Paste',
  },
  defaults: {
    untitledFolder: 'Untitled folder',
    untitledFile: 'untitled',
    zipDefaultName: 'Archive',
  },
  error: {
    notFound: 'Folder not found',
    permission: 'No permission to access this folder. Grant DashMac Full Disk Access in System Settings → Privacy & Security.',
    notADirectory: 'Not a directory',
    generic: 'Error: {message}',
    invalidName: 'Name cannot contain "/" or be empty',
    nameExists: 'A file with this name already exists',
    pasteIntoSelf: 'Cannot paste into source folder',
    operationFailed: '{count} operation(s) failed',
    retry: 'Retry',
  },
  toast: {
    addedShortcut: 'Added to shortcuts',
    shortcutExists: 'Already in shortcuts',
    shortcutRemovedDeleted: 'Folder no longer exists, removed from shortcuts',
  },
},
```

- [ ] **Step 2: Update `src/i18n/locales/zh-CN.ts`**

Mirror the same structure with Chinese translations. Apply the same `pages.files` → `'文件'` and `sidebar.files` → `'文件'` additions, and add the matching `files: { ... }` namespace:

```ts
files: {
  sidebar: {
    shortcuts: '快捷目录',
    system: '系统',
    root: '根目录',
    home: '主目录',
    add: '将当前目录加入快捷栏',
    addDisabled: '已在快捷栏中',
    removeFromShortcuts: '从快捷栏移除',
  },
  toolbar: {
    back: '后退',
    forward: '前进',
    up: '上一级',
    refresh: '刷新',
    toggleHidden: '显示隐藏文件',
  },
  list: {
    columns: { name: '名称', size: '大小', modified: '修改时间', type: '类型' },
    empty: '空文件夹',
  },
  type: {
    folder: '文件夹',
    text: '文本',
    image: '图片',
    video: '视频',
    audio: '音频',
    archive: '压缩文件',
    pdf: 'PDF 文档',
    app: '应用程序',
    code: '源代码',
    unknown: '{ext} 文件',
  },
  contextMenu: {
    open: '打开',
    rename: '重命名',
    copy: '复制',
    cut: '剪切',
    trash: '移到废纸篓',
    zip: '压缩为 ZIP',
    revealInFinder: '在 Finder 中显示',
    newFolder: '新建文件夹',
    newFile: '新建文件',
    paste: '粘贴',
  },
  defaults: {
    untitledFolder: '未命名文件夹',
    untitledFile: '未命名',
    zipDefaultName: '压缩包',
  },
  error: {
    notFound: '文件夹不存在',
    permission: '无权访问该文件夹。请在 系统设置 → 隐私与安全性 → 完全磁盘访问 中授权 DashMac。',
    notADirectory: '不是文件夹',
    generic: '错误：{message}',
    invalidName: '名称不能为空，且不能包含 "/"',
    nameExists: '已存在同名文件',
    pasteIntoSelf: '不能粘贴到源文件夹',
    operationFailed: '{count} 个操作失败',
    retry: '重试',
  },
  toast: {
    addedShortcut: '已加入快捷栏',
    shortcutExists: '已在快捷栏中',
    shortcutRemovedDeleted: '文件夹不存在，已从快捷栏移除',
  },
},
```

- [ ] **Step 3: Run shape parity test**

Run: `npx vitest run tests/electron/i18n-shape.test.ts`
Expected: 2 passing (renderer en/zh-CN parity + main en/zh-CN parity).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "i18n/locales" || echo "no errors in locales"`
Expected: `no errors in locales`.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/zh-CN.ts
git commit -m "feat(i18n): add files namespace and pages.files / sidebar.files keys"
```

---

## Task 9: settingsStore DEFAULTS extension

**Files:**
- Modify: `electron/services/settingsStore.ts`
- Modify: `tests/electron/settingsStore.test.ts`

Add `fileShortcuts: []` and `showHiddenFiles: false` to DEFAULTS, plus a test asserting both.

- [ ] **Step 1: Update DEFAULTS**

In `electron/services/settingsStore.ts`, change:

```ts
export const DEFAULTS: AppSettings = {
  realtimeInterval: 2000,
  historyInterval: 60000,
  retentionDays: 90,
  trayDisplayMetric: 'memory',
  launchAtLogin: false,
  language: 'auto',
  resolvedLanguage: 'en',
}
```

to:

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
}
```

- [ ] **Step 2: Add test**

Append to `tests/electron/settingsStore.test.ts` inside the existing `describe('settingsStore', ...)`:

```ts
  test('DEFAULTS includes empty fileShortcuts and showHiddenFiles=false', () => {
    expect(DEFAULTS.fileShortcuts).toEqual([])
    expect(DEFAULTS.showHiddenFiles).toBe(false)
  })

  test('round-trip preserves fileShortcuts', () => {
    const f = tmpFile()
    created.push(f)
    const next = { ...DEFAULTS, fileShortcuts: ['/Users/foo', '/Users/bar'] }
    saveSettings(next, f)
    expect(loadSettings(f)).toEqual(next)
  })
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/electron/settingsStore.test.ts`
Expected: 8 passing (6 existing + 2 new).

- [ ] **Step 4: Commit**

```bash
git add electron/services/settingsStore.ts tests/electron/settingsStore.test.ts
git commit -m "feat(files): extend settingsStore DEFAULTS with fileShortcuts and showHiddenFiles"
```

---

## Task 10: main.ts IPC handlers

**Files:**
- Modify: `electron/main.ts`

Register 9 mutating IPC handlers + the `'fs:dir-changed'` push channel. Auto-broadcast after every successful mutation.

- [ ] **Step 1: Add imports**

Near the top of `electron/main.ts`, add the file-browser service imports:

```ts
import {
  listDirectory, mkdir as fsMkdir, createFile as fsCreateFile,
  rename as fsRename, copyMany, moveMany,
} from './services/fileSystem'
import { zipPaths } from './services/zipService'
```

The existing electron import (`import { app, BrowserWindow, ipcMain, shell, Tray, nativeImage, Menu } from 'electron'`) already has `shell` — no change needed there. The existing `import path from 'path'` is also already present.

Note: the renderer-side `filesStore` owns clipboard state in v1 (see spec §Operations); we do not import or expose `clipboard.ts` from main.ts. The clipboard service exists for future cross-window sync but is not wired in this version.

- [ ] **Step 2: Add the 9 IPC handlers in `registerIpcHandlers`**

Inside `registerIpcHandlers()`, after the existing handlers:

```ts
  // --- File browser handlers ---

  ipcMain.handle('fs:list', async (_e, p: string) => {
    try {
      const entries = await listDirectory(p)
      return { ok: true as const, entries }
    } catch (err: any) {
      return { ok: false as const, errno: err?.code ?? 'EUNKNOWN', message: String(err?.message ?? err) }
    }
  })

  ipcMain.handle('fs:create-folder', async (_e, parent: string, name: string) => {
    try {
      const created = await fsMkdir(parent, name)
      sendToAllWindows('fs:dir-changed', parent)
      return { ok: true as const, path: created }
    } catch (err: any) {
      return { ok: false as const, message: String(err?.message ?? err) }
    }
  })

  ipcMain.handle('fs:create-file', async (_e, parent: string, name: string) => {
    try {
      const created = await fsCreateFile(parent, name)
      sendToAllWindows('fs:dir-changed', parent)
      return { ok: true as const, path: created }
    } catch (err: any) {
      return { ok: false as const, message: String(err?.message ?? err) }
    }
  })

  ipcMain.handle('fs:rename', async (_e, oldPath: string, newName: string) => {
    try {
      const newPath = await fsRename(oldPath, newName)
      sendToAllWindows('fs:dir-changed', path.dirname(oldPath))
      return { ok: true as const, path: newPath }
    } catch (err: any) {
      return { ok: false as const, message: String(err?.message ?? err) }
    }
  })

  ipcMain.handle('fs:trash', async (_e, paths: string[]) => {
    const failed: string[] = []
    const dirs = new Set<string>()
    for (const p of paths) {
      try {
        await shell.trashItem(p)
        dirs.add(path.dirname(p))
      } catch {
        failed.push(p)
      }
    }
    for (const d of dirs) sendToAllWindows('fs:dir-changed', d)
    if (failed.length === 0) return { ok: true as const }
    return { ok: false as const, failed, message: `${failed.length} item(s) failed` }
  })

  ipcMain.handle('fs:copy', async (_e, srcs: string[], destDir: string) => {
    try {
      await copyMany(srcs, destDir)
      sendToAllWindows('fs:dir-changed', destDir)
      return { ok: true as const }
    } catch (err: any) {
      return { ok: false as const, failed: srcs, message: String(err?.message ?? err) }
    }
  })

  ipcMain.handle('fs:move', async (_e, srcs: string[], destDir: string) => {
    try {
      const sourceDirs = new Set(srcs.map((s) => path.dirname(s)))
      await moveMany(srcs, destDir)
      sendToAllWindows('fs:dir-changed', destDir)
      for (const d of sourceDirs) sendToAllWindows('fs:dir-changed', d)
      return { ok: true as const }
    } catch (err: any) {
      return { ok: false as const, failed: srcs, message: String(err?.message ?? err) }
    }
  })

  ipcMain.handle('fs:zip', async (_e, srcs: string[], destDir: string) => {
    try {
      const out = await zipPaths(srcs, destDir)
      sendToAllWindows('fs:dir-changed', destDir)
      return { ok: true as const, path: out }
    } catch (err: any) {
      return { ok: false as const, message: String(err?.message ?? err) }
    }
  })

  ipcMain.handle('fs:open', async (_e, p: string) => {
    const result = await shell.openPath(p)
    if (result === '') return { ok: true as const }
    return { ok: false as const, message: result }
  })
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat(files): register 9 file-browser IPC handlers with auto-refresh broadcasts"
```

---

## Task 11: preload.ts bridge

**Files:**
- Modify: `electron/preload.ts`

Expose 10 new methods on `window.api`. Pattern matches existing IPC methods.

- [ ] **Step 1: Read current preload structure**

Run: `cat electron/preload.ts`

Note the existing patterns:
- `invoke` for request/response (e.g., `getSettings: () => ipcRenderer.invoke('get:settings')`)
- `on` + return `unsubscribe` for push channels (e.g., `onLangChanged`)
- `send` for fire-and-forget (e.g., `revealFile`)

- [ ] **Step 2: Add the 10 methods**

Inside the `contextBridge.exposeInMainWorld('api', { ... })` object, add:

```ts
  listDirectory: (p: string) => ipcRenderer.invoke('fs:list', p),
  fsCreateFolder: (parent: string, name: string) => ipcRenderer.invoke('fs:create-folder', parent, name),
  fsCreateFile: (parent: string, name: string) => ipcRenderer.invoke('fs:create-file', parent, name),
  fsRename: (oldPath: string, newName: string) => ipcRenderer.invoke('fs:rename', oldPath, newName),
  fsTrash: (paths: string[]) => ipcRenderer.invoke('fs:trash', paths),
  fsCopy: (paths: string[], destDir: string) => ipcRenderer.invoke('fs:copy', paths, destDir),
  fsMove: (paths: string[], destDir: string) => ipcRenderer.invoke('fs:move', paths, destDir),
  fsZip: (paths: string[], destDir: string) => ipcRenderer.invoke('fs:zip', paths, destDir),
  fsOpen: (p: string) => ipcRenderer.invoke('fs:open', p),
  onDirChanged: (callback: (path: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, p: string) => callback(p)
    ipcRenderer.on('fs:dir-changed', listener)
    return () => ipcRenderer.removeListener('fs:dir-changed', listener)
  },
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: success — `DashMacAPI` was extended in Task 2, so the new bridge methods now satisfy the contract.

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts
git commit -m "feat(files): expose 10 file-browser methods via preload bridge"
```

---

## Task 12: Toast system

**Files:**
- Create: `src/stores/toastStore.ts`
- Create: `src/components/common/Toast.tsx`

A Zustand store for the queue plus a root component mounted once in `App.tsx` (Task 14 mounts it). `useToast()` hook returns success/error/info functions.

- [ ] **Step 1: Implement the store**

Create `src/stores/toastStore.ts`:

```ts
import { create } from 'zustand'

export type ToastLevel = 'success' | 'error' | 'info'
export interface Toast {
  id: string
  level: ToastLevel
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (level: ToastLevel, message: string) => void
  dismiss: (id: string) => void
}

const MAX = 3

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (level, message) =>
    set((s) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const next = [...s.toasts, { id, level, message }]
      return { toasts: next.length > MAX ? next.slice(-MAX) : next }
    }),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function useToast() {
  const push = useToastStore((s) => s.push)
  return {
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
    info: (message: string) => push('info', message),
  }
}
```

- [ ] **Step 2: Implement the component**

Create `src/components/common/Toast.tsx`:

```tsx
import { useEffect } from 'react'
import { useToastStore, type Toast as ToastT } from '../../stores/toastStore'

const COLORS: Record<ToastT['level'], string> = {
  success: 'bg-status-green',
  error: 'bg-status-red',
  info: 'bg-status-blue',
}

const AUTO_DISMISS_MS = 4000

export default function ToastRoot() {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}

function ToastItem({ toast }: { toast: ToastT }) {
  const dismiss = useToastStore((s) => s.dismiss)
  useEffect(() => {
    const id = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS)
    return () => clearTimeout(id)
  }, [toast.id, dismiss])

  return (
    <div
      onClick={() => dismiss(toast.id)}
      className={`${COLORS[toast.level]} text-white text-xs font-mono px-3 py-2 rounded shadow-lg cursor-pointer pointer-events-auto max-w-xs`}
    >
      {toast.message}
    </div>
  )
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/stores/toastStore.ts src/components/common/Toast.tsx
git commit -m "feat(files): add shared Toast component and toastStore"
```

---

## Task 13: filesStore — page state and actions

**Files:**
- Create: `src/stores/filesStore.ts`

Zustand store holding navigation, selection, sort, and clipboard state for the Files page. Also wires the IPC dir-change listener.

- [ ] **Step 1: Implement**

Create `src/stores/filesStore.ts`:

```ts
import { create } from 'zustand'
import type { DirEntry } from '../types'

export type SortColumn = 'name' | 'size' | 'modified' | 'type'
export type SortDir = 'asc' | 'desc'

export type FileClipboard = { paths: string[]; op: 'copy' | 'cut' } | null

interface FilesState {
  currentPath: string
  entries: DirEntry[]
  selection: Set<string>
  selectionAnchor: string | null
  sort: { column: SortColumn; dir: SortDir }
  clipboard: FileClipboard
  history: { back: string[]; forward: string[] }
  showHidden: boolean
  dirError: string | null
  loading: boolean

  navigate: (path: string) => Promise<void>
  goBack: () => Promise<void>
  goForward: () => Promise<void>
  goUp: () => Promise<void>
  refresh: () => Promise<void>
  setSelection: (sel: Set<string>, anchor?: string | null) => void
  toggleSelect: (path: string) => void
  rangeSelect: (path: string) => void
  selectAll: () => void
  clearSelection: () => void
  setSort: (column: SortColumn) => void
  setClipboard: (clip: FileClipboard) => void
  setShowHidden: (v: boolean) => void
}

const HOME_FALLBACK = '/'

export const useFilesStore = create<FilesState>((set, get) => ({
  currentPath: HOME_FALLBACK,
  entries: [],
  selection: new Set(),
  selectionAnchor: null,
  sort: { column: 'name', dir: 'asc' },
  clipboard: null,
  history: { back: [], forward: [] },
  showHidden: false,
  dirError: null,
  loading: false,

  navigate: async (target: string) => {
    set({ loading: true })
    const result = await window.api.listDirectory(target)
    const prev = get().currentPath
    if (result.ok) {
      set((s) => ({
        currentPath: target,
        entries: result.entries,
        selection: new Set(),
        selectionAnchor: null,
        sort: { column: 'name', dir: 'asc' },
        history: target === prev
          ? s.history
          : { back: [...s.history.back, prev], forward: [] },
        dirError: null,
        loading: false,
      }))
    } else {
      const errno = result.errno
      let msgKey: string
      if (errno === 'ENOENT') msgKey = 'files.error.notFound'
      else if (errno === 'EACCES' || errno === 'EPERM') msgKey = 'files.error.permission'
      else if (errno === 'ENOTDIR') msgKey = 'files.error.notADirectory'
      else msgKey = 'files.error.generic'
      set((s) => ({
        currentPath: target,
        entries: [],
        selection: new Set(),
        history: target === prev
          ? s.history
          : { back: [...s.history.back, prev], forward: [] },
        dirError: msgKey,
        loading: false,
      }))
    }
  },

  goBack: async () => {
    const { history, currentPath, navigate } = get()
    if (history.back.length === 0) return
    const target = history.back[history.back.length - 1]
    set({ history: {
      back: history.back.slice(0, -1),
      forward: [...history.forward, currentPath],
    }})
    // Re-list without pushing to back (we manually managed it above).
    const result = await window.api.listDirectory(target)
    if (result.ok) {
      set({ currentPath: target, entries: result.entries, selection: new Set(), dirError: null })
    } else {
      // Fall back to full navigate semantics on error
      await navigate(target)
    }
  },

  goForward: async () => {
    const { history, currentPath } = get()
    if (history.forward.length === 0) return
    const target = history.forward[history.forward.length - 1]
    set({ history: {
      back: [...history.back, currentPath],
      forward: history.forward.slice(0, -1),
    }})
    const result = await window.api.listDirectory(target)
    if (result.ok) {
      set({ currentPath: target, entries: result.entries, selection: new Set(), dirError: null })
    }
  },

  goUp: async () => {
    const { currentPath, navigate } = get()
    if (currentPath === '/') return
    const parent = currentPath.replace(/\/[^/]+\/?$/, '') || '/'
    await navigate(parent)
  },

  refresh: async () => {
    const result = await window.api.listDirectory(get().currentPath)
    if (result.ok) {
      set({ entries: result.entries, dirError: null })
    } else {
      set({ entries: [] })
    }
  },

  setSelection: (sel, anchor) => set({ selection: sel, ...(anchor !== undefined ? { selectionAnchor: anchor } : {}) }),

  toggleSelect: (path) => {
    const { selection } = get()
    const next = new Set(selection)
    if (next.has(path)) next.delete(path); else next.add(path)
    set({ selection: next, selectionAnchor: path })
  },

  rangeSelect: (path) => {
    const { selection, selectionAnchor, entries } = get()
    if (!selectionAnchor) {
      set({ selection: new Set([path]), selectionAnchor: path })
      return
    }
    const idxA = entries.findIndex((e) => e.path === selectionAnchor)
    const idxB = entries.findIndex((e) => e.path === path)
    if (idxA < 0 || idxB < 0) return
    const [lo, hi] = idxA < idxB ? [idxA, idxB] : [idxB, idxA]
    const next = new Set(selection)
    for (let i = lo; i <= hi; i++) next.add(entries[i].path)
    set({ selection: next })
  },

  selectAll: () => {
    const { entries } = get()
    set({ selection: new Set(entries.map((e) => e.path)), selectionAnchor: null })
  },

  clearSelection: () => set({ selection: new Set(), selectionAnchor: null }),

  setSort: (column) => {
    const { sort } = get()
    if (sort.column === column) {
      set({ sort: { column, dir: sort.dir === 'asc' ? 'desc' : 'asc' } })
    } else {
      set({ sort: { column, dir: 'asc' } })
    }
  },

  setClipboard: (clip) => set({ clipboard: clip }),

  setShowHidden: (v) => set({ showHidden: v }),
}))

// Wire IPC listener exactly once at module load.
window.api.onDirChanged((p) => {
  const { currentPath, refresh } = useFilesStore.getState()
  if (p === currentPath) refresh()
})
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/stores/filesStore.ts
git commit -m "feat(files): add filesStore with navigation, selection, sort, clipboard"
```

---

## Task 14: Wire 'files' page entry — Sidebar, App, Toast mount

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

Add `'files'` to the page system, mount `<ToastRoot />` once at the app root, and create a placeholder `FilesPage` (full impl in Task 15+).

- [ ] **Step 1: Create placeholder FilesPage**

Create `src/components/files/FilesPage.tsx` (placeholder for now; replaced in Task 15):

```tsx
export default function FilesPage() {
  return <div className="text-text-muted font-mono text-sm">Files page placeholder</div>
}
```

- [ ] **Step 2: Update `src/App.tsx`**

Find the `Page` type:

```ts
type Page = 'dashboard' | 'memory' | 'disk' | 'network' | 'settings'
```

Replace with:

```ts
type Page = 'dashboard' | 'memory' | 'disk' | 'network' | 'files' | 'settings'
```

Find `PageContent`:

```tsx
function PageContent({ page }: { page: Page }) {
  switch (page) {
    case 'dashboard': return <Overview />
    case 'memory': return <MemoryOverview />
    case 'disk': return <DiskOverview />
    case 'network': return <NetworkOverview />
    case 'settings': return <Settings />
  }
}
```

Add the `files` case and import `FilesPage`:

```tsx
import FilesPage from './components/files/FilesPage'
// ... rest of imports

function PageContent({ page }: { page: Page }) {
  switch (page) {
    case 'dashboard': return <Overview />
    case 'memory': return <MemoryOverview />
    case 'disk': return <DiskOverview />
    case 'network': return <NetworkOverview />
    case 'files': return <FilesPage />
    case 'settings': return <Settings />
  }
}
```

Mount the toast root once near the top of the app. Find the `MainApp` return (the one that renders `<Sidebar>` + `<Header>` + `<main>`) and wrap it OR add `<ToastRoot />` as a sibling. Both `MainApp` and `TrayApp` should have the toast available.

Add the import:
```tsx
import ToastRoot from './components/common/Toast'
```

In the top-level `App` component (the one that does `if (isTray) return <TrayApp />`), change to render the toast in both branches:

```tsx
export default function App() {
  const isTray = window.location.hash === '#/tray'
  return (
    <>
      {isTray ? <TrayApp /> : <MainApp />}
      <ToastRoot />
    </>
  )
}
```

- [ ] **Step 3: Update `src/components/layout/Sidebar.tsx`**

Update the `Page` type alias and the two constants. Find:

```tsx
type Page = 'dashboard' | 'memory' | 'disk' | 'network' | 'settings'
// ...
const NAV_ICONS: Record<Page, string> = { ... }
const NAV_ORDER: Page[] = ['dashboard', 'memory', 'disk', 'network', 'settings']
```

Update `Page` type to include `'files'`, add the icon, and insert `'files'` into NAV_ORDER (between `network` and `settings`):

```tsx
type Page = 'dashboard' | 'memory' | 'disk' | 'network' | 'files' | 'settings'

const NAV_ICONS: Record<Page, string> = {
  dashboard: '⊞',
  memory: '☰',
  disk: '◉',
  network: '⇅',
  files: '📁',
  settings: '⚙',
}

const NAV_ORDER: Page[] = ['dashboard', 'memory', 'disk', 'network', 'files', 'settings']
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/layout/Sidebar.tsx src/components/files/FilesPage.tsx
git commit -m "feat(files): wire Files page into navigation; mount Toast at app root"
```

---

## Task 15: FilesPage layout + FileSidebar

**Files:**
- Modify: `src/components/files/FilesPage.tsx`
- Create: `src/components/files/FileSidebar.tsx`

Two-pane layout. Left pane shows shortcuts (from `AppSettings.fileShortcuts`), system roots (`/` and `~`), and an "Add current folder" button. Initial `currentPath` = home directory (`~` resolved by main).

- [ ] **Step 1: Implement FileSidebar**

Create `src/components/files/FileSidebar.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { AppSettings } from '../../types'
import { useTranslation } from '../../i18n/index'
import { useFilesStore } from '../../stores/filesStore'
import { useToast } from '../../stores/toastStore'

export default function FileSidebar() {
  const { t } = useTranslation()
  const toast = useToast()
  const currentPath = useFilesStore((s) => s.currentPath)
  const navigate = useFilesStore((s) => s.navigate)
  const [shortcuts, setShortcuts] = useState<string[]>([])

  useEffect(() => {
    window.api.getSettings().then((s) => setShortcuts(s.fileShortcuts ?? []))
  }, [])

  const refreshShortcuts = async () => {
    const s = await window.api.getSettings()
    setShortcuts(s.fileShortcuts ?? [])
  }

  const addCurrent = async () => {
    const settings = await window.api.getSettings()
    if ((settings.fileShortcuts ?? []).includes(currentPath)) {
      toast.info(t('files.toast.shortcutExists'))
      return
    }
    const next = [...(settings.fileShortcuts ?? []), currentPath]
    await window.api.saveSettings({ ...settings, fileShortcuts: next })
    setShortcuts(next)
    toast.success(t('files.toast.addedShortcut'))
  }

  const removeShortcut = async (p: string) => {
    const settings = await window.api.getSettings()
    const next = (settings.fileShortcuts ?? []).filter((s) => s !== p)
    await window.api.saveSettings({ ...settings, fileShortcuts: next })
    setShortcuts(next)
  }

  const handleClickShortcut = async (p: string) => {
    const r = await window.api.listDirectory(p)
    if (r.ok) {
      navigate(p)
    } else if (r.errno === 'ENOENT') {
      removeShortcut(p)
      toast.error(t('files.toast.shortcutRemovedDeleted'))
    } else {
      navigate(p)  // let navigate set the error overlay
    }
  }

  const addDisabled = currentPath === '/' || shortcuts.includes(currentPath)

  return (
    <aside className="w-48 h-full bg-bg-secondary border-r border-border-primary flex flex-col text-xs font-mono">
      <div className="px-3 py-2 text-text-muted uppercase tracking-wider">{t('files.sidebar.shortcuts')}</div>
      <div className="flex-1 overflow-y-auto">
        {shortcuts.map((p) => (
          <button
            key={p}
            onClick={() => handleClickShortcut(p)}
            onContextMenu={(e) => { e.preventDefault(); removeShortcut(p) }}
            className={`block w-full text-left px-3 py-1.5 hover:bg-bg-tertiary truncate ${
              currentPath === p ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary'
            }`}
            title={p}
          >
            📁 {p.split('/').pop() || p}
          </button>
        ))}
        <div className="border-t border-border-secondary my-2" />
        <div className="px-3 py-1 text-text-muted uppercase tracking-wider">{t('files.sidebar.system')}</div>
        <button
          onClick={() => handleClickShortcut('/')}
          className={`block w-full text-left px-3 py-1.5 hover:bg-bg-tertiary ${
            currentPath === '/' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary'
          }`}
        >
          / {t('files.sidebar.root')}
        </button>
        <button
          onClick={() => handleClickShortcut('~')}
          className="block w-full text-left px-3 py-1.5 hover:bg-bg-tertiary text-text-secondary"
        >
          ~ {t('files.sidebar.home')}
        </button>
      </div>
      <button
        onClick={addCurrent}
        disabled={addDisabled}
        title={addDisabled ? t('files.sidebar.addDisabled') : t('files.sidebar.add')}
        className="px-3 py-2 border-t border-border-primary text-text-secondary hover:bg-bg-tertiary disabled:opacity-50 disabled:hover:bg-transparent"
      >
        + {t('files.sidebar.add')}
      </button>
    </aside>
  )
}
```

- [ ] **Step 2: Update FilesPage to render the layout**

Replace `src/components/files/FilesPage.tsx` content with:

```tsx
import { useEffect } from 'react'
import { useFilesStore } from '../../stores/filesStore'
import FileSidebar from './FileSidebar'

export default function FilesPage() {
  const navigate = useFilesStore((s) => s.navigate)

  useEffect(() => {
    // Initial navigation to home on first mount
    navigate('~')
  }, [navigate])

  return (
    <div className="flex h-full -m-4">
      <FileSidebar />
      <div className="flex-1 flex flex-col">
        <div className="text-text-muted font-mono text-sm p-4">
          (PathBar + FileList in next tasks)
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build and run dev to smoke-check**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/files/FilesPage.tsx src/components/files/FileSidebar.tsx
git commit -m "feat(files): add FilesPage two-pane layout and FileSidebar"
```

---

## Task 16: PathBar — toolbar with editable input

**Files:**
- Create: `src/components/files/PathBar.tsx`
- Modify: `src/components/files/FilesPage.tsx`

- [ ] **Step 1: Implement PathBar**

Create `src/components/files/PathBar.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from '../../i18n/index'
import { useFilesStore } from '../../stores/filesStore'
import { useToast } from '../../stores/toastStore'

export default function PathBar() {
  const { t } = useTranslation()
  const toast = useToast()
  const currentPath = useFilesStore((s) => s.currentPath)
  const history = useFilesStore((s) => s.history)
  const showHidden = useFilesStore((s) => s.showHidden)
  const navigate = useFilesStore((s) => s.navigate)
  const goBack = useFilesStore((s) => s.goBack)
  const goForward = useFilesStore((s) => s.goForward)
  const goUp = useFilesStore((s) => s.goUp)
  const refresh = useFilesStore((s) => s.refresh)
  const setShowHidden = useFilesStore((s) => s.setShowHidden)

  const [draft, setDraft] = useState(currentPath)
  const [errorFlash, setErrorFlash] = useState(false)

  useEffect(() => { setDraft(currentPath) }, [currentPath])

  // Initialize hidden setting from persisted settings
  useEffect(() => {
    window.api.getSettings().then((s) => setShowHidden(s.showHiddenFiles ?? false))
  }, [setShowHidden])

  const handleSubmit = async () => {
    const target = draft.trim()
    if (!target) return
    const result = await window.api.listDirectory(target)
    if (result.ok) {
      navigate(target)
    } else {
      setErrorFlash(true)
      setTimeout(() => setErrorFlash(false), 1500)
      toast.error(formatError(result.errno, result.message, t))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit()
    else if (e.key === 'Escape') {
      setDraft(currentPath)
      ;(e.target as HTMLInputElement).blur()
    }
  }

  const toggleHidden = async () => {
    const next = !showHidden
    setShowHidden(next)
    const settings = await window.api.getSettings()
    await window.api.saveSettings({ ...settings, showHiddenFiles: next })
  }

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border-primary bg-bg-secondary text-xs font-mono">
      <button onClick={goBack} disabled={history.back.length === 0}
        className="px-2 py-1 text-text-secondary hover:bg-bg-tertiary disabled:opacity-30 rounded"
        title={t('files.toolbar.back')}>‹</button>
      <button onClick={goForward} disabled={history.forward.length === 0}
        className="px-2 py-1 text-text-secondary hover:bg-bg-tertiary disabled:opacity-30 rounded"
        title={t('files.toolbar.forward')}>›</button>
      <button onClick={goUp} disabled={currentPath === '/'}
        className="px-2 py-1 text-text-secondary hover:bg-bg-tertiary disabled:opacity-30 rounded"
        title={t('files.toolbar.up')}>↑</button>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        className={`flex-1 mx-2 bg-bg-primary border ${errorFlash ? 'border-status-red' : 'border-border-primary'} rounded px-2 py-1 text-text-primary`}
      />
      <button onClick={refresh}
        className="px-2 py-1 text-text-secondary hover:bg-bg-tertiary rounded"
        title={t('files.toolbar.refresh')}>⟳</button>
      <button onClick={toggleHidden}
        className={`px-2 py-1 rounded ${showHidden ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary'}`}
        title={t('files.toolbar.toggleHidden')}>👁</button>
    </div>
  )
}

function formatError(errno: string, message: string, t: (k: string, v?: any) => string): string {
  if (errno === 'ENOENT') return t('files.error.notFound')
  if (errno === 'EACCES' || errno === 'EPERM') return t('files.error.permission')
  if (errno === 'ENOTDIR') return t('files.error.notADirectory')
  return t('files.error.generic', { message })
}
```

- [ ] **Step 2: Mount PathBar in FilesPage**

Update `src/components/files/FilesPage.tsx` to:

```tsx
import { useEffect } from 'react'
import { useFilesStore } from '../../stores/filesStore'
import FileSidebar from './FileSidebar'
import PathBar from './PathBar'

export default function FilesPage() {
  const navigate = useFilesStore((s) => s.navigate)

  useEffect(() => { navigate('~') }, [navigate])

  return (
    <div className="flex h-full -m-4">
      <FileSidebar />
      <div className="flex-1 flex flex-col">
        <PathBar />
        <div className="flex-1 text-text-muted font-mono text-sm p-4">
          (FileList in next task)
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/files/PathBar.tsx src/components/files/FilesPage.tsx
git commit -m "feat(files): add PathBar with history nav, edit-jump, and hidden-files toggle"
```

---

## Task 17: FileList — rendering, sorting, selection

**Files:**
- Create: `src/components/files/FileList.tsx`
- Modify: `src/components/files/FilesPage.tsx`

- [ ] **Step 1: Implement FileList**

Create `src/components/files/FileList.tsx`:

```tsx
import { useMemo } from 'react'
import { useTranslation } from '../../i18n/index'
import { useFilesStore, type SortColumn } from '../../stores/filesStore'
import { formatRelativeTime } from '../../i18n/time'
import type { DirEntry } from '../../types'

const EXT_ICON: Record<string, string> = {
  '.zip': '🗜️', '.tar': '🗜️', '.gz': '🗜️', '.bz2': '🗜️', '.7z': '🗜️',
  '.png': '🖼️', '.jpg': '🖼️', '.jpeg': '🖼️', '.gif': '🖼️', '.svg': '🖼️', '.webp': '🖼️',
  '.mp3': '🎵', '.wav': '🎵', '.aac': '🎵', '.flac': '🎵',
  '.mp4': '🎬', '.mov': '🎬', '.mkv': '🎬', '.avi': '🎬',
  '.pdf': '📕',
  '.txt': '📄', '.md': '📄', '.json': '📄', '.ts': '📄', '.tsx': '📄', '.js': '📄', '.py': '📄',
}

const EXT_TYPE: Record<string, string> = {
  '.zip': 'archive', '.tar': 'archive', '.gz': 'archive', '.bz2': 'archive', '.7z': 'archive',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.svg': 'image', '.webp': 'image',
  '.mp3': 'audio', '.wav': 'audio', '.aac': 'audio', '.flac': 'audio',
  '.mp4': 'video', '.mov': 'video', '.mkv': 'video', '.avi': 'video',
  '.pdf': 'pdf',
  '.txt': 'text', '.md': 'text',
  '.app': 'app',
  '.json': 'code', '.ts': 'code', '.tsx': 'code', '.js': 'code', '.py': 'code',
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

interface FileListProps {
  onContextRow: (e: React.MouseEvent, entry: DirEntry) => void
  onContextEmpty: (e: React.MouseEvent) => void
}

export default function FileList({ onContextRow, onContextEmpty }: FileListProps) {
  const { t, lang } = useTranslation()
  const entries = useFilesStore((s) => s.entries)
  const showHidden = useFilesStore((s) => s.showHidden)
  const selection = useFilesStore((s) => s.selection)
  const sort = useFilesStore((s) => s.sort)
  const dirError = useFilesStore((s) => s.dirError)
  const navigate = useFilesStore((s) => s.navigate)
  const refresh = useFilesStore((s) => s.refresh)
  const toggleSelect = useFilesStore((s) => s.toggleSelect)
  const rangeSelect = useFilesStore((s) => s.rangeSelect)
  const selectAll = useFilesStore((s) => s.selectAll)
  const clearSelection = useFilesStore((s) => s.clearSelection)
  const setSelection = useFilesStore((s) => s.setSelection)
  const setSort = useFilesStore((s) => s.setSort)

  const visible = useMemo(() => {
    const filtered = showHidden ? entries : entries.filter((e) => !e.name.startsWith('.'))
    return sortEntries(filtered, sort.column, sort.dir)
  }, [entries, showHidden, sort])

  const handleClick = (e: React.MouseEvent, entry: DirEntry) => {
    if (e.shiftKey) {
      rangeSelect(entry.path)
    } else if (e.metaKey || e.ctrlKey) {
      toggleSelect(entry.path)
    } else {
      setSelection(new Set([entry.path]), entry.path)
    }
  }

  const handleDoubleClick = (entry: DirEntry) => {
    if (entry.isDirectory) navigate(entry.path)
    else window.api.fsOpen(entry.path)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') clearSelection()
    else if ((e.metaKey || e.ctrlKey) && e.key === 'a') { e.preventDefault(); selectAll() }
  }

  if (dirError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-muted font-mono text-sm gap-2">
        <span className="text-status-red text-center max-w-md px-4">{t(dirError)}</span>
        <button onClick={refresh} className="px-3 py-1 text-xs bg-status-blue text-white rounded">{t('files.error.retry')}</button>
      </div>
    )
  }

  if (visible.length === 0) {
    return (
      <div onClick={clearSelection} onContextMenu={onContextEmpty}
        className="flex-1 flex items-center justify-center text-text-muted font-mono text-sm">
        {t('files.list.empty')}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto" tabIndex={0} onKeyDown={handleKeyDown}>
      <table className="w-full text-xs font-mono">
        <thead className="sticky top-0 bg-bg-secondary border-b border-border-primary">
          <tr className="text-text-muted">
            <SortHeader col="name" current={sort} onClick={setSort} label={t('files.list.columns.name')} />
            <SortHeader col="size" current={sort} onClick={setSort} label={t('files.list.columns.size')} align="right" />
            <SortHeader col="modified" current={sort} onClick={setSort} label={t('files.list.columns.modified')} />
            <SortHeader col="type" current={sort} onClick={setSort} label={t('files.list.columns.type')} />
          </tr>
        </thead>
        <tbody>
          {visible.map((e) => (
            <tr
              key={e.path}
              onClick={(ev) => handleClick(ev, e)}
              onDoubleClick={() => handleDoubleClick(e)}
              onContextMenu={(ev) => onContextRow(ev, e)}
              className={`border-b border-border-secondary cursor-default ${
                selection.has(e.path) ? 'bg-status-blue/30 text-text-primary' : 'hover:bg-bg-tertiary text-text-secondary'
              }`}
            >
              <td className="px-3 py-1.5 truncate max-w-[300px]">
                {e.isDirectory ? '📁' : EXT_ICON[e.ext] ?? '📄'} {e.name}
              </td>
              <td className="px-3 py-1.5 text-right">{e.isDirectory ? '--' : formatBytes(e.size)}</td>
              <td className="px-3 py-1.5">{formatRelativeTime(e.modifiedAt, lang)}</td>
              <td className="px-3 py-1.5">{
                e.isDirectory
                  ? t('files.type.folder')
                  : EXT_TYPE[e.ext]
                    ? t(`files.type.${EXT_TYPE[e.ext]}`)
                    : t('files.type.unknown', { ext: e.ext.slice(1).toUpperCase() })
              }</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div onClick={clearSelection} onContextMenu={onContextEmpty} className="h-full min-h-[80px]" />
    </div>
  )
}

function SortHeader({
  col, current, onClick, label, align = 'left',
}: { col: SortColumn; current: { column: SortColumn; dir: 'asc' | 'desc' }; onClick: (c: SortColumn) => void; label: string; align?: 'left' | 'right' }) {
  const indicator = current.column === col ? (current.dir === 'asc' ? ' ▲' : ' ▼') : ''
  return (
    <th className={`px-3 py-2 cursor-pointer select-none text-${align} font-medium`} onClick={() => onClick(col)}>
      {label}{indicator}
    </th>
  )
}

function sortEntries(entries: DirEntry[], col: SortColumn, dir: 'asc' | 'desc'): DirEntry[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...entries].sort((a, b) => {
    // Directories always grouped first
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    if (col === 'name') return sign * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    if (col === 'size') return sign * (a.size - b.size)
    if (col === 'modified') return sign * (a.modifiedAt - b.modifiedAt)
    if (col === 'type') return sign * a.ext.localeCompare(b.ext) || a.name.localeCompare(b.name)
    return 0
  })
}
```

- [ ] **Step 2: Mount FileList in FilesPage (with placeholder context-menu handlers)**

Update `src/components/files/FilesPage.tsx`:

```tsx
import { useEffect } from 'react'
import { useFilesStore } from '../../stores/filesStore'
import FileSidebar from './FileSidebar'
import PathBar from './PathBar'
import FileList from './FileList'

export default function FilesPage() {
  const navigate = useFilesStore((s) => s.navigate)

  useEffect(() => { navigate('~') }, [navigate])

  return (
    <div className="flex h-full -m-4">
      <FileSidebar />
      <div className="flex-1 flex flex-col">
        <PathBar />
        <FileList
          onContextRow={(e, _entry) => { e.preventDefault() /* Task 18 */ }}
          onContextEmpty={(e) => { e.preventDefault() /* Task 18 */ }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/files/FileList.tsx src/components/files/FilesPage.tsx
git commit -m "feat(files): add FileList with sortable columns and multi-select"
```

---

## Task 18: ContextMenu component + on-empty / on-row wiring

**Files:**
- Create: `src/components/files/ContextMenu.tsx`
- Modify: `src/components/files/FilesPage.tsx`

A single ContextMenu component renders both menu variants. FilesPage owns the menu state (`{ kind: 'row' | 'empty', x, y, target }`) and dispatches actions via store + IPC.

- [ ] **Step 1: Implement ContextMenu**

Create `src/components/files/ContextMenu.tsx`:

```tsx
import { useEffect, useRef } from 'react'

export interface MenuItem {
  label: string
  onClick: () => void
  disabled?: boolean
  separator?: boolean
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escape)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: x, top: y, zIndex: 100 }}
      className="bg-bg-secondary border border-border-primary rounded shadow-lg text-xs font-mono py-1 min-w-[160px]"
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="border-t border-border-secondary my-1" />
        ) : (
          <button
            key={i}
            onClick={() => { if (!item.disabled) { item.onClick(); onClose() } }}
            disabled={item.disabled}
            className={`block w-full text-left px-3 py-1.5 ${
              item.disabled ? 'text-text-muted opacity-50' : 'text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire menus into FilesPage**

Replace `src/components/files/FilesPage.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import type { DirEntry } from '../../types'
import { useTranslation } from '../../i18n/index'
import { useFilesStore } from '../../stores/filesStore'
import { useToast } from '../../stores/toastStore'
import FileSidebar from './FileSidebar'
import PathBar from './PathBar'
import FileList from './FileList'
import ContextMenu, { type MenuItem } from './ContextMenu'

type MenuState =
  | { kind: 'row'; x: number; y: number; entry: DirEntry }
  | { kind: 'empty'; x: number; y: number }
  | null

export default function FilesPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const currentPath = useFilesStore((s) => s.currentPath)
  const selection = useFilesStore((s) => s.selection)
  const clipboard = useFilesStore((s) => s.clipboard)
  const setClipboard = useFilesStore((s) => s.setClipboard)
  const setSelection = useFilesStore((s) => s.setSelection)
  const navigate = useFilesStore((s) => s.navigate)
  const refresh = useFilesStore((s) => s.refresh)
  const [menu, setMenu] = useState<MenuState>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)

  useEffect(() => { navigate('~') }, [navigate])

  const openRowMenu = (e: React.MouseEvent, entry: DirEntry) => {
    e.preventDefault()
    if (!selection.has(entry.path)) {
      setSelection(new Set([entry.path]), entry.path)
    }
    setMenu({ kind: 'row', x: e.clientX, y: e.clientY, entry })
  }

  const openEmptyMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ kind: 'empty', x: e.clientX, y: e.clientY })
  }

  // Effective selection for row menu actions: if the right-clicked entry is in selection,
  // act on the whole selection; else act on just that entry.
  const targetsForRowMenu = (entry: DirEntry): string[] =>
    selection.has(entry.path) ? Array.from(selection) : [entry.path]

  const rowMenuItems = (entry: DirEntry): MenuItem[] => {
    const targets = targetsForRowMenu(entry)
    const isMulti = targets.length > 1
    return [
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
    ]
  }

  const emptyMenuItems = (): MenuItem[] => [
    { label: t('files.contextMenu.newFolder'), onClick: async () => {
      const name = await uniqueDefault(currentPath, t('files.defaults.untitledFolder'))
      const r = await window.api.fsCreateFolder(currentPath, name)
      if (r.ok) setRenamingPath(r.path)
      else toast.error(r.message)
    }},
    { label: t('files.contextMenu.newFile'), onClick: async () => {
      const name = await uniqueDefault(currentPath, t('files.defaults.untitledFile'))
      const r = await window.api.fsCreateFile(currentPath, name)
      if (r.ok) setRenamingPath(r.path)
      else toast.error(r.message)
    }},
    { label: t('files.contextMenu.paste'), disabled: clipboard === null, onClick: async () => {
      if (!clipboard) return
      // Reject paste-into-self for cut
      if (clipboard.op === 'cut' && clipboard.paths.some((p) => p.startsWith(currentPath + '/') || currentPath === parentOf(p))) {
        toast.error(t('files.error.pasteIntoSelf')); return
      }
      const fn = clipboard.op === 'copy' ? window.api.fsCopy : window.api.fsMove
      const r = await fn(clipboard.paths, currentPath)
      if (r.ok) {
        if (clipboard.op === 'cut') setClipboard(null)
      } else {
        toast.error(r.message)
      }
    }},
  ]

  return (
    <div className="flex h-full -m-4">
      <FileSidebar />
      <div className="flex-1 flex flex-col">
        <PathBar />
        <FileList onContextRow={openRowMenu} onContextEmpty={openEmptyMenu} />
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.kind === 'row' ? rowMenuItems(menu.entry) : emptyMenuItems()}
          onClose={() => setMenu(null)}
        />
      )}
      {/* Rename overlay handled in Task 19 */}
    </div>
  )
}

async function uniqueDefault(parent: string, base: string): Promise<string> {
  const r = await window.api.listDirectory(parent)
  const names = r.ok ? new Set(r.entries.map((e) => e.name)) : new Set<string>()
  if (!names.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} ${i}`
    if (!names.has(candidate)) return candidate
  }
  return base
}

function parentOf(p: string): string {
  const idx = p.lastIndexOf('/')
  return idx <= 0 ? '/' : p.slice(0, idx)
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/files/ContextMenu.tsx src/components/files/FilesPage.tsx
git commit -m "feat(files): add ContextMenu with row/empty variants and operation wiring"
```

---

## Task 19: RenameInline component

**Files:**
- Create: `src/components/files/RenameInline.tsx`
- Modify: `src/components/files/FileList.tsx`
- Modify: `src/components/files/FilesPage.tsx`

Inline rename overlay on the Name cell of the entry being renamed. Cursor placed before the extension dot; full base-name selection.

- [ ] **Step 1: Implement RenameInline**

Create `src/components/files/RenameInline.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'

interface Props {
  initialName: string
  onSubmit: (newName: string) => Promise<{ ok: boolean; message?: string }>
  onCancel: () => void
}

export default function RenameInline({ initialName, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.focus()
    // Select base name (everything before the last '.')
    const dot = initialName.lastIndexOf('.')
    if (dot > 0) ref.current.setSelectionRange(0, dot)
    else ref.current.select()
  }, [initialName])

  const submit = async () => {
    if (value === initialName) { onCancel(); return }
    const result = await onSubmit(value)
    if (!result.ok) {
      setError(result.message ?? 'Error')
      // stay in edit mode
      ref.current?.focus()
    }
  }

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => { setValue(e.target.value); setError(null) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit()
        else if (e.key === 'Escape') onCancel()
      }}
      onBlur={submit}
      className={`bg-bg-primary border rounded px-1 py-0.5 text-xs font-mono w-full ${
        error ? 'border-status-red text-status-red' : 'border-status-blue text-text-primary'
      }`}
      title={error ?? undefined}
    />
  )
}
```

- [ ] **Step 2: Integrate into FileList**

Modify `src/components/files/FileList.tsx`:

Add prop `renamingPath: string | null` and `onRenameSubmit` / `onRenameCancel` callbacks. In the Name cell, when `e.path === renamingPath`, render the `RenameInline` component instead of the static name.

Add to the `FileListProps`:

```tsx
interface FileListProps {
  onContextRow: (e: React.MouseEvent, entry: DirEntry) => void
  onContextEmpty: (e: React.MouseEvent) => void
  renamingPath: string | null
  onRenameSubmit: (entry: DirEntry, newName: string) => Promise<{ ok: boolean; message?: string }>
  onRenameCancel: () => void
}
```

Update the function signature and add the import:
```tsx
import RenameInline from './RenameInline'
// ...
export default function FileList({
  onContextRow, onContextEmpty,
  renamingPath, onRenameSubmit, onRenameCancel,
}: FileListProps) {
```

In the Name cell rendering (inside the `<tr>` map), replace the line:
```tsx
<td className="px-3 py-1.5 truncate max-w-[300px]">
  {e.isDirectory ? '📁' : EXT_ICON[e.ext] ?? '📄'} {e.name}
</td>
```
with:
```tsx
<td className="px-3 py-1.5 truncate max-w-[300px]">
  {e.isDirectory ? '📁' : EXT_ICON[e.ext] ?? '📄'}{' '}
  {renamingPath === e.path ? (
    <RenameInline
      initialName={e.name}
      onSubmit={(newName) => onRenameSubmit(e, newName)}
      onCancel={onRenameCancel}
    />
  ) : (
    e.name
  )}
</td>
```

- [ ] **Step 3: Wire rename in FilesPage**

In `src/components/files/FilesPage.tsx`, you already track `renamingPath` (added in Task 18). Now add the submit handler and pass props to `<FileList>`:

```tsx
const handleRenameSubmit = async (entry: DirEntry, newName: string) => {
  if (newName.length === 0 || newName.includes('/')) {
    return { ok: false, message: t('files.error.invalidName') }
  }
  const r = await window.api.fsRename(entry.path, newName)
  if (r.ok) {
    setRenamingPath(null)
    return { ok: true }
  } else {
    // Pattern-match on error message for collision detection
    if (r.message.includes('EEXIST') || r.message.includes('exists')) {
      return { ok: false, message: t('files.error.nameExists') }
    }
    return { ok: false, message: r.message }
  }
}
```

Update the `<FileList>` props:

```tsx
<FileList
  onContextRow={openRowMenu}
  onContextEmpty={openEmptyMenu}
  renamingPath={renamingPath}
  onRenameSubmit={handleRenameSubmit}
  onRenameCancel={() => setRenamingPath(null)}
/>
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/components/files/RenameInline.tsx src/components/files/FileList.tsx src/components/files/FilesPage.tsx
git commit -m "feat(files): add inline rename with Enter/Esc/blur and collision handling"
```

---

## Task 20: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected on macOS: all tests pass (existing 52 + new ~38 = ~90, with zipService's 4 contributing). Expected on Linux: ~86 (zipService 4 skipped).

- [ ] **Step 2: Run the full build**

Run: `npm run build`
Expected: success across main, preload, and renderer bundles.

- [ ] **Step 3: TypeScript strict-mode check**

Run: `npx tsc --noEmit`
Expected: no errors. (Pre-existing errors in chart components or treemap are unrelated; if any appear, confirm they predate this work.)

- [ ] **Step 4: Manual smoke test (macOS dev environment)**

Reset settings:
```bash
rm -f "$HOME/Library/Application Support/dashmac/settings.json"
```

Run: `npm run dev`

Verify in the running app:
- Sidebar shows "Files" / "文件" entry with 📁 icon
- Click Files → page loads with two-pane layout, listing of `~`
- Quick directories area is empty initially
- "/" and "~" system entries clickable
- Double-click a directory navigates into it
- PathBar shows current absolute path
- Edit PathBar, press Enter on valid path → navigates
- Edit PathBar, press Enter on invalid path → red border + toast
- Back / Forward / Up buttons work
- Click column header → sort toggles
- Single-click row → selects only that row
- ⌘+click row → toggles selection
- Shift+click row → range select
- ⌘A → select all
- Esc → clear selection
- Right-click row → row menu appears with all 7 items; Open and Rename greyed when multi-selected
- Right-click empty area → empty menu with New Folder, New File, Paste (Paste disabled when clipboard empty)
- New Folder → creates `Untitled folder`, immediately enters rename mode
- Rename: type name, press Enter → renamed; Esc → reverted; collision → error styling stays in edit mode
- Copy → Paste in different folder → file copied; clipboard preserved
- Cut → Paste in different folder → file moved; clipboard cleared
- Move to Trash → file disappears from list (and is in `~/.Trash`)
- Compress to ZIP single → `<name>.zip` appears
- Compress to ZIP multiple → `Archive.zip` appears
- Toggle hidden files button shows/hides dotfiles
- Add current folder → folder appears in shortcuts; restart app → shortcut persists
- Right-click a shortcut → "Remove from shortcuts" works

- [ ] **Step 5: Manual smoke test in Chinese locale**

Settings → Appearance → Language → 简体中文

Verify all UI strings (sidebar entries, toolbar tooltips, column headers, context menu items, error messages, toasts) display in Chinese.

- [ ] **Step 6: Confirm out-of-scope behaviors**

- Drag-and-drop → does nothing (not implemented; intentional)
- Cross-app paste with Finder → DashMac clipboard ≠ Finder clipboard (intentional)
- Recursive directory size → still `--` for folders (intentional)

- [ ] **Step 7: Commit any inline fixes from smoke testing**

If any issues were found and fixed during smoke testing, commit with descriptive messages. Otherwise:

```bash
git status   # confirm clean tree
```

---

## Acceptance criteria recap

(Mirrors spec §Acceptance criteria — verify each in Task 20.)

- [ ] Sidebar gains "Files" entry; clicking enters new page
- [ ] Sidebar shows Shortcuts (empty) + System (`/`, `~`) + Add button
- [ ] Double-click directory enters; double-click file opens via system app
- [ ] PathBar shows current absolute path; Enter navigates; invalid path keeps input + error toast
- [ ] Back / Forward / Up nav buttons with disabled states
- [ ] FileList: 4 columns sortable; default sort name asc, dirs first
- [ ] Selection model: single / ⌘+click / Shift+click / ⌘A / Esc
- [ ] Right-click row vs empty produces two distinct menus
- [ ] New Folder / New File creates with default name + enters rename mode
- [ ] Rename: Enter submits, Esc cancels, blur submits; collision keeps edit mode
- [ ] Copy + paste, Cut + paste; collisions auto-suffix; cut clears clipboard
- [ ] Move to Trash actually moves to `~/.Trash`
- [ ] ZIP single → `<name>.zip`; multi → `Archive.zip`; both unzip correctly
- [ ] Hidden toggle shows/hides dotfiles; persists across restart
- [ ] Add Shortcut adds path; deleted shortcut auto-removes on click with toast
- [ ] Chinese locale renders every Files-page string in Chinese, including TCC error guidance
- [ ] `npm test` passes
- [ ] `npm run build` passes TS strict
