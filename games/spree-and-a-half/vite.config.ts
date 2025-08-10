import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    assetsDir: '', // Don't put assets in a subfolder
    rollupOptions: {
      output: {
        // Put everything in the root directory
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  },
  base: './' // Use relative paths instead of absolute
})
