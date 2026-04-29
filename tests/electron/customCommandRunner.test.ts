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

  test('pathMode "basename" passes only the filename as last argv (cwd unchanged)', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)

    const runner = new CustomCommandRunner()
    const settings = makeSettings([
      { id: 'c1', label: 'bup', command: 'bup', pathMode: 'basename' },
    ])

    const promise = runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/Users/me/Downloads/a.txt'] },
      settings,
      () => {},
    )
    await Promise.resolve(); await Promise.resolve()
    child.emit('close', 0)
    await promise

    expect(spawn).toHaveBeenCalledWith(
      'bup',
      ['a.txt'],
      expect.objectContaining({ cwd: '/Users/me/Downloads', shell: false }),
    )
  })

  test('useShell:true spawns $SHELL -ilc with command + path via "$@"', async () => {
    const originalShell = process.env.SHELL
    process.env.SHELL = '/bin/zsh'
    try {
      const child = makeFakeChild()
      vi.mocked(spawn).mockReturnValue(child)

      const runner = new CustomCommandRunner()
      const settings = makeSettings([
        { id: 'c1', label: 'bup', command: 'bup', useShell: true },
      ])

      const promise = runner.run(
        { runId: 'r1', commandId: 'c1', paths: ['/Users/me/Downloads/a.txt'] },
        settings,
        () => {},
      )
      await Promise.resolve(); await Promise.resolve()
      child.emit('close', 0)
      await promise

      expect(spawn).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-ilc', 'bup "$@"', 'dashmac', '/Users/me/Downloads/a.txt'],
        expect.objectContaining({ cwd: '/Users/me/Downloads', shell: false }),
      )
    } finally {
      process.env.SHELL = originalShell
    }
  })

  test('useShell:true with pathMode:basename passes only basename via "$@"', async () => {
    const originalShell = process.env.SHELL
    process.env.SHELL = '/bin/zsh'
    try {
      const child = makeFakeChild()
      vi.mocked(spawn).mockReturnValue(child)

      const runner = new CustomCommandRunner()
      const settings = makeSettings([
        { id: 'c1', label: 'bup', command: 'bup', useShell: true, pathMode: 'basename' },
      ])

      const promise = runner.run(
        { runId: 'r1', commandId: 'c1', paths: ['/Users/me/Downloads/a.txt'] },
        settings,
        () => {},
      )
      await Promise.resolve(); await Promise.resolve()
      child.emit('close', 0)
      await promise

      expect(spawn).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-ilc', 'bup "$@"', 'dashmac', 'a.txt'],
        expect.any(Object),
      )
    } finally {
      process.env.SHELL = originalShell
    }
  })

  test('missing pathMode defaults to absolute (backwards compat)', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child)

    const runner = new CustomCommandRunner()
    // No pathMode field set — simulates settings written before this feature.
    const settings = makeSettings([{ id: 'c1', label: 'bup', command: 'bup' }])

    const promise = runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/Users/me/Downloads/a.txt'] },
      settings,
      () => {},
    )
    await Promise.resolve(); await Promise.resolve()
    child.emit('close', 0)
    await promise

    expect(spawn).toHaveBeenCalledWith(
      'bup',
      ['/Users/me/Downloads/a.txt'],
      expect.any(Object),
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

describe('CustomCommandRunner — sequential execution', () => {
  beforeEach(() => { vi.mocked(spawn).mockReset() })

  test('second spawn does not start until first close', async () => {
    const child1 = makeFakeChild()
    const child2 = makeFakeChild()
    const child3 = makeFakeChild()
    vi.mocked(spawn)
      .mockReturnValueOnce(child1)
      .mockReturnValueOnce(child2)
      .mockReturnValueOnce(child3)

    const events: CustomCommandProgressEvent[] = []
    const runner = new CustomCommandRunner()
    const settings = makeSettings([{ id: 'c1', label: 'X', command: 'bup' }])

    const promise = runner.run(
      { runId: 'r1', commandId: 'c1', paths: ['/tmp/a', '/tmp/b', '/tmp/c'] },
      settings,
      (e) => events.push(e),
    )

    // After yielding a few microtasks, only the first spawn should have happened.
    await Promise.resolve(); await Promise.resolve()
    expect(spawn).toHaveBeenCalledTimes(1)

    child1.emit('close', 0)
    await Promise.resolve(); await Promise.resolve()
    expect(spawn).toHaveBeenCalledTimes(2)

    child2.emit('close', 0)
    await Promise.resolve(); await Promise.resolve()
    expect(spawn).toHaveBeenCalledTimes(3)

    child3.emit('close', 0)
    await promise

    // Three advance events with monotonically increasing done counts.
    const advances = events.filter((e) => e.type === 'advance') as Array<Extract<CustomCommandProgressEvent, { type: 'advance' }>>
    expect(advances.map((a) => a.done)).toEqual([1, 2, 3])
    expect(advances.map((a) => a.current)).toEqual(['a', 'b', 'c'])
    expect(events[events.length - 1]).toEqual({
      type: 'finish', runId: 'r1', ok: 3, failed: 0,
    })
  })
})
