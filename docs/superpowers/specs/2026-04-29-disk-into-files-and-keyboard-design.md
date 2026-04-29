# Disk → Files Consolidation + File Browser Keyboard Shortcuts

**Date:** 2026-04-29
**Status:** Design approved, pending implementation plan

## Goals

Two related changes to streamline the file-related surfaces:

1. **Consolidate disk into Files.** Remove the "Disk" page from the Sidebar and the codebase. Move the existing file analysis features (Treemap + BigFiles) into the Files page as a toggle-able "Analyze" view triggered by a new 📊 button in the PathBar. Delete the volume usage cards, disk I/O realtime chart, and space history chart (Dashboard already has the disk overview card; the rest were power-user noise).
2. **Add 17 Finder-style keyboard shortcuts** to the Files page covering navigation, selection, and all selected-item operations.

## Non-Goals

- Volume usage cards, disk I/O chart, or space history chart preserved anywhere else (Dashboard already has the disk card; the rest are deleted)
- Per-row screen-reader / ARIA accessibility improvements
- QuickLook preview (Space key)
- Cmd+Z undo for trash/move/rename
- Tab navigation between FileSidebar / PathBar / FileList panels
- Auto re-scan when navigating in Analyze view (manual via "Scan {path}" button to avoid surprise lag on deep directories)
- Focus rings / outline rings beyond the existing blue selection highlight
- Drag-and-drop (already excluded by file-browser v1)

## Architecture

### Disk page deletion

**Sidebar** (`src/components/layout/Sidebar.tsx`):
- `Page` union: remove `'disk'`
- `NAV_ICONS`: remove `disk: '◉'` entry
- `NAV_ORDER`: remove `'disk'`; new order is `['dashboard', 'memory', 'network', 'files', 'settings']`

**App** (`src/App.tsx`):
- `Page` union (also defined here): remove `'disk'`
- `PageContent` switch: remove `case 'disk'` branch
- Remove the `import DiskOverview ...` line

**Files deleted**:
- `src/components/disk/DiskOverview.tsx`

**Files moved** (no code change, just import path updates in callers):
- `src/components/disk/Treemap.tsx` → `src/components/files/Treemap.tsx`
- `src/components/disk/BigFiles.tsx` → `src/components/files/BigFiles.tsx`

**Directory cleanup**: after the move, `src/components/disk/` is empty. Delete the directory.

**Backend untouched**: `electron/collectors/disk.ts`, the disk Scheduler ticks, and the `disk_stats` SQLite table all keep working — Dashboard's Disk card and the historical aggregator still need them. Only the Disk **page UI** is removed.

### Files page Analyze view

The Files page gains a `viewMode: 'list' | 'analyze'` state. Default `'list'`. The PathBar gains a 📊 button that toggles between modes. The main content area (right of FileSidebar, below PathBar) renders one of two trees.

**filesStore additions:**
```ts
viewMode: 'list' | 'analyze'      // default 'list'
analyzeData: FileEntry | null      // result of queryDiskScan
analyzeLoading: boolean
analyzedPath: string | null        // path that analyzeData was scanned for
```

The existing `FileEntry` type (recursive, with `children?`) in `src/types.ts` is the right shape for `analyzeData` — that's what `queryDiskScan` already returns.

**filesStore actions:**
```ts
toggleAnalyze: () => Promise<void>     // entry-point for the 📊 button
rescanCurrent: () => Promise<void>     // for the "Scan {path}" button in Analyze header
```

`toggleAnalyze` semantics:
- If currently in `'list'`: switch to `'analyze'`. If `analyzedPath !== currentPath` or `analyzeData === null`, kick off a scan. Otherwise (cached), just flip `viewMode`.
- If currently in `'analyze'`: switch to `'list'`. Don't clear analyzeData (preserves cache for re-toggle).

`rescanCurrent`:
- Always set `analyzeLoading = true`, run `queryDiskScan(currentPath)`, store result and `analyzedPath = currentPath`.

**PathBar 📊 button**:
- Position: right side, after the existing 👁 toggle.
- Active state highlight when `viewMode === 'analyze'` (same visual treatment as 👁).
- `title` (tooltip): `t('files.toolbar.analyze')` when in list mode, `t('files.toolbar.list')` when in analyze mode.
- `onClick`: `filesStore.toggleAnalyze()`.

