export type KillSignal = 'SIGTERM' | 'SIGKILL'

export type KillResult =
  | { ok: true }
  | { ok: false; errno: string; message: string }

export function killProcess(pid: number, signal: KillSignal): KillResult {
  try {
    process.kill(pid, signal)
    return { ok: true }
  } catch (err: any) {
    return {
      ok: false,
      errno: err?.code ?? 'EUNKNOWN',
      message: err?.message ?? String(err),
    }
  }
}
