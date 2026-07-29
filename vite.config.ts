import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build del solo renderer (Tauri gestisce il backend in BE/).
export default defineConfig({
  root: 'UI',
  plugins: [react()],
  clearScreen: false,
  build: {
    outDir: resolve(__dirname, 'output/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'UI/index.html')
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
