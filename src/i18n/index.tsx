import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import en from './locales/en'
import zhCN from './locales/zh-CN'
import { lookup, interpolate, type NestedDict } from './lookup'

export type Lang = 'en' | 'zh-CN'
export type LangPref = 'auto' | Lang

type Ctx = {
  lang: Lang
  t: (key: string, vars?: Record<string, string | number>) => string
  setLang: (next: LangPref) => Promise<void>
}

const I18nContext = createContext<Ctx | null>(null)

function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const dict = (lang === 'zh-CN' ? zhCN : en) as unknown as NestedDict
  const enDict = en as unknown as NestedDict
  let v = lookup(dict, key) ?? lookup(enDict, key)
  if (v === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`)
    return key
  }
  return interpolate(v, vars)
}

export function I18nProvider({
  initialLang,
  children,
}: { initialLang: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  useEffect(() => {
    const unsubscribe = window.api.onLangChanged((next) => setLangState(next))
    return unsubscribe
  }, [])

  const ctx: Ctx = {
    lang,
    t: (key, vars) => translate(lang, key, vars),
    setLang: async (next) => {
      const current = await window.api.getSettings()
      await window.api.saveSettings({ ...current, language: next })
      // No optimistic setLangState — wait for the main-process broadcast.
    },
  }

  return <I18nContext.Provider value={ctx}>{children}</I18nContext.Provider>
}

export function useTranslation(): Ctx {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useTranslation must be used inside <I18nProvider>')
  return ctx
}
