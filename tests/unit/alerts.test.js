import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALERT_TEXTS, alertFilters, alertFromSearch, alertLabel, alertNeed, alertSearch, alertStatus, alertStatusLine, digestItem, newMatches,
} from '../../core/alerts.js';
import { needFor } from '../../core/fit.js';
import { searchStart, withFit } from '../../core/search.js';
import { rosterFromRow, rosterToRow, makeRoster } from '../../core/roster.js';
import { runAlerts } from '../../supabase/functions/_shared/alerts-job.js';

// 7:00 in Perth on 5 Nov 2026.
const NOW = new Date('2026-11-04T23:00:00Z');
const TODAY = '2026-11-05';
const ROCKINGHAM = { id: 90003, name: 'Rockingham', state: 'WA', lat: -32.28, lng: 115.73, timezone: 'Australia/Perth' };
const ROSTER = rosterToRow(makeRoster({ daysOn: 14, daysOff: 7, anchor: '2026-11-01' }));

test('UC-006 step 2 a search saves place, radius, dates or roster and the filters', () => {
  assert.deepEqual(alertFromSearch({ placeId: 90003, radiusKm: 15, checkIn: '2026-12-10', checkOut: '2026-12-17', hasRoster: true, filters: { placeTypes: ['private_room'], maxPrice: 300 } }), {
    suburb_id: 90003, radius_km: 15, stay_from: '2026-12-10', stay_to: '2026-12-17', use_roster: false, place_type: 'private_room', max_price: 300,
  });
  assert.deepEqual(alertFromSearch({ placeId: 90003, radiusKm: 40, hasRoster: true, filters: { placeTypes: ['private_room', 'entire_place'], maxPrice: null } }), {
    suburb_id: 90003, radius_km: 40, stay_from: null, stay_to: null, use_roster: true, place_type: null, max_price: null,
  });
  assert.equal(alertFromSearch({ placeId: 90003, radiusKm: 15, hasRoster: false }), null, 'no dates and no roster: nothing to fit');
  assert.equal(alertFromSearch({ placeId: null, radiusKm: 15, hasRoster: true }), null);
});

test('UC-006 A1 an alert reads with its place, nights, filters and status', () => {
  const roster = rosterFromRow(ROSTER);
  const byRoster = { radius_km: 15, use_roster: true, stay_from: null, stay_to: null, paused: false, expires_at: '2027-02-03T00:00:00Z' };
  assert.equal(alertLabel(byRoster, ROCKINGHAM, roster), 'Rockingham, WA · 15 km · your 14:7 roster');
  assert.equal(alertLabel({ ...byRoster, use_roster: false, stay_from: '2026-12-10', stay_to: '2026-12-17' }, ROCKINGHAM), 'Rockingham, WA · 15 km · 10 – 17 Dec');
  assert.equal(alertFilters({ place_type: 'private_room', max_price: 300 }), 'Private rooms · up to $300 / week');
  assert.equal(alertFilters({ place_type: null, max_price: null }), '');
  assert.equal(alertStatus(byRoster, NOW, TODAY), 'on');
  assert.equal(alertStatusLine('on', byRoster), 'Emails on · until 3 Feb');
  assert.equal(alertStatus({ ...byRoster, paused: true }, NOW, TODAY), 'paused');
  assert.equal(alertStatusLine('paused', byRoster), ALERT_TEXTS.paused);
});

test('AC-006-2 an alert past its 90 days, or whose stay has passed, is expired', () => {
  assert.equal(alertStatus({ paused: false, expires_at: '2026-11-04T22:59:00Z' }, NOW, TODAY), 'expired');
  assert.equal(alertStatus({ paused: true, expires_at: '2026-11-01T00:00:00Z' }, NOW, TODAY), 'expired');
  assert.equal(alertStatus({ paused: false, expires_at: '2027-01-01T00:00:00Z', stay_to: '2026-11-05' }, NOW, TODAY), 'expired');
});

