# Toolbox Screenshot — Design

**Date:** 2026-04-30
**Status:** Approved
**Scope:** Snipaste-style screenshot tool inside the Toolbox. Covers all 5 phases — MVP capture → save → annotation → pin → eyedropper. Each phase ships independently in its own implementation plan; this spec is the cross-phase north star.

> This is a "skeleton-level" spec for a multi-phase, multi-week feature. Architecture, IPC, permission flow, settings shape, and per-phase user-facing behavior are spec'd here. Pure UX details that can only be decided after Phase 1 prototype contact (exact toolbar pixel layout, color picker popover styling, pin border hover animation) are left as `TODO (phase N implementation brainstorm)` and resolved per-phase.

---

## 1. Goal

Add a Snipaste-equivalent screenshot tool to the Toolbox. The tool is enabled via the existing `toolbox.screenshotEnabled` setting (already shipped). When enabled, users get:

1. **Capture (Phase 1):** Press `⌘+⇧+A` (or click the toolbox card) → full-screen overlay → drag rectangle → release → click "复制" or press Enter → image is on clipboard.
2. **Save (Phase 2):** Same flow, "保存" button writes PNG to a configurable directory.
3. **Annotation (Phase 3):** Toolbar lets users draw rectangles, ellipses, arrows, freehand, text, and mosaic over the selection. Undo / redo / eraser. 6 colors × 3 stroke widths.
4. **Pin (Phase 4):** "贴图" button or `⌘+⇧+S` floats the image as an always-on-top window. Multi-pin coexistence. `⌘+⇧+H` hides/shows all pins.
5. **Eyedropper (Phase 5):** Press `C` in overlay → click any pixel → HEX color in clipboard.

The toolbox shell (sidebar entry, registry, Settings toggle, "Coming soon" placeholder) was shipped in `2026-04-30-toolbox-shell-design.md`. This spec replaces the placeholder with the actual feature.

## 2. Architecture

### 2.1 One-line architecture

Main process opens N transparent frameless `BrowserWindow`s (one per display) as overlays; each overlay's background is a freshly-grabbed PNG snapshot of its display. The user draws selection / annotations on top in the renderer. On confirm, the renderer composites the final image and sends it back; main writes to clipboard / file / pin window.

### 2.2 Cross-phase decisions (locked in)

| Decision | Choice | Rationale |
|---|---|---|
| Overlay window strategy | One `BrowserWindow` per display, each covering its display's bounds | macOS doesn't reliably support cross-display windows; mixed-DPI breaks coordinates |
| Capture timing | Snapshot at hotkey press; overlay shows the snapshot, not live desktop | Pixel-perfect selection; magnifier shows real pixels; screen content frozen during selection |
| Cross-display selection | Phase 1: NOT supported (single-display per selection). Reconsider in Phase 4+ | Reduces Phase 1 complexity; per-display capture buffers stay independent |
| Pin windows | Each pin is its own `BrowserWindow`, managed by `PinManager` | Native drag/resize, independent lifetimes |
| Compositing location | Renderer-side (overlay/canvas), send dataURL back via IPC for Phase 3+ | Avoids native image manipulation deps in main (no `sharp` / `canvas` packages) |
| Trigger | Both card click + global hotkey, default `⌘+⇧+A` | Discovery via card; daily use via hotkey; tray menu skipped |
| Permission check | Lazy (first capture) + Settings recheck button | User isn't bothered until they actually try to use it |
| Permission denied UX | Native `dialog.showMessageBox` with "Open System Settings" button (deeplink) | Works without main window focused; clearer than in-app modal |
| Restart-after-grant | Required by macOS; documented in dialog body, not auto-detected | macOS process-level permission cache makes auto-detection unreliable |

### 2.3 New file structure

