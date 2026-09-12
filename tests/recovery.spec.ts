import { test, expect } from '@playwright/test';

test('prompt → list → selection → every shopping link → reload → edit prompt', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Describe your project' }).fill('Set up an office for two under $1500');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Find products' }).click();
  await page.getByRole('button', { name: /desk · Studio/ }).click();
  await page.getByRole('button', { name: 'Choose this product' }).click();
  await expect(page.getByRole('button', { name: /desk · Studio.*in your plan/ })).toBeVisible();
  await page.getByRole('button', { name: 'Create basket' }).click();
  await expect(page.getByText('Merchant checkout links prepared. No payment has occurred.')).toBeVisible();
  await expect(page.locator('.wk-basket__links a')).toHaveCount(5);
  await expect(page.getByRole('status')).toHaveText('Done');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit project' }).click();
  await expect(page.getByRole('textbox', { name: 'Describe your project' })).toHaveValue('Set up an office for two under $1500');
  await page.getByRole('textbox', { name: 'Describe your project' }).fill('Camping for two under $1000');
  await page.getByRole('button', { name: 'Update list' }).click();
  await expect(page.getByRole('form', { name: 'Review shopping list' })).toBeVisible();
  await page.getByRole('button', { name: 'New order' }).click();
  await expect(page.getByRole('textbox', { name: 'Describe your project' })).toHaveValue('');
  expect(errors).toEqual([]);
});

test('missing results remain visible and editable; provider errors are shown', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('provider failure');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText('Checklist provider unavailable');
  await page.getByRole('textbox').fill('office under $1500');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Missing something?' }).fill('No results item');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByRole('button', { name: 'Find products' }).click();
  await expect(page.getByText(/No products found/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create basket' })).toBeDisabled();
  await page.getByRole('button', { name: 'Edit list' }).click();
  await page.getByRole('button', { name: 'Remove No results item' }).click();
  await page.getByRole('button', { name: 'Find products' }).click();
  await expect(page.getByRole('button', { name: 'Create basket' })).toBeEnabled();
});

test('older streamed state without sources still renders the prompt', async ({ page }) => {
  await page.route('**/agent', async route => {
    const response = await route.fetch();
    const body = (await response.text()).split('\n').map(line => {
      if (!line.startsWith('data:')) return line;
      const event = JSON.parse(line.slice(5));
      if (event.snapshot) delete event.snapshot.discoverySources;
      return `data: ${JSON.stringify(event)}`;
    }).join('\n');
    await route.fulfill({ response, body });
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Ready');
  await expect(page.getByRole('textbox', { name: 'Describe your project' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});


test('partial retailer failures are visible alongside usable products and survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('office under $1500 retailer outage');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Find products' }).click();
  const reports = page.getByRole('complementary', { name: 'Retailer search results' });
  await expect(reports).toContainText('Shopify marketplace');
  await expect(reports).toContainText('Retailer returned HTTP 429');
  await expect(page.getByRole('button', { name: 'Create basket' })).toBeEnabled();
  await page.reload();
  await expect(reports).toContainText('Retailer returned HTTP 429');
  await page.screenshot({ path: 'test-results/retailer-search.png', fullPage: true });
});
