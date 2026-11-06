// My places (#14, UC-022) against the local Supabase and supabase/seed.sql. Each test makes its own
// listing in Port Hedland through the API, so the seed listings other E2E files search stay as they are.
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { SEED_ADMIN, SEED_HOST, authPost, local, requireLocalSupabase, sheet } from './auth-helpers.js';

test.beforeAll(requireLocalSupabase);

const PORT_HEDLAND = { id: 90007, lat: -20.3106, lng: 118.6060 };

async function passwordSession(request, { email, password }) {
  const res = await authPost(request, 'token?grant_type=password', { email, password });
  if (!res.ok()) throw new Error(`log in failed with ${res.status()}`);
  return res.json();
}

function rest(request, session, method, path, data) {
  return request.fetch(`${local.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: local.anonKey, 'content-type': 'application/json', prefer: 'return=minimal',
      ...(session ? { authorization: `Bearer ${session.access_token}` } : {}),
    },
    data,
  });
}

async function rpc(request, session, name, args) {
  const res = await request.post(`${local.url}/rest/v1/rpc/${name}`, {
    headers: { apikey: local.anonKey, 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session.access_token}` } : {}) },
    data: args,
  });
  expect(res.ok(), `${name} ${res.status()}`).toBe(true);
  return res.json();
}

// A live listing of the seed host, free every night from today, made the way the wizard saves one.
async function liveListing(request, host, title) {
  const id = randomUUID();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date());
  expect((await rest(request, host, 'POST', 'listings', {
    id, owner_id: host.user.id, title, suburb_id: PORT_HEDLAND.id, place_type: 'private_room', bathroom: 'own',
    weekly_price: 250, bills_included: true, bond: 500, furnished: true, availability_type: 'from_date', available_from: today,
  })).status()).toBe(201);
  expect((await rest(request, host, 'POST', 'listing_private', {
    listing_id: id, address_line: '12 Hidden Lane', lat: PORT_HEDLAND.lat + 0.001, lng: PORT_HEDLAND.lng + 0.001,
  })).status()).toBe(201);
  expect((await rest(request, host, 'POST', 'listing_photos', [0, 1, 2].map((position) => ({
    listing_id: id, storage_path: `${id}/${randomUUID()}.jpg`, position, width: 1600, height: 1200,
  })))).status()).toBe(201);
  const published = await rpc(request, host, 'publish_listing', { p_listing_id: id, p_accuracy_declared: true });
  expect(published.ok, JSON.stringify(published)).toBe(true);
  return id;
}

async function logIn(page, email, password) {
  await page.locator('#account').getByRole('button', { name: 'Log in', exact: true }).click();
  await sheet(page).getByLabel('Email').fill(email);
  await sheet(page).getByLabel('Password').fill(password);
  await sheet(page).getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
}

async function openPlaces(page) {
  await page.goto('/account.html#listings');
  await logIn(page, SEED_HOST.email, SEED_HOST.password);
  await expect(page.locator('#places-title')).toHaveText('My places');
}

async function inSearch(request, id) {
  const rows = await rpc(request, null, 'search_listings', { p_lat: PORT_HEDLAND.lat, p_lng: PORT_HEDLAND.lng, p_radius_km: 15 });
  return rows.some((r) => r.id === id);
}

