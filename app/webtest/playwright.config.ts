import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.pw.ts',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4174/webtest.html', viewport: { width: 1280, height: 820 } },
  projects: [
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 820 } } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 820 } } },
  ],
  webServer: {
    command: 'npm run build:webtest && npx vite preview --mode webtest --outDir dist-webtest --port 4174 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4174/webtest.html',
    reuseExistingServer: !process.env.CI,
    cwd: '..',
  },
});
