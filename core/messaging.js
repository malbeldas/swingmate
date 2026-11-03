import { daysBetween, formatRange } from './dates.js';
import { nightsFromDates, validateStay } from './fit.js';
import { rosterLabel } from './roster.js';

// Who can start a conversation and what a message may contain (UC-004, BR-MSG, BR-TRU-004).
// JS twin of the checks in the SQL function start_conversation (schema.md §10): same order, same
// reason codes, so the page can explain what the database would refuse before sending.

export const MESSAGE_MAX = 1000; // BR-MSG-003
export const MESSAGE_RULES = ['email', 'phone']; // BR-TRU-004, profiles.message_rule
export const NEW_ACCOUNT_DAYS = 7; // BR-MSG-007
export const NEW_ACCOUNT_DAILY_CONVERSATIONS = 10; // BR-MSG-007, SEC-10
export const MESSAGES_PER_HOUR = 60; // SEC-11
const DAY_MS = 24 * 60 * 60 * 1000;

export const TEXTS = {
  empty: 'Write a message',
  tooLong: `Messages can have up to ${MESSAGE_MAX.toLocaleString('en-AU')} characters`,
  emailVerified: 'Verify your email',
  displayName: 'Add your name',
  baseSuburb: 'Add your base suburb',
  intent: 'Tell us if you want to find a place, list one, or both',
  terms: 'Accept the Terms and Privacy Policy',
  inactive: 'This home is no longer available. Copy your message if you want to keep it.',
  owner: 'This is your listing',
  blocked: 'You can’t message this host',
  suspended: 'Your account is suspended, so you can’t send messages',
  phone: 'This host only takes messages from people with a verified mobile',
  dailyLimit: 'You’ve messaged 10 hosts today. You can message more tomorrow.',
  hourlyLimit: 'You’re sending messages too fast. Try again in a few minutes.',
  // The message box on the listing detail (UC-004; texts from the prototype, frontend-migration.md).
  dates: 'Add your move-in and move-out dates.',
  checkIn: 'Move-in has to be between today and a year from now.',
  checkOut: 'Move-out has to be after move-in.',
  failed: 'We couldn’t send your message. It’s still here, so you can try again.',
  enquiry: 'This is an enquiry, not a booking.',
  nudge: 'Optional: add a line about you and verify your phone. Hosts see them next to your message.',
  completeProfile: 'Complete my profile',
  confirm: 'You’re signed in. Check your message and press Send.',
};

// The heading, hints and sent state of the message box, with the host's display name.
export const BOX_TEXTS = {
  heading: (host) => `Message ${host}`,
  sendHint: (signedIn, host) => (signedIn
    ? `Sends straight to ${host}. Your dates go with the message.`
    : 'You’ll sign up or log in when you press Send. Your message stays saved.'),
  phoneHint: (host) => `${host} asks for a verified phone before the first message. Your number stays private.`,
  sent: (host) => `Message sent to ${host}`,
};

// BR-MSG-003: text only, 1 to 1000 characters after trimming. Returns the error code or null.
// Contact details are not checked: they are allowed (BR-MSG-004, AC-033-2).
export function checkMessage(text) {
  const value = String(text ?? '').trim();
  if (!value) return 'empty';
  if (value.length > MESSAGE_MAX) return 'tooLong';
  return null;
}

// BR-ACC-003 and BR-TRU-004: what the gate asks for before the first inquiry, in the same flow.
// `profile` mirrors profiles plus the auth flags: { emailVerified, phoneVerified, displayName,
// baseSuburbId, isSeeking, isHosting, termsAcceptedAt }.
export function missingProfile(profile = {}, { messageRule = 'email' } = {}) {
  const out = [];
  if (!profile.emailVerified) out.push('emailVerified');
  if (!String(profile.displayName ?? '').trim()) out.push('displayName');
  if (profile.baseSuburbId == null) out.push('baseSuburb');
  if (!profile.isSeeking && !profile.isHosting) out.push('intent');
  if (!profile.termsAcceptedAt) out.push('terms');
  if (messageRule === 'phone' && !profile.phoneVerified) out.push('phone');
  return out;
}

export function accountAgeDays(createdAt, now = new Date()) {
  return Math.floor((new Date(now) - new Date(createdAt)) / DAY_MS);
}

// BR-MSG-007: only new conversations count, and only for accounts younger than 7 days.
export function dailyLimitReached({ accountAgeDays: age, conversationsStartedToday }) {
  return age < NEW_ACCOUNT_DAYS && conversationsStartedToday >= NEW_ACCOUNT_DAILY_CONVERSATIONS;
}

