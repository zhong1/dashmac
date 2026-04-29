# ProcessList Sort + Search

**Date:** 2026-04-29
**Status:** Design approved, pending implementation

## Goals

Let users sort the ProcessList by any of the four columns (Process name, PID, Memory, CPU) by clicking column headers, and filter rows by a case-insensitive substring search on the process name.

## Non-Goals

- Persistent sort/search state across sessions
- True fuzzy matching (subsequence / fzf-style)
- Sorting beyond the top-100-by-memory window already returned by `collectProcesses` (see "Known Limitations")
- Highlighting matched characters in process names
- Regex search
- Multi-column sort (one column at a time)
- Filtering by PID, CPU, or memory ranges

## Layout

ProcessList header gains a search input between the title and the kill button:

```
┌──────────────────────────────────────────────────────────┐
│ 进程排名     [🔍 搜索进程名... ✕]    [✕ 退出 {name} ▾]   │
├──────────────────────────────────────────────────────────┤
│ Process ▲     PID    Memory ▼   CPU %    ← clickable    │
│ Chrome        1234   4.5 GB     30%                       │
│ ...                                                       │
└──────────────────────────────────────────────────────────┘
```

## Sort

- All four column headers are clickable. Click toggles sort direction on the active column; clicking a different column starts at descending for `memory` and `cpuUsage` (numeric, "biggest first" feels right) and ascending for `name` and `pid` (alphabetic / numeric, "smallest first").
- Active column shows ` ▲` (asc) or ` ▼` (desc) suffix; inactive columns show no indicator.
- Default sort: `memory` descending — preserves the current visual behavior since `collectProcesses` already returns memory-desc.
- State is `useState<{ column: 'name' | 'pid' | 'memory' | 'cpu'; dir: 'asc' | 'desc' }>` — not persisted across sessions.

## Search

- A small `<input type="text">` in the header, placeholder localized via `processList.search.placeholder` (`Search processes...` / `搜索进程名...`).
- Real-time filtering on `onChange`. No debounce — the dataset is at most 100 items.
- Match: `proc.name.toLowerCase().includes(query.toLowerCase())`. Empty query disables the filter.
- A small `✕` button inside the input (right side) clears the query when non-empty.
- State is `useState<string>('')` — not persisted.

## Interaction with existing features

- **Selection (`selectedPid`)** persists across sort/search changes. If the selected row is filtered out, the highlight disappears from the visible list but `selectedPid` remains in state. The kill button still shows the selected name. When the row reappears (filter cleared, sort changes), the highlight returns automatically.
- **5-second polling** continues to fetch fresh data; the sort+filter pipeline re-runs on every fetch, so the user sees updated rows in the same visual order.
- **Right-click menu and kill dispatch** are unchanged.

## Known Limitations

`collectProcesses` returns the top 100 processes by memory descending (see `electron/collectors/process.ts`). So "sort by CPU" is, strictly speaking, "sort by CPU within the top-100-by-memory subset." Edge case: a process that uses high CPU but low memory may not be in the list at all.

For v1 this is accepted. Most "interesting" processes by any metric appear in the top 100 by memory in practice. A future enhancement could either return all processes from the collector or add a separate `query:processes-by-cpu` channel.

## Implementation

### State (in `ProcessList.tsx`)

```ts
const [sort, setSort] = useState<{ column: SortColumn; dir: 'asc' | 'desc' }>({ column: 'memory', dir: 'desc' })
const [query, setQuery] = useState('')
```

### Derived list

```ts
const visible = useMemo(() => {
  const filtered = query
    ? processes.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : processes
  return [...filtered].sort((a, b) => {
    const sign = sort.dir === 'asc' ? 1 : -1
    if (sort.column === 'name') return sign * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    if (sort.column === 'pid') return sign * (a.pid - b.pid)
    if (sort.column === 'memory') return sign * (a.memoryUsage - b.memoryUsage)
    if (sort.column === 'cpu') return sign * (a.cpuUsage - b.cpuUsage)
    return 0
  })
}, [processes, query, sort])
```

### Sort handler

```ts
const handleSortClick = (column: SortColumn) => {
  setSort((cur) => {
    if (cur.column === column) return { column, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
    // Different column → default direction (numeric desc, name/pid asc)
    return { column, dir: column === 'memory' || column === 'cpu' ? 'desc' : 'asc' }
  })
}
```

### Column header rendering

A small inline `SortHeader` helper (mirrors the FileList one) renders the indicator and binds the click. Keep it local to this file rather than extracting to a shared util — it's 8 lines and the FileList version is bound to a different `SortColumn` type.

### Search input

```tsx
<div className="relative">
  <input
    type="text"
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    placeholder={t('processList.search.placeholder')}
    className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-xs font-mono text-text-primary w-48"
  />
  {query && (
    <button
      onClick={() => setQuery('')}
      className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary px-1"
      aria-label={t('processList.search.clear')}
    >✕</button>
  )}
</div>
```

## i18n changes

Add to `src/i18n/locales/en.ts` under `memory.processList`:
```ts
search: {
  placeholder: 'Search processes...',
  clear: 'Clear search',
},
```

And to `src/i18n/locales/zh-CN.ts`:
```ts
search: {
  placeholder: '搜索进程名...',
  clear: '清空搜索',
},
```

## Acceptance Criteria

- [ ] Clicking each of the four column headers (Process / PID / Memory / CPU) toggles sort direction with visible ▲/▼ indicator on the active column.
- [ ] Default sort is Memory descending; visible on first paint.
- [ ] Switching between columns picks a sensible default direction (memory/cpu desc, name/pid asc).
- [ ] Search input filters by case-insensitive substring on the process name in real time.
- [ ] Clear (✕) button appears when query is non-empty and clears it on click.
- [ ] Selecting a process, then changing sort/search, keeps `selectedPid`; the kill button still shows the name; the highlight reappears when the row is visible.
- [ ] In Chinese locale, search placeholder and clear-button label are in Chinese.
- [ ] `npm test` passes (no new test files needed; existing tests unaffected).
- [ ] `npm run build` passes.

## Files Touched

**Modified:**
- `src/components/memory/ProcessList.tsx` — add sort + search state, derived `visible`, header layout, column-header click, search input
- `src/i18n/locales/en.ts` — add `memory.processList.search.*`
- `src/i18n/locales/zh-CN.ts` — same shape, Chinese
