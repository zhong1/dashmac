import en from './locales/en'
import zhCN from './locales/zh-CN'
import { lookup, interpolate } from '../../src/i18n/lookup'
import type { NestedDict } from '../../src/i18n/lookup'

export type Lang = 'en' | 'zh-CN'
export type LangPref = 'auto' | Lang

let currentLang: Lang = 'en'

export function setLang(lang: Lang): void {
  currentLang = lang
}

export function getLang(): Lang {
  return currentLang
}

export function resolveLang(pref: LangPref, systemLocale: string): Lang {
  if (pref !== 'auto') return pref
  return systemLocale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = (currentLang === 'zh-CN' ? zhCN : en) as unknown as NestedDict
  const enDict = en as unknown as NestedDict
  const v = lookup(dict, key) ?? lookup(enDict, key) ?? key
  return interpolate(v, vars)
}
