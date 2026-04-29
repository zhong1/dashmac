import { useEffect, useRef } from 'react'
import { useTranslation } from '../../i18n/index'
import { useFilesStore, type SortColumn } from '../../stores/filesStore'
import { formatRelativeTime } from '../../i18n/time'
import type { DirEntry } from '../../types'
import RenameInline from './RenameInline'

const EXT_ICON: Record<string, string> = {
  '.zip': '🗜️', '.tar': '🗜️', '.gz': '🗜️', '.bz2': '🗜️', '.7z': '🗜️',
  '.png': '🖼️', '.jpg': '🖼️', '.jpeg': '🖼️', '.gif': '🖼️', '.svg': '🖼️', '.webp': '🖼️',
  '.mp3': '🎵', '.wav': '🎵', '.aac': '🎵', '.flac': '🎵',
  '.mp4': '🎬', '.mov': '🎬', '.mkv': '🎬', '.avi': '🎬',
  '.pdf': '📕',
  '.txt': '📄', '.md': '📄', '.json': '📄', '.ts': '📄', '.tsx': '📄', '.js': '📄', '.py': '📄',
}

const EXT_TYPE: Record<string, string> = {
  '.zip': 'archive', '.tar': 'archive', '.gz': 'archive', '.bz2': 'archive', '.7z': 'archive',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.svg': 'image', '.webp': 'image',
  '.mp3': 'audio', '.wav': 'audio', '.aac': 'audio', '.flac': 'audio',
  '.mp4': 'video', '.mov': 'video', '.mkv': 'video', '.avi': 'video',
  '.pdf': 'pdf',
  '.txt': 'text', '.md': 'text',
  '.app': 'app',
  '.json': 'code', '.ts': 'code', '.tsx': 'code', '.js': 'code', '.py': 'code',
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

interface FileListProps {
  onContextRow: (e: React.MouseEvent, entry: DirEntry) => void
  onContextEmpty: (e: React.MouseEvent) => void
  renamingPath: string | null
  onRenameSubmit: (entry: DirEntry, newName: string) => Promise<{ ok: boolean; message?: string }>
  onRenameCancel: () => void
  visible: DirEntry[]
}

export default function FileList({
  onContextRow, onContextEmpty,
  renamingPath, onRenameSubmit, onRenameCancel,
  visible,
}: FileListProps) {
  const { t, lang } = useTranslation()
  const selection = useFilesStore((s) => s.selection)
  const selectionAnchor = useFilesStore((s) => s.selectionAnchor)
  const sort = useFilesStore((s) => s.sort)
  const dirError = useFilesStore((s) => s.dirError)
  const navigate = useFilesStore((s) => s.navigate)
  const refresh = useFilesStore((s) => s.refresh)
  const toggleSelect = useFilesStore((s) => s.toggleSelect)
  const rangeSelect = useFilesStore((s) => s.rangeSelect)
  const selectAll = useFilesStore((s) => s.selectAll)
  const clearSelection = useFilesStore((s) => s.clearSelection)
  const setSelection = useFilesStore((s) => s.setSelection)
  const setSort = useFilesStore((s) => s.setSort)

  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())

  useEffect(() => {
    if (!selectionAnchor) return
    const el = rowRefs.current.get(selectionAnchor)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selectionAnchor])

  const handleClick = (e: React.MouseEvent, entry: DirEntry) => {
    if (e.shiftKey) {
      rangeSelect(entry.path)
    } else if (e.metaKey || e.ctrlKey) {
      toggleSelect(entry.path)
    } else {
      setSelection(new Set([entry.path]), entry.path)
    }
  }

  const handleDoubleClick = (entry: DirEntry) => {
    if (entry.isDirectory) navigate(entry.path)
    else window.api.fsOpen(entry.path)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') clearSelection()
    else if ((e.metaKey || e.ctrlKey) && e.key === 'a') { e.preventDefault(); selectAll() }
  }

  if (dirError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-muted font-mono text-sm gap-2">
        <span className="text-status-red text-center max-w-md px-4">{t(dirError)}</span>
        <button onClick={refresh} className="px-3 py-1 text-xs bg-status-blue text-white rounded">{t('files.error.retry')}</button>
      </div>
    )
  }

  if (visible.length === 0) {
    return (
      <div onClick={clearSelection} onContextMenu={onContextEmpty}
        className="flex-1 flex items-center justify-center text-text-muted font-mono text-sm">
        {t('files.list.empty')}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto" tabIndex={0} onKeyDown={handleKeyDown}>
      <table className="w-full text-xs font-mono">
        <thead className="sticky top-0 bg-bg-secondary border-b border-border-primary">
          <tr className="text-text-muted">
            <SortHeader col="name" current={sort} onClick={setSort} label={t('files.list.columns.name')} />
            <SortHeader col="size" current={sort} onClick={setSort} label={t('files.list.columns.size')} align="right" />
            <SortHeader col="modified" current={sort} onClick={setSort} label={t('files.list.columns.modified')} />
            <SortHeader col="type" current={sort} onClick={setSort} label={t('files.list.columns.type')} />
          </tr>
        </thead>
        <tbody>
          {visible.map((e) => (
            <tr
              key={e.path}
              ref={(el) => {
                if (el) rowRefs.current.set(e.path, el)
                else rowRefs.current.delete(e.path)
              }}
              onClick={(ev) => handleClick(ev, e)}
              onDoubleClick={() => handleDoubleClick(e)}
              onContextMenu={(ev) => onContextRow(ev, e)}
              className={`border-b border-border-secondary cursor-default ${
                selection.has(e.path) ? 'bg-status-blue/30 text-text-primary' : 'hover:bg-bg-tertiary text-text-secondary'
              }`}
            >
              <td className="px-3 py-1.5 truncate max-w-[300px]">
                {e.isDirectory ? '📁' : EXT_ICON[e.ext] ?? '📄'}{' '}
                {renamingPath === e.path ? (
                  <RenameInline
                    initialName={e.name}
                    onSubmit={(newName) => onRenameSubmit(e, newName)}
                    onCancel={onRenameCancel}
                  />
                ) : (
                  e.name
                )}
              </td>
              <td className="px-3 py-1.5 text-right">{e.isDirectory ? '--' : formatBytes(e.size)}</td>
              <td className="px-3 py-1.5">{formatRelativeTime(e.modifiedAt, lang)}</td>
              <td className="px-3 py-1.5">{
                e.isDirectory
                  ? t('files.type.folder')
                  : EXT_TYPE[e.ext]
                    ? t(`files.type.${EXT_TYPE[e.ext]}`)
                    : t('files.type.unknown', { ext: e.ext.slice(1).toUpperCase() })
              }</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div onClick={clearSelection} onContextMenu={onContextEmpty} className="h-full min-h-[80px]" />
    </div>
  )
}

function SortHeader({
  col, current, onClick, label, align = 'left',
}: { col: SortColumn; current: { column: SortColumn; dir: 'asc' | 'desc' }; onClick: (c: SortColumn) => void; label: string; align?: 'left' | 'right' }) {
  const indicator = current.column === col ? (current.dir === 'asc' ? ' ▲' : ' ▼') : ''
  return (
    <th className={`px-3 py-2 cursor-pointer select-none text-${align} font-medium`} onClick={() => onClick(col)}>
      {label}{indicator}
    </th>
  )
}
