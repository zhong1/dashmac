# Dashboard Shortcuts + Cross-Page Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Add to Shortcuts" right-click menu in Files; render a Dashboard shortcut list; double-click any Dashboard module card or shortcut row to navigate (Disk → Files Analyze view at `/`).

**Architecture:** Pure renderer-side changes. No IPC or main-process work. Plumb a new `onNavigate` prop from `App.tsx`'s `PageContent` to `Overview`, add a new `enterAnalyze(path)` Zustand action to `filesStore`, fix `FilesPage`'s mount effect to preserve last-visited path, and add the right-click menu entry that calls existing `saveSettings`.

**Tech Stack:** React 19 + TypeScript strict + Zustand + Tailwind 4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-29-dashboard-shortcuts-design.md`

---

## File Structure

**Modified:**
- `src/i18n/locales/en.ts` — add `files.contextMenu.addToShortcuts`, `dashboard.shortcuts.{title,empty}`
- `src/i18n/locales/zh-CN.ts` — same shape, Chinese values
- `src/stores/filesStore.ts` — add `enterAnalyze(path)` action
- `src/components/files/FilesPage.tsx` — extend `rowMenuItems` with "Add to Shortcuts"; change mount effect
- `src/App.tsx` — extend `PageContent` with `onNavigate` prop forwarded to Overview
- `src/components/dashboard/Overview.tsx` — accept `onNavigate` prop; double-click handlers on cards; render shortcut list section

---

## Conventions

- **No new tests** — feature is composable from existing IPC and existing store; existing `i18n-shape.test.ts` covers locale changes; manual smoke verifies the rest.
- **Imports** use no `.tsx`/`.ts` suffixes.
- **Build verification:** `npm run build`; type errors surface there.
- **TS strict check:** `npx tsc --noEmit` after each task; pre-existing chart/network errors are unchanged and unrelated.
- **Working directory** is the project root or worktree root (the executing skill sets this up).

---

## Task 1: i18n additions

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh-CN.ts`

Add `files.contextMenu.addToShortcuts` and a new `dashboard.shortcuts.{title, empty}` namespace.

- [ ] **Step 1: Update `src/i18n/locales/en.ts`**

(a) Find the existing `files.contextMenu` block. It currently looks like:

```ts
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
```

Add a new key `addToShortcuts: 'Add to Shortcuts'` (place it after `revealInFinder` for logical grouping):

```ts
contextMenu: {
  open: 'Open',
  rename: 'Rename',
  copy: 'Copy',
  cut: 'Cut',
  trash: 'Move to Trash',
  zip: 'Compress to ZIP',
  revealInFinder: 'Show in Finder',
  addToShortcuts: 'Add to Shortcuts',
  newFolder: 'New Folder',
  newFile: 'New File',
  paste: 'Paste',
},
```

(b) Add a new top-level `dashboard` namespace (place it before `tray` or alongside other top-level keys):

```ts
dashboard: {
  shortcuts: {
    title: 'Shortcuts',
    empty: 'No shortcuts yet. Right-click a folder in Files to add one.',
  },
},
```

- [ ] **Step 2: Update `src/i18n/locales/zh-CN.ts`**

Mirror the same changes with Chinese values:

(a) Add `addToShortcuts` to `files.contextMenu`:
```ts
addToShortcuts: '添加到快捷目录',
```

(b) Add the `dashboard` namespace:
```ts
dashboard: {
  shortcuts: {
    title: '快捷目录',
    empty: '暂无快捷目录。在文件页右键文件夹添加。',
  },
},
```

- [ ] **Step 3: Run shape parity test**

Run: `npx vitest run tests/electron/i18n-shape.test.ts`
Expected: 2 passing.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "i18n/locales" || echo "no errors in locales"`
Expected: `no errors in locales`.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/zh-CN.ts
git commit -m "feat(i18n): add files.contextMenu.addToShortcuts and dashboard.shortcuts"
```

---

## Task 2: filesStore — `enterAnalyze` action

**File:**
- Modify: `src/stores/filesStore.ts`

Add a single new async action that always lands in Analyze mode at the given path. Idempotent: re-calling with the same path doesn't re-scan.

- [ ] **Step 1: Add the action signature to `FilesState`**

