# Toolbox Shell — Design

**Date:** 2026-04-30
**Status:** Approved
**Scope:** Reorganize sidebar (Files under Dashboard, Settings pinned to bottom); add a new "Toolbox" page (card-grid container for future tools); add a Settings section that toggles a placeholder Screenshot tool entry. **The screenshot tool itself is NOT implemented in this spec — clicking the card opens a "Coming soon" dialog.**

---

## 1. Goal

Lay the groundwork for a Toolbox section so future tools (starting with a Snipaste-style screenshot tool) have a place to live. Two things land in this spec:

1. Sidebar restructure — main nav reordered, Settings pinned to the bottom, new "Toolbox" entry.
2. Toolbox page shell — card-grid layout driven by a tool registry; tools appear conditionally based on per-tool toggles in Settings; clicking a card opens a placeholder dialog.

Out of scope for this spec: the screenshot tool's actual implementation (region selection overlay, annotation, pin-to-screen, hotkeys, macOS Screen Recording permission flow, etc.) — that gets its own spec.

## 2. Sidebar restructure

### 2.1 New layout

```
┌──────────────────────┐
│ DashMac      (drag)  │
├──────────────────────┤
│ ⊞  Dashboard         │
│ 📁 Files             │
│ ☰  Memory            │
│ ⇅  Network           │
│ 🧰 Toolbox           │
│                      │   ← flex-1 spacer
│                      │
├──────────────────────┤
│ ⚙  Settings          │   ← pinned bottom
├──────────────────────┤
│ v0.1.0               │
└──────────────────────┘
```

### 2.2 Implementation (`src/components/layout/Sidebar.tsx`)

- Replace single `NAV_ORDER` with two constants:
  ```ts
  const MAIN_NAV: Page[] = ['dashboard', 'files', 'memory', 'network', 'toolbox']
  const SETTINGS_NAV: Page = 'settings'
  ```
- `NAV_ICONS` extended with `toolbox: '🧰'` (placeholder; can change later).
- `<nav>` becomes `flex flex-col flex-1`. Render `MAIN_NAV.map(...)`, then a `<div className="flex-1" />` spacer, then a single Settings button using the same row markup.
- Active state styling unchanged (left border + bg).

### 2.3 `Page` type extension (`src/App.tsx`)

```ts
type Page = 'dashboard' | 'memory' | 'network' | 'files' | 'toolbox' | 'settings'
```

`PageContent` switch gets a `case 'toolbox': return <ToolboxPage />`.

## 3. Data model

### 3.1 `AppSettings` extension (`src/types.ts`)

```ts
export interface AppSettings {
  // ...existing fields unchanged
  toolbox: ToolboxSettings
}

export interface ToolboxSettings {
  screenshotEnabled: boolean   // default: false
}
```

### 3.2 Defaults + legacy-config compatibility (`electron/services/settingsStore.ts`)

```ts
export const DEFAULTS: AppSettings = {
  // ...existing fields
  toolbox: { screenshotEnabled: false },
}
```

The current `loadSettings` does a shallow `{ ...DEFAULTS, ...parsed }`. That breaks for nested `toolbox` (an existing user with no `toolbox` key gets the default; but if the JSON ever has `toolbox: {}` without `screenshotEnabled`, the shallow spread would leave `screenshotEnabled` undefined). Replace the return with an explicit nested merge:

```ts
return {
  ...DEFAULTS,
  ...parsed,
  toolbox: { ...DEFAULTS.toolbox, ...(parsed.toolbox ?? {}) },
}
```

Result: any combination of missing `toolbox` / partial `toolbox` resolves to the full default shape with explicit booleans.

## 4. Toolbox page

### 4.1 Tool registry (`src/components/toolbox/registry.ts`)

```ts
import type { AppSettings } from '../../types'

export interface ToolboxTool {
  id: string
  titleKey: string         // i18n key, e.g. 'toolbox.tools.screenshot.title'
  descKey: string          // i18n key, e.g. 'toolbox.tools.screenshot.desc'
  icon: string             // emoji/unicode rendered on the card
  isEnabled: (s: AppSettings) => boolean
}

export const TOOLBOX_TOOLS: ToolboxTool[] = [
  {
    id: 'screenshot',
    titleKey: 'toolbox.tools.screenshot.title',
    descKey: 'toolbox.tools.screenshot.desc',
    icon: '📷',
    isEnabled: (s) => s.toolbox.screenshotEnabled,
  },
]
```

