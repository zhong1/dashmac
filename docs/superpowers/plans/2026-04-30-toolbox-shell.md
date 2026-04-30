# Toolbox Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the sidebar (Files moved under Dashboard, Settings pinned to bottom), add a new "Toolbox" page with a card-grid registry of tools, and add a Settings section that toggles a placeholder Screenshot tool entry. The screenshot tool itself is **not** implemented in this plan — clicking the card opens a "Coming soon" dialog.

**Architecture:** Five layers wired bottom-up.
1. Data — extend `AppSettings` with a nested `toolbox: { screenshotEnabled }` field; teach `loadSettings` to do a nested merge so legacy configs without `toolbox` resolve to defaults.
2. i18n — new keys for sidebar/page/toolbox/settings sections in both en + zh-CN.
3. Toolbox UI — `registry.ts` (typed array of tools, each with `isEnabled(settings)`) + `ToolboxPage.tsx` (filters registry by enabled, renders card grid or empty state, opens "Coming soon" dialog on card click).
4. Sidebar — split nav into `MAIN_NAV` array + a separate Settings button pinned to the bottom via a `flex-1` spacer; add Toolbox to the main nav.
5. Settings — extract a reusable `Toggle` component (DRY across `launchAtLogin` + `screenshotEnabled`); add a new Toolbox section that auto-saves on toggle.

**Tech Stack:** Electron, React 19, TypeScript strict, Tailwind 4, Zustand (existing), Vitest. Native HTML `<dialog>` for the Coming-soon modal (matches the `CommandRunStatus.tsx` pattern with `m-auto` to defeat Tailwind preflight). No new npm dependencies.

**Reference:** Spec at `docs/superpowers/specs/2026-04-30-toolbox-shell-design.md` (commit `cb01b91`) is the source of truth. If the plan and spec disagree, the spec wins — flag the discrepancy and stop.

**Worktree:** Implement from `~/.config/superpowers/worktrees/dashmac/toolbox-shell` on branch `feature/toolbox-shell`.

---

## File Structure

**New files (3):**
- `src/components/toolbox/registry.ts` — `ToolboxTool` interface + `TOOLBOX_TOOLS` array.
- `src/components/toolbox/ToolboxPage.tsx` — page component + `ComingSoonDialog`.
- (No new test files. Renderer has no component tests by convention; settings tests are extensions.)

**Modified files (8):**
- `src/types.ts` — add `ToolboxSettings` interface, extend `AppSettings.toolbox`.
- `electron/services/settingsStore.ts` — add `toolbox` to `DEFAULTS`; nested merge in `loadSettings`.
- `tests/electron/settingsStore.test.ts` — add 3 tests for the toolbox field (default, partial, round-trip).
- `src/i18n/locales/en.ts` — new keys.
- `src/i18n/locales/zh-CN.ts` — same keys, zh translations.
- `src/components/layout/Sidebar.tsx` — reorder nav, pin Settings to bottom, add Toolbox icon.
- `src/App.tsx` — extend `Page` type with `'toolbox'`, add `case 'toolbox'` in `PageContent`.
- `src/components/settings/Settings.tsx` — extract `Toggle` helper, refactor `launchAtLogin`, add Toolbox section, update local `DEFAULTS`.

---

## Task 1: Extend `AppSettings` with `toolbox` (settingsStore + types)

**Files:**
- Modify: `src/types.ts`
- Modify: `electron/services/settingsStore.ts`
- Modify: `tests/electron/settingsStore.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Append the following tests to `tests/electron/settingsStore.test.ts` (inside the existing `describe('settingsStore', ...)` block, before the closing `})`):

```ts
test('DEFAULTS includes toolbox.screenshotEnabled=false', () => {
  expect(DEFAULTS.toolbox).toEqual({ screenshotEnabled: false })
})

