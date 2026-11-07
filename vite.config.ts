import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    // git worktrees hold full copies of the tests
    exclude: [...configDefaults.exclude, '.claude/**', '.worktrees/**'],
  },
})
