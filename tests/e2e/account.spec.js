// UC-032 (profile) and AC-002-4 (visitor roster) against the local Supabase, with Storage for the
// photo. Needs `supabase start` and `npm run local:config`, which CI runs before Playwright.
import { test, expect } from '@playwright/test';
import { PASSWORD, codeFor, createMember, local, requireLocalSupabase, sheet, uniqueEmail } from './auth-helpers.js';

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
  await expect(main(page).locator('#roster-summary')).toContainText('8:6 · next swing');
  await expect(main(page).locator('#public-card')).toContainText('8:6 roster');
});

test('UC-050 A1 new message emails can be switched off, and it stays off', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'notify');
  await createMember(request, email);
  await logInOnAccountPage(page, email);
  const box = main(page).getByLabel('Email me when I get a new message');
  await expect(box).toBeChecked();
  await expect(main(page).locator('#notify-hint')).toHaveText('We always email you about a new enquiry, even with this off.');
  await box.uncheck();
  await expect(main(page).locator('#notify-status')).toHaveText('Saved.');
  // The link in the emails opens this section.
  await page.goto('/account.html#notifications');
  await expect(main(page).getByLabel('Email me when I get a new message')).not.toBeChecked();
  await main(page).getByLabel('Email me when I get a new message').check();
  await expect(main(page).locator('#notify-status')).toHaveText('Saved.');
});

test('UC-024 a host chooses who can message them and it stays; a seeker never sees the choice', async ({ page, browser, request }, testInfo) => {
  const seekerEmail = uniqueEmail(testInfo, 'rule-seek');
  await createMember(request, seekerEmail);
  await logInOnAccountPage(page, seekerEmail);
  await expect(main(page).locator('#who-can-message')).toHaveCount(0);

  const email = uniqueEmail(testInfo, 'rule-host');
  const session = await createMember(request, email);
  const res = await request.patch(`${local.url}/rest/v1/profiles?id=eq.${session.user.id}`, {
    headers: { apikey: local.anonKey, authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
    data: { is_hosting: true },
  });
  expect(res.ok()).toBe(true);
  // The host signs in on a browser of their own, at the same screen size.
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: page.viewportSize() });
  const host = await context.newPage();
  await logInOnAccountPage(host, email);
  const section = main(host).locator('#who-can-message');
  await expect(section.getByRole('heading', { name: 'Who can message you' })).toBeVisible();
  await expect(section.getByLabel('Anyone with a verified email')).toBeChecked();
  await section.getByLabel('Only people with a verified phone').check();
  await expect(main(host).locator('#message-rule-status')).toHaveText('Saved. It applies to all your listings.');
  await host.reload();
  await expect(main(host).locator('#who-can-message').getByLabel('Only people with a verified phone')).toBeChecked();
  await context.close();
});
