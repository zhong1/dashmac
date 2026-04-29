import { useEffect, useState } from 'react'
import { useTranslation } from '../../i18n/index'
import { useFilesStore } from '../../stores/filesStore'
import { useToast } from '../../stores/toastStore'

export default function PathBar() {
  const { t } = useTranslation()
  const toast = useToast()
  const currentPath = useFilesStore((s) => s.currentPath)
  const history = useFilesStore((s) => s.history)
  const showHidden = useFilesStore((s) => s.showHidden)
  const navigate = useFilesStore((s) => s.navigate)
  const goBack = useFilesStore((s) => s.goBack)
  const goForward = useFilesStore((s) => s.goForward)
  const goUp = useFilesStore((s) => s.goUp)
  const refresh = useFilesStore((s) => s.refresh)
  const setShowHidden = useFilesStore((s) => s.setShowHidden)

  const [draft, setDraft] = useState(currentPath)
  const [errorFlash, setErrorFlash] = useState(false)

  useEffect(() => { setDraft(currentPath) }, [currentPath])

  // Initialize hidden setting from persisted settings
  useEffect(() => {
    window.api.getSettings().then((s) => setShowHidden(s.showHiddenFiles ?? false))
  }, [setShowHidden])

  const handleSubmit = async () => {
    const target = draft.trim()
    if (!target) return
    const result = await window.api.listDirectory(target)
    if (result.ok) {
      navigate(target)
    } else {
      setErrorFlash(true)
      setTimeout(() => setErrorFlash(false), 1500)
      toast.error(formatError(result.errno, result.message, t))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit()
    else if (e.key === 'Escape') {
      setDraft(currentPath)
      ;(e.target as HTMLInputElement).blur()
    }
  }

  const toggleHidden = async () => {
    const next = !showHidden
    setShowHidden(next)
    const settings = await window.api.getSettings()
    await window.api.saveSettings({ ...settings, showHiddenFiles: next })
  }

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border-primary bg-bg-secondary text-xs font-mono">
      <button onClick={goBack} disabled={history.back.length === 0}
        className="px-2 py-1 text-text-secondary hover:bg-bg-tertiary disabled:opacity-30 rounded"
        title={t('files.toolbar.back')}>‹</button>
      <button onClick={goForward} disabled={history.forward.length === 0}
        className="px-2 py-1 text-text-secondary hover:bg-bg-tertiary disabled:opacity-30 rounded"
        title={t('files.toolbar.forward')}>›</button>
      <button onClick={goUp} disabled={currentPath === '/'}
        className="px-2 py-1 text-text-secondary hover:bg-bg-tertiary disabled:opacity-30 rounded"
        title={t('files.toolbar.up')}>↑</button>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        className={`flex-1 mx-2 bg-bg-primary border ${errorFlash ? 'border-status-red' : 'border-border-primary'} rounded px-2 py-1 text-text-primary`}
      />
      <button onClick={refresh}
        className="px-2 py-1 text-text-secondary hover:bg-bg-tertiary rounded"
        title={t('files.toolbar.refresh')}>⟳</button>
      <button onClick={toggleHidden}
        className={`px-2 py-1 rounded ${showHidden ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary'}`}
        title={t('files.toolbar.toggleHidden')}>👁</button>
    </div>
  )
}

function formatError(errno: string, message: string, t: (k: string, v?: any) => string): string {
  if (errno === 'ENOENT') return t('files.error.notFound')
  if (errno === 'EACCES' || errno === 'EPERM') return t('files.error.permission')
  if (errno === 'ENOTDIR') return t('files.error.notADirectory')
  return t('files.error.generic', { message })
}
