import { useEffect, useMemo, useState } from 'react'
import type { AppTraffic, AppTrafficSnapshot } from '../../types'
import { useTranslation } from '../../i18n/index'
import SortHeader from '../common/SortHeader'

type Range = 'realtime' | 'today' | '7d' | '30d'
type SortColumn = 'name' | 'rxRate' | 'txRate' | 'rxTotal' | 'txTotal'
type SortDir = 'asc' | 'desc'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

interface Row {
  name: string
  rxRate: number
  txRate: number
  rxTotal: number | null  // null = not applicable in current mode
  txTotal: number | null
}

export default function TrafficByApp() {
  const { t } = useTranslation()
  const [range, setRange] = useState<Range>('today')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ column: SortColumn; dir: SortDir }>({ column: 'rxTotal', dir: 'desc' })
  const [realtimeData, setRealtimeData] = useState<AppTrafficSnapshot[]>([])
  const [historicalData, setHistoricalData] = useState<AppTraffic[]>([])

  // Subscribe to realtime push channel
  useEffect(() => {
    const unsubscribe = window.api.onAppTraffic((snapshot) => setRealtimeData(snapshot))
    return unsubscribe
  }, [])

  // Fetch historical data when range changes (skip for realtime mode)
  useEffect(() => {
    if (range === 'realtime') { setHistoricalData([]); return }
    window.api.queryAppTraffic(range).then(setHistoricalData)
  }, [range])

  const rows: Row[] = useMemo(() => {
    if (range === 'realtime') {
      return realtimeData.map((s) => ({
        name: s.name,
        rxRate: s.rxRate,
        txRate: s.txRate,
        rxTotal: null,
        txTotal: null,
      }))
    }
    // Merge historical with realtime by name
    const realtimeByName = new Map(realtimeData.map((s) => [s.name, s]))
    return historicalData.map((h) => {
      const live = realtimeByName.get(h.appName)
      return {
        name: h.appName,
        rxRate: live?.rxRate ?? 0,
        txRate: live?.txRate ?? 0,
        rxTotal: h.rxTotal,
        txTotal: h.txTotal,
      }
    })
  }, [range, realtimeData, historicalData])

  const visible = useMemo(() => {
    const filtered = query
      ? rows.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
      : rows
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sort.column === 'name') return sign * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      const av = a[sort.column] ?? 0
      const bv = b[sort.column] ?? 0
      return sign * (av - bv)
    })
  }, [rows, query, sort])

  const handleSort = (column: SortColumn) => {
    setSort((cur) => {
      if (cur.column === column) return { column, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
      return { column, dir: column === 'name' ? 'asc' : 'desc' }
    })
  }

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border-primary flex items-center gap-3">
        <h3 className="text-sm font-medium text-text-primary">{t('network.trafficByApp.title')}</h3>
        <div className="flex gap-1">
          {(['realtime', 'today', '7d', '30d'] as const).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-2 py-1 text-xs font-mono rounded ${range === r ? 'bg-status-blue text-white' : 'text-text-muted hover:text-text-secondary'}`}>
              {t(`network.trafficByApp.range.${r === '7d' ? 'week' : r === '30d' ? 'month' : r}`)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs ml-auto">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('network.trafficByApp.search.placeholder')}
            className="w-full bg-bg-primary border border-border-primary rounded px-2 py-1 text-xs font-mono text-text-primary"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('network.trafficByApp.search.clear')}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary px-1 text-xs"
            >✕</button>
          )}
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="p-4 text-text-muted font-mono text-xs">
          {range === 'realtime' ? t('network.trafficByApp.empty.realtime') : t('network.trafficByApp.empty.history')}
        </div>
      ) : (
        <div className="overflow-y-auto max-h-72">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-text-muted border-b border-border-secondary">
                <SortHeader col="name" sort={sort} onClick={handleSort} label={t('network.trafficByApp.columns.name')} />
                <SortHeader col="rxRate" sort={sort} onClick={handleSort} label={t('network.trafficByApp.columns.rxRate')} align="right" />
                <SortHeader col="txRate" sort={sort} onClick={handleSort} label={t('network.trafficByApp.columns.txRate')} align="right" />
                <SortHeader col="rxTotal" sort={sort} onClick={handleSort} label={t('network.trafficByApp.columns.rxTotal')} align="right" />
                <SortHeader col="txTotal" sort={sort} onClick={handleSort} label={t('network.trafficByApp.columns.txTotal')} align="right" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.name} className="border-b border-border-secondary hover:bg-bg-tertiary">
                  <td className="px-3 py-1.5 text-text-primary truncate max-w-[200px]">{r.name}</td>
                  <td className="px-3 py-1.5 text-right text-status-blue">{r.rxRate > 0 ? `${formatBytes(r.rxRate)}/s` : '--'}</td>
                  <td className="px-3 py-1.5 text-right text-status-green">{r.txRate > 0 ? `${formatBytes(r.txRate)}/s` : '--'}</td>
                  <td className="px-3 py-1.5 text-right text-status-blue">{r.rxTotal !== null ? formatBytes(r.rxTotal) : '--'}</td>
                  <td className="px-3 py-1.5 text-right text-status-green">{r.txTotal !== null ? formatBytes(r.txTotal) : '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
