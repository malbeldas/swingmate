import { daysBetween } from './dates.js';
import { listingNights, validateAvailability } from './availability.js';
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

// ---------------------------------------------------------------------------------------------
// The wizard page (#13, UC-020, DEC-016). Titles from the prototype; the tips are ours and Tomás
// reviews them at the next demo (decision-log.md Q-27).
// ---------------------------------------------------------------------------------------------

export const STEP_TITLES = [
  'Where is it and what are you offering?',
  'Price, bills and the household',
  'Photos and description',
  'Availability',
  'Review and publish',
];

export const STEP_TIPS = [
  'Only you see the address and the pin. People who search see the suburb and a 1 km circle around it.',
  'People on a roster compare the weekly price with bills included. Saying who lives here saves you questions.',
  'Clear photos of the room, the bathroom, the kitchen and the living area get the most messages.',
  'From my roster keeps your calendar right on its own: the home is free while you are on site.',
  'Check the preview the way someone searching will see it. You can change anything after you publish.',
];

// schema.md §5: `features` and `perks` hold values from these fixed lists; Furnished and Parking have
// their own columns. The host's own items go in `custom_items` (BR-LST-006).
export const FEATURES = {
  air_conditioning: 'Air conditioning',
  washing_machine: 'Washing machine',
  door_lock: 'Door lock',
  pool: 'Pool',
};
export const PERKS = {
  luggage_storage: 'Luggage storage',
  airport_lift: 'Airport lift',
  rr_only_rate: 'R&R-only rate',
};
export const SMOKING_OPTIONS = { no: 'No smoking', outside: 'Outside only', yes: 'Smoking OK' };
export const PARKING_OPTIONS = { none: 'No parking', street: 'Street parking', off_street: 'Off-street parking', garage: 'Garage' };

export const WIZARD_TEXTS = {
  addressHint: 'Private. Only you see it, and you share it in the chat when you both agree.',
  pinHint: 'Tap the map where the home is.',
  pinFallback: 'The map didn’t load, so we used the middle of the suburb. Mark the home when the map is back.',
  otherRulesHint: 'Shown on your listing. Keep it about the home, not about who can live there. We check it like any message.',
  rosterHint: 'Available on the days you are away on swing. When you are home it shows as unavailable.',
  fromDateHint: 'Open from that date on. Tap any night below to block it.',
  rangesHint: 'Open only on the dates you add. Tap any night below to change it.',
  nightsHint: 'Each square is a night. Tap one to block it (holiday, guest staying) or open it again.',
  verifyPhone: 'Verify your mobile to publish. It takes 30 seconds and keeps fake listings out. People who search see “Phone verified” on your listing. We never show your number.',
  verifyPhoneSoon: 'Mobile verification opens with the pilot. Your listing is saved as a draft, ready to publish then.',
  declaration: 'The photos and details are real and current. I’ll keep the calendar up to date.',
  saved: 'Saved. You can finish later from this page.',
  saveFailed: 'We couldn’t save this. Check your connection and try again.',
  published: 'Your place is live',
  publishedLead: 'People whose R&R fits your away days will see it first. We’ll email you when someone sends a message.',
  changesSaved: 'Changes saved',
  cantEdit: 'This listing can no longer be edited',
  notFound: 'We couldn’t find this listing',
  suspended: 'Your account is suspended, so you can’t publish for now.',
  status: 'This listing can’t go live from here.',
  photoFailed: 'We couldn’t upload this photo. Try again.',
};

const fromRange = (r) => ({ startNight: r.start_night, endExclusive: r.end_exclusive });
const toRange = (r) => ({ start_night: r.startNight, end_exclusive: r.endExclusive });

// What my_listing returns, as the wizard's listing shape. `roster` is the host's saved one, the
// rule "From my roster" reads it (BR-AVL-003).
export function listingFromRow(data, roster = null) {
  const l = data?.listing ?? {};
  return {
    id: l.id ?? null,
    status: l.status ?? 'draft',
    title: l.title ?? '',
    description: l.description ?? '',
    suburbId: l.suburb_id ?? null,
    address: data?.address ? { ...data.address } : null,
    placeType: l.place_type ?? null,
    bathroom: l.bathroom ?? null,
    weeklyPrice: l.weekly_price ?? null,
    billsIncluded: l.bills_included ?? null,
    bond: l.bond ?? null,
    furnished: l.furnished ?? null,
    minStayWeeks: l.min_stay_weeks ?? null,
    householdSize: l.household_size ?? null,
    householdOnRoster: l.household_on_roster ?? null,
    hostLivesOnsite: l.host_lives_onsite ?? null,
    airportMinutes: l.airport_minutes ?? null,
    couplesOk: l.couples_ok ?? null,
    petsOk: l.pets_ok ?? null,
    smoking: l.smoking ?? null,
    parking: l.parking ?? null,
    features: [...(l.features ?? [])],
    perks: [...(l.perks ?? [])],
    customItems: [...(l.custom_items ?? [])],
    otherRules: l.other_rules ?? '',
    photos: (data?.photos ?? []).map((p) => ({ ...p })),
    availabilityType: l.availability_type ?? null,
    availableFrom: l.available_from ?? null,
    ranges: (data?.ranges ?? []).map(fromRange),
    exceptions: (data?.exceptions ?? []).map((e) => ({ night: e.night, available: e.available })),
    roster,
    accuracyDeclared: Boolean(l.accuracy_declared_at),
  };
}

