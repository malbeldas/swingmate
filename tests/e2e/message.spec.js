// UC-004 against the local Supabase, Mailpit and the example listings in supabase/seed.sql (local and
// CI only, BR-TRU-006). Google is never called (INT-001): its return is a full page load, which a
// reload stands in for. Map tiles come from tests/e2e/fixtures (INT-005).
import { test, expect } from '@playwright/test';
import { PASSWORD, codeFor, createMember, local, requireLocalSupabase, sheet, uniqueEmail } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const ALWAYS_FREE = '00000000-0000-0000-0000-00000000f001'; // Baldivis
const ONE_TAKEN = '00000000-0000-0000-0000-00000000f002'; // Rockingham, not free on today + 10
const TILE = new URL('./fixtures/tile.png', import.meta.url).pathname;

function perthDay(offset = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
const IN = perthDay(7);
const OUT = perthDay(21);
const box = (page) => page.locator('#message-box');

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ path: TILE, contentType: 'image/png' }));
});

async function logInFromHeader(page, email) {
  await page.locator('#account').getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
}

async function conversationsOf(request, session) {
  const res = await request.get(`${local.url}/rest/v1/conversations?select=id,listing_id,stay_from,stay_to`, {
    headers: { apikey: local.anonKey, authorization: `Bearer ${session.access_token}` },
  });
  return res.json();
}

test('UC-004 the box brings the dates of the search and the host name', async ({ page }) => {
  await page.goto(`/listing.html?id=${ALWAYS_FREE}&place=50054&in=${IN}&out=${OUT}`);
  await expect(box(page).getByRole('heading', { name: 'Message Seed Host' })).toBeVisible();
  await expect(box(page).getByLabel('Move in')).toHaveValue(IN);
  await expect(box(page).getByLabel('Move out')).toHaveValue(OUT);
  await expect(box(page)).toContainText('You’ll sign up or log in when you press Send. Your message stays saved.');
  await expect(page.locator('#message-conflict')).toBeHidden();
});

test('AC-004-4 dates with a taken night show the warning and still let the person send', async ({ page }) => {
  await page.goto(`/listing.html?id=${ONE_TAKEN}&in=${IN}&out=${OUT}`);
  await expect(page.locator('#message-conflict')).toHaveText('1 of these nights isn’t available. You can still send it, or change your dates.');
  await expect(box(page).getByRole('button', { name: 'Send message' })).toBeEnabled();
  // Moving the dates past the taken night clears the warning.
  await box(page).getByLabel('Move in').fill(perthDay(11));
  await expect(page.locator('#message-conflict')).toBeHidden();
});

test('BR-MSG-002 without dates the box asks for them before anything else', async ({ page }) => {
  await page.goto(`/listing.html?id=${ALWAYS_FREE}`);
  await box(page).getByLabel('Message').fill('Hi, is the room free?');
  await box(page).getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('#message-error')).toHaveText('Add your move-in and move-out dates.');
  await expect(sheet(page)).toHaveCount(0);
});

test('AC-004-1 AC-004-2 AC-004-3 a visitor writes, signs up with email, completes the profile and sends', async ({ page, request }, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const text = 'Hi! I work 14:7 out of Port Hedland and need a room for my R&R.';
  await page.goto(`/listing.html?id=${ALWAYS_FREE}&in=${IN}&out=${OUT}`);
  await box(page).getByLabel('Message').fill(text);
  await box(page).getByRole('button', { name: 'Send message' }).click();

  // AC-004-1: Send asks to sign up.
  await expect(sheet(page).getByRole('heading', { name: 'Create your SwingMate account' })).toBeVisible();
  const email = uniqueEmail(testInfo, 'msg');
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Create a password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Continue with email' }).click();
  await sheet(page).getByLabel('Code').fill(await codeFor(request, email));
  await sheet(page).getByRole('button', { name: 'Verify email' }).click();

  // AC-004-3: the minimum profile comes first, and nothing is sent until it is done.
  await expect(sheet(page).getByRole('heading', { name: 'A few details hosts need' })).toBeVisible();
  await expect(box(page)).not.toContainText('Message sent');
  await sheet(page).getByLabel('Name shown to hosts').fill('Ana');
  await sheet(page).getByLabel("Where you're based (suburb)").fill('Baldivis, WA');
  await sheet(page).getByLabel('I agree to the Terms of Use and Privacy Policy').check();
  await sheet(page).getByRole('button', { name: 'Finish' }).click();
  await expect(sheet(page)).toBeHidden();

  // AC-004-2: the text and the dates are still there, and one tap sends.
  await expect(page.locator('#message-confirm')).toHaveText('You’re signed in. Check your message and press Send.');
  await expect(box(page).getByLabel('Message')).toHaveValue(text);
  await expect(box(page).getByLabel('Move in')).toHaveValue(IN);
  await box(page).getByRole('button', { name: 'Send message' }).click();
  await expect(box(page).getByRole('heading', { name: 'Message sent to Seed Host' })).toBeVisible();
  await expect(box(page)).toContainText(text);
  await expect(box(page)).toContainText('14 nights');
  // BR-ACC-004: photo, bio and mobile are suggested, never required.
  await expect(box(page).getByRole('link', { name: 'Complete my profile' })).toHaveAttribute('href', 'account.html');
  // BR-ACC-005: the draft is gone once sent.
  expect(await page.evaluate(() => sessionStorage.getItem('swingmate.messageDraft'))).toBeNull();
  expect(errors).toEqual([]);
});

