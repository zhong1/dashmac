import { spawn, type ChildProcess } from 'node:child_process'
import * as path from 'node:path'
import { getShellPath } from './shellPath'
import { parseShellArgs } from './shlex'
import type { AppSettings, CustomCommandProgressEvent } from '../../src/types'

export interface RunRequest {
  runId: string
  commandId: string
  paths: string[]
}

const STDERR_CAP_BYTES = 4096

export class CustomCommandRunner {
  private active = new Set<ChildProcess>()

  async run(
    req: RunRequest,
    settings: AppSettings,
    emit: (e: CustomCommandProgressEvent) => void,
  ): Promise<void> {
    const cmd = settings.customCommands.find((c) => c.id === req.commandId)
    if (!cmd) {
      emit({ type: 'start', runId: req.runId, commandLabel: '', total: req.paths.length })
      for (const p of req.paths) {
        emit({ type: 'fileError', runId: req.runId, path: p, message: 'unknownCommand', stderr: '' })
      }
      emit({ type: 'finish', runId: req.runId, ok: 0, failed: req.paths.length })
      return
    }

    const useShell = cmd.useShell ?? false
    let bin: string
    let staticArgs: string[] = []

    if (useShell) {
      // Shell mode: pass the user's command verbatim to their login shell so
      // functions/aliases defined in ~/.zshrc are available. The file path is
      // still passed as a separate argv entry via "$@", so file names with
      // spaces/quotes/metacharacters are NOT shell-interpolated.
      if (cmd.command.trim().length === 0) {
        emit({ type: 'start', runId: req.runId, commandLabel: cmd.label, total: req.paths.length })
        for (const p of req.paths) {
          emit({ type: 'fileError', runId: req.runId, path: p, message: 'parseError:empty', stderr: '' })
        }
        emit({ type: 'finish', runId: req.runId, ok: 0, failed: req.paths.length })
        return
      }
      bin = process.env.SHELL || '/bin/zsh'
    } else {
      let argv: string[]
      try {
        argv = parseShellArgs(cmd.command)
      } catch (err: any) {
        emit({ type: 'start', runId: req.runId, commandLabel: cmd.label, total: req.paths.length })
        for (const p of req.paths) {
          emit({ type: 'fileError', runId: req.runId, path: p, message: `parseError:${err?.message ?? 'parse'}`, stderr: '' })
        }
        emit({ type: 'finish', runId: req.runId, ok: 0, failed: req.paths.length })
        return
      }

      if (argv.length === 0) {
        emit({ type: 'start', runId: req.runId, commandLabel: cmd.label, total: req.paths.length })
        for (const p of req.paths) {
          emit({ type: 'fileError', runId: req.runId, path: p, message: 'parseError:empty', stderr: '' })
        }
        emit({ type: 'finish', runId: req.runId, ok: 0, failed: req.paths.length })
        return
      }

      ;[bin, ...staticArgs] = argv
    }

    emit({ type: 'start', runId: req.runId, commandLabel: cmd.label, total: req.paths.length })

    let okCount = 0
    let failCount = 0

    const pathMode = cmd.pathMode ?? 'absolute'

    for (let i = 0; i < req.paths.length; i++) {
      const filePath = req.paths[i]
      const argPath = pathMode === 'basename' ? path.basename(filePath) : filePath
      const argv = useShell
        ? ['-ilc', `${cmd.command} "$@"`, 'dashmac', argPath]
        : [...staticArgs, argPath]
      const result = await this.runOne(bin, argv, filePath)

      if (result.ok) {
        okCount++
      } else {
        failCount++
        emit({
          type: 'fileError',
          runId: req.runId,
          path: filePath,
          message: result.message,
          stderr: result.stderr,
        })
      }

      emit({ type: 'advance', runId: req.runId, done: i + 1, current: path.basename(filePath) })
    }

    emit({ type: 'finish', runId: req.runId, ok: okCount, failed: failCount })
  }

  private runOne(
    bin: string,
    argv: string[],
    filePath: string,
  ): Promise<{ ok: true } | { ok: false; message: string; stderr: string }> {
    return new Promise((resolve) => {
      const cwd = path.dirname(filePath)
      let child: ChildProcess
      try {
        child = spawn(bin, argv, {
          cwd,
          shell: false,
          env: { ...process.env, PATH: getShellPath() },
          stdio: ['ignore', 'ignore', 'pipe'],
        })
      } catch (err: any) {
        resolve({ ok: false, message: `spawnError:${err?.message ?? 'spawn'}`, stderr: '' })
        return
      }

      this.active.add(child)
      let stderrBuf = ''
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString('utf8')
        if (stderrBuf.length > STDERR_CAP_BYTES) {
          stderrBuf = stderrBuf.slice(-STDERR_CAP_BYTES)
        }
      })

      let settled = false
      const settle = (r: { ok: true } | { ok: false; message: string; stderr: string }) => {
        if (settled) return
        settled = true
        this.active.delete(child)
        resolve(r)
      }

      child.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          settle({ ok: false, message: `notFound:${bin}`, stderr: '' })
        } else {
          settle({ ok: false, message: `spawnError:${err.message}`, stderr: stderrBuf })
        }
      })
      child.on('close', (code: number | null) => {
        if (code === 0) settle({ ok: true })
        else settle({ ok: false, message: `exitCode:${code ?? 'null'}`, stderr: stderrBuf })
      })
    })
  }

  /**
   * Send SIGTERM to all in-flight children. Used on app quit so we don't leak
   * orphan processes.
   */
  disposeAll(): void {
    for (const c of this.active) {
      try { c.kill('SIGTERM') } catch {}
    }
    this.active.clear()
  }
}
