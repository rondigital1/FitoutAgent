import { test, expect } from '@playwright/test';

test('one basket shows mixed retailers before preparation and after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('office under $1500 mixed retailers');
  await page.getByRole('button', { name: 'Make my list' }).click();
  await page.getByRole('button', { name: 'Find products for this list' }).click();
  await expect(page.getByRole('status')).toHaveText('Compare');
  await page.getByRole('button', { name: 'Basket', exact: true }).click();
  const basket = page.getByRole('region', { name: 'Unified basket' });
  await expect(basket).toBeVisible();
  await expect(basket.getByRole('listitem')).toHaveCount(5);
  await expect(basket).toContainText('Walmart');
  await expect(basket).toContainText('Shopify');
  await expect(basket).toContainText('2 sellers');
  await expect(basket).toContainText('Product subtotal');
  await page.getByRole('button', { name: 'Create basket' }).click();
  await expect(page.getByRole('status')).toHaveText('Done');
  await expect(basket.getByRole('listitem')).toHaveCount(5);
  await page.screenshot({ path: 'test-results/unified-basket-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: 'test-results/unified-basket-desktop.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your basket', exact: true })).toBeVisible();
  await expect(basket.getByRole('listitem')).toHaveCount(5);
  await expect(basket.getByRole('link', { name: 'View at seller' })).toHaveCount(5);
});
