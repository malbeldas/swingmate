// UC-021 (verify a mobile) against the local Supabase Auth, with the test numbers of
// [auth.sms.test_otp] in supabase/config.toml: no SMS provider is called (INT-003 AC-1).
import { test, expect } from '@playwright/test';
import {
  PASSWORD, TEST_SMS_CODE, createMember, requireLocalSupabase, sheet, testMobile, uniqueEmail,
} from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const ALWAYS_FREE = '00000000-0000-0000-0000-00000000f001'; // Baldivis
const TILE = new URL('./fixtures/tile.png', import.meta.url).pathname;

function perthDay(offset = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ path: TILE, contentType: 'image/png' }));
});

async function logInFromHeader(page, email) {
  await page.locator('#account').getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
}

async function logInOnAccountPage(page, email) {
  await page.goto('/account.html');
  const main = page.locator('#account-main');
  await main.getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(PASSWORD);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(main.getByRole('heading', { name: 'Profile' })).toBeVisible();
}

test('UC-021 BR-LST-003 a host verifies the mobile in step 5, after a number from abroad and a wrong code', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'mob');
  await createMember(request, email, 'Mia');
  await page.goto('/list.html?step=5');
  await logInFromHeader(page, email);
  const form = page.locator('#verification');
  await expect(page.locator('#publish-missing')).toContainText('Verify your mobile');

  // UC-021 E1, scenario 3 of #12: only Australian mobiles, and nothing is sent.
  await form.getByLabel('Mobile number').fill('+64 21 123 4567');
  await form.getByRole('button', { name: 'Send code' }).click();
  await expect(page.locator('#phone-error')).toHaveText('Only Australian mobile numbers work here, like 0412 345 678.');
  await expect(form.getByLabel('Code we texted you')).toBeHidden();

  const mobile = testMobile(testInfo, 1);
  await form.getByLabel('Mobile number').fill(mobile);
  await form.getByRole('button', { name: 'Send code' }).click();
  await expect(page.locator('#phone-sent')).toHaveText(`We texted a code to ${mobile}. It expires in 10 minutes.`);
  // UC-021 A1: "Send again" waits 60 seconds.
  await expect(form.locator('#send-code')).toBeDisabled();
  await expect(form.locator('#send-code')).toHaveText(/^Send again in \d+ s$/);

  // UC-021 E2: a wrong code says so and lets the person try again.
  await form.getByLabel('Code we texted you').fill('000000');
  await form.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.locator('#phone-error')).toHaveText('That code is wrong or has expired. Check it or send a new one.');
  await form.getByLabel('Code we texted you').fill(TEST_SMS_CODE);
  await form.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.locator('#phone-verified')).toHaveText('✓ Mobile verified');
  // BR-LST-003: the mobile is no longer what stops Publish.
  await expect(page.locator('#publish-missing')).not.toContainText('Verify your mobile');

  // It stays verified on the next visit, and My account says so.
  await page.goto('/account.html');
  await expect(page.locator('#verification')).toContainText('✓ Phone verified');
  await page.screenshot({ path: testInfo.outputPath(`phone-verified-${testInfo.project.name}.png`), fullPage: true });
});

test('AC-004-6 AC-024-1 a host asks for a verified phone: verify in the same flow and the same message goes', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'mob-msg');
  await createMember(request, email);
  await page.goto(`/listing.html?id=${ALWAYS_FREE}&in=${perthDay(7)}&out=${perthDay(21)}`);
  await logInFromHeader(page, email);
  // The seed host takes any verified email, so the first answer stands in for one who asks for a
  // phone (pgTAP covers that rule in start_conversation); after verifying, the real call goes.
  let asked = 0;
  await page.route('**/rest/v1/rpc/start_conversation', (route) => {
    asked += 1;
    if (asked === 1) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"reason":"phone"}' });
    return route.continue();
  });
  const box = page.locator('#message-box');
  await box.getByLabel('Message').fill('Hi, is the room free for my next swing?');
  await box.getByRole('button', { name: 'Send message' }).click();

  const phone = page.locator('#phone-sheet');
  await expect(phone.getByRole('heading', { name: 'Verify your phone' })).toBeVisible();
  await expect(phone).toContainText('Seed Host only takes messages from people with a verified phone. We never show your number to anyone.');
  await page.screenshot({ path: testInfo.outputPath(`phone-sheet-${testInfo.project.name}.png`) });
  await phone.getByLabel('Mobile number').fill(testMobile(testInfo, 2));
  await phone.getByRole('button', { name: 'Send code' }).click();
  await phone.getByLabel('Code we texted you').fill(TEST_SMS_CODE);
  await phone.getByRole('button', { name: 'Verify and send' }).click();

  await expect(phone).toBeHidden();
  await expect(box.getByRole('heading', { name: 'Message sent to Seed Host' })).toBeVisible();
  await expect(box.locator('.sent-text')).toHaveText('Hi, is the room free for my next swing?');
  expect(asked).toBe(2);
});

test('AC-021-2 five wrong codes lock verification for an hour', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'mob-lock');
  await createMember(request, email);
  await logInOnAccountPage(page, email);
  await page.getByRole('button', { name: 'Verify my phone' }).click();
  const phone = page.locator('#phone-sheet');
  await expect(phone).toContainText('Some hosts only take messages from people with a verified phone.');
  await phone.getByLabel('Mobile number').fill(testMobile(testInfo, 3));
  await phone.getByRole('button', { name: 'Send code' }).click();
  await expect(phone.locator('#phone-sent')).toBeVisible();
  for (let i = 1; i <= 4; i++) {
    await phone.getByLabel('Code we texted you').fill(`00000${i}`);
    await phone.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(phone.locator('#phone-error')).toHaveText('That code is wrong or has expired. Check it or send a new one.');
  }
  await phone.getByLabel('Code we texted you').fill('000005');
  await phone.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(phone.locator('#phone-error')).toHaveText('Too many wrong codes. Try again in an hour.');
  // Locked: even the right code isn't tried.
  await phone.getByLabel('Code we texted you').fill(TEST_SMS_CODE);
  await phone.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(phone.locator('#phone-error')).toHaveText('Too many wrong codes. Try again in an hour.');
  await page.reload();
  await expect(page.locator('#verification')).toContainText('Phone not verified');
});

test('AC-021-1 UC-021 E4 a number verified in another account is refused', async ({ page, request }, testInfo) => {
  const email = uniqueEmail(testInfo, 'mob-taken');
  await createMember(request, email);
  await logInOnAccountPage(page, email);
  await page.getByRole('button', { name: 'Verify my phone' }).click();
  const phone = page.locator('#phone-sheet');
  // The seed host's mobile (supabase/seed.sql).
  await phone.getByLabel('Mobile number').fill('0400 000 999');
  await phone.getByRole('button', { name: 'Send code' }).click();
  await expect(phone.locator('#phone-error')).toHaveText('This number is already in use');
  await expect(phone.getByLabel('Code we texted you')).toBeHidden();
});
