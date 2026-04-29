import { useState, useEffect } from 'react'
import type { AppSettings, CustomCommand } from '../../types'
import { useTranslation } from '../../i18n/index'

const DEFAULTS: AppSettings = {
  realtimeInterval: 2000, historyInterval: 60000, retentionDays: 90,
  trayDisplayMetric: 'memory', launchAtLogin: false,
  language: 'auto', resolvedLanguage: 'en',
  fileShortcuts: [], showHiddenFiles: false,
  customCommands: [],
}

export default function Settings() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { window.api.getSettings().then(setSettings) }, [])

  const handleSave = async () => {
    setSaving(true)
    await window.api.saveSettings(settings)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleLanguageChange = async (next: AppSettings['language']) => {
    const updated = { ...settings, language: next }
    setSettings(updated)
    await window.api.saveSettings(updated)
  }

  const handleExport = async (format: 'csv' | 'json') => {
    const result = await window.api.exportData(format, 'all')
    if (result) window.api.revealFile(result)
  }

  return (
    <div className="max-w-xl space-y-6">
      <Section title={t('settings.sections.dataCollection')}>
        <Field label={t('settings.fields.realtimeInterval')}>
          <select value={settings.realtimeInterval} onChange={(e) => setSettings({ ...settings, realtimeInterval: Number(e.target.value) })}
            className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm font-mono text-text-primary">
            <option value={1000}>{t('settings.options.sec1')}</option>
            <option value={2000}>{t('settings.options.sec2')}</option>
            <option value={5000}>{t('settings.options.sec5')}</option>
          </select>
        </Field>
        <Field label={t('settings.fields.historyInterval')}>
          <select value={settings.historyInterval} onChange={(e) => setSettings({ ...settings, historyInterval: Number(e.target.value) })}
            className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm font-mono text-text-primary">
            <option value={30000}>{t('settings.options.sec30')}</option>
            <option value={60000}>{t('settings.options.sec60')}</option>
            <option value={300000}>{t('settings.options.min5')}</option>
          </select>
        </Field>
      </Section>

      <Section title={t('settings.sections.menuBar')}>
        <Field label={t('settings.fields.displayMetric')}>
          <select value={settings.trayDisplayMetric} onChange={(e) => setSettings({ ...settings, trayDisplayMetric: e.target.value as AppSettings['trayDisplayMetric'] })}
            className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm font-mono text-text-primary">
            <option value="memory">{t('settings.options.memoryPct')}</option>
            <option value="cpu">{t('settings.options.cpuPct')}</option>
            <option value="network">{t('settings.options.networkSpeed')}</option>
            <option value="none">{t('settings.options.iconOnly')}</option>
          </select>
        </Field>
      </Section>

      <Section title={t('settings.sections.storage')}>
        <Field label={t('settings.fields.retention')}>
          <select value={settings.retentionDays} onChange={(e) => setSettings({ ...settings, retentionDays: Number(e.target.value) })}
            className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm font-mono text-text-primary">
            <option value={30}>{t('settings.options.day30')}</option>
            <option value={60}>{t('settings.options.day60')}</option>
            <option value={90}>{t('settings.options.day90')}</option>
            <option value={180}>{t('settings.options.day180')}</option>
          </select>
        </Field>
      </Section>

      <Section title={t('settings.sections.system')}>
        <Field label={t('settings.fields.launchAtLogin')}>
          <button onClick={() => setSettings({ ...settings, launchAtLogin: !settings.launchAtLogin })}
            className={`w-10 h-5 rounded-full transition-colors ${settings.launchAtLogin ? 'bg-status-blue' : 'bg-border-primary'}`}>
            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings.launchAtLogin ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </Field>
      </Section>

      <Section title={t('settings.sections.appearance')}>
        <Field label={t('settings.fields.language')}>
          <select value={settings.language} onChange={(e) => handleLanguageChange(e.target.value as AppSettings['language'])}
            className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm font-mono text-text-primary">
            <option value="auto">{t('settings.language.auto')}</option>
            <option value="en">{t('settings.language.en')}</option>
            <option value="zh-CN">{t('settings.language.zhCN')}</option>
          </select>
        </Field>
      </Section>

      <Section title={t('settings.customCommands.title')}>
        <p className="text-xs text-text-secondary mb-3">{t('settings.customCommands.description')}</p>
        <CustomCommandsEditor
          commands={settings.customCommands}
          onChange={async (next) => {
            const updated = { ...settings, customCommands: next }
            setSettings(updated)
            await window.api.saveSettings(updated)
          }}
        />
      </Section>

      <Section title={t('settings.sections.export')}>
        <div className="flex gap-2">
          <button onClick={() => handleExport('csv')}
            className="px-3 py-1.5 text-xs font-mono bg-bg-primary border border-border-primary rounded hover:bg-bg-tertiary text-text-primary">{t('settings.export.csv')}</button>
          <button onClick={() => handleExport('json')}
            className="px-3 py-1.5 text-xs font-mono bg-bg-primary border border-border-primary rounded hover:bg-bg-tertiary text-text-primary">{t('settings.export.json')}</button>
        </div>
      </Section>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 text-sm font-mono bg-status-blue text-white rounded hover:opacity-90 disabled:opacity-50">
          {saving ? t('settings.saving') : t('settings.save')}
        </button>
        {saved && <span className="text-xs text-status-green font-mono">{t('settings.saved')}</span>}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
      <h3 className="text-sm font-medium text-text-primary mb-4">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-secondary">{label}</span>
      {children}
    </div>
  )
}