Adding a future tool is one line in this array + one toggle in Settings + one nested settings field.

### 4.2 Page component (`src/components/toolbox/ToolboxPage.tsx`)

State: a single `settings: AppSettings | null` loaded once via `getSettings()` in a `useEffect` (mirrors `Settings.tsx` pattern). No new Zustand store.

Render rules:
- `settings === null` (still loading) → render `{t('common.loading')}` skeleton
- `settings` loaded, no enabled tools → empty state: title `{t('toolbox.empty.title')}` + hint `{t('toolbox.empty.hint')}`
- One or more enabled → `grid grid-cols-2 lg:grid-cols-3 gap-4`, one card per enabled tool
- Card markup: `bg-bg-secondary border border-border-primary rounded-lg p-4 hover:bg-bg-tertiary cursor-pointer`
  - Top: `<span className="text-2xl">{icon}</span>`
  - Title: `text-sm font-medium text-text-primary`
  - Description: `text-xs text-text-secondary mt-1`
  - Bottom-right: `{t('toolbox.open')}` rendered as a styled `<span>` inside the card (visual affordance only — see click handling below)
- The **entire card** is the click target — `onClick` lives on the outermost card `<div>` only, calling `setOpenTool(tool)`. The Open label is not a separate button, so there are no event-bubbling concerns.

Page lifecycle: switching pages is unmount/remount (App.tsx switch), so `useEffect(getSettings, [])` re-runs each time and naturally picks up Settings changes. No IPC subscription needed.

### 4.3 "Coming soon" dialog

Reuse the native `<dialog>` + `m-auto` pattern proven in `CommandRunStatus.tsx` (Tailwind 4 preflight resets margin, so the explicit `m-auto` class is needed for centering).

```tsx
<dialog ref={dialogRef} className="m-auto bg-bg-secondary border ... rounded-lg p-6">
  <h3>{t('toolbox.comingSoon.title')}</h3>
  <p>{t('toolbox.comingSoon.body')}</p>
  <button onClick={() => dialogRef.current?.close()}>{t('toolbox.comingSoon.close')}</button>
</dialog>
```

`useEffect` calls `dialogRef.current?.showModal()` when `openTool` becomes non-null. ESC and the Close button both close it via the standard `<dialog>` behavior.

## 5. Settings UI extension

### 5.1 New section in `src/components/settings/Settings.tsx`

Insert between the existing **Appearance** section and the **Custom Commands** section (rationale: ordering goes presentation → toolbox → extension capabilities → export).

```tsx
<Section title={t('settings.sections.toolbox')}>
  <p className="text-xs text-text-secondary mb-3">
    {t('settings.toolbox.description')}
  </p>
  <Field label={t('settings.toolbox.screenshotEnabled')}>
    <Toggle
      value={settings.toolbox.screenshotEnabled}
      onChange={async (v) => {
        const updated = {
          ...settings,
          toolbox: { ...settings.toolbox, screenshotEnabled: v },
        }
        setSettings(updated)
        await window.api.saveSettings(updated)
      }}
    />
  </Field>
</Section>
```

**Auto-save rationale:** The toolbox toggle persists immediately (matching the existing `language` and `customCommands` patterns). This way, switching from Settings to the Toolbox page reliably reflects the new state without requiring the user to remember the bottom "Save Settings" button. `launchAtLogin` still uses the manual-save pattern; we don't change its behavior in this spec.

### 5.2 Toggle helper

The current `launchAtLogin` row inlines its own toggle button (button + sliding div). Extract a small `Toggle` component reused by both `launchAtLogin` and `screenshotEnabled`:

```tsx
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`w-10 h-5 rounded-full transition-colors ${value ? 'bg-status-blue' : 'bg-border-primary'}`}>
      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}
```

Co-locate inside `Settings.tsx` (no new file). Update `launchAtLogin` row to use `Toggle` as well — DRY across the two known call sites.

## 6. i18n

All keys added to BOTH `src/i18n/locales/en.ts` and `src/i18n/locales/zh-CN.ts`. The shape parity test (already in place) enforces this.

