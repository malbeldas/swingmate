// Alerts (#31, UC-006) against the local Supabase, Mailpit and supabase/seed.sql. Each test uses its
// own new member. The daily email (UC-053) is tested in tests/unit/alerts.test.js and
// supabase/tests/database/30_search_alerts.sql: CI starts Supabase without the Edge runtime.
import { test, expect } from '@playwright/test';
import { PASSWORD, codeFor, createMember, local, requireLocalSupabase, sheet, uniqueEmail } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const BALDIVIS = 90002;
const KALGOORLIE = 90006; // no homes in the seed
const TILE = new URL('./fixtures/tile.png', import.meta.url).pathname;

const perthToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date());
const plusDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const stay = () => ({ in: plusDays(perthToday(), 30), out: plusDays(perthToday(), 37) });

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ path: TILE, contentType: 'image/png' }));
  await page.addInitScript(() => { try { localStorage.setItem('swingmate.firstVisitDone', '1'); } catch { /* */ } });
});

async function logIn(page, email) {
  await page.locator('#account').getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
}

test('UC-006 a member creates an alert from the results, then pauses, resumes and deletes it in My account', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'alert');
  await createMember(request, email, 'Kit');
  const { in: checkIn, out: checkOut } = stay();
  await page.goto(`/search.html?place=${BALDIVIS}&in=${checkIn}&out=${checkOut}`);
  await logIn(page, email);
  await expect(page.locator('.result-card').first()).toBeVisible();
  // A part of the list that doesn't show never prints as text.
  await expect(page.locator('#results')).not.toContainText('false');

  await page.getByRole('button', { name: 'Create an alert' }).click();
  await expect(page.locator('#alert-created')).toHaveText('We’ll email you when a home fits. Manage alerts');
  await page.locator('#alert-created').getByRole('link', { name: 'Manage alerts' }).click();

  const alerts = page.locator('#alerts');
  await expect(alerts.getByRole('heading', { name: 'Alerts' })).toBeVisible();
  const card = alerts.locator('[data-alert]');
  await expect(card).toHaveCount(1);
  await expect(card.locator('h3')).toHaveText(/^Baldivis, WA · 15 km · /);
  await expect(card.locator('.place-status')).toHaveText(/^Emails on · until /);

  await card.getByRole('button', { name: 'Pause' }).click();
  await expect(card.locator('.place-status')).toHaveText('Paused');
  await card.getByRole('button', { name: 'Resume' }).click();
  await expect(card.locator('.place-status')).toHaveText(/^Emails on/);
  await card.getByRole('button', { name: 'Delete' }).click();
  await expect(alerts.locator('#alerts-empty')).toHaveText('No alerts yet. Search a place and tap “Create an alert”.');
});

test('UC-006 a visitor taps Create an alert on an empty search, signs up, and the alert is saved', async ({ page, request }, testInfo) => {
  const { in: checkIn, out: checkOut } = stay();
  await page.goto(`/search.html?place=${KALGOORLIE}&in=${checkIn}&out=${checkOut}`);
  await expect(page.getByRole('heading', { name: 'No places in Kalgoorlie, WA yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Create an alert' }).click();

  await expect(sheet(page).getByRole('heading', { name: 'Create your SwingMate account' })).toBeVisible();
  const email = uniqueEmail(testInfo, 'alertgate');
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Create a password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Continue with email' }).click();
  await sheet(page).getByLabel('Code').fill(await codeFor(request, email));
  await sheet(page).getByRole('button', { name: 'Verify email' }).click();
  await sheet(page).getByLabel('Name shown to hosts').fill('Lou');
  await sheet(page).getByLabel("Where you're based (suburb)").fill('Kalgoorlie, WA');
  await sheet(page).getByLabel('I agree to the Terms of Use and Privacy Policy').check();
  await sheet(page).getByRole('button', { name: 'Finish' }).click();
  await expect(sheet(page)).toBeHidden();

  await expect(page.locator('#alert-created')).toBeVisible();
  await page.goto('/account.html#alerts');
  await expect(page.locator('#alerts [data-alert] h3')).toHaveText(/^Kalgoorlie, WA · 40 km · /);
});

test('UC-006 E1 with 5 alerts on, a sixth asks to pause or delete one first', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'alertlimit');
  const session = await createMember(request, email, 'Max');
  const today = perthToday();
  const rows = Array.from({ length: 5 }, (_, i) => ({
    suburb_id: KALGOORLIE, radius_km: 40, stay_from: plusDays(today, 40 + i), stay_to: plusDays(today, 45 + i), use_roster: false,
  }));
  const res = await request.post(`${local.url}/rest/v1/search_alerts`, {
    headers: { apikey: local.anonKey, authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json', prefer: 'return=minimal' },
    data: rows,
  });
  expect(res.ok(), `insert ${res.status()}`).toBe(true);

  const { in: checkIn, out: checkOut } = stay();
  await page.goto(`/search.html?place=${KALGOORLIE}&in=${checkIn}&out=${checkOut}`);
  await logIn(page, email);
  await page.getByRole('button', { name: 'Create an alert' }).click();
  await expect(page.locator('#alert-box .form-error')).toHaveText('You have 5 alerts on. Pause or delete one in My account first.');
});

test('BR-MAIL-005 alert emails can be switched off in Notifications', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'alertoff');
  await createMember(request, email, 'Ned');
  await page.goto('/account.html#notifications');
  await page.locator('#account-main').getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  const box = page.getByLabel('Email me about new homes that fit my roster');
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect(page.locator('#notify-status')).toHaveText('Saved.');
  await page.reload();
  await expect(page.getByLabel('Email me about new homes that fit my roster')).not.toBeChecked();
  await expect(page.getByLabel('Email me when I get a new message')).toBeChecked();
});
