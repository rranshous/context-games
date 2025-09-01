/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        global: {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95
        }
      }
    }
  }
})
