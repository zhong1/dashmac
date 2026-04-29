import { useEffect, useRef, useState } from 'react'

interface Props {
  initialName: string
  onSubmit: (newName: string) => Promise<{ ok: boolean; message?: string }>
  onCancel: () => void
}

export default function RenameInline({ initialName, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.focus()
    // Select base name (everything before the last '.')
    const dot = initialName.lastIndexOf('.')
    if (dot > 0) ref.current.setSelectionRange(0, dot)
    else ref.current.select()
  }, [initialName])

  const submit = async () => {
    if (value === initialName) { onCancel(); return }
    const result = await onSubmit(value)
    if (!result.ok) {
      setError(result.message ?? 'Error')
      // stay in edit mode
      ref.current?.focus()
    }
  }

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => { setValue(e.target.value); setError(null) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit()
        else if (e.key === 'Escape') onCancel()
      }}
      onBlur={submit}
      className={`bg-bg-primary border rounded px-1 py-0.5 text-xs font-mono w-full ${
        error ? 'border-status-red text-status-red' : 'border-status-blue text-text-primary'
      }`}
      title={error ?? undefined}
    />
  )
}
