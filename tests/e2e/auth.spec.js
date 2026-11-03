// UC-030 against the local Supabase (engineering-constitution.md §7). Needs `supabase start`
// and `npm run local:config`, which CI runs before Playwright. Emails are read from Mailpit.
import { test, expect } from '@playwright/test';
import { PASSWORD, codeFor, local, requireLocalSupabase, sheet, uniqueEmail } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

async function signUpWithEmail(page, email) {
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Create a password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Continue with email' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Check your email' })).toBeVisible();
}

test('AC-030-2 sign up offers Google and email, and no Apple or Facebook', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(sheet(page).getByLabel('Email')).toBeVisible();
  await expect(sheet(page).getByLabel('Create a password')).toBeVisible();
  await expect(sheet(page)).not.toContainText(/apple|facebook/i);
});

test('AC-030-3 after signing up with email the person is back on the same page, signed in', async ({ page, request }, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const start = '/?from=listing#how-it-works';
  await page.goto(start);
  const startUrl = page.url();
  const email = uniqueEmail(testInfo);

  await signUpWithEmail(page, email);
  await sheet(page).getByLabel('Code').fill(await codeFor(request, email));
  await sheet(page).getByRole('button', { name: 'Verify email' }).click();

  // BR-ACC-003: name, base suburb, intent and Terms.
  await expect(sheet(page).getByRole('heading', { name: 'A few details hosts need' })).toBeVisible();
  await sheet(page).getByLabel('Name shown to hosts').fill('Ana');
  await sheet(page).getByLabel("Where you're based (suburb)").fill('Baldivis, WA');
  await sheet(page).getByRole('button', { name: 'Both', exact: true }).click();
  await sheet(page).getByLabel('I agree to the Terms of Use and Privacy Policy').check();
  await sheet(page).getByRole('button', { name: 'Finish' }).click();

  await expect(sheet(page)).toBeHidden();
  expect(page.url()).toBe(startUrl);
  await expect(page.locator('#account')).toContainText('Hi, Ana');

  // UC-030 A1: log out and back in with the same email and password.
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(page.locator('#account')).toContainText('Hi, Ana');
  expect(page.url()).toBe(startUrl);
  expect(errors).toEqual([]);
});

test('AC-030-3 Continue with Google returns to the same page', async ({ page }) => {
  await page.goto('/?from=listing');
  const startUrl = page.url();
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  // Google is off in local Supabase (INT-001, local mode): stop at the redirect and check where it goes back to.
  await page.route('**/auth/v1/authorize**', (route) => route.abort());
  const [request] = await Promise.all([
    page.waitForRequest('**/auth/v1/authorize**'),
    sheet(page).getByRole('button', { name: 'Continue with Google' }).click(),
  ]);
  const url = new URL(request.url());
  expect(url.searchParams.get('provider')).toBe('google');
  expect(url.searchParams.get('redirect_to')).toBe(startUrl);
});

test('AC-030-4 a disposable email cannot sign up, on the page or against the API', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await sheet(page).getByLabel('Email').fill('someone@mailinator.com');
  await sheet(page).getByLabel('Create a password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Continue with email' }).click();
  await expect(sheet(page).getByRole('alert')).toHaveText('Please use a permanent email address.');

  // The sign-up hook rejects it even when someone skips the page.
  const res = await request.post(`${local.url}/auth/v1/signup`, {
    headers: { apikey: local.anonKey, 'content-type': 'application/json' },
    data: { email: `someone.${Date.now()}@yopmail.com`, password: PASSWORD },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(await res.text()).toContain('Please use a permanent email address.');
});

test('AC-030-1 without the email code there is no session and the database refuses writes', async ({ request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'unconfirmed');
  const signup = await request.post(`${local.url}/auth/v1/signup`, {
    headers: { apikey: local.anonKey, 'content-type': 'application/json' },
    data: { email, password: PASSWORD },
  });
  expect(signup.ok()).toBe(true);
  const body = await signup.json();
  expect(body.access_token).toBeUndefined();
  const userId = body.id ?? body.user?.id;
  expect(userId).toBeTruthy();

  // Without a session the only key is the anon key, and profiles reject it (P-04).
  const write = await request.post(`${local.url}/rest/v1/profiles`, {
    headers: { apikey: local.anonKey, authorization: `Bearer ${local.anonKey}`, 'content-type': 'application/json' },
    data: { id: userId, display_name: 'Ghost' },
  });
  expect(write.ok()).toBe(false);

  // Logging in before confirming is refused too.
  const login = await request.post(`${local.url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: local.anonKey, 'content-type': 'application/json' },
    data: { email, password: PASSWORD },
  });
  expect(login.ok()).toBe(false);
});

test('UC-030 E2 a wrong code is rejected with a clear message', async ({ page }, testInfo) => {
  await page.goto('/');
  await signUpWithEmail(page, uniqueEmail(testInfo, 'wrong'));
  await sheet(page).getByLabel('Code').fill('000000');
  await sheet(page).getByRole('button', { name: 'Verify email' }).click();
  await expect(sheet(page).getByRole('alert')).toHaveText('That code is wrong or has expired. Check it or send a new one.');
});

test('UC-030 E3 a short password is caught before sending', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await sheet(page).getByLabel('Email').fill('short@example.com');
  await sheet(page).getByLabel('Create a password').fill('abc');
  await expect(sheet(page).locator('#password-hint')).toHaveText('At least 8 characters (3 so far)');
  await sheet(page).getByRole('button', { name: 'Continue with email' }).click();
  await expect(sheet(page).getByRole('alert')).toHaveText('At least 8 characters');
});