```
electron/services/screenshot/
  permissions.ts          // checkScreenRecordingPermission, openSystemSettings
  capture.ts              // takeScreenshots(): per-display NativeImage[]
  coordTransform.ts       // pure: CSS px + scaleFactor → native px crop bounds
  overlayManager.ts       // openAll/closeAll overlay windows, IPC dispatch
  saveImage.ts            // saveScreenshot(image, saveDir): string
  pinManager.ts           // Map<id, BrowserWindow>, createPin, closePin, hideAll, ...
  hotkeys.ts              // registerCapture/Pin/HideAll, dynamic re-register on settings change
  screenshotService.ts    // top-level: runCapture, runPinFromClipboard, handleColorPick

src/components/screenshot/
  OverlayApp.tsx          // overlay window root; mode state machine
  SelectionLayer.tsx      // drag, resize handles, move
  AnnotationLayer.tsx     // canvas + Annotation[] state
  annotations/            // one file per tool: Rectangle.tsx, Ellipse.tsx, Arrow.tsx, Pen.tsx, Text.tsx, Mosaic.tsx, Eraser.tsx
  Toolbar.tsx             // grows phase by phase
  Magnifier.tsx           // 110px popover with zoomed pixels + pixel info
  Eyedropper.tsx          // mode handler for Phase 5
  PinApp.tsx              // pin window root
  composite.ts            // pure: (screenImage, selection, annotations) → dataURL

overlay.html              // overlay window entrypoint (new electron-vite renderer input)
pin.html                  // pin window entrypoint (new electron-vite renderer input)
electron/preload-overlay.ts
electron/preload-pin.ts

tests/electron/screenshot/
  permissions.test.ts
  capture.test.ts
  coordTransform.test.ts
  saveImage.test.ts
  composite.test.ts       // bounds-only assertions; canvas drawing manually verified
  pinManager.test.ts
  colorPick.test.ts       // rgbaToHex pure function
```

### 2.4 New IPC channels

Renderer ↔ main:

```
screenshot:trigger-capture       (renderer→main; toolbox card click)
screenshot:check-permission      (renderer→main; returns 'granted'|'denied'|'not-determined'|'restricted')
screenshot:open-system-settings  (renderer→main; opens TCC pane)

dialog:choose-directory          (renderer→main; for "选择目录" button in Settings)
toast:push                       (main→main-renderer; { kind, key, vars? } so main can push a toast for in-app actions)

// Overlay-renderer ↔ main (uses overlay-preload bridge):
screenshot:overlay-init          (main→overlay; pushes screen image dataURL + display info)
screenshot:confirm               (overlay→main; { action: 'copy'|'save'|'pin', selection, imageDataURL? })
screenshot:cancel                (overlay→main)
screenshot:pickColor             (overlay→main; { hex } for eyedropper)

// Pin-renderer ↔ main (pin-preload):
pin:init                         (main→pin; image dataURL + initial bounds)
pin:close                        (pin→main; close this pin)
pin:context-menu                 (pin→main; show native context menu at cursor)
pin:set-opacity                  (pin↔main; sync opacity changes)
pin:save-as                      (pin→main; trigger save dialog for this pin's image)
```

### 2.5 Notification strategy

Screenshot operations may complete while DashMac's main window is hidden or another app is focused (global-hotkey path). Toast UX:

- **Triggered from DashMac UI** (card click): renderer toast via the existing `useToast()` store, pushed by main via the new `toast:push` IPC channel.
- **Triggered by global hotkey**: macOS native `Notification` (Electron `new Notification({title, body}).show()`). Tapping the notification activates DashMac.

`screenshotService` decides which channel to use based on the trigger source (`'card' | 'hotkey'` flag passed through `runCapture`).

### 2.6 New electron-vite entrypoints

`electron.vite.config.ts` adds two renderer inputs:

```ts
renderer: {
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        overlay: 'overlay.html',
        pin: 'pin.html',
      },
    },
  },
  // ... existing config
}
```

`overlay.html` and `pin.html` are minimal HTML files mounting `OverlayApp` and `PinApp` respectively. They share the existing `src/i18n/` and `src/styles/globals.css` but do NOT load the main SPA shell.

## 3. Settings shape

### 3.1 `AppSettings.toolbox` extension

```ts
// src/types.ts
export interface ToolboxSettings {
  screenshotEnabled: boolean
  screenshot: ScreenshotSettings   // NEW
}

export interface ScreenshotSettings {
  captureHotkey: string                                 // Electron Accelerator
  pinHotkey: string                                     // Phase 4
  hideAllPinsHotkey: string                             // Phase 4
  saveDir: string                                       // absolute path
  defaultPenColor: string                               // hex, e.g. '#FF0000'
  defaultStrokeWidth: 'thin' | 'medium' | 'thick'
}
```

### 3.2 Defaults (`electron/services/settingsStore.ts`)

```ts
import * as os from 'os'
import * as path from 'path'

export const DEFAULTS: AppSettings = {
  // ...existing fields
  toolbox: {
    screenshotEnabled: false,
    screenshot: {
      captureHotkey: 'CommandOrControl+Shift+A',
      pinHotkey: 'CommandOrControl+Shift+S',
      hideAllPinsHotkey: 'CommandOrControl+Shift+H',
      saveDir: path.join(os.homedir(), 'Pictures', 'DashMac'),
      defaultPenColor: '#FF0000',
      defaultStrokeWidth: 'medium',
    },
  },
}
```

