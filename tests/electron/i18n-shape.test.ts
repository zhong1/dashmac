import { describe, expect, test } from 'vitest'
import rendererEn from '../../src/i18n/locales/en'
import rendererZh from '../../src/i18n/locales/zh-CN'
import mainEn from '../../electron/i18n/locales/en'
import mainZh from '../../electron/i18n/locales/zh-CN'

type Dict = { [k: string]: string | Dict }

function collectKeys(obj: Dict, prefix = ''): string[] {
  const keys: string[] = []
  for (const k of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${k}` : k
    const v = obj[k]
    if (typeof v === 'string') {
      keys.push(full)
    } else {
      keys.push(...collectKeys(v as Dict, full))
    }
  }
  return keys.sort()
}

describe('dictionary shape parity', () => {
  test('renderer en and zh-CN have identical key sets', () => {
    expect(collectKeys(rendererZh as Dict)).toEqual(collectKeys(rendererEn as Dict))
  })

  test('main en and zh-CN have identical key sets', () => {
    expect(collectKeys(mainZh as Dict)).toEqual(collectKeys(mainEn as Dict))
  })
})
