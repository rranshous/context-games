import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // Remove sourcemaps for production
    rollupOptions: {
      output: {
        manualChunks: undefined // Keep everything in one bundle for simplicity
      }
    }
  },
  base: './' // Use relative paths for itch.io compatibility
})