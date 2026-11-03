import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  cardTexts, cardWeeks, chosenRadius, defaultFilters, formatKm, radiusOptions, readSearchParams,
  resultsHeading, resultsView, searchIssues, searchParamsFor, searchStart, widerRadius, withFit,
} from '../../core/search.js';
import { needFor } from '../../core/fit.js';

const proto = JSON.parse(readFileSync(new URL('../fixtures/fit.json', import.meta.url), 'utf8'));
const TODAY = '2026-11-03';

const row = (id, over = {}) => ({
  id, title: `Home ${id}`, suburb_name: 'Baldivis', state: 'WA', place_type: 'private_room',
  bathroom: 'own', weekly_price: 250, distance_km: 3.2, published_at: '2026-11-01T00:00:00Z',
  nights: '1'.repeat(84), ...over,
});

test('BR-SRC-001 the URL carries place, radius and both dates, never the roster', () => {
  const qs = searchParamsFor({ placeId: 90002, radiusKm: 15, checkIn: '2026-11-10', checkOut: '2026-11-17', roster: { daysOn: 14 } });
  assert.equal(qs, 'place=90002&radius=15&in=2026-11-10&out=2026-11-17');
  assert.deepEqual(readSearchParams(new URLSearchParams(qs)), { placeId: 90002, radiusKm: 15, checkIn: '2026-11-10', checkOut: '2026-11-17' });
  assert.equal(searchParamsFor({ placeId: 1, radiusKm: 15, checkIn: '2026-11-10', checkOut: null }), 'place=1&radius=15');
  assert.deepEqual(readSearchParams(new URLSearchParams('place=x&in=13-11-2026')), { placeId: null, radiusKm: null, checkIn: null, checkOut: null });
});

test('BR-SRC-003 15 km around a suburb, 40 km around a city, and 5, 15, 25 or 50 to choose', () => {
  assert.deepEqual(radiusOptions({ isCity: false }), [5, 15, 25, 50]);
  assert.deepEqual(radiusOptions({ isCity: true }), [5, 15, 25, 40, 50]);
  assert.equal(chosenRadius(null, { isCity: false }), 15);
  assert.equal(chosenRadius(null, { isCity: true }), 40);
  assert.equal(chosenRadius(25, { isCity: true }), 25);
  assert.equal(chosenRadius(33, { isCity: false }), 15);
  assert.equal(widerRadius(15, { isCity: false }), 25);
  assert.equal(widerRadius(50, { isCity: true }), null);
});

test('UC-001 E1/E2 a place is required and dates follow BR-SRC-002', () => {
  assert.deepEqual(searchIssues({ placeId: null }, TODAY), ['place']);
  assert.deepEqual(searchIssues({ placeId: 1 }, TODAY), []);
  assert.deepEqual(searchIssues({ placeId: 1, checkIn: '2026-11-01', checkOut: '2026-11-05' }, TODAY), ['checkIn']);
  assert.deepEqual(searchIssues({ placeId: 1, checkIn: '2026-11-10', checkOut: null }, TODAY), ['checkOut']);
});

test('AC-001-1 with dates and a roster the fit uses the nights from check-in to the night before check-out', () => {
  const stay = proto.byDates[0];
  const dates = { checkIn: stay.checkIn, checkOut: stay.checkOut };
  const need = needFor({ ...dates, roster: proto.roster }, proto.today);
  const start = searchStart(dates, proto.today);
  assert.equal(start, stay.checkIn);
  // search_listings returns nights from the check-in; the fixture strings start at proto.start.
  const offset = (new Date(start) - new Date(proto.start)) / 86400000;
  for (const l of proto.listings) {
    const item = withFit(row(l.id, { nights: l.availability.slice(offset) }), need, start);
    assert.equal(item.fitClass, stay.expected[l.id], l.id);
  }
  assert.equal(need.nights[0], stay.checkIn);
  assert.equal(need.nights.at(-1) < stay.checkOut, true);
});

