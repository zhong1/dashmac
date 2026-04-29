import { create } from 'zustand'
import type { CustomCommandProgressEvent } from '../types'

export interface FailureEntry {
  path: string
  message: string
  stderr: string
}

export interface Run {
  runId: string
  commandLabel: string
  total: number
  done: number
  current?: string
  failures: FailureEntry[]
}

interface FinishedRun {
  runId: string
  commandLabel: string
  total: number
  failures: FailureEntry[]
}

interface CommandRunState {
  runs: Run[]
  // Last finished run held briefly so the status component can fire a toast.
  // Cleared by the consumer after toasting.
  lastFinished: FinishedRun | null

  start: (e: Extract<CustomCommandProgressEvent, { type: 'start' }>) => void
  advance: (e: Extract<CustomCommandProgressEvent, { type: 'advance' }>) => void
  fileError: (e: Extract<CustomCommandProgressEvent, { type: 'fileError' }>) => void
  finish: (e: Extract<CustomCommandProgressEvent, { type: 'finish' }>) => void
  consumeLastFinished: () => void
}

export const useCommandRunStore = create<CommandRunState>((set) => ({
  runs: [],
  lastFinished: null,

  start: (e) => set((s) => ({
    runs: [
      { runId: e.runId, commandLabel: e.commandLabel, total: e.total, done: 0, failures: [] },
      ...s.runs,
    ],
  })),

  advance: (e) => set((s) => ({
    runs: s.runs.map((r) =>
      r.runId === e.runId ? { ...r, done: e.done, current: e.current } : r,
    ),
  })),

  fileError: (e) => set((s) => ({
    runs: s.runs.map((r) =>
      r.runId === e.runId
        ? { ...r, failures: [...r.failures, { path: e.path, message: e.message, stderr: e.stderr }] }
        : r,
    ),
  })),

  finish: (e) => set((s) => {
    const r = s.runs.find((r) => r.runId === e.runId)
    if (!r) return s
    return {
      runs: s.runs.filter((x) => x.runId !== e.runId),
      lastFinished: {
        runId: r.runId,
        commandLabel: r.commandLabel,
        total: r.total,
        failures: r.failures,
      },
    }
  }),

  consumeLastFinished: () => set({ lastFinished: null }),
}))
