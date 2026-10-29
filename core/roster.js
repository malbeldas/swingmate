import { addDays, daysBetween, isIsoDate, mod } from './dates.js';

// BR-ROS-002
export const ROSTER_PATTERNS = [
  { label: '14:7', daysOn: 14, daysOff: 7 },
  { label: '8:6', daysOn: 8, daysOff: 6 },
  { label: '7:7', daysOn: 7, daysOff: 7 },
  { label: '14:14', daysOn: 14, daysOff: 14 },
  { label: '21:7', daysOn: 21, daysOff: 7 },
];

export const MIN_DAYS = 1;
export const MAX_DAYS = 42;

// BR-ROS-001: five fields; the label is display only.
export function makeRoster({ daysOn, daysOff, anchor, fliesHomeLastDay = true, fliesOutFirstDay = true }) {
  return { daysOn, daysOff, anchor, fliesHomeLastDay, fliesOutFirstDay };
}

export function validateRoster(roster) {
  const errors = [];
  for (const key of ['daysOn', 'daysOff']) {
    const v = roster?.[key];
    if (!Number.isInteger(v) || v < MIN_DAYS || v > MAX_DAYS) errors.push(key);
  }
  if (!isIsoDate(roster?.anchor)) errors.push('anchor');
  for (const key of ['fliesHomeLastDay', 'fliesOutFirstDay']) {
    if (typeof roster?.[key] !== 'boolean') errors.push(key);
  }
  return errors;
}

export function rosterLabel(roster) {
  return `${roster.daysOn}:${roster.daysOff}`;
}

export function cycleLength(roster) {
  return roster.daysOn + roster.daysOff;
}

// Phase 0 is the first day on site; phases >= daysOn are R&R.
export function phaseOf(roster, night) {
  return mod(daysBetween(roster.anchor, night), cycleLength(roster));
}

// BR-ROS-003
export function isNightNeeded(roster, night) {
  const cycle = cycleLength(roster);
  const phase = phaseOf(roster, night);
  if (phase === cycle - 1 && !roster.fliesOutFirstDay) return false;
  if (phase >= roster.daysOn) return true;
  return roster.fliesHomeLastDay && phase === roster.daysOn - 1;
}

// 'away' | 'travel' | 'home' for the "My roster" view (AC-002-1).
export function nightKind(roster, night) {
  const phase = phaseOf(roster, night);
  if (phase === roster.daysOn - 1 && roster.fliesHomeLastDay) return 'travel';
  return isNightNeeded(roster, night) ? 'home' : 'away';
}

export function neededNights(roster, from, count) {
  const nights = [];
  for (let i = 0; i < count; i++) {
    const night = addDays(from, i);
    if (isNightNeeded(roster, night)) nights.push(night);
  }
  return nights;
}

// Consecutive needed nights grouped as [first, last] ranges.
export function neededBlocks(roster, from, count) {
  const blocks = [];
  let start = null;
  let prev = null;
  for (let i = 0; i < count; i++) {
    const night = addDays(from, i);
    if (isNightNeeded(roster, night)) {
      if (start === null) start = night;
      prev = night;
    } else if (start !== null) {
      blocks.push([start, prev]);
      start = null;
    }
  }
  if (start !== null) blocks.push([start, prev]);
  return blocks;
}
