import { useEffect } from 'react'
import { useToastStore, type Toast as ToastT } from '../../stores/toastStore'

const COLORS: Record<ToastT['level'], string> = {
  success: 'bg-status-green',
  error: 'bg-status-red',
  info: 'bg-status-blue',
}

const AUTO_DISMISS_MS = 4000

export default function ToastRoot() {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}

function ToastItem({ toast }: { toast: ToastT }) {
  const dismiss = useToastStore((s) => s.dismiss)
  useEffect(() => {
    const id = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS)
    return () => clearTimeout(id)
  }, [toast.id, dismiss])

  return (
    <div
      onClick={() => dismiss(toast.id)}
      className={`${COLORS[toast.level]} text-white text-xs font-mono px-3 py-2 rounded shadow-lg cursor-pointer pointer-events-auto max-w-xs`}
    >
      {toast.message}
    </div>
  )
}
