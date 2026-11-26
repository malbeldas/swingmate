// "Find my match" step by step (UC-002 A0, DEC-016, proposed AC-002-6) against the local Supabase
// and supabase/seed.sql. Needs `supabase start` and `npm run local:config`, which CI runs first.
import { test, expect } from '@playwright/test';
import { requireLocalSupabase } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const BALDIVIS = 50054;

function perthDay(offset = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const next = (page) => page.locator('#find-next');

// Moves the calendar forward until the day shows, then taps it.
async function pickDay(page, iso) {
  const day = page.locator(`[data-date="${iso}"]`);
  for (let i = 0; i < 3 && !(await day.count()); i += 1) await page.getByRole('button', { name: 'Next month' }).click();
  await day.click();
}

test('AC-002-6 the home opens the guided way in', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Work a roster? Find your match step by step' }).click();
  await expect(page).toHaveURL(/find\.html$/);
  await expect(page.getByRole('heading', { name: 'What’s your roster?' })).toBeVisible();
  await expect(page.locator('#find-step-label')).toHaveText('Step 1 of 3');
});

test('AC-002-6 each step waits for its answer and past days cannot be picked', async ({ page }) => {
  await page.goto('/find.html');
  await expect(next(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Something else' }).click();
  await page.getByLabel('Days on site').fill('43');
  await expect(next(page)).toBeDisabled();
  await page.getByLabel('Days on site').fill('10');
  await page.getByLabel('Days at home').fill('4');
  await expect(page.locator('#find-preview')).toContainText('10 days on site, 4 at home. You need a bed 5 nights in every 14.');
  await expect(next(page)).toBeEnabled();
  await next(page).click();

  await expect(page.locator('#find-step-label')).toHaveText('Step 2 of 3');
  await expect(next(page)).toBeDisabled();
  const yesterday = page.locator(`[data-date="${perthDay(-1)}"]`);
  if (await yesterday.count()) await expect(yesterday).toBeDisabled();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Something else' })).toHaveAttribute('aria-pressed', 'true');
});

test('AC-002-6 roster, next swing and place end on the results with the roster kept for the tab (BR-ROS-006)', async ({ page }) => {
  await page.goto('/find.html');
  await page.getByRole('button', { name: '8 on / 6 off' }).click();
  await expect(page.locator('#find-preview .night')).toHaveCount(14);
  await expect(page.locator('#find-preview')).toContainText('You need a bed 7 nights in every 14.');
  await next(page).click();

  // BR-ROS-003: the swing paints the calendar from the day picked, travel night included.
  const anchor = perthDay(3);
  await pickDay(page, anchor);
  await expect(page.locator(`[data-date="${anchor}"]`)).toHaveClass(/away/);
  await expect(page.locator(`[data-date="${anchor}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#find-summary')).toContainText('You need a bed');
  await next(page).click();

  await expect(page.locator('#find-step-label')).toHaveText('Step 3 of 3');
  await expect(page.locator('.find-recap')).toContainText('8:6 roster');
  await page.getByRole('button', { name: 'Show my matches' }).click();
  await expect(page.locator('#find-place-error')).toHaveText('Choose a suburb or city from the list.');
  await page.getByLabel('Location').fill('Baldivis, WA');
  await page.getByRole('button', { name: 'Show my matches' }).click();

  await expect(page).toHaveURL(new RegExp(`search\\.html\\?place=${BALDIVIS}&radius=15$`));
  await expect(page.locator('#roster-summary')).toContainText('8:6 · next swing');
  await expect(page.locator('#first-visit')).toBeHidden(); // AC-002-5
  const stored = await page.evaluate(() => ({ local: { ...localStorage }, session: Object.keys(sessionStorage) }));
  expect(stored.local).toEqual({ 'swingmate.firstVisitDone': '1' });
  expect(stored.session.length).toBeGreaterThan(0);
});
