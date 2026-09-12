import { test, expect } from '@playwright/test';

test('failed prompt request gives recovery instructions and preserves the prompt across reload', async ({ page }) => {
  let offline = true;
  await page.route('**/agent', route => {
    const type = route.request().postDataJSON()?.forwardedProps?.decision?.type;
    return offline && type === 'start' ? route.abort('failed') : route.continue();
  });
  await page.goto('/');
  const prompt = page.getByRole('textbox', { name: 'Describe your project' });
  await prompt.fill('office under $1500');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText('Cannot connect to the local runtime');
  await expect(page.getByRole('alert')).toContainText('pnpm dev');
  await expect(prompt).toHaveValue('office under $1500');
  await page.reload();
  await expect(prompt).toHaveValue('office under $1500');
  offline = false;
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('form', { name: 'Review shopping list' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('unsent prompt and shopping mode survive reload and new project clears both', async ({ page }) => {
  await page.goto('/');
  const prompt = page.getByRole('textbox', { name: 'Describe your project' });
  await prompt.fill('office');
  await page.getByRole('radio', { name: /Handle it for me/ }).check();
  await page.reload();
  await expect(prompt).toHaveValue('office');
  await expect(page.getByRole('radio', { name: /Handle it for me/ })).toBeChecked();
  await page.getByRole('button', { name: 'New order' }).click();
  await expect(prompt).toHaveValue('');
  await expect(page.getByRole('radio', { name: /Choose item by item/ })).toBeChecked();
});

test('unsent edits to an existing prompt survive initial state restoration', async ({ page }) => {
  await page.goto('/');
  const prompt = page.getByRole('textbox', { name: 'Describe your project' });
  await prompt.fill('office under $1500');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('form', { name: 'Review shopping list' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit project' }).click();
  await prompt.fill('office under $2000 with two desks');
  await page.reload();
  await expect(page.getByRole('form', { name: 'Review shopping list' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit project' }).click();
  await expect(prompt).toHaveValue('office under $2000 with two desks');
  await page.getByRole('button', { name: 'Update list' }).click();
  await expect(page.getByRole('form', { name: 'Review shopping list' })).toContainText('office under $2000 with two desks');
});