`os.homedir()` is callable at module-load time (no Electron app-ready dependency).

### 3.3 Legacy-config nested merge

`loadSettings` is now three levels deep. Introduce a small helper:

```ts
function mergeNested<T>(defaults: T, parsed: Partial<T> | undefined): T {
  return { ...defaults, ...(parsed ?? {}) }
}

export function loadSettings(filepath?: string): AppSettings {
  // ...
  return {
    ...DEFAULTS,
    ...parsed,
    toolbox: {
      ...DEFAULTS.toolbox,
      ...(parsed.toolbox ?? {}),
      screenshot: mergeNested(DEFAULTS.toolbox.screenshot, parsed.toolbox?.screenshot),
    },
  }
}
```

This adds the second-nested-group merge that the Task 1 code reviewer flagged as a future need. Keep `mergeNested` private to `settingsStore.ts` — don't extract cross-file.

### 3.4 Settings UI extension (`src/components/settings/Settings.tsx`)

The Toolbox section is extended: when `screenshotEnabled = true`, a "截图设置" sub-region appears below the toggle with these fields (auto-save on each change, matching the established pattern):

- **权限状态**: status label `✓ 已授权` / `✗ 未授权` / `— 未确定` + buttons `[重新检查]` / `[打开系统设置]`
- **快捷键** — capture hotkey: `<input>` accepting an Electron Accelerator string (no key-recorder component; see §10 out-of-scope). Validation on save. Phase 4 adds the pin and hide-all-pins hotkey fields below
- **保存目录** (Phase 2): `<input readonly>` showing path + `[选择目录]` button calling `dialog:choose-directory`
- **默认画笔颜色** (Phase 3): 6 color swatch radio
- **默认粗细** (Phase 3): 3 thickness radio

`launchAtLogin` and the existing `Toggle` helper (shipped in toolbox-shell) are unchanged.

## 4. Permission flow

### 4.1 Detection

```ts
import { systemPreferences } from 'electron'

export type ScreenPermission = 'granted' | 'denied' | 'not-determined' | 'restricted'

export function checkScreenRecordingPermission(): ScreenPermission {
  if (process.platform !== 'darwin') return 'granted'   // dev-only fallback; ship target is macOS
  return systemPreferences.getMediaAccessStatus('screen') as ScreenPermission
}
```

Note: there is no `askForMediaAccess('screen')` API. The first call to `desktopCapturer.getSources()` triggers the system prompt natively when status is `'not-determined'`.

### 4.2 Capture entry point

```
runCapture():
  status = checkScreenRecordingPermission()
  if status === 'granted':       takeScreenshots() → openOverlays()
  if status === 'not-determined': takeScreenshots() (triggers system prompt; granted → continue; denied → showDeniedDialog)
  if status === 'denied' | 'restricted': showDeniedDialog()
```

### 4.3 Denied dialog

```ts
const result = await dialog.showMessageBox({
  type: 'info',
  title: t('screenshot.permission.title'),
  message: t('screenshot.permission.message'),
  detail: t('screenshot.permission.detail'),
  buttons: [
    t('screenshot.permission.openSettings'),
    t('screenshot.permission.later'),
  ],
  defaultId: 0,
  cancelId: 1,
})
if (result.response === 0) {
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
}
```

Detail text instructs: open settings → tick DashMac → restart DashMac (macOS process-level permission cache means current process must restart). No auto-detection.

### 4.4 Settings UI integration

Settings Toolbox sub-region renders the live status (re-fetched on mount and on `[重新检查]` click) plus an `[打开系统设置]` button that calls the same deeplink. No restart prompt — the user reads the dialog detail text.

## 5. Phase 1 — Capture core (MVP)

### 5.1 Trigger flow

```
Path A: ⌘+⇧+A (global hotkey)
Path B: ToolboxPage card click → IPC 'screenshot:trigger-capture'
Both → screenshotService.runCapture()
```

The toolbox card's existing `onClick` handler is changed: instead of opening the "Coming soon" dialog (current behavior), it sends `screenshot:trigger-capture` and closes any existing main-window state. The "Coming soon" dialog component (`ComingSoonDialog` in `ToolboxPage.tsx`) is removed.

### 5.2 Capture step