```ts
sidebar: {
  ...
  toolbox: 'Toolbox' | '工具箱',
}

pages: {
  ...
  toolbox: 'Toolbox' | '工具箱',
}

toolbox: {
  empty: {
    title: 'No tools enabled' | '暂无启用的工具',
    hint: 'Enable tools in Settings → Toolbox.' | '前往「设置 → 工具箱」启用工具。',
  },
  open: 'Open' | '打开',
  comingSoon: {
    title: 'Coming soon' | '功能开发中',
    body: 'This tool is not implemented yet. Stay tuned.' | '该工具尚在开发中，敬请期待。',
    close: 'Close' | '关闭',
  },
  tools: {
    screenshot: {
      title: 'Screenshot' | '截图',
      desc: 'Snipaste-style region capture, annotation, and pin-to-screen.' | '类 Snipaste 的区域截图、标注与贴图。',
    },
  },
},

settings: {
  sections: {
    ...
    toolbox: 'Toolbox' | '工具箱',
  },
  toolbox: {
    description: 'Enable tools to make them appear in the Toolbox page.' | '启用工具后会出现在「工具箱」页面。',
    screenshotEnabled: 'Screenshot tool' | '截图工具',
  },
},
```

## 7. Error handling

- `getSettings()` rejection in `ToolboxPage`: `catch` and fall back to rendering the empty state (the worst observable result is "no tools enabled", which is acceptable). Don't throw; don't show a red error banner.
- Legacy config without `toolbox` field: the nested merge in `loadSettings` (§3.2) guarantees `settings.toolbox.screenshotEnabled === false`. No runtime crash possible from missing fields.
- TypeScript `strict` is on; all new types are explicit. `TOOLBOX_TOOLS` is `ToolboxTool[]` (mutable; not `readonly`) so future entries can be added without a type-only `as const` dance.
- `<dialog>` ref can be null during initial render; guard with `dialogRef.current?.showModal()` (optional chaining), matching the pattern in `CommandRunStatus.tsx`.

## 8. Testing

The repo has no renderer/component tests; this spec keeps that boundary. Renderer changes (Sidebar reorder, Toolbox page, Settings UI) are verified manually.

### 8.1 Automated (Vitest, `tests/electron/`)

Extend `tests/electron/settingsStore.test.ts`:

1. **Legacy config without `toolbox`**: writing a settings JSON missing the `toolbox` key → `loadSettings` returns `toolbox: { screenshotEnabled: false }`.
2. **Round-trip with `screenshotEnabled: true`**: save settings with `toolbox.screenshotEnabled = true`, reload → field is `true`.
3. **Partial `toolbox` object**: writing `{ ..., "toolbox": {} }` → reload returns `toolbox: { screenshotEnabled: false }` (missing inner field filled by default).

i18n shape parity test should automatically catch any en/zh-CN mismatch on the new keys; no extra test needed.

### 8.2 Manual verification

1. Fresh user (delete `~/Library/Application Support/dashmac/settings.json` and `dashmac-data.db`) → first launch shows 5 main nav items + Settings pinned at bottom + v0.1.0 below.
2. Sidebar order: Dashboard → Files → Memory → Network → Toolbox.
3. Click each main nav item → page switches; visual layout intact for existing pages.
4. Click Toolbox → "No tools enabled" empty state with hint pointing to Settings.
5. Settings → Toolbox section visible between Appearance and Custom Commands; description text shown; Screenshot tool toggle is OFF.
6. Toggle Screenshot tool ON (auto-saves) → switch to Toolbox → Screenshot card appears.
7. Click anywhere on the Screenshot card → "Coming soon" modal centered on screen; ESC closes; Close button closes.
8. Toggle Screenshot tool OFF (auto-saves) → switch to Toolbox → card gone, empty state restored.
9. Switch language en ↔ zh-CN → all new strings (sidebar item, page title, section title, toggle label, empty state, card title/desc, dialog text) localize correctly.
10. Legacy upgrade (preserve old `settings.json` without `toolbox` field) → app launches without error; Toolbox section appears in Settings; toggle defaults to OFF.

## 9. Out of scope

- Screenshot tool implementation (region selection overlay, annotation, pin-to-screen, hotkeys, Screen Recording permission, multi-display support, color picker, etc.)
- Per-tool configuration UI inside the Toolbox page (tool-specific preferences will be designed alongside each tool's own spec)
- Toolbox sub-navigation (categories, search, sorting)
- In-page enable/disable controls inside the Toolbox page (toggles live only in Settings to keep one source of truth)
- Final visual design of the Toolbox icon (🧰 emoji is a placeholder)
- Tray window changes (Toolbox is desktop-only for now)
