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
