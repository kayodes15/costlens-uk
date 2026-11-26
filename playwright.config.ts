import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4178';
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL, browserName: 'chromium', channel: 'chrome' },
  webServer: {
    command: 'npm run build && vite preview --host 127.0.0.1 --port 4178 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
  },
});
