// The outcome question (#33, UC-007, UC-052, BR-MAIL-003): one tap from the email with no login, and
// the question in the conversation for the person who searched. CI starts Supabase without the Edge
// runtime and the outcomes job is service-role only, so the test answers the outcome function and adds
// the question to the conversation itself; the signature check and the database are tested in
// tests/unit/outcome.test.js and supabase/tests/database/32_outcome_question.sql.
import { test, expect } from '@playwright/test';
import {
  PASSWORD, SEED_HOST, createMember, requireLocalSupabase, sheet, startConversation, uniqueEmail,
} from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const CONV = '00000000-0000-0000-0000-0000000033c1';
const LINK = '/email-action.html?a=outcome&answer=found_elsewhere&src=email&ntf=NTF-005#t=head.body.sig';
const ALWAYS_FREE = '00000000-0000-0000-0000-00000000f001';
const TILE = new URL('./fixtures/tile.png', import.meta.url).pathname;
const QUESTION = 'Did you find a place through SwingMate?';

test('AC-007-1 an answer from the email is saved without logging in, and the token leaves the address bar', async ({ page }) => {
  let sent = null;
  await page.route('**/functions/v1/outcome', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, answer: 'found_elsewhere', conversation_id: CONV }) });
  });
  await page.goto(LINK);
  await expect(page.locator('#action-result')).toHaveText('Thanks for telling us.');
  expect(sent).toEqual({ token: 'head.body.sig', answer: 'found_elsewhere' });
  expect(page.url()).not.toContain('#t=');
  await expect(page.getByText('You can change your answer in the conversation.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the conversation' })).toHaveAttribute('href', `messages.html?c=${CONV}`);
});

test('UC-007 E1 an expired link opens the conversation to answer there', async ({ page }) => {
  await page.route('**/functions/v1/outcome', (route) => route.fulfill({
    status: 410, contentType: 'application/json', body: JSON.stringify({ ok: false, reason: 'expired', conversation_id: CONV }),
  }));
  await page.goto(LINK);
  await expect(page.locator('#action-result')).toHaveText('This link has expired.');
  await expect(page.getByText('You can still answer in the conversation.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the conversation' })).toHaveAttribute('href', `messages.html?c=${CONV}`);
});

test('AC-3 a link with an unknown answer sends nothing', async ({ page }) => {
  let called = false;
  await page.route('**/functions/v1/outcome', (route) => { called = true; return route.abort(); });
  await page.goto('/email-action.html?a=outcome&answer=maybe#t=head.body.sig');
  await expect(page.locator('#action-result')).toHaveText('This link doesn’t work.');
  expect(called).toBe(false);
});

function perthDay(offset) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// What mark_outcome_asked adds to the conversation on day 14 (UC-052), added to the real messages.
async function withQuestion(page, conversationId) {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ path: TILE, contentType: 'image/png' }));
  await page.route(`**/rest/v1/messages?*conversation_id=eq.${conversationId}*`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const res = await route.fetch();
    const rows = await res.json();
    rows.push({
      id: '00000000-0000-0000-0000-0000000033d1', sender_id: null, kind: 'system', body: QUESTION,
      stay_from: null, stay_to: null, created_at: new Date().toISOString(), risk_flag: false,
    });
    await route.fulfill({ response: res, json: rows });
  });
}

async function logIn(page, email, password) {
  await page.locator('#account').getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(password);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
}

test('UC-007 A1 the person who searched answers in the conversation and can change it; the host never sees the question', async ({ page, browser, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'outcome');
  const session = await createMember(request, email, 'Noa');
  const id = await startConversation(request, session, ALWAYS_FREE, 'Hi, is the room free for my R&R?', perthDay(7), perthDay(14));
  const answers = [];
  await withQuestion(page, id);
  await page.route('**/rest/v1/rpc/answer_outcome', async (route) => {
    const { p_conversation_id: conversation, p_answer: answer } = route.request().postDataJSON();
    answers.push([conversation, answer]);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, answer, conversation_id: conversation }) });
  });
  await page.goto('/messages.html');
  await logIn(page, email, PASSWORD);
  await page.goto(`/messages.html?c=${id}`);

  const card = page.locator('#outcome-question');
  await expect(card).toContainText(QUESTION);
  await expect(card).toContainText('From SwingMate');
  await expect(page.locator('#outcome-note')).toHaveText('One tap is enough. Only you see this question.');
  await card.getByRole('button', { name: 'Yes, somewhere else' }).click();
  await expect(card.getByRole('button', { name: 'Yes, somewhere else' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#outcome-note')).toHaveText('Thanks. You can change your answer here any time.');
  await card.getByRole('button', { name: 'Yes, through SwingMate' }).click();
  await expect(card.getByRole('button', { name: 'Yes, through SwingMate' })).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByRole('button', { name: 'Yes, somewhere else' })).toHaveAttribute('aria-pressed', 'false');
  expect(answers).toEqual([[id, 'found_elsewhere'], [id, 'found_here']]);

  const other = await browser.newContext();
  const host = await other.newPage();
  await withQuestion(host, id);
  await host.goto('/messages.html');
  await logIn(host, SEED_HOST.email, SEED_HOST.password);
  await host.goto(`/messages.html?c=${id}`);
  await expect(host.locator('#thread')).toContainText('Hi, is the room free for my R&R?');
  await expect(host.locator('#outcome-question')).toHaveCount(0);
  await expect(host.getByText(QUESTION)).toHaveCount(0);
  await other.close();
});
