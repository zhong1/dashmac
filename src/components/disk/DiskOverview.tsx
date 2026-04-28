import { useState, useEffect } from 'react'
import { useSystemStore } from '../../stores/systemStore'
import { useHistoryQuery } from '../../hooks/useHistoryQuery'
import { useTranslation } from '../../i18n/index'
import RealtimeChart from '../charts/RealtimeChart'
import HistoryChart from '../charts/HistoryChart'
import Treemap from './Treemap'
import BigFiles from './BigFiles'
import type { FileEntry } from '../../types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatGB(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}`
}

type HistoryRange = '7d' | '30d' | '90d'

export default function DiskOverview() {
  const { t } = useTranslation()
  const diskVolumes = useSystemStore((s) => s.diskVolumes)
  const diskIO = useSystemStore((s) => s.diskIO)
  const [ioData, setIOData] = useState<{ time: number; value: number }[]>([])
  const [historyRange, setHistoryRange] = useState<HistoryRange>('7d')
  const { data: historyData, loading: historyLoading } = useHistoryQuery({ type: 'disk', range: historyRange })
  const [scanData, setScanData] = useState<FileEntry | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanPath, setScanPath] = useState('/Users')

  useEffect(() => {
    if (!diskIO) return
    setIOData((prev) => [...prev, { time: Date.now(), value: diskIO.readSpeed + diskIO.writeSpeed }].slice(-60))
  }, [diskIO])

  const handleScan = async () => {
    setScanning(true)
    try { const result = await window.api.queryDiskScan(scanPath); setScanData(result) }
    finally { setScanning(false) }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {diskVolumes.map((vol) => (
          <div key={vol.mountPoint} className="bg-bg-secondary border border-border-primary rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-text-primary font-mono">{vol.mountPoint}</span>
              <span className="text-xs text-text-muted font-mono">{vol.usagePercent.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-bg-primary rounded-full overflow-hidden mb-2">
              <div className="h-full rounded-full" style={{ width: `${vol.usagePercent}%`, backgroundColor: vol.usagePercent >= 90 ? '#f85149' : vol.usagePercent >= 75 ? '#d29922' : '#3fb950' }} />
            </div>
            <div className="flex justify-between text-xs text-text-muted font-mono">
              <span>{t('disk.used')}: {formatBytes(vol.used)}</span>
              <span>{t('disk.available')}: {formatBytes(vol.available)}</span>
              <span>{t('disk.total')}: {formatBytes(vol.total)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-2">{t('disk.io')}</h3>
        <RealtimeChart data={ioData} color="#d29922" formatValue={(v) => formatBytes(v)} unit="/s" />
      </div>
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-text-primary">{t('disk.spaceHistory')}</h3>
          <div className="flex gap-1">
            {(['7d', '30d', '90d'] as const).map((r) => (
              <button key={r} onClick={() => setHistoryRange(r)}
                className={`px-2 py-1 text-xs font-mono rounded ${historyRange === r ? 'bg-status-blue text-white' : 'text-text-muted hover:text-text-secondary'}`}>{r}</button>
            ))}
          </div>
        </div>
        {historyLoading ? <div className="h-[250px] flex items-center justify-center text-text-muted font-mono text-sm">{t('common.loading')}</div>
          : <HistoryChart data={historyData} color="#d29922" formatValue={formatGB} unit=" GB" />}
      </div>
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-medium text-text-primary">{t('disk.fileAnalysis')}</h3>
          <input value={scanPath} onChange={(e) => setScanPath(e.target.value)}
            className="flex-1 bg-bg-primary border border-border-primary rounded px-2 py-1 text-xs font-mono text-text-primary" placeholder={t('disk.scanPlaceholder')} />
          <button onClick={handleScan} disabled={scanning}
            className="px-3 py-1 text-xs font-mono bg-status-blue text-white rounded hover:opacity-90 disabled:opacity-50">
            {scanning ? t('disk.scanning') : t('disk.scan')}
          </button>
        </div>
        <Treemap data={scanData} onClickFile={(p) => window.api.revealFile(p)} />
      </div>
      <BigFiles data={scanData} />
    </div>
  )
}
