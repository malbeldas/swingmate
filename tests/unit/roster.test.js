import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addDays, daysBetween, isIsoDate } from '../../core/dates.js';
import { makeRoster, validateRoster, neededNights, neededBlocks, nightKind, ROSTER_PATTERNS, rosterToRow, rosterFromRow, parseStoredRoster, rosterWithArticle } from '../../core/roster.js';

const fixtures = JSON.parse(readFileSync(new URL('../fixtures/roster.json', import.meta.url), 'utf8'));

for (const c of fixtures.cases) {
  test(`BR-ROS-003 ${c.name}`, () => {
    assert.deepEqual(neededNights(c.roster, c.from, c.count), c.needed);
  });
}

test('BR-ROS-003 a 14:7 with defaults needs 8 nights in every cycle over 84 nights', () => {
  const roster = makeRoster({ daysOn: 14, daysOff: 7, anchor: '2026-12-06' });
  assert.equal(neededNights(roster, '2026-12-06', 84).length, 32);
  assert.deepEqual(neededBlocks(roster, '2026-12-06', 21), [['2026-12-19', '2026-12-26']]);
});

test('AC-002-1 the last swing day is a travel night when the person flies home that day', () => {
  const roster = makeRoster({ daysOn: 14, daysOff: 7, anchor: '2026-10-19' });
  assert.equal(nightKind(roster, '2026-11-01'), 'travel');
  assert.equal(nightKind(roster, '2026-11-02'), 'home');
  assert.equal(nightKind(roster, '2026-10-31'), 'away');
  assert.equal(nightKind({ ...roster, fliesHomeLastDay: false }, '2026-11-01'), 'away');
});

test('BR-ROS-002 offered patterns and the 1 to 42 day limit', () => {
  assert.deepEqual(ROSTER_PATTERNS.map((p) => p.label), ['14:7', '8:6', '7:7', '14:14', '21:7']);
  assert.deepEqual(validateRoster(makeRoster({ daysOn: 42, daysOff: 1, anchor: '2026-11-01' })), []);
  assert.deepEqual(validateRoster(makeRoster({ daysOn: 43, daysOff: 0, anchor: '2026-11-31' })), ['daysOn', 'daysOff', 'anchor']);
});

test('dates: whole UTC days, leap years and invalid dates', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.throws(() => addDays('29/10/2026', 1), RangeError);
});

test('AC-002-4 a visitor roster is read back from the browser session, or ignored if broken', () => {
  const roster = makeRoster({ daysOn: 8, daysOff: 6, anchor: '2026-11-09', fliesHomeLastDay: false, fliesOutFirstDay: true });
  assert.deepEqual(parseStoredRoster(JSON.stringify(roster)), roster);
  assert.equal(parseStoredRoster('not json'), null);
  assert.equal(parseStoredRoster(JSON.stringify({ daysOn: 0, daysOff: 6, anchor: '2026-11-09' })), null);
  assert.equal(parseStoredRoster('null'), null);
});

test('schema.md rosters the roster maps to its row and back', () => {
  const roster = makeRoster({ daysOn: 14, daysOff: 7, anchor: '2026-11-02', fliesHomeLastDay: true, fliesOutFirstDay: false });
  const row = rosterToRow(roster);
  assert.deepEqual(row, { days_on: 14, days_off: 7, anchor_date: '2026-11-02', fly_home_last_day: true, fly_out_first_day: false });
  assert.deepEqual(rosterFromRow(row), roster);
  assert.equal(rosterFromRow(null), null);
});

test('AC-002-4 the roster reads naturally in a sentence', () => {
  assert.equal(rosterWithArticle({ daysOn: 14, daysOff: 7 }), 'a 14:7 roster');
  assert.equal(rosterWithArticle({ daysOn: 8, daysOff: 6 }), 'an 8:6 roster');
  assert.equal(rosterWithArticle({ daysOn: 11, daysOff: 3 }), 'an 11:3 roster');
  assert.equal(rosterWithArticle({ daysOn: 18, daysOff: 10 }), 'an 18:10 roster');
  assert.equal(rosterWithArticle({ daysOn: 21, daysOff: 7 }), 'a 21:7 roster');
});
