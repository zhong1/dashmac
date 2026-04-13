import * as si from 'systeminformation'
import type { RawNetworkData } from './types'

export async function collectNetwork(): Promise<RawNetworkData> {
  const [ifaces, stats] = await Promise.all([
    si.networkInterfaces(),
    si.networkStats(),
  ])

  const ifaceList = Array.isArray(ifaces) ? ifaces : [ifaces]
  const interfaces = ifaceList
    .filter((i) => !i.internal && i.ip4)
    .map((i) => ({
      iface: i.iface,
      ip4: i.ip4,
      type: i.type,
      speed: i.speed,
    }))

  const primary = Array.isArray(stats) ? stats[0] : stats
  const speed = {
    rxSpeed: primary?.rx_sec ?? 0,
    txSpeed: primary?.tx_sec ?? 0,
    rxBytes: primary?.rx_bytes ?? 0,
    txBytes: primary?.tx_bytes ?? 0,
  }

  return { interfaces, speed }
}

export async function collectConnections() {
  const conns = await si.networkConnections()
  return conns
    .filter((c) => c.peerAddress && c.peerAddress !== '0.0.0.0' && c.peerAddress !== '::')
    .map((c) => ({
      protocol: c.protocol,
      localAddress: c.localAddress,
      localPort: Number(c.localPort),
      peerAddress: c.peerAddress,
      peerPort: Number(c.peerPort),
      state: c.state,
      process: (c as any).process ?? `PID ${c.pid}`,
    }))
}
