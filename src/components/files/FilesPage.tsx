import { useEffect, useMemo, useState } from 'react'
import type { DirEntry } from '../../types'
import { useTranslation } from '../../i18n/index'
import { useFilesStore } from '../../stores/filesStore'
import { useToast } from '../../stores/toastStore'
import FileSidebar from './FileSidebar'
import PathBar from './PathBar'
import FileList from './FileList'
import ContextMenu, { type MenuItem } from './ContextMenu'
import Treemap from './Treemap'
import BigFiles from './BigFiles'

type MenuState =
  | { kind: 'row'; x: number; y: number; entry: DirEntry }
  | { kind: 'empty'; x: number; y: number }
  | null

export default function FilesPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const currentPath = useFilesStore((s) => s.currentPath)
  const selection = useFilesStore((s) => s.selection)
  const clipboard = useFilesStore((s) => s.clipboard)
  const setClipboard = useFilesStore((s) => s.setClipboard)
  const setSelection = useFilesStore((s) => s.setSelection)
  const navigate = useFilesStore((s) => s.navigate)
  const viewMode = useFilesStore((s) => s.viewMode)
  const analyzeData = useFilesStore((s) => s.analyzeData)
  const analyzeLoading = useFilesStore((s) => s.analyzeLoading)
  const analyzedPath = useFilesStore((s) => s.analyzedPath)
  const rescanCurrent = useFilesStore((s) => s.rescanCurrent)
  const entries = useFilesStore((s) => s.entries)
  const showHidden = useFilesStore((s) => s.showHidden)
  const sort = useFilesStore((s) => s.sort)
  const goBack = useFilesStore((s) => s.goBack)
  const goForward = useFilesStore((s) => s.goForward)
  const goUp = useFilesStore((s) => s.goUp)
  const refresh = useFilesStore((s) => s.refresh)
  const rangeSelect = useFilesStore((s) => s.rangeSelect)
  const selectAll = useFilesStore((s) => s.selectAll)
  const clearSelection = useFilesStore((s) => s.clearSelection)
  const selectionAnchor = useFilesStore((s) => s.selectionAnchor)
  const history = useFilesStore((s) => s.history)
  const [menu, setMenu] = useState<MenuState>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)

  const visible = useMemo(() => {
    const filtered = showHidden ? entries : entries.filter((e) => !e.name.startsWith('.'))
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      if (sort.column === 'name') return sign * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      if (sort.column === 'size') return sign * (a.size - b.size)
      if (sort.column === 'modified') return sign * (a.modifiedAt - b.modifiedAt)
      if (sort.column === 'type') return sign * a.ext.localeCompare(b.ext) || a.name.localeCompare(b.name)
      return 0
    })
  }, [entries, showHidden, sort])

  useEffect(() => { navigate('~') }, [navigate])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Focus guard: skip when typing in inputs
      const target = e.target as HTMLElement | null
      if (target && target.matches('input, textarea, [contenteditable]')) return
      // Modal guard: skip when context menu or rename is open
      if (menu !== null || renamingPath !== null) return

      const meta = e.metaKey
      const shift = e.shiftKey

      // Escape — clear selection
      if (e.key === 'Escape') { clearSelection(); return }

      // ⌘A — select all
      if (meta && e.key === 'a') { e.preventDefault(); selectAll(); return }

      // ⌘R / ⌘⇧R
      if (meta && e.key === 'r') {
        e.preventDefault()
        if (shift && selection.size === 1) {
          const [path] = selection
          window.api.revealFile(path)
        } else {
          refresh()
        }
        return
      }

      // ⌘[ / ⌘]
      if (meta && e.key === '[') { if (history.back.length > 0) goBack(); return }
      if (meta && e.key === ']') { if (history.forward.length > 0) goForward(); return }

      // Arrow keys
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const dir: 'up' | 'down' = e.key === 'ArrowUp' ? 'up' : 'down'

        // ⌘↑ — go up directory
        if (meta && dir === 'up') { if (currentPath !== '/') goUp(); return }

        // ⌘↓ — open selected
        if (meta && dir === 'down') {
          if (selection.size !== 1) return
          const [path] = selection
          const entry = visible.find((v) => v.path === path)
          if (!entry) return
          if (entry.isDirectory) navigate(entry.path)
          else window.api.fsOpen(entry.path)
          return
        }

        // Plain ↑/↓ or Shift+↑/↓
        if (visible.length === 0) return
        e.preventDefault()
        let nextEntry: DirEntry | null = null
        if (selection.size === 0) {
          nextEntry = dir === 'up' ? visible[visible.length - 1] : visible[0]
        } else {
          const cursor = selectionAnchor ?? Array.from(selection)[0]
          const idx = visible.findIndex((v) => v.path === cursor)
          if (idx < 0) {
            nextEntry = visible[0]
          } else {
            const next = dir === 'up' ? Math.max(0, idx - 1) : Math.min(visible.length - 1, idx + 1)
            nextEntry = visible[next]
          }
        }
        if (!nextEntry) return
        if (shift) rangeSelect(nextEntry.path)
        else setSelection(new Set([nextEntry.path]), nextEntry.path)
        return
      }

      // Enter — rename
      if (e.key === 'Enter' && selection.size === 1) {
        const [path] = selection
        setRenamingPath(path)
        e.preventDefault()
        return
      }

      // ⌘Backspace — trash
      if (meta && e.key === 'Backspace' && selection.size > 0) {
        e.preventDefault()
        const paths = Array.from(selection)
        window.api.fsTrash(paths)
        return
      }

      // ⌘C — copy ; ⌘⇧C — zip ; ⌘X — cut ; ⌘V — paste
      if (meta && e.key === 'c') {
        if (selection.size === 0) return
        const paths = Array.from(selection)
        if (shift) window.api.fsZip(paths, currentPath)
        else setClipboard({ paths, op: 'copy' })
        return
      }
      if (meta && e.key === 'x' && selection.size > 0) {
        const paths = Array.from(selection)
        setClipboard({ paths, op: 'cut' })
        return
      }
      if (meta && e.key === 'v' && clipboard !== null) {
        // Paste-into-self check (cut only): skip silently
        if (clipboard.op === 'cut' && clipboard.paths.some((p) => p.startsWith(currentPath + '/') || currentPath === parentOf(p))) {
          return
        }
        const fn = clipboard.op === 'copy' ? window.api.fsCopy : window.api.fsMove
        fn(clipboard.paths, currentPath).then((r) => {
          if (r.ok && clipboard.op === 'cut') setClipboard(null)
        })
        return
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [
    visible, selection, selectionAnchor, currentPath, history, menu, renamingPath, clipboard,
    navigate, goBack, goForward, goUp, refresh,
    setSelection, rangeSelect, selectAll, clearSelection, setClipboard, setRenamingPath,
  ])

  const openRowMenu = (e: React.MouseEvent, entry: DirEntry) => {
    e.preventDefault()
    if (!selection.has(entry.path)) {
      setSelection(new Set([entry.path]), entry.path)
    }
    setMenu({ kind: 'row', x: e.clientX, y: e.clientY, entry })
  }

  const openEmptyMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ kind: 'empty', x: e.clientX, y: e.clientY })
  }

  // Effective selection for row menu actions: if the right-clicked entry is in selection,
  // act on the whole selection; else act on just that entry.
  const targetsForRowMenu = (entry: DirEntry): string[] =>
    selection.has(entry.path) ? Array.from(selection) : [entry.path]

  const rowMenuItems = (entry: DirEntry): MenuItem[] => {
    const targets = targetsForRowMenu(entry)
    const isMulti = targets.length > 1
    return [
      { label: t('files.contextMenu.open'), disabled: isMulti, onClick: async () => {
        const r = await window.api.fsOpen(entry.path)
        if (!r.ok) toast.error(r.message)
      }},
      { label: t('files.contextMenu.rename'), disabled: isMulti, onClick: () => setRenamingPath(entry.path) },
      { label: '', separator: true, onClick: () => {} },
      { label: t('files.contextMenu.copy'), onClick: () => setClipboard({ paths: targets, op: 'copy' }) },
      { label: t('files.contextMenu.cut'), onClick: () => setClipboard({ paths: targets, op: 'cut' }) },
      { label: t('files.contextMenu.trash'), onClick: async () => {
        const r = await window.api.fsTrash(targets)
        if (!r.ok) toast.error(r.message)
      }},
      { label: t('files.contextMenu.zip'), onClick: async () => {
        const r = await window.api.fsZip(targets, currentPath)
        if (!r.ok) toast.error(r.message)
      }},
      { label: '', separator: true, onClick: () => {} },
      { label: t('files.contextMenu.revealInFinder'), onClick: () => window.api.revealFile(entry.path) },
    ]
  }

  const handleRenameSubmit = async (entry: DirEntry, newName: string) => {
    if (newName.length === 0 || newName.includes('/')) {
      return { ok: false, message: t('files.error.invalidName') }
    }
    const r = await window.api.fsRename(entry.path, newName)
    if (r.ok) {
      setRenamingPath(null)
      return { ok: true }
    } else {
      // Pattern-match on error message for collision detection
      if (r.message.includes('EEXIST') || r.message.includes('exists')) {
        return { ok: false, message: t('files.error.nameExists') }
      }
      return { ok: false, message: r.message }
    }
  }

  const emptyMenuItems = (): MenuItem[] => [
    { label: t('files.contextMenu.newFolder'), onClick: async () => {
      const name = await uniqueDefault(currentPath, t('files.defaults.untitledFolder'))
      const r = await window.api.fsCreateFolder(currentPath, name)
      if (r.ok) setRenamingPath(r.path)
      else toast.error(r.message)
    }},
    { label: t('files.contextMenu.newFile'), onClick: async () => {
      const name = await uniqueDefault(currentPath, t('files.defaults.untitledFile'))
      const r = await window.api.fsCreateFile(currentPath, name)
      if (r.ok) setRenamingPath(r.path)
      else toast.error(r.message)
    }},
    { label: t('files.contextMenu.paste'), disabled: clipboard === null, onClick: async () => {
      if (!clipboard) return
      // Reject paste-into-self for cut
      if (clipboard.op === 'cut' && clipboard.paths.some((p) => p.startsWith(currentPath + '/') || currentPath === parentOf(p))) {
        toast.error(t('files.error.pasteIntoSelf')); return
      }
      const fn = clipboard.op === 'copy' ? window.api.fsCopy : window.api.fsMove
      const r = await fn(clipboard.paths, currentPath)
      if (r.ok) {
        if (clipboard.op === 'cut') setClipboard(null)
      } else {
        toast.error(r.message)
      }
    }},
  ]

  return (
    <div className="flex h-full -m-4">
      <FileSidebar />
      <div className="flex-1 flex flex-col">
        <PathBar />
        {viewMode === 'list' ? (
          <FileList
            onContextRow={openRowMenu}
            onContextEmpty={openEmptyMenu}
            renamingPath={renamingPath}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={() => setRenamingPath(null)}
            visible={visible}
          />
        ) : (
          <AnalyzeView
            analyzedPath={analyzedPath}
            currentPath={currentPath}
            analyzeData={analyzeData}
            analyzeLoading={analyzeLoading}
            onRescan={rescanCurrent}
          />
        )}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.kind === 'row' ? rowMenuItems(menu.entry) : emptyMenuItems()}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

