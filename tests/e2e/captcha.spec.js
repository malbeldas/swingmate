// INT-004 (Turnstile) against the local Supabase, where captcha is off (integrations-captcha.md,
// "Modo local"). The real Turnstile is never called: the test gives the page a site key and
// serves a stand-in script that hands back a token, then checks it travels with the auth call.
import { test, expect } from '@playwright/test';
import { PASSWORD, local, requireLocalSupabase, sheet, uniqueEmail } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/api.js**';
const FAKE_TURNSTILE = `window.turnstile = {
  render(el, opts) { setTimeout(() => opts.callback('fake-turnstile-token'), 50); return 'w1'; },
  remove() {},
};`;

async function withSiteKey(page) {
  await page.route('**/app/config.local.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ url: local.url, anonKey: local.anonKey, turnstileSiteKey: '1x00000000000000000000AA' }),
  }));
}

async function fillSignUp(page, email) {
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Create a password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Continue with email' }).click();
}

test('SEC-14 with a site key, sign-up sends the Turnstile token to Supabase', async ({ page }, testInfo) => {
  await withSiteKey(page);
  await page.route(TURNSTILE, (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_TURNSTILE }));
  await page.goto('/');
  const signup = page.waitForRequest((req) => req.url().includes('/auth/v1/signup') && req.method() === 'POST');
  await fillSignUp(page, uniqueEmail(testInfo, 'captcha'));
  const body = (await signup).postDataJSON();
  expect(body.gotrue_meta_security?.captcha_token).toBe('fake-turnstile-token');
  await expect(sheet(page).getByRole('heading', { name: 'Check your email' })).toBeVisible();
});

test('INT-004 when Turnstile is blocked, the sheet says so and nothing is sent', async ({ page }, testInfo) => {
  await withSiteKey(page);
  await page.route(TURNSTILE, (route) => route.abort());
  let sent = false;
  page.on('request', (req) => { if (req.url().includes('/auth/v1/signup')) sent = true; });
  await page.goto('/');
  await fillSignUp(page, uniqueEmail(testInfo, 'blocked'));
  await expect(sheet(page)).toContainText('Something blocked our security check. Disable blockers or try another browser.');
  expect(sent).toBe(false);
});

test('SEC-14 without a site key (local and CI) no captcha script is loaded', async ({ page }, testInfo) => {
  let loaded = false;
  page.on('request', (req) => { if (req.url().startsWith('https://challenges.cloudflare.com/')) loaded = true; });
  await page.goto('/');
  await fillSignUp(page, uniqueEmail(testInfo, 'nokey'));
  await expect(sheet(page).getByRole('heading', { name: 'Check your email' })).toBeVisible();
  expect(loaded).toBe(false);
});
