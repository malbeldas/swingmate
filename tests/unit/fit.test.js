import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  cardLine, classify, computeFit, fitLabel, fitReasons, needFor, nightsFromDates,
  NO_FIT_TEXT, sortResults, validateStay, visibleResults,
} from '../../core/fit.js';
import { addDays } from '../../core/dates.js';

const proto = JSON.parse(readFileSync(new URL('../fixtures/fit.json', import.meta.url), 'utf8'));

// Builds an availability string from `start` where the listed nights are '0'.
function allFreeExcept(start, n, taken) {
  return Array.from({ length: n }, (_, i) => (taken.includes(addDays(start, i)) ? '0' : '1')).join('');
}

test('BR-FIT-001 prototype regression by roster: Baldivis and Scarborough full, Wellard strong, Success and Rockingham partial, Mandurah poor', () => {
  const need = needFor({ roster: proto.roster }, proto.today);
  assert.equal(need.byDates, false);
  for (const l of proto.listings) {
    assert.equal(computeFit(need.nights, l.availability, proto.start).fitClass, proto.byRoster[l.id], l.id);
  }
});

for (const stay of proto.byDates) {
  test(`BR-FIT-001 prototype regression by dates ${stay.checkIn} to ${stay.checkOut}`, () => {
    const need = needFor({ checkIn: stay.checkIn, checkOut: stay.checkOut, roster: proto.roster }, proto.today);
    assert.equal(need.byDates, true, 'dates win over the roster (BR-SRC-001)');
    for (const l of proto.listings) {
      assert.equal(computeFit(need.nights, l.availability, proto.start).fitClass, stay.expected[l.id], l.id);
    }
  });
}

test('AC-001-2 a 14:7 with defaults needs 8 nights per cycle, 32 over the 84-night horizon', () => {
  const need = needFor({ roster: { daysOn: 14, daysOff: 7, anchor: '2026-12-06', fliesHomeLastDay: true, fliesOutFirstDay: true } }, '2026-12-06');
  assert.equal(need.nights.length, 32);
});

test('BR-FIT-001 thresholds are exact: 90% strong, 60% partial, below 60% poor', () => {
  assert.equal(classify(10, 10, 0), 'full');
  assert.equal(classify(10, 9, 1), 'strong');
  assert.equal(classify(10, 9, 2), 'partial');
  assert.equal(classify(20, 17, 1), 'partial');
  assert.equal(classify(10, 6, 2), 'partial');
  assert.equal(classify(5, 2, 3), 'poor');
});

test('BR-FIT-001 strong allows at most 1 missing night in each block, even above 90%', () => {
  const start = '2026-11-01';
  const nights = Array.from({ length: 20 }, (_, i) => addDays(start, i));
  const twoInOneBlock = computeFit(nights, allFreeExcept(start, 84, ['2026-11-03', '2026-11-04']), start);
  assert.equal(twoInOneBlock.fitClass, 'partial');
  assert.equal(twoInOneBlock.worstBlockMissing, 2);
  const split = [...nights.slice(0, 10), ...nights.slice(10).map((n) => addDays(n, 3))];
  const oneInEachBlock = computeFit(split, allFreeExcept(start, 84, ['2026-11-03', '2026-11-17']), start);
  assert.equal(oneInEachBlock.fitClass, 'strong');
  assert.deepEqual(oneInEachBlock.missing, ['2026-11-03', '2026-11-17']);
});

test('BR-AVL-004 nights outside the availability string count as not free', () => {
  const fit = computeFit(['2026-10-31', '2026-11-01'], '1111', '2026-11-01');
  assert.deepEqual(fit.missing, ['2026-10-31']);
});

test('BR-SRC-001 nights run from check-in to the night before check-out; BR-SRC-002 caps at 84', () => {
  assert.deepEqual(nightsFromDates('2026-11-01', '2026-11-04').nights, ['2026-11-01', '2026-11-02', '2026-11-03']);
  const long = nightsFromDates('2026-11-01', '2027-03-01');
  assert.equal(long.nights.length, 84);
  assert.equal(long.capped, true);
  assert.equal(long.totalNights, 120);
});

test('BR-SRC-002 check-in from today to 12 months ahead, check-out after check-in', () => {
  assert.deepEqual(validateStay('2026-11-02', '2026-11-09', '2026-11-02'), []);
  assert.deepEqual(validateStay('2026-11-01', '2026-11-09', '2026-11-02'), ['checkIn']);
  assert.deepEqual(validateStay('2027-11-02', '2027-11-09', '2026-11-02'), []);
  assert.deepEqual(validateStay('2027-11-03', '2027-11-09', '2026-11-02'), ['checkIn']);
  assert.deepEqual(validateStay('2026-11-09', '2026-11-09', '2026-11-02'), ['checkOut']);
  assert.deepEqual(validateStay('2028-02-28', '2028-03-02', '2027-02-28'), []);
  assert.deepEqual(validateStay('9/11/2026', '2026-11-09', '2026-11-02'), ['checkIn']);
});

