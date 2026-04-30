import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../types'
import { useTranslation } from '../../i18n/index'
import { TOOLBOX_TOOLS, type ToolboxTool } from './registry'

export default function ToolboxPage() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [openTool, setOpenTool] = useState<ToolboxTool | null>(null)

  useEffect(() => {
    let mounted = true
    window.api.getSettings()
      .then((s) => { if (mounted) setSettings(s) })
      .catch(() => { if (mounted) setSettings(null) })
    return () => { mounted = false }
  }, [])

  if (settings === null) {
    return (
      <div className="text-sm text-text-muted font-mono">
        {t('common.loading')}
      </div>
    )
  }

  const enabled = TOOLBOX_TOOLS.filter((tool) => tool.isEnabled(settings))

  return (
    <>
      {enabled.length === 0 ? (
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-8 text-center">
          <h3 className="text-sm font-medium text-text-primary mb-2">
            {t('toolbox.empty.title')}
          </h3>
          <p className="text-xs text-text-secondary">
            {t('toolbox.empty.hint')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {enabled.map((tool) => (
            <div
              key={tool.id}
              onClick={() => setOpenTool(tool)}
              className="bg-bg-secondary border border-border-primary rounded-lg p-4 hover:bg-bg-tertiary cursor-pointer flex flex-col"
            >
              <span className="text-2xl mb-2">{tool.icon}</span>
              <h3 className="text-sm font-medium text-text-primary">
                {t(tool.titleKey)}
              </h3>
              <p className="text-xs text-text-secondary mt-1 flex-1">
                {t(tool.descKey)}
              </p>
              <div className="flex justify-end mt-3">
                <span className="text-xs px-3 py-1.5 bg-status-blue text-white rounded">
                  {t('toolbox.open')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {openTool && <ComingSoonDialog onClose={() => setOpenTool(null)} />}
    </>
  )
}

function ComingSoonDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto bg-bg-secondary text-text-primary border border-border-primary rounded-lg p-6 w-[480px] max-w-[90vw] backdrop:bg-black/40"
    >
      <h3 className="text-sm font-medium mb-2">
        {t('toolbox.comingSoon.title')}
      </h3>
      <p className="text-xs text-text-secondary mb-4">
        {t('toolbox.comingSoon.body')}
      </p>
      <div className="flex justify-end">
        <button
          onClick={() => ref.current?.close()}
          className="text-xs px-3 py-1.5 border border-border-primary rounded hover:bg-bg-tertiary"
        >
          {t('toolbox.comingSoon.close')}
        </button>
      </div>
    </dialog>
  )
}