test('round-trip preserves toolbox.screenshotEnabled', () => {
  const f = tmpFile()
  created.push(f)
  const next = { ...DEFAULTS, toolbox: { screenshotEnabled: true } }
  saveSettings(next, f)
  expect(loadSettings(f).toolbox).toEqual({ screenshotEnabled: true })
})

test('migration: existing settings.json without toolbox gets defaults', () => {
  const f = tmpFile()
  created.push(f)
  fs.writeFileSync(f, JSON.stringify({ retentionDays: 30 }), 'utf8')
  expect(loadSettings(f).toolbox).toEqual({ screenshotEnabled: false })
})

test('migration: settings.json with empty toolbox object gets defaults filled in', () => {
  const f = tmpFile()
  created.push(f)
  fs.writeFileSync(f, JSON.stringify({ toolbox: {} }), 'utf8')
  expect(loadSettings(f).toolbox).toEqual({ screenshotEnabled: false })
})
```

- [ ] **Step 1.2: Run the tests and confirm they fail**

Run: `npx vitest run tests/electron/settingsStore.test.ts`
Expected: 4 new tests fail (compile errors / `DEFAULTS.toolbox` undefined / `result.toolbox` undefined). Existing tests still pass.

- [ ] **Step 1.3: Add `ToolboxSettings` to `src/types.ts`**

In `src/types.ts`, find the `AppSettings` interface (around line 177):

```ts
export interface AppSettings {
  realtimeInterval: number
  historyInterval: number
  retentionDays: number
  trayDisplayMetric: 'memory' | 'cpu' | 'network' | 'none'
  launchAtLogin: boolean
  language: 'auto' | 'en' | 'zh-CN'
  resolvedLanguage: 'en' | 'zh-CN'
  fileShortcuts: string[]
  showHiddenFiles: boolean
  customCommands: CustomCommand[]
}
```

Add a new field and a new interface:

```ts
export interface AppSettings {
  realtimeInterval: number
  historyInterval: number
  retentionDays: number
  trayDisplayMetric: 'memory' | 'cpu' | 'network' | 'none'
  launchAtLogin: boolean
  language: 'auto' | 'en' | 'zh-CN'
  resolvedLanguage: 'en' | 'zh-CN'
  fileShortcuts: string[]
  showHiddenFiles: boolean
  customCommands: CustomCommand[]
  toolbox: ToolboxSettings
}

export interface ToolboxSettings {
  screenshotEnabled: boolean   // default: false
}
```

- [ ] **Step 1.4: Update `DEFAULTS` and `loadSettings` in `electron/services/settingsStore.ts`**

Replace the entire file content:

```ts
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { AppSettings } from '../../src/types'

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
  customCommands: [],
  toolbox: { screenshotEnabled: false },
}

function defaultPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(filepath?: string): AppSettings {
  const p = filepath ?? defaultPath()
  try {
    const raw = fs.readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      ...DEFAULTS,
      ...parsed,
      toolbox: { ...DEFAULTS.toolbox, ...(parsed.toolbox ?? {}) },
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: AppSettings, filepath?: string): void {
  const p = filepath ?? defaultPath()
  const { resolvedLanguage: _drop, ...persisted } = settings
  fs.writeFileSync(p, JSON.stringify(persisted, null, 2), 'utf8')
}
```

- [ ] **Step 1.5: Run tests and verify they pass**

Run: `npx vitest run tests/electron/settingsStore.test.ts`
Expected: all tests pass (existing + 4 new = 13 tests).

- [ ] **Step 1.6: Run full test suite to catch regressions**

Run: `npm test`
Expected: all suites pass (no test should reference the old `AppSettings` shape negatively).

- [ ] **Step 1.7: Commit**

```bash
git add src/types.ts electron/services/settingsStore.ts tests/electron/settingsStore.test.ts
git commit -m "$(cat <<'EOF'
feat(settings): add toolbox.screenshotEnabled with nested merge for legacy configs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: i18n keys

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh-CN.ts`

The `tests/electron/i18n-shape.test.ts` already enforces en/zh parity. It will fail if the two files drift; we lean on it instead of writing new tests.

- [ ] **Step 2.1: Run shape parity baseline**

Run: `npx vitest run tests/electron/i18n-shape.test.ts`
Expected: PASS (current state is in parity).

- [ ] **Step 2.2: Add new keys to `src/i18n/locales/en.ts`**

Edit the file to add a `toolbox` key to `sidebar`, a `toolbox` key to `pages`, a new top-level `toolbox` block, a new `toolbox` section under `settings.sections`, and a new `toolbox` block under `settings`.

In `sidebar`:
```ts
sidebar: {
  dashboard: 'Dashboard',
  memory: 'Memory',
  network: 'Network',
  files: 'Files',
  toolbox: 'Toolbox',
  settings: 'Settings',
},
```

In `pages`:
```ts
pages: {
  dashboard: 'Dashboard',
  memory: 'Memory Management',
  network: 'Network Analysis',
  files: 'Files',
  toolbox: 'Toolbox',
  settings: 'Settings',
},
```

Add a new top-level `toolbox` block (insert it after the `disk` block, before `network`, to follow alphabetical-ish grouping with other page-level blocks):

```ts
toolbox: {
  empty: {
    title: 'No tools enabled',
    hint: 'Enable tools in Settings → Toolbox.',
  },
  open: 'Open',
  comingSoon: {
    title: 'Coming soon',
    body: 'This tool is not implemented yet. Stay tuned.',
    close: 'Close',
  },
  tools: {
    screenshot: {
      title: 'Screenshot',
      desc: 'Snipaste-style region capture, annotation, and pin-to-screen.',
    },
  },
},
```

In `settings.sections`:
```ts
sections: {
  dataCollection: 'Data Collection',
  menuBar: 'Menu Bar',
  storage: 'Storage',
  system: 'System',
  export: 'Export Data',
  appearance: 'Appearance',
  toolbox: 'Toolbox',
},
```

In `settings` (insert a new sibling block after `language` and before `save`):
```ts
toolbox: {
  description: 'Enable tools to make them appear in the Toolbox page.',
  screenshotEnabled: 'Screenshot tool',
},
```

- [ ] **Step 2.3: Add the same keys to `src/i18n/locales/zh-CN.ts` with translations**

In `sidebar`:
```ts
sidebar: {
  dashboard: '仪表盘',
  memory: '内存',
  network: '网络',
  files: '文件',
  toolbox: '工具箱',
  settings: '设置',
},
```

In `pages`:
```ts
pages: {
  dashboard: '仪表盘',
  memory: '内存管理',
  network: '网络分析',
  files: '文件',
  toolbox: '工具箱',
  settings: '设置',
},
```

Top-level `toolbox` block (same insertion point as en.ts):
```ts
toolbox: {
  empty: {
    title: '暂无启用的工具',
    hint: '前往「设置 → 工具箱」启用工具。',
  },
  open: '打开',
  comingSoon: {
    title: '功能开发中',
    body: '该工具尚在开发中，敬请期待。',
    close: '关闭',
  },
  tools: {
    screenshot: {
      title: '截图',
      desc: '类 Snipaste 的区域截图、标注与贴图。',
    },
  },
},
```

In `settings.sections`:
```ts
sections: {
  dataCollection: '数据采集',
  menuBar: '菜单栏',
  storage: '存储',
  system: '系统',
  export: '导出数据',
  appearance: '外观',
  toolbox: '工具箱',
},
```

In `settings` (after `language` and before `save`):
```ts
toolbox: {
  description: '启用工具后会出现在「工具箱」页面。',
  screenshotEnabled: '截图工具',
},
```

- [ ] **Step 2.4: Run shape parity test**

Run: `npx vitest run tests/electron/i18n-shape.test.ts`
Expected: PASS. If it fails with a key set diff, fix the missing/extra key and re-run.

- [ ] **Step 2.5: Run TypeScript check**

Run: `npm run build`
Expected: build succeeds (the `zh-CN.ts` file uses `typeof en` for its type, so any missing key is caught at compile time too).

- [ ] **Step 2.6: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/zh-CN.ts
git commit -m "$(cat <<'EOF'
feat(i18n): add toolbox keys for sidebar, page, settings, and tool registry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Toolbox page + tool registry + App routing

**Files:**
- Create: `src/components/toolbox/registry.ts`
- Create: `src/components/toolbox/ToolboxPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 3.1: Create `src/components/toolbox/registry.ts`**

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

- [ ] **Step 3.2: Create `src/components/toolbox/ToolboxPage.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../types'
import { useTranslation } from '../../i18n/index'
import { TOOLBOX_TOOLS, type ToolboxTool } from './registry'

export default function ToolboxPage() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [openTool, setOpenTool] = useState<ToolboxTool | null>(null)

  useEffect(() => {
    let mounted = true
    window.api.getSettings()
      .then((s) => { if (mounted) setSettings(s) })
      .catch(() => { if (mounted) setSettings(null) })
    return () => { mounted = false }
  }, [])

  if (settings === null) {
    return (
      <div className="text-sm text-text-muted font-mono">
        {t('common.loading')}
      </div>
    )
  }

  const enabled = TOOLBOX_TOOLS.filter((tool) => tool.isEnabled(settings))

  return (
    <>
      {enabled.length === 0 ? (
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-8 text-center">
          <h3 className="text-sm font-medium text-text-primary mb-2">
            {t('toolbox.empty.title')}
          </h3>
          <p className="text-xs text-text-secondary">
            {t('toolbox.empty.hint')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {enabled.map((tool) => (
            <div
              key={tool.id}
              onClick={() => setOpenTool(tool)}
              className="bg-bg-secondary border border-border-primary rounded-lg p-4 hover:bg-bg-tertiary cursor-pointer flex flex-col"
            >
              <span className="text-2xl mb-2">{tool.icon}</span>
              <h3 className="text-sm font-medium text-text-primary">
                {t(tool.titleKey)}
              </h3>
              <p className="text-xs text-text-secondary mt-1 flex-1">
                {t(tool.descKey)}
              </p>
              <div className="flex justify-end mt-3">
                <span className="text-xs px-3 py-1.5 bg-status-blue text-white rounded">
                  {t('toolbox.open')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {openTool && <ComingSoonDialog onClose={() => setOpenTool(null)} />}
    </>
  )
}

function ComingSoonDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto bg-bg-secondary text-text-primary border border-border-primary rounded-lg p-6 w-[480px] max-w-[90vw] backdrop:bg-black/40"
    >
      <h3 className="text-sm font-medium mb-2">
        {t('toolbox.comingSoon.title')}
      </h3>
      <p className="text-xs text-text-secondary mb-4">
        {t('toolbox.comingSoon.body')}
      </p>
      <div className="flex justify-end">
        <button
          onClick={() => ref.current?.close()}
          className="text-xs px-3 py-1.5 border border-border-primary rounded hover:bg-bg-tertiary"
        >
          {t('toolbox.comingSoon.close')}
        </button>
      </div>
    </dialog>
  )
}
```

Notes:
- The `m-auto` class on `<dialog>` is **required** (Tailwind 4 preflight resets `dialog { margin: 0 }`, overriding the browser's `:modal { margin: auto }`). This matches the proven pattern in `src/components/common/CommandRunStatus.tsx`.
- The entire card `<div>` is the click target; the "Open" pill is a visual `<span>`, not a button — no event-bubbling concerns.
- The `useEffect` `mounted` guard prevents a `setSettings` call after unmount if the user navigates away during the IPC round-trip.

- [ ] **Step 3.3: Modify `src/App.tsx` to wire ToolboxPage**

Find the `Page` type at the top:

```ts
type Page = 'dashboard' | 'memory' | 'network' | 'files' | 'settings'
```

Replace with:

```ts
type Page = 'dashboard' | 'memory' | 'network' | 'files' | 'toolbox' | 'settings'
```

Find the imports at the top of the file (after the `Settings` import):

```ts
import Settings from './components/settings/Settings'
```

Add immediately after:

```ts
import ToolboxPage from './components/toolbox/ToolboxPage'
```

Find the `PageContent` switch:

```ts
function PageContent({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  switch (page) {
    case 'dashboard':
      return <Overview onNavigate={onNavigate} />
    case 'memory':
      return <MemoryOverview />
    case 'network':
      return <NetworkOverview />
    case 'files':
      return <FilesPage />
    case 'settings':
      return <Settings />
  }
}
```

Replace with:

```ts
function PageContent({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  switch (page) {
    case 'dashboard':
      return <Overview onNavigate={onNavigate} />
    case 'memory':
      return <MemoryOverview />
    case 'network':
      return <NetworkOverview />
    case 'files':
      return <FilesPage />
    case 'toolbox':
      return <ToolboxPage />
    case 'settings':
      return <Settings />
  }
}
```

- [ ] **Step 3.4: Type-check the project**

Run: `npm run build`
Expected: build succeeds. (Sidebar still uses old `Page` type definition local to its own file — that's still valid because adding a member to the union doesn't break the existing usage. We update the Sidebar's local `Page` type next task, but the project still builds because the Sidebar never receives `'toolbox'` until Task 4.)

- [ ] **Step 3.5: Run full test suite**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 3.6: Commit**

```bash
git add src/components/toolbox/ src/App.tsx
git commit -m "$(cat <<'EOF'
feat(toolbox): add ToolboxPage with tool registry and Coming-soon dialog

Card-grid container that filters TOOLBOX_TOOLS by per-tool isEnabled(settings).
Empty state when no tools enabled. Native <dialog> with m-auto centering.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Sidebar reorder + Settings pinned to bottom

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 4.1: Replace the entire `src/components/layout/Sidebar.tsx`**

```tsx
import { useTranslation } from '../../i18n/index'

type Page = 'dashboard' | 'memory' | 'network' | 'files' | 'toolbox' | 'settings'

interface SidebarProps {
  activePage: Page
  onNavigate: (page: Page) => void
}

const NAV_ICONS: Record<Page, string> = {
  dashboard: '⊞',
  memory: '☰',
  network: '⇅',
  files: '📁',
  toolbox: '🧰',
  settings: '⚙',
}

const MAIN_NAV: Page[] = ['dashboard', 'files', 'memory', 'network', 'toolbox']

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { t } = useTranslation()

  const renderItem = (id: Page) => (
    <button
      key={id}
      onClick={() => onNavigate(id)}
      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${
        activePage === id
          ? 'bg-bg-tertiary text-text-primary border-l-2 border-status-blue'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
      }`}
    >
      <span className="font-mono text-base">{NAV_ICONS[id]}</span>
      {t(`sidebar.${id}`)}
    </button>
  )

  return (
    <aside className="w-48 h-full bg-bg-secondary border-r border-border-primary flex flex-col">
      <div className="pt-10 px-4 pb-4 border-b border-border-primary app-drag">
        <h1 className="text-lg font-bold text-text-primary font-mono">DashMac</h1>
      </div>
      <nav className="flex-1 py-2 flex flex-col">
        {MAIN_NAV.map(renderItem)}
        <div className="flex-1" />
        {renderItem('settings')}
      </nav>
      <div className="p-4 border-t border-border-primary text-xs text-text-muted font-mono">
        v0.1.0
      </div>
    </aside>
  )
}
```

Notes:
- `MAIN_NAV` ordering: dashboard → **files** → memory → network → toolbox (per spec §2.1).
- The `<nav>` is now `flex flex-col flex-1`. The middle `<div className="flex-1" />` spacer pushes the Settings button to the bottom of the nav region.
- `Page` type is still duplicated between `App.tsx` and `Sidebar.tsx` (existing pattern, not in scope to refactor).

- [ ] **Step 4.2: Type-check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4.3: Run full test suite**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 4.4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(sidebar): reorder nav (files under dashboard) and pin Settings to bottom

Adds the Toolbox entry. Settings button is rendered separately, pushed to the
bottom of the nav region by a flex-1 spacer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Settings — Toolbox section + reusable Toggle helper

**Files:**
- Modify: `src/components/settings/Settings.tsx`

- [ ] **Step 5.1: Update local `DEFAULTS` in Settings.tsx**

Find the `DEFAULTS` constant near the top (around line 5-11):

```ts
const DEFAULTS: AppSettings = {
  realtimeInterval: 2000, historyInterval: 60000, retentionDays: 90,
  trayDisplayMetric: 'memory', launchAtLogin: false,
  language: 'auto', resolvedLanguage: 'en',
  fileShortcuts: [], showHiddenFiles: false,
  customCommands: [],
}
```

Replace with:

```ts
const DEFAULTS: AppSettings = {
  realtimeInterval: 2000, historyInterval: 60000, retentionDays: 90,
  trayDisplayMetric: 'memory', launchAtLogin: false,
  language: 'auto', resolvedLanguage: 'en',
  fileShortcuts: [], showHiddenFiles: false,
  customCommands: [],
  toolbox: { screenshotEnabled: false },
}
```

- [ ] **Step 5.2: Add the `Toggle` helper component to Settings.tsx**

Append the following helper after the `Field` function (which is currently the last function in the file before `CustomCommandsEditor`):

```tsx
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-10 h-5 rounded-full transition-colors ${value ? 'bg-status-blue' : 'bg-border-primary'}`}
    >
      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}
```

- [ ] **Step 5.3: Refactor `launchAtLogin` to use `Toggle`**

Find the `launchAtLogin` row in the `<Section title={t('settings.sections.system')}>` block:

```tsx
<Field label={t('settings.fields.launchAtLogin')}>
  <button onClick={() => setSettings({ ...settings, launchAtLogin: !settings.launchAtLogin })}
    className={`w-10 h-5 rounded-full transition-colors ${settings.launchAtLogin ? 'bg-status-blue' : 'bg-border-primary'}`}>
    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings.launchAtLogin ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
</Field>
```

Replace with:

```tsx
<Field label={t('settings.fields.launchAtLogin')}>
  <Toggle
    value={settings.launchAtLogin}
    onChange={(v) => setSettings({ ...settings, launchAtLogin: v })}
  />
</Field>
```

- [ ] **Step 5.4: Add the new Toolbox `<Section>` between Appearance and Custom Commands**

Find the existing Appearance section:

```tsx
<Section title={t('settings.sections.appearance')}>
  <Field label={t('settings.fields.language')}>
    <select value={settings.language} onChange={(e) => handleLanguageChange(e.target.value as AppSettings['language'])}
      className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm font-mono text-text-primary">
      <option value="auto">{t('settings.language.auto')}</option>
      <option value="en">{t('settings.language.en')}</option>
      <option value="zh-CN">{t('settings.language.zhCN')}</option>
    </select>
  </Field>
</Section>
```

After the closing `</Section>` for Appearance (and before the `<Section title={t('settings.customCommands.title')}>` block), insert:

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

The `onChange` is `async` and calls `window.api.saveSettings(updated)` immediately — this matches the existing `handleLanguageChange` and `customCommands` auto-save pattern, so toggling the switch makes the Toolbox card appear/disappear without requiring the user to click "Save Settings".

- [ ] **Step 5.5: Type-check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5.6: Run full test suite**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 5.7: Commit**

```bash
git add src/components/settings/Settings.tsx
git commit -m "$(cat <<'EOF'
feat(settings): add toolbox section with screenshot enable toggle

Extracts a reusable Toggle component (DRY across launchAtLogin and the new
toolbox.screenshotEnabled). New section auto-saves on toggle so the Toolbox
page reflects changes immediately on navigation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Manual verification + final type/test gate

**Files:** none modified unless verification surfaces a bug.

- [ ] **Step 6.1: Run the full automated suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6.2: Run a clean type-check / build**

Run: `npm run build`
Expected: clean build with no type errors.

- [ ] **Step 6.3: Start dev server and walk the manual checklist**

Run: `npm run dev`

Walk through each item from the spec §8.2 and confirm:

1. Sidebar order: Dashboard → Files → Memory → Network → Toolbox.
2. Settings is visually pinned to the bottom of the nav (with v0.1.0 below it).
3. Click Toolbox → "No tools enabled" empty state with hint pointing to Settings.
4. Settings → Toolbox section is visible between Appearance and Custom Commands; description text is shown; the screenshot toggle is OFF.
5. Toggle Screenshot tool ON → switch to Toolbox → Screenshot card appears (no "Save Settings" click needed; it auto-saves).
6. Click anywhere on the Screenshot card → "Coming soon" modal appears centered on screen; ESC key closes it; Close button closes it.
7. Toggle Screenshot tool OFF → switch to Toolbox → card disappears, empty state restored.
8. Switch language en ↔ zh-CN → all new strings localize (sidebar item, page title, section title, toggle label, empty state, card title/desc, dialog text).
9. Verify launchAtLogin toggle still works correctly (regression check after the Toggle refactor).
10. Quit and relaunch → toggle state persists.

If any step fails, fix the issue, re-run the relevant tests, and commit the fix as a separate commit before proceeding.

- [ ] **Step 6.4: Legacy upgrade smoke test**

Without quitting the dev server, in a separate terminal:

```bash
# Snapshot the current settings file path
ls -la "$HOME/Library/Application Support/dashmac/settings.json"
```

Then quit DashMac, manually edit `~/Library/Application Support/dashmac/settings.json` to **remove** the `toolbox` key entirely (simulating a pre-upgrade config), save, and relaunch DashMac.

Expected:
- App launches without error.
- Toolbox section in Settings shows the toggle in OFF state.
- Toolbox sidebar entry shows the empty state when clicked.

- [ ] **Step 6.5: Push the branch (if working in a worktree)**

```bash
git push -u origin feature/toolbox-shell
```

The plan is complete; the user merges via PR or direct merge based on their preferred workflow.

---

## Self-review notes

**Spec coverage check** — every section of the spec maps to at least one task:

| Spec section | Covered by |
|---|---|
| §2.1 sidebar layout | Task 4 |
| §2.2 Sidebar.tsx implementation | Task 4 step 4.1 |
| §2.3 Page type extension | Task 3 step 3.3 |
| §3.1 AppSettings extension | Task 1 step 1.3 |
| §3.2 DEFAULTS + nested merge | Task 1 step 1.4 |
| §4.1 Tool registry | Task 3 step 3.1 |
| §4.2 ToolboxPage component | Task 3 step 3.2 |
| §4.3 Coming-soon dialog | Task 3 step 3.2 (`ComingSoonDialog`) |
| §5.1 Settings new section | Task 5 step 5.4 |
| §5.2 Toggle helper + launchAtLogin refactor | Task 5 steps 5.2 + 5.3 |
| §6 i18n keys | Task 2 |
| §7 error handling | Task 1 (legacy merge) + Task 3 (`mounted` guard, `?.` chains) |
| §8.1 automated tests | Task 1 step 1.1 + Task 2 step 2.4 (parity) |
| §8.2 manual verification | Task 6 |

**Type consistency check** — `ToolboxSettings` / `ToolboxTool` / `TOOLBOX_TOOLS` / `screenshotEnabled` are referenced consistently across all tasks. The `Page` type is duplicated in both `App.tsx` and `Sidebar.tsx` per existing convention; both are updated in their respective tasks (Task 3 and Task 4) to include `'toolbox'`.