```ts
async function takeScreenshots(): Promise<{ displayId: number; image: NativeImage; bounds: Rectangle; scaleFactor: number }[]> {
  const displays = screen.getAllDisplays()
  return Promise.all(displays.map(async (display) => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: display.size.width * display.scaleFactor,
        height: display.size.height * display.scaleFactor,
      },
    })
    const matched = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
    return {
      displayId: display.id,
      image: matched.thumbnail,    // NativeImage at native pixel resolution
      bounds: display.bounds,
      scaleFactor: display.scaleFactor,
    }
  }))
}
```

### 5.3 Overlay window

Each display gets a `BrowserWindow`:

```ts
{
  x: display.bounds.x,
  y: display.bounds.y,
  width: display.bounds.width,
  height: display.bounds.height,
  frame: false,
  transparent: false,
  alwaysOnTop: true,
  fullscreenable: false,
  resizable: false,
  movable: false,
  skipTaskbar: true,
  hasShadow: false,
  webPreferences: {
    preload: path.join(__dirname, '../preload/preload-overlay.cjs'),
    contextIsolation: true,
  },
}
window.setAlwaysOnTop(true, 'screen-saver')   // covers Dock + menu bar + full-screen apps
```

After load, main pushes `screenshot:overlay-init` with `{ imageDataURL, displayId, bounds, scaleFactor }`.

### 5.4 OverlayApp state machine

```
states:
  IDLE          — magnifier follows cursor; no selection drawn
  DRAGGING      — mousedown..mouseup, selection updates with cursor
  CONFIRMED     — selection drawn, handles + toolbar visible
  RESIZING      — handle drag in progress
  MOVING        — selection-interior drag in progress

transitions (Phase 1):
  IDLE.mousedown                       → DRAGGING (anchor = cursor)
  DRAGGING.mousemove                   → update selection endpoint
  DRAGGING.mouseup                     → CONFIRMED
  CONFIRMED.mousedown(handle)          → RESIZING
  RESIZING.mouseup                     → CONFIRMED
  CONFIRMED.mousedown(inside)          → MOVING
  MOVING.mouseup                       → CONFIRMED
  CONFIRMED.mousedown(outside)         → DRAGGING (re-select)
  any.ESC                              → cancel (close all overlays)
  CONFIRMED.Enter                      → confirm-copy
  CONFIRMED.dblclick(inside)           → confirm-copy
```

### 5.5 Magnifier (Phase 1 includes basic version)

- 110×110 px popover, follows cursor with 8px offset (avoids cursor)
- Content: zoomed 11×11 pixel crop from screen image, nearest-neighbor scaled (10×); center crosshair marks current pixel
- Bottom strip: `(x, y)  RGB(r, g, b)  #HEX  [w×h]` — last segment only shows in DRAGGING/CONFIRMED

### 5.6 Toolbar (Phase 1)

```
[复制] [取消]
```

Layout: 8px below selection, horizontally centered. Falls back to above selection if not enough vertical room; finally to selection's bottom-right corner inside.

### 5.7 Confirm-copy flow

Overlay → IPC `screenshot:confirm`:

```ts
{
  action: 'copy',
  displayId: number,
  selection: { x: number, y: number, w: number, h: number },  // CSS px in overlay coords
}
```

Main process:
1. `bounds = coordTransform.toNativePx(selection, scaleFactor)`
2. `croppedImage = nativeImage.crop(bounds)` from the cached display image
3. `clipboard.writeImage(croppedImage)`
4. `overlayManager.closeAll()`
5. Notify per §2.5 (`'screenshot.toast.copied'`)

### 5.8 Cancel flow

ESC → IPC `screenshot:cancel` → `overlayManager.closeAll()`. No toast.

### 5.9 Multi-display behavior (Phase 1 limit)

The selection is scoped to whichever display the user started dragging in. Other displays' overlays exist (so the user can press ESC anywhere to cancel) but don't accept clicks. Cross-display selection is explicitly out of scope for Phase 1.

## 6. Phase 2 — Save

### 6.1 Toolbar increment

```
Phase 1: [复制] [取消]
Phase 2: [复制] [保存] [取消]
```

### 6.2 Save flow

Overlay → IPC `screenshot:confirm` with `action: 'save'`:

Main process:
1. Crop image (same as Phase 1)
2. Build filename: `Screenshot YYYY-MM-DD HH.mm.ss.png` (matches macOS system-screenshot style)
3. Resolve final path; if file exists (sub-second collision), append ` (2)`, ` (3)`, etc.
4. `fs.mkdirSync(saveDir, { recursive: true })` if missing
5. `fs.writeFileSync(path, croppedImage.toPNG())`
6. Close overlays
7. Toast: `screenshot.toast.saved` with `{path}`, plus a "在 Finder 中显示" action button using the existing `revealFile` IPC

