// List your place (#13, UC-020) against the local Supabase and supabase/seed.sql. The seed host has
// a verified mobile (SEED_HOST); a new member doesn't, which is how AC-020-1 is seen.
import { test, expect } from '@playwright/test';
import { PASSWORD, SEED_HOST, authPost, createMember, local, requireLocalSupabase, sheet, uniqueEmail } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const TILE = new URL('./fixtures/tile.png', import.meta.url).pathname;
// Port Hedland: no other E2E searches there, so a listing published here changes no results.
const SUBURB = 'Port Hedland, WA';

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ path: TILE, contentType: 'image/png' }));
});

async function logIn(page, email, password) {
  await page.locator('#account').getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(password);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
}

async function fillStep1(page, address = '7 Test Street') {
  await page.getByLabel('Suburb').fill(SUBURB);
  await page.getByLabel('Suburb').dispatchEvent('change');
  await page.getByLabel('Street address').fill(address);
  const map = page.locator('#pin-map');
  await expect(map.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await map.scrollIntoViewIfNeeded();
  const box = await map.boundingBox();
  await page.mouse.click(box.x + box.width / 2 + 15, box.y + box.height / 2 + 10);
  await expect(page.locator('#pin-note')).toContainText('The home is marked');
  await page.getByRole('button', { name: 'Private room' }).click();
  await page.getByRole('button', { name: 'Own bathroom' }).click();
}

async function fillStep2(page) {
  await page.getByLabel('Rent per week (AUD)').fill('240');
  await page.getByLabel('Bond (AUD)').fill('480');
  await page.locator('fieldset', { hasText: 'Bills included' }).getByRole('button', { name: 'Yes' }).click();
  await page.locator('fieldset', { hasText: 'Furnished' }).getByRole('button', { name: 'Yes' }).click();
}

// A JPEG drawn in the page with an EXIF block (camera and GPS) spliced in after the start marker,
// the way a phone photo arrives.
async function phonePhoto(page, color) {
  const jpeg = Buffer.from(await page.evaluate((c) => {
    const cv = document.createElement('canvas');
    cv.width = 1200; cv.height = 900;
    const g = cv.getContext('2d');
    g.fillStyle = c; g.fillRect(0, 0, 1200, 900);
    return cv.toDataURL('image/jpeg', 0.8).split(',')[1];
  }, color), 'base64');
  const payload = Buffer.from('Exif\0\0GPSLatitude -32.3322 GPSLongitude 115.8270 Model PhoneCam', 'latin1');
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
  return { name: `IMG_${color.slice(1)}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]) };
}

test('AC-020-7 AC-020-4 UC-020 A1 steps, tips, a draft saved for later and kept private', async ({ page, request, browser }, testInfo) => {
  const email = uniqueEmail(testInfo, 'lia');
  await createMember(request, email, 'Lia');
  await page.goto('/list.html');
  await expect(page.getByRole('heading', { name: 'Log in or sign up to list your place.' })).toBeVisible();
  await logIn(page, email, PASSWORD);

  await expect(page.locator('#step-label')).toHaveText('List your place · Step 1 of 5');
  await expect(page.locator('#step-title')).toHaveText('Where is it and what are you offering?');
  // UC-020 E1: Next is disabled and says what is missing.
  await page.getByLabel('Suburb').fill('');
  await page.getByLabel('Suburb').dispatchEvent('change');
  await expect(page.locator('#wizard-next')).toBeDisabled();
  await expect(page.locator('#next-blocked')).toHaveText('Choose the suburb');
  await fillStep1(page);
  // AC-020-7: closing the tip keeps what was typed.
  await page.getByRole('button', { name: 'Close tip' }).click();
  await expect(page.locator('#step-tip')).toHaveCount(0);
  await expect(page.getByLabel('Street address')).toHaveValue('7 Test Street');
  await page.locator('#wizard-next').click();

  await expect(page.locator('#step-label')).toHaveText('List your place · Step 2 of 5');
  await fillStep2(page);
  await page.getByRole('button', { name: 'Air conditioning' }).click();
  await page.getByLabel('Your own item').fill('Gym in the garage');
  await page.getByRole('button', { name: '+ Add your own' }).click();
  await page.getByRole('button', { name: 'Save and finish later' }).click();
  await expect(page.locator('#wizard-status')).toHaveText('Saved. You can finish later from this page.');
  await expect(page).toHaveURL(/list\.html\?id=[0-9a-f-]{36}$/);
  const id = new URL(page.url()).searchParams.get('id');

  // Coming back opens the first step with something missing: photos, title.
  await page.reload();
  await expect(page.locator('#step-label')).toHaveText('List your place · Step 3 of 5');
  await page.locator('#wizard-back').click();
  await expect(page.getByLabel('Rent per week (AUD)')).toHaveValue('240');
  await expect(page.getByRole('button', { name: 'Air conditioning' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('list', { name: 'Your own items' })).toContainText('Gym in the garage');

  // AC-020-4: nobody else sees the draft, not even with the link.
  const other = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: page.viewportSize() });
  const visitor = await other.newPage();
  await visitor.goto(`/listing.html?id=${id}`);
  await expect(visitor.locator('#gone')).toBeVisible();
  await other.close();

  // AC-020-1: without a verified mobile, Publish stays disabled and says so.
  await page.goto(`/list.html?id=${id}&step=5`);
  await expect(page.locator('#phone-status')).toContainText('Verify your mobile to publish');
  await page.getByLabel(/The photos and details are real and current/).check();
  await expect(page.locator('#wizard-next')).toBeDisabled();
  await expect(page.locator('#publish-missing')).toContainText('Verify your mobile');
});

test('UC-020 AC-020-1 AC-020-2 AC-020-8 the host publishes, photos lose their EXIF and the preview hides the address', async ({ page, request }) => {
  await page.goto('/list.html');
  await logIn(page, SEED_HOST.email, SEED_HOST.password);
  await fillStep1(page, '99 Secret Crescent');
  await page.locator('#wizard-next').click();
  await fillStep2(page);
  await page.locator('#wizard-next').click();

  // Step 3: three photos, the minimum (UC-020 E2).
  await expect(page.locator('#step-label')).toHaveText('List your place · Step 3 of 5');
  await page.locator('#photo-input').setInputFiles([await phonePhoto(page, '#2C7A76')]);
  await expect(page.locator('.photo-thumb')).toHaveCount(1);
  await page.getByLabel('Title').fill('Room by the port for swing workers');
  await expect(page.locator('#next-blocked')).toHaveText('Add at least 3 photos (2 more)');
  await page.locator('#photo-input').setInputFiles([await phonePhoto(page, '#E68A4B'), await phonePhoto(page, '#152238')]);
  await expect(page.locator('.photo-thumb')).toHaveCount(3);
  // AC-020-2: what was stored is a fresh JPEG, with no EXIF or GPS left.
  const src = await page.locator('.photo-thumb img').first().getAttribute('src');
  expect(src).toMatch(/listing-photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);
  const stored = (await (await request.get(src)).body()).toString('latin1');
  expect(stored.startsWith('\xff\xd8')).toBe(true);
  expect(stored).not.toContain('Exif');
  expect(stored).not.toContain('GPSLatitude');
  // AC-020-5: house rules stop at 200 characters.
  await page.getByLabel('Other house rules (optional)').fill('x'.repeat(250));
  await expect(page.getByLabel('Other house rules (optional)')).toHaveValue('x'.repeat(200));
  // BR-LST-005: a rule that excludes people can't go through; the host is asked to rephrase it.
  await page.getByLabel('Other house rules (optional)').fill('Christians welcome, no Muslims');
  await expect(page.locator('#next-blocked')).toHaveText('Keep it about the home, not about who can live there');
  await expect(page.locator('#wizard-next')).toBeDisabled();
  await page.getByLabel('Other house rules (optional)').fill('Quiet after 9pm, I fly out at 4am.');
  await page.locator('#wizard-next').click();

  // Step 4: free from a date, one night blocked.
  await expect(page.locator('#step-label')).toHaveText('List your place · Step 4 of 5');
  await page.getByRole('button', { name: 'From a date' }).click();
  const from = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date(Date.now() + 2 * 86400000));
  await page.getByLabel('Free from').fill(from);
  await page.getByLabel('Free from').dispatchEvent('change');
  const night = page.locator('.night-picker button.night.free').nth(3);
  await night.click();
  await expect(page.locator('.night-picker button.night.changed')).toHaveCount(1);
  await page.locator('#wizard-next').click();

  // Step 5: the statement, the preview as others see it, then Publish.
  await expect(page.locator('#step-label')).toHaveText('List your place · Step 5 of 5');
  await expect(page.locator('#phone-status')).toHaveText('✓ Mobile verified');
  await expect(page.locator('#wizard-next')).toBeDisabled();
  await expect(page.locator('#publish-missing')).toContainText('Confirm the photos and details are real and current');
  const preview = page.locator('#preview');
  await expect(preview).toContainText('Room by the port for swing workers');
  await expect(preview).toContainText('Port Hedland, WA · Private room · Own bathroom');
  await expect(preview).not.toContainText('Secret Crescent');
  await expect(preview.locator('.night.off').first()).toBeVisible();
  await page.getByLabel(/The photos and details are real and current/).check();
  await expect(page.locator('#wizard-next')).toBeEnabled();
  await page.locator('#wizard-next').click();
  await expect(page.getByRole('heading', { name: 'Your place is live' })).toBeVisible();

  // The detail is public now, and still without the address.
  const href = await page.locator('#see-listing').getAttribute('href');
  const id = new URL(href, page.url()).searchParams.get('id');
  const res = await request.post(`${local.url}/rest/v1/rpc/get_listing`, {
    headers: { apikey: local.anonKey, 'content-type': 'application/json' }, data: { p_id: id },
  });
  const pub = await res.json();
  expect(pub.status).toBe('active');
  expect(JSON.stringify(pub)).not.toContain('Secret Crescent');

  // Leave the seed host's count as it was (BR-LST-007): delete the test listing.
  const session = await (await authPost(request, 'token?grant_type=password', { email: SEED_HOST.email, password: SEED_HOST.password })).json();
  const del = await request.patch(`${local.url}/rest/v1/listings?id=eq.${id}`, {
    headers: { apikey: local.anonKey, authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json', prefer: 'return=minimal' },
    data: { status: 'removed' },
  });
  expect(del.ok()).toBe(true);
});
