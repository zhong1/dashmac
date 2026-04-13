import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Scheduler } from '../../electron/services/scheduler'

describe('Scheduler', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('calls realtime callback at specified interval', () => {
    const realtimeFn = vi.fn().mockResolvedValue(undefined)
    const persistFn = vi.fn().mockResolvedValue(undefined)

    const scheduler = new Scheduler({
      realtimeInterval: 2000,
      persistInterval: 60000,
      onRealtimeTick: realtimeFn,
      onPersistTick: persistFn,
    })

    scheduler.start()
    vi.advanceTimersByTime(6000)
    expect(realtimeFn).toHaveBeenCalledTimes(3)
    expect(persistFn).toHaveBeenCalledTimes(0)
    scheduler.stop()
  })

  it('calls persist callback at its own interval', () => {
    const realtimeFn = vi.fn().mockResolvedValue(undefined)
    const persistFn = vi.fn().mockResolvedValue(undefined)

    const scheduler = new Scheduler({
      realtimeInterval: 2000,
      persistInterval: 5000,
      onRealtimeTick: realtimeFn,
      onPersistTick: persistFn,
    })

    scheduler.start()
    vi.advanceTimersByTime(10000)
    expect(persistFn).toHaveBeenCalledTimes(2)
    scheduler.stop()
  })

  it('stop clears all timers', () => {
    const realtimeFn = vi.fn().mockResolvedValue(undefined)
    const persistFn = vi.fn().mockResolvedValue(undefined)

    const scheduler = new Scheduler({
      realtimeInterval: 2000,
      persistInterval: 5000,
      onRealtimeTick: realtimeFn,
      onPersistTick: persistFn,
    })

    scheduler.start()
    vi.advanceTimersByTime(4000)
    scheduler.stop()
    const callCount = realtimeFn.mock.calls.length
    vi.advanceTimersByTime(10000)
    expect(realtimeFn).toHaveBeenCalledTimes(callCount)
  })
})
