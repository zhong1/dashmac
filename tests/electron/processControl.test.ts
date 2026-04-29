import { describe, expect, test, vi, afterEach } from 'vitest'
import { killProcess } from '../../electron/services/processControl'

afterEach(() => vi.restoreAllMocks())

describe('killProcess', () => {
  test('returns ok=true on successful kill and forwards args correctly', () => {
    const spy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    expect(killProcess(12345, 'SIGTERM')).toEqual({ ok: true })
    expect(spy).toHaveBeenCalledWith(12345, 'SIGTERM')
  })

  test('SIGKILL is forwarded as the second arg', () => {
    const spy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    killProcess(99, 'SIGKILL')
    expect(spy).toHaveBeenCalledWith(99, 'SIGKILL')
  })

  test('returns errno=EPERM with message when kill throws EPERM', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('Operation not permitted') as NodeJS.ErrnoException
      err.code = 'EPERM'
      throw err
    })
    const r = killProcess(1, 'SIGTERM')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errno).toBe('EPERM')
      expect(r.message).toBe('Operation not permitted')
    }
  })

  test('returns errno=ESRCH for missing process', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('No such process') as NodeJS.ErrnoException
      err.code = 'ESRCH'
      throw err
    })
    const r = killProcess(999999, 'SIGTERM')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errno).toBe('ESRCH')
  })

  test('returns errno=EUNKNOWN for non-Error throws', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => { throw 'weird' })
    const r = killProcess(1, 'SIGTERM')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errno).toBe('EUNKNOWN')
  })
})
