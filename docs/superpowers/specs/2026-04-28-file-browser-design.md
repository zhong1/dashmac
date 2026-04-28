# File Browser — Design Spec

**Date:** 2026-04-28
**Status:** Design approved, pending implementation plan

## Goals

Add a file-browser surface to DashMac alongside the existing Disk analytics page. The browser supports navigation (sidebar shortcuts + system roots, double-click, path bar with edit-jump, back/forward/up), full file operations (open, rename, trash, zip, copy/cut/paste, new folder/file), multi-select, and macOS-aware error handling.

## Non-Goals (v1)

- Drag-and-drop (any kind, intra-app or cross-app)
- Cross-process clipboard interop with Finder
- File previews / thumbnails / QuickLook
- Get Info / details panel
- File search (sidebar search, Spotlight integration)
- Tags / colored labels
- Grid / icon view; view-mode switcher
- Custom shortcut aliases or shortcut reordering
- Auto-listing of mounted volumes (USB, network drives) — user adds manually as shortcuts
- iCloud / Smart Folders / network drives
- Recursive directory size (`du`) — Treemap on the Disk page already does this
- Undo for file operations

## Architecture

### New top-level page

A new page `files` joins the existing five (`dashboard`, `memory`, `disk`, `network`, `settings`) in the Sidebar. The Disk page is unchanged — analytics and file management are kept conceptually separate. `App.tsx`'s `Page` union and the `NAV_ORDER` / `NAV_ICONS` in `Sidebar.tsx` are extended with `'files'`. i18n keys `sidebar.files`, `pages.files`. Icon: `📁`.

### Layout (single page, two panes)

```
┌──────────────────────────────────────────────────────────┐
│  [<] [>] [↑]  /Users/brian/Documents          [⟳] [👁]   │  PathBar
├────────────┬─────────────────────────────────────────────┤
│  快捷目录  │  Name ▲       Size       Modified     Type   │  FileList header
│   📁 …     │  📁 Photos     --         3 days ago   Folder │
│   📁 …     │  📄 a.txt      12 KB      5 min ago    Text   │
│ ────────── │  ...                                         │
│  系统      │                                              │
│   / 根     │                                              │
│   ~ 主目录 │                                              │
│ ────────── │                                              │
│  + 添加快捷│                                              │
└────────────┴─────────────────────────────────────────────┘
```

### Module decomposition

**Main process (Node):**
- `electron/services/fileSystem.ts` — pure filesystem operations (`listDirectory`, `mkdir`, `createFile`, `rename`, `trashMany`, `copyMany`, `moveMany`, `validateName`, `resolveDuplicateName`). All real IO lives here. Path-validation guards are co-located.
- `electron/services/zipService.ts` — `zipPaths(srcs[], destDir)`, spawns `ditto` and resolves to the produced zip path. Separate file because it uses `child_process` and is `darwin`-only.
- `electron/services/clipboard.ts` — module-level `FileClipboard` state + `setClip(paths, op)` / `getClip()` / `clearClip()`. In-memory only; not persisted.

**IPC layer (in `electron/main.ts`):**
- 10 new channels listed in §IPC contract.

**Renderer (React):**
- `src/components/files/FilesPage.tsx` — page container; reads/writes `filesStore`.
- `src/components/files/FileSidebar.tsx` — left pane: shortcuts + system roots + add button.
- `src/components/files/PathBar.tsx` — top bar: history nav buttons, editable path input, refresh, hidden-files toggle.
- `src/components/files/FileList.tsx` — table with sort + selection.
- `src/components/files/ContextMenu.tsx` — right-click menus (two variants: on-item vs on-empty).
- `src/components/files/RenameInline.tsx` — inline-rename input that replaces the Name cell.
- `src/components/common/Toast.tsx` — new shared toast system; consumed only by the files page in this spec, but designed for reuse later.