test('BR-FIT-006 without dates or roster there is no fit, no label and the prompt to add them', () => {
  const need = needFor({}, '2026-11-02');
  assert.deepEqual(need.nights, []);
  const fit = computeFit(need.nights, '1'.repeat(84), '2026-11-02');
  assert.equal(fit.fitClass, null);
  assert.equal(fitLabel(fit.fitClass, false), null);
  assert.equal(cardLine(fit, { byDates: false }), NO_FIT_TEXT);
  assert.equal(NO_FIT_TEXT, 'Add your dates or roster to see the fit');
});

test('BR-FIT-002 labels: roster or date fit, no label for poor', () => {
  assert.equal(fitLabel('full', false), 'Great roster fit');
  assert.equal(fitLabel('strong', true), 'Good date fit');
  assert.equal(fitLabel('partial', false), 'Partial fit');
  assert.equal(fitLabel('poor', true), null);
});

const items = [
  { id: 'a', fitClass: 'partial', priceWeekly: 200, publishedAt: '2026-11-01T10:00:00Z' },
  { id: 'b', fitClass: 'full', priceWeekly: 400, publishedAt: '2026-11-01T10:00:00Z' },
  { id: 'c', fitClass: 'poor', priceWeekly: 100, publishedAt: '2026-11-01T10:00:00Z' },
  { id: 'd', fitClass: 'strong', priceWeekly: 300, publishedAt: '2026-11-01T10:00:00Z' },
  { id: 'e', fitClass: 'full', priceWeekly: 300, publishedAt: '2026-10-20T10:00:00Z' },
  { id: 'f', fitClass: 'full', priceWeekly: 300, publishedAt: '2026-10-25T10:00:00Z' },
];

test('AC-001-3 the list shows full and strong; partial behind "Show near matches"; poor never, only counted', () => {
  const byDefault = visibleResults(items);
  assert.deepEqual(byDefault.shown.map((i) => i.id).sort(), ['b', 'd', 'e', 'f']);
  assert.equal(byDefault.nearCount, 1);
  assert.equal(byDefault.poorCount, 1);
  assert.deepEqual(visibleResults(items, { showNear: true }).shown.map((i) => i.id).sort(), ['a', 'b', 'd', 'e', 'f']);
});

test('AC-001-4 order is fit class, then price ascending, then newest first', () => {
  assert.deepEqual(sortResults(items).map((i) => i.id), ['f', 'e', 'b', 'd', 'a', 'c']);
});

test('BR-FIT-004 without nights to judge, newest first and nothing is hidden', () => {
  const noFit = items.map((i) => ({ ...i, fitClass: null }));
  assert.equal(visibleResults(noFit).shown.length, items.length);
  assert.deepEqual(sortResults(noFit).slice(0, 4).map((i) => i.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(sortResults(noFit).slice(4).map((i) => i.id), ['f', 'e']);
});

test('BR-FIT-005 card line and detail reasons come from the same calculation', () => {
  const start = '2026-11-01';
  const nights = Array.from({ length: 10 }, (_, i) => addDays(start, i));
  const full = computeFit(nights, '1'.repeat(84), start);
  assert.equal(cardLine(full, { byDates: false }), 'Free for all 10 nights you need in the next 12 weeks');
  assert.equal(cardLine(full, { byDates: true }), 'Free for all 10 nights you need');
  assert.deepEqual(fitReasons(full, { byDates: true, priceWeekly: 320, budget: 300 }), [
    { tone: 'good', text: 'Free every night of your stay, 1 – 11 Nov (10 nights)' },
    { tone: 'warn', text: '$20 above your $300 weekly budget' },
  ]);

  const strong = computeFit(nights, allFreeExcept(start, 84, ['2026-11-01']), start);
  assert.equal(cardLine(strong, { byDates: true }), 'Free for 9 of 10 nights you need. Not free the night of 1 Nov');
  const reasons = fitReasons(strong, { byDates: true, priceWeekly: 280, budget: 300 });
  assert.equal(reasons[1].text, 'Not free the night of 1 Nov');
  assert.equal(reasons[2].text, 'Within your $300 weekly budget');

  const partial = computeFit(nights, allFreeExcept(start, 84, ['2026-11-01', '2026-11-02', '2026-11-05']), start);
  assert.equal(cardLine(partial, { byDates: true }), '3 of the 10 nights you need are not free');
  assert.equal(fitReasons(partial, { byDates: true }).at(0).text, 'Partial fit: 3 of the 10 nights you need are not free (1 – 2 Nov, 5 Nov)');
  assert.ok(!/%/.test(JSON.stringify(fitReasons(partial, { byDates: true }))), 'no percentage (BR-FIT-002)');
});
