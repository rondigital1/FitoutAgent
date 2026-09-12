import { test, expect } from '@playwright/test';

test('recommendation tabs apply product choices and explain identical baskets', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('office under $1500');
  await page.getByRole('button', { name: 'Make my list' }).click();
  await page.getByRole('button', { name: 'Find products for this list' }).click();
  const shelf = page.locator('.wk-shelf').first();
  const original = await shelf.locator('.is-selected .wk-tile__name').textContent();
  await shelf.getByRole('listitem').last().getByRole('button').click();
  await page.getByRole('button', { name: 'Choose this product' }).click();
  await expect(shelf.locator('.is-selected .wk-tile__name')).not.toHaveText(original!);
  await page.getByRole('tab', { name: 'Recommended', exact: true }).click();
  await expect(shelf.locator('.is-selected .wk-tile__name')).toHaveText(original!);
  await expect(page.getByRole('tab', { name: 'Recommended', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Recommended', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /uses the same products/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Fewer stores', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Fewer stores', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('status').filter({ hasText: /Fewer stores uses the same products|Applied Fewer stores/ })).toBeVisible();
});

test('start over opens an improved editable prompt and waits for the user to run it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('office under $1500');
  await page.getByRole('button', { name: 'Make my list' }).click();
  await page.getByRole('button', { name: 'Find products for this list' }).click();
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue('Find suitable products for office under $1500. Compare product fit, prices and available sellers.');
  await expect(page.locator('.wk-shelf')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('textbox')).toHaveValue(/Find suitable products/);
  await page.getByRole('textbox').fill('office with a standing desk under $2000');
  await page.getByRole('button', { name: 'Update my list' }).click();
  await expect(page.getByRole('form', { name: 'Review shopping list' })).toBeVisible();
});
