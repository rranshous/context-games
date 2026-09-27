import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  base: './',
  server: { port: 5190, strictPort: true },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), vectors: resolve(import.meta.dirname, 'vectors.html') } },
  },
});
