// DEC-019: GA4 on the public page. Google is never called: its script is stubbed and the page is
// served as swingmate.au from the local server (CLAUDE.md §4.4).
import { test, expect } from '@playwright/test';

const GA_ID = 'G-TEST12345';

// Serves the repo as https://swingmate.au, with a measurement ID in the page.
async function serveAsSwingmate(page, baseURL) {
  const scripts = [];
  await page.route('https://swingmate.au/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${baseURL}${url.pathname}` });
    if (url.pathname !== '/') return route.fulfill({ response });
    const html = (await response.text()).replace('<meta name="ga-measurement-id" content="">', `<meta name="ga-measurement-id" content="${GA_ID}">`);
    return route.fulfill({ response, body: html });
  });
  await page.route('https://www.googletagmanager.com/**', (route) => {
    scripts.push(route.request().url());
    return route.fulfill({ contentType: 'text/javascript', body: '' });
  });
  await page.route(/google-analytics\.com|analytics\.google\.com/, (route) => route.abort());
  return scripts;
}

const dataLayer = (page) => page.evaluate(() => (window.dataLayer ?? []).map((args) => Array.from(args)));

test('DEC-019 without the published domain and an ID, Google Analytics never loads', async ({ page }) => {
  const google = [];
  page.on('request', (r) => { if (/google/.test(r.url())) google.push(r.url()); });
  await page.goto('/');
  await page.locator('#cta-try').click();
  await expect(page.locator('#analytics-note')).toBeHidden();
  expect(google).toEqual([]);
  expect(await page.evaluate(() => window.dataLayer)).toBeUndefined();
});

test('DEC-019 on swingmate.au GA4 gets a clean address and only the listed events', async ({ page, baseURL }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const scripts = await serveAsSwingmate(page, baseURL);
  await page.goto('https://swingmate.au/?utm_source=instagram&utm_campaign=bio&token_hash=secret#faq');

  await expect(page.locator('#analytics-note')).toBeVisible();
  await expect(page.locator('#analytics-note')).toContainText('This page uses Google Analytics');
  expect(scripts).toEqual([`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`]);

  const clean = 'https://swingmate.au/?utm_source=instagram&utm_campaign=bio';
  let calls = await dataLayer(page);
  expect(calls.find((c) => c[0] === 'config')).toEqual(['config', GA_ID, {
    send_page_view: false, page_location: clean, allow_google_signals: false, allow_ad_personalization_signals: false,
  }]);
  expect(calls.find((c) => c[1] === 'page_view')).toEqual(['event', 'page_view', { page_location: clean, page_title: await page.title() }]);

  await page.locator('#cta-try').click();
  await page.locator('#roster-form select[name="pattern"]').selectOption({ label: '8:6 (8 on, 6 off)' });
  await page.locator('#roster-form select[name="pattern"]').selectOption({ label: '7:7 (7 on, 7 off)' });
  calls = await dataLayer(page);
  const events = calls.filter((c) => c[0] === 'event').map((c) => [c[1], c[2]]);
  expect(events).toEqual([
    ['page_view', { page_location: clean, page_title: await page.title() }],
    ['cta_clicked', { cta: 'try_roster' }],
    ['roster_example_used', { pattern: '8:6' }],
  ]);
  expect(JSON.stringify(calls)).not.toContain('secret');
  expect(errors).toEqual([]);
});