### 6.3 Error handling

- Write fails (permission / disk full): catch → `toast.error('screenshot.error.saveFailed', { message })`
- `saveDir` is invalid (user changed it to a non-existent / non-writable path): fallback to default `path.join(os.homedir(), 'Pictures', 'DashMac')` and toast `screenshot.error.saveDirInvalid`

### 6.4 New file: `electron/services/screenshot/saveImage.ts`

```ts
export function saveScreenshot(image: NativeImage, saveDir: string): string {
  // creates dir if missing, resolves filename collision, writes PNG, returns final path
  // throws on unrecoverable errors (caller catches and toasts)
}
```

## 7. Phase 3 — Annotation

### 7.1 Annotation data model

```ts
type Annotation =
  | { id: string; type: 'rectangle'; x: number; y: number; w: number; h: number; color: string; strokeWidth: number }
  | { id: string; type: 'ellipse';   x: number; y: number; w: number; h: number; color: string; strokeWidth: number }
  | { id: string; type: 'arrow';     x1: number; y1: number; x2: number; y2: number; color: string; strokeWidth: number }
  | { id: string; type: 'pen';       points: { x: number; y: number }[]; color: string; strokeWidth: number }
  | { id: string; type: 'text';      x: number; y: number; content: string; color: string; fontSize: number }
  | { id: string; type: 'mosaic';    x: number; y: number; w: number; h: number; tileSize: number }
```

Vector-record per annotation. Render = replay all on a canvas. Undo/redo = stack ops on the array. Eraser = hit-test + remove record.

### 7.2 Toolbar (Phase 3)

```
Row 1: [选择] [矩形] [椭圆] [箭头] [铅笔] [文字] [马赛克] [橡皮] | [撤销] [重做] | [🎨color popover] [📏width popover]
Row 2: [复制] [保存] [取消]
```

- Color popover: 6 swatches single-select (red `#FF0000`, orange `#FF8800`, yellow `#FFD500`, green `#00C853`, blue `#1f6feb`, black `#000000`). Defaults to `defaultPenColor` from settings.
- Width popover: 3 stroke widths (thin 2px, medium 4px, thick 6px). Defaults to `defaultStrokeWidth`.
- Stroke width slot for `text`: maps to `fontSize` (thin=14, medium=18, thick=24).

### 7.3 OverlayApp state machine extension

Adds `activeTool: 'select' | 'rectangle' | 'ellipse' | 'arrow' | 'pen' | 'text' | 'mosaic' | 'eraser'`.

- `activeTool === 'select'`: Phase 1 selection state machine applies (handles, drag-to-resize, drag-to-move).
- Other tools: handles hide. `mousedown` starts a new annotation in progress, `mousemove` updates it, `mouseup` commits to `annotations[]` and clears `redoStack`.
- Text tool: `mousedown` is a click-to-place; renders an inline `<input contentEditable>` at the click position. Commits on click outside or when another tool is selected.
- Eraser: `click` performs z-order-reverse hit-test against `annotations[]`; if hit, removes that record (and pushes to redoStack-equivalent for undo).

### 7.4 Undo / redo

```ts
const [annotations, setAnnotations] = useState<Annotation[]>([])
const [redoStack, setRedoStack] = useState<Annotation[][]>([])

undo: pop → push prev to redoStack
redo: pop redoStack → restore
any new commit → clear redoStack
```

Granularity is per-annotation (not per-character). Text-tool input commits a single record on input completion.

### 7.5 Mosaic algorithm

For a mosaic record `{x, y, w, h, tileSize: 10}`, render: take screen image's cropped region → divide into `tileSize × tileSize` blocks → average each block's RGBA → fill that block with the average. Single tile size (10px), not user-configurable.

### 7.6 Compositing on confirm (replaces Phase 1's bounds-only IPC for copy/save/pin)

In overlay renderer:
1. Create offscreen canvas sized `selection.w * scaleFactor × selection.h * scaleFactor` (native pixels).
2. `ctx.drawImage(screenImage, srcX, srcY, srcW, srcH, 0, 0, dstW, dstH)` — crop to selection.
3. Replay each `Annotation`, translating from overlay coords to selection-relative coords, scaling by scaleFactor, and clipping to selection bounds.
4. `canvas.toDataURL('image/png')` → send via IPC payload `imageDataURL`.

Main process:
- `nativeImage.createFromDataURL(imageDataURL)` → write to clipboard / file / pin window.

### 7.7 IPC change for Phase 3+

