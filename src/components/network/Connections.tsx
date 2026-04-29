import { useEffect, useMemo, useState } from 'react'
import type { NetworkConnection } from '../../types'
import { useTranslation } from '../../i18n/index'
import SortHeader from '../common/SortHeader'

type SortColumn = 'process' | 'protocol' | 'localPort' | 'peer' | 'state'
type SortDir = 'asc' | 'desc'

export default function Connections() {
  const { t } = useTranslation()
  const [connections, setConnections] = useState<NetworkConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ column: SortColumn; dir: SortDir }>({ column: 'process', dir: 'asc' })
  const [resolveHostnames, setResolveHostnames] = useState(true)
  const [hostnames, setHostnames] = useState<Record<string, string | null>>({})

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

  // Trigger reverse DNS for new IPs whenever the connection set changes (and toggle is on)
  useEffect(() => {
    if (!resolveHostnames) return
    const ips = Array.from(new Set(connections.map((c) => c.peerAddress)))
      .filter((ip) => !(ip in hostnames))
    if (ips.length === 0) return
    window.api.dnsReverse(ips).then((result) => {
      setHostnames((prev) => ({ ...prev, ...result }))
    })
  }, [connections, resolveHostnames])

  const visible = useMemo(() => {
    const filtered = query
      ? connections.filter((c) => {
          const host = (resolveHostnames && hostnames[c.peerAddress]) || c.peerAddress
          const q = query.toLowerCase()
          return c.process.toLowerCase().includes(q)
            || host.toLowerCase().includes(q)
            || String(c.localPort).includes(q)
        })
      : connections
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sort.column === 'process') return sign * a.process.localeCompare(b.process)
      if (sort.column === 'protocol') return sign * a.protocol.localeCompare(b.protocol)
      if (sort.column === 'localPort') return sign * (a.localPort - b.localPort)
      if (sort.column === 'state') return sign * a.state.localeCompare(b.state)
      // peer: by resolved host or IP
      const aPeer = (resolveHostnames && hostnames[a.peerAddress]) || a.peerAddress
      const bPeer = (resolveHostnames && hostnames[b.peerAddress]) || b.peerAddress
      return sign * aPeer.localeCompare(bPeer)
    })
  }, [connections, query, sort, hostnames, resolveHostnames])

  const handleSort = (column: SortColumn) => {
    setSort((cur) => {
      if (cur.column === column) return { column, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
      return { column, dir: 'asc' }
    })
  }

  if (loading) return <div className="text-text-muted font-mono text-sm p-4">{t('network.connections.loading')}</div>

  const countLabel = query
    ? t('network.connections.countFiltered', { filtered: visible.length, total: connections.length })
    : t('network.connections.count', { n: connections.length })

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border-primary flex items-center gap-3">
        <h3 className="text-sm font-medium text-text-primary">{t('network.connections.title')}</h3>
        <span className="text-xs text-text-muted font-mono">{countLabel}</span>
        <div className="relative flex-1 max-w-xs ml-auto">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('network.connections.search.placeholder')}
            className="w-full bg-bg-primary border border-border-primary rounded px-2 py-1 text-xs font-mono text-text-primary"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('network.connections.search.clear')}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary px-1 text-xs"
            >✕</button>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={resolveHostnames}
            onChange={(e) => setResolveHostnames(e.target.checked)}
          />
          {t('network.connections.resolveHostnames')}
        </label>
      </div>
      <div className="overflow-y-auto max-h-96">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-text-muted border-b border-border-secondary">
              <SortHeader col="process" sort={sort} onClick={handleSort} label={t('network.connections.process')} />
              <SortHeader col="protocol" sort={sort} onClick={handleSort} label={t('network.connections.protocol')} />
              <SortHeader col="localPort" sort={sort} onClick={handleSort} label={t('network.connections.local')} />
              <SortHeader col="peer" sort={sort} onClick={handleSort} label={t('network.connections.remote')} />
              <SortHeader col="state" sort={sort} onClick={handleSort} label={t('network.connections.state')} />
            </tr>
          </thead>
          <tbody>
            {visible.map((conn, i) => {
              const peerHost = resolveHostnames ? hostnames[conn.peerAddress] : null
              const peerDisplay = peerHost ?? conn.peerAddress
              return (
                <tr key={i} className="border-b border-border-secondary hover:bg-bg-tertiary">
                  <td className="px-4 py-1.5 text-text-primary">{conn.process}</td>
                  <td className="px-4 py-1.5 text-text-secondary">{conn.protocol}</td>
                  <td className="px-4 py-1.5 text-text-secondary">{conn.localAddress}:{conn.localPort}</td>
                  <td className="px-4 py-1.5 text-status-blue" title={`${conn.peerAddress}:${conn.peerPort}`}>
                    {peerDisplay}:{conn.peerPort}
                  </td>
                  <td className="px-4 py-1.5">
                    <span className={conn.state === 'ESTABLISHED' ? 'text-status-green' : 'text-text-muted'}>{conn.state}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
