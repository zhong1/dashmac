import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

interface DataPoint {
  time: number
  value: number
}

interface RealtimeChartProps {
  data: DataPoint[]
  color: string
  height?: number
  formatValue?: (value: number) => string
  unit?: string
}

export default function RealtimeChart({
  data, color, height = 200,
  formatValue = (v) => v.toFixed(1), unit = '',
}: RealtimeChartProps) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <defs>
            <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" hide />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 12, fontFamily: 'SF Mono, monospace' }}
            labelStyle={{ color: '#8b949e' }}
            itemStyle={{ color: '#c9d1d9' }}
            formatter={(value: number) => [`${formatValue(value)}${unit}`, '']}
            labelFormatter={() => ''}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2}
            fill={`url(#gradient-${color})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
