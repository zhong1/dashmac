import { describe, expect, test } from 'vitest'
import { formatRelativeTime } from '../../src/i18n/time'

const NOW = new Date('2026-04-28T15:00:00').getTime()

describe('formatRelativeTime (en)', () => {
  test('30 seconds ago → "just now"', () => {
    expect(formatRelativeTime(NOW - 30_000, 'en', NOW)).toBe('just now')
  })

  test('5 minutes ago → "5 min ago"', () => {
    expect(formatRelativeTime(NOW - 5 * 60_000, 'en', NOW)).toBe('5 min ago')
  })

  test('90 minutes ago → "1 hour ago"', () => {
    expect(formatRelativeTime(NOW - 90 * 60_000, 'en', NOW)).toBe('1 hour ago')
  })

  test('same calendar day, 6 hours ago → "Today HH:mm"', () => {
    expect(formatRelativeTime(NOW - 6 * 60 * 60_000, 'en', NOW)).toBe('Today 09:00')
  })

  test('yesterday → "Yesterday HH:mm"', () => {
    const yesterday = new Date('2026-04-27T14:30:00').getTime()
    expect(formatRelativeTime(yesterday, 'en', NOW)).toBe('Yesterday 14:30')
  })

  test('5 days ago → "5 days ago"', () => {
    expect(formatRelativeTime(NOW - 5 * 24 * 60 * 60_000, 'en', NOW)).toBe('5 days ago')
  })

  test('30 days ago → absolute YYYY-MM-DD', () => {
    const old = new Date('2026-03-29T10:00:00').getTime()
    expect(formatRelativeTime(old, 'en', NOW)).toBe('2026-03-29')
  })
})

describe('formatRelativeTime (zh-CN)', () => {
  test('30 seconds ago → "刚刚"', () => {
    expect(formatRelativeTime(NOW - 30_000, 'zh-CN', NOW)).toBe('刚刚')
  })

  test('5 minutes ago → "5 分钟前"', () => {
    expect(formatRelativeTime(NOW - 5 * 60_000, 'zh-CN', NOW)).toBe('5 分钟前')
  })

  test('same day → "今天 HH:mm"', () => {
    expect(formatRelativeTime(NOW - 6 * 60 * 60_000, 'zh-CN', NOW)).toBe('今天 09:00')
  })

  test('yesterday → "昨天 HH:mm"', () => {
    const yesterday = new Date('2026-04-27T14:30:00').getTime()
    expect(formatRelativeTime(yesterday, 'zh-CN', NOW)).toBe('昨天 14:30')
  })

  test('5 days ago → "5 天前"', () => {
    expect(formatRelativeTime(NOW - 5 * 24 * 60 * 60_000, 'zh-CN', NOW)).toBe('5 天前')
  })

  test('30 days ago → YYYY-MM-DD (absolute, not localized)', () => {
    const old = new Date('2026-03-29T10:00:00').getTime()
    expect(formatRelativeTime(old, 'zh-CN', NOW)).toBe('2026-03-29')
  })
})
