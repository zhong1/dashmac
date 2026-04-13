import { useState, useEffect } from 'react'
import { useSystemStore } from '../../stores/systemStore'
import { useHistoryQuery } from '../../hooks/useHistoryQuery'
import RealtimeChart from '../charts/RealtimeChart'
import HistoryChart from '../charts/HistoryChart'
import PressureGauge from './PressureGauge'
import ProcessList from './ProcessList'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatGB(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}`
}

type HistoryRange = '1h' | '24h' | '7d'

export default function MemoryOverview() {
  const memory = useSystemStore((s) => s.memory)
  const [realtimeData, setRealtimeData] = useState<{ time: number; value: number }[]>([])
  const [historyRange, setHistoryRange] = useState<HistoryRange>('1h')
  const { data: historyData, loading: historyLoading } = useHistoryQuery({ type: 'memory', range: historyRange })

  useEffect(() => {
    if (!memory) return
    setRealtimeData((prev) => {
      const next = [...prev, { time: Date.now(), value: memory.usagePercent }]
      return next.slice(-60)
    })
  }, [memory])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-4">
        <StatCard label="Total" value={memory ? formatBytes(memory.total) : '--'} />
        <StatCard label="Used" value={memory ? formatBytes(memory.used) : '--'} color="#1f6feb" />
        <StatCard label="Free" value={memory ? formatBytes(memory.free) : '--'} color="#3fb950" />
        <StatCard label="Cached" value={memory ? formatBytes(memory.cached) : '--'} color="#d29922" />
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 flex flex-col items-center justify-center">
          <span className="text-xs text-text-muted mb-1">Pressure</span>
          <PressureGauge level={memory?.pressureLevel ?? 'normal'} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Swap Used" value={memory ? formatBytes(memory.swapUsed) : '--'} />
        <StatCard label="Swap Total" value={memory ? formatBytes(memory.swapTotal) : '--'} />
      </div>
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-2">Real-time Memory Usage</h3>
        <RealtimeChart data={realtimeData} color="#1f6feb" formatValue={(v) => v.toFixed(1)} unit="%" />
      </div>
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-text-primary">History</h3>
          <div className="flex gap-1">
            {(['1h', '24h', '7d'] as const).map((r) => (
              <button key={r} onClick={() => setHistoryRange(r)}
                className={`px-2 py-1 text-xs font-mono rounded ${historyRange === r ? 'bg-status-blue text-white' : 'text-text-muted hover:text-text-secondary'}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
        {historyLoading ? (
          <div className="h-[250px] flex items-center justify-center text-text-muted font-mono text-sm">Loading...</div>
        ) : (
          <HistoryChart data={historyData} color="#1f6feb" formatValue={formatGB} unit=" GB" />
        )}
      </div>
      <ProcessList />
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="font-mono text-xl font-semibold" style={color ? { color } : undefined}>{value}</div>
    </div>
  )
}