**Analyze view layout**:
```tsx
<div className="flex-1 flex flex-col p-4 overflow-y-auto">
  {/* Header strip */}
  <div className="flex items-center justify-between mb-4">
    <span className="text-xs font-mono text-text-muted">
      {t('files.analyze.analyzedPath', { path: analyzedPath })}
    </span>
    {analyzedPath !== currentPath && (
      <button onClick={rescanCurrent}
        className="px-3 py-1 text-xs font-mono bg-status-yellow text-bg-primary rounded">
        {t('files.analyze.scanCurrent', { path: currentPath })}
      </button>
    )}
  </div>

  {/* Loading / data / empty states */}
  {analyzeLoading && <Spinner label={t('files.analyze.loading', { path: analyzedPath })} />}
  {!analyzeLoading && analyzeData && (
    <>
      <Treemap data={analyzeData} onClickFile={(p) => window.api.revealFile(p)} />
      <BigFiles data={analyzeData} />
    </>
  )}
  {!analyzeLoading && !analyzeData && (
    <div className="text-text-muted">{t('files.analyze.treemapEmpty')}</div>
  )}
</div>
```

**Navigation in Analyze mode**:
- `currentPath` updates normally (PathBar input, [↑], [<], [>], Sidebar shortcuts all still work).
- `analyzedPath` and `analyzeData` are NOT auto-refreshed. The user sees the yellow "Scan {currentPath}" button when they diverge.
- This avoids unintended multi-second scans during navigation. Power users can re-scan explicitly.

**Cache invalidation**: when `currentPath` changes from inside the Files page, we keep `analyzeData` as-is. The user can switch back to List view and navigate without losing the previous scan. They click "Scan {newPath}" only when they want fresh analysis.

