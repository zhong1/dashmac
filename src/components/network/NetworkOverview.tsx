import { useState, useEffect } from 'react'
import { useSystemStore } from '../../stores/systemStore'
import { useHistoryQuery } from '../../hooks/useHistoryQuery'
import { useTranslation } from '../../i18n/index'
import RealtimeChart from '../charts/RealtimeChart'
import HistoryChart from '../charts/HistoryChart'
import TrafficByApp from './TrafficByApp'
import Connections from './Connections'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatSpeed(bytes: number): string { return `${formatBytes(bytes)}/s` }

type HistoryRange = '1h' | '24h' | '7d'

export default function NetworkOverview() {
  const { t } = useTranslation()
  const networkInterfaces = useSystemStore((s) => s.networkInterfaces)
  const networkSpeed = useSystemStore((s) => s.networkSpeed)
  const [rxData, setRxData] = useState<{ time: number; value: number }[]>([])
  const [txData, setTxData] = useState<{ time: number; value: number }[]>([])
  const [historyRange, setHistoryRange] = useState<HistoryRange>('1h')
  const { data: historyData, loading: historyLoading } = useHistoryQuery({ type: 'network', range: historyRange })

  useEffect(() => {
    if (!networkSpeed) return
    const now = Date.now()
    setRxData((prev) => [...prev, { time: now, value: networkSpeed.rxSpeed }].slice(-60))
    setTxData((prev) => [...prev, { time: now, value: networkSpeed.txSpeed }].slice(-60))
  }, [networkSpeed])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {networkInterfaces.map((iface) => (
          <div key={iface.iface} className="bg-bg-secondary border border-border-primary rounded-lg p-3">
            <div className="text-xs text-text-muted uppercase tracking-wider mb-1">{iface.iface}</div>
            <div className="font-mono text-sm text-text-primary">{iface.ip4}</div>
            <div className="text-xs text-text-muted font-mono">{iface.type} - {iface.speed}Mbps</div>
          </div>
        ))}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="text-xs text-text-muted uppercase tracking-wider mb-1">{t('network.download')}</div>
          <div className="font-mono text-xl font-semibold text-status-blue">{networkSpeed ? formatSpeed(networkSpeed.rxSpeed) : '--'}</div>
        </div>
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="text-xs text-text-muted uppercase tracking-wider mb-1">{t('network.upload')}</div>
          <div className="font-mono text-xl font-semibold text-status-green">{networkSpeed ? formatSpeed(networkSpeed.txSpeed) : '--'}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
          <h3 className="text-sm font-medium text-text-primary mb-2"><span className="text-status-blue">↓</span> {t('network.downloadSpeed')}</h3>
          <RealtimeChart data={rxData} color="#1f6feb" height={150} formatValue={(v) => formatBytes(v)} unit="/s" />
        </div>
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
          <h3 className="text-sm font-medium text-text-primary mb-2"><span className="text-status-green">↑</span> {t('network.uploadSpeed')}</h3>
          <RealtimeChart data={txData} color="#3fb950" height={150} formatValue={(v) => formatBytes(v)} unit="/s" />
        </div>
      </div>
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-text-primary">{t('network.speedHistory')}</h3>
          <div className="flex gap-1">
            {(['1h', '24h', '7d'] as const).map((r) => (
              <button key={r} onClick={() => setHistoryRange(r)}
                className={`px-2 py-1 text-xs font-mono rounded ${historyRange === r ? 'bg-status-blue text-white' : 'text-text-muted hover:text-text-secondary'}`}>{r}</button>
            ))}
          </div>
        </div>
        {historyLoading ? <div className="h-[250px] flex items-center justify-center text-text-muted font-mono text-sm">{t('common.loading')}</div>
          : <HistoryChart data={historyData} color="#1f6feb" formatValue={(v) => formatBytes(v)} unit="/s" />}
      </div>
      <TrafficByApp />
      <Connections />
    </div>
  )
}
