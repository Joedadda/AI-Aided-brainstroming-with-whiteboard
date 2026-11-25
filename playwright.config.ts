import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://localhost:5295';

export default defineConfig({
  testDir: './e2e',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: `${baseURL}/api/health`,
    env: {
      WEB_PORT: '5295',
      API_PORT: '8895',
      COLLAB_PORT: '8896',
      DATABASE_PATH: ':memory:',
      MOCK_AI: '1',
    },
    reuseExistingServer: false,
  },
});
