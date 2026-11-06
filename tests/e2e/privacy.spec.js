// Privacy and data (#34, UC-035) against the local Supabase, Mailpit and supabase/seed.sql. Each test
// uses its own new member. CI starts Supabase without the Edge runtime, so the delete-account call is
// answered by the test (its logic is tested in tests/unit/privacy.test.js and the database part in
// supabase/tests/database/29_account_data.sql).
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { PASSWORD, createMember, requireLocalSupabase, sheet, uniqueEmail } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const privacy = (page) => page.locator('#privacy');

async function logInOnAccountPage(page, email, hash = '#privacy') {
  await page.goto(`/account.html${hash}`);
  await page.locator('#account-main').getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(privacy(page).getByRole('heading', { name: 'Privacy and data' })).toBeVisible();
}

test('AC-035-2 a member downloads a JSON file with their own data, named by date only', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'export');
  await createMember(request, email, 'Rua');
  await logInOnAccountPage(page, email);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    privacy(page).getByRole('button', { name: 'Download my data' }).click(),
  ]);
  // BR-PRV-004: no name or email in the file name.
  expect(download.suggestedFilename()).toMatch(/^swingmate-my-data-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(data.profile.display_name).toBe('Rua');
  expect(data.account.email).toBe(email);
  expect(data.saved_homes).toEqual([]);
  expect(data.messages_sent).toEqual([]);
});

test('roles-permissions §4 after 5 minutes the download asks for the password first', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'reauth');
  await createMember(request, email, 'Tam');
  await logInOnAccountPage(page, email);

  // The database answers "reauth" once, as it does when the last sign-in is older than 5 minutes.
  let asked = false;
  await page.route('**/rest/v1/rpc/export_my_data', async (route) => {
    if (asked) return route.continue();
    asked = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"reason":"reauth"}' });
  });
  await privacy(page).getByRole('button', { name: 'Download my data' }).click();
  const reauth = privacy(page).locator('#reauth');
  await expect(reauth).toContainText('To keep your account safe, confirm it’s you first.');

  await reauth.getByLabel('Password').fill('not-the-password');
  await reauth.getByRole('button', { name: 'Confirm' }).click();
  await expect(reauth.locator('#reauth-error')).toHaveText('That password doesn’t match. Try again.');

  await reauth.getByLabel('Password').fill(PASSWORD);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    reauth.getByRole('button', { name: 'Confirm' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^swingmate-my-data-/);
  await expect(reauth).toBeHidden();
});

test('UC-035 E1 a download that fails says so', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'exportfail');
  await createMember(request, email, 'Una');
  await logInOnAccountPage(page, email);
  await page.route('**/rest/v1/rpc/export_my_data', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
  await privacy(page).getByRole('button', { name: 'Download my data' }).click();
  await expect(privacy(page).locator('#download-error')).toHaveText('The download didn’t work. Try again.');
});

test('AC-035-1 deleting needs the "can’t be undone" box, then the person is signed out and told', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'delete');
  await createMember(request, email, 'Vic');
  await logInOnAccountPage(page, email);

  let calls = 0;
  await page.route('**/functions/v1/delete-account', (route) => {
    calls += 1;
    return calls === 1
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"reason":"failed"}' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await privacy(page).getByRole('button', { name: 'Delete my account' }).click();
  const confirm = privacy(page).locator('#delete-confirm');
  await expect(confirm).toContainText('Hosts keep the messages you already sent, shown as “Deleted user”.');
  // A seeker has no listings to take down.
  await expect(confirm.locator('#delete-host-hint')).toHaveCount(0);
  const button = confirm.getByRole('button', { name: 'Delete account' });
  await expect(button).toBeDisabled();
  await confirm.getByLabel('I understand this can’t be undone').check();
  await expect(button).toBeEnabled();

  await button.click();
  await expect(confirm.locator('#delete-error')).toHaveText('Your account wasn’t deleted. Try again.');

  await button.click();
  await expect(page.locator('#account-deleted')).toHaveText('Your account was deleted.');
  expect(calls).toBe(2);
  // The session is gone on this device: the header offers Log in again.
  await page.reload();
  await expect(page.locator('#account-main').getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
});
