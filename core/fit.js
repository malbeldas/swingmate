import { addDays, daysBetween, formatRange, groupConsecutive, isIsoDate } from './dates.js';
import { neededNights } from './roster.js';

// BR-AVL-004: availability and fit run over 84 nights.
export const HORIZON_NIGHTS = 84;

export const FIT_CLASSES = ['full', 'strong', 'partial', 'poor'];

// ---------------------------------------------------------------------------------------------
// Nights the person needs
// ---------------------------------------------------------------------------------------------

function sameDayNextYear(iso) {
  const next = `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}`;
  return isIsoDate(next) ? next : `${next.slice(0, 8)}28`; // 29 Feb -> 28 Feb
}

// BR-SRC-002: check-in today or later and at most 12 months ahead; check-out after check-in.
export function validateStay(checkIn, checkOut, today) {
  const errors = [];
  if (!isIsoDate(checkIn)) errors.push('checkIn');
  if (!isIsoDate(checkOut)) errors.push('checkOut');
  if (errors.length) return errors;
  if (checkIn < today || checkIn > sameDayNextYear(today)) errors.push('checkIn');
  if (checkOut <= checkIn) errors.push('checkOut');
  return errors;
}

// BR-SRC-001: from the check-in night to the night before check-out. BR-SRC-002: a stay longer
// than 84 nights is judged on its first 84, and `capped` tells the page to say so.
export function nightsFromDates(checkIn, checkOut) {
  const total = daysBetween(checkIn, checkOut);
  if (total <= 0) throw new RangeError('Check-out must be after check-in');
  const count = Math.min(total, HORIZON_NIGHTS);
  const nights = Array.from({ length: count }, (_, i) => addDays(checkIn, i));
  return { nights, capped: total > HORIZON_NIGHTS, totalNights: total };
}

// BR-SRC-001: dates win over the roster; without either there are no nights (BR-ROS-005).
// `today` is the date in the searched place's time zone (BR-AVL-005).
export function needFor({ checkIn, checkOut, roster } = {}, today) {
  if (checkIn && checkOut) return { ...nightsFromDates(checkIn, checkOut), byDates: true };
  if (roster) return { nights: neededNights(roster, today, HORIZON_NIGHTS), byDates: false, capped: false };
  return { nights: [], byDates: false, capped: false };
}

// ---------------------------------------------------------------------------------------------
// Fit of one listing (calculation only; texts are below)
// ---------------------------------------------------------------------------------------------

// `nights`: sorted ISO nights the person needs. `availability`: the '1'/'0' string that
// listing_nights returns, starting on `start`. Nights outside that string count as not free.
export function computeFit(nights, availability, start) {
  if (!nights.length) {
    return { fitClass: null, needed: 0, free: 0, missing: [], blocks: [], worstBlockMissing: 0 };
  }
  const isFree = (night) => {
    const i = daysBetween(start, night);
    return i >= 0 && i < availability.length && availability[i] === '1';
  };
  const missingSet = new Set(nights.filter((night) => !isFree(night)));
  const blocks = groupConsecutive(nights);
  const worstBlockMissing = Math.max(...blocks.map((b) => b.filter((night) => missingSet.has(night)).length));
  const needed = nights.length;
  const free = needed - missingSet.size;
  return {
    fitClass: classify(needed, free, worstBlockMissing),
    needed,
    free,
    missing: nights.filter((night) => missingSet.has(night)),
    blocks,
    worstBlockMissing,
  };
}

// BR-FIT-001, in whole numbers so 90% and 60% are exact.
export function classify(needed, free, worstBlockMissing) {
  if (free === needed) return 'full';
  if (worstBlockMissing <= 1 && free * 10 >= needed * 9) return 'strong';
  if (free * 10 >= needed * 6) return 'partial';
  return 'poor';
}

// ---------------------------------------------------------------------------------------------
// Results list
// ---------------------------------------------------------------------------------------------

const RANK = { full: 0, strong: 1, partial: 2 };

