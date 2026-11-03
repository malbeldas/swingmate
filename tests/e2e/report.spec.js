// UC-034 against the local Supabase, Mailpit and the example host and listings in
// supabase/seed.sql (local and CI only, BR-TRU-006). What reaches the admin queue is checked in
// supabase/tests/database/14_reports.sql, since the person who reports never reads it (P-22).
import { test, expect } from '@playwright/test';
import {
  PASSWORD, SEED_HOST, createMember, requireLocalSupabase, sheet, startConversation, uniqueEmail,
} from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const ALWAYS_FREE = '00000000-0000-0000-0000-00000000f001'; // Baldivis
const TILE = new URL('./fixtures/tile.png', import.meta.url).pathname;
const reportSheet = (page) => page.locator('#report-sheet');

function perthDay(offset = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
const uniqueName = (testInfo, who) => `${who} ${testInfo.project.name.slice(0, 3)}${Date.now() % 100000}`;

async function logIn(page, email, password = PASSWORD) {
  await page.locator('#account').getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(password);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
}

async function seekerWithConversation(request, testInfo) {
  const email = uniqueEmail(testInfo, 'rep');
  const name = uniqueName(testInfo, 'Rey');
  const session = await createMember(request, email, name);
  const id = await startConversation(request, session, ALWAYS_FREE, 'Hi, is the room free?', perthDay(7), perthDay(14));
  return { email, name, id };
}

async function asPage(browser) {
  const page = await (await browser.newContext()).newPage();
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ path: TILE, contentType: 'image/png' }));
  return page;
}

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ path: TILE, contentType: 'image/png' }));
});

test('UC-034 a visitor who reports a listing is asked to sign up first', async ({ page }) => {
  await page.goto(`/listing.html?id=${ALWAYS_FREE}`);
  await page.getByRole('button', { name: 'Report this listing' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Create your SwingMate account' })).toBeVisible();
  await expect(reportSheet(page)).toHaveCount(0);
});

test('AC-034-2 a member reports a listing with a reason and gets the 24-hour promise', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'report');
  await createMember(request, email);
  await page.goto(`/listing.html?id=${ALWAYS_FREE}`);
  await logIn(page, email);
  await page.getByRole('button', { name: 'Report this listing' }).click();
  await expect(reportSheet(page).getByRole('heading', { name: 'Report this listing' })).toBeVisible();

  // BR-TRU-005: the reason comes first.
  await reportSheet(page).getByRole('button', { name: 'Send report' }).click();
  await expect(page.locator('#report-error')).toHaveText('Choose a reason.');

  await reportSheet(page).getByLabel('Scam or asking for money').check();
  await reportSheet(page).getByLabel('Anything else we should know? (optional)').fill('Asked for the bond by PayID before a visit.');
  const sent = page.waitForResponse((res) => res.url().includes('/rest/v1/reports') && res.request().method() === 'POST');
  await reportSheet(page).getByRole('button', { name: 'Send report' }).click();
  expect((await sent).status()).toBe(201);
  await expect(reportSheet(page).getByRole('heading', { name: 'Thanks, we’ll review this within 24 hours' })).toBeVisible();
  await reportSheet(page).getByRole('button', { name: 'Close' }).click();
  await expect(reportSheet(page)).toBeHidden();
});

test('AC-034-1 after the host blocks, the seeker cannot send, and unblocking undoes it', async ({ browser, request }, testInfo) => {
  const seeker = await seekerWithConversation(request, testInfo);
  const host = await asPage(browser);
  await host.goto('/messages.html');
  await logIn(host, SEED_HOST.email, SEED_HOST.password);
  await host.goto(`/messages.html?c=${seeker.id}`);
  await host.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(host.locator('#report-sheet').getByRole('heading', { name: `Block ${seeker.name}?` })).toBeVisible();
  await host.locator('#confirm-block').click();
  await expect(host.locator('#blocked-note')).toHaveText(`You blocked ${seeker.name}. They can’t message you.`);

  const seekerPage = await asPage(browser);
  await seekerPage.goto('/messages.html');
  await logIn(seekerPage, seeker.email);
  await seekerPage.goto(`/messages.html?c=${seeker.id}`);
  // BR-MSG-006: nothing on the seeker's screen says there is a block.
  await expect(seekerPage.locator('#blocked-note')).toHaveCount(0);
  await seekerPage.getByPlaceholder('Write a message…').fill('Hello? Still free?');
  await seekerPage.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(seekerPage.locator('#reply-error')).toHaveText('You can’t send messages in this conversation.');

  // UC-034 A2: the host unblocks and the message goes through.
  await host.getByRole('button', { name: 'Unblock' }).click();
  await expect(host.locator('#blocked-note')).toHaveCount(0);
  await seekerPage.getByRole('button', { name: 'Try again' }).click();
  await expect(seekerPage.locator('#thread .bubble.mine').last()).toContainText('Hello? Still free?');
});

test('AC-034-2 a seeker reports the conversation and blocks the host in the same step', async ({ page, request }, testInfo) => {
  const seeker = await seekerWithConversation(request, testInfo);
  await page.goto('/messages.html');
  await logIn(page, seeker.email);
  await page.goto(`/messages.html?c=${seeker.id}`);
  await page.locator('#report-conversation').click();
  await expect(reportSheet(page).getByRole('heading', { name: 'Report this conversation' })).toBeVisible();
  await reportSheet(page).getByLabel('Unsafe behaviour').check();
  await reportSheet(page).getByLabel('Also block Seed Host').check();
  await reportSheet(page).getByRole('button', { name: 'Send report' }).click();
  await expect(reportSheet(page).getByRole('heading', { name: 'Thanks, we’ll review this within 24 hours' })).toBeVisible();
  await reportSheet(page).getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#blocked-note')).toHaveText('You blocked Seed Host. They can’t message you.');
  await expect(page.getByRole('button', { name: 'Unblock' })).toBeVisible();
});
