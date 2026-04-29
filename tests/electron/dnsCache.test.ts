import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'

vi.mock('dns/promises', () => {
  const mockReverse = vi.fn()
  return {
    default: { reverse: mockReverse },
    reverse: mockReverse,
  }
})

describe('dnsCache', () => {
  let lookup: any
  let _resetCacheForTest: any
  let _setCapForTest: any
  let dns: any

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    dns = await import('dns/promises')
    const module = await import('../../electron/services/dnsCache')
    lookup = module.lookup
    _resetCacheForTest = module._resetCacheForTest
    _setCapForTest = module._setCapForTest
  })

  afterEach(() => { vi.restoreAllMocks() })

  test('first lookup calls dns.reverse; second returns from cache', async () => {
    vi.mocked(dns.reverse).mockResolvedValueOnce(['example.com'])
    _resetCacheForTest()
    const a = await lookup('1.2.3.4')
    const b = await lookup('1.2.3.4')
    expect(a).toBe('example.com')
    expect(b).toBe('example.com')
    expect(dns.reverse).toHaveBeenCalledTimes(1)
  })

  test('failure caches null; second call does not retry', async () => {
    vi.mocked(dns.reverse).mockRejectedValueOnce(new Error('NXDOMAIN'))
    _resetCacheForTest()
    const a = await lookup('5.6.7.8')
    const b = await lookup('5.6.7.8')
    expect(a).toBeNull()
    expect(b).toBeNull()
    expect(dns.reverse).toHaveBeenCalledTimes(1)
  })

  test('LRU at capacity evicts oldest', async () => {
    vi.mocked(dns.reverse)
      .mockResolvedValueOnce(['a.com'])
      .mockResolvedValueOnce(['b.com'])
      .mockResolvedValueOnce(['c.com'])
      .mockResolvedValueOnce(['d.com'])
      .mockResolvedValueOnce(['a.com'])  // re-fetch evicted
    _resetCacheForTest()
    _setCapForTest(3)
    await lookup('1.1.1.1')  // a.com
    await lookup('2.2.2.2')  // b.com
    await lookup('3.3.3.3')  // c.com
    await lookup('4.4.4.4')  // d.com — evicts 1.1.1.1
    await lookup('1.1.1.1')  // not in cache — re-fetched
    expect(dns.reverse).toHaveBeenCalledTimes(5)
  })

  test('concurrent lookups for same IP share one in-flight promise', async () => {
    let resolveFirst: (v: string[]) => void
    const promise = new Promise<string[]>((r) => { resolveFirst = r })
    vi.mocked(dns.reverse).mockReturnValueOnce(promise)
    _resetCacheForTest()
    const [a, b] = [lookup('9.9.9.9'), lookup('9.9.9.9')]
    resolveFirst!(['shared.example.com'])
    expect(await a).toBe('shared.example.com')
    expect(await b).toBe('shared.example.com')
    expect(dns.reverse).toHaveBeenCalledTimes(1)
  })
})
