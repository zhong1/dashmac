# Shortcut Drag-to-Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag-reorder the user-added shortcut entries in `FileSidebar`. New order persists to `settings.json`. System entries (`/`, `~`) stay fixed.

**Architecture:** Single-file change in `src/components/files/FileSidebar.tsx`. Adds two `useState` hooks (`dragIndex`, `dragOverIndex`) and HTML5 native drag-and-drop handlers to each shortcut row. Reuses the existing `saveSettings` IPC for persistence. No new dependencies, no store changes, no IPC changes, no i18n changes.

**Tech Stack:** React 19 + TypeScript strict + Tailwind 4. HTML5 Drag and Drop API (browser-native).

**Spec:** `docs/superpowers/specs/2026-04-29-shortcut-reorder-design.md`

---

## File Structure

**Modified:**
- `src/components/files/FileSidebar.tsx` — add drag state, drag handlers, insertion-line markup, `handleDrop` action, drop target div for end-of-list

---

## Conventions

- **No new tests** — feature is pure UI on existing data, manual smoke verifies.
- **Imports** use no `.js`/`.tsx` suffixes.
- **Build verification:** `npm run build` (electron-vite); type errors surface there.
- **Commit message:** `feat(files): drag-to-reorder shortcuts in FileSidebar`
- **Working directory** is the project root or worktree root (the executing skill will set this up).

---

## Task 1: Add drag-to-reorder to FileSidebar

**File:**
- Modify: `src/components/files/FileSidebar.tsx`

Replace the file content entirely. The new version preserves all existing functionality (click → navigate, right-click → remove, "+ Add current folder" button, dead-shortcut auto-removal) and adds the drag-reorder behavior described in the spec.

- [ ] **Step 1: Replace the file**

