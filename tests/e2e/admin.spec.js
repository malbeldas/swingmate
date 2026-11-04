// UC-040 against the local Supabase, Mailpit and the example host, listing and admin in
// supabase/seed.sql (local and CI only, BR-TRU-006). Hiding a listing (AC-040-3) is checked in
// supabase/tests/database/17_moderation.sql, so these tests never hide the shared seed listings.
import { test, expect } from '@playwright/test';
import {
  PASSWORD, SEED_ADMIN, SEED_HOST, authPost, createMember, local, requireLocalSupabase, sheet, startConversation, uniqueEmail,
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

async function passwordSession(request, { email, password }) {
  const res = await authPost(request, 'token?grant_type=password', { email, password });
  if (!res.ok()) throw new Error(`log in failed with ${res.status()}`);
  return res.json();
}

function rest(request, session, method, path, data) {
  return request.fetch(`${local.url}/rest/v1/${path}`, {
    method,
    headers: { apikey: local.anonKey, authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json', prefer: 'return=minimal' },
    data,
  });
}

async function report(request, session, targetType, targetId, reason) {
  const res = await rest(request, session, 'POST', 'reports', { target_type: targetType, target_id: targetId, reason });
  expect(res.status()).toBe(201);
}

async function openAdmin(page) {
  await page.goto('/admin.html');
  await logIn(page, SEED_ADMIN.email, SEED_ADMIN.password);
  await expect(page.locator('#report-queue')).toBeVisible();
}

test('BR-ADM-004 a member who is not an admin sees no reports and no Reports link', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'noadmin');
  await createMember(request, email);
  await page.goto('/admin.html');
  await expect(page.locator('#signed-out')).toContainText('Log in with an admin account to see reports.');
  await logIn(page, email);
  await expect(page.locator('#not-admin')).toContainText('This page is for SwingMate admins.');
  await expect(page.locator('#report-queue')).toHaveCount(0);
  await expect(page.locator('#account .account-admin')).toHaveCount(0);
});

test('AC-040-1 UC-040 A1 two reports of one person are resolved together, and never without a note', async ({ page, request }, testInfo) => {
  const name = uniqueName(testInfo, 'Tess');
  const target = await createMember(request, uniqueEmail(testInfo, 'target'), name);
  const first = await createMember(request, uniqueEmail(testInfo, 'rep1'));
  const second = await createMember(request, uniqueEmail(testInfo, 'rep2'));
  await report(request, first, 'user', target.user.id, 'spam');
  await report(request, second, 'user', target.user.id, 'offensive');

  await openAdmin(page);
  await expect(page.locator('#account .account-admin')).toHaveText('Reports');
  const item = page.locator('.queue-link', { hasText: name });
  await expect(item).toContainText('2 reports · Spam · Offensive or discriminatory');
  await item.click();
  await expect(page.locator('#report-title')).toHaveText(name);
  await expect(page.locator('.report-entry')).toHaveCount(2);

  // AC-040-1: without a note nothing reaches the database.
  let called = false;
  page.on('request', (req) => { if (req.url().includes('/rpc/admin_act')) called = true; });
  await page.getByLabel('Warn').check();
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('#action-error')).toHaveText('Write a note of at least 3 characters.');
  expect(called).toBe(false);

  await page.getByLabel('Note (required, kept in the log)').fill('Spam in two conversations, first warning.');
  const acted = page.waitForResponse((res) => res.url().includes('/rpc/admin_act'));
  await page.getByRole('button', { name: 'Apply' }).click();
  expect((await acted).ok()).toBe(true);
  await expect(page.locator('#admin-notice')).toHaveText('Done. 2 reports closed.');
  await expect(page.locator('.queue-link', { hasText: name })).toHaveCount(0);
});

test('AC-040-2 AC-040-4 the admin reads a reported conversation, suspends the seeker, and the seeker can no longer send', async ({ page, request }, testInfo) => {
  const name = uniqueName(testInfo, 'Rex');
  const seeker = await createMember(request, uniqueEmail(testInfo, 'susp'), name);
  const conversationId = await startConversation(request, seeker, ALWAYS_FREE, 'Hi, can you send the bond first?', perthDay(7), perthDay(14));
  const host = await passwordSession(request, SEED_HOST);
  await report(request, host, 'conversation', conversationId, 'scam');

  await openAdmin(page);
  const item = page.locator('.queue-link', { hasText: name });
  await expect(item).toContainText('Conversation');
  await item.click();
  await expect(page.locator('#report-detail')).toContainText(`Reported person: ${name}`);
  const read = page.waitForResponse((res) => res.url().includes('/rpc/admin_read_conversation'));
  await page.getByRole('button', { name: 'Read conversation' }).click();
  expect((await read).ok()).toBe(true);
  await expect(page.locator('#admin-thread')).toContainText('Hi, can you send the bond first?');
  await expect(page.locator('#admin-thread')).toContainText(`${name} (seeker)`);

  await page.getByLabel('Suspend account').check();
  await page.getByLabel('Note (required, kept in the log)').fill('Asked the host for money before a visit.');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('#admin-notice')).toHaveText('Done. 1 report closed.');

  // AC-040-4: the suspended seeker can't send.
  const sent = await rest(request, seeker, 'POST', 'messages', { conversation_id: conversationId, sender_id: seeker.user.id, kind: 'text', body: 'Hello?' });
  expect(sent.ok()).toBe(false);

  // AC-040-2: with the report closed, the admin can't read the conversation any more.
  const admin = await passwordSession(request, SEED_ADMIN);
  const again = await rest(request, admin, 'POST', 'rpc/admin_read_conversation', { p_conversation_id: conversationId });
  expect(again.ok()).toBe(false);
});
