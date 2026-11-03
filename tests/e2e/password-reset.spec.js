// UC-031 and NTF-002 against the local Supabase. Needs `supabase start` and `npm run local:config`,
// which CI runs before Playwright. Emails are read from Mailpit.
import { test, expect } from '@playwright/test';
import { PASSWORD, authPost, createMember, emailTo, requireLocalSupabase, sheet, uniqueEmail } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const NEW_PASSWORD = 'swing-shift-2027';

async function askForReset(page, email) {
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Forgot password?' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByRole('button', { name: 'Send reset link' }).click();
  const sent = sheet(page).locator('#reset-sent');
  await expect(sent).toBeVisible();
  return sent.textContent();
}

async function resetLink(request, email) {
  const message = await emailTo(request, email, /^Reset your SwingMate password$/);
  const href = message.HTML.match(/href="([^"]*token_hash=[^"]*)"/)[1].replaceAll('&amp;', '&');
  return href;
}

test('AC-031-1 the screen answers the same for a registered and an unregistered email', async ({ page, request }, testInfo) => {
  const known = uniqueEmail(testInfo, 'known');
  const unknown = uniqueEmail(testInfo, 'unknown');
  await createMember(request, known);

  await page.goto('/');
  const forKnown = await askForReset(page, known);
  await sheet(page).getByRole('button', { name: 'Back to log in' }).click();
  await sheet(page).getByRole('button', { name: 'Forgot password?' }).click();
  await sheet(page).getByLabel('Email').fill(unknown);
  await sheet(page).getByRole('button', { name: 'Send reset link' }).click();
  const forUnknown = await sheet(page).locator('#reset-sent').textContent();

  expect(forKnown.replace(known, 'EMAIL')).toBe(forUnknown.replace(unknown, 'EMAIL'));
  expect(forKnown).toBe(`If there's an account for ${known}, a reset link is on its way. It works for 1 hour. Check your spam folder too.`);
  // Only the registered email gets the link (NTF-002 recipient).
  await resetLink(request, known);
});

test('UC-031 the link sets a new password once and closes the other sessions (NTF-002 AC-1, AC-2)', async ({ page, request }, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const email = uniqueEmail(testInfo, 'reset');
  const otherDevice = await createMember(request, email);

  await page.goto('/');
  await askForReset(page, email);
  const link = await resetLink(request, email);

  await page.goto(link);
  await expect(sheet(page).getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  // The one-time token leaves the address bar as soon as the page reads it.
  expect(page.url()).not.toContain('token_hash');
  await sheet(page).getByLabel('New password').fill(NEW_PASSWORD);
  await sheet(page).getByRole('button', { name: 'Save new password' }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(page.locator('#account')).toContainText('Hi, Ana');

  // AC-2: the session on the other device can't be renewed any more.
  const refresh = await authPost(request, 'token?grant_type=refresh_token', { refresh_token: otherDevice.refresh_token });
  expect(refresh.ok()).toBe(false);

  // The new password works and the old one doesn't.
  expect((await authPost(request, 'token?grant_type=password', { email, password: NEW_PASSWORD })).ok()).toBe(true);
  expect((await authPost(request, 'token?grant_type=password', { email, password: PASSWORD })).ok()).toBe(false);

  // AC-1: the same link a second time sends the person back to ask for a new one.
  await page.goto(link);
  await expect(sheet(page).getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expect(sheet(page).getByRole('alert')).toHaveText('That reset link has expired or was already used. Ask for a new one below.');
  expect(errors).toEqual([]);
});
