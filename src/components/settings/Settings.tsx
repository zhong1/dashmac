import { useState, useEffect } from 'react'
import type { AppSettings } from '../../types'

const DEFAULTS: AppSettings = {
  realtimeInterval: 2000, historyInterval: 60000, retentionDays: 90,
  trayDisplayMetric: 'memory', launchAtLogin: false,
}

export default function Settings() {
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

  const handleExport = async (format: 'csv' | 'json') => {
    const result = await window.api.exportData(format, 'all')
    if (result) window.api.revealFile(result)
  }

  return (
    <div className="max-w-xl space-y-6">
      <Section title="Data Collection">
        <Field label="Real-time interval">
          <select value={settings.realtimeInterval} onChange={(e) => setSettings({ ...settings, realtimeInterval: Number(e.target.value) })}
            className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm font-mono text-text-primary">
            <option value={1000}>1 second</option>
            <option value={2000}>2 seconds</option>
            <option value={5000}>5 seconds</option>
          </select>
        </Field>
        <Field label="History write interval">
          <select value={settings.historyInterval} onChange={(e) => setSettings({ ...settings, historyInterval: Number(e.target.value) })}
            className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm font-mono text-text-primary">
            <option value={30000}>30 seconds</option>
            <option value={60000}>60 seconds</option>
            <option value={300000}>5 minutes</option>
          </select>
        </Field>
      </Section>

      <Section title="Menu Bar">
        <Field label="Display metric">
          <select value={settings.trayDisplayMetric} onChange={(e) => setSettings({ ...settings, trayDisplayMetric: e.target.value as any })}
            className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm font-mono text-text-primary">
            <option value="memory">Memory %</option>
            <option value="cpu">CPU %</option>
            <option value="network">Network speed</option>
            <option value="none">Icon only</option>
          </select>
        </Field>
      </Section>

      <Section title="Storage">
        <Field label="Keep history for">
          <select value={settings.retentionDays} onChange={(e) => setSettings({ ...settings, retentionDays: Number(e.target.value) })}
            className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm font-mono text-text-primary">
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
          </select>
        </Field>
      </Section>

      <Section title="System">
        <Field label="Launch at login">
          <button onClick={() => setSettings({ ...settings, launchAtLogin: !settings.launchAtLogin })}
            className={`w-10 h-5 rounded-full transition-colors ${settings.launchAtLogin ? 'bg-status-blue' : 'bg-border-primary'}`}>
            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings.launchAtLogin ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </Field>
      </Section>

      <Section title="Export Data">
        <div className="flex gap-2">
          <button onClick={() => handleExport('csv')}
            className="px-3 py-1.5 text-xs font-mono bg-bg-primary border border-border-primary rounded hover:bg-bg-tertiary text-text-primary">Export CSV</button>
          <button onClick={() => handleExport('json')}
            className="px-3 py-1.5 text-xs font-mono bg-bg-primary border border-border-primary rounded hover:bg-bg-tertiary text-text-primary">Export JSON</button>
        </div>
      </Section>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 text-sm font-mono bg-status-blue text-white rounded hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {saved && <span className="text-xs text-status-green font-mono">Saved!</span>}
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
