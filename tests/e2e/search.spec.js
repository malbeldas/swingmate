// UC-001 against the local Supabase and the example listings in supabase/seed.sql (local and CI
// only, BR-TRU-006). Needs `supabase start` and `npm run local:config`, which CI runs first.
import { test, expect } from '@playwright/test';
import { requireLocalSupabase } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const BALDIVIS = 90002;
const KALGOORLIE = 90006;
const SEED = {
  allFree: 'Seed: room free every night',
  oneTaken: 'Seed: entire place, one night taken',
  half: 'Seed: room free for half the stay',
  most: 'Seed: room free most of the stay',
  mandurah: 'Seed: room in Mandurah',
  karratha: 'Seed: room in Karratha',
  draft: 'Seed: draft never shown',
};

function perthDay(offset = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const cards = (page) => page.locator('.result-card');
const card = (page, title) => cards(page).filter({ has: page.getByRole('heading', { name: title }) });
const titles = (page) => cards(page).locator('h2').allTextContents();
// Filters fold above the list on phones; open them before using them.
async function openFilters(page) {
  const filters = page.locator('#filters');
  if (!(await filters.evaluate((d) => d.open))) await filters.locator('summary').click();
}
const stay = `in=${perthDay(7)}&out=${perthDay(21)}`;

test.beforeEach(async ({ page }, testInfo) => {
  // The first-visit strip has its own test; keep it out of the way in the others.
  if (testInfo.title.startsWith('AC-002-5')) return;
  await page.addInitScript(() => { try { localStorage.setItem('swingmate.firstVisitDone', '1'); } catch { /* */ } });
});

test('AC-001-5 only homes inside the radius show, and a wider radius brings more', async ({ page }) => {
  await page.goto(`/search.html?place=${BALDIVIS}`);
  await expect(page.locator('#results-heading')).toHaveText('4 homes near Baldivis, WA');
  const shown = await titles(page);
  expect(shown).toEqual(expect.arrayContaining([SEED.allFree, SEED.oneTaken, SEED.half, SEED.most]));
  expect(shown).not.toContain(SEED.mandurah);
  expect(shown).not.toContain(SEED.karratha);
  expect(shown).not.toContain(SEED.draft);
  await expect(page.getByLabel('Radius')).toHaveValue('15');

  await page.getByLabel('Radius').selectOption('25');
  await expect(page.locator('#results-heading')).toHaveText('5 homes near Baldivis, WA');
  await expect(card(page, SEED.mandurah)).toBeVisible();
  await expect(page).toHaveURL(/radius=25/);
});

test('AC-001-1 AC-001-3 AC-001-4 dates set the nights, Great before Good, Partial only on request, Poor never', async ({ page }) => {
  await page.goto(`/search.html?place=${BALDIVIS}&${stay}`);
  await expect(page.locator('#results-heading')).toHaveText('2 homes near Baldivis, WA');
  expect(await titles(page)).toEqual([SEED.allFree, SEED.oneTaken]);
  await expect(card(page, SEED.allFree).locator('.fit-badge')).toHaveText('Great date fit');
  await expect(card(page, SEED.allFree)).toContainText('Free for all 14 nights you need');
  await expect(card(page, SEED.oneTaken).locator('.fit-badge')).toHaveText('Good date fit');
  await expect(card(page, SEED.oneTaken)).toContainText('Free for 13 of 14 nights you need');
  await expect(page.getByText('Sorted by fit first, then price')).toBeVisible();

  await page.getByRole('button', { name: 'Show near matches (1)' }).click();
  expect(await titles(page)).toEqual([SEED.allFree, SEED.oneTaken, SEED.most]);
  await expect(card(page, SEED.most).locator('.fit-badge')).toHaveText('Partial fit');
  expect(await titles(page)).not.toContain(SEED.half);
  await expect(page.getByText("Homes that don't fit are never shown.").first()).toBeVisible();
});

test('BR-FIT-006 without dates or roster homes show without a fit label', async ({ page }) => {
  await page.goto(`/search.html?place=${BALDIVIS}`);
  await expect(cards(page)).toHaveCount(4);
  await expect(page.locator('.result-card .fit-badge')).toHaveCount(0);
  await expect(cards(page).first()).toContainText('Add your dates or roster to see the fit');
  await openFilters(page);
  await expect(page.getByText('Add dates or your roster to filter by fit.')).toBeVisible();
});

test('AC-001-6 filters that leave nothing show the empty state, and Clear filters brings the homes back', async ({ page }) => {
  await page.goto(`/search.html?place=${BALDIVIS}`);
  await expect(cards(page)).toHaveCount(4);
  await openFilters(page);
  await page.getByLabel('Entire place').check();
  await expect(cards(page)).toHaveCount(1);
  await page.getByLabel('Max price per week').selectOption('300');
  await expect(page.getByRole('heading', { name: 'No homes match these filters' })).toBeVisible();
  await expect(page.getByText('There are homes in Baldivis, WA, but your filters hide them.')).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(cards(page)).toHaveCount(4);
});

test('AC-001-7 a place without homes shows the ways out and never an invented home', async ({ page }) => {
  await page.goto(`/search.html?place=${KALGOORLIE}`);
  await expect(page.getByRole('heading', { name: 'No places in Kalgoorlie, WA yet' })).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Search \d+ km around/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Have a spare room in Kalgoorlie, WA? List it for free' })).toBeVisible();
});

test('UC-001 E1 and E2 an unknown place or bad dates do not search', async ({ page }) => {
  await page.goto('/search.html');
  await page.getByLabel('Location').fill('Nowhere at all');
  await page.getByRole('button', { name: 'Search homes' }).click();
  await expect(page.getByText('Choose a suburb or city from the list')).toBeVisible();
  await expect(cards(page)).toHaveCount(0);

  await page.getByLabel('Location').fill('Baldivis, WA');
  await page.getByLabel('From').fill(perthDay(10));
  await page.getByLabel('To').fill(perthDay(5));
  await page.getByRole('button', { name: 'Search homes' }).click();
  await expect(page.getByText('Check-out is after check-in')).toBeVisible();
  await expect(cards(page)).toHaveCount(0);

  await page.getByLabel('To').fill(perthDay(12));
  await page.getByRole('button', { name: 'Search homes' }).click();
  await expect(page.locator('#results-heading')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`place=${BALDIVIS}&radius=15&in=${perthDay(10)}&out=${perthDay(12)}`));
});