// BR-FIT-003 and BR-FIT-006. Items carry `fitClass` (null when there are no nights to judge).
export function visibleResults(items, { showNear = false } = {}) {
  const hasFit = items.some((item) => item.fitClass);
  if (!hasFit) return { shown: items.slice(), nearCount: 0, poorCount: 0 };
  const shown = items.filter((item) => item.fitClass === 'full' || item.fitClass === 'strong' || (showNear && item.fitClass === 'partial'));
  return {
    shown,
    nearCount: items.filter((item) => item.fitClass === 'partial').length,
    poorCount: items.filter((item) => item.fitClass === 'poor').length,
  };
}

// BR-FIT-004: fit class, then weekly price ascending, then newest first. Without nights, newest
// first. Items carry `fitClass`, `priceWeekly` and `publishedAt` (ISO timestamp).
export function sortResults(items) {
  const newestFirst = (a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0);
  return items.slice().sort((a, b) => {
    if (a.fitClass && b.fitClass) {
      return (RANK[a.fitClass] ?? 3) - (RANK[b.fitClass] ?? 3) || a.priceWeekly - b.priceWeekly || newestFirst(a, b);
    }
    return newestFirst(a, b);
  });
}

// ---------------------------------------------------------------------------------------------
// Texts (Australian English, from the approved prototype)
// ---------------------------------------------------------------------------------------------

export const NO_FIT_TEXT = 'Add your dates or roster to see the fit'; // BR-FIT-006

// BR-FIT-002: no label for poor, no percentage, "date fit" when the nights come from dates.
export function fitLabel(fitClass, byDates) {
  const kind = byDates ? 'date' : 'roster';
  if (fitClass === 'full') return `Great ${kind} fit`;
  if (fitClass === 'strong') return `Good ${kind} fit`;
  if (fitClass === 'partial') return 'Partial fit';
  return null;
}

function gapsText(missing, max = 3) {
  const gaps = groupConsecutive(missing).map((run) => formatRange(run[0], run[run.length - 1]));
  return gaps.slice(0, max).join(', ') + (gaps.length > max ? '…' : '');
}

function nightsWord(n) {
  return n === 1 ? 'night' : 'nights';
}

// BR-FIT-005: the one line on the card.
export function cardLine(fit, { byDates }) {
  if (!fit.fitClass) return NO_FIT_TEXT;
  const unit = `${nightsWord(fit.needed)} you need`;
  if (fit.fitClass === 'full') return `Free for all ${fit.needed} ${unit}${byDates ? '' : ' in the next 12 weeks'}`;
  if (fit.fitClass === 'strong') return `Free for ${fit.free} of ${fit.needed} ${unit}. Not free the night of ${gapsText(fit.missing)}`;
  return `${fit.missing.length} of the ${fit.needed} ${unit} are not free`;
}

// BR-FIT-005: the full reasons on the detail page, from the same calculation as the calendar.
// `budget` is the weekly maximum the person set, or null.
export function fitReasons(fit, { byDates, fliesHomeLastDay = true, priceWeekly, budget = null }) {
  const reasons = [];
  if (fit.fitClass) {
    const scope = byDates
      ? `your stay, ${formatRange(fit.blocks[0][0], addDays(fit.blocks[fit.blocks.length - 1].at(-1), 1))}`
      : `your next ${fit.blocks.length} R&R breaks${fliesHomeLastDay ? ', including the nights you fly home' : ''}`;
    if (fit.fitClass === 'full') {
      reasons.push({ tone: 'good', text: `Free every night of ${scope} (${fit.needed} ${nightsWord(fit.needed)})` });
    } else if (fit.fitClass === 'strong') {
      reasons.push({ tone: 'good', text: `Free for ${fit.free} of the ${fit.needed} nights you need${byDates ? '' : ` over your next ${fit.blocks.length} R&R breaks`}` });
      reasons.push({ tone: 'warn', text: `Not free the night of ${gapsText(fit.missing)}${byDates ? '' : '. That is at most 1 night per R&R break'}` });
    } else {
      const lead = fit.fitClass === 'partial' ? 'Partial fit' : 'Not a fit';
      reasons.push({ tone: 'warn', text: `${lead}: ${fit.missing.length} of the ${fit.needed} nights you need are not free (${gapsText(fit.missing)})` });
    }
  }
  if (budget != null) {
    reasons.push(priceWeekly <= budget
      ? { tone: 'good', text: `Within your $${budget} weekly budget` }
      : { tone: 'warn', text: `$${priceWeekly - budget} above your $${budget} weekly budget` });
  }
  return reasons;
}

