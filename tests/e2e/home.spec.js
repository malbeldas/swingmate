import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Fixed clock: Thursday 29 Oct 2026 in Perth.
  await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+08:00'));
});

test('BR-ROS-003 a 14:7 with defaults shows 8 nights every 21 days', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await expect(page.locator('#nights-summary')).toHaveText('You need 8 nights every 21 days');
  await expect(page.locator('#anchor')).toHaveValue('2026-11-02');
  await expect(page.locator('#next-stay')).toHaveText('Next stay in town: Thu 29 Oct to Mon 2 Nov');
  await expect(page.locator('#strip [role="listitem"]')).toHaveCount(28);
  expect(errors).toEqual([]);
});

test('AC-002-1 the travel night is marked and disappears when not flying home that day', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.night.travel')).toHaveCount(1);
  await expect(page.locator('.night.travel')).toHaveAttribute('aria-label', 'Sun 15 Nov: flying home, sleeping in town');
  await page.getByLabel('Do you fly home on the last day of your swing?').uncheck();
  await expect(page.locator('.night.travel')).toHaveCount(0);
  await expect(page.locator('#nights-summary')).toHaveText('You need 7 nights every 21 days');
});

test('no horizontal scroll and the CSP of SEC-22 is present', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com");
});
