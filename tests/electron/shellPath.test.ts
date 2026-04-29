import { describe, expect, test, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'

vi.mock('node:child_process', () => {
  const mockSpawn = vi.fn()
  return { default: { spawn: mockSpawn }, spawn: mockSpawn }
})

import { spawn } from 'node:child_process'
import { initShellPath, getShellPath, _resetForTest } from '../../electron/services/shellPath'

function makeFakeChild(): any {
  const emitter: any = new EventEmitter()
  emitter.stdout = new Readable({ read() {} })
  emitter.stderr = new Readable({ read() {} })
  emitter.kill = vi.fn()
  return emitter
}

describe('shellPath', () => {
  beforeEach(() => {
    _resetForTest()
    vi.mocked(spawn).mockReset()
  })

  test('getShellPath returns process.env.PATH before init', () => {
    expect(getShellPath()).toBe(process.env.PATH ?? '')
  })

  test('initShellPath resolves with stdout from login shell', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const promise = initShellPath()
    child.stdout.push('/usr/local/bin:/usr/bin:/bin\n')
    child.stdout.push(null)
    child.emit('close', 0)
    await promise
    expect(getShellPath()).toBe('/usr/local/bin:/usr/bin:/bin')
    expect(spawn).toHaveBeenCalledWith('bash', ['-lc', 'echo $PATH'], expect.any(Object))
  })

  test('falls back to process.env.PATH when spawn errors', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const promise = initShellPath()
    child.emit('error', new Error('boom'))
    await promise
    expect(getShellPath()).toBe(process.env.PATH ?? '')
  })

  test('falls back to process.env.PATH when child times out', async () => {
    vi.useFakeTimers()
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const promise = initShellPath()
    vi.advanceTimersByTime(2100)
    await promise
    expect(getShellPath()).toBe(process.env.PATH ?? '')
    expect(child.kill).toHaveBeenCalled()
    vi.useRealTimers()
  })

  test('caches: second initShellPath does not spawn again', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const p1 = initShellPath()
    child.stdout.push('/cached/path\n')
    child.stdout.push(null)
    child.emit('close', 0)
    await p1
    expect(spawn).toHaveBeenCalledTimes(1)

    await initShellPath()
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(getShellPath()).toBe('/cached/path')
  })

  test('falls back when exit code is non-zero', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const promise = initShellPath()
    child.stdout.push('')
    child.stdout.push(null)
    child.emit('close', 1)
    await promise
    expect(getShellPath()).toBe(process.env.PATH ?? '')
  })
})
