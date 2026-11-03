import { rosterLabel } from './roster.js';

// Profile rules and the trust facts each side sees (UC-032, BR-ACC-003/004, BR-TRU-001 to 003).

export const DISPLAY_NAME_MAX = 40; // profiles.display_name
export const BIO_MAX = 300; // BR-ACC-004
export const WORK_TYPES = ['fifo', 'dido', 'bibo', 'other'];
export const NEW_MEMBER_DAYS = 7; // same window as BR-MSG-007
export const RESPONSE_TIME_MIN_CONVERSATIONS = 5; // BR-TRU-002
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const TEXTS = {
  displayName: 'Add your name',
  displayNameTooLong: `Your name can have up to ${DISPLAY_NAME_MAX} characters`,
  baseSuburb: 'Choose your base suburb from the list',
  bioTooLong: `Your bio can have up to ${BIO_MAX} characters`,
  workType: 'Choose FIFO, DIDO, BIBO or other',
};

// AC-032-1: the name cannot be empty and the base suburb must come from the list. `isSuburb` checks
// an id against the suburbs dataset (INT-006); the page passes it, so this stays pure.
export function profileIssues(profile = {}, { isSuburb = () => true } = {}) {
  const out = [];
  const name = String(profile.displayName ?? '').trim();
  if (!name) out.push('displayName');
  else if (name.length > DISPLAY_NAME_MAX) out.push('displayNameTooLong');
  if (profile.baseSuburbId == null || !isSuburb(profile.baseSuburbId)) out.push('baseSuburb');
  if (String(profile.bio ?? '').trim().length > BIO_MAX) out.push('bioTooLong');
  if (profile.workType != null && !WORK_TYPES.includes(profile.workType)) out.push('workType');
  return out;
}

// BR-TRU-003 and regla hard 3: the only profile fields that may reach another person. Email, phone
// number, employer, work site and exact address are never copied, whatever the input carries.
const PUBLIC_FIELDS = ['id', 'displayName', 'photoPath', 'bio', 'baseSuburbId', 'workType', 'createdAt'];

export function toPublicProfile(profile = {}) {
  const out = {};
  for (const key of PUBLIC_FIELDS) if (profile[key] !== undefined) out[key] = profile[key];
  out.emailVerified = Boolean(profile.emailVerified);
  out.phoneVerified = Boolean(profile.phoneVerified);
  out.roster = profile.roster ? rosterLabel(profile.roster) : null;
  return out;
}

export function memberSince(createdAt) {
  const d = new Date(createdAt);
  return `Member since ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function isNewMember(createdAt, now) {
  return new Date(now) - new Date(createdAt) < NEW_MEMBER_DAYS * DAY_MS;
}

// BR-TRU-001: the activity line the host sees, e.g. "New member · first message" or
// "Messaged 2 hosts this month". `hostsThisMonth` counts this inquiry too.
export function seekerActivity({ createdAt, hostsThisMonth, now }) {
  const parts = [];
  if (isNewMember(createdAt, now)) parts.push('New member');
  if (hostsThisMonth <= 1) parts.push('first message');
  else parts.push(`Messaged ${hostsThisMonth} hosts this month`);
  const line = parts.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

// design-system.md badges: verified in teal-soft, missing in sand.
export function trustBadges({ emailVerified, phoneVerified, hasPhoto }) {
  const out = [];
  if (emailVerified) out.push({ tone: 'verified', text: '✓ Email verified' });
  if (phoneVerified) out.push({ tone: 'verified', text: '✓ Phone verified' });
  if (!hasPhoto) out.push({ tone: 'missing', text: 'No photo yet' });
  return out;
}

// BR-TRU-002: usual response time, only with at least 5 answered conversations. Median of the
// minutes from first inquiry to first host reply.
export function responseTimeText(minutes) {
  const answered = (minutes ?? []).filter((m) => Number.isFinite(m) && m >= 0).sort((a, b) => a - b);
  if (answered.length < RESPONSE_TIME_MIN_CONVERSATIONS) return null;
  const mid = Math.floor(answered.length / 2);
  const median = answered.length % 2 ? answered[mid] : (answered[mid - 1] + answered[mid]) / 2;
  if (median <= 60) return 'Usually replies within an hour';
  if (median <= 6 * 60) return 'Usually replies within a few hours';
  if (median <= 24 * 60) return 'Usually replies within a day';
  return 'Usually replies within a few days';
}

// BR-TRU-002: the host block on the listing detail.
export function hostFacts({ displayName, phoneVerified, createdAt, livesOnsite, roster, responseMinutes }) {
  const lines = [];
  if (phoneVerified) lines.push('Phone verified host');
  lines.push(memberSince(createdAt));
  if (livesOnsite) lines.push('Lives here');
  else if (roster) lines.push(`${rosterLabel(roster)} roster`);
  const response = responseTimeText(responseMinutes);
  if (response) lines.push(response);
  return { name: displayName, lines };
}
