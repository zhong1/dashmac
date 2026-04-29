import { describe, expect, test, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'

vi.mock('node:child_process', () => {
  const mockSpawn = vi.fn()
  return { default: { spawn: mockSpawn }, spawn: mockSpawn }
})
vi.mock('../../electron/services/shellPath', () => ({
  getShellPath: () => '/usr/local/bin:/usr/bin:/bin',
}))

import { spawn } from 'node:child_process'
import { CustomCommandRunner } from '../../electron/services/customCommandRunner'
import type { AppSettings, CustomCommandProgressEvent } from '../../src/types'

function makeFakeChild(): any {
  const emitter: any = new EventEmitter()
  emitter.stdout = new Readable({ read() {} })
  emitter.stderr = new Readable({ read() {} })
  emitter.kill = vi.fn()
  return emitter
}

function makeSettings(commands: AppSettings['customCommands']): AppSettings {
  return {
    realtimeInterval: 2000, historyInterval: 60000, retentionDays: 90,
    trayDisplayMetric: 'memory', launchAtLogin: false,
    language: 'en', resolvedLanguage: 'en',
    fileShortcuts: [], showHiddenFiles: false,
    customCommands: commands,
  }
}

describe('CustomCommandRunner — single success', () => {
  beforeEach(() => { vi.mocked(spawn).mockReset() })

  test('emits start, advance, finish for one path with code 0', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)

    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'bup', command: 'bup' }])

    const promise = runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/tmp/a.txt'] },
      settings,
      (e) => events.push(e),
    )

    // Let the runner reach the spawn point.
    await Promise.resolve(); await Promise.resolve()
    child.emit('close', 0)
    await promise

    expect(events).toEqual([
      { type: 'start', runId: 'r1', commandLabel: 'bup', total: 1 },
      { type: 'advance', runId: 'r1', done: 1, current: 'a.txt' },
      { type: 'finish', runId: 'r1', ok: 1, failed: 0 },
    ])
  })

  test('spawns with shell:false, correct argv, cwd, and env.PATH', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)

    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'bup', command: 'bup --foo bar' }])

    const promise = runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/Users/me/My Docs/a.txt'] },
      settings,
      () => {},
    )
    await Promise.resolve(); await Promise.resolve()
    child.emit('close', 0)
    await promise

    expect(spawn).toHaveBeenCalledWith(
      'bup',
      ['--foo', 'bar', '/Users/me/My Docs/a.txt'],
      expect.objectContaining({
        cwd: '/Users/me/My Docs',
        shell: false,
        env: expect.objectContaining({ PATH: '/usr/local/bin:/usr/bin:/bin' }),
      }),
    )
  })
})

describe('CustomCommandRunner — failures and errors', () => {
  beforeEach(() => { vi.mocked(spawn).mockReset() })

  test('non-zero exit emits fileError with exitCode message and stderr', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)

    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'bup', command: 'bup' }])

    const promise = runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/tmp/a.txt'] },
      settings,
      (e) => events.push(e),
    )
    await Promise.resolve(); await Promise.resolve()
    child.stderr.emit('data', Buffer.from('boom\n'))
    child.emit('close', 1)
    await promise

    const fe = events.find((e) => e.type === 'fileError')
    expect(fe).toMatchObject({
      type: 'fileError',
      runId: 'r1',
      path: '/tmp/a.txt',
      message: 'exitCode:1',
      stderr: 'boom\n',
    })
    expect(events[events.length - 1]).toEqual({
      type: 'finish', runId: 'r1', ok: 0, failed: 1,
    })
  })

  test('ENOENT (missing binary) emits notFound', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)

    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'X', command: 'doesnotexist' }])

    const promise = runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/tmp/a.txt'] },
      settings,
      (e) => events.push(e),
    )
    await Promise.resolve(); await Promise.resolve()
    const err = new Error('spawn doesnotexist ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    child.emit('error', err)
    await promise

    const fe = events.find((e) => e.type === 'fileError')
    expect(fe).toMatchObject({ message: 'notFound:doesnotexist', stderr: '' })
    expect(events[events.length - 1]).toEqual({
      type: 'finish', runId: 'r1', ok: 0, failed: 1,
    })
  })

  test('unknown commandId emits all-failed finish', async () => {
    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([])

    await runner.run(
      { runId: 'r1', commandId: 'nope', paths: ['/tmp/a.txt', '/tmp/b.txt'] },
      settings,
      (e) => events.push(e),
    )

    expect(events.filter((e) => e.type === 'fileError')).toHaveLength(2)
    expect(events[events.length - 1]).toEqual({
      type: 'finish', runId: 'r1', ok: 0, failed: 2,
    })
    // spawn must NOT have been called.
    expect(spawn).not.toHaveBeenCalled()
  })

  test('parse error (unclosed quote) emits all-failed without spawning', async () => {
    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'X', command: 'bup "unclosed' }])

    await runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/tmp/a.txt'] },
      settings,
      (e) => events.push(e),
    )

    expect(spawn).not.toHaveBeenCalled()
    const fe = events.find((e) => e.type === 'fileError')
    expect(fe?.message).toMatch(/^parseError:/)
  })

  test('empty command field emits all-failed without spawning', async () => {
    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'X', command: '   ' }])

    await runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/tmp/a.txt'] },
      settings,
      (e) => events.push(e),
    )

    expect(spawn).not.toHaveBeenCalled()
    const fe = events.find((e) => e.type === 'fileError')
    expect(fe?.message).toBe('parseError:empty')
  })

  test('stderr capped at 4 KB', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)

    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'X', command: 'bup' }])

    const promise = runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/tmp/a.txt'] },
      settings,
      (e) => events.push(e),
    )
    await Promise.resolve(); await Promise.resolve()
    // Push 8 KB of stderr.
    child.stderr.emit('data', Buffer.alloc(8192, 0x41))
    child.emit('close', 1)
    await promise

    const fe = events.find((e) => e.type === 'fileError') as Extract<CustomCommandProgressEvent, { type: 'fileError' }>
    expect(fe.stderr.length).toBeLessThanOrEqual(4096)
  })
})
