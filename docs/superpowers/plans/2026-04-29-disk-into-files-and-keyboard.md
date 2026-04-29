# Disk → Files + Keyboard Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the Disk page entirely; relocate Treemap + BigFiles into the Files page as a toggle-able Analyze view (📊 button); add 17 Finder-style keyboard shortcuts to the Files page.

**Architecture:** No backend changes — `queryDiskScan` IPC reused; `collectDisk` keeps feeding Dashboard. Renderer-side: drop the `'disk'` page from the navigation; move Treemap and BigFiles components from `src/components/disk/` to `src/components/files/`; extend `filesStore` with `viewMode` and `analyzeData`; add a 📊 toggle in PathBar; render Analyze view conditionally; lift the `visible` (filtered+sorted) derivation up from FileList to FilesPage so a single keyboard dispatcher can use it.

**Tech Stack:** React 19 + TypeScript strict + Zustand + Tailwind 4. No new dependencies. No new tests required (pure UI refactor; existing `i18n-shape.test.ts` covers locale changes).

**Spec:** `docs/superpowers/specs/2026-04-29-disk-into-files-and-keyboard-design.md`

---

## File Structure

**Moved (no code change):**
- `src/components/disk/Treemap.tsx` → `src/components/files/Treemap.tsx`
- `src/components/disk/BigFiles.tsx` → `src/components/files/BigFiles.tsx`

**Deleted:**
- `src/components/disk/DiskOverview.tsx`
- `src/components/disk/` directory (after moves)

**Modified:**
- `src/App.tsx` — remove `'disk'` from `Page` union; remove `case 'disk'` from `PageContent`; remove `DiskOverview` import
- `src/components/layout/Sidebar.tsx` — remove `'disk'` from `Page`, `NAV_ICONS`, `NAV_ORDER`
- `src/i18n/locales/en.ts` — remove `pages.disk`, `sidebar.disk`, most of `disk.*`; add `files.toolbar.{analyze,list}` + `files.analyze.*`
- `src/i18n/locales/zh-CN.ts` — same shape, Chinese
- `src/stores/filesStore.ts` — add `viewMode`, `analyzeData`, `analyzeLoading`, `analyzedPath`; add `toggleAnalyze`, `rescanCurrent` actions
- `src/components/files/PathBar.tsx` — add 📊 toggle button after 👁
- `src/components/files/FilesPage.tsx` — render Analyze view; lift `visible` derivation; add keyboard dispatcher
- `src/components/files/FileList.tsx` — accept `visible` as a prop (instead of computing internally); add row refs + auto-scroll on `selectionAnchor` change

---

## Conventions

- **Commit per task** with lowercase conventional-commit messages.
- **No new tests** — refactor + UI changes; existing tests cover IPC and i18n shape.
- **Imports** use no `.js`/`.ts`/`.tsx` suffixes.
- **Build verification:** `npm run build` (electron-vite); type errors surface there.
- **Working directory** is the project root or worktree root (the executing skill will set this up).

---

## Task 1: Disk page deletion + component move

**Files:**
- Move: `src/components/disk/Treemap.tsx` → `src/components/files/Treemap.tsx`
- Move: `src/components/disk/BigFiles.tsx` → `src/components/files/BigFiles.tsx`
- Delete: `src/components/disk/DiskOverview.tsx`
- Delete: `src/components/disk/` (empty directory after moves)
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Move Treemap and BigFiles to `src/components/files/`**

```bash
git mv src/components/disk/Treemap.tsx src/components/files/Treemap.tsx
git mv src/components/disk/BigFiles.tsx src/components/files/BigFiles.tsx
```

The component code itself doesn't change — both files already accept a `FileEntry` prop and don't depend on path. Their import of `'../../types'` (relative path) still resolves correctly from the new location because `src/components/files/Treemap.tsx`'s `../../types` is `src/types.ts` (same as before).

- [ ] **Step 2: Delete DiskOverview**

```bash
rm src/components/disk/DiskOverview.tsx
rmdir src/components/disk
```