**Stores:**
- `src/stores/filesStore.ts` — Zustand store: `currentPath`, `entries`, `selection: Set<string>`, `selectionAnchor`, `sort`, `clipboard`, `history`, `showHidden`. Plus action methods that wrap the IPC calls.
- `src/stores/toastStore.ts` — Zustand store for toast queue.

### State management

The `filesStore` is the single source of truth for the renderer-side state. The Provider tree from `main.tsx` (`<I18nProvider>` already wraps everything) sees `filesStore` via plain `useStore` calls — no new providers needed.

Navigation flow (whether triggered by Sidebar click, double-click on directory, PathBar Enter, or back/forward/up):

1. Renderer calls `store.navigate(path)`.
2. Store resolves any `~` (handled main-side; renderer passes path as-is) and dispatches `query:fs:list(path)`.
3. On success: history push, set `currentPath` and `entries`, clear `selection`, reset `sort` to default (name asc, dirs first).
4. On failure: keep the new `currentPath` so user sees where they tried to go, set `entries=[]`, set `dirError` for the FileList overlay. Sidebar shortcut errors specifically also remove the dead path from `fileShortcuts`.

## IPC contract

Extend `src/types.ts` `DashMacAPI` with these methods. All mutating handlers also broadcast `'fs:dir-changed'` (push channel) so the renderer auto-refreshes the relevant directory.

```ts
// Note: a separate type from the existing `FileEntry` (which is used by Treemap
// for recursive tree structures with `children`). The file-browser listing is
// flat and carries different metadata.
export interface DirEntry {
  name: string
  path: string         // absolute
  isDirectory: boolean
  size: number         // 0 for directories
  modifiedAt: number   // ms since epoch
  ext: string          // lowercase, includes dot; '' for directories or no extension
}

export interface DashMacAPI {
  // ... existing ...
  listDirectory: (path: string) => Promise<{ ok: true; entries: DirEntry[] } | { ok: false; errno: string; message: string }>
  fsCreateFolder: (parent: string, name: string) => Promise<{ ok: true; path: string } | { ok: false; message: string }>
  fsCreateFile:   (parent: string, name: string) => Promise<{ ok: true; path: string } | { ok: false; message: string }>
  fsRename:       (oldPath: string, newName: string) => Promise<{ ok: true; path: string } | { ok: false; message: string }>
  fsTrash:        (paths: string[]) => Promise<{ ok: true } | { ok: false; failed: string[]; message: string }>
  fsCopy:         (paths: string[], destDir: string) => Promise<{ ok: true } | { ok: false; failed: string[]; message: string }>
  fsMove:         (paths: string[], destDir: string) => Promise<{ ok: true } | { ok: false; failed: string[]; message: string }>
  fsZip:          (paths: string[], destDir: string) => Promise<{ ok: true; path: string } | { ok: false; message: string }>
  fsOpen:         (path: string) => Promise<{ ok: true } | { ok: false; message: string }>
  onDirChanged:   (callback: (path: string) => void) => () => void
}
```

Existing `revealFile` channel (Show in Finder) is reused.

`AppSettings` is extended with two fields:

```ts
export interface AppSettings {
  // ... existing ...
  fileShortcuts: string[]   // absolute paths; default []
  showHiddenFiles: boolean  // default false
}
```

`settingsStore.ts` `DEFAULTS` adds these. The renderer subscribes to changes via the existing `getSettings`/`saveSettings` IPC; no new push channels for shortcut updates (saving via `saveSettings` and re-reading is enough — settings UI is not a high-frequency interaction).

## Sidebar (FileSidebar)

Three sections:

1. **Shortcuts** (`files.sidebar.shortcuts`) — user-added entries from `AppSettings.fileShortcuts`. Each shows `📁 <basename(path)>`. Single-click navigates. Right-click → "Remove from shortcuts" menu (no other actions).
2. **System** (`files.sidebar.system`) — fixed two entries: `/` (label `files.sidebar.root`) and `~` (label `files.sidebar.home`, tooltip shows the resolved home path). Cannot be removed; right-click does nothing.
3. **Add button** (`files.sidebar.add`) — at the bottom. Adds `currentPath` to `fileShortcuts` if not already present. Disabled (greyed) when `currentPath` is already in the list, or when `currentPath` is `/` or the home dir (those are already in System). Tooltip explains why disabled.

