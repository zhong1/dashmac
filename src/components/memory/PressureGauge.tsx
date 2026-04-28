import { useTranslation } from '../../i18n/index'

interface PressureGaugeProps {
  level: 'normal' | 'warn' | 'critical'
}

const STYLES = {
  normal: { color: '#3fb950', bg: 'rgba(63,185,80,0.1)' },
  warn: { color: '#d29922', bg: 'rgba(210,153,34,0.1)' },
  critical: { color: '#f85149', bg: 'rgba(248,81,73,0.1)' },
}

const LABEL_KEY = {
  normal: 'memory.pressureNormal',
  warn: 'memory.pressureWarn',
  critical: 'memory.pressureCritical',
} as const

export default function PressureGauge({ level }: PressureGaugeProps) {
  const { t } = useTranslation()
  const style = STYLES[level]
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono font-semibold"
      style={{ backgroundColor: style.bg, color: style.color }}>
      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: style.color }} />
      {t(LABEL_KEY[level])}
    </div>
  )
}
