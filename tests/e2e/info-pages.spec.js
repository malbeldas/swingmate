// How it works, Safety, Terms and Privacy (#20, SEC-20, Q-01, BR-TRU-008), linked from the footer of
// every screen.
import { test, expect } from '@playwright/test';
import { requireLocalSupabase } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const LINKS = [
  ['How it works', 'how-it-works.html'],
  ['Safety', 'safety.html'],
  ['Terms', 'terms.html'],
  ['Privacy', 'privacy.html'],
];
const SCREENS = [
  '/', '/search.html', '/listing.html?id=00000000-0000-0000-0000-00000000f002', '/messages.html', '/account.html',
  '/list.html', '/admin.html', '/email-action.html', '/how-it-works.html', '/safety.html', '/terms.html', '/privacy.html',
];

test('#20 scenario 1 every screen links to How it works, Safety, Terms and Privacy in its footer', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  for (const screen of SCREENS) {
    await page.goto(screen);
    const nav = page.locator('footer').getByRole('navigation', { name: 'About SwingMate' });
    for (const [name, href] of LINKS) {
      await expect(nav.getByRole('link', { name, exact: true }), `${screen} → ${name}`).toHaveAttribute('href', href);
    }
  }
});

test('#20 scenario 2 SEC-20 Terms and Privacy say they are drafts and are not indexed', async ({ page }) => {
  for (const [screen, heading] of [['/terms.html', 'Terms of use'], ['/privacy.html', 'Privacy policy']]) {
    await page.goto(screen);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.locator('#draft-notice')).toContainText('Draft.');
    await expect(page.locator('#draft-notice')).toContainText('before SwingMate opens to everyone');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  }
  await expect(page.getByRole('link', { name: 'My account' })).toHaveAttribute('href', 'account.html#privacy');
});

test('BR-TRU-008 Safety shows "Before you agree" with the same four tips as the conversation', async ({ page }) => {
  await page.goto('/safety.html');
  const guide = page.locator('#before-you-agree');
  await expect(guide).toHaveAttribute('open', '');
  await expect(guide.locator('li')).toHaveText([
    'See the place, or do a video call, before you pay anything.',
    'Show your ID only in person, never in the chat.',
    'Put what you agree in writing.',
    'Lodge the bond with the WA Bond Administrator when one applies.',
  ]);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test('#20 How it works explains both sides and leads to search and to listing a place', async ({ page }) => {
  await page.goto('/how-it-works.html');
  await expect(page.getByRole('heading', { name: 'Looking for a place' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Have a room to share' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Search homes' })).toHaveAttribute('href', 'search.html');
  await expect(page.getByRole('link', { name: 'List a place' })).toHaveAttribute('href', 'list.html');
  await expect(page.getByText("SwingMate doesn't take payments, bookings or contracts.", { exact: false })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});