test('AC-022-1 AC-022-2 UC-022 the host blocks a night, confirms the calendar, pauses, fills and deletes', async ({ page, request, browser }) => {
  const host = await passwordSession(request, SEED_HOST);
  const id = await liveListing(request, host, 'Room near the port, test of my places');
  await openPlaces(page);

  const card = page.locator(`[data-listing="${id}"]`);
  await expect(card.locator('.place-status')).toHaveText('Live');
  await expect(card.locator('.place-summary')).toHaveText('Available 84 of the next 84 nights · no messages yet');

  // AC-022-1: a tapped night is saved at once and shows Unavailable to everyone.
  await card.locator('[data-action=calendar]').click();
  const night = card.locator('.night-picker button.night.free:not([disabled])').nth(2);
  const date = await night.getAttribute('data-night');
  await night.click();
  await expect(card.locator('.place-summary')).toHaveText('Available 83 of the next 84 nights · no messages yet');
  const seen = await rpc(request, null, 'get_listing', { p_id: id, p_start: date });
  expect(seen.nights[0]).toBe('0');
  // Tapping it again frees it.
  await card.locator(`[data-night="${date}"]`).click();
  await expect(card.locator('.place-summary')).toHaveText('Available 84 of the next 84 nights · no messages yet');
  expect((await rpc(request, null, 'get_listing', { p_id: id, p_start: date })).nights[0]).toBe('1');

  // BR-AVL-006: "My calendar is up to date".
  await card.getByRole('button', { name: 'My calendar is up to date' }).click();
  await expect(card.locator('.place-updated')).toHaveText('Calendar updated today');

  // AC-022-2: paused leaves the search and still opens by link, saying so and without the message box.
  await card.locator('[data-action=pause]').click();
  await expect(card.locator('.place-status')).toHaveText('Paused');
  expect(await inSearch(request, id)).toBe(false);
  const other = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: page.viewportSize() });
  const visitor = await other.newPage();
  await visitor.goto(`/listing.html?id=${id}`);
  await expect(visitor.locator('#status-label')).toHaveText('This listing is paused');
  await expect(visitor.locator('#message-box')).toHaveCount(0);
  await other.close();

  await card.locator('[data-action=resume]').click();
  await expect(card.locator('.place-status')).toHaveText('Live');
  expect(await inSearch(request, id)).toBe(true);

  // UC-022: filled, then reactivated.
  await card.locator('[data-action=fill]').click();
  await expect(card.locator('.place-status')).toHaveText('Filled');
  expect(await inSearch(request, id)).toBe(false);
  await card.locator('[data-action=reactivate]').click();
  await expect(card.locator('.place-status')).toHaveText('Live');

  // Delete asks first, and keeping it changes nothing.
  await card.locator('[data-action=remove]').click();
  await card.getByRole('button', { name: 'Keep it' }).click();
  await expect(card.locator('[data-action=remove]')).toBeVisible();
  await card.locator('[data-action=remove]').click();
  await card.locator('.btn-danger').click();
  await expect(card).toHaveCount(0);
  expect(await inSearch(request, id)).toBe(false);
});

test('AC-022-3 a listing hidden by SwingMate shows why and offers nothing to press', async ({ page, request }) => {
  const host = await passwordSession(request, SEED_HOST);
  const id = await liveListing(request, host, 'Room near the port, test of a hidden one');
  const admin = await passwordSession(request, SEED_ADMIN);
  const hidden = await rpc(request, admin, 'admin_moderate', {
    p_target_type: 'listing', p_target_id: id, p_action: 'hide_listing', p_note: 'Photos of another home',
  });
  expect(hidden.ok, JSON.stringify(hidden)).toBe(true);

  await openPlaces(page);
  const card = page.locator(`[data-listing="${id}"]`);
  await expect(card.locator('.place-status')).toHaveText('Hidden by SwingMate');
  await expect(card.locator(`#hidden-${id}`)).toContainText('Photos of another home');
  await expect(card.locator('[data-action]')).toHaveCount(0);
  // Nor can the host bring it back through the API (BR-LST-002).
  const back = await rpc(request, host, 'publish_listing', { p_listing_id: id, p_accuracy_declared: true });
  expect(back).toMatchObject({ ok: false, reason: 'status' });

  // Leave the seed host's listings as they were: unhide (it goes back to paused), then delete.
  expect((await rpc(request, admin, 'admin_moderate', {
    p_target_type: 'listing', p_target_id: id, p_action: 'unhide_listing', p_note: 'E2E clean up',
  })).ok).toBe(true);
  expect((await rest(request, host, 'PATCH', `listings?id=eq.${id}`, { status: 'removed' })).ok()).toBe(true);
});