In `src/stores/filesStore.ts`, find the `FilesState` interface. After the existing action signatures (e.g., `rescanCurrent: () => Promise<void>`), add:

```ts
enterAnalyze: (path: string) => Promise<void>
```

- [ ] **Step 2: Add the implementation**

In the `create<FilesState>(...)` body, after the existing `rescanCurrent` implementation, add:

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

This composes from existing pieces:
- `get().navigate(path)` updates `currentPath` and lists the directory (renderer-side existing action)
- `set({ viewMode: 'analyze' })` switches to Analyze view
- The cache check (`analyzedPath !== path`) avoids redundant scans

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/stores/filesStore.ts
git commit -m "feat(files): add enterAnalyze action for direct Analyze-mode navigation"
```

---

## Task 3: FilesPage — right-click "Add to Shortcuts" + mount-effect fix

**File:**
- Modify: `src/components/files/FilesPage.tsx`

Two unrelated but small changes to the same file: (a) extend the row context menu with a new "Add to Shortcuts" item; (b) modify the mount effect so it preserves last-visited path across tab switches.

- [ ] **Step 1: Extend `rowMenuItems`**

Find the `rowMenuItems` function (around line 203). It currently looks roughly like:

```tsx
const rowMenuItems = (entry: DirEntry): MenuItem[] => {
  const targets = targetsForRowMenu(entry)
  const isMulti = targets.length > 1
  return [
    { label: t('files.contextMenu.open'), disabled: isMulti, onClick: ... },
    { label: t('files.contextMenu.rename'), disabled: isMulti, onClick: ... },
    { label: '', separator: true, onClick: () => {} },
    { label: t('files.contextMenu.copy'), onClick: ... },
    { label: t('files.contextMenu.cut'), onClick: ... },
    { label: t('files.contextMenu.trash'), onClick: ... },
    { label: t('files.contextMenu.zip'), onClick: ... },
    { label: '', separator: true, onClick: () => {} },
    { label: t('files.contextMenu.revealInFinder'), onClick: () => window.api.revealFile(entry.path) },
  ]
}
```

After the `revealInFinder` entry, append a separator and the new `addToShortcuts` item. The final `revealInFinder` entry plus what we add becomes:

```tsx
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
}
```

The `disabled` check inspects each target path — if any isn't found in `visible` or isn't a directory, the menu item is greyed.

- [ ] **Step 2: Modify the mount effect to preserve last-visited path**

Find the mount effect that currently looks like:

```tsx
useEffect(() => { navigate('~') }, [navigate])
```

Replace with:

```tsx
useEffect(() => {
  // Preserve last-visited path across tab switches: only navigate to home
  // when the store is in its default state (currentPath === '/').
  // Reading via getState() avoids re-running this effect when currentPath changes.
  if (useFilesStore.getState().currentPath === '/') navigate('~')
}, [navigate])
```

The new behavior: first launch (default `currentPath = '/'`) → navigates to home. Subsequent tab switches → keeps wherever the user (or Dashboard) left it. Dashboard's shortcut double-click pre-sets `currentPath` via `navigate(path)` before switching the page, so this effect skips its home-default — landing the user on the requested path.

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: TS strict check**

Run: `npx tsc --noEmit 2>&1 | grep -E "FilesPage" || echo "no errors in FilesPage"`
Expected: `no errors in FilesPage`.

- [ ] **Step 5: Commit**

```bash
git add src/components/files/FilesPage.tsx
git commit -m "feat(files): add Add to Shortcuts menu item and preserve last-visited path"
```

---

## Task 4: App.tsx — extend `PageContent` with `onNavigate` prop

**File:**
- Modify: `src/App.tsx`

Add an `onNavigate` prop to `PageContent` and forward it to `<Overview>` only. Other pages don't need it.

- [ ] **Step 1: Update `PageContent` signature**

Find the `PageContent` component. It currently looks like:

```tsx
function PageContent({ page }: { page: Page }) {
  switch (page) {
    case 'dashboard': return <Overview />
    case 'memory': return <MemoryOverview />
    case 'network': return <NetworkOverview />
    case 'files': return <FilesPage />
    case 'settings': return <Settings />
  }
}
```

Replace with:

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

- [ ] **Step 2: Pass `onNavigate` from `MainApp`**

In `MainApp`, find the `<PageContent>` JSX call (it's currently `<PageContent page={page} />`). Update to pass `onNavigate={setPage}`:

```tsx
<PageContent page={page} onNavigate={setPage} />
```

`setPage` is already the `useState` setter for `Page`.

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: errors in `Overview.tsx` because the prop doesn't yet exist there. That's expected — Task 5 fixes it.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): plumb onNavigate prop from PageContent to Overview"
```

