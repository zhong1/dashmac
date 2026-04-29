import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
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

const ORIGINAL_PATH = process.env.PATH
const ORIGINAL_SHELL = process.env.SHELL

describe('shellPath', () => {
  beforeEach(() => {
    _resetForTest()
    vi.mocked(spawn).mockReset()
    process.env.PATH = '/usr/bin:/bin'
    process.env.SHELL = '/bin/zsh'
  })

  afterEach(() => {
    process.env.PATH = ORIGINAL_PATH
    process.env.SHELL = ORIGINAL_SHELL
  })

  test('getShellPath before init contains process.env.PATH segments', () => {
    const path = getShellPath()
    expect(path.split(':')).toEqual(expect.arrayContaining(['/usr/bin', '/bin']))
  })

  test('initShellPath resolves and merges shell PATH with process.env.PATH', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const promise = initShellPath()
    child.stdout.push('/Users/me/.local/bin:/opt/homebrew/bin:/usr/bin\n')
    child.stdout.push(null)
    child.emit('close', 0)
    await promise
    const segs = getShellPath().split(':')
    // Login-shell PATH segments come first, deduplicated.
    expect(segs.indexOf('/Users/me/.local/bin')).toBe(0)
    expect(segs).toContain('/opt/homebrew/bin')
    expect(segs).toContain('/usr/bin')
    expect(segs).toContain('/bin')
    // No duplicate entries.
    expect(new Set(segs).size).toBe(segs.length)
  })

  test('uses $SHELL with -ilc, not hardcoded bash', async () => {
    process.env.SHELL = '/bin/zsh'
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const promise = initShellPath()
    child.stdout.push('/x\n')
    child.stdout.push(null)
    child.emit('close', 0)
    await promise
    expect(spawn).toHaveBeenCalledWith('/bin/zsh', ['-ilc', 'echo $PATH'], expect.any(Object))
  })

  test('falls back to /bin/zsh when $SHELL is unset', async () => {
    delete process.env.SHELL
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const promise = initShellPath()
    child.stdout.push('/x\n')
    child.stdout.push(null)
    child.emit('close', 0)
    await promise
    expect(spawn).toHaveBeenCalledWith('/bin/zsh', ['-ilc', 'echo $PATH'], expect.any(Object))
  })

  test('falls back to process.env.PATH segments when spawn errors', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const promise = initShellPath()
    child.emit('error', new Error('boom'))
    await promise
    const segs = getShellPath().split(':')
    expect(segs).toEqual(expect.arrayContaining(['/usr/bin', '/bin']))
  })

  test('falls back when child times out', async () => {
    vi.useFakeTimers()
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const promise = initShellPath()
    vi.advanceTimersByTime(2100)
    await promise
    const segs = getShellPath().split(':')
    expect(segs).toEqual(expect.arrayContaining(['/usr/bin', '/bin']))
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
    expect(getShellPath().split(':')).toContain('/cached/path')
  })

  test('falls back when exit code is non-zero', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)
    const promise = initShellPath()
    child.stdout.push('')
    child.stdout.push(null)
    child.emit('close', 1)
    await promise
    const segs = getShellPath().split(':')
    expect(segs).toEqual(expect.arrayContaining(['/usr/bin', '/bin']))
  })
})
