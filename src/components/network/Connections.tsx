import { useState, useEffect } from 'react'
import type { NetworkConnection } from '../../types'
import { useTranslation } from '../../i18n/index'

export default function Connections() {
  const { t } = useTranslation()
  const [connections, setConnections] = useState<NetworkConnection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const fetch = async () => {
      const data = await window.api.queryConnections()
      if (active) { setConnections(data); setLoading(false) }
    }
    fetch()
    const interval = setInterval(fetch, 5000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  if (loading) return <div className="text-text-muted font-mono text-sm p-4">{t('network.connections.loading')}</div>

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border-primary flex justify-between items-center">
        <h3 className="text-sm font-medium text-text-primary">{t('network.connections.title')}</h3>
        <span className="text-xs text-text-muted font-mono">{t('network.connections.count', { n: connections.length })}</span>
      </div>
      <div className="overflow-y-auto max-h-96">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-text-muted border-b border-border-secondary">
              <th className="text-left px-4 py-2 font-medium">{t('network.connections.process')}</th>
              <th className="text-left px-4 py-2 font-medium">{t('network.connections.protocol')}</th>
              <th className="text-left px-4 py-2 font-medium">{t('network.connections.local')}</th>
              <th className="text-left px-4 py-2 font-medium">{t('network.connections.remote')}</th>
              <th className="text-left px-4 py-2 font-medium">{t('network.connections.state')}</th>
            </tr>
          </thead>
          <tbody>
            {connections.map((conn, i) => (
              <tr key={i} className="border-b border-border-secondary hover:bg-bg-tertiary">
                <td className="px-4 py-1.5 text-text-primary">{conn.process}</td>
                <td className="px-4 py-1.5 text-text-secondary">{conn.protocol}</td>
                <td className="px-4 py-1.5 text-text-secondary">{conn.localAddress}:{conn.localPort}</td>
                <td className="px-4 py-1.5 text-status-blue">{conn.peerAddress}:{conn.peerPort}</td>
                <td className="px-4 py-1.5">
                  <span className={conn.state === 'ESTABLISHED' ? 'text-status-green' : 'text-text-muted'}>{conn.state}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
