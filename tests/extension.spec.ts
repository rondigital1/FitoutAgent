import { test, expect, chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
test('built MV3 extension prompt → checklist → product results', async () => {
  const path = resolve('apps/extension/dist');
  test.skip(!existsSync(resolve(path, 'manifest.json')), 'Current build is a web app, without an extension manifest.');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    args: ['--headless=new', `--disable-extensions-except=${path}`, `--load-extension=${path}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`chrome-extension://${id}/index.html`);
    await page.getByRole('textbox').fill('Set up an office for two people under $1,500.');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('form', { name: 'Review shopping list' })).toBeVisible();
    await page.getByRole('button', { name: 'Find products' }).click();
    await expect(page.getByRole('heading', { name: 'Browse products' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
