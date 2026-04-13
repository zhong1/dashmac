import { useMemo } from 'react'
import { treemap, hierarchy, treemapSquarify } from 'd3-hierarchy'
import type { FileEntry } from '../../types'

interface TreemapProps {
  data: FileEntry | null
  width?: number
  height?: number
  onClickFile?: (path: string) => void
}

const COLORS = ['#1f6feb', '#3fb950', '#d29922', '#f85149', '#a371f7', '#79c0ff', '#d2a8ff', '#7ee787']

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export default function Treemap({ data, width = 800, height = 400, onClickFile }: TreemapProps) {
  const nodes = useMemo(() => {
    if (!data || !data.children?.length) return []
    const root = hierarchy(data)
      .sum((d) => (d.isDirectory && d.children?.length ? 0 : d.size))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    const layout = treemap<FileEntry>().size([width, height]).padding(2).tile(treemapSquarify)
    layout(root)
    return root.leaves()
  }, [data, width, height])

  if (!data) return <div className="text-text-muted font-mono text-sm">No data. Click "Scan" to analyze a directory.</div>

  return (
    <svg width={width} height={height} className="rounded-lg overflow-hidden">
      {nodes.map((node, i) => {
        const w = (node.x1 ?? 0) - (node.x0 ?? 0)
        const h = (node.y1 ?? 0) - (node.y0 ?? 0)
        if (w < 2 || h < 2) return null
        return (
          <g key={node.data.path} transform={`translate(${node.x0},${node.y0})`}
            onClick={() => onClickFile?.(node.data.path)} className="cursor-pointer">
            <rect width={w} height={h} fill={COLORS[i % COLORS.length]} opacity={0.8} rx={2} />
            {w > 50 && h > 20 && <text x={4} y={14} fontSize={10} fill="#fff" fontFamily="SF Mono, monospace">{node.data.name}</text>}
            {w > 50 && h > 32 && <text x={4} y={26} fontSize={9} fill="rgba(255,255,255,0.7)" fontFamily="SF Mono, monospace">{formatBytes(node.value ?? 0)}</text>}
          </g>
        )
      })}
    </svg>
  )
}
