# Shortcut Drag-to-Reorder

**Date:** 2026-04-29
**Status:** Design approved, pending implementation

## Goals

Let the user reorder their `fileShortcuts` (the user-added paths shown in `FileSidebar` under the "Shortcuts" header) by dragging rows up or down. Persist the new order to `settings.json` immediately. The "System" entries (`/`, `~`) remain fixed.

## Non-Goals

- Keyboard reorder (e.g., Alt+↑ / Alt+↓) — accessibility v2
- Auto-scroll when dragging near the top/bottom edge of the sidebar
- Cross-application drag (e.g., dragging a folder from Finder onto the sidebar) — separate feature, not in scope here
- Reordering of System entries
- Reorder via context menu ("Move up" / "Move down") — drag-only for v1
- Visual ghost preview / drag image customization beyond the browser default

## Architecture

Pure renderer-side feature. All changes are local to `src/components/files/FileSidebar.tsx`. No new IPC, no store changes, no i18n changes.

The component already calls `window.api.saveSettings({ ...settings, fileShortcuts: next })` for the existing add/remove flows; reorder reuses the same persistence path.

## Implementation

### Local state

Two new useState hooks inside `FileSidebar`:

```ts
const [dragIndex, setDragIndex] = useState<number | null>(null)
const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
```

- `dragIndex` is the source index of the row being dragged.
- `dragOverIndex` is the current insertion point (the position above which a 2px line is shown).

Both are reset on `onDragEnd` regardless of drop success.

### HTML5 Drag and Drop API

Each shortcut row gets:

- `draggable` attribute (true)
- `onDragStart` — sets `dragIndex` and `e.dataTransfer.effectAllowed = 'move'`
- `onDragOver` — calls `e.preventDefault()` (mandatory to allow drop) and sets `dragOverIndex`
- `onDrop` — calls `e.preventDefault()` and runs `handleDrop(targetIndex)`
- `onDragEnd` — clears both state values

A separate 1-pixel-tall drop target sits between the last shortcut and the System divider. It accepts drops with `targetIndex = shortcuts.length` so users can move an item to the bottom.

### Visual feedback

- **Source row** (the one being dragged): `opacity-40` while `dragIndex === i`.
- **Insertion indicator**: a 2px blue horizontal line (`bg-status-blue`) absolutely positioned at the top of the row matching `dragOverIndex`. The line uses `pointer-events-none` so it doesn't interfere with drop detection.
- The browser's default drag-image (a translucent thumbnail of the dragged element) is left as-is — no custom `setDragImage` call.

### Drop handler

```ts
const handleDrop = async (toIndex: number) => {
  if (dragIndex === null || dragIndex === toIndex) {
    setDragIndex(null); setDragOverIndex(null); return
  }
  const next = [...shortcuts]
  const [moved] = next.splice(dragIndex, 1)
  // After splice, indices shift left by 1 for items past dragIndex,
  // so reinsert at toIndex - 1 if dragging downward.
  const insertAt = dragIndex < toIndex ? toIndex - 1 : toIndex
  next.splice(insertAt, 0, moved)
  setShortcuts(next)                                    // optimistic UI
  setDragIndex(null); setDragOverIndex(null)
  const settings = await window.api.getSettings()
  await window.api.saveSettings({ ...settings, fileShortcuts: next })
}
```

Optimistic UI: `setShortcuts(next)` runs before the IPC round-trip completes. If `saveSettings` fails (very unlikely — it writes a small JSON file synchronously on the main side), the local state is still correct and a refresh on next mount would re-read the persisted version. No rollback path is added because `saveSettings` failure mode is essentially "disk full / read-only filesystem" which already breaks the rest of the app.

### System entries unchanged

The two `/` and `~` buttons keep their existing markup. They do not get `draggable` and they don't render insertion lines. They sit below the shortcuts section divider.

### Click semantics preserved

The shortcut button still has `onClick={() => handleClickShortcut(p)}` for navigation. HTML5 drag and click do not conflict — the browser distinguishes a click (mousedown → mouseup with no movement) from a drag (mousedown → mousemove → mouseup).

The right-click `removeShortcut` flow also stays.

### Edge cases

| Scenario | Behavior |
|---|---|
| Drop on self (`dragIndex === toIndex`) | No-op; no save |
| Drop without movement (just clicked) | Browser doesn't fire `onDrop`; `onDragEnd` clears state |
| Drop outside the sidebar | `onDrop` doesn't fire on a non-target; `onDragEnd` clears state |
| Two shortcuts with identical paths | Cannot occur — `addCurrent` already deduplicates |
| Empty list | `.map` renders nothing; no drag possible (no rows) |
| User drags fast across multiple rows | `onDragOver` updates `dragOverIndex` per row; only the final row's index applies on drop |

## Testing

No new test files. The feature is pure UI state on existing data. Existing tests remain unaffected.

Manual smoke test (macOS):
- Add 3 shortcuts via the "+" button (e.g., `~/Documents`, `~/Desktop`, `~/Downloads`)
- Drag the third entry to the top → list reorders; refresh app → order persists
- Drag the first entry to the very bottom (drop on the 1px gap above the divider) → moves to last position
- Drag and drop on the same position → no visual change, no save
- Drag a shortcut and drop outside the sidebar → no change, drag indicator clears
- Right-click on a shortcut while dragging is NOT in progress → still removes (existing behavior intact)
- Click on a shortcut → still navigates (no drag interference)

## Files Touched

**Modified:**
- `src/components/files/FileSidebar.tsx` — add `dragIndex` / `dragOverIndex` state, drag handlers, insertion-line markup, `handleDrop` action, drop target div for end-of-list

## Acceptance Criteria

- [ ] Each shortcut row is draggable via mouse (HTML5 native drag)
- [ ] Source row visually fades while being dragged (opacity-40)
- [ ] 2px blue insertion line appears above the target row during dragover
- [ ] Drop reorders the list and immediately persists to `settings.json`
- [ ] Drop at the end-of-list 1px gap moves the item to last position
- [ ] Restarting the app preserves the new order
- [ ] System entries (`/`, `~`) are not draggable and not affected
- [ ] Click and right-click on a shortcut still work as before
- [ ] `npm run build` passes
- [ ] `npm test` passes (no new tests; existing tests unchanged)