---

## Task 5: Overview — accept `onNavigate` + double-click handlers + shortcut list

**File:**
- Modify: `src/components/dashboard/Overview.tsx`

The biggest task in this plan. Three additions:
- Accept `onNavigate` prop
- Add double-click handlers to the existing 3 module cards
- Render a new "Shortcuts" section below the cards

- [ ] **Step 1: Read the current file**

Run: `cat src/components/dashboard/Overview.tsx`
Confirm the existing structure: the 3 cards rendered side-by-side in a grid, no props on the component, no shortcut list.

- [ ] **Step 2: Add imports**

At the top of `src/components/dashboard/Overview.tsx`, add (or extend) imports:

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from '../../i18n/index'
import { useFilesStore } from '../../stores/filesStore'
```

The existing imports (e.g. `useSystemStore`, `formatBytes`) stay. Don't double-add things that are already there.

The `Page` type comes from `App.tsx`'s union but isn't exported as a separate type. Define a local one or just inline `'dashboard' | 'memory' | 'network' | 'files' | 'settings'`. Inline is acceptable for one prop type.

- [ ] **Step 3: Update the component signature and add state**

Change the function signature:

```tsx
type Page = 'dashboard' | 'memory' | 'network' | 'files' | 'settings'

export default function Overview({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { t } = useTranslation()
  // ... existing useSystemStore selectors stay ...
  const [shortcuts, setShortcuts] = useState<string[]>([])

  useEffect(() => {
    window.api.getSettings().then((s) => setShortcuts(s.fileShortcuts ?? []))
  }, [])

  // ... existing render logic ...
}
```

- [ ] **Step 4: Add double-click handlers**

Add these handler functions inside `Overview` (anywhere before the `return`):

```tsx
const handleCardDoubleClick = (kind: 'memory' | 'disk' | 'network') => {
  if (kind === 'memory') onNavigate('memory')
  else if (kind === 'network') onNavigate('network')
  else {
    // Disk → Files page in Analyze view scanning '/'.
    // Use getState() because this is an event handler, not a subscription.
    useFilesStore.getState().enterAnalyze('/')
    onNavigate('files')
  }
}

const handleShortcutDoubleClick = (path: string) => {
  // getState() pattern: read store action without subscribing.
  useFilesStore.getState().navigate(path)
  onNavigate('files')
}
```

- [ ] **Step 5: Wire double-click on the existing 3 cards**

Find the existing 3 card `<div>` elements (Memory / Disk / Network). Each currently has `className="bg-bg-secondary border border-border-primary rounded-lg p-4"`. Add `onDoubleClick` and `cursor-pointer hover:bg-bg-tertiary` to each one:

For Memory card:
```tsx
<div onDoubleClick={() => handleCardDoubleClick('memory')}
     className="bg-bg-secondary border border-border-primary rounded-lg p-4 cursor-pointer hover:bg-bg-tertiary">
  ... existing memory card content ...
</div>
```

For Disk card:
```tsx
<div onDoubleClick={() => handleCardDoubleClick('disk')}
     className="bg-bg-secondary border border-border-primary rounded-lg p-4 cursor-pointer hover:bg-bg-tertiary">
  ... existing disk card content ...
</div>
```

For Network card:
```tsx
<div onDoubleClick={() => handleCardDoubleClick('network')}
     className="bg-bg-secondary border border-border-primary rounded-lg p-4 cursor-pointer hover:bg-bg-tertiary">
  ... existing network card content ...
</div>
```

- [ ] **Step 6: Add the Shortcuts section below the cards**

After the existing 3-card grid `<div>` (the parent of the three cards), add:

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
          onDoubleClick={() => handleShortcutDoubleClick(p)}
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

The wrapping `<div className="space-y-4">` (or whatever the existing top-level Overview wrapper uses) keeps the visual gap between the 3-card grid and the shortcuts section.

- [ ] **Step 7: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 8: TS strict check**

Run: `npx tsc --noEmit 2>&1 | grep -E "Overview\.tsx" || echo "no errors in Overview"`
Expected: `no errors in Overview`.

- [ ] **Step 9: Commit**

```bash
git add src/components/dashboard/Overview.tsx
git commit -m "feat(dashboard): double-click navigation on cards and shortcut list section"
```

---

## Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: existing tests pass; total count unchanged (no new tests).

- [ ] **Step 2: Run the full build**

Run: `npm run build`
Expected: success across main, preload, and renderer bundles.

- [ ] **Step 3: TypeScript strict-mode check**

Run: `npx tsc --noEmit 2>&1 | grep -E "files/|dashboard/|App\.tsx|i18n/locales|stores/" || echo "no errors in scope"`
Expected: `no errors in scope`. Pre-existing errors in chart components and treemap are unrelated to this work.

- [ ] **Step 4: Manual smoke test (macOS)**

Run: `npm run dev`

Verify in the running app:

**Files page right-click:**
- Open Files. Right-click a single directory → menu shows "Add to Shortcuts" enabled → click → shortcut appears in FileSidebar; toast confirms
- Right-click the same directory again → "Add to Shortcuts" still appears → click → info toast (already exists)
- Right-click a single file → "Add to Shortcuts" greyed
- ⌘+click two directories + ⌘+click one file → right-click → "Add to Shortcuts" greyed
- Select two directories (no files) → right-click one of them → "Add to Shortcuts" enabled → click → both appear in shortcuts

**Files mount-effect:**
- Navigate to `~/Documents` in Files page. Switch to Memory page. Switch back to Files. Confirm path is still `~/Documents` (not reset to `~`).

**Dashboard:**
- Click Dashboard tab. Confirm Memory / Disk / Network cards display normally with their stats.
- Confirm the new "Shortcuts" section appears below.
- If `fileShortcuts` is empty: section shows "No shortcuts yet..." text.
- If non-empty: each row shows 📁 + basename + full path; hover shows tooltip of full path.
- Double-click Memory card → switches to Memory page.
- Double-click Network card → switches to Network page.
- Double-click Disk card → switches to Files page; Analyze view active; spinner shows while scanning `/`; Treemap renders after scan.
- Double-click a shortcut row → switches to Files page; current path equals the shortcut's path.

**Chinese locale:**
- Settings → Appearance → Language → 简体中文.
- Confirm:
  - Files row right-click menu: "添加到快捷目录"
  - Dashboard section header: "快捷目录"
  - Empty state: "暂无快捷目录。在文件页右键文件夹添加。"

- [ ] **Step 5: Confirm clean tree**

```bash
git status
```

If smoke testing surfaced inline fixes, commit them. Otherwise tree is clean.

---

## Acceptance criteria recap

- [ ] Right-click a single directory → "Add to Shortcuts" enabled
- [ ] Right-click a single file → "Add to Shortcuts" greyed
- [ ] Multi-select containing any file → "Add to Shortcuts" greyed
- [ ] Multi-select all directories → "Add to Shortcuts" enabled; all added; toast on success
- [ ] Add to Shortcuts on already-existing path → info toast, no duplicate
- [ ] Dashboard renders Memory / Disk / Network cards as before
- [ ] Dashboard shows new Shortcuts section below cards
- [ ] Empty state text appears when `fileShortcuts.length === 0`
- [ ] Double-click Memory card → switches to Memory page
- [ ] Double-click Network card → switches to Network page
- [ ] Double-click Disk card → switches to Files page, Analyze view active, scanning `/`
- [ ] Double-click a shortcut row → switches to Files page, current path is the shortcut's path
- [ ] Files → Memory → Files preserves last-visited path
- [ ] First launch (default `/` path) → Files lands on home (`~`) on first mount
- [ ] Chinese locale renders all new strings in Chinese
- [ ] `npm test` passes
- [ ] `npm run build` passes
