import { daysBetween } from './dates.js';
import { validateAvailability } from './availability.js';
import { checkCustomItems, checkOtherRules, REPHRASE_RULES } from './text-checks.js';

// The listing wizard (UC-020) and what each listing status shows (BR-LST-002). Pure: the page
// renders the issues, the database enforces the same limits with its own constraints (schema.md §5).
//
// Listing shape, mirroring the `listings` columns in camelCase. The exact address travels apart, as
// in `listing_private`, and never leaves the owner's session (BR-LST-004, BR-TRU-003):
// { title, description, suburbId, address: { line, lat, lng }, placeType, bathroom, weeklyPrice,
//   billsIncluded, bond, furnished, minStayWeeks, householdSize, householdOnRoster, airportMinutes,
//   customItems, otherRules, photos: [...], availabilityType, roster, availableFrom, ranges,
//   exceptions }

export const TOTAL_STEPS = 5;
export const PLACE_TYPES = ['private_room', 'entire_place'];
export const BATHROOMS = ['own', 'ensuite', 'shared'];
export const STATUSES = ['draft', 'active', 'paused', 'filled', 'hidden', 'removed'];

export const TITLE_MIN = 5;
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 2000;
export const WEEKLY_PRICE_MAX = 5000;
export const BOND_MAX = 20000;
export const PHOTOS_MIN = 3; // BR-LST-001
export const PHOTOS_MAX = 12; // SEC-15
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // SEC-15
export const PHOTO_TYPES = ['image/jpeg', 'image/webp']; // SEC-15
export const PHOTO_MAX_SIDE = 1600; // SEC-16
export const LISTING_LIMIT = 5; // BR-LST-007
export const CALENDAR_CHECK_DAYS = 30; // BR-AVL-006

// AC-020-7
export function stepLabel(step) {
  return `Step ${step} of ${TOTAL_STEPS}`;
}

export const TEXTS = {
  suburbId: 'Choose the suburb',
  address: 'Add the address and mark the home on the map',
  placeType: 'Choose private room or entire place',
  bathroom: 'Choose the bathroom',
  weeklyPrice: 'Add the weekly price',
  weeklyPriceRange: `The weekly price goes from $1 to $${WEEKLY_PRICE_MAX.toLocaleString('en-AU')}`,
  billsIncluded: 'Say if bills are included',
  bond: 'Add the bond, or 0 if there is none',
  bondRange: `The bond goes up to $${BOND_MAX.toLocaleString('en-AU')}`,
  furnished: 'Say if it is furnished',
  minStayWeeks: 'The minimum stay goes from 1 to 52 weeks',
  householdSize: 'Up to 12 people can live there',
  householdOnRoster: 'Can’t be more than the people who live there',
  airportMinutes: 'Minutes to the airport go from 1 to 240',
  title: 'Add a title',
  titleLength: `The title needs ${TITLE_MIN} to ${TITLE_MAX} characters`,
  description: `The description can have up to ${DESCRIPTION_MAX.toLocaleString('en-AU')} characters`,
  photosTooMany: `Up to ${PHOTOS_MAX} photos`,
  otherRulesTooLong: 'House rules can have up to 200 characters',
  rephrase: REPHRASE_RULES,
  customItemsTooMany: 'Up to 10 of your own items',
  customItemsTooLong: 'Each item can have up to 40 characters',
  availabilityType: 'Choose how your availability works',
  roster: 'Add your roster',
  availableFrom: 'Pick the date it’s free from',
  ranges: 'Add the dates it’s free',
  exceptions: 'Check the nights you changed',
  emailVerified: 'Verify your email',
  phoneVerified: 'Verify your mobile',
  accuracyDeclared: 'Confirm the photos and details are real and current',
  photoType: 'Use a JPEG or WebP photo',
  photoSize: 'This photo is over 5 MB',
  limit: `You can have up to ${LISTING_LIMIT} listings. Write to support if you need more.`,
  gone: 'This home is no longer available',
};

// "3 more photos" style hint, so the host knows how far they are (UC-020 E2).
export function photosText(count) {
  const missing = PHOTOS_MIN - count;
  return `Add at least ${PHOTOS_MIN} photos (${missing} more)`;
}

const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const isInt = (v) => Number.isInteger(v);
const between = (v, min, max) => isInt(v) && v >= min && v <= max;
const issue = (field, code = field, text = TEXTS[code]) => ({ field, code, text });

