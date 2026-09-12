import { test, expect } from '@playwright/test';

test('different options refreshes only one category and survives reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('office under $1500');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Find products' }).click();
  const shelf = page.locator('.wk-shelf').first();
  const more = shelf.getByRole('button', { name: /Find different options for/ });
  await expect(more).toBeEnabled();
  const otherCount = await page.locator('.wk-shelf').nth(1).getByRole('listitem').count();
  await more.click();
  await expect(page.getByRole('region', { name: /^Searching / })).toBeVisible();
  await expect(page.locator('.wk-shelf').first().getByRole('listitem')).toHaveCount(otherCount);
  await expect(shelf.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('status').filter({ hasText: /Search for .*found 1 different option/ })).toBeVisible();
  await expect(page.locator('.wk-shelf').nth(1).getByRole('listitem')).toHaveCount(otherCount);
  await more.click();
  await expect(page.getByRole('status').filter({ hasText: /Search for .*No different options found/ })).toBeVisible();
  await expect(shelf.getByRole('listitem')).toHaveCount(2);
  await page.reload();
  await expect(shelf.getByRole('listitem')).toHaveCount(2);
});
