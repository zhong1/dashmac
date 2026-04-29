import { useEffect, useState } from 'react'
import { useTranslation } from '../../i18n/index'
import { useFilesStore } from '../../stores/filesStore'
import { useToast } from '../../stores/toastStore'

export default function FileSidebar() {
  const { t } = useTranslation()
  const toast = useToast()
  const currentPath = useFilesStore((s) => s.currentPath)
  const navigate = useFilesStore((s) => s.navigate)
  const [shortcuts, setShortcuts] = useState<string[]>([])

  useEffect(() => {
    window.api.getSettings().then((s) => setShortcuts(s.fileShortcuts ?? []))
  }, [])

  const removeShortcut = async (p: string) => {
    const settings = await window.api.getSettings()
    const next = (settings.fileShortcuts ?? []).filter((s) => s !== p)
    await window.api.saveSettings({ ...settings, fileShortcuts: next })
    setShortcuts(next)
  }

  const addCurrent = async () => {
    const settings = await window.api.getSettings()
    if ((settings.fileShortcuts ?? []).includes(currentPath)) {
      toast.info(t('files.toast.shortcutExists'))
      return
    }
    const next = [...(settings.fileShortcuts ?? []), currentPath]
    await window.api.saveSettings({ ...settings, fileShortcuts: next })
    setShortcuts(next)
    toast.success(t('files.toast.addedShortcut'))
  }

  const handleClickShortcut = async (p: string) => {
    const r = await window.api.listDirectory(p)
    if (r.ok) {
      navigate(p)
    } else if (r.errno === 'ENOENT') {
      removeShortcut(p)
      toast.error(t('files.toast.shortcutRemovedDeleted'))
    } else {
      navigate(p)  // let navigate set the error overlay
    }
  }

  const addDisabled = currentPath === '/' || shortcuts.includes(currentPath)

  return (
    <aside className="w-48 h-full bg-bg-secondary border-r border-border-primary flex flex-col text-xs font-mono">
      <div className="px-3 py-2 text-text-muted uppercase tracking-wider">{t('files.sidebar.shortcuts')}</div>
      <div className="flex-1 overflow-y-auto">
        {shortcuts.map((p) => (
          <button
            key={p}
            onClick={() => handleClickShortcut(p)}
            onContextMenu={(e) => { e.preventDefault(); removeShortcut(p) }}
            className={`block w-full text-left px-3 py-1.5 hover:bg-bg-tertiary truncate ${
              currentPath === p ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary'
            }`}
            title={p}
          >
            📁 {p.split('/').pop() || p}
          </button>
        ))}
        <div className="border-t border-border-secondary my-2" />
        <div className="px-3 py-1 text-text-muted uppercase tracking-wider">{t('files.sidebar.system')}</div>
        <button
          onClick={() => handleClickShortcut('/')}
          className={`block w-full text-left px-3 py-1.5 hover:bg-bg-tertiary ${
            currentPath === '/' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary'
          }`}
        >
          / {t('files.sidebar.root')}
        </button>
        <button
          onClick={() => handleClickShortcut('~')}
          className="block w-full text-left px-3 py-1.5 hover:bg-bg-tertiary text-text-secondary"
        >
          ~ {t('files.sidebar.home')}
        </button>
      </div>
      <button
        onClick={addCurrent}
        disabled={addDisabled}
        title={addDisabled ? t('files.sidebar.addDisabled') : t('files.sidebar.add')}
        className="px-3 py-2 border-t border-border-primary text-text-secondary hover:bg-bg-tertiary disabled:opacity-50 disabled:hover:bg-transparent"
      >
        + {t('files.sidebar.add')}
      </button>
    </aside>
  )
}
