import { afterEach, describe, expect, test } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { loadSettings, saveSettings, DEFAULTS } from '../../electron/services/settingsStore'

function tmpFile(): string {
  return path.join(os.tmpdir(), `dashmac-settings-test-${Date.now()}-${Math.random()}.json`)
}

describe('settingsStore', () => {
  const created: string[] = []
  afterEach(() => {
    for (const f of created) {
      try { fs.unlinkSync(f) } catch {}
    }
    created.length = 0
  })

  test('returns DEFAULTS when file does not exist', () => {
    const f = tmpFile()
    created.push(f)
    expect(loadSettings(f)).toEqual(DEFAULTS)
  })

  test('returns DEFAULTS with language set to auto', () => {
    expect(DEFAULTS.language).toBe('auto')
  })

  test('round-trip: save then load returns the same persisted fields', () => {
    const f = tmpFile()
    created.push(f)
    const next = {
      ...DEFAULTS,
      language: 'zh-CN' as const,
      retentionDays: 60,
    }
    saveSettings(next, f)
    expect(loadSettings(f)).toEqual(next)
  })

  test('save strips resolvedLanguage before writing (it is derived)', () => {
    const f = tmpFile()
    created.push(f)
    saveSettings({ ...DEFAULTS, resolvedLanguage: 'zh-CN' }, f)
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'))
    expect(raw.resolvedLanguage).toBeUndefined()
  })

  test('load returns DEFAULTS on corrupt JSON without throwing', () => {
    const f = tmpFile()
    created.push(f)
    fs.writeFileSync(f, 'not valid json {{{', 'utf8')
    expect(loadSettings(f)).toEqual(DEFAULTS)
  })

  test('load merges DEFAULTS for missing fields (forward compatibility)', () => {
    const f = tmpFile()
    created.push(f)
    fs.writeFileSync(f, JSON.stringify({ retentionDays: 30 }), 'utf8')
    const result = loadSettings(f)
    expect(result.retentionDays).toBe(30)
    expect(result.language).toBe(DEFAULTS.language)
  })

  test('DEFAULTS includes empty fileShortcuts and showHiddenFiles=false', () => {
    expect(DEFAULTS.fileShortcuts).toEqual([])
    expect(DEFAULTS.showHiddenFiles).toBe(false)
  })

  test('round-trip preserves fileShortcuts', () => {
    const f = tmpFile()
    created.push(f)
    const next = { ...DEFAULTS, fileShortcuts: ['/Users/foo', '/Users/bar'] }
    saveSettings(next, f)
    expect(loadSettings(f)).toEqual(next)
  })
})