test('AC-004-2 the draft survives the full page load of coming back from Google', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'google');
  await createMember(request, email);
  const text = 'Hello, could I stay for my next R&R?';
  await page.goto(`/listing.html?id=${ALWAYS_FREE}&in=${IN}&out=${OUT}`);
  await box(page).getByLabel('Message').fill(text);
  await box(page).getByLabel('Move out').fill(perthDay(14));
  await box(page).getByRole('button', { name: 'Send message' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Continue with Google' })).toBeVisible();

  // Google leaves the page and comes back to the same URL: the draft is in the session, not the URL.
  expect(page.url()).not.toContain('Hello');
  await page.reload();
  await expect(box(page).getByLabel('Message')).toHaveValue(text);
  await expect(box(page).getByLabel('Move out')).toHaveValue(perthDay(14));

  await logInFromHeader(page, email);
  await expect(page.locator('#message-confirm')).toBeVisible();
  await expect(box(page)).toContainText('Sends straight to Seed Host.');
  await box(page).getByRole('button', { name: 'Send message' }).click();
  await expect(box(page).getByRole('heading', { name: 'Message sent to Seed Host' })).toBeVisible();
  await expect(box(page)).toContainText('7 nights');
});

test('AC-004-5 a second message on the same listing joins the same conversation', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'twice');
  const session = await createMember(request, email);
  await page.goto(`/listing.html?id=${ONE_TAKEN}&in=${IN}&out=${OUT}`);
  await logInFromHeader(page, email);
  for (const text of ['First question about the room', 'And is parking included?']) {
    await page.goto(`/listing.html?id=${ONE_TAKEN}&in=${IN}&out=${OUT}`);
    await box(page).getByLabel('Message').fill(text);
    await box(page).getByRole('button', { name: 'Send message' }).click();
    await expect(box(page).getByRole('heading', { name: 'Message sent to Seed Host' })).toBeVisible();
  }
  const conversations = await conversationsOf(request, session);
  expect(conversations).toHaveLength(1);
  expect(conversations[0]).toMatchObject({ listing_id: ONE_TAKEN, stay_from: IN, stay_to: OUT });
});

test('UC-004 E4 when sending fails the message stays with Try again', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'offline');
  await createMember(request, email);
  await page.goto(`/listing.html?id=${ALWAYS_FREE}&in=${IN}&out=${OUT}`);
  await logInFromHeader(page, email);
  await page.route('**/rest/v1/rpc/start_conversation', (route) => route.abort());
  await box(page).getByLabel('Message').fill('Is the room still free?');
  await box(page).getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('#message-error')).toHaveText('We couldn’t send your message. It’s still here, so you can try again.');
  await expect(box(page).getByLabel('Message')).toHaveValue('Is the room still free?');
  await page.unroute('**/rest/v1/rpc/start_conversation');
  await box(page).getByRole('button', { name: 'Try again' }).click();
  await expect(box(page).getByRole('heading', { name: 'Message sent to Seed Host' })).toBeVisible();
});
