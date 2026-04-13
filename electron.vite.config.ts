import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve('electron/main.ts'),
        output: {
          format: 'cjs',
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve('electron/preload.ts'),
        output: {
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    root: '.',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve('index.html'),
      },
    },
  },
})
