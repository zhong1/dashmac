import { beforeEach, describe, expect, test } from 'vitest'
import { resolveLang, t, setLang, getLang } from '../../electron/i18n/index'

describe('resolveLang', () => {
  test('returns en when pref is en regardless of system locale', () => {
    expect(resolveLang('en', 'zh-CN')).toBe('en')
  })

  test('returns zh-CN when pref is zh-CN regardless of system locale', () => {
    expect(resolveLang('zh-CN', 'en-US')).toBe('zh-CN')
  })

  test('auto + en-US system locale resolves to en', () => {
    expect(resolveLang('auto', 'en-US')).toBe('en')
  })

  test('auto + zh-CN system locale resolves to zh-CN', () => {
    expect(resolveLang('auto', 'zh-CN')).toBe('zh-CN')
  })

  test('auto + zh-Hans system locale resolves to zh-CN (prefix match)', () => {
    expect(resolveLang('auto', 'zh-Hans')).toBe('zh-CN')
  })

  test('auto + zh-TW system locale resolves to zh-CN (v1 simplified-only)', () => {
    expect(resolveLang('auto', 'zh-TW')).toBe('zh-CN')
  })

  test('auto + ja-JP system locale resolves to en (default for non-zh)', () => {
    expect(resolveLang('auto', 'ja-JP')).toBe('en')
  })

  test('auto + uppercase ZH-CN resolves to zh-CN (case-insensitive)', () => {
    expect(resolveLang('auto', 'ZH-CN')).toBe('zh-CN')
  })
})

describe('t and setLang', () => {
  beforeEach(() => {
    setLang('en')
  })

  test('default lang returns English', () => {
    expect(getLang()).toBe('en')
    expect(t('tray.open')).toBe('Open DashMac')
  })

  test('setLang switches active dictionary', () => {
    setLang('zh-CN')
    expect(getLang()).toBe('zh-CN')
    expect(t('tray.open')).toBe('打开 DashMac')
  })

  test('returns key string when lookup misses', () => {
    expect(t('non.existent.key')).toBe('non.existent.key')
  })

  test('keys identical in both langs return the same value (sanity)', () => {
    setLang('zh-CN')
    // 'tray.tooltip' is 'DashMac' in both dictionaries by design.
    expect(t('tray.tooltip')).toBe('DashMac')
  })
})
