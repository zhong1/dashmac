import { useState, useEffect } from 'react'
import type { AppTraffic } from '../../types'
import { useTranslation } from '../../i18n/index'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export default function TrafficByApp() {
  const { t } = useTranslation()
  const [traffic, setTraffic] = useState<AppTraffic[]>([])
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h')

  useEffect(() => { window.api.queryAppTraffic(range).then(setTraffic) }, [range])

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border-primary flex justify-between items-center">
        <h3 className="text-sm font-medium text-text-primary">{t('network.trafficByApp.title')}</h3>
        <div className="flex gap-1">
          {(['24h', '7d', '30d'] as const).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-2 py-1 text-xs font-mono rounded ${range === r ? 'bg-status-blue text-white' : 'text-text-muted hover:text-text-secondary'}`}>{r}</button>
          ))}
        </div>
      </div>
      {traffic.length === 0 ? (
        <div className="p-4 text-text-muted font-mono text-xs">{t('network.trafficByApp.empty')}</div>
      ) : (
        <div className="overflow-y-auto max-h-72">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-text-muted border-b border-border-secondary">
                <th className="text-left px-4 py-2 font-medium">{t('network.trafficByApp.application')}</th>
                <th className="text-right px-4 py-2 font-medium">{t('network.trafficByApp.download')}</th>
                <th className="text-right px-4 py-2 font-medium">{t('network.trafficByApp.upload')}</th>
              </tr>
            </thead>
            <tbody>
              {traffic.map((app) => (
                <tr key={app.appName} className="border-b border-border-secondary hover:bg-bg-tertiary">
                  <td className="px-4 py-1.5 text-text-primary">{app.appName}</td>
                  <td className="px-4 py-1.5 text-right text-status-blue">{formatBytes(app.rxTotal)}</td>
                  <td className="px-4 py-1.5 text-right text-status-green">{formatBytes(app.txTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