// Optional numbers: empty is fine, a value must sit in the schema range.
function optionalRange(out, listing, field, min, max) {
  const v = listing[field];
  if (!blank(v) && !between(v, min, max)) out.push(issue(field));
}

function customItemIssues(listing) {
  const { errors } = checkCustomItems(listing.customItems);
  const out = [];
  if (errors.includes('tooMany')) out.push(issue('customItems', 'customItemsTooMany'));
  if (errors.includes('tooLong')) out.push(issue('customItems', 'customItemsTooLong'));
  if (errors.includes('discrimination')) out.push(issue('customItems', 'rephrase'));
  return out;
}

const STEP_CHECKS = {
  // Step 1: where it is and what it is.
  1(l) {
    const out = [];
    if (blank(l.suburbId)) out.push(issue('suburbId'));
    const a = l.address ?? {};
    if (blank(a.line) || !Number.isFinite(a.lat) || !Number.isFinite(a.lng)) out.push(issue('address'));
    if (!PLACE_TYPES.includes(l.placeType)) out.push(issue('placeType'));
    if (!BATHROOMS.includes(l.bathroom)) out.push(issue('bathroom'));
    return out;
  },
  // Step 2: money and household. Features "+ Add your own" share the 10 items with FIFO extras.
  2(l) {
    const out = [];
    if (blank(l.weeklyPrice)) out.push(issue('weeklyPrice'));
    else if (!between(l.weeklyPrice, 1, WEEKLY_PRICE_MAX)) out.push(issue('weeklyPrice', 'weeklyPriceRange'));
    if (typeof l.billsIncluded !== 'boolean') out.push(issue('billsIncluded'));
    if (blank(l.bond)) out.push(issue('bond'));
    else if (!between(l.bond, 0, BOND_MAX)) out.push(issue('bond', 'bondRange'));
    if (typeof l.furnished !== 'boolean') out.push(issue('furnished'));
    optionalRange(out, l, 'minStayWeeks', 1, 52);
    optionalRange(out, l, 'householdSize', 1, 12);
    optionalRange(out, l, 'airportMinutes', 1, 240);
    if (!blank(l.householdOnRoster)) {
      const max = blank(l.householdSize) ? 12 : l.householdSize;
      if (!between(l.householdOnRoster, 0, max)) out.push(issue('householdOnRoster'));
    }
    return out.concat(customItemIssues(l));
  },
  // Step 3: title, photos and rules.
  3(l) {
    const out = [];
    const title = String(l.title ?? '').trim();
    if (!title) out.push(issue('title'));
    else if (title.length < TITLE_MIN || title.length > TITLE_MAX) out.push(issue('title', 'titleLength'));
    if (String(l.description ?? '').trim().length > DESCRIPTION_MAX) out.push(issue('description'));
    const photos = (l.photos ?? []).length;
    if (photos < PHOTOS_MIN) out.push(issue('photos', 'photos', photosText(photos)));
    if (photos > PHOTOS_MAX) out.push(issue('photos', 'photosTooMany'));
    const rules = checkOtherRules(l.otherRules);
    if (rules.includes('tooLong')) out.push(issue('otherRules', 'otherRulesTooLong'));
    if (rules.includes('risk') || rules.includes('discrimination')) out.push(issue('otherRules', 'rephrase'));
    return out.concat(customItemIssues(l));
  },
  // Step 4: one availability rule (BR-AVL-003).
  4(l) {
    return validateAvailability(l).map((field) => issue(field === 'availabilityType' ? 'availabilityType' : field));
  },
  // Step 5: mobile and the accuracy statement (BR-LST-003). Email is checked before the wizard opens
  // (UC-020 precondition), and repeated here so Publish never relies on the page order.
  5(_l, account = {}) {
    const out = [];
    if (!account.emailVerified) out.push(issue('emailVerified'));
    if (!account.phoneVerified) out.push(issue('phoneVerified'));
    if (!account.accuracyDeclared) out.push(issue('accuracyDeclared'));
    return out;
  },
};

// What blocks "Next" on one step (UC-020 E1). Each issue carries the text the button shows.
export function stepIssues(listing, step, account) {
  const check = STEP_CHECKS[step];
  if (!check) throw new RangeError(`step must be 1 to ${TOTAL_STEPS}`);
  return check(listing ?? {}, account);
}

