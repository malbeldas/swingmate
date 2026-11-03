// UC-023 and UC-033 against the local Supabase with Realtime, Mailpit and the example host and
// listings in supabase/seed.sql (local and CI only, BR-TRU-006).
import { test, expect } from '@playwright/test';
import {
  PASSWORD, SEED_HOST, createMember, local, requireLocalSupabase, sheet, startConversation, uniqueEmail,
} from './auth-helpers.js';

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
const uniqueName = (testInfo, who) => `${who} ${testInfo.project.name.slice(0, 3)}${Date.now() % 100000}`;

async function logIn(page, email, password = PASSWORD) {
  await page.locator('#account').getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(password);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
}

async function seekerWithConversation(request, testInfo, listingId = ONE_TAKEN, body = 'Hi, is the room free for my R&R?') {
  const email = uniqueEmail(testInfo, 'kai');
  const name = uniqueName(testInfo, 'Kai');
  const session = await createMember(request, email, name);
  const id = await startConversation(request, session, listingId, body, perthDay(7), perthDay(14));
  return { email, name, session, id };
}

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ path: TILE, contentType: 'image/png' }));
});

test('UC-033 without a session the inbox asks to log in', async ({ page }) => {
  await page.goto('/messages.html');
  await expect(page.locator('#signed-out')).toContainText('Log in to see your messages');
});

test('AC-023-1 AC-023-2 the host sees the new inquiry unread, with the card and the dates against the calendar', async ({ page, request }, testInfo) => {
  const seeker = await seekerWithConversation(request, testInfo);
  await page.goto('/messages.html');
  await logIn(page, SEED_HOST.email, SEED_HOST.password);
  await page.reload();
  const row = page.locator(`[data-conversation="${seeker.id}"]`);
  await expect(row).toContainText(seeker.name);
  await expect(row.getByRole('img', { name: 'Unread' })).toBeVisible();

  await row.click();
  const card = page.locator('#inquirer-card');
  await expect(card).toContainText(`About ${seeker.name}`);
  await expect(card).toContainText('Based in Perth, WA');
  await expect(card).toContainText('✓ Email verified');
  await expect(card).toContainText('New member · first message');
  // today + 10 is taken in this listing: 6 of the 7 nights asked for are free.
  await expect(page.locator('#requested-fit')).toContainText('6 of 7 nights free. Taken:');
  await expect(page.locator('#requested-dates')).toContainText('7 nights');
  expect(await page.content()).not.toContain(seeker.email);
  // UC-033 step 4: opening marks it read.
  await expect(row.getByRole('img', { name: 'Unread' })).toHaveCount(0);
});

test('AC-033-1 AC-033-2 a reply shows in the other open session within 3 seconds, phone number and all', async ({ browser, request }, testInfo) => {
  const seeker = await seekerWithConversation(request, testInfo, ALWAYS_FREE);
  const hostPage = await (await browser.newContext()).newPage();
  const seekerPage = await (await browser.newContext()).newPage();
  for (const p of [hostPage, seekerPage]) {
    await p.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ path: TILE, contentType: 'image/png' }));
  }
  await hostPage.goto('/messages.html');
  await logIn(hostPage, SEED_HOST.email, SEED_HOST.password);
  await hostPage.goto(`/messages.html?c=${seeker.id}`);
  await seekerPage.goto('/messages.html');
  await logIn(seekerPage, seeker.email);
  await seekerPage.goto(`/messages.html?c=${seeker.id}`);
  await expect(hostPage.locator('#thread')).toContainText('Hi, is the room free for my R&R?');
  await expect(seekerPage.locator('#thread')).toContainText('Hi, is the room free for my R&R?');
  // Give both subscriptions a moment to join before the first live message.
  await hostPage.waitForTimeout(1000);

  const reply = 'Yes it is. Call me on 0412 345 678 if easier.';
  await hostPage.getByPlaceholder('Write a message…').fill(reply);
  await hostPage.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(seekerPage.locator('#thread .bubble.theirs').last()).toHaveText(new RegExp(reply.replace(/\./g, '\\.')), { timeout: 3000 });

  await seekerPage.getByPlaceholder('Write a message…').fill('Great, thanks!');
  await seekerPage.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(hostPage.locator('#thread .bubble.theirs').last()).toContainText('Great, thanks!', { timeout: 3000 });
  // Each message shows once in the sender's own page, whatever Realtime also delivers.
  await expect(seekerPage.locator('#thread .bubble.mine', { hasText: 'Great, thanks!' })).toHaveCount(1);
});

test('AC-033-4 someone else cannot open the conversation by its id', async ({ page, request }, testInfo) => {
  const seeker = await seekerWithConversation(request, testInfo);
  const otherEmail = uniqueEmail(testInfo, 'other');
  const other = await createMember(request, otherEmail, 'Lee');
  await page.goto('/messages.html');
  await logIn(page, otherEmail);
  await page.goto(`/messages.html?c=${seeker.id}`);
  await expect(page.locator('#conversation')).toContainText('This conversation isn’t available.');
  await expect(page.locator('#thread')).toHaveCount(0);
  const res = await request.get(`${local.url}/rest/v1/messages?select=id,body&conversation_id=eq.${seeker.id}`, {
    headers: { apikey: local.anonKey, authorization: `Bearer ${other.access_token}` },
  });
  expect(await res.json()).toEqual([]);
});

test('UC-004 after sending from the detail, Open conversation shows the inquiry with its dates', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'open');
  await createMember(request, email);
  await page.goto(`/listing.html?id=${ALWAYS_FREE}&in=${perthDay(7)}&out=${perthDay(21)}`);
  await logIn(page, email);
  await page.locator('#message-box').getByLabel('Message').fill('Is it free over Christmas?');
  await page.locator('#message-box').getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('link', { name: 'Open conversation' }).click();
  await expect(page).toHaveURL(/messages\.html\?c=/);
  await expect(page.locator('#conversation-title')).toContainText('Seed Host · ');
  await expect(page.locator('#thread .bubble.mine')).toContainText('Is it free over Christmas?');
  await expect(page.locator('#thread .bubble.mine')).toContainText('14 nights');
});