// search_listings rows: nights strings start on the search's start date.
function row(id, nights, extra = {}) {
  return {
    id, title: `Home ${id}`, suburb_name: 'Rockingham', state: 'WA', place_type: 'private_room', weekly_price: 280,
    published_at: '2026-11-04T10:00:00Z', cover_path: `${id}/0.jpg`, nights, ...extra,
  };
}
const datedAlert = {
  alert_id: 'a1', user_id: 'u1', email: 'u1@example.com', name: 'Alex', place: ROCKINGHAM, radius_km: 15,
  stay_from: '2026-12-10', stay_to: '2026-12-20', use_roster: false, roster: null, place_type: null, max_price: null,
  created_at: '2026-11-01T00:00:00Z', delivered: [],
};

test('AC-053-1 an alert finds the same fit the results page shows for the same search', () => {
  const rows = [row('full', '1'.repeat(10)), row('strong', '1111011111'), row('partial', '1110011101'), row('poor', '0'.repeat(10))];
  const today = TODAY;
  const start = searchStart({ checkIn: datedAlert.stay_from, checkOut: datedAlert.stay_to }, today);
  const need = needFor({ checkIn: datedAlert.stay_from, checkOut: datedAlert.stay_to }, today);
  const search = rows.map((r) => withFit(r, need, start));
  const alert = newMatches(datedAlert, rows, today);
  assert.deepEqual(alert.map((i) => [i.id, i.fitClass]), search.filter((i) => ['full', 'strong'].includes(i.fitClass)).map((i) => [i.id, i.fitClass]));
  assert.deepEqual(alert.map((i) => i.id), ['full', 'strong']);
  assert.deepEqual(alertSearch(datedAlert, today), { p_lat: -32.28, p_lng: 115.73, p_radius_km: 15, p_start: '2026-12-10' });

  // By roster, the nights are the person's roster from today, as in the search.
  const rosterAlert = { ...datedAlert, stay_from: null, stay_to: null, use_roster: true, roster: ROSTER };
  assert.deepEqual(alertNeed(rosterAlert, today).nights, needFor({ roster: rosterFromRow(ROSTER) }, today).nights);
  assert.equal(alertSearch(rosterAlert, today).p_start, today);
  assert.deepEqual(newMatches(rosterAlert, [row('free', '1'.repeat(84))], today).map((i) => i.fitClass), ['full']);
  assert.deepEqual(newMatches({ ...rosterAlert, roster: null }, [row('free', '1'.repeat(84))], today), [], 'no roster: nothing fits');
});

test('UC-053 only homes published after the alert, not sent before and within its filters', () => {
  const rows = [
    row('old', '1'.repeat(10), { published_at: '2026-10-30T00:00:00Z' }),
    row('sent', '1'.repeat(10)),
    row('place', '1'.repeat(10), { place_type: 'entire_place' }),
    row('dear', '1'.repeat(10), { weekly_price: 400 }),
    row('ok', '1'.repeat(10)),
  ];
  const alert = { ...datedAlert, delivered: ['sent'], place_type: 'private_room', max_price: 300 };
  assert.deepEqual(newMatches(alert, rows, TODAY).map((i) => i.id), ['ok']);
});

test('NTF-007 each home carries its title, suburb, price, label and fit line', () => {
  const [item] = newMatches(datedAlert, [row('full', '1'.repeat(10))], TODAY);
  assert.deepEqual(digestItem(item, { url: 'https://swingmate.au/listing.html?id=full', photoUrl: 'p.jpg' }), {
    title: 'Home full', suburb: 'Rockingham, WA', price: 280, fitLabel: 'Great date fit',
    fitLine: 'Free for all 10 nights you need', url: 'https://swingmate.au/listing.html?id=full', photoUrl: 'p.jpg',
  });
});