// Where "Save and finish later" sends the host back to; 0 when everything is complete.
export function firstIncompleteStep(listing, account) {
  for (let step = 1; step <= TOTAL_STEPS; step++) {
    if (stepIssues(listing, step, account).length) return step;
  }
  return 0;
}

// Everything that keeps "Publish" disabled (AC-020-1), the custom items counted once.
export function publishIssues(listing, account) {
  const seen = new Set();
  const out = [];
  for (let step = 1; step <= TOTAL_STEPS; step++) {
    for (const i of stepIssues(listing, step, account)) {
      const key = `${i.field}:${i.code}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ ...i, step });
      }
    }
  }
  return out;
}

export function canPublish(listing, account) {
  return publishIssues(listing, account).length === 0;
}

// BR-LST-007: active and paused listings count; filled ones do not, so a host can keep a history.
export function countsTowardLimit(status) {
  return status === 'active' || status === 'paused';
}

// `statuses` are the host's other listings; `limit` comes from the account (an admin can raise it).
export function listingLimitReached(statuses, limit = LISTING_LIMIT) {
  return (statuses ?? []).filter(countsTowardLimit).length >= limit;
}

// SEC-15: type and size, checked before re-encoding. Returns the reason or null.
export function checkPhotoFile(file) {
  if (!PHOTO_TYPES.includes(file?.type)) return issue('photo', 'photoType');
  if (!(file.size > 0) || file.size > PHOTO_MAX_BYTES) return issue('photo', 'photoSize');
  return null;
}

// SEC-16: the canvas size for re-encoding, longest side at most 1600 px, never upscaled.
export function resizeDimensions(width, height, maxSide = PHOTO_MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

const STATUS_LABEL = { paused: 'This listing is paused', filled: 'This listing is filled' };

// What the detail page shows for a status (BR-LST-002, BR-LST-008, UC-003, UC-022).
// - visible: the page shows the listing; otherwise it shows TEXTS.gone (UC-003 E1).
// - inSearch: it can appear in results.
// - label: the status line over the detail.
// - messageBox / editButton: the owner gets "Edit listing" instead of the box.
// - canManage: the owner can pause, fill, reactivate or delete (P-08: not while hidden).
export function listingView(status, { isOwner = false } = {}) {
  if (!STATUSES.includes(status)) throw new RangeError(`unknown status ${status}`);
  const view = { visible: false, inSearch: false, label: null, messageBox: false, editButton: false, canManage: false };
  if (status === 'removed') return view;
  if (isOwner) {
    view.visible = true;
    view.inSearch = status === 'active';
    view.label = status === 'hidden' ? 'Hidden by SwingMate' : (STATUS_LABEL[status] ?? null);
    view.editButton = status !== 'hidden';
    view.canManage = status !== 'hidden';
    return view;
  }
  if (status === 'active') return { ...view, visible: true, inSearch: true, messageBox: true };
  if (status === 'paused' || status === 'filled') return { ...view, visible: true, label: STATUS_LABEL[status] };
  return view; // draft, hidden
}

// BR-MSG-005: the conversation stays open with the listing status on top, except a listing hidden by
// an admin, which closes it for the person who searched.
export function conversationView(status, { role }) {
  if (!STATUSES.includes(status)) throw new RangeError(`unknown status ${status}`);
  if (status === 'hidden') {
    return role === 'seeker'
      ? { open: false, banner: 'This listing was removed by SwingMate' }
      : { open: true, banner: 'Hidden by SwingMate' };
  }
  if (status === 'removed') return { open: true, banner: 'This listing was deleted' };
  return { open: true, banner: STATUS_LABEL[status] ?? null };
}

// BR-AVL-006: "Calendar updated N days ago" on the detail, and the NTF-006 email after 30 days.
// Both dates are ISO days in the listing's time zone (BR-AVL-005).
export function calendarAgeDays(confirmedOn, today) {
  return Math.max(0, daysBetween(confirmedOn, today));
}

export function calendarUpdatedText(confirmedOn, today) {
  const days = calendarAgeDays(confirmedOn, today);
  if (days === 0) return 'Calendar updated today';
  if (days === 1) return 'Calendar updated 1 day ago';
  return `Calendar updated ${days} days ago`;
}

export function calendarCheckDue(confirmedOn, today) {
  return calendarAgeDays(confirmedOn, today) >= CALENDAR_CHECK_DAYS;
}
