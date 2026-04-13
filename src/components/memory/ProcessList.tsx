import { useState, useEffect } from 'react'
import type { ProcessInfo } from '../../types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export default function ProcessList() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [loading, setLoading] = useState(true)

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

  if (loading) return <div className="text-text-muted font-mono text-sm p-4">Loading processes...</div>

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border-primary">
        <h3 className="text-sm font-medium text-text-primary">Process Ranking</h3>
      </div>
      <div className="overflow-y-auto max-h-96">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-text-muted border-b border-border-secondary">
              <th className="text-left px-4 py-2 font-medium">Process</th>
              <th className="text-right px-4 py-2 font-medium">PID</th>
              <th className="text-right px-4 py-2 font-medium">Memory</th>
              <th className="text-right px-4 py-2 font-medium">CPU %</th>
            </tr>
          </thead>
          <tbody>
            {processes.slice(0, 50).map((proc) => (
              <tr key={`${proc.pid}-${proc.name}`} className="border-b border-border-secondary hover:bg-bg-tertiary">
                <td className="px-4 py-1.5 text-text-primary truncate max-w-[200px]">{proc.name}</td>
                <td className="px-4 py-1.5 text-text-secondary text-right">{proc.pid}</td>
                <td className="px-4 py-1.5 text-right text-status-blue">{formatBytes(proc.memoryUsage)}</td>
                <td className="px-4 py-1.5 text-right text-text-secondary">{proc.cpuUsage.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
