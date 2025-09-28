import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/api/chat': {
        target: 'http://localhost:11434',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist'
  }
})