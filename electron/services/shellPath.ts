import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'

let cached: string | null = null
let inFlight: Promise<string> | null = null

const TIMEOUT_MS = 2000

// Common locations user-installed binaries land in on macOS. Always
// appended to the resolved PATH (deduplicated) so we still find Homebrew
// / pip --user binaries even if the login shell didn't return a useful
// PATH (e.g. user only configures PATH in an interactive-only init file
// that didn't get sourced for some reason).
const COMMON_BIN_DIRS = [
  `${os.homedir()}/.local/bin`,
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
]

export async function initShellPath(): Promise<void> {
  if (cached !== null) return
  if (inFlight === null) inFlight = resolveShellPath()
  cached = await inFlight
}

export function getShellPath(): string {
  return cached ?? mergePaths(process.env.PATH ?? '', existingCommonDirs())
}

// Exported only for tests.
export function _resetForTest(): void {
  cached = null
  inFlight = null
}

function existingCommonDirs(): string {
  return COMMON_BIN_DIRS.filter((d) => {
    try { return fs.statSync(d).isDirectory() } catch { return false }
  }).join(':')
}

function mergePaths(...parts: string[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    if (!part) continue
    for (const seg of part.split(':')) {
      if (seg && !seen.has(seg)) {
        seen.add(seg)
        out.push(seg)
      }
    }
  }
  return out.join(':')
}

async function resolveShellPath(): Promise<string> {
  const shellOut = await runShellEcho()
  // Order: login-shell wins (user-configured), then process.env.PATH (parent),
  // then common dirs as a safety net.
  return mergePaths(shellOut, process.env.PATH ?? '', existingCommonDirs())
}

function runShellEcho(): Promise<string> {
  return new Promise<string>((resolve) => {
    // Prefer the user's login shell. macOS sets $SHELL to /bin/zsh by default
    // since Catalina (2019); fall back to zsh, then bash if neither is set.
    const userShell = process.env.SHELL || '/bin/zsh'
    let resolved = false
    const finish = (value: string) => {
      if (resolved) return
      resolved = true
      resolve(value)
    }

    let child
    try {
      // -i (interactive) reads ~/.zshrc / ~/.bashrc; -l (login) reads
      // ~/.zprofile / ~/.bash_profile. Many users only export PATH in one of
      // those files, so we ask for both. -c runs the command and exits.
      child = spawn(userShell, ['-ilc', 'echo $PATH'], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      finish('')
      return
    }

    let stdout = ''
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.on('error', () => finish(''))
    child.on('close', (code: number | null) => {
      // Defer one tick to allow buffered stdout 'data' events to drain.
      setImmediate(() => {
        finish(code === 0 ? stdout.trim() : '')
      })
    })

    setTimeout(() => {
      try { child.kill() } catch {}
      finish('')
    }, TIMEOUT_MS)
  })
}