```ts
// Phase 1/2: bounds-only
{ action: 'copy' | 'save', displayId, selection }

// Phase 3+: composited (when annotations exist or always for consistency)
{ action: 'copy' | 'save' | 'pin', displayId, selection, imageDataURL: string }
```

Implementations from Phase 3 onward always send `imageDataURL`; Phase 1/2's bounds-only path can remain for the no-annotations fast path or be replaced with the unified composite path. The unified path is simpler — recommended.

### 7.8 Scope clarification

**Included tools:** rectangle, ellipse, arrow, pen, text, mosaic, eraser, undo, redo.
**Excluded:** Gaussian blur (mosaic covers the redaction use case), shape shadows, text-tool advanced typography (font family selection, alignment).

## 8. Phase 4 — Pin (贴图)

### 8.1 Pin window config

```ts
{
  x: pinBounds.x,                  // global coords; initial = selection's screen position
  y: pinBounds.y,
  width: pinBounds.width,
  height: pinBounds.height,
  frame: false,
  transparent: true,               // for opacity-aware borders
  alwaysOnTop: true,               // setAlwaysOnTop(true, 'floating') — NOT 'screen-saver'
                                   // Pins must NOT cover other apps' full-screen windows.
  resizable: true,
  hasShadow: false,
  skipTaskbar: true,
  webPreferences: {
    preload: path.join(__dirname, '../preload/preload-pin.cjs'),
    contextIsolation: true,
  },
}
```

### 8.2 Pin triggers

1. **Selection toolbar [贴图] button**: same composite IPC path (`screenshot:confirm` with `action: 'pin'`). Main creates a pin window at the selection's screen position.
2. **`⌘+⇧+S` global hotkey**: behaves like Snipaste's F3 — reads clipboard for an image (`clipboard.readImage()`); if non-empty, creates a pin window at screen center (or last pin's position if any). If clipboard has no image, toast `screenshot.notice.clipboardEmpty`.

### 8.3 PinApp.tsx

- Background: `<img src={imageDataURL}>` filling the window via `object-fit: fill`.
- Drag: outer wrapper has `-webkit-app-region: drag`; resize handle and any interactive elements set `-webkit-app-region: no-drag`. Native drag — no IPC required.
- Resize: native via `resizable: true`. The image scales with the window via `object-fit: fill`.
- Border: 1px transparent by default; on hover, `border-color: rgba(64, 153, 255, 0.7)`. Achieved with a wrapper div around `<img>`.
- Opacity: state in PinApp; `<img>` style `opacity: <0..1>`; clamp `[0.2, 1.0]`.
- Scroll + ⌘ to adjust opacity: `wheel` event listener with `event.metaKey`, `±0.1` per tick.
- ESC: preload exposes `closeWindow()` → `BrowserWindow.close()`.
- Right-click: preload exposes `showContextMenu(x, y)` → main calls `Menu.popup()`.

### 8.4 Right-click context menu (native)

```
- 关闭此贴图
- 关闭所有贴图
- ─────
- 透明度 ▸
    100% / 80% / 60% / 40% / 20%
- ─────
- 复制图像                  (writes back to clipboard)
- 保存为...                  (opens save dialog)
```

### 8.5 PinManager (main process)

```ts
class PinManager {
  private pins = new Map<string, BrowserWindow>()
  private hidden = false

  createPin(image: NativeImage, bounds: Rectangle): string  // returns pin id
  closePin(id: string): void
  closeAll(): void
  toggleHideAll(): void           // ⌘+⇧+H
  showContextMenu(pinId: string, x: number, y: number): void
  setOpacity(id: string, opacity: number): void  // mostly informational, opacity is renderer-state
}
```

### 8.6 Selection toolbar Phase 4 increment

```
Row 1 (annotation tools): unchanged from Phase 3
Row 2: [复制] [保存] [贴图] [取消]
```

### 8.7 Lifecycle

Pins are in-memory only. Quit DashMac → all pins close, no restore on relaunch. Persistence is explicitly out of scope (§10).

## 9. Phase 5 — Eyedropper

### 9.1 Trigger

- `C` key in any overlay state — toggles eyedropper mode.
- Toolbar `[拾色]` button (icon: dropper) in IDLE state's toolbar.

### 9.2 Eyedropper behavior

- Cursor: dropper icon (CSS `cursor: crosshair` or custom).
- Magnifier (already present from Phase 1) continues to show pixel info.
- Click anywhere → IPC `screenshot:pickColor` with `{ hex: string }` → main writes `clipboard.writeText(hex)` + closes all overlays + toast `screenshot.toast.colorCopied` with `{hex}`.
- ESC → cancel, close overlays.
- `C` again → toggle back to selection mode.

