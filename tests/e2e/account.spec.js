// UC-032 (profile) and AC-002-4 (visitor roster) against the local Supabase, with Storage for the
// photo. Needs `supabase start` and `npm run local:config`, which CI runs before Playwright.
import { test, expect } from '@playwright/test';
import { PASSWORD, codeFor, createMember, requireLocalSupabase, sheet, uniqueEmail } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const main = (page) => page.locator('#account-main');

async function logInOnAccountPage(page, email) {
  await page.goto('/account.html');
  await main(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(main(page).getByRole('heading', { name: 'Profile' })).toBeVisible();
}

// A small PNG drawn in the browser, so the test has a real image to pick.
async function pngFromPage(page) {
  const base64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 900;
    const g = c.getContext('2d');
    g.fillStyle = '#E68A4B'; g.fillRect(0, 0, 1200, 900);
    g.fillStyle = '#152238'; g.fillRect(300, 200, 600, 500);
    return c.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(base64, 'base64');
}

test('UC-032 signed out, My account asks to log in', async ({ page }) => {
  await page.goto('/account.html');
  await expect(main(page)).toContainText('Log in to see your profile and your roster.');
});

test('AC-032-1 the name cannot be empty and the base suburb must come from the list', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'profile');
  await createMember(request, email);
  await logInOnAccountPage(page, email);

  const name = main(page).getByLabel('Name shown to hosts');
  const suburb = main(page).getByLabel("Where you're based (suburb)");
  const save = main(page).getByRole('button', { name: 'Save changes' });

  await name.fill('   ');
  await save.click();
  await expect(main(page).locator('#profile-error')).toHaveText('Add your name');

  await name.fill('Ana');
  await suburb.fill('Atlantis, WA');
  await save.click();
  await expect(main(page).locator('#profile-error')).toHaveText('Choose your base suburb from the list');
});

test('BR-ACC-004 optional details show on the card hosts see, and the email never does', async ({ page, request }, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const email = uniqueEmail(testInfo, 'details');
  await createMember(request, email);
  await logInOnAccountPage(page, email);

  await main(page).getByLabel('How you work').selectOption('fifo');
  await main(page).getByLabel("Where you're based (suburb)").fill('Baldivis, WA');
  await main(page).getByLabel('About you').fill('Quiet and tidy, home for my R&R.');
  await main(page).getByRole('button', { name: 'Both', exact: true }).click();
  await main(page).getByRole('button', { name: 'Save changes' }).click();
  await expect(main(page).locator('#profile-status')).toHaveText('Changes saved.');

  await page.reload();
  const card = main(page).locator('#public-card');
  await expect(card).toContainText('FIFO · Based in Baldivis, WA · Email verified');
  await expect(card).toContainText('Quiet and tidy, home for my R&R.');
  await expect(main(page).getByLabel('How you work')).toHaveValue('fifo');
  await expect(main(page).getByRole('button', { name: 'Both', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(main(page)).toContainText('✓ Email verified');
  await expect(card).not.toContainText(email);
  expect(errors).toEqual([]);
});

test('BR-PRV-002 a photo is re-encoded to JPEG before upload, and UC-032 E1 a wrong file says why', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'photo');
  await createMember(request, email);
  await logInOnAccountPage(page, email);

  await main(page).locator('#photo-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(main(page).locator('#photo-error')).toHaveText('Choose a JPG, PNG or WebP photo.');

  await main(page).locator('#photo-input').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: await pngFromPage(page) });
  await expect(main(page).locator('#profile-status')).toHaveText('Photo saved.');
  await expect(main(page).locator('#photo-error')).toBeHidden();

  const src = await main(page).locator('#photo-slot img').getAttribute('src');
  expect(src).toMatch(/\/storage\/v1\/object\/public\/avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);
  const photo = await request.get(src);
  expect(photo.ok()).toBe(true);
  const bytes = await photo.body();
  expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  expect(bytes.includes(Buffer.from('Exif'))).toBe(false);

  // The card hosts see uses the new photo, and it stays after a reload.
  await page.reload();
  await expect(main(page).locator('#public-card img.avatar')).toHaveAttribute('src', src);
  await expect(main(page).getByText('Change photo')).toBeVisible();
});

test('AC-002-4 the roster a visitor tried is offered, filled in, when they sign up', async ({ page, request }, testInfo) => {
  await page.goto('/');
  await page.locator('#roster-form select[name="pattern"]').selectOption({ label: '8:6 (8 on, 6 off)' });

  const email = uniqueEmail(testInfo, 'roster');
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Create a password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Continue with email' }).click();
  await sheet(page).getByLabel('Code').fill(await codeFor(request, email));
  await sheet(page).getByRole('button', { name: 'Verify email' }).click();
  await sheet(page).getByLabel('Name shown to hosts').fill('Ana');
  await sheet(page).getByLabel("Where you're based (suburb)").fill('Baldivis, WA');
  await sheet(page).getByLabel('I agree to the Terms of Use and Privacy Policy').check();
  await sheet(page).getByRole('button', { name: 'Finish' }).click();

  await expect(sheet(page).getByRole('heading', { name: 'Save your roster?' })).toBeVisible();
  await expect(sheet(page)).toContainText('You tried an 8:6 roster starting');
  await sheet(page).getByRole('button', { name: 'Save roster' }).click();
  await expect(sheet(page)).toBeHidden();

  await page.goto('/account.html');
  await expect(main(page).locator('#roster-summary')).toContainText('8:6 roster starting');
  await expect(main(page).locator('#public-card')).toContainText('8:6 roster');
});
