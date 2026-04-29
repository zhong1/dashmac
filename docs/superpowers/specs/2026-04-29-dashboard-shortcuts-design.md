# Dashboard Shortcuts + Cross-Page Navigation

**Date:** 2026-04-29
**Status:** Design approved, pending implementation

## Goals

Three related changes that tie the Dashboard, Files, and Sidebar surfaces together:

1. **Right-click menu** in Files: add an "Add to Shortcuts" item that appends the selected directory (or directories, in multi-select) to `AppSettings.fileShortcuts`. Disabled when any selected entry is a file.
2. **Dashboard shortcut list**: a new section below the existing Memory / Disk / Network cards that lists the user's `fileShortcuts` as a read-only, double-click-to-jump list.
3. **Double-click navigation** on Dashboard: each module card and shortcut row jumps to the corresponding page. Disk card double-click specifically lands on Files → Analyze view scanning `/`.

## Non-Goals

- Reordering shortcuts on the Dashboard (use the FileSidebar drag handle for that)
- Right-click delete on the Dashboard (use FileSidebar's right-click for that)
- Real-time cross-component sync of `fileShortcuts` (Dashboard re-fetches on mount)
- Single-click action on Dashboard cards (only double-click navigates)
- Memory or Network card double-click with extra parameters (process focus, connection filter, etc.)
- Recently-used / favorite / grouped shortcuts
- Bulk-add via drag-from-FileList (drag-drop excluded earlier)

## Architecture

Pure renderer changes, no IPC or main-process work:

- `src/components/files/FilesPage.tsx` — extend `rowMenuItems` with the new "Add to Shortcuts" entry; modify the FilesPage mount effect to preserve last-visited path
- `src/components/dashboard/Overview.tsx` — accept `onNavigate` prop; add card double-click handlers; render the new shortcut list section
- `src/App.tsx` — extend `PageContent` to forward `onNavigate` to Overview
- `src/stores/filesStore.ts` — add `enterAnalyze(path)` action
- `src/i18n/locales/en.ts` and `zh-CN.ts` — three new strings

## Right-click "Add to Shortcuts"

Inserted into `rowMenuItems` (in `FilesPage.tsx`) just before the "Show in Finder" entry, with a separator after it:

```tsx
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
{ label: '', separator: true, onClick: () => {} },
```

**Disabled rules:**
- Single-select on a file → disabled (the one entry isn't a directory)
- Multi-select containing any file → disabled
- Multi-select all directories → enabled
- Single-select on a directory → enabled

**Existence handling:**
- `Set` filters out paths already in `fileShortcuts`; only new ones get appended
- All targets already exist → info toast, no save call
- At least one new → save and success toast (we don't differentiate "added 1" vs "added 3" to avoid pluralization in i18n)

**Reuses existing toasts:** `files.toast.addedShortcut` and `files.toast.shortcutExists` are already in the i18n dictionary from the original sidebar add flow.

## Dashboard shortcut list

Added to `src/components/dashboard/Overview.tsx`. Layout: existing 3-card grid stays as-is; below it sits a new full-width section.

```tsx
<div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
  <h3 className="text-sm font-medium text-text-primary mb-3">
    {t('dashboard.shortcuts.title')}
  </h3>
  {shortcuts.length === 0 ? (
    <div className="text-xs text-text-muted py-2">{t('dashboard.shortcuts.empty')}</div>
  ) : (
    <div className="flex flex-col gap-1">
      {shortcuts.map((p) => (
        <div
          key={p}
          onDoubleClick={() => handleDoubleClick(p)}
          title={p}
          className="flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer hover:bg-bg-tertiary"
        >
          <span className="text-base">📁</span>
          <span className="text-sm font-mono text-text-primary truncate flex-1">
            {p.split('/').pop() || p}
          </span>
          <span className="text-xs font-mono text-text-muted truncate">{p}</span>
        </div>
      ))}
    </div>
  )}
</div>
```

**Data**: local `useState<string[]>`; fetched on mount via `window.api.getSettings()`. No live sync — switching from Files back to Dashboard remounts the component and re-fetches.

**Empty state**: text guides the user to add via Files page right-click. Doesn't try to show buttons or quick-add UI on Dashboard (would mirror functionality already in Sidebar / FileList).

## Double-click navigation

The existing 3 module cards (Memory / Disk / Network) and each shortcut row become double-click-able. Single click does nothing (matches existing behavior of read-only cards).

### Plumbing

`Overview` accepts an `onNavigate` prop:

```tsx
export default function Overview({ onNavigate }: { onNavigate: (page: Page) => void }) { ... }
```

`App.tsx`'s `PageContent` forwards `setPage` only to Overview:

```tsx
function PageContent({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  switch (page) {
    case 'dashboard': return <Overview onNavigate={onNavigate} />
    case 'memory': return <MemoryOverview />
    case 'network': return <NetworkOverview />
    case 'files': return <FilesPage />
    case 'settings': return <Settings />
  }
}
```

`MainApp` calls `<PageContent page={page} onNavigate={setPage} />`.

### Card double-click handler

```tsx
const handleCardDoubleClick = (kind: 'memory' | 'disk' | 'network') => {
  if (kind === 'memory') onNavigate('memory')
  else if (kind === 'network') onNavigate('network')
  else {  // 'disk'
    useFilesStore.getState().enterAnalyze('/')
    onNavigate('files')
  }
}

// Each existing card gets onDoubleClick + cursor-pointer:
<div onDoubleClick={() => handleCardDoubleClick('memory')}
     className="bg-bg-secondary border border-border-primary rounded-lg p-4 cursor-pointer hover:bg-bg-tertiary">
  ... existing memory card content ...
</div>
```

### Shortcut row double-click handler

```tsx
const handleDoubleClick = (path: string) => {
  useFilesStore.getState().navigate(path)
  onNavigate('files')
}
```

**Order matters**: store action **before** `onNavigate('files')`. The store update is synchronous-from-the-renderer's-perspective (the IPC `listDirectory` is async, but the optimistic `set({ currentPath: target })` happens during the action). When FilesPage mounts, its `useFilesStore` selectors read the freshly-set state.

### `enterAnalyze` store action

New action on `filesStore`. Idempotent (multi-clicks don't re-scan).

```ts
enterAnalyze: async (path: string) => {
  await get().navigate(path)
  set({ viewMode: 'analyze' })
  if (get().analyzedPath !== path || get().analyzeData === null) {
    set({ analyzeLoading: true })
    try {
      const data = await window.api.queryDiskScan(path)
      set({ analyzeData: data, analyzedPath: path, analyzeLoading: false })
    } catch {
      set({ analyzeLoading: false })
    }
  }
},
```

**Why a separate action vs reusing `toggleAnalyze`**: `toggleAnalyze` flips between modes. If FilesPage was last in Analyze mode, `toggleAnalyze` would switch *out* — wrong. `enterAnalyze` always lands in Analyze mode regardless of prior state.

### FilesPage mount-effect fix (preserves last-visited path)

The current `FilesPage.tsx` always navigates to home on mount:

```tsx
useEffect(() => { navigate('~') }, [navigate])
```

This forces the path back to `~` every time the user enters the Files tab — overriding whatever Dashboard pre-set. Fix:

```tsx
useEffect(() => {
  if (useFilesStore.getState().currentPath === '/') navigate('~')
}, [navigate])
```

Default `currentPath` after first launch is `'/'`. The mount effect treats that as "no specific path requested, use home". Once the user has navigated anywhere (or Dashboard pre-sets a path), `currentPath !== '/'`, and the mount effect skips home-default — preserving last-visited path across tab switches.

**Side benefit**: switching from Files → Memory → back to Files no longer resets to home. This matches user expectation for tab-style navigation.

**`useFilesStore.getState()` in `useEffect`**: reading state without subscribing. Avoids re-running the effect when `currentPath` changes externally. The effect's only job is initial home-default.

## i18n changes

Three new strings, no removals.

`src/i18n/locales/en.ts` additions:

```ts
files: {
  // ... existing keys preserved ...
  contextMenu: {
    // ... existing keys preserved ...
    addToShortcuts: 'Add to Shortcuts',
  },
},

dashboard: {
  shortcuts: {
    title: 'Shortcuts',
    empty: 'No shortcuts yet. Right-click a folder in Files to add one.',
  },
},
```

`src/i18n/locales/zh-CN.ts` mirrors:

```ts
files: {
  contextMenu: {
    addToShortcuts: '添加到快捷目录',
  },
},

dashboard: {
  shortcuts: {
    title: '快捷目录',
    empty: '暂无快捷目录。在文件页右键文件夹添加。',
  },
},
```

The existing `dashboard` namespace already exists at top level (it covers nothing currently — Dashboard cards use `overview.*` keys). We add `shortcuts` as a nested sub-namespace within it.

The existing `files.toast.addedShortcut` and `files.toast.shortcutExists` are reused (no new keys for the right-click toasts).

## Files touched

**Modified:**
- `src/components/files/FilesPage.tsx` — add right-click menu item; change mount effect
- `src/components/dashboard/Overview.tsx` — accept `onNavigate` prop; add card double-click handlers; render shortcut list section
- `src/App.tsx` — extend `PageContent` with `onNavigate` prop forwarded to Overview
- `src/stores/filesStore.ts` — add `enterAnalyze(path)` action
- `src/i18n/locales/en.ts` — `files.contextMenu.addToShortcuts`, `dashboard.shortcuts.{title,empty}`
- `src/i18n/locales/zh-CN.ts` — same shape, Chinese values

## Testing

No new test files. Coverage:
- Existing `i18n-shape.test.ts` automatically catches en/zh-CN drift on the three new keys
- Other tests unaffected (no main-process or store-test-covered changes — `enterAnalyze` is composed of existing `navigate` and `queryDiskScan` calls)
- Manual smoke test in §Acceptance Criteria

## Risks

1. **Disk-card double-click triggers `/` scan**: scanning the root takes 30+ seconds on most macs. The user explicitly clicks (double-click is intentional), and the Analyze view shows a loading spinner with the path being scanned. Accepted.

2. **`useFilesStore.getState()` in event handlers**: pattern is correct (read latest snapshot, no subscription needed). Add a one-line comment in `Overview.tsx` next to the call so future readers don't mistake it for the hook form.

3. **Mount-effect change alters habituation**: existing users who returned to Files always landing on home will now land where they left off. This is more conventional but a behavior change. Risk low; spec documents it.

4. **Multi-select add with mixed-existence**: e.g., 3 dirs selected, 1 already in shortcuts. Current logic adds the 2 new and shows success toast. Doesn't say "added 2 of 3 (1 was already there)". Acceptable simplification.

5. **Dashboard shortcut list out-of-sync with FileSidebar reorder**: if the user reorders in Sidebar then immediately switches back to Dashboard, they should see the new order — Dashboard remounts on tab switch, re-fetches settings, new order displays. ✓ This works with the chosen mount-fetch design.

6. **Shortcut path getting deleted externally**: clicking a dead shortcut from Dashboard → `navigate(path)` will set `dirError` in store; FilesPage will show the error overlay with a Retry button. The dead shortcut isn't auto-removed from `fileShortcuts` here (only Sidebar's click handler does that). Inconsistent but acceptable — user can either retry or go to Sidebar to clean up.

## Acceptance Criteria

- [ ] Right-click a single directory in Files → menu shows "Add to Shortcuts" enabled
- [ ] Right-click a single file → menu shows "Add to Shortcuts" greyed
- [ ] Multi-select containing any file → "Add to Shortcuts" greyed
- [ ] Multi-select all directories → "Add to Shortcuts" enabled; all added on click
- [ ] Click "Add to Shortcuts" on a directory already in shortcuts → info toast, no duplicate
- [ ] Dashboard renders Memory / Disk / Network cards as before
- [ ] Dashboard shows new "Shortcuts" section below cards
- [ ] When `fileShortcuts` is empty, the section shows the empty-state guidance text
- [ ] When non-empty, each shortcut row shows 📁 + basename + full path with hover tooltip
- [ ] Double-click Memory card → switches to Memory page
- [ ] Double-click Network card → switches to Network page
- [ ] Double-click Disk card → switches to Files page, Analyze view active, scanning `/`
- [ ] Double-click a shortcut row → switches to Files page, current path is the shortcut's path
- [ ] Switching Files → Memory → Files preserves last-visited path (no auto-home)
- [ ] First launch (no path set) → Files mount effect navigates to `~` (default home)
- [ ] In Chinese locale, all new strings render in Chinese
- [ ] `npm test` passes; `npm run build` passes
