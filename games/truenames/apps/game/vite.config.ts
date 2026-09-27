import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  base: './',
  server: { port: 5190, strictPort: true },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), vectors: resolve(__dirname, 'vectors.html') } },
  },
});
