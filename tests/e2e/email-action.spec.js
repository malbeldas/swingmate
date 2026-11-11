// One tap from an email (#32, UC-054 AC-054-1) and the reminders switch (BR-MAIL-005). CI starts
// Supabase without the Edge runtime, so the test answers calendar-confirm itself; the signature check
// and the database change are tested in tests/unit/reminders.test.js and
// supabase/tests/database/31_host_reminders.sql.
import { test, expect } from '@playwright/test';
import { PASSWORD, SEED_HOST, createMember, requireLocalSupabase, sheet, uniqueEmail } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const LINK = '/email-action.html?a=calendar&src=email&ntf=NTF-006#t=head.body.sig';
const LISTING = '00000000-0000-0000-0000-00000000f001';

test('AC-054-1 "My calendar is up to date" confirms without logging in, and the token leaves the address bar', async ({ page }) => {
  let sent = null;
  await page.route('**/functions/v1/calendar-confirm', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, title: 'Seed: room free every night', listing_id: LISTING }) });
  });
  await page.goto(LINK);
  await expect(page.locator('#action-result')).toHaveText('Thanks. The calendar for Seed: room free every night is marked as up to date.');
  expect(sent).toEqual({ token: 'head.body.sig' });
  expect(page.url()).not.toContain('#t=');
  await expect(page.getByRole('link', { name: 'Open My places' })).toHaveAttribute('href', 'account.html#listings');
});

test('UC-054 an expired link says so and sends the host to My places', async ({ page }) => {
  await page.route('**/functions/v1/calendar-confirm', (route) => route.fulfill({ status: 410, contentType: 'application/json', body: '{"ok":false,"reason":"expired"}' }));
  await page.goto(LINK);
  await expect(page.locator('#action-result')).toHaveText('This link has expired.');
  await expect(page.getByText('Log in to confirm it in My places.')).toBeVisible();
});

test('UC-054 a link without its token does nothing', async ({ page }) => {
  let called = false;
  await page.route('**/functions/v1/calendar-confirm', (route) => { called = true; return route.abort(); });
  await page.goto('/email-action.html?a=calendar');
  await expect(page.locator('#action-result')).toHaveText('This link doesn’t work.');
  expect(called).toBe(false);
});

async function logInOnAccountPage(page, email, password) {
  await page.goto('/account.html#notifications');
  await page.locator('#account-main').getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(password);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(page.locator('#notifications')).toBeVisible();
}

test('BR-MAIL-005 hosts and seekers can switch off reminders and the outcome question (NTF-005)', async ({ page, browser, request }, testInfo) => {
  await logInOnAccountPage(page, SEED_HOST.email, SEED_HOST.password);
  await expect(page.getByLabel('Send me reminders and follow-ups')).toBeVisible();
  await expect(page.locator('#notify-reminders-hint')).toHaveText('An enquiry you haven’t answered in 2 days, a calendar check every 30 days, and one email asking if you found a place.');

  const email = uniqueEmail(testInfo, 'noremind');
  await createMember(request, email, 'Ola');
  const other = await browser.newContext();
  const seeker = await other.newPage();
  await logInOnAccountPage(seeker, email, PASSWORD);
  await expect(seeker.getByLabel('Email me when I get a new message')).toBeVisible();
  await expect(seeker.getByLabel('Send me reminders and follow-ups')).toBeVisible();
  await expect(seeker.locator('#notify-reminders-hint')).toHaveText('Two weeks after you message a host, one email asking if you found a place.');
  await seeker.getByLabel('Send me reminders and follow-ups').uncheck();
  await expect(seeker.locator('#notify-status')).toHaveText('Saved.');
  await seeker.reload();
  await expect(seeker.getByLabel('Send me reminders and follow-ups')).not.toBeChecked();
  await other.close();
});
