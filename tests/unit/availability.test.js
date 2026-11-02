import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listingNights, isHostAway, validateAvailability } from '../../core/availability.js';
import { addDays, todayIn } from '../../core/dates.js';
import { cycleLength, phaseOf } from '../../core/roster.js';

const fixtures = JSON.parse(readFileSync(new URL('../fixtures/availability.json', import.meta.url), 'utf8'));

for (const c of fixtures.cases) {
  test(`BR-AVL-003 ${c.name}`, () => {
    assert.equal(listingNights(c.listing, c.start, c.n, c.today), c.expected);
  });
}

test('BR-AVL-003 "From my roster" matches the phase definition for every pattern and answer', () => {
  for (const [daysOn, daysOff] of [[14, 7], [8, 6], [7, 7], [14, 14], [21, 7], [1, 1], [42, 3]]) {
    for (const fliesHomeLastDay of [true, false]) {
      for (const fliesOutFirstDay of [true, false]) {
        const roster = { daysOn, daysOff, anchor: '2026-11-04', fliesHomeLastDay, fliesOutFirstDay };
        for (let i = -60; i < 120; i++) {
          const night = addDays('2026-11-04', i);
          const p = phaseOf(roster, night);
          const expected = p <= daysOn - 2
            || (p === daysOn - 1 && !fliesHomeLastDay)
            || (p === cycleLength(roster) - 1 && !fliesOutFirstDay);
          assert.equal(isHostAway(roster, night), expected, `${daysOn}:${daysOff} ${night}`);
        }
      }
    }
  }
});

test('BR-AVL-002 only two states, one character per night', () => {
  const s = listingNights({ availabilityType: 'from_date', availableFrom: '2026-11-10' }, '2026-11-01', 84, '2026-11-01');
  assert.equal(s.length, 84);
  assert.match(s, /^[01]+$/);
});

test('BR-AVL-005 today depends on the time zone of the place', () => {
  const instant = new Date('2026-11-02T15:30:00Z');
  assert.equal(todayIn('Australia/Perth', instant), '2026-11-02');
  assert.equal(todayIn('Australia/Sydney', instant), '2026-11-03');
});

test('BR-AVL-003 each rule needs its own fields', () => {
  assert.deepEqual(validateAvailability({ availabilityType: 'from_date', availableFrom: '2026-11-05' }), []);
  assert.deepEqual(validateAvailability({ availabilityType: 'from_date' }), ['availableFrom']);
  assert.deepEqual(validateAvailability({ availabilityType: 'ranges', ranges: [] }), ['ranges']);
  assert.deepEqual(validateAvailability({ availabilityType: 'ranges', ranges: [{ startNight: '2026-11-05', endExclusive: '2026-11-05' }] }), ['ranges']);
  assert.deepEqual(validateAvailability({ availabilityType: 'roster', roster: { daysOn: 14, daysOff: 7 } }), ['roster']);
  assert.deepEqual(validateAvailability({ availabilityType: 'weekly' }), ['availabilityType']);
  assert.deepEqual(validateAvailability({ availabilityType: 'from_date', availableFrom: '2026-11-05', exceptions: [{ night: '2026-11-06', available: 'yes' }] }), ['exceptions']);
});
