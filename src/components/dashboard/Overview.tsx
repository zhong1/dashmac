import { useEffect, useState } from 'react'
import { useSystemStore } from '../../stores/systemStore'
import { useFilesStore } from '../../stores/filesStore'
import { useTranslation } from '../../i18n/index'

type Page = 'dashboard' | 'memory' | 'network' | 'files' | 'settings'

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

export default function Overview({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { t } = useTranslation()
  const memory = useSystemStore((s) => s.memory)
  const diskVolumes = useSystemStore((s) => s.diskVolumes)
  const diskIO = useSystemStore((s) => s.diskIO)
  const networkSpeed = useSystemStore((s) => s.networkSpeed)
  const networkInterfaces = useSystemStore((s) => s.networkInterfaces)
  const [shortcuts, setShortcuts] = useState<string[]>([])

  useEffect(() => {
    window.api.getSettings().then((s) => setShortcuts(s.fileShortcuts ?? []))
  }, [])

  const memPercent = memory?.usagePercent ?? 0
  const memLevel = memPercent >= 90 ? 'red' : memPercent >= 75 ? 'yellow' : 'green'
  const primaryDisk = diskVolumes[0]
  const diskPercent = primaryDisk ? (primaryDisk.used / primaryDisk.total) * 100 : 0
  const diskLevel = diskPercent >= 90 ? 'red' : diskPercent >= 75 ? 'yellow' : 'green'

  const handleCardDoubleClick = (kind: 'memory' | 'disk' | 'network') => {
    if (kind === 'memory') onNavigate('memory')
    else if (kind === 'network') onNavigate('network')
    else {
      // Disk → Files page in Analyze view scanning '/'.
      // Use getState() because this is an event handler, not a subscription.
      useFilesStore.getState().enterAnalyze('/')
      onNavigate('files')
    }
  }

  const handleShortcutDoubleClick = (path: string) => {
    // getState() pattern: read store action without subscribing.
    useFilesStore.getState().navigate(path)
    onNavigate('files')
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {/* Memory Card */}
        <div onDoubleClick={() => handleCardDoubleClick('memory')}
          className="bg-bg-secondary border border-border-primary rounded-lg p-4 cursor-pointer hover:bg-bg-tertiary">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-secondary uppercase tracking-wider">{t('overview.memory')}</span>
            <StatusDot level={memLevel} />
          </div>
          <div className="font-mono text-2xl font-semibold mb-1">{memory ? formatBytes(memory.used) : '--'}</div>
          <div className="text-xs text-text-muted font-mono mb-3">/ {memory ? formatBytes(memory.total) : '--'}</div>
          <ProgressBar percent={memPercent} color={memLevel === 'green' ? '#3fb950' : memLevel === 'yellow' ? '#d29922' : '#f85149'} />
          <div className="flex justify-between mt-2 text-xs text-text-muted font-mono">
            <span>{t('overview.cached')}: {memory ? formatBytes(memory.cached) : '--'}</span>
            <span>{t('overview.swap')}: {memory ? formatBytes(memory.swapUsed) : '--'}</span>
          </div>
        </div>

        {/* Disk Card */}
        <div onDoubleClick={() => handleCardDoubleClick('disk')}
          className="bg-bg-secondary border border-border-primary rounded-lg p-4 cursor-pointer hover:bg-bg-tertiary">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-secondary uppercase tracking-wider">{t('overview.disk')}</span>
            <StatusDot level={diskLevel} />
          </div>
          <div className="font-mono text-2xl font-semibold mb-1">{primaryDisk ? formatBytes(primaryDisk.used) : '--'}</div>
          <div className="text-xs text-text-muted font-mono mb-3">/ {primaryDisk ? formatBytes(primaryDisk.total) : '--'}</div>
          <ProgressBar percent={diskPercent} color={diskLevel === 'green' ? '#3fb950' : diskLevel === 'yellow' ? '#d29922' : '#f85149'} />
          <div className="flex justify-between mt-2 text-xs text-text-muted font-mono">
            <span>{t('overview.read')}: {diskIO ? formatSpeed(diskIO.readSpeed) : '--'}</span>
            <span>{t('overview.write')}: {diskIO ? formatSpeed(diskIO.writeSpeed) : '--'}</span>
          </div>
        </div>

        {/* Network Card */}
        <div onDoubleClick={() => handleCardDoubleClick('network')}
          className="bg-bg-secondary border border-border-primary rounded-lg p-4 cursor-pointer hover:bg-bg-tertiary">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-secondary uppercase tracking-wider">{t('overview.network')}</span>
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

      {/* Shortcuts section */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-3">
          {t('dashboard.shortcuts.title')}
        </h3>
        {shortcuts.length === 0 ? (
          <div className="text-xs text-text-muted py-2">{t('dashboard.shortcuts.empty')}</div>
        ) : (
          <div className="flex flex-col gap-1">
            {shortcuts.map((p) => (
              <div
                key={p}
                onDoubleClick={() => handleShortcutDoubleClick(p)}
                title={p}
                className="flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer hover:bg-bg-tertiary"
              >
                <span className="text-base">📁</span>
                <span className="text-sm font-mono text-text-primary truncate flex-1">
                  {p.split('/').pop() || p}
                </span>
                <span className="text-xs font-mono text-text-muted truncate">{p}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