- [ ] **Step 3: Update `src/components/layout/Sidebar.tsx`**

Find:
```ts
type Page = 'dashboard' | 'memory' | 'disk' | 'network' | 'files' | 'settings'
```
Replace:
```ts
type Page = 'dashboard' | 'memory' | 'network' | 'files' | 'settings'
```

Find:
```ts
const NAV_ICONS: Record<Page, string> = {
  dashboard: '⊞',
  memory: '☰',
  disk: '◉',
  network: '⇅',
  files: '📁',
  settings: '⚙',
}
```
Replace (remove the `disk:` line):
```ts
const NAV_ICONS: Record<Page, string> = {
  dashboard: '⊞',
  memory: '☰',
  network: '⇅',
  files: '📁',
  settings: '⚙',
}
```

Find:
```ts
const NAV_ORDER: Page[] = ['dashboard', 'memory', 'disk', 'network', 'files', 'settings']
```
Replace:
```ts
const NAV_ORDER: Page[] = ['dashboard', 'memory', 'network', 'files', 'settings']
```

- [ ] **Step 4: Update `src/App.tsx`**

Remove the `import DiskOverview from './components/disk/DiskOverview'` line entirely.

Find:
```ts
type Page = 'dashboard' | 'memory' | 'disk' | 'network' | 'files' | 'settings'
```
Replace:
```ts
type Page = 'dashboard' | 'memory' | 'network' | 'files' | 'settings'
```

Find the `PageContent` switch (or equivalent rendering) — it has a `case 'disk':` branch returning `<DiskOverview />`. Remove that case entirely.

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(disk): delete Disk page and move Treemap/BigFiles into Files components"
```

The `-A` is appropriate here because this commit involves both deletes and renames; verify with `git status` first that no unintended files are staged.

---

## Task 2: i18n cleanup + additions

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh-CN.ts`

