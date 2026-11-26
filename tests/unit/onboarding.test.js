import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canContinue, monthTitle, monthWeeks, needText, oppositeSwingDemo, paintMonth, patternPreview, patternText, shiftMonth } from '../../core/onboarding.js';
import { makeRoster } from '../../core/roster.js';

test('AC-002-6 the step 1 preview shows one cycle: days on site, the travel night and home', () => {
  assert.deepEqual(patternPreview({ daysOn: 8, daysOff: 6 }), [...Array(7).fill('away'), 'travel', ...Array(6).fill('home')]);
  assert.deepEqual(patternPreview({ daysOn: 8, daysOff: 6, fliesHomeLastDay: false }), [...Array(8).fill('away'), ...Array(6).fill('home')]);
  assert.equal(patternText(8, 6), '8 days on site, 6 at home. You need a bed 7 nights in every 14.');
  assert.equal(patternText(14, 7, true, false), '14 days on site, 7 at home. You need a bed 7 nights in every 21.');
});

test('AC-002-6 the calendar of a month starts on Monday and pads with blanks', () => {
  const weeks = monthWeeks('2026-12-01'); // 1 Dec 2026 is a Tuesday
  assert.equal(weeks.length, 5);
  assert.deepEqual(weeks[0].slice(0, 2), [null, '2026-12-01']);
  assert.equal(weeks[4].filter(Boolean).at(-1), '2026-12-31');
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(monthTitle('2026-12-01'), 'December 2026');
  assert.equal(shiftMonth('2026-12-01', 1), '2027-01-01');
  assert.equal(shiftMonth('2027-01-01', -1), '2026-12-01');
});

test('AC-002-6 picking the next swing paints the month with the roster from today on (BR-ROS-003)', () => {
  const roster = makeRoster({ daysOn: 8, daysOff: 6, anchor: '2026-12-04' });
  const cells = paintMonth(monthWeeks('2026-12-01'), roster, '2026-11-26').flat().filter(Boolean);
  const kind = (d) => cells.find((c) => c.date === d).kind;
  assert.equal(kind('2026-12-04'), 'away');
  assert.equal(kind('2026-12-11'), 'travel');
  assert.equal(kind('2026-12-12'), 'home');
  assert.equal(kind('2026-12-18'), 'away');
  // Before today stays plain, and with no roster nothing is painted.
  const past = paintMonth(monthWeeks('2026-12-01'), roster, '2026-12-10').flat().filter(Boolean);
  assert.equal(past.find((c) => c.date === '2026-12-09').kind, null);
  assert.ok(paintMonth(monthWeeks('2026-12-01'), null, '2026-11-26').flat().filter(Boolean).every((c) => c.kind === null));
});

test('AC-002-6 the summary lists the nights that need a bed in the next four weeks', () => {
  const roster = makeRoster({ daysOn: 8, daysOff: 6, anchor: '2026-12-04' });
  assert.equal(needText(roster, '2026-12-04', 28), 'You need a bed 11 – 17 Dec and 25 – 31 Dec.');
  assert.equal(needText(roster, '2026-12-04', 14), 'You need a bed 11 – 17 Dec.');
  assert.equal(needText(roster, '2026-12-04', 7), '');
});

test('AC-002-6 each step asks for what it needs before Continue', () => {
  const today = '2026-11-26';
  assert.equal(canContinue('roster', {}, today), false);
  assert.equal(canContinue('roster', { pattern: '8:6', daysOn: 8, daysOff: 6 }, today), true);
  assert.equal(canContinue('roster', { pattern: 'other', daysOn: 43, daysOff: 6 }, today), false);
  assert.equal(canContinue('start', { anchor: '2026-11-25' }, today), false);
  assert.equal(canContinue('start', { anchor: '2026-12-04' }, today), true);
  assert.equal(canContinue('place', { placeId: null }, today), false);
  assert.equal(canContinue('place', { placeId: 51230 }, today), true);
});

test('UC-001 the home picture puts the seeker in the room exactly while the host is on site', () => {
  const demo = oppositeSwingDemo('2026-12-08', 28);
  assert.equal(demo.length, 28);
  assert.equal(demo[0].day, 8);
  assert.ok(demo.every((d) => (d.host === 'away') === (d.you === 'home')));
  assert.ok(demo.every((d) => (d.room === 'yours') === (d.host === 'away')));
  assert.equal(demo.filter((d) => d.room === 'yours').length, 14);
  assert.deepEqual(demo.slice(0, 4).map((d) => d.host), ['away', 'away', 'away', 'home']);
});
