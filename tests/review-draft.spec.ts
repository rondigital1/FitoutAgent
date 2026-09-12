import { test, expect, type Locator } from '@playwright/test';

test('review budget and date survive reload, clearing, and confirmation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'What do you need?' }).fill('office under $1500');
  await page.getByRole('button', { name: 'Make my list' }).click();
  await page.getByRole('spinbutton', { name: 'Total budget' }).fill('2300.25');
  await page.getByText('Delivery date · optional', { exact: true }).click();
  await page.getByLabel('Needed by').fill('2027-06-15');
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Total budget' })).toHaveValue('2300.25');
  await page.getByText('Delivery date · optional', { exact: true }).click();
  await expect(page.getByLabel('Needed by')).toHaveValue('2027-06-15');
  await page.getByRole('spinbutton', { name: 'Total budget' }).fill('');
  await page.getByLabel('Needed by').fill('');
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Total budget' })).toHaveValue('');
  await page.getByText('Delivery date · optional', { exact: true }).click();
  await expect(page.getByLabel('Needed by')).toHaveValue('');
  await page.getByRole('spinbutton', { name: 'Total budget' }).fill('2300.25');
  await page.getByLabel('Needed by').fill('2027-06-15');
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Total budget' })).toHaveValue('2300.25');
  const submitted = page.waitForRequest(r => r.url().endsWith('/agent') && r.postDataJSON()?.forwardedProps?.decision?.type === 'confirm-checklist');
  await page.getByRole('button', { name: 'Find products for this list' }).click();
  expect((await submitted).postDataJSON().forwardedProps.decision).toMatchObject({ budget: 230025, deadline: '2027-06-15' });
  await expect(page.getByRole('heading', { name: 'Offers by category' })).toBeVisible();
});

test('older item-only drafts use server budget defaults', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'What do you need?' }).fill('office under $1500');
  await page.getByRole('button', { name: 'Make my list' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Total budget' })).toHaveValue('1500');
  await page.evaluate(() => {
    const key = `fitoutagent-review-${localStorage.getItem('fitoutagent-thread')}`;
    const saved = JSON.parse(localStorage.getItem(key)!);
    delete saved.budget; delete saved.deadline;
    saved.items[0].quantity = 3;
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Total budget' })).toHaveValue('1500');
  await expect(page.getByRole('spinbutton', { name: /quantity/ }).first()).toHaveValue('3');
});

for (const goal of ['office', 'office under $1500']) {
  test(`budget presets can be toggled and skipped for ${goal}`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'What do you need?' }).fill(goal);
    await page.getByRole('button', { name: 'Make my list' }).click();
    const input = page.getByRole('spinbutton', { name: 'Total budget' });
    const tiers = page.locator('.wk-budget__tier');
    await expect(tiers).toHaveCount(4);
    // Theme-agnostic: a pressed tier must not look like an unpressed one.
    const background = (tier: Locator) => tier.evaluate(el => getComputedStyle(el).backgroundColor);
    const idle = await background(tiers.first());
    for (const [label, amount] of [['Minimal', '1000'], ['Balanced', '3000'], ['Premium', '5000'], ['Luxury', '10000']]) {
      const button = page.getByRole('button', { name: new RegExp(label) });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => background(button)).not.toBe(idle);
      await expect(input).toHaveValue(amount);
      await expect(page.locator('.wk-budget__tier[aria-pressed="true"]')).toHaveCount(1);
    }
    await page.reload();
    const luxury = page.getByRole('button', { name: /Luxury/ });
    await expect(luxury).toHaveAttribute('aria-pressed', 'true');
    await luxury.focus();
    await page.keyboard.press('Space');
    await expect(input).toHaveValue('');
    await page.reload();
    await expect(page.locator('.wk-budget__tier[aria-pressed="true"]')).toHaveCount(0);
    const submitted = page.waitForRequest(r => r.url().endsWith('/agent') && r.postDataJSON()?.forwardedProps?.decision?.type === 'confirm-checklist');
    await page.getByRole('button', { name: 'Find products for this list' }).click();
    expect((await submitted).postDataJSON().forwardedProps.decision.budget).toBeNull();
    await expect(page.getByRole('heading', { name: 'Offers by category' })).toBeVisible();
    await expect(page.getByText('No spending limit set', { exact: true })).toBeVisible();
  });
}

test('budget buttons fit narrow panels and wide screens', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'What do you need?' }).fill('office');
  await page.getByRole('button', { name: 'Make my list' }).click();
  const tiers = page.locator('.wk-budget__tier');
  await expect(tiers).toHaveCount(4);
  for (const width of [280, 390, 1000]) {
    await page.setViewportSize({ width, height: 900 });
    const boxes = await Promise.all([0, 1, 2, 3].map(i => tiers.nth(i).boundingBox()));
    for (const box of boxes) {
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(boxes[0]!.y).toBe(boxes[1]!.y);
    if (width < 460) expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y);
    else expect(boxes[2]!.y).toBe(boxes[0]!.y);
  }
});
