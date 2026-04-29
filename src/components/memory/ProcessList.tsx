import { useState, useEffect } from 'react'
import type { ProcessInfo } from '../../types'
import { useTranslation } from '../../i18n/index'
import { useToast } from '../../stores/toastStore'
import ContextMenu, { type MenuItem } from '../files/ContextMenu'

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

  const selectedProc = processes.find((p) => p.pid === selectedPid) ?? null

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
      <div className="px-4 py-3 border-b border-border-primary flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">{t('memory.processList.title')}</h3>
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
              <th className="text-left px-4 py-2 font-medium">{t('memory.processList.process')}</th>
              <th className="text-right px-4 py-2 font-medium">{t('memory.processList.pid')}</th>
              <th className="text-right px-4 py-2 font-medium">{t('memory.processList.memory')}</th>
              <th className="text-right px-4 py-2 font-medium">{t('memory.processList.cpu')}</th>
            </tr>
          </thead>
          <tbody>
            {processes.slice(0, 50).map((proc) => (
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

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
