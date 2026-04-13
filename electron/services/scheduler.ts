interface SchedulerOptions {
  realtimeInterval: number
  persistInterval: number
  onRealtimeTick: () => Promise<void>
  onPersistTick: () => Promise<void>
}

export class Scheduler {
  private realtimeTimer: ReturnType<typeof setInterval> | null = null
  private persistTimer: ReturnType<typeof setInterval> | null = null
  private options: SchedulerOptions

  constructor(options: SchedulerOptions) {
    this.options = options
  }

  start(): void {
    this.realtimeTimer = setInterval(async () => {
      try {
        await this.options.onRealtimeTick()
      } catch (err) {
        console.error('Realtime tick error:', err)
      }
    }, this.options.realtimeInterval)

    this.persistTimer = setInterval(async () => {
      try {
        await this.options.onPersistTick()
      } catch (err) {
        console.error('Persist tick error:', err)
      }
    }, this.options.persistInterval)
  }

  stop(): void {
    if (this.realtimeTimer) {
      clearInterval(this.realtimeTimer)
      this.realtimeTimer = null
    }
    if (this.persistTimer) {
      clearInterval(this.persistTimer)
      this.persistTimer = null
    }
  }

  updateIntervals(realtimeMs: number, persistMs: number): void {
    this.options.realtimeInterval = realtimeMs
    this.options.persistInterval = persistMs
    this.stop()
    this.start()
  }
}
