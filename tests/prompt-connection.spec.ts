import { test, expect } from '@playwright/test';

test('failed prompt request gives recovery instructions and preserves the prompt across reload', async ({ page }) => {
  let offline = true;
  await page.route('**/agent', route => {
    const type = route.request().postDataJSON()?.forwardedProps?.decision?.type;
    return offline && type === 'start' ? route.abort('failed') : route.continue();
  });
  await page.goto('/');
  const prompt = page.getByRole('textbox', { name: 'What do you need?' });
  await prompt.fill('office under $1500');
  await page.getByRole('button', { name: 'Make my list' }).click();
  await expect(page.getByRole('alert')).toContainText('Cannot connect to the local runtime');
  await expect(page.getByRole('alert')).toContainText('pnpm dev');
  await expect(prompt).toHaveValue('office under $1500');
  await page.reload();
  await expect(prompt).toHaveValue('office under $1500');
  offline = false;
  await page.getByRole('button', { name: 'Make my list' }).click();
  await expect(page.getByRole('form', { name: 'Review shopping list' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('unsent prompt and shopping mode survive reload and new project clears both', async ({ page }) => {
  await page.goto('/');
  const prompt = page.getByRole('textbox', { name: 'What do you need?' });
  await prompt.fill('office');
  await page.getByRole('radio', { name: /Let the agent/ }).check();
  await page.reload();
  await expect(prompt).toHaveValue('office');
  await expect(page.getByRole('radio', { name: /Let the agent/ })).toBeChecked();
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(prompt).toHaveValue('');
  await expect(page.getByRole('radio', { name: /Choose item by item/ })).toBeChecked();
});

test('unsent edits to an existing prompt survive initial state restoration', async ({ page }) => {
  await page.goto('/');
  const prompt = page.getByRole('textbox', { name: 'What do you need?' });
  await prompt.fill('office under $1500');
  await page.getByRole('button', { name: 'Make my list' }).click();
  await expect(page.getByRole('form', { name: 'Review shopping list' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit prompt' }).click();
  await prompt.fill('office under $2000 with two desks');
  await page.reload();
  await expect(page.getByRole('form', { name: 'Review shopping list' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit prompt' }).click();
  await expect(prompt).toHaveValue('office under $2000 with two desks');
  await page.getByRole('button', { name: 'Update my list' }).click();
  await expect(page.getByRole('form', { name: 'Review shopping list' })).toContainText('office under $2000 with two desks');
});
