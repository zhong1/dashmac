# ProcessList Sort + Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clickable column-header sorting (Process / PID / Memory / CPU, default Memory desc) and a case-insensitive substring search input to the ProcessList component.

**Architecture:** Pure renderer-side feature. All state lives in `ProcessList.tsx` as `useState`. Filtering and sorting run on the in-memory `processes` array via `useMemo`. No new IPC, no main-process changes, no new test files. Two locale strings added for the search input.

**Tech Stack:** React 19 + TypeScript strict + Tailwind 4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-29-process-sort-search-design.md`

---

## File Structure

**Modified:**
- `src/i18n/locales/en.ts` — add `memory.processList.search.{placeholder, clear}`
- `src/i18n/locales/zh-CN.ts` — same shape, Chinese
- `src/components/memory/ProcessList.tsx` — add sort state, search state, derived `visible` array, `SortHeader` helper, search input UI, sort handler

---

## Conventions

- **Commit per task** with lowercase conventional-commit messages (`feat(memory): …`, `feat(i18n): …`).
- **No new tests required** — feature is pure UI state on already-fetched data; existing tests cover the IPC and shape contracts.
- **Imports** use no `.js`/`.ts`/`.tsx` suffixes.
- **Build verification:** `npm run build` (electron-vite); type errors surface there.
- **Working directory** is the project root or worktree root (the executing skill will set this up).

---

## Task 1: Locale strings for search

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh-CN.ts`

Add `search` sub-namespace under the existing `memory.processList`. Two keys: `placeholder` and `clear` (the aria-label for the clear-search button).

- [ ] **Step 1: Update `src/i18n/locales/en.ts`**

Find the existing `memory.processList` block. It currently looks like:

```ts
processList: {
  loading: 'Loading processes...',
  title: 'Process Ranking',
  process: 'Process',
  pid: 'PID',
  memory: 'Memory',
  cpu: 'CPU %',
},
```

Replace with:

```ts
processList: {
  loading: 'Loading processes...',
  title: 'Process Ranking',
  process: 'Process',
  pid: 'PID',
  memory: 'Memory',
  cpu: 'CPU %',
  search: {
    placeholder: 'Search processes...',
    clear: 'Clear search',
  },
},
```

- [ ] **Step 2: Update `src/i18n/locales/zh-CN.ts`**

Find the matching `memory.processList` block:

```ts
processList: {
  loading: '加载进程中…',
  title: '进程排名',
  process: '进程',
  pid: 'PID',
  memory: '内存',
  cpu: 'CPU %',
},
```

Replace with:

```ts
processList: {
  loading: '加载进程中…',
  title: '进程排名',
  process: '进程',
  pid: 'PID',
  memory: '内存',
  cpu: 'CPU %',
  search: {
    placeholder: '搜索进程名...',
    clear: '清空搜索',
  },
},
```

- [ ] **Step 3: Run shape parity test**

Run: `npx vitest run tests/electron/i18n-shape.test.ts`
Expected: 2 passing.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "src/i18n/locales" || echo "no errors in renderer locales"`
Expected: `no errors in renderer locales`.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/zh-CN.ts
git commit -m "feat(i18n): add memory.processList.search keys"
```

---

## Task 2: ProcessList — sort + search

**Files:**
- Modify: `src/components/memory/ProcessList.tsx`

Add sort state, search state, derived filtered+sorted list via `useMemo`, a `SortHeader` helper, the search input, and rewire the table headers to be sort-clickable.

- [ ] **Step 1: Replace the entire ProcessList component**

The current `src/components/memory/ProcessList.tsx` (after PK-T8) renders the table with kill button + selection but no sort/search. Replace it with this version (which preserves all PK-T8 functionality and adds sort + search):

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { ProcessInfo } from '../../types'
import { useTranslation } from '../../i18n/index'
import { useToast } from '../../stores/toastStore'
import ContextMenu, { type MenuItem } from '../files/ContextMenu'

