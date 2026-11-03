import { test } from 'node:test';
import assert from 'node:assert/strict';


test('UC-002 weekdays and Mondays for the roster calendar', async () => {
  const { weekdayIndex, formatDayLong, mondayOf } = await import('../../core/dates.js');
  assert.equal(weekdayIndex('2026-11-09'), 0);
  assert.equal(weekdayIndex('2026-11-08'), 6);
  assert.equal(formatDayLong('2026-11-09'), 'Mon 9 Nov');
  assert.equal(mondayOf('2026-11-08'), '2026-11-02');
  assert.equal(mondayOf('2026-11-09'), '2026-11-09');
});
