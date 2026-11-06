// UC-003 against the local Supabase and the example listings in supabase/seed.sql (local and CI
// only, BR-TRU-006). Map tiles are served from tests/e2e/fixtures (INT-005: never the real OSM).
import { test, expect } from '@playwright/test';
import { requireLocalSupabase } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const ONE_TAKEN = '00000000-0000-0000-0000-00000000f002'; // Rockingham, not free on today + 10
const PAUSED = '00000000-0000-0000-0000-00000000f008';
const DRAFT = '00000000-0000-0000-0000-00000000f007';
const TILE = new URL('./fixtures/tile.png', import.meta.url).pathname;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function perthDay(offset = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
const formatDay = (iso) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const stay = `in=${perthDay(7)}&out=${perthDay(21)}`;

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ path: TILE, contentType: 'image/png' }));
});

test('AC-003-3 the nights missing in the reasons are exactly the Unavailable nights in the calendar', async ({ page }) => {
  await page.goto(`/listing.html?id=${ONE_TAKEN}&${stay}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Seed: entire place, one night taken');
  await expect(page.locator('#fit-block .fit-badge')).toHaveText('Good date fit');
  await expect(page.locator('#fit-reasons')).toContainText('Free for 13 of the 14 nights you need');
  await expect(page.locator('#fit-reasons')).toContainText(`Not free the night of ${formatDay(perthDay(10))}`);
  const missing = await page.locator('#calendar .night.need.off').evaluateAll((cells) => cells.map((c) => c.dataset.night));
  expect(missing).toEqual([perthDay(10)]);
  await expect(page.locator('#calendar .week:not(.head)')).toHaveCount(12);
  await expect(page.locator('#calendar .night.need')).toHaveCount(14);
});

test('AC-003-4 a paused listing opens by link with its label and no message box', async ({ page }) => {
  await page.goto(`/listing.html?id=${PAUSED}`);
  await expect(page.locator('#status-label')).toHaveText('This listing is paused');
  await expect(page.locator('#message-box')).toHaveCount(0);
  await expect(page.locator('#edit-listing')).toHaveCount(0);
});

test('AC-003-5 the detail says when the calendar was updated', async ({ page }) => {
  await page.goto(`/listing.html?id=${ONE_TAKEN}`);
  await expect(page.locator('#calendar-updated')).toHaveText(/^Calendar updated (today|1 day ago|\d+ days ago)$/);
});

test('AC-003-1 the exact address is not in the page or in any network response', async ({ page }) => {
  const bodies = [];
  page.on('response', async (res) => {
    if (res.url().includes('/rest/v1/')) bodies.push(await res.text().catch(() => ''));
  });
  await page.goto(`/listing.html?id=${ONE_TAKEN}&${stay}`);
  await expect(page.locator('#host-block')).toContainText('Hosted by Seed Host');
  await expect(page.locator('#area-map.leaflet-container')).toBeVisible();
  expect(bodies.length).toBeGreaterThan(0);
  for (const body of bodies) {
    expect(body).not.toContain('Private St');
    expect(body).not.toContain('address_line');
    expect(body).not.toContain('seed-host@example.test');
    expect(body).not.toContain('61400000999');
  }
  expect(await page.content()).not.toContain('Private St');
  await expect(page.getByText('Approximate area. Seed Host shares the exact address in the chat when you both agree.')).toBeVisible();
});

test('BR-TRU-002 the host block shows name, phone verified and member since', async ({ page }) => {
  await page.goto(`/listing.html?id=${ONE_TAKEN}`);
  const host = page.locator('#host-block');
  await expect(host).toContainText('Hosted by Seed Host');
  await expect(host).toContainText('✓ Phone verified host');
  await expect(host).toContainText(/Member since \w{3} \d{4}/);
});

test('BR-TRU-008 the detail shows "Before you agree" open, with its four tips', async ({ page }) => {
  await page.goto(`/listing.html?id=${ONE_TAKEN}`);
  const guide = page.locator('#before-you-agree');
  await expect(guide).toHaveAttribute('open', '');
  await expect(guide.locator('summary')).toHaveText('Before you agree');
  await expect(guide.locator('li')).toHaveText([
    'See the place, or do a video call, before you pay anything.',
    'Show your ID only in person, never in the chat.',
    'Put what you agree in writing.',
    'Lodge the bond with the WA Bond Administrator when one applies.',
  ]);
});

test('INT-005 when the tiles fail the map hides and the suburb text stays', async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto(`/listing.html?id=${ONE_TAKEN}`);
  await expect(page.locator('#map-fallback')).toHaveText('Approximate area: Rockingham');
  await expect(page.locator('#area-map')).toBeHidden();
});

test('UC-003 E1 a draft or a missing listing shows that the home is no longer available', async ({ page }) => {
  for (const id of [DRAFT, '00000000-0000-0000-0000-0000000000ff']) {
    await page.goto(`/listing.html?id=${id}`);
    await expect(page.getByRole('heading', { name: 'This home is no longer available' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Search homes' })).toHaveAttribute('href', 'search.html');
  }
});

test('UC-003 from the results, View home opens the detail with the same stay and fit', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('swingmate.firstVisitDone', '1'); } catch { /* */ } });
  await page.goto(`/search.html?place=50054&${stay}`);
  const card = page.locator('.result-card').filter({ hasText: 'Seed: entire place, one night taken' });
  await card.getByRole('link', { name: 'View home' }).click();
  await expect(page).toHaveURL(new RegExp(`listing\\.html\\?id=${ONE_TAKEN}&place=50054&radius=15&in=${perthDay(7)}&out=${perthDay(21)}`));
  await expect(page.locator('#fit-block .fit-badge')).toHaveText('Good date fit');
  await page.getByRole('link', { name: /Back to search/ }).click();
  await expect(page).toHaveURL(new RegExp(`search\\.html\\?place=50054&radius=15&in=${perthDay(7)}&out=${perthDay(21)}`));
  await expect(page.locator('.result-card')).toHaveCount(2);
});

test('AC-001-8 the detail never scrolls sideways', async ({ page }) => {
  await page.goto(`/listing.html?id=${ONE_TAKEN}&${stay}`);
  await expect(page.locator('#calendar')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath(`detail-${test.info().project.name}.png`), fullPage: true });
});
