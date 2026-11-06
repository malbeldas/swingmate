// The pilot funnel (#29, BR-ANL-001, BR-ANL-002, observability.md §2 and §3) against the local
// Supabase and the example listings and admin in supabase/seed.sql (local and CI only, BR-TRU-006).
import { test, expect } from '@playwright/test';
import { SEED_ADMIN, requireLocalSupabase, sheet } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const BALDIVIS = 50054;
const ALWAYS_FREE = '00000000-0000-0000-0000-00000000f001';
const TILE = new URL('./fixtures/tile.png', import.meta.url).pathname;

function perthDay(offset = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
const stay = `in=${perthDay(7)}&out=${perthDay(21)}`;

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ path: TILE, contentType: 'image/png' }));
  await page.addInitScript(() => { try { localStorage.setItem('swingmate.firstVisitDone', '1'); } catch { /* */ } });
});

function recordEvents(page) {
  const events = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/rest/v1/analytics_events')) {
      const body = req.postDataJSON();
      for (const e of [].concat(body)) events.push(e);
    }
  });
  return events;
}

test('#29 scenario 1 search, detail and Send are recorded, with no email, name or message text', async ({ page }) => {
  const events = recordEvents(page);
  const text = `Hi! Call me on 0412 345 678 or sam@example.com ${Date.now() % 1000}`;
  await page.goto(`/search.html?place=${BALDIVIS}&${stay}`);
  await expect(page.locator('#results-heading')).toBeVisible();
  await page.locator('.result-card').first().getByRole('link').first().click();
  await expect(page.locator('#message-box')).toBeVisible();
  await page.locator('#message-box').getByLabel('Message').fill(text);
  await page.locator('#message-box').getByRole('button', { name: 'Send message' }).click();
  await expect(sheet(page)).toBeVisible();

  const names = () => events.map((e) => e.name);
  await expect.poll(names).toEqual(expect.arrayContaining([
    'landing_viewed', 'search_performed', 'listing_viewed', 'message_draft_started', 'send_message_clicked', 'auth_gate_opened',
  ]));
  expect(events.filter((e) => e.name === 'landing_viewed')).toHaveLength(1);
  const search = events.find((e) => e.name === 'search_performed');
  expect(search.props).toMatchObject({ has_dates: true, radius_km: 15, state: 'WA' });
  expect(search.props.n_full).toBeGreaterThan(0);
  expect(events.find((e) => e.name === 'auth_gate_opened').props).toEqual({ source: 'message' });
  for (const e of events) {
    expect(Object.keys(e).sort()).toEqual(['name', 'props', 'session_id']);
    const raw = JSON.stringify(e);
    expect(raw).not.toContain('0412');
    expect(raw).not.toContain('example.com');
    expect(raw).not.toContain('Hi!');
    expect(raw).not.toContain('Baldivis');
  }
  // The same tab keeps one anonymous id across pages.
  expect(new Set(events.map((e) => e.session_id)).size).toBe(1);
});

test('#29 scenario 2 the admin sees the weekly metrics', async ({ page }) => {
  await page.goto('/admin.html#metrics');
  await page.locator('#account').getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(SEED_ADMIN.email);
  await sheet(page).getByLabel('Password').fill(SEED_ADMIN.password);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(page.locator('#metrics-title')).toHaveText('Pilot metrics');
  const table = page.locator('#metrics-table');
  await expect(table.locator('thead th')).toHaveCount(9);
  for (const label of ['Active listings', 'Conversations', 'Replied within 48 hours', 'Agreements']) {
    await expect(table.getByRole('rowheader', { name: label })).toBeVisible();
  }
  // The seed's listings are live this week.
  await expect(table.locator('[data-metric="listings"] td').first()).not.toHaveText('0');
  await expect(page.locator('#tab-metrics')).toHaveAttribute('aria-current', 'page');
});
