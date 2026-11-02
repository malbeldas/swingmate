import { addDays, isIsoDate } from './dates.js';
import { isNightNeeded, validateRoster } from './roster.js';

// JS twin of the SQL function listing_nights (schema.md §10). Both must give the same string for
// every case in tests/fixtures/availability.json.

export const AVAILABILITY_TYPES = ['roster', 'from_date', 'ranges'];

// BR-AVL-003 "From my roster": free on the nights the host is on site. That is phases 0 to
// daysOn - 2, plus daysOn - 1 when the host does not fly home that day, plus cycle - 1 when the host
// travels the day before the swing: exactly the nights the host does not need in the city
// (BR-ROS-003), so both rules share one formula.
export function isHostAway(roster, night) {
  return !isNightNeeded(roster, night);
}

// BR-AVL-003: the rule alone, before exceptions and before "today".
function ruleSaysFree(listing, night) {
  switch (listing.availabilityType) {
    case 'roster':
      return isHostAway(listing.roster, night);
    case 'from_date':
      return listing.availableFrom != null && night >= listing.availableFrom;
    case 'ranges':
      return (listing.ranges ?? []).some((r) => night >= r.startNight && night < r.endExclusive);
    default:
      throw new RangeError(`Unknown availability type: ${listing.availabilityType}`);
  }
}

// BR-AVL-002/003/004: a string of n characters, '1' Available and '0' Unavailable, for the nights
// from `start`. An exception wins over the rule; a night before `today` is always Unavailable.
// `today` is the date in the listing's time zone (BR-AVL-005, see todayIn in dates.js).
export function listingNights(listing, start, n, today) {
  const exceptions = new Map((listing.exceptions ?? []).map((e) => [e.night, e.available]));
  let out = '';
  for (let i = 0; i < n; i++) {
    const night = addDays(start, i);
    let free;
    if (night < today) free = false;
    else if (exceptions.has(night)) free = exceptions.get(night);
    else free = ruleSaysFree(listing, night);
    out += free ? '1' : '0';
  }
  return out;
}

// Field names the rule needs; mirrors the publishing constraint in schema.md §5.
export function validateAvailability(listing) {
  const errors = [];
  const type = listing?.availabilityType;
  if (!AVAILABILITY_TYPES.includes(type)) return ['availabilityType'];
  if (type === 'roster' && validateRoster(listing.roster ?? {}).length) errors.push('roster');
  if (type === 'from_date' && !isIsoDate(listing.availableFrom)) errors.push('availableFrom');
  if (type === 'ranges') {
    const ranges = listing.ranges ?? [];
    const bad = ranges.some((r) => !isIsoDate(r.startNight) || !isIsoDate(r.endExclusive) || r.endExclusive <= r.startNight);
    if (!ranges.length || bad) errors.push('ranges');
  }
  for (const e of listing.exceptions ?? []) {
    if (!isIsoDate(e.night) || typeof e.available !== 'boolean') {
      errors.push('exceptions');
      break;
    }
  }
  return errors;
}
