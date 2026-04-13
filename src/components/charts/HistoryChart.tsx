import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts'
import type { HistoryPoint } from '../../types'

interface HistoryChartProps {
  data: HistoryPoint[]
  color: string
  height?: number
  formatValue?: (value: number) => string
  unit?: string
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function HistoryChart({
  data, color, height = 250,
  formatValue = (v) => v.toFixed(1), unit = '',
}: HistoryChartProps) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
          <defs>
            <linearGradient id={`hist-gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.2} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
          <XAxis dataKey="timestamp" tickFormatter={formatTime} stroke="#484f58" fontSize={10} fontFamily="SF Mono, monospace" />
          <YAxis stroke="#484f58" fontSize={10} fontFamily="SF Mono, monospace" tickFormatter={(v) => formatValue(v)} />
          <Tooltip
            contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 12, fontFamily: 'SF Mono, monospace' }}
            labelFormatter={(ts) => formatTime(Number(ts))}
            formatter={(value: number) => [`${formatValue(value)}${unit}`, '']}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2}
            fill={`url(#hist-gradient-${color})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
