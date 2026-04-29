import { useEffect, useRef } from 'react'

export interface MenuItem {
  label: string
  onClick: () => void
  disabled?: boolean
  separator?: boolean
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escape)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: x, top: y, zIndex: 100 }}
      className="bg-bg-secondary border border-border-primary rounded shadow-lg text-xs font-mono py-1 min-w-[160px]"
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="border-t border-border-secondary my-1" />
        ) : (
          <button
            key={i}
            onClick={() => { if (!item.disabled) { item.onClick(); onClose() } }}
            disabled={item.disabled}
            className={`block w-full text-left px-3 py-1.5 ${
              item.disabled ? 'text-text-muted opacity-50' : 'text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  )
}
