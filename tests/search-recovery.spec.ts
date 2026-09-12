import { test, expect } from '@playwright/test';

test('automatic recovery fills a gap and preserves requirements and search history after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Describe your project' }).fill('recovery scenario under $1000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Find products' }).click();
  const recovery = page.getByRole('region', { name: 'Automatic search recovery' });
  await expect(recovery).toContainText('Found a suitable option without changing your requirements');
  await expect(page.getByRole('button', { name: /Recovered queen steel frame.*in your plan/ })).toBeVisible();
  await recovery.getByText('1 additional search', { exact: true }).click();
  await expect(recovery).toContainText('queen steel bed frame without headboard');
  await page.reload();
  await expect(recovery).toContainText('Found a suitable option');
  await expect(page.getByRole('button', { name: 'Create basket' })).toBeEnabled();
});

test('exhaustion offers explicit requirement review, while an outage only offers retry', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Describe your project' }).fill('recovery scenario no match under $1000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Find products' }).click();
  const recovery = page.getByRole('region', { name: 'Automatic search recovery' });
  await expect(recovery).toContainText('Nothing has been changed automatically');
  await expect(page.getByRole('button', { name: 'Create basket' })).toBeDisabled();
  await recovery.getByText('2 additional searches', { exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('recovery-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Review original request' }).click();
  await expect(page.getByRole('textbox', { name: 'Describe your project' })).toHaveValue('recovery scenario no match under $1000');
  await page.getByRole('textbox', { name: 'Describe your project' }).fill('recovery scenario outage under $1000');
  await page.getByRole('button', { name: 'Update list' }).click();
  await page.getByRole('button', { name: 'Find products' }).click();
  await expect(recovery).toContainText('A retailer or fit service could not complete');
  await expect(page.getByRole('button', { name: 'Review original request' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry search for Queen steel bed frame' }).click();
  await expect(recovery).toContainText('A retailer or fit service could not complete');
  await page.reload();
  await expect(recovery).toContainText('A retailer or fit service could not complete');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('recovery-desktop.png'), fullPage: true });
});
