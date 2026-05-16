import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './specs',
  timeout: 5_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  globalSetup: './global-setup.ts',
  reporter: [
    ['html', { open: 'never' }],
    ['github'],
    ['list'],
  ],
})
