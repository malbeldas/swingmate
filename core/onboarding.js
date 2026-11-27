// "Find my match" step by step (UC-002 A0 and UC-001, DEC-016): roster, next swing, place.
// Pure: the page draws what these return. Nights and kinds come from roster.js (BR-ROS-003).
import { addDays, formatRange, isIsoDate, weekdayIndex } from './dates.js';
import { cycleLength, makeRoster, neededBlocks, nightKind } from './roster.js';

export const FIND_STEPS = ['roster', 'start', 'place'];

// One cycle of the pattern, for the live preview on step 1: 'away' | 'travel' | 'home' per day.
// The anchor is any date; only the shape matters before the person picks their next swing.
export function patternPreview({ daysOn, daysOff, fliesHomeLastDay = true, fliesOutFirstDay = true }) {
  const roster = makeRoster({ daysOn, daysOff, anchor: '2026-01-05', fliesHomeLastDay, fliesOutFirstDay });
  return Array.from({ length: cycleLength(roster) }, (_, i) => nightKind(roster, addDays(roster.anchor, i)));
}

// "8 days on site, 6 at home. You need a bed 7 nights in every 14." (the travel night counts).
export function patternText(daysOn, daysOff, fliesHomeLastDay = true, fliesOutFirstDay = true) {
  const kinds = patternPreview({ daysOn, daysOff, fliesHomeLastDay, fliesOutFirstDay });
  const needed = kinds.filter((k) => k !== 'away').length;
  const cycle = daysOn + daysOff;
  return `${daysOn} ${daysOn === 1 ? 'day' : 'days'} on site, ${daysOff} at home. You need a bed ${needed} ${needed === 1 ? 'night' : 'nights'} in every ${cycle}.`;
}

// The first of the month of a date, and the month before or after it.
export function monthOf(iso) {
  if (!isIsoDate(iso)) throw new RangeError(`Not a date: ${iso}`);
  return `${iso.slice(0, 7)}-01`;
}

export function shiftMonth(monthStart, delta) {
  const [y, m] = monthStart.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthTitle(monthStart) {
  const [y, m] = monthStart.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

// The month as weeks of 7 slots, Monday first; slots outside the month are null.
export function monthWeeks(monthStart) {
  const first = monthOf(monthStart);
  const days = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) days.push(d);
  const slots = [...Array(weekdayIndex(first)).fill(null), ...days];
  while (slots.length % 7) slots.push(null);
  return Array.from({ length: slots.length / 7 }, (_, w) => slots.slice(w * 7, w * 7 + 7));
}

// The kind of each day of the month once the next swing is picked; null before it or for blanks.
// Days before `from` (today) stay plain: the past doesn't matter to a search.
export function paintMonth(weeks, roster, from) {
  return weeks.map((week) => week.map((date) => {
    if (!date) return null;
    if (!roster || date < from) return { date, kind: null };
    return { date, kind: nightKind(roster, date) };
  }));
}

// "You need a bed 11 – 17 Dec and 25 – 31 Dec." over the next `days` days from `from`.
export function needText(roster, from, days = 28) {
  const blocks = neededBlocks(roster, from, days).map(([a, b]) => formatRange(a, b));
  if (!blocks.length) return '';
  const list = blocks.length === 1 ? blocks[0] : `${blocks.slice(0, -1).join(', ')} and ${blocks.at(-1)}`;
  return `You need a bed ${list}.`;
}

// Which step comes next, and whether the person can move on from the one they're on.
export function canContinue(step, { pattern, daysOn, daysOff, anchor, placeId } = {}, today) {
  if (step === 'roster') return Boolean(pattern) && Number.isInteger(daysOn) && Number.isInteger(daysOff) && daysOn >= 1 && daysOn <= 42 && daysOff >= 1 && daysOff <= 42;
  if (step === 'start') return isIsoDate(anchor) && anchor >= today;
  if (step === 'place') return Boolean(placeId);
  return false;
}

// The home's "different swings, same home" picture (UC-001, DEC-016): a host and a seeker on
// opposite 7:7 swings over `days` days from `from`, and which nights the room is the seeker's.
// It is an explainer, not a listing (BR-TRU-006): no names, no prices, no photos.
export function oppositeSwingDemo(from, days = 28) {
  const host = makeRoster({ daysOn: 7, daysOff: 7, anchor: addDays(from, -4), fliesHomeLastDay: false, fliesOutFirstDay: true });
  const you = makeRoster({ daysOn: 7, daysOff: 7, anchor: addDays(from, 3), fliesHomeLastDay: false, fliesOutFirstDay: true });
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const hostKind = nightKind(host, date);
    const youKind = nightKind(you, date);
    return { date, day: Number(date.slice(8, 10)), host: hostKind, you: youKind, room: hostKind === 'away' && youKind !== 'away' ? 'yours' : 'host' };
  });
}