### 9.3 Implementation

- Reuses the magnifier's pixel-fetch logic. The screen image (`HTMLImageElement` derived from dataURL → `OffscreenCanvas` for `getImageData`) provides per-pixel RGBA. `rgbaToHex(r,g,b)` returns `#RRGGBB`.
- Pure helper `rgbaToHex(r, g, b)` lives in `src/components/screenshot/` and is unit-tested.
- No new main-process file — `screenshotService.handleColorPick(hex)` does the clipboard write + overlay close.

## 10. i18n keys

All keys added to BOTH `src/i18n/locales/en.ts` and `src/i18n/locales/zh-CN.ts`. Shape parity test enforces this.

```ts
screenshot: {
  permission: {
    title: 'Screen Recording permission required' | '需要屏幕录制权限',
    message: 'DashMac needs Screen Recording permission to capture screenshots.' | 'DashMac 需要屏幕录制权限来截屏。',
    detail: 'Steps to grant:\n1. Click "Open System Settings" below\n2. In "Privacy & Security → Screen Recording", enable DashMac\n3. Restart DashMac (macOS requires a restart for new permissions to take effect)' | '请按以下步骤授权：\n1. 点击下方"打开系统设置"\n2. 在"隐私与安全性 → 屏幕录制"中勾选 DashMac\n3. 重启 DashMac（macOS 要求新授予的权限重启后生效）',
    openSettings: 'Open System Settings' | '打开系统设置',
    later: 'Later' | '稍后再说',
    statusGranted: 'Status: Granted' | '状态：已授权',
    statusDenied: 'Status: Denied' | '状态：未授权',
    statusNotDetermined: 'Status: Not yet determined' | '状态：未确定',
    recheck: 'Re-check' | '重新检查',
  },
  toolbar: {
    copy: 'Copy' | '复制',
    save: 'Save' | '保存',
    pin: 'Pin' | '贴图',
    cancel: 'Cancel' | '取消',
  },
  tools: {
    select: 'Select' | '选择',
    rectangle: 'Rectangle' | '矩形',
    ellipse: 'Ellipse' | '椭圆',
    arrow: 'Arrow' | '箭头',
    pen: 'Pen' | '铅笔',
    text: 'Text' | '文字',
    mosaic: 'Mosaic' | '马赛克',
    eraser: 'Eraser' | '橡皮',
    undo: 'Undo' | '撤销',
    redo: 'Redo' | '重做',
    color: 'Color' | '颜色',
    width: 'Stroke width' | '粗细',
    eyedropper: 'Pick color' | '拾色',
  },
  width: {
    thin: 'Thin' | '细',
    medium: 'Medium' | '中',
    thick: 'Thick' | '粗',
  },
  text: {
    placeholder: 'Type text…' | '输入文字…',
  },
  toast: {
    copied: 'Screenshot copied' | '截图已复制',
    saved: 'Saved to {path}' | '已保存到 {path}',
    savedReveal: 'Show in Finder' | '在 Finder 中显示',
    pinned: 'Pinned' | '已贴图',
    colorCopied: 'Copied {hex}' | '已复制 {hex}',
  },
  notice: {
    clipboardEmpty: 'No image in clipboard' | '剪贴板中没有图像',
  },
  error: {
    saveFailed: 'Save failed: {message}' | '保存失败：{message}',
    saveDirInvalid: 'Save directory invalid; using default' | '保存目录无效，已用默认目录',
  },
  pin: {
    menu: {
      closeThis: 'Close this pin' | '关闭此贴图',
      closeAll: 'Close all pins' | '关闭所有贴图',
      opacity: 'Opacity' | '透明度',
      copyImage: 'Copy image' | '复制图像',
      saveAs: 'Save as…' | '保存为…',
    },
  },
  settings: {
    captureHotkey: 'Capture hotkey' | '截图快捷键',
    pinHotkey: 'Pin from clipboard hotkey' | '剪贴板贴图快捷键',
    hideAllPinsHotkey: 'Hide all pins hotkey' | '隐藏所有贴图快捷键',
    saveDir: 'Save directory' | '保存目录',
    chooseDir: 'Choose…' | '选择…',
    defaultPenColor: 'Default annotation color' | '默认画笔颜色',
    defaultStrokeWidth: 'Default stroke width' | '默认粗细',
    invalidHotkey: 'Invalid shortcut' | '快捷键无效',
  },
}
```

