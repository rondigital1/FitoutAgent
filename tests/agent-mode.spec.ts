import { test, expect } from '@playwright/test';

test('agent finds everything, restores preferences, and prepares all links', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('radio', { name: /Choose item by item/ })).toBeChecked();
  await page.getByRole('textbox', { name: 'What do you need?' }).fill('Set up an office for two under $1500');
  await page.getByRole('radio', { name: /Let the agent/ }).check();
  await page.screenshot({ path: 'test-results/agent-mode-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'test-results/agent-mode-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Find everything for me' }).click();
  await expect(page.getByRole('status')).toHaveText('Done');
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Done');
  await expect(page.locator('.wk-basket__links a')).toHaveCount(5);
  await page.getByRole('button', { name: 'Edit prompt' }).click();
  await expect(page.getByRole('radio', { name: /Let the agent/ })).toBeChecked();
  await page.getByRole('radio', { name: /Choose item by item/ }).check();
  await page.getByRole('button', { name: 'Update my list' }).click();
  await expect(page.getByRole('form', { name: 'Review shopping list' })).toBeVisible();
});

test('agent searches and prepares links without asking for a budget', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('Set up an office');
  await page.getByRole('radio', { name: /Let the agent/ }).check();
  await page.getByRole('button', { name: 'Find everything for me' }).click();
  await expect(page.getByRole('status')).toHaveText('Done');
  await expect(page.locator('.wk-basket__links a')).toHaveCount(5);
  await expect(page.getByText('No spending limit set')).toBeVisible();
});

test('automatic search failure can be revised and retried without losing the mode', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('office under $1500 catalog failure');
  await page.getByRole('radio', { name: /Let the agent/ }).check();
  await page.getByRole('button', { name: 'Find everything for me' }).click();
  await expect(page.getByRole('alert')).toContainText('Catalog unavailable');
  await expect(page.getByRole('form', { name: 'Review shopping list' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('form', { name: 'Review shopping list' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit prompt' }).click();
  await expect(page.getByRole('radio', { name: /Let the agent/ })).toBeChecked();
  await page.getByRole('textbox').fill('office under $1500');
  await page.getByRole('button', { name: 'Find everything for me' }).click();
  await expect(page.getByRole('status')).toHaveText('Done');
});
