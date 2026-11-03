import { mondayOf } from './dates.js';
import { computeFit, fitLabel, fitReasons, NO_FIT_TEXT } from './fit.js';
import { BATHROOM_LABELS, PLACE_TYPE_LABELS, nightWeeks } from './search.js';
import { calendarUpdatedText, listingView } from './listing.js';
import { hostFacts } from './trust.js';

// The listing detail (UC-003). Pure: the page passes what get_listing returned and the nights the
// person needs (needFor in core/fit.js), and renders what this module answers.

export const DETAIL_WEEKS = 12; // BR-AVL-004

const SMOKING = { no: 'No smoking', outside: 'Outside only', yes: 'Smoking OK' };
const PARKING = { none: 'No parking', street: 'Street parking', off_street: 'Off-street parking', garage: 'Garage' };
const yesNo = (v, yes, no) => (v == null ? null : v ? yes : no);

export const TEXTS = {
  approximate: (host) => `Approximate area. ${host} shares the exact address in the chat when you both agree.`,
  mapFallback: (suburb) => `Approximate area: ${suburb}`, // INT-005: tiles didn't load
  noFit: 'Add your dates or roster to see how this home fits your weeks off.',
  editListing: 'Edit listing',
  backToSearch: 'Back to search',
  searchAgain: 'Search homes',
};

// "$260 per week · bills included · bond $520"
export function priceLine(listing) {
  const bills = listing.bills_included ? 'bills included' : 'bills not included';
  return `per week · ${bills} · bond $${listing.bond}`;
}

// "Sandy Bay, TAS · Private room · Own bathroom"
export function subtitle(listing) {
  return [`${listing.suburb_name}, ${listing.state}`, PLACE_TYPE_LABELS[listing.place_type], BATHROOM_LABELS[listing.bathroom]]
    .filter(Boolean).join(' · ');
}

// "About the home": only what the host filled in, label and value as text (design-system.md §5:
// an icon never goes alone).
export function detailFacts(l) {
  const facts = [
    ['Place', PLACE_TYPE_LABELS[l.place_type]],
    ['Bathroom', BATHROOM_LABELS[l.bathroom]],
    ['Bills', yesNo(l.bills_included, 'Included', 'Not included')],
    ['Bond', l.bond == null ? null : `$${l.bond}`],
    ['Furnished', yesNo(l.furnished, 'Yes', 'No')],
    ['Minimum stay', l.min_stay_weeks ? `${l.min_stay_weeks} ${l.min_stay_weeks === 1 ? 'week' : 'weeks'}` : 'No minimum'],
    ['Household', l.household_size ? householdText(l.household_size, l.household_on_roster) : null],
    ['Host', yesNo(l.host_lives_onsite, 'Lives here', 'Lives elsewhere')],
    ['Airport', l.airport_minutes ? `${l.airport_minutes} min drive` : null],
    ['Couples', yesNo(l.couples_ok, 'OK', 'Not OK')],
    ['Pets', yesNo(l.pets_ok, 'OK', 'Not OK')],
    ['Smoking', SMOKING[l.smoking] ?? null],
    ['Parking', PARKING[l.parking] ?? null],
  ];
  return facts.filter(([, value]) => value != null).map(([label, value]) => ({ label, value }));
}

function householdText(size, onRoster) {
  const people = `${size} ${size === 1 ? 'person lives' : 'people live'} here`;
  return onRoster ? `${people}, ${onRoster} on a roster` : people;
}

// Everything the page needs to draw a listing for this person.
export function detailView(listing, need, { now = new Date() } = {}) {
  const view = listingView(listing.status, { isOwner: Boolean(listing.is_owner) });
  const fit = computeFit(need.nights, listing.nights ?? '', listing.start);
  const host = hostFacts({
    displayName: listing.host.display_name,
    phoneVerified: listing.host.phone_verified,
    createdAt: listing.host.created_at ?? now.toISOString(),
    livesOnsite: listing.host_lives_onsite,
    roster: listing.host.roster_pattern
      ? { daysOn: listing.host.roster_pattern.days_on, daysOff: listing.host.roster_pattern.days_off }
      : null,
  });
  return {
    ...view,
    fit,
    fitLabel: fitLabel(fit.fitClass, need.byDates),
    // BR-FIT-005 and AC-003-3: the reasons and the calendar come from the same calculation.
    reasons: fit.fitClass ? fitReasons(fit, { byDates: need.byDates, priceWeekly: listing.weekly_price }) : [],
    noFitText: fit.fitClass ? null : NO_FIT_TEXT,
    weeks: nightWeeks(listing.nights, need, listing.start, DETAIL_WEEKS, { from: mondayOf(listing.start) }),
    calendarText: calendarUpdatedText(listing.calendar_confirmed_on, listing.today),
    facts: detailFacts(listing),
    // The host's own items (BR-LST-006). Features and FIFO perks get their labels with the wizard (#13).
    extras: listing.custom_items ?? [],
    host,
  };
}

// AC-003-3: the needed nights the calendar marks as Unavailable.
export function unavailableNeededNights(weeks) {
  return weeks.flatMap((w) => w.cells.filter((c) => c.need && !c.free).map((c) => c.night));
}