const orNull = (v) => (v === undefined || v === '' ? null : v);
const textOrNull = (v) => (String(v ?? '').trim() === '' ? null : String(v).trim());

// The `listings` columns the browser may write (column grants in 20261105090000_listings.sql).
export function listingToRow(l) {
  return {
    title: textOrNull(l.title),
    description: textOrNull(l.description),
    suburb_id: orNull(l.suburbId),
    place_type: orNull(l.placeType),
    bathroom: orNull(l.bathroom),
    weekly_price: orNull(l.weeklyPrice),
    bills_included: orNull(l.billsIncluded),
    bond: orNull(l.bond),
    furnished: orNull(l.furnished),
    min_stay_weeks: orNull(l.minStayWeeks),
    household_size: orNull(l.householdSize),
    household_on_roster: orNull(l.householdOnRoster),
    host_lives_onsite: orNull(l.hostLivesOnsite),
    airport_minutes: orNull(l.airportMinutes),
    couples_ok: orNull(l.couplesOk),
    pets_ok: orNull(l.petsOk),
    smoking: orNull(l.smoking),
    parking: orNull(l.parking),
    features: (l.features ?? []).filter((f) => f in FEATURES),
    perks: (l.perks ?? []).filter((p) => p in PERKS),
    custom_items: (l.customItems ?? []).map((i) => i.trim()).filter(Boolean),
    other_rules: textOrNull(l.otherRules),
    availability_type: orNull(l.availabilityType),
    available_from: l.availabilityType === 'from_date' ? orNull(l.availableFrom) : null,
  };
}

export function rangesToRows(listingId, l) {
  if (l.availabilityType !== 'ranges') return [];
  return (l.ranges ?? []).map((r) => ({ listing_id: listingId, ...toRange(r) }));
}

export function exceptionsToRows(listingId, l) {
  return (l.exceptions ?? []).map((e) => ({ listing_id: listingId, night: e.night, available: e.available }));
}

// The issues that only say something is still empty. "Save and finish later" (UC-020 A1) saves
// with those; a value that is there but wrong (a 2-character title, a rule to rephrase) is fixed first,
// because the database would refuse it.
const MISSING = new Set(['suburbId', 'address', 'placeType', 'bathroom', 'weeklyPrice', 'billsIncluded', 'bond', 'furnished',
  'title', 'photos', 'availabilityType', 'roster', 'availableFrom', 'ranges', 'emailVerified', 'phoneVerified', 'accuracyDeclared']);

export function saveIssues(listing, step, account) {
  return stepIssues(listing, step, account).filter((i) => !MISSING.has(i.code));
}

// "Next" is disabled and says what is missing (UC-020 E1): the first issue's text.
export function nextBlockedText(listing, step, account) {
  return stepIssues(listing, step, account)[0]?.text ?? null;
}

// The night picker of step 4 (BR-AVL-002): tapping a night flips it. The exception is kept only when
// it differs from what the rule says, so tapping twice leaves no trace.
export function toggleNight(listing, night, today) {
  const rest = (listing.exceptions ?? []).filter((e) => e.night !== night);
  const byRule = listingNights({ ...listing, exceptions: [] }, night, 1, today) === '1';
  const now = listingNights(listing, night, 1, today) === '1';
  const exceptions = now === byRule ? [...rest, { night, available: !now }] : rest;
  return exceptions.sort((a, b) => (a.night < b.night ? -1 : a.night > b.night ? 1 : 0));
}

// What publish_listing answers, as the text under Publish (UC-020 E4, BR-LST-001, BR-LST-003).
const MISSING_TEXT = {
  title: TEXTS.title,
  suburb_id: TEXTS.suburbId,
  public_circle: TEXTS.address,
  address: TEXTS.address,
  place_type: TEXTS.placeType,
  bathroom: TEXTS.bathroom,
  weekly_price: TEXTS.weeklyPrice,
  bills_included: TEXTS.billsIncluded,
  bond: TEXTS.bond,
  furnished: TEXTS.furnished,
  accuracy_declared_at: TEXTS.accuracyDeclared,
  availability: TEXTS.availabilityType,
  photos: photosText(0).replace(/ \(.*\)$/, ''),
  verified_contact: TEXTS.phoneVerified,
  house_rules: REPHRASE_RULES, // BR-LST-005
};

