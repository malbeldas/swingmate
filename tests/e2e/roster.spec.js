// UC-002 in My account against the local Supabase: the picker, the 12-week view and saving.
// Needs `supabase start` and `npm run local:config`, which CI runs before Playwright.
import { test, expect } from '@playwright/test';
import { PASSWORD, createMember, requireLocalSupabase, sheet, uniqueEmail } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const main = (page) => page.locator('#account-main');
const picker = (page) => page.locator('#roster-picker');
const myRosterNights = (page) => main(page).locator('#roster-body .weeks .night');

// The coming Monday in Perth (BR-AVL-005), like the picker's default.
function nextMondayInPerth() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (((8 - d.getUTCDay()) % 7) || 7));
  return d.toISOString().slice(0, 10);
}

async function logIn(page, request, testInfo, who) {
  const email = uniqueEmail(testInfo, who);
  await createMember(request, email);
  await page.goto('/account.html');
  await main(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(main(page).getByRole('heading', { name: 'My roster' })).toBeVisible();
}

test('AC-001-2 a 14:7 saved with the defaults needs 8 nights every cycle in the next 84', async ({ page, request }, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await logIn(page, request, testInfo, 'defaults');
  await expect(main(page).locator('#roster-summary')).toHaveText('No fixed roster');

  await main(page).getByRole('button', { name: 'Add my roster' }).click();
  await expect(picker(page).getByRole('button', { name: '14 : 7' })).toHaveAttribute('aria-pressed', 'true');
  await expect(picker(page).getByLabel('When does your next swing start?')).toHaveValue(nextMondayInPerth());
  await picker(page).getByRole('button', { name: 'Save roster' }).click();
  await expect(picker(page)).toBeHidden();

  await expect(main(page).getByRole('heading', { name: 'My roster · next 12 weeks' })).toBeVisible();
  await expect(main(page).locator('#roster-summary')).toHaveText(/^14:7 · next swing \w{3} \d{1,2} \w{3}$/);
  await expect(myRosterNights(page)).toHaveCount(84);
  await expect(main(page).locator('#roster-body .weeks .night.home, #roster-body .weeks .night.travel')).toHaveCount(32);
  await expect(main(page).locator('#public-card')).toContainText('14:7 roster');

  // It stays after a reload: it is in the profile, not in the page.
  await page.reload();
  await expect(main(page).locator('#roster-summary')).toContainText('14:7 · next swing');
  expect(errors).toEqual([]);
});

test('AC-002-1 the preview marks the travel night when flying home on the last day of the swing', async ({ page, request }, testInfo) => {
  await logIn(page, request, testInfo, 'travel');
  await main(page).getByRole('button', { name: 'Add my roster' }).click();
  const anchor = nextMondayInPerth();
  const lastDay = new Date(`${anchor}T00:00:00Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() + 13);
  const cell = picker(page).locator(`#roster-preview .night[data-date="${lastDay.toISOString().slice(0, 10)}"]`);
  await expect(cell).toHaveClass(/travel/);
  await expect(cell).toHaveAttribute('title', /last day on site, you fly home$/);

  await picker(page).getByLabel('I fly home on the last day of my swing, so I need a bed that night').uncheck();
  await expect(cell).toHaveClass(/away/);
  await expect(picker(page).locator('#roster-preview .night.travel')).toHaveCount(0);
});

test('AC-002-2 not flying out on the first day drops the last night of each R&R', async ({ page, request }, testInfo) => {
  await logIn(page, request, testInfo, 'flyout');
  await main(page).getByRole('button', { name: 'Add my roster' }).click();
  await picker(page).getByLabel('I fly out on the first day of my next swing, so I need a bed the night before').uncheck();
  await picker(page).getByRole('button', { name: 'Save roster' }).click();
  // 8 nights every 21 days less one: 4 cycles x 7 in 84 nights.
  await expect(main(page).locator('#roster-body .weeks .night.home, #roster-body .weeks .night.travel')).toHaveCount(28);
  await expect(main(page).locator('#roster-detail')).toContainText('You fly out the day before each swing.');
});

test('UC-002 A2 other pattern, E1 no anchor, and A1 no fixed roster', async ({ page, request }, testInfo) => {
  await logIn(page, request, testInfo, 'other');
  await main(page).getByRole('button', { name: 'Add my roster' }).click();
  await picker(page).getByRole('button', { name: 'Other pattern' }).click();
  await picker(page).getByLabel('Days on site').fill('10');
  await picker(page).getByLabel('Days in town').fill('4');

  // E1: without the anchor it can't be saved and the field is marked.
  await picker(page).getByLabel('When does your next swing start?').fill('');
  await picker(page).getByRole('button', { name: 'Save roster' }).click();
  await expect(picker(page).getByRole('alert')).toHaveText('Choose the day your next swing starts');
  await expect(picker(page).getByLabel('When does your next swing start?')).toHaveAttribute('aria-invalid', 'true');

  await picker(page).getByLabel('When does your next swing start?').fill(nextMondayInPerth());
  await picker(page).getByLabel('Days on site').fill('43');
  await picker(page).getByRole('button', { name: 'Save roster' }).click();
  await expect(picker(page).getByRole('alert')).toHaveText('Days on site and in town go from 1 to 42');

  await picker(page).getByLabel('Days on site').fill('10');
  await picker(page).getByRole('button', { name: 'Save roster' }).click();
  await expect(main(page).locator('#roster-summary')).toContainText('10:4 · next swing');

  // A1: "No fixed roster" removes it and the profile goes back to searching by dates.
  await main(page).getByRole('button', { name: 'Change roster' }).click();
  await expect(picker(page).getByRole('button', { name: 'Other pattern' })).toHaveAttribute('aria-pressed', 'true');
  await picker(page).getByRole('button', { name: 'No fixed roster' }).click();
  await expect(picker(page).locator('#no-roster-note')).toBeVisible();
  await picker(page).getByRole('button', { name: 'Save roster' }).click();
  await expect(main(page).locator('#roster-detail')).toHaveText('No fixed roster. Search with your dates instead.');
  await page.reload();
  await expect(main(page).locator('#roster-summary')).toHaveText('No fixed roster');
});
