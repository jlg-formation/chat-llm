import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/main.tsx',
        'src/types.ts',
        'src/**/*.d.ts',
        'src/assets/**',
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
      ],
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
      },
    },
  },
})
