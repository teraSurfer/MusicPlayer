import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const BACKEND_PORT = 8100
const FRONTEND_PORT = 5273
// Forward slashes keep the SQLite URL valid on Windows too.
const dataDir = path.resolve(import.meta.dirname, '.data').replace(/\\/g, '/')

// uv warns when VIRTUAL_ENV points at some other project's environment.
const { VIRTUAL_ENV: _ignored, ...baseEnv } = process.env as Record<string, string>
void _ignored

export default defineConfig({
  testDir: './tests',
  // One shared backend and database: run serially so tests cannot see each other's data.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        'uv run alembic upgrade head && ' +
        `uv run uvicorn app.main:app --port ${BACKEND_PORT}`,
      cwd: '../backend',
      url: `http://localhost:${BACKEND_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...baseEnv,
        MUSIC_APP_ENV: 'test',
        MUSIC_DATABASE_URL: `sqlite:///${dataDir}/e2e.db`,
        MUSIC_STORAGE_DIR: `${dataDir}/songs`,
        MUSIC_CORS_ORIGINS: JSON.stringify([`http://localhost:${FRONTEND_PORT}`]),
      },
    },
    {
      command: `pnpm exec vite --port ${FRONTEND_PORT} --strictPort`,
      cwd: '../frontend',
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...baseEnv,
        VITE_PROXY_TARGET: `http://localhost:${BACKEND_PORT}`,
      },
    },
  ],
})
