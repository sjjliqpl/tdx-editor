import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.TAURI_ENV_PLATFORM ? './' : '/tdx-editor/',
  plugins: [react()],
  resolve: {
    alias: {
      '@tdx/language': fileURLToPath(new URL('./packages/tdx-language/src/index.ts', import.meta.url)),
    },
  },
})
