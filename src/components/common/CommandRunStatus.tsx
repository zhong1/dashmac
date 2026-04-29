import { useEffect, useRef, useState } from 'react'
import { useCommandRunStore, type FailureEntry } from '../../stores/commandRunStore'
import { useToast } from '../../stores/toastStore'
import { useTranslation } from '../../i18n/index'

export default function CommandRunStatus() {
  const { t } = useTranslation()
  const runs = useCommandRunStore((s) => s.runs)
  const lastFinished = useCommandRunStore((s) => s.lastFinished)
  const consumeLastFinished = useCommandRunStore((s) => s.consumeLastFinished)
  const toast = useToast()
  const [details, setDetails] = useState<{ title: string; failures: FailureEntry[] } | null>(null)

  // Fire toast when a run finishes; success/warning depending on failures.
  // Show the dialog inline by setting `details` from the toast action — but
  // toasts here are simple and don't support rich actions. Instead we put a
  // tiny inline banner-style "view details" button when there are failures.
  useEffect(() => {
    if (!lastFinished) return
    const f = lastFinished
    const ok = f.total - f.failures.length
    if (f.failures.length === 0) {
      toast.success(
        f.total === 1
          ? t('commandRun.successOne', { label: f.commandLabel })
          : t('commandRun.successMany', { label: f.commandLabel, total: f.total }),
      )
    } else if (ok === 0) {
      toast.error(t('commandRun.allFailed', { label: f.commandLabel, total: f.total }))
      // Auto-open details when everything failed so the user sees why.
      setDetails({ title: f.commandLabel, failures: f.failures })
    } else {
      toast.error(t('commandRun.someFailed', { label: f.commandLabel, ok, fail: f.failures.length }))
      setDetails({ title: f.commandLabel, failures: f.failures })
    }
    consumeLastFinished()
  }, [lastFinished, consumeLastFinished, toast, t])

  return (
    <>
      {runs.length > 0 && (
        <div className="fixed bottom-16 right-4 flex flex-col gap-1 z-40 pointer-events-none">
          {runs.map((r) => (
            <div
              key={r.runId}
              className="bg-bg-secondary border border-border-primary rounded px-3 py-1.5 text-xs font-mono text-text-primary shadow"
            >
              {t('commandRun.running', {
                label: r.commandLabel,
                done: r.done,
                total: r.total,
                current: r.current ?? '',
              })}
            </div>
          ))}
        </div>
      )}
      {details && (
        <FailureDialog
          title={details.title}
          failures={details.failures}
          onClose={() => setDetails(null)}
        />
      )}
    </>
  )
}

function FailureDialog({
  title,
  failures,
  onClose,
}: {
  title: string
  failures: FailureEntry[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])

  const formatMessage = (m: string): string => {
    if (m.startsWith('notFound:')) {
      return t('commandRun.notFound', { cmd: m.slice('notFound:'.length) })
    }
    if (m.startsWith('parseError:')) {
      return t('commandRun.parseError', { cmd: m.slice('parseError:'.length) })
    }
    if (m.startsWith('exitCode:')) {
      return t('commandRun.exitCode', { code: m.slice('exitCode:'.length) })
    }
    if (m.startsWith('spawnError:')) {
      return t('commandRun.spawnError', { msg: m.slice('spawnError:'.length) })
    }
    return m
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="bg-bg-secondary text-text-primary border border-border-primary rounded-lg p-4 w-[640px] max-w-[90vw] backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">
          {t('commandRun.detailsTitle')} — {title}
        </h3>
        <button
          onClick={() => ref.current?.close()}
          className="text-xs px-2 py-1 border border-border-primary rounded hover:bg-bg-tertiary"
        >{t('commandRun.detailsClose')}</button>
      </div>
      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {failures.map((f, i) => (
          <div key={i} className="bg-bg-primary border border-border-primary rounded p-2">
            <div className="text-xs font-mono text-text-primary truncate" title={f.path}>{f.path}</div>
            <div className="text-xs text-status-red mt-1">{formatMessage(f.message)}</div>
            {f.stderr && (
              <pre className="text-[10px] font-mono text-text-secondary mt-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                {f.stderr.slice(-1024)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </dialog>
  )
}