async function uniqueDefault(parent: string, base: string): Promise<string> {
  const r = await window.api.listDirectory(parent)
  const names = r.ok ? new Set(r.entries.map((e) => e.name)) : new Set<string>()
  if (!names.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} ${i}`
    if (!names.has(candidate)) return candidate
  }
  return base
}

function parentOf(p: string): string {
  const idx = p.lastIndexOf('/')
  return idx <= 0 ? '/' : p.slice(0, idx)
}

function AnalyzeView({
  analyzedPath, currentPath, analyzeData, analyzeLoading, onRescan,
}: {
  analyzedPath: string | null
  currentPath: string
  analyzeData: import('../../types').FileEntry | null
  analyzeLoading: boolean
  onRescan: () => Promise<void>
}) {
  const { t } = useTranslation()
  const stale = analyzedPath !== null && analyzedPath !== currentPath

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-mono text-text-muted">
          {analyzedPath ? t('files.analyze.analyzedPath', { path: analyzedPath }) : ''}
        </span>
        {stale && (
          <button onClick={() => onRescan()}
            className="px-3 py-1 text-xs font-mono bg-status-yellow text-bg-primary rounded">
            {t('files.analyze.scanCurrent', { path: currentPath })}
          </button>
        )}
        {!stale && analyzedPath && (
          <button onClick={() => onRescan()}
            className="px-3 py-1 text-xs font-mono bg-bg-primary border border-border-primary text-text-secondary rounded hover:bg-bg-tertiary">
            {t('files.analyze.rescan')}
          </button>
        )}
      </div>

      {analyzeLoading && (
        <div className="flex-1 flex items-center justify-center text-text-muted font-mono text-sm">
          {analyzedPath ? t('files.analyze.loading', { path: analyzedPath }) : t('files.analyze.loading', { path: currentPath })}
        </div>
      )}

      {!analyzeLoading && analyzeData && (
        <>
          <Treemap data={analyzeData} onClickFile={(p) => window.api.revealFile(p)} />
          <BigFiles data={analyzeData} />
        </>
      )}

      {!analyzeLoading && !analyzeData && (
        <div className="flex-1 flex items-center justify-center text-text-muted font-mono text-sm">
          {t('files.analyze.treemapEmpty')}
        </div>
      )}
    </div>
  )
}
