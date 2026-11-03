import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alertActive, alertDigests, alertExpiresAt, hostReminderDue, newMessageEmailDue, nextRetryAt, outcomeQuestionDue,
  removedListingPurgeDue, reportAnonymiseDue, tokenValid,
} from '../../core/schedule.js';

const T0 = '2026-12-01T10:00:00Z';
const at = (minutes) => new Date(Date.parse(T0) + minutes * 60 * 1000);
const days = (n) => at(n * 24 * 60);

test('AC-050-2 a message read before 10 minutes sends no email', () => {
  assert.equal(newMessageEmailDue({ oldestUnreadAt: T0, now: at(9) }), false);
  assert.equal(newMessageEmailDue({ oldestUnreadAt: null, now: at(30) }), false);
  assert.equal(newMessageEmailDue({ oldestUnreadAt: T0, now: at(10) }), true);
});

test('AC-050-1 three messages in 5 minutes make a single email', () => {
  // Messages at 0, 2 and 5 minutes. The run at minute 10 sends one email with all three.
  assert.equal(newMessageEmailDue({ oldestUnreadAt: at(0), now: at(10) }), true);
  // After that email, the next run sees them still unread but inside the 60-minute gap.
  assert.equal(newMessageEmailDue({ oldestUnreadAt: at(0), lastEmailAt: at(10), now: at(11) }), false);
  assert.equal(newMessageEmailDue({ oldestUnreadAt: at(0), lastEmailAt: at(10), now: at(69) }), false);
  assert.equal(newMessageEmailDue({ oldestUnreadAt: at(0), lastEmailAt: at(10), now: at(70) }), true);
});

test('BR-MAIL-001 turned off, only the first inquiry of a new conversation is sent', () => {
  assert.equal(newMessageEmailDue({ oldestUnreadAt: T0, emailsOn: false, now: at(15) }), false);
  assert.equal(newMessageEmailDue({ oldestUnreadAt: T0, emailsOn: false, firstInquiry: true, now: at(15) }), true);
});

test('AC-051-1 the host reminder goes once, 48 hours after the first inquiry, while the listing is active', () => {
  const base = { firstInquiryAt: T0, listingStatus: 'active' };
  assert.equal(hostReminderDue({ ...base, now: at(48 * 60 - 1) }), false);
  assert.equal(hostReminderDue({ ...base, now: at(48 * 60) }), true);
  assert.equal(hostReminderDue({ ...base, reminderSentAt: at(48 * 60), now: at(72 * 60) }), false);
  assert.equal(hostReminderDue({ ...base, hostRepliedAt: at(60), now: at(48 * 60) }), false);
  assert.equal(hostReminderDue({ ...base, listingStatus: 'paused', now: at(48 * 60) }), false);
  assert.equal(hostReminderDue({ ...base, emailsOn: false, now: at(48 * 60) }), false);
});

test('AC-052-1 the outcome question goes on day 14 and once per conversation', () => {
  assert.equal(outcomeQuestionDue({ firstInquiryAt: T0, now: days(13.9) }), false);
  assert.equal(outcomeQuestionDue({ firstInquiryAt: T0, now: days(14) }), true);
  assert.equal(outcomeQuestionDue({ firstInquiryAt: T0, outcomeAskedAt: days(14), now: days(15) }), false);
  assert.equal(outcomeQuestionDue({ firstInquiryAt: T0, seekerDeleted: true, now: days(14) }), false);
});

test('BR-MAIL-004 alerts last 90 days from creation or renewal', () => {
  assert.equal(alertExpiresAt(T0).toISOString(), '2027-03-01T10:00:00.000Z');
  assert.equal(alertActive(T0, days(89)), true);
  assert.equal(alertActive(T0, days(90)), false);
  assert.equal(alertActive(days(80), days(90)), true);
});

test('BR-MAIL-004 one digest per user with full and strong matches, never repeating a listing', () => {
  const matches = [
    { userId: 'u1', alertId: 'a1', listingId: 'l1', fitClass: 'full' },
    { userId: 'u1', alertId: 'a1', listingId: 'l2', fitClass: 'partial' },
    { userId: 'u1', alertId: 'a2', listingId: 'l1', fitClass: 'strong' },
    { userId: 'u1', alertId: 'a2', listingId: 'l3', fitClass: 'strong' },
    { userId: 'u2', alertId: 'a3', listingId: 'l3', fitClass: 'full' },
    { userId: 'u3', alertId: 'a4', listingId: 'l4', fitClass: 'full' },
  ];
  const digests = alertDigests(matches, { alreadySent: new Set(['a3:l3']), emailsOn: (u) => u !== 'u3' });
  assert.deepEqual([...digests.keys()], ['u1']);
  assert.deepEqual(digests.get('u1').map((m) => m.listingId), ['l1', 'l3']);
});

test('NTF-005 and NTF-006 one-tap tokens last 60 days', () => {
  assert.equal(tokenValid(T0, days(59)), true);
  assert.equal(tokenValid(T0, days(60)), false);
  assert.equal(tokenValid(days(1), T0), false);
});

test('UC-050 E1 retries at 1, 5 and 30 minutes, then gives up', () => {
  assert.deepEqual([1, 2, 3].map((n) => nextRetryAt(n, T0).toISOString()), [
    '2026-12-01T10:01:00.000Z', '2026-12-01T10:05:00.000Z', '2026-12-01T10:30:00.000Z',
  ]);
  assert.equal(nextRetryAt(4, T0), null);
});

test('BR-PRV-003 removed listings are purged after 90 days; reports anonymised after 2 years', () => {
  assert.equal(removedListingPurgeDue(T0, days(89)), false);
  assert.equal(removedListingPurgeDue(T0, days(90)), true);
  assert.equal(removedListingPurgeDue(null, days(900)), false);
  assert.equal(reportAnonymiseDue('2026-12-01T10:00:00Z', '2028-12-01T09:59:59Z'), false);
  assert.equal(reportAnonymiseDue('2026-12-01T10:00:00Z', '2028-12-01T10:00:00Z'), true);
  assert.equal(reportAnonymiseDue(null, '2030-01-01T00:00:00Z'), false);
});
