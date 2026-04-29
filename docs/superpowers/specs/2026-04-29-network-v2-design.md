# Network Module v2

**Date:** 2026-04-29
**Status:** Design approved, pending implementation plan

## Goals

Replace the empty Traffic-by-App stub with real per-process bandwidth data, add cumulative-traffic cards (today / this week / this month), add a connections-list polish (sort, search, hostname reverse-resolve), and reorganize the Network page layout. Reference behaviors come from macOS `nettop`, Activity Monitor, and Little Snitch.

## Non-Goals

- Network speed test (independent feature, future)
- Outbound/inbound rules / firewall (Little Snitch territory; needs Network Extension)
- Packet capture / Wireshark integration (requires root)
- Bandwidth limiting / shaping (needs `pf` rules)
- Geographic IP visualization (requires GeoIP DB)
- Per-interface traffic split (en0 vs utun0 vs Bluetooth)
- Per-process packet counts (low value)
- Per-process connection drilldown panel (search on connections list covers it)
- Historical per-day total traffic chart (could come in v3)

## Architecture

### Three new main-process service modules

**`electron/services/nettopCollector.ts`** — long-running `nettop` subprocess wrapper:
- Spawns `nettop -P -L 0 -s 1 -J bytes_in,bytes_out -t external` at app start
- Parses each output line; maintains an in-memory `Map<processName, { rxBytes, txBytes, rxRate, txRate, lastRxBytes, lastTxBytes }>`
- `rxRate`/`txRate` = delta over the last 1-second sample (the value in nettop's output for that interval); `rxBytes`/`txBytes` = running cumulative since last `flushHourly()`
- Public surface:
  - `start(): Promise<void>` — spawns the subprocess; rejects if `nettop` binary missing
  - `stop(): void` — kills the subprocess
  - `getCurrent(): AppTrafficSnapshot[]` — returns array of `{ name, rxBytes, txBytes, rxRate, txRate }` for all currently-known processes
  - `flushHourly(): { name, rxDelta, txDelta }[]` — returns the accumulated `rxBytes`/`txBytes` since last flush, then resets the counters to 0 (but keeps the process entries so `rxRate`/`txRate` reporting continues)
- Crash recovery: subprocess exit (non-clean) triggers a 5-second backoff then `start()` again; persistent failures (5+ retries within a minute) emit an error event consumed by main.ts to flag the feature unavailable
- Process-name normalization: `nettop` output entries like `Google Chrome Helper.GPU.12345` collapse to `Google Chrome Helper` via stripping `.{number}` suffix; same-name entries merge (sum rx/tx, sum rates)

**`electron/services/dnsCache.ts`** — LRU cache for reverse-DNS lookups:
- `lookup(ip: string): Promise<string | null>` — returns cached value or kicks off `dns.promises.reverse(ip)` with 1s timeout
- Cache: `Map<string, string | null>` capacity 1000, LRU eviction (move-to-end on hit)
- `null` is also cached (failed/empty result), preventing repeat queries
- In-flight deduplication: a `Map<string, Promise<string|null>>` tracks pending lookups so concurrent `lookup(sameIp)` calls share one DNS roundtrip

**`electron/services/networkAggregator.ts`** — daily traffic aggregation to SQLite:
- `flushAndPersist(): void` — calls `nettopCollector.flushHourly()`, UPSERTs each `{ name, rxDelta, txDelta }` into the `app_traffic` table keyed by `(date, app_name)` (`date = YYYY-MM-DD` in local time)
- `queryRange(range: 'today' | '7d' | '30d'): { app_name, rx_total, tx_total }[]` — `SELECT app_name, SUM(rx_total), SUM(tx_total) FROM app_traffic WHERE date >= ? GROUP BY app_name`
- `queryAllSum(range: 'today' | '7d' | '30d'): { rxTotal: number; txTotal: number }` — same query but no `GROUP BY`, sums everything; used by the cumulative-traffic card
- The existing `app_traffic` table schema is reused unchanged (`date`, `app_name`, `rx_total`, `tx_total`)

### Scheduler integration (`electron/services/scheduler.ts`)

- On app start: `await nettopCollector.start()` (or log warning + emit error event if it fails). Realtime tick (existing 2s) reads `nettopCollector.getCurrent()` snapshot and broadcasts via new push channel `realtime:app-traffic`
- New independent `setInterval`: every 1 hour calls `networkAggregator.flushAndPersist()`
- On `before-quit`: `nettopCollector.stop()` plus `closeDatabase()` (existing)

### IPC contract changes

| Channel | Direction | Behavior |
|---|---|---|
| `realtime:app-traffic` | main → renderer (push) | every 2s, push `AppTrafficSnapshot[]` |
| `query:app-traffic-current` | renderer → main (invoke) | returns `nettopCollector.getCurrent()` synchronously |
| `query:app-traffic` | renderer → main (invoke) | **changed from stub** — returns `networkAggregator.queryRange(range)` |
| `query:cumulative-traffic` | renderer → main (invoke) | NEW — returns `networkAggregator.queryAllSum(range)` |
| `query:dns-reverse` | renderer → main (invoke) | NEW — input `ips: string[]`, returns `Record<string, string | null>` |

`AppTrafficSnapshot` type added to `src/types.ts`:
```ts
export interface AppTrafficSnapshot {
  name: string
  rxRate: number  // bytes/sec, last 1s sample
  txRate: number  // bytes/sec
  rxBytes: number // cumulative since last hourly flush
  txBytes: number
}
```

The existing `AppTraffic` type is also kept (used by historical-mode rendering):
```ts
export interface AppTraffic {
  appName: string
  rxTotal: number
  txTotal: number
}
```

## Page layout

```
┌────────────────────────────────────────────────────────────────┐
│  Interface 卡 ×N      [Download 当前]   [Upload 当前]          │  ← unchanged
├────────────────────────────────────────────────────────────────┤
│  累积流量   [今日|本周|本月]                  ← NEW            │
│  ↓ 4.2 GB    ↑ 380 MB                                          │
├────────────────────────────────────────────────────────────────┤
│  [↓ 下载速度 实时图]      [↑ 上传速度 实时图]      ← unchanged │
├────────────────────────────────────────────────────────────────┤
│  速度历史 [1h|24h|7d]                              ← unchanged │
├────────────────────────────────────────────────────────────────┤
│  按应用统计流量 [实时|今日|本周|本月] 🔍 搜索       ← v2 重做  │
│  4 列：当前↓ 当前↑ 累积↓ 累积↑                                │
├────────────────────────────────────────────────────────────────┤
│  活动连接 N 个 🔍 搜索 [✓] 解析主机名             ← v2 重做   │
│  5 列可排序，IP→hostname                                       │
└────────────────────────────────────────────────────────────────┘
```

## Cumulative traffic card

New section between the interface row and the realtime charts.

State:
```tsx
const [range, setRange] = useState<'today' | '7d' | '30d'>('today')
const [data, setData] = useState<{ rxTotal: number; txTotal: number }>({ rxTotal: 0, txTotal: 0 })

useEffect(() => {
  window.api.queryCumulativeTraffic(range).then(setData)
}, [range])
```

Refresh frequency: on `range` change. **Not** updated in real time (data only changes after the hourly `flushAndPersist`, so 2-second polling is wasteful). The user can switch range to refresh.

Title shows the range start time (e.g., `'起始 2026-04-29 00:00'` for today, `'起始 2026-04-23 00:00'` for week).

Display: large `↓ {formatBytes(rxTotal)}` blue, `↑ {formatBytes(txTotal)}` green, side by side.

This section's range selector is **independent** from Traffic by App's range selector. Two separate UI states.

## Traffic by App v2

Replaces the existing stub-rendering `TrafficByApp.tsx`.

State:
```tsx
type Range = 'realtime' | 'today' | '7d' | '30d'
const [range, setRange] = useState<Range>('today')
const [query, setQuery] = useState('')
const [sort, setSort] = useState<{ column: 'name' | 'rxRate' | 'txRate' | 'rxTotal' | 'txTotal'; dir: 'asc' | 'desc' }>({
  column: 'rxTotal', dir: 'desc',
})
const [realtimeData, setRealtimeData] = useState<AppTrafficSnapshot[]>([])
const [historicalData, setHistoricalData] = useState<AppTraffic[]>([])
```

Subscribes to `realtime:app-traffic` push channel via preload bridge `onAppTraffic(callback) => unsubscribe`.

Rendering modes:
- `range === 'realtime'`: rows = `realtimeData` (rxRate/txRate filled, rxTotal/txTotal columns show `--`)
- `range !== 'realtime'`: rows = merge of `historicalData` (cumulative) with `realtimeData` (rate columns) by `name`. Default sort `rxTotal desc`. Apps in historical but not in realtime: rate columns show `--` (process not currently running).

Search filter: `name.toLowerCase().includes(query.toLowerCase())`.

Columns:
| 应用 | ↓ 当前 | ↑ 当前 | ↓ 累积 | ↑ 累积 |
|---|---|---|---|---|

Empty state:
- realtime mode + 0 entries: `'等待采样...' / 'Waiting for samples...'`
- historical mode + 0 entries: `'暂无流量数据。等几分钟后再来看。' / 'No traffic data yet. Check back in a few minutes.'`
- nettop unavailable: full component greyed with `'Failed to start network monitor.' / '网络监控启动失败。'`

## Connections v2

Replaces the existing `Connections.tsx`.

State additions:
```tsx
const [query, setQuery] = useState('')
const [sort, setSort] = useState<{ column: 'process' | 'protocol' | 'localPort' | 'peer' | 'state'; dir: 'asc' | 'desc' }>({
  column: 'process', dir: 'asc',
})
const [resolveHostnames, setResolveHostnames] = useState(true)
const [hostnames, setHostnames] = useState<Record<string, string | null>>({})
```

When `resolveHostnames === true`, an effect collects `connections.map(c => c.peerAddress)` (deduped), batch-calls `window.api.dnsReverse(ips)`, and merges results into `hostnames` state.

Rendering:
- `peerAddress` cell: `hostnames[ip] ?? ip` (so cached null falls through to IP). Hover tooltip always shows the raw `ip:port`.
- Other cells unchanged.

Search filter: matches against `process`, `localPort`, and resolved `peerHost`.

Sort columns: 5 columns clickable.

Header:
- Title: `活动连接 / Active Connections`
- Count: `{filtered.length} / {connections.length} 个连接` (or `{n} connections` when no search active)
- Search input
- Resolve-hostnames toggle (checkbox + label)

### Shared `SortHeader` component

Refactor: extract a `src/components/common/SortHeader.tsx` that takes a generic `column` type, replacing the local copies in:
- `src/components/files/FileList.tsx`
- `src/components/memory/ProcessList.tsx`

Plus the new use site in Connections + Traffic by App.

Generic signature:
```tsx
interface SortHeaderProps<T extends string> {
  col: T
  sort: { column: T; dir: 'asc' | 'desc' }
  onClick: (c: T) => void
  label: string
  align?: 'left' | 'right'
}
```

Drop-in replacement; existing per-component `SortColumn` type aliases stay co-located with their component.

## i18n changes

Roughly 20 new strings, all under existing `network.*` and a new `network.cumulative.*` sub-namespace.

```ts
network: {
  // ... existing keys preserved (download, upload, downloadSpeed, etc.) ...
  cumulative: {
    title: 'Cumulative Traffic',
    today: 'Today',
    week: 'This week',
    month: 'This month',
    since: 'Since {time}',
  },
  trafficByApp: {
    title: 'Traffic by Application',  // existing
    range: {
      realtime: 'Live',
      today: 'Today',
      week: 'This week',
      month: 'This month',
    },
    columns: {
      name: 'Application',  // 'app' was existing 'application'; reuse
      rxRate: '↓ Live',
      txRate: '↑ Live',
      rxTotal: '↓ Total',
      txTotal: '↑ Total',
    },
    search: { placeholder: 'Search apps...', clear: 'Clear search' },
    empty: {
      realtime: 'Waiting for samples...',
      history: 'No traffic data yet. Check back in a few minutes.',
      unavailable: 'Failed to start network monitor.',
    },
  },
  connections: {
    // existing keys preserved (loading, title, count, process, protocol, local, remote, state)
    search: { placeholder: 'Search...', clear: 'Clear search' },
    resolveHostnames: 'Resolve hostnames',
    countFiltered: '{filtered} / {total} connections',
  },
  error: {
    nettopFailed: 'Failed to start network monitor. Per-app traffic unavailable.',
  },
},
```

Chinese mirrors:
```ts
cumulative: { title: '累积流量', today: '今日', week: '本周', month: '本月', since: '起始 {time}' },
trafficByApp: {
  range: { realtime: '实时', today: '今日', week: '本周', month: '本月' },
  columns: { name: '应用', rxRate: '↓ 当前', txRate: '↑ 当前', rxTotal: '↓ 累积', txTotal: '↑ 累积' },
  search: { placeholder: '搜索应用...', clear: '清空搜索' },
  empty: { realtime: '等待采样…', history: '暂无流量数据。等几分钟后再来看。', unavailable: '网络监控启动失败。' },
},
connections: {
  search: { placeholder: '搜索...', clear: '清空搜索' },
  resolveHostnames: '解析主机名',
  countFiltered: '{filtered} / {total} 个连接',
},
error: { nettopFailed: '网络监控启动失败。无法显示按应用流量。' },
```

`i18n-shape.test.ts` automatically catches en/zh-CN parity.

## Testing

### `tests/electron/nettopParser.test.ts` (8 tests)

Pure parser function `parseNettopLine(line: string): { name: string; pid: number; rxBytes: number; txBytes: number } | null`:

1. Empty line → null
2. Header line (starts with `time` or contains `bytes_in`) → null
3. Standard data row → correct fields
4. Process name with spaces (`Google Chrome Helper`) → correct name
5. PID 0 (kernel_task) → handled
6. Malformed line (missing fields) → null, no throw
7. Same process name twice → caller (collector) merges; parser returns each
8. Numbers with `,` thousands separator → parsed as numbers

### `tests/electron/dnsCache.test.ts` (4 tests)

Mock `dns.promises.reverse`. Use a tiny LRU cap for test (e.g., 3) to verify eviction:

1. First lookup calls `dns.reverse`; second returns from cache
2. Failure (rejection) caches null; second call returns null without re-querying
3. LRU at capacity: oldest accessed entry is evicted on new insert
4. Concurrent `lookup(sameIp)` calls share one in-flight promise (verify `dns.reverse` called once)

### `tests/electron/networkAggregator.test.ts` (4 tests)

Use `better-sqlite3` `:memory:` database initialized with the existing schema:

1. `flushAndPersist({ Chrome: { rxDelta: 1000, txDelta: 500 } })` writes a row with today's date
2. Calling `flushAndPersist` twice for same day same app accumulates (UPSERT)
3. `queryRange('today')` returns rows grouped by app
4. `queryRange('30d')` includes the last 30 days

### Existing `i18n-shape.test.ts`

Auto-covers the 20+ new keys.

### Out of test scope

- nettop subprocess actually running (skip on non-darwin or when `nettop` not in PATH)
- IPC handlers (no IPC test infrastructure)
- React component rendering (no renderer test infrastructure)
- DNS reverse-resolution against the real network

## Risks

1. **`nettop` only sees current user's processes** — system daemons running as root won't appear. Cumulative totals will under-count. Documented; cannot be fixed without elevated privileges (out of scope).

2. **`nettop` output format drift across macOS versions** — parser needs to skip malformed lines rather than crash. Tests cover this.

3. **`app_traffic` table grows ~36k rows/year** — negligible; no cleanup logic added.

4. **DNS reverse-resolve hangs on bad networks** — 1s timeout + cache null. Worst case the toggle stays off and IPs are shown.

5. **First-launch empty data** — "today's cumulative" = 0 until the first hourly flush. Empty-state copy explicitly says "check back in a few minutes."

6. **Process-name aggregation collisions** — collapsing `Google Chrome Helper.GPU` and `Google Chrome Helper.Renderer` to `Google Chrome Helper` is correct; collapsing `node` (CLI dev tool) and `node` (Electron's helper) is correct from system-PoV but might confuse users. Acceptable v1.

7. **nettop subprocess memory leak (theoretical)** — long-running subprocess could accumulate buffer. We pipe stdout, parse line-by-line, drop processed lines. macOS `nettop` is stable in practice; if leak found, add periodic restart (e.g., every 24 hours).

8. **Realtime push at 2s × ~50 rows × React re-render** — measured fine on ProcessList. If perf issues appear, wrap rows in `React.memo`.

9. **nettop binary path** — assumes `/usr/sbin/nettop` (default macOS install path). Use `spawn('nettop', args)` to rely on PATH; fail gracefully if not found.

## Acceptance criteria

- [ ] `nettop` subprocess starts on app launch; stops on quit
- [ ] If `nettop` fails to start, Traffic by App shows error state; rest of page unaffected
- [ ] Cumulative card renders today / week / month with correct totals
- [ ] Cumulative card range switch updates display without reload
- [ ] Traffic by App "实时" mode shows live `rxRate / txRate` for each running app
- [ ] Traffic by App historical modes show cumulative `rxTotal / txTotal` for the selected range
- [ ] Traffic by App columns sortable in both directions
- [ ] Traffic by App search filter works case-insensitive
- [ ] Connections list 5 columns sortable
- [ ] Connections search matches process / hostname / port
- [ ] Connections "Resolve hostnames" checkbox defaults on, can be toggled off
- [ ] Hostname resolution results cached; failed lookups don't retry
- [ ] hover tooltip shows raw IP:port even when hostname rendered
- [ ] After 1+ hour of running, app_traffic table has rows; restart preserves data
- [ ] Chinese locale renders all new strings in Chinese
- [ ] `npm test` passes (existing + 16 new = 127 tests)
- [ ] `npm run build` passes

## Files Touched (preview)

**New:**
- `electron/services/nettopCollector.ts`
- `electron/services/dnsCache.ts`
- `electron/services/networkAggregator.ts`
- `src/components/common/SortHeader.tsx`
- `tests/electron/nettopParser.test.ts`
- `tests/electron/dnsCache.test.ts`
- `tests/electron/networkAggregator.test.ts`

**Modified:**
- `src/types.ts` — add `AppTrafficSnapshot`, extend `DashMacAPI` with new methods + `onAppTraffic`
- `electron/main.ts` — register new IPC handlers; integrate `nettopCollector` into scheduler lifecycle; broadcast `realtime:app-traffic`
- `electron/preload.ts` — expose new methods
- `electron/services/scheduler.ts` — start/stop nettop, hourly flush
- `src/components/network/NetworkOverview.tsx` — add cumulative card, reorder sections
- `src/components/network/TrafficByApp.tsx` — full rewrite (4 columns, 4 ranges, search, sort)
- `src/components/network/Connections.tsx` — sort, search, hostname toggle
- `src/components/files/FileList.tsx` — replace local SortHeader with shared
- `src/components/memory/ProcessList.tsx` — replace local SortHeader with shared
- `src/i18n/locales/en.ts` — ~20 new keys
- `src/i18n/locales/zh-CN.ts` — same shape, Chinese
