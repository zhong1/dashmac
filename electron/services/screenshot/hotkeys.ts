import { globalShortcut } from 'electron'

export class CaptureHotkey {
  private current: string | null = null

  get currentAccelerator(): string | null {
    return this.current
  }

  register(accelerator: string, handler: () => void): boolean {
    const ok = globalShortcut.register(accelerator, handler)
    if (ok) this.current = accelerator
    else this.current = null
    return ok
  }

  reregister(accelerator: string, handler: () => void): boolean {
    if (this.current === accelerator) return true
    if (this.current) globalShortcut.unregister(this.current)
    return this.register(accelerator, handler)
  }

  unregisterAll(): void {
    if (this.current) globalShortcut.unregister(this.current)
    this.current = null
  }
}
