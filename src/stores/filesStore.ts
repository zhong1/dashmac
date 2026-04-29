import { create } from 'zustand'
import type { DirEntry, FileEntry } from '../types'

export type SortColumn = 'name' | 'size' | 'modified' | 'type'
export type SortDir = 'asc' | 'desc'

export type FileClipboard = { paths: string[]; op: 'copy' | 'cut' } | null

interface FilesState {
  currentPath: string
  entries: DirEntry[]
  selection: Set<string>
  selectionAnchor: string | null
  sort: { column: SortColumn; dir: SortDir }
  clipboard: FileClipboard
  history: { back: string[]; forward: string[] }
  showHidden: boolean
  dirError: string | null
  loading: boolean
  viewMode: 'list' | 'analyze'
  analyzeData: FileEntry | null
  analyzeLoading: boolean
  analyzedPath: string | null

  navigate: (path: string) => Promise<void>
  goBack: () => Promise<void>
  goForward: () => Promise<void>
  goUp: () => Promise<void>
  refresh: () => Promise<void>
  setSelection: (sel: Set<string>, anchor?: string | null) => void
  toggleSelect: (path: string) => void
  rangeSelect: (path: string) => void
  selectAll: () => void
  clearSelection: () => void
  setSort: (column: SortColumn) => void
  setClipboard: (clip: FileClipboard) => void
  setShowHidden: (v: boolean) => void
  toggleAnalyze: () => Promise<void>
  rescanCurrent: () => Promise<void>
  enterAnalyze: (path: string) => Promise<void>
}

const HOME_FALLBACK = '/'

export const useFilesStore = create<FilesState>((set, get) => ({
  currentPath: HOME_FALLBACK,
  entries: [],
  selection: new Set(),
  selectionAnchor: null,
  sort: { column: 'name', dir: 'asc' },
  clipboard: null,
  history: { back: [], forward: [] },
  showHidden: false,
  dirError: null,
  loading: false,
  viewMode: 'list',
  analyzeData: null,
  analyzeLoading: false,
  analyzedPath: null,

  navigate: async (target: string) => {
    set({ loading: true })
    const result = await window.api.listDirectory(target)
    const prev = get().currentPath
    if (result.ok) {
      set((s) => ({
        currentPath: target,
        entries: result.entries,
        selection: new Set(),
        selectionAnchor: null,
        sort: { column: 'name', dir: 'asc' },
        history: target === prev
          ? s.history
          : { back: [...s.history.back, prev], forward: [] },
        dirError: null,
        loading: false,
      }))
    } else {
      const errno = result.errno
      let msgKey: string
      if (errno === 'ENOENT') msgKey = 'files.error.notFound'
      else if (errno === 'EACCES' || errno === 'EPERM') msgKey = 'files.error.permission'
      else if (errno === 'ENOTDIR') msgKey = 'files.error.notADirectory'
      else msgKey = 'files.error.generic'
      set((s) => ({
        currentPath: target,
        entries: [],
        selection: new Set(),
        history: target === prev
          ? s.history
          : { back: [...s.history.back, prev], forward: [] },
        dirError: msgKey,
        loading: false,
      }))
    }
  },

  goBack: async () => {
    const { history, currentPath, navigate } = get()
    if (history.back.length === 0) return
    const target = history.back[history.back.length - 1]
    set({ history: {
      back: history.back.slice(0, -1),
      forward: [...history.forward, currentPath],
    }})
    // Re-list without pushing to back (we manually managed it above).
    const result = await window.api.listDirectory(target)
    if (result.ok) {
      set({ currentPath: target, entries: result.entries, selection: new Set(), dirError: null })
    } else {
      // Fall back to full navigate semantics on error
      await navigate(target)
    }
  },

  goForward: async () => {
    const { history, currentPath } = get()
    if (history.forward.length === 0) return
    const target = history.forward[history.forward.length - 1]
    set({ history: {
      back: [...history.back, currentPath],
      forward: history.forward.slice(0, -1),
    }})
    const result = await window.api.listDirectory(target)
    if (result.ok) {
      set({ currentPath: target, entries: result.entries, selection: new Set(), dirError: null })
    }
  },

  goUp: async () => {
    const { currentPath, navigate } = get()
    if (currentPath === '/') return
    const parent = currentPath.replace(/\/[^/]+\/?$/, '') || '/'
    await navigate(parent)
  },

  refresh: async () => {
    const result = await window.api.listDirectory(get().currentPath)
    if (result.ok) {
      set({ entries: result.entries, dirError: null })
    } else {
      set({ entries: [] })
    }
  },

  setSelection: (sel, anchor) => set({ selection: sel, ...(anchor !== undefined ? { selectionAnchor: anchor } : {}) }),

  toggleSelect: (path) => {
    const { selection } = get()
    const next = new Set(selection)
    if (next.has(path)) next.delete(path); else next.add(path)
    set({ selection: next, selectionAnchor: path })
  },

  rangeSelect: (path) => {
    const { selection, selectionAnchor, entries } = get()
    if (!selectionAnchor) {
      set({ selection: new Set([path]), selectionAnchor: path })
      return
    }
    const idxA = entries.findIndex((e) => e.path === selectionAnchor)
    const idxB = entries.findIndex((e) => e.path === path)
    if (idxA < 0 || idxB < 0) return
    const [lo, hi] = idxA < idxB ? [idxA, idxB] : [idxB, idxA]
    const next = new Set(selection)
    for (let i = lo; i <= hi; i++) next.add(entries[i].path)
    set({ selection: next })
  },

  selectAll: () => {
    const { entries } = get()
    set({ selection: new Set(entries.map((e) => e.path)), selectionAnchor: null })
  },

  clearSelection: () => set({ selection: new Set(), selectionAnchor: null }),

  setSort: (column) => {
    const { sort } = get()
    if (sort.column === column) {
      set({ sort: { column, dir: sort.dir === 'asc' ? 'desc' : 'asc' } })
    } else {
      set({ sort: { column, dir: 'asc' } })
    }
  },

  setClipboard: (clip) => set({ clipboard: clip }),

  setShowHidden: (v) => set({ showHidden: v }),

  toggleAnalyze: async () => {
    const { viewMode, currentPath, analyzedPath, analyzeData } = get()
    if (viewMode === 'analyze') {
      set({ viewMode: 'list' })
      return
    }
    set({ viewMode: 'analyze' })
    if (analyzedPath !== currentPath || analyzeData === null) {
      set({ analyzeLoading: true })
      try {
        const data = await window.api.queryDiskScan(currentPath)
        set({ analyzeData: data, analyzedPath: currentPath, analyzeLoading: false })
      } catch {
        set({ analyzeLoading: false })
      }
    }
  },

  rescanCurrent: async () => {
    const { currentPath } = get()
    set({ analyzeLoading: true })
    try {
      const data = await window.api.queryDiskScan(currentPath)
      set({ analyzeData: data, analyzedPath: currentPath, analyzeLoading: false })
    } catch {
      set({ analyzeLoading: false })
    }
  },

  enterAnalyze: async (path: string) => {
    await get().navigate(path)
    set({ viewMode: 'analyze' })
    if (get().analyzedPath !== path || get().analyzeData === null) {
      set({ analyzeLoading: true })
      try {
        const data = await window.api.queryDiskScan(path)
        set({ analyzeData: data, analyzedPath: path, analyzeLoading: false })
      } catch {
        set({ analyzeLoading: false })
      }
    }
  },
}))

// Wire IPC listener exactly once at module load.
window.api.onDirChanged((p) => {
  const { currentPath, refresh } = useFilesStore.getState()
  if (p === currentPath) refresh()
})
