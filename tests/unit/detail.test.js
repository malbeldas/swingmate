import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DETAIL_WEEKS, detailFacts, detailView, priceLine, subtitle, unavailableNeededNights } from '../../core/detail.js';
import { needFor } from '../../core/fit.js';
import { addDays } from '../../core/dates.js';

const TODAY = '2026-11-03';
const listing = (over = {}) => ({
  id: 'l1', status: 'active', is_owner: false, title: 'Room by the river', suburb_name: 'Baldivis', state: 'WA',
  place_type: 'private_room', bathroom: 'own', weekly_price: 260, bills_included: true, bond: 520, furnished: true,
  min_stay_weeks: null, household_size: 3, household_on_roster: 2, host_lives_onsite: false, airport_minutes: 35,
  couples_ok: true, pets_ok: false, smoking: 'outside', parking: 'off_street', features: [], perks: [], custom_items: ['Bike rack'],
  calendar_confirmed_on: '2026-10-30', today: TODAY, start: TODAY, nights: '1'.repeat(84),
  host: { display_name: 'Gus', phone_verified: true, created_at: '2025-03-01T00:00:00Z', roster_pattern: { days_on: 8, days_off: 6 } },
  ...over,
});

test('AC-003-3 the nights missing in the reasons are exactly the Unavailable nights marked in the calendar', () => {
  const need = needFor({ checkIn: '2026-11-10', checkOut: '2026-11-24' }, TODAY);
  const taken = new Set(['2026-11-12', '2026-11-20']);
  const nights = Array.from({ length: 84 }, (_, i) => (taken.has(addDays(TODAY, i)) ? '0' : '1')).join('');
  const view = detailView(listing({ nights }), need);
  assert.equal(view.weeks.length, DETAIL_WEEKS);
  assert.deepEqual(unavailableNeededNights(view.weeks), view.fit.missing);
  assert.deepEqual(view.fit.missing, ['2026-11-12', '2026-11-20']);
  assert.match(view.reasons.map((r) => r.text).join(' '), /12 Nov.*20 Nov/);
});

test('AC-003-4 a paused listing shows its label and no message box; the owner gets Edit listing', () => {
  const need = needFor({}, TODAY);
  const paused = detailView(listing({ status: 'paused' }), need);
  assert.equal(paused.label, 'This listing is paused');
  assert.equal(paused.messageBox, false);
  const active = detailView(listing(), need);
  assert.equal(active.messageBox, true);
  assert.equal(active.label, null);
  const own = detailView(listing({ is_owner: true }), need);
  assert.equal(own.messageBox, false);
  assert.equal(own.editButton, true);
});

test('AC-003-5 the detail says how fresh the calendar is', () => {
  assert.equal(detailView(listing(), needFor({}, TODAY)).calendarText, 'Calendar updated 4 days ago');
  assert.equal(detailView(listing({ calendar_confirmed_on: TODAY }), needFor({}, TODAY)).calendarText, 'Calendar updated today');
});

test('BR-FIT-006 without dates or roster there is no fit, only the prompt', () => {
  const view = detailView(listing(), needFor({}, TODAY));
  assert.equal(view.fitLabel, null);
  assert.deepEqual(view.reasons, []);
  assert.equal(view.noFitText, 'Add your dates or roster to see the fit');
});

test('BR-TRU-002 the host block: phone verified, member since and the roster pattern', () => {
  const view = detailView(listing(), needFor({}, TODAY));
  assert.deepEqual(view.host, { name: 'Gus', lines: ['Phone verified host', 'Member since Mar 2025', '8:6 roster'] });
  const onsite = detailView(listing({ host_lives_onsite: true }), needFor({}, TODAY));
  assert.deepEqual(onsite.host.lines.slice(-1), ['Lives here']);
});

test('UC-003 price, subtitle and the facts the host filled in', () => {
  assert.equal(priceLine(listing()), 'per week · bills included · bond $520');
  assert.equal(priceLine(listing({ bills_included: false })), 'per week · bills not included · bond $520');
  assert.equal(subtitle(listing()), 'Baldivis, WA · Private room · Own bathroom');
  const facts = Object.fromEntries(detailFacts(listing()).map((f) => [f.label, f.value]));
  assert.equal(facts.Household, '3 people live here, 2 on a roster');
  assert.equal(facts['Minimum stay'], 'No minimum');
  assert.equal(facts.Smoking, 'Outside only');
  assert.equal(facts.Parking, 'Off-street parking');
  assert.equal(facts.Airport, '35 min drive');
  assert.equal('Pets' in facts, true);
  const sparse = detailFacts(listing({ couples_ok: null, pets_ok: null, smoking: null, parking: null, household_size: null, airport_minutes: null }));
  assert.deepEqual(sparse.map((f) => f.label), ['Place', 'Bathroom', 'Bills', 'Bond', 'Furnished', 'Minimum stay', 'Host']);
});
