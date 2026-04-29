import { spawn } from 'node:child_process'

let cached: string | null = null
let inFlight: Promise<string> | null = null

const TIMEOUT_MS = 2000

export async function initShellPath(): Promise<void> {
  if (cached !== null) return
  if (inFlight === null) inFlight = resolveShellPath()
  cached = await inFlight
}

export function getShellPath(): string {
  return cached ?? process.env.PATH ?? ''
}

// Exported only for tests.
export function _resetForTest(): void {
  cached = null
  inFlight = null
}

async function resolveShellPath(): Promise<string> {
  return new Promise<string>((resolve) => {
    const fallback = process.env.PATH ?? ''
    let resolved = false
    const finish = (value: string) => {
      if (resolved) return
      resolved = true
      resolve(value)
    }

    let child
    try {
      child = spawn('bash', ['-lc', 'echo $PATH'], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      finish(fallback)
      return
    }

    let stdout = ''
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.on('error', () => finish(fallback))
    child.on('close', (code: number | null) => {
      // Defer one tick to allow buffered stdout 'data' events to drain.
      setImmediate(() => {
        if (code === 0 && stdout.trim().length > 0) finish(stdout.trim())
        else finish(fallback)
      })
    })

    setTimeout(() => {
      try { child.kill() } catch {}
      finish(fallback)
    }, TIMEOUT_MS)
  })
}
