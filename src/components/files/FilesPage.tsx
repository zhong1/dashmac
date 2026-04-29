import { useEffect, useState } from 'react'
import type { DirEntry } from '../../types'
import { useTranslation } from '../../i18n/index'
import { useFilesStore } from '../../stores/filesStore'
import { useToast } from '../../stores/toastStore'
import FileSidebar from './FileSidebar'
import PathBar from './PathBar'
import FileList from './FileList'
import ContextMenu, { type MenuItem } from './ContextMenu'

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
  const [menu, setMenu] = useState<MenuState>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)

  useEffect(() => { navigate('~') }, [navigate])

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
        <FileList
          onContextRow={openRowMenu}
          onContextEmpty={openEmptyMenu}
          renamingPath={renamingPath}
          onRenameSubmit={handleRenameSubmit}
          onRenameCancel={() => setRenamingPath(null)}
        />
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
