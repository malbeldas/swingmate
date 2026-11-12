// The home as the product (UC-001, DEC-018): a thin Coming soon banner, the search in the hero and
// the newest homes around Perth. Runs against the local Supabase and supabase/seed.sql (local and
// CI only, BR-TRU-006). Needs `supabase start` and `npm run local:config`, which CI runs first.
import { test, expect } from '@playwright/test';
import { requireLocalSupabase } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const BALDIVIS = 50054;

function perthDay(offset = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

test('the home shows the Coming soon banner above the header', async ({ page }) => {
  await page.goto('/');
  const banner = page.locator('#soon-banner');
  await expect(banner).toHaveText('Coming soon · Pilot opening in Perth');
  const [bannerBox, headerBox] = [await banner.boundingBox(), await page.locator('.site-header').boundingBox()];
  expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(headerBox.y + 1);
  expect(bannerBox.height).toBeLessThan(60);
});

test('AC-001-1 searching from the home opens the results with the place and dates', async ({ page }) => {
  await page.goto('/');
  const form = page.locator('#home-search');
  await expect(form).toBeVisible();
  await form.getByLabel('Location').fill('Baldivis, WA');
  await form.getByLabel('From', { exact: true }).fill(perthDay(7));
  await form.getByLabel('To', { exact: true }).fill(perthDay(21));
  await form.getByRole('button', { name: 'Search homes' }).click();
  await expect(page).toHaveURL(new RegExp(`search\\.html\\?place=${BALDIVIS}&in=${perthDay(7)}&out=${perthDay(21)}`));
  await expect(page.locator('#results-heading')).toHaveText(/near Baldivis, WA/);
});

test('UC-001 E1 E2 the home search asks for a place and for dates in order', async ({ page }) => {
  await page.goto('/');
  const form = page.locator('#home-search');
  await form.getByRole('button', { name: 'Search homes' }).click();
  await expect(page.locator('#home-place-error')).toBeVisible();
  await expect(page).toHaveURL(/\/(index\.html)?$/);
  await form.getByLabel('Location').fill('Baldivis, WA');
  await form.getByLabel('From', { exact: true }).fill(perthDay(10));
  await form.getByLabel('To', { exact: true }).fill(perthDay(5));
  await form.getByRole('button', { name: 'Search homes' }).click();
  await expect(page.locator('#home-place-error')).toBeHidden();
  await expect(page.locator('#home-dates-error')).toBeVisible();
  await expect(page).toHaveURL(/\/(index\.html)?$/);
});

test('BR-FIT-006 the home lists published homes around Perth, newest first, linking to each home', async ({ page }) => {
  await page.goto('/');
  const homes = page.locator('#homes');
  await expect(homes).toBeVisible();
  const cards = homes.locator('.home-card');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThanOrEqual(6);
  const titles = await cards.locator('h3').allTextContents();
  expect(titles).not.toContain('Seed: draft never shown');
  expect(titles).not.toContain('Seed: room in Karratha');
  await expect(cards.first()).toHaveAttribute('href', /^listing\.html\?id=[0-9a-f-]+&place=51230&radius=50$/);
  await expect(homes.locator('#homes-all')).toHaveAttribute('href', 'search.html?place=51230&radius=50');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
