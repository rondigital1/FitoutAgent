import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5319', viewport: { width: 390, height: 844 }, channel: 'chrome' },
  webServer: [
    { command: 'pnpm --dir apps/server exec tsx ../../tests/fixture-server.mts', url: 'http://127.0.0.1:4319/health',
      env: { PORT: '4319', PANEL_ORIGIN: 'http://127.0.0.1:5319', DATA_DIR: '/tmp/fitoutagent-e2e-data', SHOPIFY_GLOBAL_CATALOG: '0', SHOPIFY_STORE_DOMAIN: '', SHOPIFY_STOREFRONT_TOKEN: '' } },
    { command: 'pnpm --dir apps/extension exec vite --host 127.0.0.1 --port 5319 --strictPort', url: 'http://127.0.0.1:5319',
      env: { VITE_AGENT_URL: 'http://127.0.0.1:4319/agent' } },
  ],
});
