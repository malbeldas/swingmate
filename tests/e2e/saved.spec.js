// Saved homes (#30, UC-005) against the local Supabase, Mailpit and supabase/seed.sql. Each test
// saves as its own new member, so the seed listings stay as they are.
import { test, expect } from '@playwright/test';
import { PASSWORD, codeFor, createMember, requireLocalSupabase, sheet, uniqueEmail } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const BALDIVIS = 90002;
const ALWAYS_FREE = { id: '00000000-0000-0000-0000-00000000f001', title: 'Seed: room free every night' };
const PAUSED = { id: '00000000-0000-0000-0000-00000000f008', title: 'Seed: paused by the host' };
const TILE = new URL('./fixtures/tile.png', import.meta.url).pathname;

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ path: TILE, contentType: 'image/png' }));
  await page.addInitScript(() => { try { localStorage.setItem('swingmate.firstVisitDone', '1'); } catch { /* */ } });
});

test('UC-005 AC-005-1 a visitor taps Save, signs up, and the home is saved on the card, the detail and Saved homes', async ({ page, request }, testInfo) => {
  await page.goto(`/search.html?place=${BALDIVIS}`);
  const card = page.locator(`.result-card[data-id="${ALWAYS_FREE.id}"]`);
  const cardSave = card.locator('.save-btn');
  await expect(cardSave).toHaveAttribute('aria-pressed', 'false');
  await cardSave.click();

  // Without an account, Save asks to sign up first.
  await expect(sheet(page).getByRole('heading', { name: 'Create your SwingMate account' })).toBeVisible();
  const email = uniqueEmail(testInfo, 'save');
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Create a password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Continue with email' }).click();
  await sheet(page).getByLabel('Code').fill(await codeFor(request, email));
  await sheet(page).getByRole('button', { name: 'Verify email' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'A few details hosts need' })).toBeVisible();
  await sheet(page).getByLabel('Name shown to hosts').fill('Sol');
  await sheet(page).getByLabel("Where you're based (suburb)").fill('Baldivis, WA');
  await sheet(page).getByLabel('I agree to the Terms of Use and Privacy Policy').check();
  await sheet(page).getByRole('button', { name: 'Finish' }).click();
  await expect(sheet(page)).toBeHidden();

  // Once signed up, the home is saved without tapping again.
  await expect(cardSave).toHaveAttribute('aria-pressed', 'true');
  await expect(cardSave).toHaveText('Saved');

  await page.goto(`/listing.html?id=${ALWAYS_FREE.id}`);
  const detailSave = page.locator('.detail-price .save-btn');
  await expect(detailSave).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/account.html#saved');
  const saved = page.locator('#saved');
  await expect(saved.getByRole('heading', { name: 'Saved homes' })).toBeVisible();
  const row = saved.locator(`[data-saved="${ALWAYS_FREE.id}"]`);
  await expect(row).toContainText(ALWAYS_FREE.title);
  await expect(row.locator('.place-status')).toHaveCount(0);

  // Removing it shows in Saved homes and on the detail.
  await row.getByRole('button', { name: 'Remove' }).click();
  await expect(saved.locator('#saved-empty')).toHaveText('Nothing saved yet. Tap “Save” on any home to keep it here.');
  await page.goto(`/listing.html?id=${ALWAYS_FREE.id}`);
  await expect(detailSave).toHaveAttribute('aria-pressed', 'false');
  await expect(detailSave).toHaveText('Save');
});

test('AC-005-2 a saved home that is paused shows in Saved homes with its status', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'paused');
  await createMember(request, email, 'Rio');
  await page.goto(`/listing.html?id=${PAUSED.id}`);
  await page.locator('#account').getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(sheet(page)).toBeHidden();

  const save = page.locator('.detail-price .save-btn');
  await save.click();
  await expect(save).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/account.html#saved');
  const row = page.locator(`#saved [data-saved="${PAUSED.id}"]`);
  await expect(row).toContainText(PAUSED.title);
  await expect(row.locator('.place-status')).toHaveText('Paused');
  await expect(row.getByRole('link', { name: 'View' })).toHaveAttribute('href', `listing.html?id=${PAUSED.id}`);
});
