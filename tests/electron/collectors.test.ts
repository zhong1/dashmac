import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('systeminformation', () => ({
  mem: vi.fn(),
  fsSize: vi.fn(),
  disksIO: vi.fn(),
  networkInterfaces: vi.fn(),
  networkStats: vi.fn(),
  networkConnections: vi.fn(),
  processes: vi.fn(),
}))

import * as si from 'systeminformation'
import { collectMemory } from '../../electron/collectors/memory'
import { collectDisk } from '../../electron/collectors/disk'
import { collectNetwork, collectConnections } from '../../electron/collectors/network'
import { collectProcesses } from '../../electron/collectors/process'

describe('collectMemory', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns formatted memory data', async () => {
    vi.mocked(si.mem).mockResolvedValue({
      total: 17179869184, used: 12884901888, free: 4294967296, cached: 3221225472,
      swaptotal: 2147483648, swapused: 536870912,
      active: 0, available: 0, buffcache: 0, buffers: 0, slab: 0, swapfree: 0,
    } as any)

    const data = await collectMemory()
    expect(data.total).toBe(17179869184)
    expect(data.used).toBe(12884901888)
    expect(data.free).toBe(4294967296)
    expect(data.cached).toBe(3221225472)
    expect(data.swapUsed).toBe(536870912)
    expect(data.swapTotal).toBe(2147483648)
    expect(data.usagePercent).toBeCloseTo(75, 0)
  })

  it('sets pressure level based on usage', async () => {
    vi.mocked(si.mem).mockResolvedValue({
      total: 16e9, used: 14.5e9, free: 1.5e9, cached: 1e9,
      swaptotal: 2e9, swapused: 1e9,
      active: 0, available: 0, buffcache: 0, buffers: 0, slab: 0, swapfree: 0,
    } as any)

    const data = await collectMemory()
    expect(data.pressureLevel).toBe('critical')
  })
})

describe('collectDisk', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns formatted disk data with volumes and I/O', async () => {
    vi.mocked(si.fsSize).mockResolvedValue([
      { fs: '/dev/disk1s1', type: 'APFS', size: 500e9, used: 300e9, available: 200e9, use: 60, mount: '/', rw: true },
    ] as any)
    vi.mocked(si.disksIO).mockResolvedValue({
      rIO_sec: 150.5, wIO_sec: 80.2, tIO_sec: 230.7,
      rIO: 0, wIO: 0, tIO: 0, rWaitTime: 0, wWaitTime: 0, tWaitTime: 0,
      rWaitPercent: 0, wWaitPercent: 0, tWaitPercent: 0, ms: 0,
    } as any)

    const data = await collectDisk()
    expect(data.volumes).toHaveLength(1)
    expect(data.volumes[0].mountPoint).toBe('/')
    expect(data.volumes[0].total).toBe(500e9)
    expect(data.io.readSpeed).toBe(150.5)
    expect(data.io.writeSpeed).toBe(80.2)
  })
})

describe('collectNetwork', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns interfaces and speed data', async () => {
    vi.mocked(si.networkInterfaces).mockResolvedValue([
      { iface: 'en0', ip4: '192.168.1.42', type: 'wireless', speed: 1000,
        ifaceName: 'en0', ip4subnet: '', ip6: '', ip6subnet: '', mac: '',
        internal: false, virtual: false, operstate: 'up', dhcp: true,
        dnsSuffix: '', ieee8021xAuth: '', ieee8021xState: '',
        carrierChanges: 0, default: true } as any,
    ])
    vi.mocked(si.networkStats).mockResolvedValue([
      { iface: 'en0', rx_sec: 8400000, tx_sec: 1200000, rx_bytes: 100e6, tx_bytes: 20e6,
        operstate: 'up', rx_dropped: 0, rx_errors: 0, tx_dropped: 0, tx_errors: 0, ms: 0 } as any,
    ])

    const data = await collectNetwork()
    expect(data.interfaces).toHaveLength(1)
    expect(data.interfaces[0].iface).toBe('en0')
    expect(data.speed.rxSpeed).toBe(8400000)
  })
})

describe('collectConnections', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns active connections', async () => {
    vi.mocked(si.networkConnections).mockResolvedValue([
      { protocol: 'tcp', localAddress: '127.0.0.1', localPort: '8080',
        peerAddress: '93.184.216.34', peerPort: '443', state: 'ESTABLISHED',
        pid: 1234, process: 'node' } as any,
    ])

    const conns = await collectConnections()
    expect(conns).toHaveLength(1)
    expect(conns[0].protocol).toBe('tcp')
    expect(conns[0].process).toBe('node')
  })
})

describe('collectProcesses', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns top processes sorted by memory', async () => {
    vi.mocked(si.processes).mockResolvedValue({
      all: 350, running: 5, blocked: 0, sleeping: 345, unknown: 0,
      list: [
        { pid: 1, name: 'kernel_task', mem: 5.2, cpu: 1.0, memRss: 800e6 } as any,
        { pid: 200, name: 'Chrome', mem: 12.1, cpu: 8.5, memRss: 1900e6 } as any,
        { pid: 300, name: 'Finder', mem: 1.0, cpu: 0.2, memRss: 150e6 } as any,
      ],
    } as any)

    const procs = await collectProcesses()
    expect(procs[0].name).toBe('Chrome')
    expect(procs[0].memoryUsage).toBe(1900e6)
    expect(procs).toHaveLength(3)
  })
})
