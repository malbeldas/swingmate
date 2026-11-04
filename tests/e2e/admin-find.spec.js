// UC-041 against the local Supabase, Mailpit and the example host, listing and admin in
// supabase/seed.sql (local and CI only, BR-TRU-006). These tests act only on people they create.
import { test, expect } from '@playwright/test';
import {
  PASSWORD, SEED_ADMIN, authPost, createMember, requireLocalSupabase, sheet, startConversation, uniqueEmail,
} from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const ALWAYS_FREE = '00000000-0000-0000-0000-00000000f001'; // Baldivis

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

async function findAsAdmin(page, query) {
  await page.goto('/admin.html#find');
  await logIn(page, SEED_ADMIN.email, SEED_ADMIN.password);
  await page.getByLabel('Name, email, listing title or suburb').fill(query);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
}

test('AC-041-1 a search finds a person by name and shows no message content', async ({ page, request }, testInfo) => {
  const name = uniqueName(testInfo, 'Wren');
  const phrase = `Gate code ${Date.now() % 100000}`;
  const member = await createMember(request, uniqueEmail(testInfo, 'wren'), name);
  await startConversation(request, member, ALWAYS_FREE, `Hi! ${phrase}, is the room free?`, perthDay(7), perthDay(14));

  const bodies = [];
  page.on('response', async (res) => {
    if (/\/rpc\/admin_(search|person)/.test(res.url())) bodies.push(await res.text());
  });
  await findAsAdmin(page, name);
  const result = page.locator('#people-results .queue-link', { hasText: name });
  await expect(result).toBeVisible();
  // The search words never go in the address (engineering-constitution.md §10).
  expect(page.url()).not.toContain(encodeURIComponent(name.split(' ')[1]));

  await result.click();
  await expect(page.locator('#record-title')).toHaveText(name);
  await expect(page.locator('#record')).toContainText('Phone not verified');
  await expect(page.locator('main')).not.toContainText(phrase);
  await expect.poll(() => bodies.length).toBeGreaterThanOrEqual(2);
  for (const body of bodies) expect(body).not.toContain(phrase);
});

test('Issue #28 an admin suspends a person from the record and the log shows date, author and note', async ({ page, request }, testInfo) => {
  const name = uniqueName(testInfo, 'Yara');
  await createMember(request, uniqueEmail(testInfo, 'yara'), name);
  await findAsAdmin(page, name);
  await page.locator('#people-results .queue-link', { hasText: name }).click();
  await expect(page.locator('#record-title')).toHaveText(name);
  await expect(page.locator('#log-entries')).toHaveCount(0);

  // BR-ADM-001: never without a note.
  await page.getByLabel('Suspend account').check();
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('#record-error')).toHaveText('Write a note of at least 3 characters.');

  await page.getByLabel('Note (required, kept in the log)').fill('Fake profile, several reports by phone.');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('#record-notice')).toHaveText('Done. It’s in the log.');
  await expect(page.locator('#record-status')).toHaveText('Suspended');
  const entry = page.locator('#log-entries .log-entry').first();
  await expect(entry).toContainText('Suspend account');
  await expect(entry).toContainText('Fake profile, several reports by phone.');
  await expect(entry).toContainText(/Seed Admin · \d{1,2} \w{3} \d{4}/);
  // The undo replaces the action.
  await expect(page.getByLabel('Lift suspension')).toBeVisible();
  await expect(page.getByLabel('Suspend account')).toHaveCount(0);
});

test('BR-ADM-004 an admin gives the role, and the person signs in as an admin', async ({ page, request }, testInfo) => {
  const name = uniqueName(testInfo, 'Zed');
  const email = uniqueEmail(testInfo, 'zed');
  await createMember(request, email, name);
  await findAsAdmin(page, email);
  await page.locator('#people-results .queue-link', { hasText: name }).click();
  await page.getByLabel('Make admin').check();
  await page.getByLabel('Note (required, kept in the log)').fill('Helping with the pilot reports.');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('#record-admin')).toHaveText('Admin');
  await expect(page.locator('#log-entries .log-entry').first()).toContainText('Make admin');

  const res = await authPost(request, 'token?grant_type=password', { email, password: PASSWORD });
  const { access_token: token } = await res.json();
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  expect(claims.app_metadata.role).toBe('admin');
});