// The first inquiry on a listing (UC-004 steps 5 to 8). `ctx`:
// { profile, listingStatus, isOwner, blockedByHost, messageRule, datesOk, accountAgeDays,
//   conversationsStartedToday, hasConversation }
// Returns { ok: true, append } or { ok: false, reason, missing? }. `append` means the message goes
// into the existing conversation (BR-MSG-001), which the daily limit never stops.
export function canStartConversation(ctx) {
  const missing = missingProfile(ctx.profile, { messageRule: 'email' });
  if (missing.length) return { ok: false, reason: 'profile', missing };
  if (ctx.profile.status === 'suspended') return { ok: false, reason: 'suspended' };
  if (ctx.listingStatus !== 'active') return { ok: false, reason: 'inactive' };
  if (ctx.isOwner) return { ok: false, reason: 'owner' };
  if (ctx.blockedByHost) return { ok: false, reason: 'blocked' };
  if (ctx.messageRule === 'phone' && !ctx.profile.phoneVerified) return { ok: false, reason: 'phone' };
  if (ctx.datesOk === false) return { ok: false, reason: 'dates' };
  if (ctx.hasConversation) return { ok: true, append: true };
  if (dailyLimitReached(ctx)) return { ok: false, reason: 'dailyLimit' };
  return { ok: true, append: false };
}

// BR-MSG-006 inside an existing conversation: a suspended account can read but not send, and a
// blocked person cannot continue. Neither learns about the block.
export function canReply({ status, blocked, sentLastHour = 0 }) {
  if (status === 'suspended') return { ok: false, reason: 'suspended' };
  if (blocked) return { ok: false, reason: 'blocked' };
  if (sentLastHour >= MESSAGES_PER_HOUR) return { ok: false, reason: 'hourlyLimit' };
  return { ok: true };
}

// BR-MSG-002 and AC-004-4: the warning before sending when some requested nights are not free.
// `availability` is the '1'/'0' string of listing_nights from `start`. Nights outside that window
// count as not available, since nothing promises them.
export function unavailableNights({ checkIn, checkOut }, availability, start) {
  const { nights } = nightsFromDates(checkIn, checkOut);
  return nights.filter((night) => availability[daysBetween(start, night)] !== '1');
}

export function unavailableText(count) {
  if (count <= 0) return null;
  return count === 1 ? '1 of these nights isn’t available' : `${count} of these nights aren’t available`;
}

// BR-MSG-002: the inquiry carries the dates as sent and, when there is one, a roster summary.
export function inquirySummary({ checkIn, checkOut, roster }) {
  const { totalNights } = nightsFromDates(checkIn, checkOut);
  return {
    stayFrom: checkIn,
    stayTo: checkOut,
    nights: totalNights,
    roster: roster ? `${rosterLabel(roster)} roster` : null,
  };
}

// What stops the box from sending, in the order the person reads it: the message (BR-MSG-003), then
// the dates (BR-MSG-002, same limits as the search, validateStay in core/fit.js). `today` is the
// date in the listing's time zone (BR-AVL-005). Returns a list of codes, each a key of TEXTS.
export function draftIssues({ text, checkIn, checkOut }, today) {
  const issues = [];
  const message = checkMessage(text);
  if (message) issues.push(message);
  if (!checkIn || !checkOut) issues.push('dates');
  else issues.push(...validateStay(checkIn, checkOut, today));
  return issues;
}

// AC-004-4 and BR-MSG-002: the warning above Send when some nights are taken. It never blocks.
export function conflictText(count) {
  const base = unavailableText(count);
  return base ? `${base}. You can still send it, or change your dates.` : null;
}

// "Your dates: 7 – 21 Dec · 14 nights"
export function datesLine({ checkIn, checkOut }) {
  const nights = daysBetween(checkIn, checkOut);
  return `${formatRange(checkIn, checkOut)} · ${nights} ${nights === 1 ? 'night' : 'nights'}`;
}

// The text for what start_conversation answered when it did not send. A missing profile item names
// the first one; an unknown code falls back to the generic failure, which keeps the message.
export function refusalText(result) {
  if (!result || result.ok) return null;
  if (result.reason === 'profile') return TEXTS[result.missing?.[0]] ?? TEXTS.failed;
  return TEXTS[result.reason] ?? TEXTS.failed;
}

// BR-ACC-004: after the first message, suggest photo, bio and mobile if any is missing. Never blocks.
export function showProfileNudge({ photoPath, bio, phoneVerified }) {
  return !photoPath || !String(bio ?? '').trim() || !phoneVerified;
}

// BR-ACC-005: the draft saved in the browser session while the person signs up. Only what the box
// needs; anything else in storage is ignored. Returns null when there is nothing usable.
export function parseDraft(raw, listingId) {
  let value;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object' || value.listingId !== listingId) return null;
  const date = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '');
  return {
    listingId,
    text: typeof value.text === 'string' ? value.text.slice(0, MESSAGE_MAX * 2) : '',
    checkIn: date(value.checkIn),
    checkOut: date(value.checkOut),
    pending: value.pending === true,
  };
}