type SortColumn = 'name' | 'pid' | 'memory' | 'cpu'
type SortDir = 'asc' | 'desc'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export default function ProcessList() {
  const { t } = useTranslation()
  const toast = useToast()
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPid, setSelectedPid] = useState<number | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number; pid: number; name: string } | null>(null)
  const [sort, setSort] = useState<{ column: SortColumn; dir: SortDir }>({ column: 'memory', dir: 'desc' })
  const [query, setQuery] = useState('')

  useEffect(() => {
    let active = true
    const fetch = async () => {
      const data = await window.api.queryProcesses()
      if (active) { setProcesses(data); setLoading(false) }
    }
    fetch()
    const interval = setInterval(fetch, 5000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  // Esc clears selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedPid(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const visible = useMemo(() => {
    const filtered = query
      ? processes.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      : processes
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sort.column === 'name') return sign * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      if (sort.column === 'pid') return sign * (a.pid - b.pid)
      if (sort.column === 'memory') return sign * (a.memoryUsage - b.memoryUsage)
      if (sort.column === 'cpu') return sign * (a.cpuUsage - b.cpuUsage)
      return 0
    })
  }, [processes, query, sort])

  const selectedProc = processes.find((p) => p.pid === selectedPid) ?? null

  const handleSortClick = (column: SortColumn) => {
    setSort((cur) => {
      if (cur.column === column) return { column, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
      // Different column → default direction (numeric desc, name/pid asc)
      return { column, dir: column === 'memory' || column === 'cpu' ? 'desc' : 'asc' }
    })
  }

  const dispatchKill = async (pid: number, name: string, signal: 'SIGTERM' | 'SIGKILL') => {
    const r = await window.api.killProcess(pid, name, signal)
    if (!r.ok && !('cancelled' in r)) {
      toast.error(r.message)
    }
  }

  const buildMenuItems = (pid: number, name: string): MenuItem[] => [
    { label: t('processControl.menu.quit'), onClick: () => dispatchKill(pid, name, 'SIGTERM') },
    { label: t('processControl.menu.forceQuit'), onClick: () => dispatchKill(pid, name, 'SIGKILL') },
  ]

  const handleRowContextMenu = (e: React.MouseEvent, proc: ProcessInfo) => {
    e.preventDefault()
    setSelectedPid(proc.pid)
    setMenuAnchor({ x: e.clientX, y: e.clientY, pid: proc.pid, name: proc.name })
  }

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!selectedProc) return
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuAnchor({
      x: rect.left,
      y: rect.bottom + 2,
      pid: selectedProc.pid,
      name: selectedProc.name,
    })
  }

  if (loading) return <div className="text-text-muted font-mono text-sm p-4">{t('memory.processList.loading')}</div>

  const buttonLabel = selectedProc
    ? t('processControl.killSelected', { name: truncate(selectedProc.name, 20) })
    : t('processControl.killSelectedDisabled')

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border-primary flex items-center gap-3">
        <h3 className="text-sm font-medium text-text-primary">{t('memory.processList.title')}</h3>
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('memory.processList.search.placeholder')}
            className="w-full bg-bg-primary border border-border-primary rounded px-2 py-1 text-xs font-mono text-text-primary"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('memory.processList.search.clear')}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary px-1 text-xs"
            >✕</button>
          )}
        </div>
        <button
          onClick={handleButtonClick}
          disabled={!selectedProc}
          className={`px-3 py-1 text-xs font-mono rounded border ${
            selectedProc
              ? 'text-status-red border-status-red hover:bg-status-red/10 cursor-pointer'
              : 'text-text-muted border-border-primary opacity-30 cursor-not-allowed'
          }`}
        >
          ✕ {buttonLabel} ▾
        </button>
      </div>
      <div className="overflow-y-auto max-h-96">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-text-muted border-b border-border-secondary">
              <SortHeader col="name" sort={sort} onClick={handleSortClick} label={t('memory.processList.process')} />
              <SortHeader col="pid" sort={sort} onClick={handleSortClick} label={t('memory.processList.pid')} align="right" />
              <SortHeader col="memory" sort={sort} onClick={handleSortClick} label={t('memory.processList.memory')} align="right" />
              <SortHeader col="cpu" sort={sort} onClick={handleSortClick} label={t('memory.processList.cpu')} align="right" />
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 50).map((proc) => (
              <tr
                key={`${proc.pid}-${proc.name}`}
                onClick={() => setSelectedPid(proc.pid)}
                onContextMenu={(e) => handleRowContextMenu(e, proc)}
                className={`border-b border-border-secondary cursor-default ${
                  selectedPid === proc.pid
                    ? 'bg-status-blue/30 text-text-primary'
                    : 'hover:bg-bg-tertiary'
                }`}
              >
                <td className="px-4 py-1.5 truncate max-w-[200px]">{proc.name}</td>
                <td className="px-4 py-1.5 text-text-secondary text-right">{proc.pid}</td>
                <td className="px-4 py-1.5 text-right text-status-blue">{formatBytes(proc.memoryUsage)}</td>
                <td className="px-4 py-1.5 text-right text-text-secondary">{proc.cpuUsage.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {menuAnchor && (
        <ContextMenu
          x={menuAnchor.x}
          y={menuAnchor.y}
          items={buildMenuItems(menuAnchor.pid, menuAnchor.name)}
          onClose={() => setMenuAnchor(null)}
        />
      )}
    </div>
  )
}

function SortHeader({
  col, sort, onClick, label, align = 'left',
}: {
  col: SortColumn
  sort: { column: SortColumn; dir: SortDir }
  onClick: (c: SortColumn) => void
  label: string
  align?: 'left' | 'right'
}) {
  const indicator = sort.column === col ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''
  return (
    <th
      onClick={() => onClick(col)}
      className={`px-4 py-2 cursor-pointer select-none font-medium text-${align}`}
    >
      {label}{indicator}
    </th>
  )
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
```

Key differences from the current PK-T8 file:
- Two new state hooks: `sort` (default `{ column: 'memory', dir: 'desc' }`) and `query` (default `''`)
- New `useMemo` for `visible` — filtered + sorted from `processes`
- New `handleSortClick` — toggles direction on same column, sets sensible default direction on column change
- New `SortHeader` component (local helper) replacing the old static `<th>` elements
- New search input + ✕ clear button injected into the header `<div>` between the title and the kill button
- `<tbody>` iterates over `visible.slice(0, 50)` instead of `processes.slice(0, 50)` — sort/search apply to the rendered rows

Everything else (selection logic, kill button, right-click handling, IPC dispatch, toast on error) is preserved verbatim.

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/memory/ProcessList.tsx
git commit -m "feat(memory): add column sort and substring search to ProcessList"
```

---

## Task 3: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: existing 111 + 4 skipped = 115 total. (No new tests added — feature is local UI state.)

- [ ] **Step 2: Run the full build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: TypeScript strict-mode check**

Run: `npx tsc --noEmit 2>&1 | grep -E "ProcessList|i18n/locales" || echo "no errors in scope"`
Expected: `no errors in scope`. Pre-existing chart/network/treemap errors are unrelated.

- [ ] **Step 4: Manual smoke test (macOS)**

Run: `npm run dev`

Click Memory in the sidebar. Verify:
- ProcessList header now has three elements left-to-right: title (`Process Ranking` / `进程排名`), search input (placeholder `Search processes...` / `搜索进程名...`), kill button.
- Default sort is Memory desc; the Memory column header shows ` ▼`.
- Click the Process column header → list re-sorts alphabetically asc; ` ▲` appears next to `Process`, ` ▼` disappears from `Memory`.
- Click the Process column header again → toggles to desc; indicator becomes ` ▼`.
- Click the CPU column header → defaults to desc; ` ▼` next to CPU.
- Click the PID column header → defaults to asc; ` ▲` next to PID.
- Type `chr` (or partial process name) in search → list filters in real time.
- Search is case-insensitive: `Chr`, `CHR`, and `chr` all match the same processes.
- Clear (✕) button appears when query is non-empty; click it → query clears, full list returns.
- Select a process → highlight blue. Search to filter that process out → highlight disappears (row not visible) but kill button still shows the selected name. Clear search → highlight returns.
- Switch to Chinese (Settings → Appearance → 简体中文) → search placeholder reads `搜索进程名...`; ✕ button's tooltip (if shown) reads `清空搜索`.

- [ ] **Step 5: Confirm clean tree**

```bash
git status
```

Expected: clean tree (or commit any inline fixes from smoke testing).

---

## Acceptance criteria recap

- [ ] All four column headers (Process / PID / Memory / CPU) are clickable; clicking toggles sort direction with visible ▲/▼ indicator on the active column.
- [ ] Default sort is Memory descending; first paint shows the ▼ indicator.
- [ ] Switching between columns picks a sensible default direction (memory/cpu desc, name/pid asc).
- [ ] Search input filters by case-insensitive substring on process name in real time.
- [ ] Clear (✕) button appears when query is non-empty; clears the query.
- [ ] Selecting a process, then changing sort/search, keeps `selectedPid`; the kill button still shows the name; the highlight reappears when the row is visible.
- [ ] In Chinese locale, search placeholder and clear-button label are in Chinese.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
