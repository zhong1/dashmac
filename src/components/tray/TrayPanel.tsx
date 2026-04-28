import { useSystemStore } from '../../stores/systemStore'
import { useTranslation } from '../../i18n/index'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatSpeed(bytes: number): string { return `${formatBytes(bytes)}/s` }

function MiniBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-1 bg-bg-primary rounded-full overflow-hidden flex-1">
      <div className="h-full rounded-full" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }} />
    </div>
  )
}

export default function TrayPanel() {
  const { t } = useTranslation()
  const memory = useSystemStore((s) => s.memory)
  const diskVolumes = useSystemStore((s) => s.diskVolumes)
  const networkSpeed = useSystemStore((s) => s.networkSpeed)

  const primaryDisk = diskVolumes[0]
  const diskPercent = primaryDisk ? (primaryDisk.used / primaryDisk.total) * 100 : 0

  return (
    <div className="w-80 bg-bg-secondary rounded-lg border border-border-primary overflow-hidden">
      <div className="px-3 py-2 border-b border-border-primary">
        <span className="text-xs font-mono font-semibold text-text-primary">{t('tray.name')}</span>
      </div>
      <div className="px-3 py-2 border-b border-border-secondary">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-muted">{t('tray.memory')}</span>
          <span className="text-xs font-mono text-text-primary">{memory ? `${memory.usagePercent.toFixed(0)}%` : '--'}</span>
        </div>
        <div className="flex items-center gap-2">
          <MiniBar percent={memory?.usagePercent ?? 0} color="#1f6feb" />
          <span className="text-xs font-mono text-text-secondary w-20 text-right">
            {memory ? `${formatBytes(memory.used)} / ${formatBytes(memory.total)}` : '--'}
          </span>
        </div>
      </div>
      <div className="px-3 py-2 border-b border-border-secondary">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-muted">{t('tray.diskMount', { mount: primaryDisk?.mountPoint ?? '' })}</span>
          <span className="text-xs font-mono text-text-primary">{diskPercent.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <MiniBar percent={diskPercent} color="#d29922" />
          <span className="text-xs font-mono text-text-secondary w-20 text-right">
            {primaryDisk ? t('tray.free', { size: formatBytes(primaryDisk.available) }) : '--'}
          </span>
        </div>
      </div>
      <div className="px-3 py-2 border-b border-border-secondary">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-muted">{t('tray.network')}</span>
        </div>
        <div className="flex justify-between text-xs font-mono">
          <span className="text-status-blue">↓ {networkSpeed ? formatSpeed(networkSpeed.rxSpeed) : '--'}</span>
          <span className="text-status-green">↑ {networkSpeed ? formatSpeed(networkSpeed.txSpeed) : '--'}</span>
        </div>
      </div>
      <div className="p-2">
        <button onClick={() => window.api.openMainWindow()}
          className="w-full py-1.5 text-xs font-mono text-center bg-bg-tertiary border border-border-primary rounded hover:bg-border-secondary text-text-primary">
          {t('tray.open')}
        </button>
      </div>
    </div>
  )
}
