import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: {
    alias: {
      '@tanstack/react-query': path.resolve(__dirname, 'node_modules/@tanstack/react-query/build/modern/index.js'),
      '@tanstack/react-query-devtools': path.resolve(__dirname, 'node_modules/@tanstack/react-query-devtools/build/modern/index.js'),
    },
  },
  optimizeDeps: {
    include: ['@tanstack/react-query', '@tanstack/react-query-devtools'],
  },
})