The existing `toolbox.tools.screenshot.desc` (`'Snipaste-style region capture, annotation, and pin-to-screen.'` / `'类 Snipaste 的区域截图、标注与贴图。'`) is unchanged.

## 11. Testing

DashMac convention: main-process logic is tested with Vitest; renderer is verified manually. This spec follows that convention.

### 11.1 Automated tests (`tests/electron/screenshot/`)

Per-phase additions:

- **Phase 1**:
  - `permissions.test.ts` — mock `systemPreferences.getMediaAccessStatus`, cover all 4 return values
  - `capture.test.ts` — mock `desktopCapturer`, assert `thumbnailSize = display.size × scaleFactor`
  - `coordTransform.test.ts` — pure function, multiple scaleFactor scenarios
- **Phase 2**:
  - `saveImage.test.ts` — tmp directory; cover: basic save, missing-dir auto-create, filename-collision suffixing, write-failure path
- **Phase 3**:
  - `composite.test.ts` — pure-geometry assertions (annotation bounds in selection coordinate space). Canvas drawing is verified manually since jsdom canvas support is limited
- **Phase 4**:
  - `pinManager.test.ts` — mock `BrowserWindow`, assert state transitions (createPin, closePin, closeAll, hideAll)
- **Phase 5**:
  - `colorPick.test.ts` — `rgbaToHex` pure function

The existing i18n shape-parity test automatically catches en/zh-CN drift on new keys.

The settingsStore tests are extended in Phase 1's plan: legacy config without `toolbox.screenshot` resolves to defaults; round-trip preserves nested fields.

### 11.2 Manual verification

Each phase's plan owns its own manual checklist. Skeleton level:

- **Phase 1**: single-display capture → copy → paste in another app; multi-display individual capture; ESC cancel; hotkey trigger; permission-denied flow end-to-end
- **Phase 2**: save to default dir; save to custom dir; filename-collision avoidance; disk-full / permission-denied error paths
- **Phase 3**: each annotation tool individually; undo/redo cascade; eraser deletes specific annotations; mosaic visibility; text-tool IME input (Chinese)
- **Phase 4**: pin initial position; multi-pin coexistence; ⌘+⇧+H hide/show; right-click menu; opacity scroll; clipboard-pin (`⌘+⇧+S`); pin behavior under another app's full-screen mode (`'floating'` should yield)
- **Phase 5**: `C` key mode toggle; click copies HEX; ESC cancels; magnifier still works in eyedropper mode

## 12. Out of scope

Explicitly NOT in this spec or any of its 5 phases. Each item below requires its own future spec if/when prioritized.

- **OCR**: text recognition from screenshots. Heavy dependency (Tesseract / Apple Vision).
- **Scrolling / long screenshots**: macOS lacks reliable APIs.
- **Element auto-detection** (Snipaste's window/control hover-highlight): requires Accessibility permission, unstable AX API.
- **Pin persistence**: pins do not survive app restart.
- **Cross-display selection**: selection is locked to one display.
- **Multi-pin grouping**: select multiple pins, drag/close as a group.
- **Custom annotation tools**: Bezier curves, drop shadows, custom text fonts.
- **Hot-corner triggers**: macOS-style hot corner activates capture.
- **Cloud upload integration**: screenshot → Imgur / private bucket.
- **Screenshot history viewer**: in-app gallery of past captures.
- **Hotkey recorder UI**: Settings uses a plain `<input>` for accelerator strings (typed in by user); no key-press recorder component.
- **Per-tool persistent settings**: e.g., last-used annotation color. Default color/width come from settings; runtime selections during a session are not persisted.
- **Animated GIF / video capture.**

---

## 13. Per-phase implementation notes

Each phase is a self-contained implementation cycle (own plan, own PR/branch, own manual verification). Phases must ship in order — each builds on the previous's infrastructure.

| Phase | Estimated work | Depends on |
|---|---|---|
| 1 (MVP capture) | 1-2 weeks | nothing new (uses Electron stdlib) |
| 2 (save) | 1 week | Phase 1 |
| 3 (annotation) | 2-3 weeks | Phase 2 |
| 4 (pin) | 1-2 weeks | Phase 3 (uses composite path) |
| 5 (eyedropper) | 2-3 days | Phase 1 (reuses magnifier) |

Total: 5-9 weeks of focused work to ship the full Snipaste-equivalent.

When a phase's implementation begins, a brief mini-brainstorm covers the tactical UX gaps left as `TODO (phase N implementation brainstorm)` in this spec — exact toolbar pixel layout, popover styling, etc. The architecture and data model in this spec stay locked.
