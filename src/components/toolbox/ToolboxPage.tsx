import { useEffect, useState } from 'react'
import type { AppSettings } from '../../types'
import { useTranslation } from '../../i18n/index'
import { TOOLBOX_TOOLS } from './registry'

export default function ToolboxPage() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    let mounted = true
    window.api.getSettings()
      .then((s) => { if (mounted) setSettings(s) })
      .catch(() => { if (mounted) setSettings(null) })
    return () => { mounted = false }
  }, [])

  if (settings === null) {
    return <div className="text-sm text-text-muted font-mono">{t('common.loading')}</div>
  }

  const enabled = TOOLBOX_TOOLS.filter((tool) => tool.isEnabled(settings))

  if (enabled.length === 0) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-8 text-center">
        <h3 className="text-sm font-medium text-text-primary mb-2">{t('toolbox.empty.title')}</h3>
        <p className="text-xs text-text-secondary">{t('toolbox.empty.hint')}</p>
      </div>
    )
  }

  function handleCardClick(toolId: string) {
    if (toolId === 'screenshot') {
      window.api.triggerScreenshotCapture()
    }
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {enabled.map((tool) => (
        <div
          key={tool.id}
          onClick={() => handleCardClick(tool.id)}
          className="bg-bg-secondary border border-border-primary rounded-lg p-4 hover:bg-bg-tertiary cursor-pointer flex flex-col"
        >
          <span className="text-2xl mb-2">{tool.icon}</span>
          <h3 className="text-sm font-medium text-text-primary">{t(tool.titleKey)}</h3>
          <p className="text-xs text-text-secondary mt-1 flex-1">{t(tool.descKey)}</p>
          <div className="flex justify-end mt-3">
            <span className="text-xs px-3 py-1.5 bg-status-blue text-white rounded">{t('toolbox.open')}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