**Treemap and BigFiles**: code stays as-is (both already accept a `FileEntry` prop and don't depend on path/state). Only the import paths in their new callers change. They become co-located with the rest of the Files-page components.

### Keyboard shortcuts

A single `keydown` listener registered in `FilesPage.tsx` via `useEffect`. The listener routes to existing store actions / IPC calls.

**Focus guard**: skip dispatch when the active element is an `<input>`, `<textarea>`, or `[contenteditable]`:
```ts
const target = e.target as HTMLElement
if (target.matches('input, textarea, [contenteditable]')) return
```

**Modal guard**: skip dispatch when `ContextMenu` or `RenameInline` is open:
```ts
if (menu !== null || renamingPath !== null) return
```
The dispatcher reads `menu` and `renamingPath` from the FilesPage component's state via closure.

**Full dispatcher table** — 17 bindings:

| Key | Modifier | Condition | Action |
|---|---|---|---|
| ArrowUp | — | `visible.length > 0` | select previous row (last if no selection) |
| ArrowDown | — | `visible.length > 0` | select next row (first if no selection) |
| ArrowUp | Shift | selection non-empty + anchor | rangeSelect previous row |
| ArrowDown | Shift | selection non-empty + anchor | rangeSelect next row |
| ArrowUp | Cmd/Meta | `currentPath !== '/'` | `goUp()` |
| ArrowDown | Cmd/Meta | exactly one selected | open: file → `fsOpen` / dir → `navigate` |
| `[` | Cmd/Meta | `history.back.length > 0` | `goBack()` |
| `]` | Cmd/Meta | `history.forward.length > 0` | `goForward()` |
| `r` | Cmd/Meta | always | `refresh()` + `e.preventDefault()` (block native reload) |
| `r` | Cmd+Shift | exactly one selected | `revealFile(selected.path)` + `e.preventDefault()` |
| `a` | Cmd/Meta | `visible.length > 0` | `selectAll()` + `e.preventDefault()` |
| Escape | — | always | `clearSelection()` |
| Enter | — | exactly one selected | enter inline rename: `setRenamingPath(selected.path)` |
| Backspace | Cmd/Meta | selection non-empty | `fsTrash(selectedPaths)` |
| `c` | Cmd/Meta | selection non-empty | `setClipboard({ paths, op: 'copy' })` |
| `x` | Cmd/Meta | selection non-empty | `setClipboard({ paths, op: 'cut' })` |
| `v` | Cmd/Meta | clipboard non-null | paste (same logic as on-empty context menu's Paste) |
| `c` | Cmd+Shift | selection non-empty | `fsZip(selectedPaths, currentPath)` |

**`Cmd/Meta`** = `metaKey` on macOS, `ctrlKey` on Linux/Windows (matches Electron `accelerator` semantics, but we run macOS-only so `metaKey` suffices). Use `e.metaKey` in handler code.

**`prevRow` / `nextRow` calculation**:
```ts
function adjacentRow(direction: 'up' | 'down'): DirEntry | null {
  if (visible.length === 0) return null
  if (selection.size === 0) {
    return direction === 'up' ? visible[visible.length - 1] : visible[0]
  }
  const cursor = selectionAnchor ?? Array.from(selection)[0]
  const idx = visible.findIndex((e) => e.path === cursor)
  if (idx < 0) return visible[0]
  const next = direction === 'up' ? Math.max(0, idx - 1) : Math.min(visible.length - 1, idx + 1)
  return visible[next]
}
```

**`visible` derived data**: currently computed inside `FileList` via `useMemo`. Move this computation up to `filesStore` as a `getVisibleEntries()` selector (or compute inside `FilesPage` and pass to `FileList`). The keyboard dispatcher and FileList both need the same filtered+sorted list.

**Auto-scroll on keyboard selection change**:

In `FileList.tsx`, attach a ref map `rowRefs: Map<string, HTMLTableRowElement>`. After every render, find the selected row and call `.scrollIntoView({ block: 'nearest' })` if the selection just changed via keyboard. Use a useEffect with `selection` and `selectionAnchor` as deps; only scroll when `selectionAnchor` matches a known row.

```tsx
const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())

useEffect(() => {
  if (!selectionAnchor) return
  const el = rowRefs.current.get(selectionAnchor)
  if (el) el.scrollIntoView({ block: 'nearest' })
}, [selectionAnchor])
```

The mouse-driven `setSelection` already updates `selectionAnchor`, so this fires for both mouse and keyboard selections. Slight redundant work for mouse clicks (the row is already on-screen), but `block: 'nearest'` is a no-op when already visible.

## i18n changes

### Renderer dictionary

**Removed** (renderer en + zh-CN):
- `pages.disk`
- `sidebar.disk`
- `disk.io`, `disk.spaceHistory`, `disk.fileAnalysis`, `disk.scanPlaceholder`, `disk.scan`, `disk.scanning`, `disk.treemapEmpty`
- `disk.bigFiles.*` (6 sub-keys)

**Preserved** (still used by Dashboard's Overview card):
- `disk.used`, `disk.available`, `disk.total`

**Added**:

```ts
files: {
  toolbar: {
    // existing keys preserved...
    analyze: 'Analyze',          // tooltip when in list mode
    list: 'List view',           // tooltip when in analyze mode
  },
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
}
```

Chinese mirrors with translations:
- `analyze`: `'分析'` / `list`: `'列表视图'`
- `loading`: `'扫描 {path} 中…'` / `scanCurrent`: `'扫描 {path}'` / `rescan`: `'重新扫描'`
- `analyzedPath`: `'已分析：{path}'`
- `treemapEmpty`: `'暂无数据。点击 📊 分析当前目录。'`
- `bigFiles`: `'最大的 50 个文件 / # / 文件 / 大小 / 操作 / 在 Finder 中显示'`

### Main dictionary

No changes (Disk page didn't have main-process strings).

### Existing shape test

`tests/electron/i18n-shape.test.ts` automatically catches en/zh-CN parity for all changes.

## Component touch list

| File | Action |
|---|---|
| `src/components/layout/Sidebar.tsx` | Remove `'disk'` from `Page` union, `NAV_ICONS`, `NAV_ORDER` |
| `src/App.tsx` | Remove `'disk'` from `Page`, remove `case 'disk'` from `PageContent`, remove `DiskOverview` import |
| `src/components/disk/DiskOverview.tsx` | Delete |
| `src/components/disk/Treemap.tsx` | Move → `src/components/files/Treemap.tsx` |
| `src/components/disk/BigFiles.tsx` | Move → `src/components/files/BigFiles.tsx` |
| `src/components/disk/` | Delete empty directory |
| `src/components/files/FilesPage.tsx` | Add keyboard dispatcher (top-level useEffect); pass `viewMode` to layout switch; render Analyze view |
| `src/components/files/PathBar.tsx` | Add 📊 toggle button after 👁 |
| `src/components/files/FileList.tsx` | Move `useMemo` for visible up to caller; add row refs + auto-scroll on selectionAnchor change |
| `src/stores/filesStore.ts` | Add `viewMode`, `analyzeData`, `analyzeLoading`, `analyzedPath`; add `toggleAnalyze`, `rescanCurrent` actions; add `getVisibleEntries` selector (or compute in FilesPage) |
| `src/i18n/locales/en.ts` | Remove disk i18n (except used/available/total); add `files.toolbar.analyze/list`; add `files.analyze.*` namespace |
| `src/i18n/locales/zh-CN.ts` | Same shape, Chinese translations |

## Testing

No new test files required.

- `i18n-shape.test.ts` automatically catches en/zh-CN drift from the i18n changes.
- `fileSystem.test.ts`, `processControl.test.ts`, etc. are unaffected (no main-process changes).
- Keyboard dispatcher and Analyze view are React UI features with no existing renderer test infrastructure — verified via manual smoke testing per the existing project pattern.

## Risks

1. **`Cmd+R` reloads the Electron renderer by default.** Without `e.preventDefault()` in the dispatcher, the user loses Files page state, navigation history, clipboard, and Analyze cache on refresh. The dispatcher MUST call `preventDefault()` for Cmd+R, Cmd+Shift+R, and Cmd+A.

2. **Stale analyze data.** In Analyze mode, navigating with PathBar / Sidebar shortcuts shows the previous scan's data. Mitigated by the yellow "Scan {currentPath}" button + `analyzedPath` label so the user always sees the disconnect.

3. **Deep directory scans on `~/Library` or `/`** can take 30+ seconds. The user can switch back to List mode mid-scan; the scan continues in the background and updates `analyzeData` when done. No way to cancel a running scan in v1 — accepted (Activity Monitor lets you Force Quit DashMac if it really wedges).

4. **Keyboard dispatcher steals focus events from native inputs.** Mitigated by the focus guard checking input/textarea/contentEditable. Verified manually that PathBar input, RenameInline input, and (future) search inputs don't trigger file ops on typing.

5. **`Cmd+W` closes the window**, not "cancel current operation". This is macOS native behavior and we don't intercept. Users who hit Cmd+W mid-operation will lose UI state but no file data (operations are atomic on the main side).

6. **Auto-scroll on every selectionAnchor change** fires on mouse clicks too, not just keyboard. `scrollIntoView({ block: 'nearest' })` is a no-op when the row is already visible, so the cost is negligible (one DOM read).

7. **Disk page i18n key removal** — if any other component accidentally uses `t('disk.io')` etc. after the cleanup, the key falls back to the key string (with a dev warning). Grep before deleting to confirm no such callers exist.

## Acceptance criteria

- [ ] Sidebar shows 5 entries: Dashboard / Memory / Network / Files / Settings (no Disk)
- [ ] `src/components/disk/` directory deleted; `Treemap.tsx` and `BigFiles.tsx` now live in `src/components/files/`
- [ ] `DiskOverview.tsx` no longer exists
- [ ] Files page PathBar has a new 📊 button after 👁
- [ ] Click 📊 → Analyze view replaces FileList; first scan kicks off automatically
- [ ] Analyze view shows Treemap + BigFiles scrolling vertically; Reveal button on BigFiles rows still works (`window.api.revealFile`)
- [ ] In Analyze view, navigating to a different path shows yellow "Scan {newPath}" button; clicking it triggers a fresh scan
- [ ] Click 📊 again → back to List view; `analyzeData` preserved (re-toggle skips re-scan when path unchanged)
- [ ] All 17 keyboard shortcuts work as specified in the dispatcher table
- [ ] `Cmd+R` does NOT reload the page (preventDefault); calls store's `refresh()` action instead
- [ ] Typing in PathBar input or RenameInline does NOT trigger file ops (focus guard works)
- [ ] Keyboard ↑/↓ moves selection; selected row scrolls into view if off-screen
- [ ] Chinese locale: 📊 tooltip, Analyze view labels, scan button, "Analyzing:" all in Chinese
- [ ] `npm test` passes (no new tests, but i18n-shape catches dictionary updates)
- [ ] `npm run build` passes
