import { test, expect } from '@playwright/test';

test('skip an empty category, undo, reload, and prepare the remaining basket', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('office under $1500');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Missing something?' }).fill('No results item');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByRole('button', { name: 'Find products' }).click();
  const prepare = page.getByRole('button', { name: 'Create basket' });
  await expect(prepare).toBeDisabled();
  await page.getByRole('button', { name: 'Skip No results item', exact: true }).click();
  await expect(prepare).toBeEnabled();
  await expect(page.getByText('Skipped — excluded from your basket.')).toBeVisible();
  await page.getByRole('button', { name: 'Restore No results item', exact: true }).click();
  await expect(prepare).toBeDisabled();
  await page.getByRole('button', { name: 'Skip No results item', exact: true }).click();
  await expect(prepare).toBeEnabled();
  await page.reload();
  await expect(page.getByText('Skipped — excluded from your basket.')).toBeVisible();
  await expect(prepare).toBeEnabled();
  await prepare.click();
  await expect(page.getByRole('status')).toHaveText('Done');
  await expect(page.locator('.wk-basket__links a')).toHaveCount(5);
  await expect(page.getByText('Skipped categories (not in this basket): No results item.')).toBeVisible();
});
