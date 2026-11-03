// When each email goes out and when each record is purged (BR-MAIL-001 to 004, BR-PRV-003,
// notifications.md rules 4 and 6). Pure: the scheduled Edge Functions read the rows, ask these
// functions and write the result, so every timing rule has one tested home.
// Times are Date objects, ISO strings or epoch milliseconds; comparisons are in UTC.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ms = (t) => (t == null ? null : new Date(t).getTime());
const elapsed = (from, now) => ms(now) - ms(from);

export const NEW_MESSAGE_DELAY_MIN = 10; // BR-MAIL-001
export const NEW_MESSAGE_GAP_MIN = 60; // BR-MAIL-001
export const HOST_REMINDER_HOURS = 48; // BR-MAIL-002
export const OUTCOME_DAYS = 14; // BR-MAIL-003
export const ALERT_DAYS = 90; // BR-MAIL-004
export const TOKEN_DAYS = 60; // notifications.md rule 4
export const RETRY_DELAYS_MIN = [1, 5, 30]; // notifications.md rule 6
export const REMOVED_LISTING_DAYS = 90; // BR-PRV-003
export const REPORT_YEARS = 2; // BR-PRV-003

// BR-MAIL-001 and UC-050. `oldestUnreadAt`: the first message the receiver has not read, or null.
// `lastEmailAt`: the last NTF-003 for this conversation and receiver. The first inquiry of a new
// conversation is always sent, even with the email turned off.
export function newMessageEmailDue({ oldestUnreadAt, lastEmailAt = null, emailsOn = true, firstInquiry = false, now }) {
  if (oldestUnreadAt == null) return false;
  if (!emailsOn && !firstInquiry) return false;
  if (elapsed(oldestUnreadAt, now) < NEW_MESSAGE_DELAY_MIN * MINUTE) return false;
  return lastEmailAt == null || elapsed(lastEmailAt, now) >= NEW_MESSAGE_GAP_MIN * MINUTE;
}

// BR-MAIL-002 and UC-051: once, 48 hours after the first inquiry without a host reply, only while
// the listing is active.
export function hostReminderDue({ firstInquiryAt, hostRepliedAt = null, reminderSentAt = null, listingStatus, emailsOn = true, now }) {
  if (!emailsOn || reminderSentAt != null || hostRepliedAt != null) return false;
  if (listingStatus !== 'active') return false;
  return elapsed(firstInquiryAt, now) >= HOST_REMINDER_HOURS * HOUR;
}

// BR-MAIL-003 and UC-052: once per conversation, from day 14 after the first inquiry. NTF-005 has
// no off switch (it is not in the unsubscribable list), but a deleted account gets nothing.
export function outcomeQuestionDue({ firstInquiryAt, outcomeAskedAt = null, seekerDeleted = false, now }) {
  if (seekerDeleted || outcomeAskedAt != null) return false;
  return elapsed(firstInquiryAt, now) >= OUTCOME_DAYS * DAY;
}

// BR-MAIL-004: an alert lives 90 days from its creation or last renewal.
export function alertExpiresAt(renewedAt) {
  return new Date(ms(renewedAt) + ALERT_DAYS * DAY);
}

export function alertActive(renewedAt, now) {
  return ms(now) < ms(alertExpiresAt(renewedAt));
}

// BR-MAIL-004 and UC-053: one digest per user per run, with the full and strong matches of their
// active alerts, never repeating a listing already sent to the same alert. Each match:
// { userId, alertId, listingId, fitClass }. `alreadySent` is a Set of `${alertId}:${listingId}`.
// Returns Map userId -> matches, in the order received, one entry per listing per user.
export function alertDigests(matches, { alreadySent = new Set(), emailsOn = () => true } = {}) {
  const out = new Map();
  for (const m of matches) {
    if (m.fitClass !== 'full' && m.fitClass !== 'strong') continue;
    if (alreadySent.has(`${m.alertId}:${m.listingId}`)) continue;
    if (!emailsOn(m.userId)) continue;
    const list = out.get(m.userId) ?? [];
    if (!list.some((x) => x.listingId === m.listingId)) list.push(m);
    out.set(m.userId, list);
  }
  return out;
}

// notifications.md rule 4: one-tap tokens (NTF-005, NTF-006) last 60 days.
export function tokenValid(issuedAt, now) {
  const age = elapsed(issuedAt, now);
  return age >= 0 && age < TOKEN_DAYS * DAY;
}

// notifications.md rule 6: retries at 1, 5 and 30 minutes after each failure, then give up.
// `attempt` is how many sends already failed (1 after the first failure).
export function nextRetryAt(attempt, failedAt) {
  const delay = RETRY_DELAYS_MIN[attempt - 1];
  return delay == null ? null : new Date(ms(failedAt) + delay * MINUTE);
}

// BR-PRV-003: removed listings are deleted 90 days after removal.
export function removedListingPurgeDue(removedAt, now) {
  return removedAt != null && elapsed(removedAt, now) >= REMOVED_LISTING_DAYS * DAY;
}

// BR-PRV-003: reports and the moderation log are anonymised 2 calendar years after closing.
export function reportAnonymiseDue(closedAt, now) {
  if (closedAt == null) return false;
  const limit = new Date(ms(closedAt));
  limit.setUTCFullYear(limit.getUTCFullYear() + REPORT_YEARS);
  return ms(now) >= limit.getTime();
}