Replace the entire content of `src/components/files/FileSidebar.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from '../../i18n/index'
import { useFilesStore } from '../../stores/filesStore'
import { useToast } from '../../stores/toastStore'

export default function FileSidebar() {
  const { t } = useTranslation()
  const toast = useToast()
  const currentPath = useFilesStore((s) => s.currentPath)
  const navigate = useFilesStore((s) => s.navigate)
  const [shortcuts, setShortcuts] = useState<string[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  useEffect(() => {
    window.api.getSettings().then((s) => setShortcuts(s.fileShortcuts ?? []))
  }, [])

  const removeShortcut = async (p: string) => {
    const settings = await window.api.getSettings()
    const next = (settings.fileShortcuts ?? []).filter((s) => s !== p)
    await window.api.saveSettings({ ...settings, fileShortcuts: next })
    setShortcuts(next)
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

  const handleClickShortcut = async (p: string) => {
    const r = await window.api.listDirectory(p)
    if (r.ok) {
      navigate(p)
    } else if (r.errno === 'ENOENT') {
      removeShortcut(p)
      toast.error(t('files.toast.shortcutRemovedDeleted'))
    } else {
      navigate(p)
    }
  }

  const handleDrop = async (toIndex: number) => {
    if (dragIndex === null || dragIndex === toIndex) {
      setDragIndex(null); setDragOverIndex(null); return
    }
    const next = [...shortcuts]
    const [moved] = next.splice(dragIndex, 1)
    // After removing the source, indices past the source position shift left by one,
    // so when dragging downward, the desired insertion index is one less.
    const insertAt = dragIndex < toIndex ? toIndex - 1 : toIndex
    next.splice(insertAt, 0, moved)
    setShortcuts(next)
    setDragIndex(null); setDragOverIndex(null)
    if (next[insertAt] === shortcuts[dragIndex] && shortcuts.every((p, i) => p === next[i])) {
      // No-op safeguard (shouldn't happen given the early return above, but cheap)
      return
    }
    const settings = await window.api.getSettings()
    await window.api.saveSettings({ ...settings, fileShortcuts: next })
  }

  const addDisabled = currentPath === '/' || shortcuts.includes(currentPath)

  return (
    <aside className="w-48 h-full bg-bg-secondary border-r border-border-primary flex flex-col text-xs font-mono">
      <div className="px-3 py-2 text-text-muted uppercase tracking-wider">{t('files.sidebar.shortcuts')}</div>
      <div className="flex-1 overflow-y-auto">
        {shortcuts.map((p, i) => (
          <div key={p} className="relative">
            {dragOverIndex === i && dragIndex !== null && dragIndex !== i && (
              <div className="absolute left-0 right-0 h-[2px] bg-status-blue -top-[1px] z-10 pointer-events-none" />
            )}
            <button
              draggable
              onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i) }}
              onDrop={(e) => { e.preventDefault(); handleDrop(i) }}
              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
              onClick={() => handleClickShortcut(p)}
              onContextMenu={(e) => { e.preventDefault(); removeShortcut(p) }}
              className={`block w-full text-left px-3 py-1.5 hover:bg-bg-tertiary truncate ${
                currentPath === p ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary'
              } ${dragIndex === i ? 'opacity-40' : ''}`}
              title={p}
            >
              📁 {p.split('/').pop() || p}
            </button>
          </div>
        ))}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOverIndex(shortcuts.length) }}
          onDrop={(e) => { e.preventDefault(); handleDrop(shortcuts.length) }}
          className="relative h-1"
        >
          {dragOverIndex === shortcuts.length && dragIndex !== null && (
            <div className="absolute left-0 right-0 h-[2px] bg-status-blue top-0 z-10 pointer-events-none" />
          )}
        </div>
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

Key differences vs the current file:
- Two new `useState` hooks: `dragIndex` and `dragOverIndex`
- New `handleDrop` async function that splices, optimistically updates UI, and persists
- Each shortcut button is wrapped in a `<div className="relative">` so the insertion-line indicator can be absolutely positioned above it
- `<button>` gets `draggable` plus four drag handlers (`onDragStart`, `onDragOver`, `onDrop`, `onDragEnd`)
- A new 1px-tall drop target `<div>` after the shortcuts loop accepts drops at the end-of-list (index = `shortcuts.length`)
- Source row gets `opacity-40` when `dragIndex === i`
- All existing functionality (click navigate, right-click remove, dead-shortcut handling, "+ Add" button) preserved verbatim

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: TypeScript strict-mode check**

Run: `npx tsc --noEmit 2>&1 | grep -E "FileSidebar" || echo "no errors in FileSidebar"`
Expected: `no errors in FileSidebar`.

- [ ] **Step 4: Commit**

```bash
git add src/components/files/FileSidebar.tsx
git commit -m "feat(files): drag-to-reorder shortcuts in FileSidebar"
```

---

## Task 2: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: existing 111 + 4 skipped = 115. No new tests; no regressions.

- [ ] **Step 2: Run the full build**

Run: `npm run build`
Expected: success across main, preload, renderer.

- [ ] **Step 3: Manual smoke test (macOS)**

Run: `npm run dev`

Click Files in the sidebar. Add at least 3 shortcuts via the "+" button (e.g., navigate to `~/Documents`, click "+", navigate to `~/Desktop`, click "+", navigate to `~/Downloads`, click "+"). Then verify:

- Shortcuts list shows all three; system section (`/`, `~`) below
- Hover any shortcut → cursor turns into a grab indicator (browser default)
- Click and hold a shortcut, then drag downward → source row goes semi-transparent (opacity-40); a 2px blue insertion line appears above the row currently under the cursor
- Drop on a different row → list reorders; restart `npm run dev` → order persists
- Drag the first shortcut to the very bottom (drop on the small 1px gap above the System divider) → moves to last position
- Drag a shortcut and drop it back where it started → no visual change, no save (unchanged in `settings.json`)
- Drag a shortcut and release outside the sidebar (e.g., on the FileList) → no change; insertion line clears
- After completing a drag, click on a shortcut → still navigates correctly
- Right-click on a shortcut → still removes it
- Try to drag the `/` or `~` system entries → not draggable (they don't have the `draggable` attribute)

- [ ] **Step 4: Confirm clean tree**

```bash
git status
```

If any inline fixes were needed during smoke testing, commit them. Otherwise the tree is clean.

---

## Acceptance criteria recap

- [ ] Each user-added shortcut row is draggable via mouse
- [ ] Source row visually fades while dragging (opacity-40)
- [ ] 2px blue insertion line appears above the target row during dragover
- [ ] Drop reorders the list and immediately persists to `settings.json`
- [ ] Drop on the end-of-list 1px gap moves the item to the last position
- [ ] Restarting the app preserves the new order
- [ ] System entries (`/`, `~`) are not draggable and not affected
- [ ] Click and right-click on a shortcut still work as before
- [ ] `npm run build` passes
- [ ] `npm test` passes (no new tests)
