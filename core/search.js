import { addDays, daysBetween, formatDay, isIsoDate } from './dates.js';
import { RADIUS_OPTIONS_KM, defaultRadiusKm } from './geo.js';
import { HORIZON_NIGHTS, cardLine, computeFit, fitLabel, sortResults, validateStay, visibleResults } from './fit.js';

// The results page (UC-001, BR-SRC-001 to BR-SRC-005, BR-FIT-003/004/006). Pure: the page passes
// the rows that search_listings returned and renders what this module answers.

export const CARD_WEEKS = 4; // BR-AVL-004
export const MAX_PRICE_OPTIONS = [300, 400]; // prototype: Any, $300, $400
export const PLACE_TYPE_LABELS = { private_room: 'Private room', entire_place: 'Entire place' };
export const BATHROOM_LABELS = { own: 'Own bathroom', ensuite: 'Ensuite', shared: 'Shared bathroom' };

export const TEXTS = {
  chooseLocation: 'Choose a suburb or city from the list',
  checkIn: 'Check-in is today or later, up to 12 months ahead',
  checkOut: 'Check-out is after check-in',
  capped: (total) => `Your stay is ${total} nights. We check the fit on the first ${HORIZON_NIGHTS}.`,
  loadError: "We couldn't load homes. Try again.",
  filteredEmptyTitle: 'No homes match these filters',
  filteredEmptyBody: (place) => `There are homes in ${place}, but your filters hide them.`,
  noResultsTitle: (place) => `No places in ${place} yet`,
  noFitTitle: (place) => `No homes in ${place} fit your nights yet`,
  widen: (km) => `Search ${km} km around`,
  listYourPlace: (place) => `Have a spare room in ${place}? List it for free`,
  sortNote: 'Sorted by fit first, then price',
  sortNoteNoFit: 'Newest first',
  nearHidden: (n) => `${n} near ${n === 1 ? 'match' : 'matches'} (partial fit)`,
  poorNote: "Homes that don't fit are never shown.",
};

// What a search is (BR-SRC-001): a place from the list, a radius and optional dates. The roster is
// not in the URL: it comes from the account or the visitor's session (BR-ROS-006).
export function readSearchParams(params) {
  const get = (k) => params.get(k) || null;
  const place = Number(get('place'));
  const radius = Number(get('radius'));
  return {
    placeId: Number.isInteger(place) && place > 0 ? place : null,
    radiusKm: Number.isInteger(radius) && radius > 0 ? radius : null,
    checkIn: isIsoDate(get('in')) ? get('in') : null,
    checkOut: isIsoDate(get('out')) ? get('out') : null,
  };
}

export function searchParamsFor({ placeId, radiusKm, checkIn, checkOut }) {
  const p = new URLSearchParams();
  if (placeId) p.set('place', String(placeId));
  if (radiusKm) p.set('radius', String(radiusKm));
  if (checkIn && checkOut) {
    p.set('in', checkIn);
    p.set('out', checkOut);
  }
  return p.toString();
}

// BR-SRC-003: the radius choices for a place. A city starts at 40 km, which is also offered.
export function radiusOptions(place) {
  const base = defaultRadiusKm(place);
  return [...new Set([...RADIUS_OPTIONS_KM, base])].sort((a, b) => a - b);
}

export function chosenRadius(radiusKm, place) {
  return radiusOptions(place).includes(radiusKm) ? radiusKm : defaultRadiusKm(place);
}

// UC-001 E1/E2. Dates count only as a pair; one date alone is an error, not a silent drop.
export function searchIssues({ placeId, checkIn, checkOut }, today) {
  const issues = [];
  if (!placeId) issues.push('place');
  if (checkIn || checkOut) issues.push(...validateStay(checkIn, checkOut, today));
  return issues;
}

// Where the nights string of a row starts: the check-in when there are dates, else today
// (search_listings is called with that same start).
export function searchStart({ checkIn, checkOut }, today) {
  return checkIn && checkOut && checkIn >= today ? checkIn : today;
}

// One row of search_listings plus its fit against the nights the person needs.
export function withFit(row, need, start) {
  const fit = computeFit(need.nights, row.nights ?? '', start);
  return {
    ...row,
    fit,
    fitClass: fit.fitClass,
    priceWeekly: row.weekly_price,
    publishedAt: row.published_at ?? '',
  };
}

