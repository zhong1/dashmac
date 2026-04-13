import { create } from 'zustand'
import type { MemoryData, DiskVolume, DiskIO, NetworkInterface, NetworkSpeed } from '../types'

interface SystemState {
  memory: MemoryData | null
  diskVolumes: DiskVolume[]
  diskIO: DiskIO | null
  networkInterfaces: NetworkInterface[]
  networkSpeed: NetworkSpeed | null
  setMemory: (data: MemoryData) => void
  setDisk: (volumes: DiskVolume[], io: DiskIO) => void
  setNetwork: (interfaces: NetworkInterface[], speed: NetworkSpeed) => void
}

export const useSystemStore = create<SystemState>((set) => ({
  memory: null,
  diskVolumes: [],
  diskIO: null,
  networkInterfaces: [],
  networkSpeed: null,
  setMemory: (data) => set({ memory: data }),
  setDisk: (volumes, io) => set({ diskVolumes: volumes, diskIO: io }),
  setNetwork: (interfaces, speed) => set({ networkInterfaces: interfaces, networkSpeed: speed }),
}))
