import { create } from 'zustand'

export type ToastLevel = 'success' | 'error' | 'info'
export interface Toast {
  id: string
  level: ToastLevel
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (level: ToastLevel, message: string) => void
  dismiss: (id: string) => void
}

const MAX = 3

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (level, message) =>
    set((s) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const next = [...s.toasts, { id, level, message }]
      return { toasts: next.length > MAX ? next.slice(-MAX) : next }
    }),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function useToast() {
  const push = useToastStore((s) => s.push)
  return {
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
    info: (message: string) => push('info', message),
  }
}
