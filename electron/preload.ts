import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Stubs — replaced in Task 3
})