Remove the now-unused disk i18n keys (except `disk.{used,available,total}` which Dashboard's Overview card still uses) and add the new `files.toolbar.{analyze,list}` and `files.analyze.*` namespaces.

- [ ] **Step 1: Update `src/i18n/locales/en.ts`**

Find the existing `pages` block:
```ts
pages: {
  dashboard: 'Dashboard',
  memory: 'Memory Management',
  disk: 'Disk Analysis',
  network: 'Network Analysis',
  files: 'Files',
  settings: 'Settings',
},
```
Remove the `disk:` line:
```ts
pages: {
  dashboard: 'Dashboard',
  memory: 'Memory Management',
  network: 'Network Analysis',
  files: 'Files',
  settings: 'Settings',
},
```

Find the existing `sidebar` block and remove its `disk:` line similarly.

Find the existing `disk:` top-level namespace. Replace it with a trimmed version that keeps only `used`, `available`, `total`:
```ts
disk: {
  used: 'Used',
  available: 'Available',
  total: 'Total',
},
```
(All other former keys — `io`, `spaceHistory`, `fileAnalysis`, `scanPlaceholder`, `scan`, `scanning`, `treemapEmpty`, `bigFiles.*` — are removed.)

Find the existing `files.toolbar` block:
```ts
toolbar: {
  back: 'Back',
  forward: 'Forward',
  up: 'Up',
  refresh: 'Refresh',
  toggleHidden: 'Show hidden files',
},
```
Add two keys:
```ts
toolbar: {
  back: 'Back',
  forward: 'Forward',
  up: 'Up',
  refresh: 'Refresh',
  toggleHidden: 'Show hidden files',
  analyze: 'Analyze',
  list: 'List view',
},
```

Add a new `analyze` sub-namespace inside the existing `files` namespace (place it next to `toolbar`, `list`, `tray`, etc.):
```ts
analyze: {
  loading: 'Scanning {path}...',
  scanCurrent: 'Scan {path}',
  rescan: 'Re-scan',
  analyzedPath: 'Analyzing: {path}',
  treemapEmpty: 'No data. Click 📊 to analyze the current folder.',
  bigFiles: {
    title: 'Top 50 Largest Files',
    number: '#',
    file: 'File',
    size: 'Size',
    action: 'Action',
    reveal: 'Reveal',
  },
},
```

- [ ] **Step 2: Update `src/i18n/locales/zh-CN.ts`**

Apply the same structural changes (remove `pages.disk`, `sidebar.disk`, trim `disk` namespace to `used/available/total`, add `files.toolbar.analyze/list`, add `files.analyze.*`) with Chinese translations:

Trimmed `disk`:
```ts
disk: {
  used: '已用',
  available: '可用',
  total: '总计',
},
```

`files.toolbar` additions:
```ts
analyze: '分析',
list: '列表视图',
```

`files.analyze`:
```ts
analyze: {
  loading: '扫描 {path} 中…',
  scanCurrent: '扫描 {path}',
  rescan: '重新扫描',
  analyzedPath: '已分析：{path}',
  treemapEmpty: '暂无数据。点击 📊 分析当前目录。',
  bigFiles: {
    title: '最大的 50 个文件',
    number: '#',
    file: '文件',
    size: '大小',
    action: '操作',
    reveal: '在 Finder 中显示',
  },
},
```

- [ ] **Step 3: Run shape parity test**

Run: `npx vitest run tests/electron/i18n-shape.test.ts`
Expected: 2 passing.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "i18n/locales" || echo "no errors in locales"`
Expected: `no errors in locales`. (Other files that consumed the now-deleted keys will surface as errors — but the only consumer of `disk.io / spaceHistory / fileAnalysis / scan / scanning / treemapEmpty / bigFiles.*` was `DiskOverview.tsx`, which was deleted in Task 1. So expect no consumer errors.)

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/zh-CN.ts
git commit -m "feat(i18n): trim disk namespace and add files.analyze + toolbar.analyze/list"
```

---

## Task 3: filesStore — Analyze view state and actions

**Files:**
- Modify: `src/stores/filesStore.ts`

Add four state fields and two new actions for the Analyze view. Existing fields and actions are unchanged.

- [ ] **Step 1: Extend the FilesState interface**

In `src/stores/filesStore.ts`, find the `FilesState` interface. Add these fields just below the existing state fields (e.g., after `loading: boolean`):

```ts
  viewMode: 'list' | 'analyze'
  analyzeData: import('../types').FileEntry | null
  analyzeLoading: boolean
  analyzedPath: string | null

  toggleAnalyze: () => Promise<void>
  rescanCurrent: () => Promise<void>
```

Note: `FileEntry` already exists in `src/types.ts` (it's the recursive type used by Treemap/BigFiles). Use the inline import to keep filesStore's existing imports tidy, or add it to the top: `import type { DirEntry, FileEntry } from '../types'`.

- [ ] **Step 2: Add the initial state values**

Find the `create<FilesState>(...)` call body. After the existing initial values (e.g., `loading: false`), add:

```ts
  viewMode: 'list',
  analyzeData: null,
  analyzeLoading: false,
  analyzedPath: null,
```

- [ ] **Step 3: Add the action implementations**

Inside the same `create<FilesState>` body (after the existing action methods), add:

```ts
  toggleAnalyze: async () => {
    const { viewMode, currentPath, analyzedPath, analyzeData } = get()
    if (viewMode === 'analyze') {
      set({ viewMode: 'list' })
      return
    }
    // Switching list → analyze
    set({ viewMode: 'analyze' })
    if (analyzedPath !== currentPath || analyzeData === null) {
      set({ analyzeLoading: true })
      try {
        const data = await window.api.queryDiskScan(currentPath)
        set({ analyzeData: data, analyzedPath: currentPath, analyzeLoading: false })
      } catch (err: any) {
        set({ analyzeLoading: false })
      }
    }
  },

  rescanCurrent: async () => {
    const { currentPath } = get()
    set({ analyzeLoading: true })
    try {
      const data = await window.api.queryDiskScan(currentPath)
      set({ analyzeData: data, analyzedPath: currentPath, analyzeLoading: false })
    } catch (err: any) {
      set({ analyzeLoading: false })
    }
  },
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/stores/filesStore.ts
git commit -m "feat(files): add Analyze view state and toggle/rescan actions to filesStore"
```

---

## Task 4: PathBar — 📊 toggle button

**Files:**
- Modify: `src/components/files/PathBar.tsx`

Add a 📊 toggle button right after the existing 👁 (hidden-files toggle) button.

- [ ] **Step 1: Update PathBar**

In `src/components/files/PathBar.tsx`:

(a) Add new selectors at the top of the component (alongside the existing `useFilesStore` selectors):

```tsx
const viewMode = useFilesStore((s) => s.viewMode)
const toggleAnalyze = useFilesStore((s) => s.toggleAnalyze)
```

(b) Find the 👁 button JSX:

```tsx
<button onClick={toggleHidden}
  className={`px-2 py-1 rounded ${showHidden ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary'}`}
  title={t('files.toolbar.toggleHidden')}>👁</button>
```

Add immediately after it (still inside the same toolbar `<div>`):

```tsx
<button onClick={() => toggleAnalyze()}
  className={`px-2 py-1 rounded ${viewMode === 'analyze' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary'}`}
  title={viewMode === 'analyze' ? t('files.toolbar.list') : t('files.toolbar.analyze')}>📊</button>
```

The wrapper `() => toggleAnalyze()` discards the click event so React doesn't pass a `MouseEvent` to the action (which expects no args).

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/files/PathBar.tsx
git commit -m "feat(files): add 📊 Analyze toggle button to PathBar"
```

---

## Task 5: FilesPage — Analyze view rendering

**Files:**
- Modify: `src/components/files/FilesPage.tsx`

Render the Analyze view conditionally based on `viewMode`. The List view (FileList) was already rendering; we wrap it in a `viewMode === 'list'` branch and add the Analyze view as the alternative.

- [ ] **Step 1: Add imports**

In `src/components/files/FilesPage.tsx`, add:

```tsx
import Treemap from './Treemap'
import BigFiles from './BigFiles'
```

- [ ] **Step 2: Read store state for Analyze view**

Inside the `FilesPage` component body (alongside the existing `useFilesStore` selectors):

```tsx
const viewMode = useFilesStore((s) => s.viewMode)
const analyzeData = useFilesStore((s) => s.analyzeData)
const analyzeLoading = useFilesStore((s) => s.analyzeLoading)
const analyzedPath = useFilesStore((s) => s.analyzedPath)
const rescanCurrent = useFilesStore((s) => s.rescanCurrent)
```

- [ ] **Step 3: Wrap the existing FileList render in a viewMode branch**

Find the JSX where `<FileList ... />` is currently rendered. Wrap it like this:

```tsx
{viewMode === 'list' ? (
  <FileList
    onContextRow={openRowMenu}
    onContextEmpty={openEmptyMenu}
    renamingPath={renamingPath}
    onRenameSubmit={handleRenameSubmit}
    onRenameCancel={() => setRenamingPath(null)}
  />
) : (
  <AnalyzeView
    analyzedPath={analyzedPath}
    currentPath={currentPath}
    analyzeData={analyzeData}
    analyzeLoading={analyzeLoading}
    onRescan={rescanCurrent}
  />
)}
```

- [ ] **Step 4: Add the AnalyzeView helper component at the bottom of the file**

After the `FilesPage` component definition (and any existing helpers like `parentOf` / `uniqueDefault`), add:

```tsx
function AnalyzeView({
  analyzedPath, currentPath, analyzeData, analyzeLoading, onRescan,
}: {
  analyzedPath: string | null
  currentPath: string
  analyzeData: import('../../types').FileEntry | null
  analyzeLoading: boolean
  onRescan: () => Promise<void>
}) {
  const { t } = useTranslation()
  const stale = analyzedPath !== null && analyzedPath !== currentPath

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-mono text-text-muted">
          {analyzedPath ? t('files.analyze.analyzedPath', { path: analyzedPath }) : ''}
        </span>
        {stale && (
          <button onClick={() => onRescan()}
            className="px-3 py-1 text-xs font-mono bg-status-yellow text-bg-primary rounded">
            {t('files.analyze.scanCurrent', { path: currentPath })}
          </button>
        )}
        {!stale && analyzedPath && (
          <button onClick={() => onRescan()}
            className="px-3 py-1 text-xs font-mono bg-bg-primary border border-border-primary text-text-secondary rounded hover:bg-bg-tertiary">
            {t('files.analyze.rescan')}
          </button>
        )}
      </div>

      {analyzeLoading && (
        <div className="flex-1 flex items-center justify-center text-text-muted font-mono text-sm">
          {analyzedPath ? t('files.analyze.loading', { path: analyzedPath }) : t('files.analyze.loading', { path: currentPath })}
        </div>
      )}

      {!analyzeLoading && analyzeData && (
        <>
          <Treemap data={analyzeData} onClickFile={(p) => window.api.revealFile(p)} />
          <BigFiles data={analyzeData} />
        </>
      )}

      {!analyzeLoading && !analyzeData && (
        <div className="flex-1 flex items-center justify-center text-text-muted font-mono text-sm">
          {t('files.analyze.treemapEmpty')}
        </div>
      )}
    </div>
  )
}
```

This `AnalyzeView` is a stateless functional component co-located with `FilesPage` so they share the same translation context and there's no need for a new file.

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/components/files/FilesPage.tsx
git commit -m "feat(files): render Analyze view (Treemap + BigFiles) when viewMode is analyze"
```

---

## Task 6: FileList — receive `visible` from props + auto-scroll

**Files:**
- Modify: `src/components/files/FileList.tsx`

Two changes: (1) accept `visible` (already filtered+sorted) from props instead of computing it internally — needed so the keyboard dispatcher in Task 7 can use the same array; (2) add row refs and auto-scroll the selected row into view when `selectionAnchor` changes.

- [ ] **Step 1: Update FileListProps**

In `src/components/files/FileList.tsx`, find the `FileListProps` interface. Add a new field:

```ts
interface FileListProps {
  onContextRow: (e: React.MouseEvent, entry: DirEntry) => void
  onContextEmpty: (e: React.MouseEvent) => void
  renamingPath: string | null
  onRenameSubmit: (entry: DirEntry, newName: string) => Promise<{ ok: boolean; message?: string }>
  onRenameCancel: () => void
  visible: DirEntry[]      // NEW — supplied by the caller (FilesPage)
}
```

- [ ] **Step 2: Remove the internal `useMemo` for `visible`**

Find:
```tsx
const visible = useMemo(() => {
  const filtered = showHidden ? entries : entries.filter((e) => !e.name.startsWith('.'))
  return sortEntries(filtered, sort.column, sort.dir)
}, [entries, showHidden, sort])
```

Delete that block. Also remove the now-unused `entries`, `showHidden`, `sort` selectors from the top of the component (they're now read by the parent FilesPage).

The `useFilesStore` calls that remain in FileList: `selection`, `dirError`, `navigate`, `refresh`, `toggleSelect`, `rangeSelect`, `selectAll`, `clearSelection`, `setSelection`, `setSort`, plus `selectionAnchor` (newly needed for auto-scroll). Keep `setSort` even though FilesPage owns sort UI — or move setSort to FilesPage too. **Decision:** sort UI belongs in `FileList`'s table header, so `setSort` and `sort` stay in FileList. Pass them through props would mean FilesPage manages sort; cleaner to keep sort state in `filesStore` and have both components read it. Add a `sort` selector back: `const sort = useFilesStore((s) => s.sort)` so the SortHeader can render the indicator.

Updated selector list at the top of the component:
```tsx
const { t, lang } = useTranslation()
const selection = useFilesStore((s) => s.selection)
const selectionAnchor = useFilesStore((s) => s.selectionAnchor)
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
```

The function signature now reads `visible` from `props`:
```tsx
export default function FileList({
  onContextRow, onContextEmpty,
  renamingPath, onRenameSubmit, onRenameCancel,
  visible,
}: FileListProps) {
```

- [ ] **Step 3: Add row refs + auto-scroll effect**

Add these near the top of the component body:

```tsx
import { useEffect, useRef } from 'react'  // ensure these imports are present
// ...
const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())

useEffect(() => {
  if (!selectionAnchor) return
  const el = rowRefs.current.get(selectionAnchor)
  if (el) el.scrollIntoView({ block: 'nearest' })
}, [selectionAnchor])
```

Update each `<tr>` to register itself in `rowRefs`:

```tsx
<tr
  key={e.path}
  ref={(el) => {
    if (el) rowRefs.current.set(e.path, el)
    else rowRefs.current.delete(e.path)
  }}
  onClick={(ev) => handleClick(ev, e)}
  onDoubleClick={() => handleDoubleClick(e)}
  onContextMenu={(ev) => onContextRow(ev, e)}
  className={`...existing classes...`}
>
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: errors in `FilesPage.tsx` because the `<FileList>` call doesn't yet pass the `visible` prop. Those will be fixed in Task 7. For now, verify only that errors are localized to `FilesPage.tsx` line(s) where `<FileList>` is rendered.

If there are ANY errors in `FileList.tsx` itself, fix them before proceeding.

- [ ] **Step 5: Commit**

```bash
git add src/components/files/FileList.tsx
git commit -m "refactor(files): FileList accepts visible prop and auto-scrolls selected row"
```

---

## Task 7: FilesPage — lift `visible` + add keyboard dispatcher

**Files:**
- Modify: `src/components/files/FilesPage.tsx`

Lift the `visible` derivation into FilesPage so both `<FileList>` and the keyboard dispatcher use the same array. Add a 17-binding keyboard dispatcher.

- [ ] **Step 1: Add the visible derivation**

At the top of `FilesPage` component body, add:

```tsx
import { useMemo, useEffect } from 'react'  // ensure both are imported
// ...

const entries = useFilesStore((s) => s.entries)
const showHidden = useFilesStore((s) => s.showHidden)
const sort = useFilesStore((s) => s.sort)

const visible = useMemo(() => {
  const filtered = showHidden ? entries : entries.filter((e) => !e.name.startsWith('.'))
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...filtered].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    if (sort.column === 'name') return sign * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    if (sort.column === 'size') return sign * (a.size - b.size)
    if (sort.column === 'modified') return sign * (a.modifiedAt - b.modifiedAt)
    if (sort.column === 'type') return sign * a.ext.localeCompare(b.ext) || a.name.localeCompare(b.name)
    return 0
  })
}, [entries, showHidden, sort])
```

(This is the same logic that was previously in FileList.)

- [ ] **Step 2: Pass `visible` to `<FileList>`**

Update the `<FileList>` JSX (inside the `viewMode === 'list'` branch from Task 5) to pass the new prop:

```tsx
<FileList
  onContextRow={openRowMenu}
  onContextEmpty={openEmptyMenu}
  renamingPath={renamingPath}
  onRenameSubmit={handleRenameSubmit}
  onRenameCancel={() => setRenamingPath(null)}
  visible={visible}
/>
```

- [ ] **Step 3: Add the keyboard dispatcher**

Add these reads from the store (at the top of FilesPage component body):

```tsx
const goBack = useFilesStore((s) => s.goBack)
const goForward = useFilesStore((s) => s.goForward)
const goUp = useFilesStore((s) => s.goUp)
const refresh = useFilesStore((s) => s.refresh)
const setSelection = useFilesStore((s) => s.setSelection)  // already present
const rangeSelect = useFilesStore((s) => s.rangeSelect)
const selectAll = useFilesStore((s) => s.selectAll)
const clearSelection = useFilesStore((s) => s.clearSelection)
const selectionAnchor = useFilesStore((s) => s.selectionAnchor)
const history = useFilesStore((s) => s.history)
```

Then add the keyboard effect:

```tsx
useEffect(() => {
  function handleKey(e: KeyboardEvent) {
    // Focus guard: skip when typing in inputs
    const target = e.target as HTMLElement | null
    if (target && target.matches('input, textarea, [contenteditable]')) return
    // Modal guard: skip when context menu or rename is open
    if (menu !== null || renamingPath !== null) return

    const meta = e.metaKey  // macOS Command key
    const shift = e.shiftKey

    // Escape — clear selection
    if (e.key === 'Escape') { clearSelection(); return }

    // ⌘A — select all
    if (meta && e.key === 'a') { e.preventDefault(); selectAll(); return }

    // ⌘R — refresh ; ⌘⇧R — reveal selected
    if (meta && e.key === 'r') {
      e.preventDefault()
      if (shift && selection.size === 1) {
        const [path] = selection
        window.api.revealFile(path)
      } else {
        refresh()
      }
      return
    }

    // ⌘[ / ⌘]
    if (meta && e.key === '[') { if (history.back.length > 0) goBack(); return }
    if (meta && e.key === ']') { if (history.forward.length > 0) goForward(); return }

    // Arrow keys
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const dir: 'up' | 'down' = e.key === 'ArrowUp' ? 'up' : 'down'

      // ⌘↑ — go up directory
      if (meta && dir === 'up') { if (currentPath !== '/') goUp(); return }

      // ⌘↓ — open selected
      if (meta && dir === 'down') {
        if (selection.size !== 1) return
        const [path] = selection
        const entry = visible.find((v) => v.path === path)
        if (!entry) return
        if (entry.isDirectory) navigate(entry.path)
        else window.api.fsOpen(entry.path)
        return
      }

      // Plain ↑/↓ or Shift+↑/↓ — move/extend selection
      if (visible.length === 0) return
      e.preventDefault()
      let nextEntry: DirEntry | null = null
      if (selection.size === 0) {
        nextEntry = dir === 'up' ? visible[visible.length - 1] : visible[0]
      } else {
        const cursor = selectionAnchor ?? Array.from(selection)[0]
        const idx = visible.findIndex((v) => v.path === cursor)
        if (idx < 0) {
          nextEntry = visible[0]
        } else {
          const next = dir === 'up' ? Math.max(0, idx - 1) : Math.min(visible.length - 1, idx + 1)
          nextEntry = visible[next]
        }
      }
      if (!nextEntry) return
      if (shift) rangeSelect(nextEntry.path)
      else setSelection(new Set([nextEntry.path]), nextEntry.path)
      return
    }

    // Enter — rename
    if (e.key === 'Enter' && selection.size === 1) {
      const [path] = selection
      setRenamingPath(path)
      e.preventDefault()
      return
    }

    // ⌘Backspace — trash
    if (meta && e.key === 'Backspace' && selection.size > 0) {
      e.preventDefault()
      const paths = Array.from(selection)
      window.api.fsTrash(paths)
      return
    }

    // ⌘C — copy ; ⌘⇧C — zip ; ⌘X — cut ; ⌘V — paste
    if (meta && e.key === 'c') {
      if (selection.size === 0) return
      const paths = Array.from(selection)
      if (shift) window.api.fsZip(paths, currentPath)
      else setClipboard({ paths, op: 'copy' })
      return
    }
    if (meta && e.key === 'x' && selection.size > 0) {
      const paths = Array.from(selection)
      setClipboard({ paths, op: 'cut' })
      return
    }
    if (meta && e.key === 'v' && clipboard !== null) {
      // Same paste logic as the empty context menu
      if (clipboard.op === 'cut' && clipboard.paths.some((p) => p.startsWith(currentPath + '/') || currentPath === parentOf(p))) {
        return  // silent: respect the same paste-into-self check
      }
      const fn = clipboard.op === 'copy' ? window.api.fsCopy : window.api.fsMove
      fn(clipboard.paths, currentPath).then((r) => {
        if (r.ok && clipboard.op === 'cut') setClipboard(null)
      })
      return
    }
  }

  window.addEventListener('keydown', handleKey)
  return () => window.removeEventListener('keydown', handleKey)
}, [
  visible, selection, selectionAnchor, currentPath, history, menu, renamingPath, clipboard,
  navigate, goBack, goForward, goUp, refresh,
  setSelection, rangeSelect, selectAll, clearSelection, setClipboard, setRenamingPath,
])
```

Note: this dispatcher closes over many variables. The dependency array is long but accurate — closures must see fresh values to act on the current state.

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/components/files/FilesPage.tsx
git commit -m "feat(files): keyboard dispatcher with 17 Finder-style shortcuts and lifted visible derivation"
```

---

## Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: existing tests pass; total count unchanged (no new tests added).

- [ ] **Step 2: Run the full build**

Run: `npm run build`
Expected: success across main, preload, renderer.

- [ ] **Step 3: TypeScript strict-mode check**

Run: `npx tsc --noEmit 2>&1 | grep -E "files/|disk/|App\.tsx|Sidebar\.tsx" || echo "no errors in scope"`
Expected: `no errors in scope`. Pre-existing chart/network errors are unrelated.

- [ ] **Step 4: Manual smoke test (macOS)**

Run: `npm run dev`

Verify in the running app:
- Sidebar shows 5 entries: Dashboard / Memory / Network / Files / Settings (no Disk)
- `src/components/disk/` directory does not exist; `Treemap.tsx` and `BigFiles.tsx` now under `src/components/files/`
- Files page PathBar has a 📊 button after 👁
- Click 📊 → switches to Analyze view; spinner shows; after a few seconds Treemap + BigFiles render
- Click 📊 again → back to List view; data preserved
- Click 📊 again immediately (same path) → instant switch (no re-scan)
- Navigate to a different path while in Analyze view → yellow "Scan {newPath}" button appears top-right; data unchanged
- Click "Scan {newPath}" → fresh scan; banner updates
- Keyboard: ↑ / ↓ moves selection; selected row scrolls into view if off-screen
- Cmd+↑ goes up directory
- Cmd+↓ opens selected (file: launches; dir: enters)
- Cmd+[ goes back; Cmd+] goes forward (greys when stack empty)
- Cmd+R refreshes (does NOT reload page)
- Cmd+Shift+R reveals selected file in Finder
- Cmd+A selects all
- Esc clears selection
- Enter starts inline rename on selection
- Cmd+Backspace moves selection to Trash
- Cmd+C / Cmd+X / Cmd+V works for copy / cut / paste
- Cmd+Shift+C compresses selection to ZIP
- Shift+↑ / Shift+↓ extends selection
- In PathBar input or RenameInline input, typing does NOT trigger file ops
- In Chinese locale, 📊 tooltip, Analyze view labels, scan button, "Analyzing:" all in Chinese

- [ ] **Step 5: Confirm clean tree**

```bash
git status
```

If any inline fixes were committed during smoke testing, that's fine. Otherwise the tree is clean.

---

## Acceptance criteria recap

- [ ] Sidebar shows 5 entries (no Disk)
- [ ] `src/components/disk/` deleted; Treemap + BigFiles moved to `src/components/files/`
- [ ] PathBar has 📊 button
- [ ] Click 📊 → Analyze view (Treemap + BigFiles for currentPath)
- [ ] Re-toggle preserves analyzeData when path unchanged
- [ ] Stale data UI (yellow Scan button) appears when navigating in Analyze mode
- [ ] All 17 keyboard shortcuts work per the dispatcher table
- [ ] Cmd+R does NOT reload the page (preventDefault)
- [ ] Focus guard works: typing in inputs doesn't trigger file ops
- [ ] Selected row auto-scrolls into view on keyboard navigation
- [ ] Chinese locale covers all new strings
- [ ] `npm test` passes
- [ ] `npm run build` passes