test('AC-001-3 only Full and Strong by default, Partial with near matches, Poor never', () => {
  const items = [
    { ...row('a'), fitClass: 'full' }, { ...row('b'), fitClass: 'strong' },
    { ...row('c'), fitClass: 'partial' }, { ...row('d'), fitClass: 'poor' },
  ];
  const view = resultsView(items, defaultFilters());
  assert.deepEqual(view.shown.map((i) => i.id), ['a', 'b']);
  assert.equal(view.nearHidden, 1);
  const near = resultsView(items, { ...defaultFilters(), near: true });
  assert.deepEqual(near.shown.map((i) => i.id), ['a', 'b', 'c']);
  assert.equal(near.nearHidden, 0);
});

test('AC-001-4 order is fit class, then weekly price ascending', () => {
  const items = [
    { ...row('s1', { weekly_price: 200 }), fitClass: 'strong' },
    { ...row('f2', { weekly_price: 300 }), fitClass: 'full' },
    { ...row('f1', { weekly_price: 220 }), fitClass: 'full' },
  ].map((i) => ({ ...i, priceWeekly: i.weekly_price }));
  assert.deepEqual(resultsView(items, defaultFilters()).shown.map((i) => i.id), ['f1', 'f2', 's1']);
});

test('BR-FIT-006 without dates or roster every home shows, with no fit filter', () => {
  const items = [row('a'), row('b', { place_type: 'entire_place' })].map((r) => withFit(r, { nights: [], byDates: false }, TODAY));
  const view = resultsView(items, defaultFilters());
  assert.equal(view.hasFit, false);
  assert.equal(view.shown.length, 2);
  assert.equal(cardTexts(view.shown[0], { byDates: false }).fitLabel, null);
  assert.equal(cardTexts(view.shown[0], { byDates: false }).line, 'Add your dates or roster to see the fit');
});

test('AC-001-6 filters that leave nothing give the empty state with Clear filters', () => {
  const items = [row('a', { weekly_price: 450 }), row('b', { weekly_price: 500, place_type: 'entire_place' })]
    .map((r) => withFit(r, { nights: [], byDates: false }, TODAY));
  const view = resultsView(items, { ...defaultFilters(), maxPrice: 400 });
  assert.equal(view.state, 'filtered-empty');
  assert.equal(resultsView(items, { ...defaultFilters(), placeTypes: ['entire_place'] }).shown.length, 1);
});

test('AC-001-7 no homes in the radius gives the none state and nothing to show', () => {
  const view = resultsView([], defaultFilters());
  assert.equal(view.state, 'none');
  assert.deepEqual(view.shown, []);
});

test('BR-SRC-005 homes that exist but none Full or Strong give the no-fit state', () => {
  const items = [{ ...row('c'), fitClass: 'partial' }, { ...row('d'), fitClass: 'poor' }];
  const view = resultsView(items, defaultFilters());
  assert.equal(view.state, 'no-fit');
  assert.equal(view.nearHidden, 1);
});

test('AC-001-8 the card has 4 weeks with a date on each and marks the nights you need', () => {
  const need = { nights: ['2026-11-03', '2026-11-04'], byDates: true };
  const weeks = cardWeeks(row('a', { nights: '01' + '1'.repeat(82) }), need, '2026-11-03');
  assert.equal(weeks.length, 4);
  assert.deepEqual(weeks.map((w) => w.label), ['3 Nov', '10 Nov', '17 Nov', '24 Nov']);
  assert.equal(weeks[0].cells.length, 7);
  assert.deepEqual(weeks[0].cells[0], { night: '2026-11-03', free: false, need: true, title: '3 Nov: Unavailable, a night you need' });
  assert.equal(weeks[0].cells[2].title, '5 Nov: Available');
});

test('card texts: type, price, place and distance', () => {
  const need = needFor({ roster: proto.roster }, proto.today);
  const item = withFit(row('a'), need, proto.today);
  const t = cardTexts(item, need);
  assert.equal(t.type, 'Private room');
  assert.equal(t.price, '$250');
  assert.equal(t.where, 'Baldivis, WA · 3 km away');
  assert.equal(t.fitLabel, 'Great roster fit');
  assert.equal(formatKm(0.4), 'under 1 km away');
  assert.equal(resultsHeading(1, 'Baldivis, WA'), '1 home near Baldivis, WA');
  assert.equal(resultsHeading(3, 'Perth, WA'), '3 homes near Perth, WA');
});