export function publishResultText(result) {
  if (!result) return WIZARD_TEXTS.saveFailed;
  if (result.ok) return null;
  switch (result.reason) {
    case 'limit': return TEXTS.limit;
    case 'suspended': return WIZARD_TEXTS.suspended;
    case 'status': return WIZARD_TEXTS.status;
    case 'not_found': return WIZARD_TEXTS.notFound;
    case 'missing': return (result.missing ?? []).map((m) => MISSING_TEXT[m]).filter(Boolean)[0] ?? WIZARD_TEXTS.saveFailed;
    default: return WIZARD_TEXTS.saveFailed;
  }
}

// The detail's chips (BR-LST-006): the fixed features and perks with their labels, then the host's own.
export function extrasLabels({ features = [], perks = [], custom_items: custom = [] } = {}) {
  return [
    ...(features ?? []).map((f) => FEATURES[f]).filter(Boolean),
    ...(perks ?? []).map((p) => PERKS[p]).filter(Boolean),
    ...(custom ?? []),
  ];
}

// listing-photos paths (schema.md §11, SEC-18): {listing_id}/{uuid}.jpg, never the file's name.
export function listingPhotoPath(listingId, uuid) {
  return `${listingId}/${uuid}.jpg`;
}

// The first free position 0 to 11 (listing_photos.position is unique per listing), or -1 when full.
export function nextPhotoPosition(photos) {
  const used = new Set((photos ?? []).map((p) => p.position));
  for (let i = 0; i < PHOTOS_MAX; i++) if (!used.has(i)) return i;
  return -1;
}

// ---------------------------------------------------------------------------------------------
// My places (UC-022, #14). Labels from the prototype's host dashboard.
// ---------------------------------------------------------------------------------------------

export const PLACE_STATUS_LABELS = {
  active: 'Live',
  paused: 'Paused',
  filled: 'Filled',
  draft: 'Draft',
  hidden: 'Hidden by SwingMate',
};

export const PLACES_TEXTS = {
  title: 'My places',
  listNew: '+ List a new place',
  none: 'You haven’t listed a place yet.',
  edit: 'Edit',
  finish: 'Finish listing',
  calendar: 'Calendar',
  closeCalendar: 'Close calendar',
  pause: 'Pause',
  resume: 'Resume',
  fill: 'Mark as filled',
  reactivate: 'Reactivate',
  remove: 'Delete',
  confirmRemove: 'Delete this listing? People who search won’t see it again. Your conversations stay.',
  confirmRemoveYes: 'Yes, delete it',
  keep: 'Keep it',
  upToDate: 'My calendar is up to date',
  hidden: (reason) => `SwingMate hid this listing${reason ? `: ${reason}` : ''}. You can’t reactivate it. Write to support if you think it’s a mistake.`,
  failed: 'That didn’t work. Try again.',
  draft: 'Not published yet',
};

// What each status lets the host do (BR-LST-002, P-08, AC-022-3: nothing on a hidden listing).
export function placeActions(status) {
  const none = { edit: false, finish: false, calendar: false, pause: false, resume: false, fill: false, reactivate: false, remove: false };
  switch (status) {
    case 'active': return { ...none, edit: true, calendar: true, pause: true, fill: true, remove: true };
    case 'paused': return { ...none, edit: true, calendar: true, resume: true, fill: true, remove: true };
    case 'filled': return { ...none, edit: true, calendar: true, reactivate: true, remove: true };
    case 'draft': return { ...none, finish: true, remove: true };
    default: return none;
  }
}

// "Available 41 of the next 84 nights · 2 conversations" (prototype: "Available N of the next 56 days").
export function placeSummary(row) {
  if (row.status === 'draft') return PLACES_TEXTS.draft;
  const n = row.conversations ?? 0;
  const talks = n === 0 ? 'no messages yet' : n === 1 ? '1 conversation' : `${n} conversations`;
  if (!row.nights) return talks;
  const free = [...row.nights].filter((c) => c === '1').length;
  return `Available ${free} of the next ${row.nights.length} nights · ${talks}`;
}

// What an exception change means for listing_availability_exceptions: the row to upsert for that
// night, or null to delete it.
export function exceptionChange(exceptions, night) {
  const e = (exceptions ?? []).find((x) => x.night === night);
  return e ? { night, available: e.available } : null;
}
