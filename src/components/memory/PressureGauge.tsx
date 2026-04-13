interface PressureGaugeProps {
  level: 'normal' | 'warn' | 'critical'
}

const CONFIG = {
  normal: { color: '#3fb950', label: 'NORMAL', bg: 'rgba(63,185,80,0.1)' },
  warn: { color: '#d29922', label: 'MODERATE', bg: 'rgba(210,153,34,0.1)' },
  critical: { color: '#f85149', label: 'CRITICAL', bg: 'rgba(248,81,73,0.1)' },
}

export default function PressureGauge({ level }: PressureGaugeProps) {
  const cfg = CONFIG[level]
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono font-semibold"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
    </div>
  )
}