Adding flow: on click, the store calls `getSettings()`, splices the new path in, calls `saveSettings(...)`, and toasts "Added to shortcuts" (`files.toast.addedShortcut`). The Sidebar reads `fileShortcuts` from a local `useState` initialized from `getSettings()` and refreshed when the page mounts and on toast confirmation.

Dead-shortcut handling: when the user clicks a shortcut and `listDirectory` returns ENOENT, the store removes that path from `fileShortcuts`, calls `saveSettings`, and toasts "Folder no longer exists, removed from shortcuts" (`files.toast.shortcutRemovedDeleted`).

## Path bar (PathBar)

Single editable text input flanked by navigation buttons:

```
[<] [>] [↑]  <input value={currentPath}>  [⟳] [👁]
```

- `[<]` / `[>]` — back/forward in the in-memory history stack. Disabled when stack empty.
- `[↑]` — go to `path.dirname(currentPath)`. Disabled when `currentPath === '/'`.
- **Path input** — `<input type="text">` bound to a local edit-state mirror of `currentPath`. Edit mode is implicit (always editable). Pressing Enter calls `store.navigate(value)`. On success the input shows the (possibly canonicalized) absolute path. On failure: red border for 1.5 s + error toast, input keeps user's text so they can fix it.
- `[⟳]` — re-runs `listDirectory(currentPath)`.
- `[👁]` — toggles `showHidden`. Persisted to `AppSettings.showHiddenFiles` immediately (per Settings page's immediate-save pattern for display preferences).

Tilde expansion (`~`, `~/foo`) happens **main-side** inside `listDirectory`, before `fs.readdir`. Renderer never resolves home dir. The displayed value after navigation is always the absolute path (no `~` shorthand).

History stack: `{ back: string[], forward: string[] }` lives in `filesStore`. On successful navigation: push old `currentPath` to `back`, clear `forward`. Back: move current to `forward`, pop from `back`. Forward: reverse. Not persisted across restarts.

Esc key while focused on input: revert input to `currentPath` and blur.

## File list (FileList)

Four columns: Name, Size, Modified, Type. Header click toggles sort by that column (default ascending; clicking the active column toggles direction). Default sort: name ascending, **directories grouped first** (always — the dir-first rule is preserved across all sort choices).

### Row rendering

- **Name**: `<emoji> <name>`. Emoji per `EXT_ICON` map (~10 entries):
  - directory → `📁`
  - `.zip` `.tar` `.gz` `.bz2` `.7z` → `🗜️`
  - `.png` `.jpg` `.jpeg` `.gif` `.svg` `.webp` → `🖼️`
  - `.mp3` `.wav` `.aac` `.flac` → `🎵`
  - `.mp4` `.mov` `.mkv` `.avi` → `🎬`
  - `.pdf` → `📕`
  - default file → `📄`
- **Size**: directories → `--`. Files → `formatBytes()`.
- **Modified**: `formatRelativeTime(modifiedAt, lang)`:
  - `< 60s` → `just now` / `刚刚`
  - `< 60 min` → `{n} min ago` / `{n} 分钟前`
  - `< 24 h` and same calendar day → `Today HH:mm` / `今天 HH:mm`
  - calendar yesterday → `Yesterday HH:mm` / `昨天 HH:mm`
  - `< 7 days` → `{n} days ago` / `{n} 天前`
  - else → `YYYY-MM-DD` (no localized date format; non-goal)
  - Single-form English (no plural variants); see §i18n.
- **Type**: `EXT_TYPE` map (~20 entries) → human-readable category from `files.type.*`. Unknown extension shows `'TXT 文件'` style via `t('files.type.unknown', { ext: ext.slice(1).toUpperCase() })`. Directories show `files.type.folder`.

### Selection

`selection: Set<string>` holds absolute paths. `selectionAnchor: string | null` tracks the most recent single-click for shift-range.

| Click | Effect |
|---|---|
| single-click row | `selection = new Set([path])`; `selectionAnchor = path` |
| ⌘ + click row | toggle `selection.has(path)`; `anchor = path` |
| Shift + click row | range from `anchor` to clicked, union with existing selection; `anchor` unchanged |
| ⌘A | select all visible entries; `anchor = null` |
| **left-click** empty area below rows | clear selection |
| **right-click** empty area below rows | open the on-empty context menu (does NOT clear selection — `paste` should be available regardless of current selection) |
| Esc | clear selection |

Hidden files: client-side filter on the rendered `entries` array. `listDirectory` always returns the full set (single-responsibility); the FileList component filters when `!showHidden` by skipping `name.startsWith('.')`.

### Double-click

- directory → `store.navigate(entry.path)`
- file → `fsOpen(entry.path)`

### Empty / error states

- empty folder → centered text `files.list.empty`
- error from `listDirectory` → centered overlay with the user-facing error message (see §Error Handling) and a retry button that re-runs `listDirectory(currentPath)`.

## Operations (context menu + keyboard)

### Two context-menu variants

**On a row** (right-click anywhere on a file/folder row):
- If the right-clicked path is not in `selection`, replace `selection` with `new Set([path])` (Finder behavior). Otherwise, the menu acts on the existing multi-selection.

| Menu item | Single | Multi | Handler |
|---|---|---|---|
| Open | enabled | greyed | `fsOpen(path)` |
| Rename | enabled | greyed | enter inline rename |
| Copy | enabled | enabled | `clipboard.set(paths, 'copy')` |
| Cut | enabled | enabled | `clipboard.set(paths, 'cut')` |
| Move to Trash | enabled | enabled | `fsTrash(paths)` |
| Compress to ZIP | enabled | enabled | `fsZip(paths, currentPath)` |
| Show in Finder | enabled | enabled | `revealFile(path)` (existing) |

**On empty area** (right-click below the rows or in the empty state):

| Menu item | Enabled | Handler |
|---|---|---|
| New Folder | always | `fsCreateFolder(currentPath, defaultName)` → enter inline rename |
| New File | always | `fsCreateFile(currentPath, defaultName)` → enter inline rename |
| Paste | when `clipboard !== null` | dispatch copy or move per `clipboard.op` |

### Default names + collision

`mkdir` / `createFile` use `files.defaults.untitledFolder` / `files.defaults.untitledFile`. If the name collides, append ` 2`, ` 3`, etc., before returning. Collision suffix uses a space then number (matches Finder's `'Untitled folder 2'`). After creation, the renderer immediately enters inline-rename on the new entry.

### Inline rename

The Name cell's text is replaced with an `<input>` whose value is the original name. Cursor is placed at the position before the extension dot if any (`'foo.txt'` → cursor at index 3). Selection covers the basename minus extension (`'foo'`). Mirrors Finder.

- Enter → submit
- Esc → cancel (no IPC call)
- blur → submit (Finder-consistent)
- new == old → silent cancel
- new is empty or contains `/` → error toast (`files.error.invalidName`), stay in edit mode
- name collision (target file exists in same dir) → error toast (`files.error.nameExists`), stay in edit mode
- unexpected fs error → error toast with the underlying message, exit edit mode (don't trap user)

### Clipboard (in-memory, app-only)

```ts
type FileClipboard = {
  paths: string[]
  op: 'copy' | 'cut'
} | null
```

Stored in `filesStore.clipboard`. **Not persisted** across restarts. **Not synced** with the OS pasteboard.

Paste behavior:
- `op === 'copy'` → `fsCopy(paths, currentPath)`. Clipboard remains (allows multiple pastes).
- `op === 'cut'` → `fsMove(paths, currentPath)`. Clipboard cleared after the operation completes (cut is one-shot).
- Validity checks (renderer-side, before dispatch):
  - reject if `currentPath` equals any source's parent and `op === 'copy'` is silly but not blocked (it's still a meaningful "duplicate" operation; Finder allows it). For `op === 'cut'`, reject with `files.error.pasteIntoSelf`.
  - reject if any source is an ancestor of `currentPath` (would move a folder into itself).

### Conflict resolution on copy / move

`resolveDuplicateName(name, dirPath)` (in `fileSystem.ts`):

1. If `<dir>/<name>` does not exist → return `name`.
2. Otherwise, split `name` into `base` + `ext` (extension is the last `.foo` if present).
3. Try `<base> (copy)<ext>`. If free → return.
4. Try `<base> (copy 2)<ext>`, `<base> (copy 3)<ext>`, ... until free.

This applies per-source path during `fsCopy` and `fsMove`. No "Overwrite / Skip / Replace" dialog (YAGNI).

### ZIP

`zipService.zipPaths(srcs, destDir)`:
- Output name: single source → `<basename(src)>.zip` (preserving the source's name even if it's a directory, e.g. `Photos` → `Photos.zip`). Multiple → `Archive.zip` (i18n key `files.defaults.zipDefaultName`).
- If output name collides in `destDir`, apply same `(copy)` / `(copy 2)` suffix logic, **before the `.zip`** extension: `Photos (copy).zip`. Reuse `resolveDuplicateName`.
- Spawn `ditto -c -k --sequesterRsrc -- <src1> <src2> ... <out.zip>`. The `--sequesterRsrc` preserves macOS metadata (resource forks, xattrs). Wait for exit code 0; non-zero → reject with stderr.
- Resolve to the produced absolute path so the renderer can scroll/select it after refresh (nice-to-have follow-up — not required v1).

### Trash

`fsTrash(paths)` calls `shell.trashItem(p)` (Electron API; macOS NSWorkspace under the hood) for each path serially. Collect failures; if any, return `{ ok: false, failed, message: t('files.error.operationFailed', { count: failed.length }) }`.

### Open

`fsOpen(path)` → `shell.openPath(path)`. Returns `{ ok: false, message }` if the underlying call returns a non-empty error string.

### Auto-refresh after operation

Every successful mutating IPC handler ends with `mainWindow.webContents.send('fs:dir-changed', currentPath)` (where `currentPath` is the directory that was modified — for copy/move that's the destination directory; for rename/trash/mkdir/createFile/zip that's the parent of the affected path; for cross-directory move, both source and destination dirs). The renderer's `onDirChanged` listener checks if the broadcast path matches its `currentPath` and re-runs `listDirectory` if so.

For cross-directory operations (move from A → B): main broadcasts both `A` and `B`. The renderer is only ever in one of them at a time; the broadcast it doesn't care about is silently ignored.

## Error handling

### `listDirectory` failure

Per the IPC contract, returns a discriminated `{ ok: false, errno, message }`. The store sets `dirError` and renders the overlay. Error code → user message map (rendered through i18n with `files.error.*`):

| errno | i18n key |
|---|---|
| `ENOENT` | `files.error.notFound` |
| `EACCES` / `EPERM` | `files.error.permission` (includes guidance to System Settings → Privacy & Security → Full Disk Access) |
| `ENOTDIR` | `files.error.notADirectory` |
| other | `files.error.generic` (templates the underlying message) |

### Single-operation failures

All mutating IPC handlers return `{ ok: false, message: string }` and **never throw** to the renderer. The renderer toasts the message at error level.

### Path / name validation

`validateName(name): boolean` (in `fileSystem.ts`):
- empty → false
- contains `/` → false
- contains `\0` (NUL byte) → false
- equals `.` or `..` → false
- otherwise true

Renderer pre-validates with the same rules (mirrored function or — better — IPC validates and returns `files.error.invalidName`). Single source of truth lives main-side; the renderer's check is for UX immediacy only.

Path traversal protection: every IPC handler resolves user-supplied paths via `path.resolve` and asserts `result.startsWith('/')`. We do **not** restrict access to specific directory subtrees — this is a file manager, not a sandboxed view. The protection is against malformed inputs only.

### macOS TCC (Privacy & Security)

DashMac is unsandboxed (`com.dashmac.app`, no entitlements file). First access to `~/Documents`, `~/Desktop`, `~/Downloads`, iCloud Drive, or external volumes triggers the OS-level TCC prompt. If denied, `fs.readdir` returns `EACCES`. Our error message includes guidance to grant Full Disk Access. There is no programmatic way to re-trigger the prompt; users who deny must enable in System Settings.

## Toast system

New shared component. Minimal API:

```tsx
// src/components/common/Toast.tsx  — root component, mount once near root
// src/stores/toastStore.ts          — Zustand: { toasts: Toast[], push, dismiss }

interface Toast {
  id: string
  level: 'success' | 'error' | 'info'
  message: string
}

export function useToast(): {
  success: (msg: string) => void
  error: (msg: string) => void
  info: (msg: string) => void
}
```

Behavior:
- Mounted once in `App.tsx`'s top-level (so it's visible from any page, both windows).
- Stack of up to 3 visible toasts at the bottom-right; older ones dropped (no FIFO scroll, just discard).
- Auto-dismiss after 4 seconds. Click to dismiss early.
- Three colors: `success` green, `error` red, `info` blue. Fits existing Tailwind tokens (`status-green`, `status-red`, `status-blue`).
- No transitions library; use Tailwind `transition-opacity` + `opacity-0/100`.

Out of scope this v1: replacing the existing Settings "Saved!" feedback. Keep that as-is.

## i18n

~50 new strings, all under the `files` namespace. Existing `pages.files` and `sidebar.files` keys also added.

```ts
files: {
  page: { title: 'Files' },
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
    back: 'Back', forward: 'Forward', up: 'Up',
    refresh: 'Refresh', toggleHidden: 'Show hidden files',
  },
  list: {
    columns: { name: 'Name', size: 'Size', modified: 'Modified', type: 'Type' },
    empty: 'Empty folder',
  },
  time: {
    justNow: 'just now',
    minutesAgo: '{n} min ago',
    hoursAgo: '{n} hour ago',
    today: 'Today {time}',
    yesterday: 'Yesterday {time}',
    daysAgo: '{n} days ago',
  },
  type: {
    folder: 'Folder',
    text: 'Text', image: 'Image', video: 'Video', audio: 'Audio',
    archive: 'Archive', pdf: 'PDF document', app: 'Application',
    code: 'Source code', unknown: '{ext} file',
  },
  contextMenu: {
    open: 'Open', rename: 'Rename', copy: 'Copy', cut: 'Cut',
    trash: 'Move to Trash', zip: 'Compress to ZIP',
    revealInFinder: 'Show in Finder',
    newFolder: 'New Folder', newFile: 'New File', paste: 'Paste',
  },
  defaults: {
    untitledFolder: 'Untitled folder',
    untitledFile: 'untitled',
    duplicateSuffix: '{name} (copy)',
    duplicateSuffixN: '{name} (copy {n})',
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

Plus `pages.files` and `sidebar.files` (added to existing namespaces).

Plurals: English uses singular forms across the board (`'1 min ago'`, `'5 min ago'`). This is a deliberate simplification matching the spec's existing convention.

The `i18n-shape.test.ts` already in the project will catch any en/zh-CN key drift automatically.

## Testing

Following the existing convention (`tests/electron/` only, no renderer test infrastructure):

### `tests/electron/fileSystem.test.ts`

Use `os.tmpdir()` for sandboxing, `afterEach` cleanup.

1. `listDirectory(path)` returns FileEntry[] with correct fields
2. `listDirectory(path)` returns hidden entries (filtering is renderer-side)
3. `listDirectory(missing)` rejects/throws ENOENT
4. `mkdir(parent, name)` creates folder, returns absolute path
5. `mkdir(parent, name)` collision → throws EEXIST
6. `createFile(parent, name)` creates empty file
7. `rename(oldPath, newName)` renames in place
8. `validateName('a/b')` → false
9. `validateName('')` → false
10. `validateName('.')` → false
11. `validateName('..')` → false
12. `validateName('foo')` → true
13. `validateName('foo.txt')` → true
14. `copyMany([src], dest)` copies a single file
15. `copyMany([src], dest)` collision → produces `name (copy)`
16. `copyMany` repeated produces `(copy 2)`, `(copy 3)`
17. `moveMany([src], dest)` removes source after success
18. `moveMany([src], src.parent)` → rejects (paste-into-self for cut)
19. `moveMany([dir], dirSubpath)` → rejects (ancestor of destination)
20. `resolveDuplicateName('foo.txt', dir)` → `'foo (copy).txt'` when `foo.txt` exists
21. `resolveDuplicateName('foo', dir)` (no extension) → `'foo (copy)'`

### `tests/electron/zipService.test.ts`

Wrap the entire suite in `test.skipIf(process.platform !== 'darwin', ...)`. CI on Linux skips; local macOS runs.

22. `zipPaths(['a.txt'], destDir)` produces `a.txt.zip` and the archive contains `a.txt` with original content
23. `zipPaths(['a.txt', 'b.txt'], destDir)` produces `Archive.zip` with both files
24. `zipPaths([dir/], destDir)` packs a directory recursively
25. `zipPaths([file], dirWithExisting)` collision → produces `<name> (copy).zip`

### `tests/electron/clipboard.test.ts`

26. initial state → `null`
27. `setClip(['a'], 'copy')` → `getClip()` returns the same
28. `setClip(['a'], 'cut'); clearClip()` → `null` afterward (cut one-shot semantic enforced by callers)

### `tests/electron/timeFormat.test.ts`

`formatRelativeTime(ms, lang)` is a pure function in `src/i18n/time.ts` (new). Tested in main-process tests via direct import (vitest jsdom env handles it).

29. 30 s ago → `'just now'` / `'刚刚'`
30. 5 min ago → `'5 min ago'` / `'5 分钟前'`
31. 90 min ago → `'1 hour ago'` / `'1 小时前'`
32. same calendar day, 6 h ago → `'Today HH:mm'` / `'今天 HH:mm'`
33. yesterday → `'Yesterday HH:mm'` / `'昨天 HH:mm'`
34. 5 days ago → `'5 days ago'` / `'5 天前'`
35. 30 days ago → `'YYYY-MM-DD'` (absolute)

### Existing shape test extension

The existing `tests/electron/i18n-shape.test.ts` automatically covers the ~50 new keys' parity between en and zh-CN.

### Out of scope for tests

- React component rendering for FilesPage / FileList / etc. (no renderer test infra)
- IPC bridge for the new channels (preload-only smoke tests aren't worth the harness setup)
- Real Tray rendering (already out of scope for the project)
- Toast component visual behavior (component-level, no infra)

## Risks

1. **TCC permission UX is one-shot.** First access to a protected dir triggers the OS dialog. If denied, the user must go to System Settings to grant access. We document this in the error message; we cannot improve OS behavior.

2. **Dead shortcuts in the sidebar.** Mitigated by auto-removal on click + toast. There's a small race window where another shortcut might also be dead — we don't proactively scan; users learn about each as they click.

3. **Large directories.** No virtualization; ~10⁵ entries will start to feel slow but should still work. Treat as a future optimization.

4. **APFS case-insensitive but case-preserving renames.** `Foo.txt` → `foo.txt` is a no-op at the inode level on default APFS volumes but should still update the displayed name. We rely on the OS rename behavior; tests against tmpdir (which is APFS by default) will catch it.

5. **ZIP encoding.** `ditto`'s default zip encoding for non-ASCII names may not interoperate with non-macOS unzip tools. This is a macOS-zip ecosystem issue, not ours.

6. **Toast/Saved! UX inconsistency.** The Settings page keeps its inline "Saved!" feedback; only files-page errors and confirmations use the new Toast. Future cleanup, separately scoped.

7. **Cross-directory move broadcast.** `fsMove` from A→B sends two `fs:dir-changed` events. The renderer is only viewing one of them. Slight extra IPC cost, no correctness issue.

8. **Clipboard does not survive restart.** Intentional — matches Finder's actual behavior (Finder's clipboard is per-user-session, not persisted to disk). Users who copy then quit and expect to paste later are in for a surprise; we accept this.

## Acceptance criteria

- [ ] Sidebar gains a new "Files" / "文件" entry with `📁` icon; clicking enters the new page
- [ ] FilesPage shows three Sidebar sections: Shortcuts (initially empty), System (`/` and `~`), Add button
- [ ] Double-clicking a directory enters it; double-clicking a file opens it via the system default app
- [ ] PathBar shows the current absolute path; editing + Enter navigates; invalid path keeps input contents and toasts an error
- [ ] Back / Forward / Up navigation buttons behave correctly with disabled states
- [ ] FileList shows 4 columns (Name, Size, Modified, Type); column-header click toggles sort; default sort is name asc with directories first
- [ ] Single-click / ⌘+click / Shift+click / ⌘A / Esc selection behavior matches the spec
- [ ] Right-click on a row vs empty area produces the two distinct context menus from §Operations
- [ ] New Folder / New File creates with default name and immediately enters inline rename
- [ ] Rename: Enter submits, Esc cancels, blur submits; collision produces error and stays in edit mode
- [ ] Copy + paste, Cut + paste work; collisions auto-suffix `(copy)` / `(copy 2)`; cut clipboard clears after paste; copy clipboard persists
- [ ] Move to Trash actually moves selected items to `~/.Trash`
- [ ] ZIP single → `<name>.zip` in current dir; multi → `Archive.zip`; both unzip successfully back to originals
- [ ] Hidden files toggle shows/hides dotfiles; persists across restart
- [ ] Add Shortcut adds `currentPath` to `fileShortcuts`; deleted shortcuts auto-remove on click with toast
- [ ] In Chinese system locale, every Files-page string is in Chinese, including error messages and TCC guidance
- [ ] `npm test` passes (existing 52 + ~35 new = ~87 total, minus zipService's 4 if not on darwin)
- [ ] `npm run build` passes TypeScript strict-mode checks

## Files touched (preview)

**New (renderer):**
- `src/components/files/FilesPage.tsx`
- `src/components/files/FileSidebar.tsx`
- `src/components/files/PathBar.tsx`
- `src/components/files/FileList.tsx`
- `src/components/files/ContextMenu.tsx`
- `src/components/files/RenameInline.tsx`
- `src/components/common/Toast.tsx`
- `src/stores/filesStore.ts`
- `src/stores/toastStore.ts`
- `src/i18n/time.ts`

**New (main):**
- `electron/services/fileSystem.ts`
- `electron/services/zipService.ts`
- `electron/services/clipboard.ts`

**New (tests):**
- `tests/electron/fileSystem.test.ts`
- `tests/electron/zipService.test.ts`
- `tests/electron/clipboard.test.ts`
- `tests/electron/timeFormat.test.ts`

**Modified:**
- `src/types.ts` — add `DirEntry`, extend `AppSettings`, extend `DashMacAPI`
- `src/App.tsx` — add `'files'` to `Page` union, add case to `PageContent`
- `src/components/layout/Sidebar.tsx` — add `'files'` to `NAV_ORDER` / `NAV_ICONS`
- `src/i18n/locales/en.ts` — add `files.*`, `pages.files`, `sidebar.files`
- `src/i18n/locales/zh-CN.ts` — same shape, Chinese values
- `electron/main.ts` — register 9 new IPC handlers, broadcast `fs:dir-changed`
- `electron/preload.ts` — expose 10 new methods on `window.api`
- `electron/services/settingsStore.ts` — extend `DEFAULTS` with `fileShortcuts: []` and `showHiddenFiles: false`