test('UC-001 E3 a server error offers to try again and keeps the search', async ({ page }) => {
  let fail = true;
  await page.route('**/rest/v1/rpc/search_listings', (route) => (fail ? route.fulfill({ status: 500, body: '{}' }) : route.fallback()));
  await page.goto(`/search.html?place=${BALDIVIS}`);
  await expect(page.getByText("We couldn't load homes. Try again.")).toBeVisible();
  await expect(page.getByLabel('Location')).toHaveValue('Baldivis, WA');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(cards(page)).toHaveCount(4);
});

test('BR-SRC-001 with a roster and no dates the fit is by roster; dates then win', async ({ page }) => {
  await page.goto(`/search.html?place=${BALDIVIS}`);
  await page.getByRole('button', { name: 'Add my roster' }).click();
  await page.locator('#roster-picker').getByRole('button', { name: 'Save roster' }).click();
  await expect(page.locator('#roster-summary')).toHaveText(/^14:7 · next swing .+ · Edit$/);
  await expect(card(page, SEED.allFree).locator('.fit-badge')).toHaveText('Great roster fit');
  await expect(page.locator('.legend').getByText('Your R&R')).toBeVisible();

  await page.goto(`/search.html?place=${BALDIVIS}&${stay}`);
  await expect(card(page, SEED.allFree).locator('.fit-badge')).toHaveText('Great date fit');
  await expect(page.getByText('Your dates are used for this search instead of your roster.')).toBeVisible();
});

test('AC-001-8 the card shows 4 dated weeks and the page never scrolls sideways', async ({ page }) => {
  await page.goto(`/search.html?place=${BALDIVIS}&${stay}`);
  const first = cards(page).first();
  await expect(first.locator('.week')).toHaveCount(4);
  await expect(first.locator('.week-label').first()).toHaveText(/^\d{1,2} \w{3}$/);
  await expect(first.locator('.night')).toHaveCount(28);
  await expect(first.locator('.night').first()).toHaveAttribute('title', /^\d{1,2} \w{3}: (Available|Unavailable)/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath(`results-${test.info().project.name}.png`), fullPage: true });
});

test('AC-002-5 the first-visit strip goes away for good once closed, without personal data', async ({ page }) => {
  await page.goto(`/search.html?place=${BALDIVIS}`);
  const strip = page.locator('#first-visit');
  await expect(strip).toBeVisible();
  await expect(strip.locator('li')).toHaveCount(3);
  await strip.getByRole('button', { name: 'Close how it works' }).click();
  await expect(strip).toBeHidden();
  await page.reload();
  await expect(cards(page).first()).toBeVisible();
  await expect(strip).toBeHidden();
  const stored = await page.evaluate(() => ({ ...localStorage }));
  expect(stored).toEqual({ 'swingmate.firstVisitDone': '1' });
});