export function defaultFilters() {
  return { great: true, good: true, near: false, placeTypes: [], maxPrice: null };
}

export function filtersActive(filters) {
  const d = defaultFilters();
  return filters.great !== d.great || filters.good !== d.good || filters.near !== d.near
    || filters.placeTypes.length > 0 || filters.maxPrice != null;
}

// BR-SRC-004: the filters filter for real. The fit boxes only apply when there are nights.
function passes(item, filters, hasFit) {
  if (filters.placeTypes.length && !filters.placeTypes.includes(item.place_type)) return false;
  if (filters.maxPrice != null && item.weekly_price > filters.maxPrice) return false;
  if (!hasFit) return true;
  if (item.fitClass === 'full') return filters.great;
  if (item.fitClass === 'strong') return filters.good;
  if (item.fitClass === 'partial') return filters.near;
  return false; // poor never shows (BR-FIT-003)
}

// The whole list state. `rows` already carry their fit (withFit).
//  state 'results'        → `shown` sorted (BR-FIT-004)
//  state 'filtered-empty' → homes exist but the filters hide them (AC-001-6)
//  state 'no-fit'         → homes exist but none is Full or Strong (BR-SRC-005)
//  state 'none'           → no home in the radius (AC-001-7: nothing invented)
export function resultsView(rows, filters) {
  const hasFit = rows.some((r) => r.fitClass);
  const { nearCount, poorCount } = visibleResults(rows);
  const shown = sortResults(rows.filter((r) => passes(r, filters, hasFit)));
  let state = 'results';
  if (!rows.length) state = 'none';
  else if (!shown.length) {
    const fitting = rows.some((r) => r.fitClass === 'full' || r.fitClass === 'strong');
    state = hasFit && !fitting && !filtersActive({ ...filters, near: false }) ? 'no-fit' : 'filtered-empty';
  }
  return {
    state,
    hasFit,
    shown,
    nearCount,
    poorCount,
    nearHidden: hasFit && !filters.near ? nearCount : 0,
  };
}

// BR-SRC-005: the bigger radius to offer, or null when it is already the widest.
export function widerRadius(radiusKm, place) {
  return radiusOptions(place).find((km) => km > radiusKm) ?? null;
}

export function resultsHeading(count, place) {
  return `${count} ${count === 1 ? 'home' : 'homes'} near ${place}`;
}

// The card's 4 weeks (AC-001-8): 28 nights from `start`, each Available or Unavailable, and
// marked when it is a night the person needs.
export function cardWeeks(row, need, start) {
  return nightWeeks(row.nights, need, start, CARD_WEEKS);
}

// `count` weeks of 7 nights read from a listing_nights string that starts on `start`. The card
// starts on `start`; the detail passes `from` (the Monday on or before it) so the weeks line up
// under Mon to Sun, and nights before `start` are marked `before` (Unavailable, dimmed).
export function nightWeeks(nightsText, need, start, count, { from = start } = {}) {
  const needed = new Set(need.nights);
  const nights = nightsText ?? '';
  const weeks = [];
  for (let w = 0; w < count; w++) {
    const first = addDays(from, w * 7);
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const night = addDays(first, d);
      const i = daysBetween(start, night);
      const before = i < 0;
      const free = !before && nights[i] === '1';
      const isNeeded = needed.has(night);
      cells.push({
        night,
        free,
        need: isNeeded,
        ...(before ? { before: true } : {}),
        title: `${formatDay(night)}: ${free ? 'Available' : 'Unavailable'}${isNeeded ? ', a night you need' : ''}`,
      });
    }
    weeks.push({ label: formatDay(first), cells });
  }
  return weeks;
}

export function cardTexts(item, need) {
  return {
    type: PLACE_TYPE_LABELS[item.place_type] ?? '',
    bathroom: BATHROOM_LABELS[item.bathroom] ?? '',
    price: `$${item.weekly_price}`,
    where: `${item.suburb_name}, ${item.state} · ${formatKm(item.distance_km)}`,
    fitLabel: fitLabel(item.fitClass, need.byDates),
    line: cardLine(item.fit, { byDates: need.byDates }),
  };
}

export function formatKm(km) {
  return km < 1 ? 'under 1 km away' : `${Math.round(km)} km away`;
}