function fakeStore(alerts, rowsFor, { failures = 0 } = {}) {
  const calls = { search: [], log: [], delivered: [] };
  return {
    calls,
    async pending() { return alerts; },
    async search(args) { calls.search.push(args); return rowsFor(args); },
    photoUrl(path) { return `https://cdn.test/${path}`; },
    async log(entry) { calls.log.push(entry); },
    async failures() { return failures; },
    async delivered(pairs) { calls.delivered.push(...pairs); },
  };
}

test('AC-006-1 several new homes from two alerts of one person go in a single email', async () => {
  const second = { ...datedAlert, alert_id: 'a2', radius_km: 25 };
  const other = { ...datedAlert, alert_id: 'b1', user_id: 'u2', email: 'u2@example.com', name: 'Bo' };
  const rows = (args) => (args.p_radius_km === 25 ? [row('h1', '1'.repeat(10)), row('h3', '1'.repeat(10))] : [row('h1', '1'.repeat(10)), row('h2', '1'.repeat(10))]);
  const store = fakeStore([datedAlert, second, other], rows);
  const sent = [];
  const out = await runAlerts({ store, send: async (m) => { sent.push(m); return { status: 'sent', providerMessageId: 'x' }; }, appUrl: 'https://swingmate.au/', now: NOW });
  assert.deepEqual(out, { sent: 2, failed: 0 });
  assert.deepEqual(sent.map((m) => m.to), ['u1@example.com', 'u2@example.com']);
  assert.equal(sent[0].mail.subject, '3 homes that fit your roster', 'h1 once, though both alerts found it');
  assert.match(sent[0].mail.text, /Rockingham, WA · 15 km · 10 – 20 Dec; Rockingham, WA · 25 km · 10 – 20 Dec/);
  assert.match(sent[0].mail.text, /https:\/\/swingmate\.au\/listing\.html\?id=h1&src=email&ntf=NTF-007/);
  assert.match(sent[0].mail.html, /https:\/\/cdn\.test\/h1\/0\.jpg/);
  assert.equal(sent[0].settingsUrl, 'https://swingmate.au/account.html#notifications');
  // Every pair is recorded, so no home is sent twice for the same alert.
  assert.deepEqual(store.calls.delivered.filter((p) => p.alert_id !== 'b1').map((p) => `${p.alert_id}:${p.listing_id}`).sort(), ['a1:h1', 'a1:h2', 'a2:h1', 'a2:h3']);
  assert.deepEqual(store.calls.log.map((l) => [l.user_id, l.template, l.status]), [['u1', 'NTF-007', 'sent'], ['u2', 'NTF-007', 'sent']]);
});

test('UC-053 no new home that fits, no email', async () => {
  const store = fakeStore([datedAlert], () => [row('poor', '0'.repeat(10))]);
  let called = false;
  const out = await runAlerts({ store, send: async () => { called = true; return { status: 'sent' }; }, appUrl: 'https://swingmate.au', now: NOW });
  assert.deepEqual(out, { sent: 0, failed: 0 });
  assert.equal(called, false);
});

test('UC-053 E1 a failed email is tried on the next run; after the third the homes are marked', async () => {
  const fail = async () => ({ status: 'failed', error: 'provider_down' });
  const once = fakeStore([datedAlert], () => [row('h1', '1'.repeat(10))], { failures: 1 });
  assert.deepEqual(await runAlerts({ store: once, send: fail, appUrl: 'https://swingmate.au', now: NOW }), { sent: 0, failed: 1 });
  assert.deepEqual(once.calls.delivered, [], 'tried again tomorrow');
  const third = fakeStore([datedAlert], () => [row('h1', '1'.repeat(10))], { failures: 3 });
  await runAlerts({ store: third, send: fail, appUrl: 'https://swingmate.au', now: NOW });
  assert.deepEqual(third.calls.delivered, [{ alert_id: 'a1', listing_id: 'h1' }]);
});
