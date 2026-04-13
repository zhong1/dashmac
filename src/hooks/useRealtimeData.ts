import { useEffect } from 'react'
import { useSystemStore } from '../stores/systemStore'

export function useRealtimeData(): void {
  const setMemory = useSystemStore((s) => s.setMemory)
  const setDisk = useSystemStore((s) => s.setDisk)
  const setNetwork = useSystemStore((s) => s.setNetwork)

  useEffect(() => {
    const unsubMemory = window.api.onRealtimeMemory((data) => { setMemory(data) })
    const unsubDisk = window.api.onRealtimeDisk((data) => { setDisk(data.volumes, data.io) })
    const unsubNetwork = window.api.onRealtimeNetwork((data) => { setNetwork(data.interfaces, data.speed) })

    return () => { unsubMemory(); unsubDisk(); unsubNetwork() }
  }, [setMemory, setDisk, setNetwork])
}
