import { useSystemStore } from '../../stores/systemStore'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

function StatusDot({ level }: { level: 'green' | 'yellow' | 'red' }) {
  const colors = { green: '#3fb950', yellow: '#d29922', red: '#f85149' }
  return <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: colors[level] }} />
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-1.5 bg-bg-primary rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }} />
    </div>
  )
}

export default function Overview() {
  const memory = useSystemStore((s) => s.memory)
  const diskVolumes = useSystemStore((s) => s.diskVolumes)
  const diskIO = useSystemStore((s) => s.diskIO)
  const networkSpeed = useSystemStore((s) => s.networkSpeed)
  const networkInterfaces = useSystemStore((s) => s.networkInterfaces)

  const memPercent = memory?.usagePercent ?? 0
  const memLevel = memPercent >= 90 ? 'red' : memPercent >= 75 ? 'yellow' : 'green'
  const primaryDisk = diskVolumes[0]
  const diskPercent = primaryDisk ? (primaryDisk.used / primaryDisk.total) * 100 : 0
  const diskLevel = diskPercent >= 90 ? 'red' : diskPercent >= 75 ? 'yellow' : 'green'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {/* Memory Card */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-secondary uppercase tracking-wider">Memory</span>
            <StatusDot level={memLevel} />
          </div>
          <div className="font-mono text-2xl font-semibold mb-1">{memory ? formatBytes(memory.used) : '--'}</div>
          <div className="text-xs text-text-muted font-mono mb-3">/ {memory ? formatBytes(memory.total) : '--'}</div>
          <ProgressBar percent={memPercent} color={memLevel === 'green' ? '#3fb950' : memLevel === 'yellow' ? '#d29922' : '#f85149'} />
          <div className="flex justify-between mt-2 text-xs text-text-muted font-mono">
            <span>Cached: {memory ? formatBytes(memory.cached) : '--'}</span>
            <span>Swap: {memory ? formatBytes(memory.swapUsed) : '--'}</span>
          </div>
        </div>

        {/* Disk Card */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-secondary uppercase tracking-wider">Disk</span>
            <StatusDot level={diskLevel} />
          </div>
          <div className="font-mono text-2xl font-semibold mb-1">{primaryDisk ? formatBytes(primaryDisk.used) : '--'}</div>
          <div className="text-xs text-text-muted font-mono mb-3">/ {primaryDisk ? formatBytes(primaryDisk.total) : '--'}</div>
          <ProgressBar percent={diskPercent} color={diskLevel === 'green' ? '#3fb950' : diskLevel === 'yellow' ? '#d29922' : '#f85149'} />
          <div className="flex justify-between mt-2 text-xs text-text-muted font-mono">
            <span>R: {diskIO ? formatSpeed(diskIO.readSpeed) : '--'}</span>
            <span>W: {diskIO ? formatSpeed(diskIO.writeSpeed) : '--'}</span>
          </div>
        </div>

        {/* Network Card */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-secondary uppercase tracking-wider">Network</span>
            <StatusDot level="green" />
          </div>
          <div className="font-mono text-lg font-semibold mb-1">
            <span className="text-status-blue">↓</span> {networkSpeed ? formatSpeed(networkSpeed.rxSpeed) : '--'}
          </div>
          <div className="font-mono text-lg font-semibold mb-3">
            <span className="text-status-green">↑</span> {networkSpeed ? formatSpeed(networkSpeed.txSpeed) : '--'}
          </div>
          <div className="text-xs text-text-muted font-mono">
            {networkInterfaces[0]?.iface ?? '--'}: {networkInterfaces[0]?.ip4 ?? '--'}
          </div>
        </div>
      </div>
    </div>
  )
}
