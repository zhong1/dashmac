import { useState, useEffect } from 'react'
import type { AppSettings } from '../../types'
import { useTranslation } from '../../i18n/index'

const DEFAULTS: AppSettings = {
  realtimeInterval: 2000, historyInterval: 60000, retentionDays: 90,
  trayDisplayMetric: 'memory', launchAtLogin: false,
  language: 'auto', resolvedLanguage: 'en',
  fileShortcuts: [], showHiddenFiles: false,
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