function CustomCommandsEditor({
  commands,
  onChange,
}: {
  commands: CustomCommand[]
  onChange: (next: CustomCommand[]) => void
}) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const handleAdd = (label: string, command: string, pathMode: 'absolute' | 'basename', useShell: boolean) => {
    const id = (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    onChange([...commands, { id, label, command, pathMode, useShell }])
    setAdding(false)
  }
  const handleEdit = (id: string, label: string, command: string, pathMode: 'absolute' | 'basename', useShell: boolean) => {
    onChange(commands.map((c) => (c.id === id ? { ...c, label, command, pathMode, useShell } : c)))
    setEditingId(null)
  }
  const handleDelete = (id: string) => {
    onChange(commands.filter((c) => c.id !== id))
    if (editingId === id) setEditingId(null)
  }

  return (
    <div className="space-y-2">
      {commands.length === 0 && !adding && (
        <div className="text-xs text-text-secondary italic">{t('settings.customCommands.empty')}</div>
      )}
      {commands.map((c) =>
        editingId === c.id ? (
          <CommandForm
            key={c.id}
            initial={c}
            onSave={(label, command, pathMode, useShell) => handleEdit(c.id, label, command, pathMode, useShell)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div key={c.id} className="flex items-center justify-between bg-bg-primary border border-border-primary rounded px-3 py-2">
            <div className="flex flex-col min-w-0">
              <span className="text-sm text-text-primary truncate">{c.label}</span>
              <span className="text-xs font-mono text-text-secondary truncate">{c.command}</span>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setEditingId(c.id)}
                className="text-xs px-2 py-1 border border-border-primary rounded hover:bg-bg-tertiary text-text-primary"
              >{t('settings.customCommands.edit')}</button>
              <button
                onClick={() => handleDelete(c.id)}
                className="text-xs px-2 py-1 border border-border-primary rounded hover:bg-bg-tertiary text-status-red"
              >{t('settings.customCommands.delete')}</button>
            </div>
          </div>
        ),
      )}
      {adding ? (
        <CommandForm onSave={handleAdd} onCancel={() => setAdding(false)} />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs px-3 py-1.5 border border-border-primary rounded hover:bg-bg-tertiary text-text-primary"
        >+ {t('settings.customCommands.add')}</button>
      )}
    </div>
  )
}

function CommandForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: CustomCommand
  onSave: (label: string, command: string, pathMode: 'absolute' | 'basename', useShell: boolean) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [label, setLabel] = useState(initial?.label ?? '')
  const [command, setCommand] = useState(initial?.command ?? '')
  const [pathMode, setPathMode] = useState<'absolute' | 'basename'>(initial?.pathMode ?? 'absolute')
  const [useShell, setUseShell] = useState<boolean>(initial?.useShell ?? false)

  const labelTrim = label.trim()
  const cmdTrim = command.trim()
  const empty = labelTrim.length === 0 || cmdTrim.length === 0

  // Skip the unclosed-quote check when useShell is on — the shell parses it.
  let parseError: string | null = null
  if (!empty && !useShell) {
    try {
      // Renderer-side mirror of the unclosed-quote check from electron/services/shlex.ts.
      // We can't import from electron/services in renderer code, so duplicate the
      // critical "unclosed quote" detection inline.
      let inDouble = false, inSingle = false
      for (let i = 0; i < command.length; i++) {
        const ch = command[i]
        if (inDouble) {
          if (ch === '\\' && i + 1 < command.length) { i++; continue }
          if (ch === '"') inDouble = false
        } else if (inSingle) {
          if (ch === "'") inSingle = false
        } else {
          if (ch === '"') inDouble = true
          else if (ch === "'") inSingle = true
        }
      }
      if (inDouble || inSingle) throw new Error('unclosed quote')
    } catch {
      parseError = t('settings.customCommands.errorParse')
    }
  }

  const disabled = empty || parseError !== null

  return (
    <div className="bg-bg-primary border border-border-primary rounded p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary w-16">{t('settings.customCommands.label')}</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('settings.customCommands.labelPlaceholder')}
          className="flex-1 bg-bg-secondary border border-border-primary rounded px-2 py-1 text-sm text-text-primary"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary w-16">{t('settings.customCommands.command')}</span>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={t('settings.customCommands.commandPlaceholder')}
          className="flex-1 bg-bg-secondary border border-border-primary rounded px-2 py-1 text-sm font-mono text-text-primary"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary w-16">{t('settings.customCommands.pathMode')}</span>
        <select
          value={pathMode}
          onChange={(e) => setPathMode(e.target.value as 'absolute' | 'basename')}
          className="bg-bg-secondary border border-border-primary rounded px-2 py-1 text-sm text-text-primary"
        >
          <option value="absolute">{t('settings.customCommands.pathModeAbsolute')}</option>
          <option value="basename">{t('settings.customCommands.pathModeBasename')}</option>
        </select>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={useShell}
          onChange={(e) => setUseShell(e.target.checked)}
          className="accent-status-blue"
        />
        <span className="text-xs text-text-secondary">{t('settings.customCommands.useShell')}</span>
      </label>
      {empty && (
        <div className="text-xs text-status-red">{t('settings.customCommands.errorEmpty')}</div>
      )}
      {parseError && (
        <div className="text-xs text-status-red">{parseError}</div>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => onSave(labelTrim, cmdTrim, pathMode, useShell)}
          disabled={disabled}
          className="text-xs px-3 py-1.5 bg-status-blue text-white rounded disabled:opacity-50"
        >{t('settings.customCommands.save')}</button>
        <button
          onClick={onCancel}
          className="text-xs px-3 py-1.5 border border-border-primary rounded hover:bg-bg-tertiary text-text-primary"
        >{t('settings.customCommands.cancel')}</button>
      </div>
    </div>
  )
}
