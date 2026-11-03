import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoster } from '../../core/roster.js';
import {
  accountAgeDays, canReply, canStartConversation, checkMessage, dailyLimitReached, inquirySummary, MESSAGE_MAX,
  missingProfile, TEXTS, unavailableNights, unavailableText,
} from '../../core/messaging.js';

const READY = {
  emailVerified: true, phoneVerified: false, displayName: 'Sam', baseSuburbId: 12, isSeeking: true,
  isHosting: false, termsAcceptedAt: '2026-11-01T10:00:00Z', status: 'active',
};
const ctx = (over = {}) => ({
  profile: READY, listingStatus: 'active', isOwner: false, blockedByHost: false, messageRule: 'email',
  accountAgeDays: 30, conversationsStartedToday: 0, hasConversation: false, ...over,
});

test('BR-MSG-003 messages are text of 1 to 1000 characters', () => {
  assert.equal(checkMessage('Hi, is the room free in December?'), null);
  assert.equal(checkMessage('   '), 'empty');
  assert.equal(checkMessage('x'.repeat(MESSAGE_MAX)), null);
  assert.equal(checkMessage('x'.repeat(MESSAGE_MAX + 1)), 'tooLong');
  assert.equal(TEXTS.tooLong, 'Messages can have up to 1,000 characters');
});

test('AC-033-2 a message with a phone number or email is accepted unchanged', () => {
  assert.equal(checkMessage('Call me on 0412 345 678 or sam@example.com'), null);
});

test('AC-004-3 without name, base suburb, intent or Terms the message is not sent', () => {
  assert.deepEqual(missingProfile(READY), []);
  assert.deepEqual(missingProfile({}), ['emailVerified', 'displayName', 'baseSuburb', 'intent', 'terms']);
  assert.deepEqual(missingProfile({ ...READY, displayName: '  ' }), ['displayName']);
  assert.deepEqual(missingProfile({ ...READY, isSeeking: false, isHosting: true }), []);
  const result = canStartConversation(ctx({ profile: { ...READY, termsAcceptedAt: null } }));
  assert.deepEqual(result, { ok: false, reason: 'profile', missing: ['terms'] });
});

test('AC-004-6 a host who only takes verified mobiles asks for one, and accepts it once verified', () => {
  assert.deepEqual(canStartConversation(ctx({ messageRule: 'phone' })), { ok: false, reason: 'phone' });
  assert.deepEqual(missingProfile(READY, { messageRule: 'phone' }), ['phone']);
  const verified = { ...READY, phoneVerified: true };
  assert.deepEqual(canStartConversation(ctx({ messageRule: 'phone', profile: verified })), { ok: true, append: false });
});

test('AC-004-5 a second message on the same listing goes into the existing conversation', () => {
  assert.deepEqual(canStartConversation(ctx({ hasConversation: true })), { ok: true, append: true });
});

test('AC-004-7 an account under 7 days cannot start an 11th conversation in a day, but can still reply', () => {
  assert.equal(dailyLimitReached({ accountAgeDays: 6, conversationsStartedToday: 9 }), false);
  assert.equal(dailyLimitReached({ accountAgeDays: 6, conversationsStartedToday: 10 }), true);
  assert.equal(dailyLimitReached({ accountAgeDays: 7, conversationsStartedToday: 50 }), false);
  assert.deepEqual(canStartConversation(ctx({ accountAgeDays: 2, conversationsStartedToday: 10 })), { ok: false, reason: 'dailyLimit' });
  assert.deepEqual(canStartConversation(ctx({ accountAgeDays: 2, conversationsStartedToday: 10, hasConversation: true })), { ok: true, append: true });
  assert.equal(accountAgeDays('2026-11-01T00:00:00Z', '2026-11-07T23:59:59Z'), 6);
  assert.equal(accountAgeDays('2026-11-01T00:00:00Z', '2026-11-08T00:00:00Z'), 7);
});

test('UC-004 E1 and E3 an inactive listing or a block stop the inquiry; the block is not named', () => {
  for (const status of ['paused', 'filled', 'hidden', 'removed', 'draft']) {
    assert.deepEqual(canStartConversation(ctx({ listingStatus: status })), { ok: false, reason: 'inactive' }, status);
  }
  assert.deepEqual(canStartConversation(ctx({ blockedByHost: true })), { ok: false, reason: 'blocked' });
  assert.equal(TEXTS.blocked, 'You can’t message this host');
  assert.doesNotMatch(TEXTS.blocked, /block/i);
});

test('BR-LST-008 the owner cannot message their own listing', () => {
  assert.deepEqual(canStartConversation(ctx({ isOwner: true })), { ok: false, reason: 'owner' });
});

test('BR-MSG-006 a suspended account cannot send, and a blocked person cannot continue', () => {
  assert.deepEqual(canStartConversation(ctx({ profile: { ...READY, status: 'suspended' } })), { ok: false, reason: 'suspended' });
  assert.deepEqual(canReply({ status: 'suspended' }), { ok: false, reason: 'suspended' });
  assert.deepEqual(canReply({ status: 'active', blocked: true }), { ok: false, reason: 'blocked' });
  assert.deepEqual(canReply({ status: 'active' }), { ok: true });
});

test('SEC-11 up to 60 messages per hour', () => {
  assert.deepEqual(canReply({ status: 'active', sentLastHour: 59 }), { ok: true });
  assert.deepEqual(canReply({ status: 'active', sentLastHour: 60 }), { ok: false, reason: 'hourlyLimit' });
});

test('AC-004-4 dates with unavailable nights show the warning and still allow sending', () => {
  // From 1 Dec: nights 1-3 free, 4-5 taken, the rest free.
  const availability = '1110011111';
  const stay = { checkIn: '2026-12-01', checkOut: '2026-12-08' };
  assert.deepEqual(unavailableNights(stay, availability, '2026-12-01'), ['2026-12-04', '2026-12-05']);
  assert.equal(unavailableText(2), '2 of these nights aren’t available');
  assert.equal(unavailableText(1), '1 of these nights isn’t available');
  assert.equal(unavailableText(0), null);
  // Nights past the known window are not promised.
  assert.deepEqual(unavailableNights({ checkIn: '2026-12-09', checkOut: '2026-12-12' }, availability, '2026-12-01'),
    ['2026-12-11']);
});

test('BR-MSG-002 the inquiry keeps the dates as sent and a roster summary', () => {
  const roster = makeRoster({ daysOn: 14, daysOff: 7, anchor: '2026-11-02' });
  assert.deepEqual(inquirySummary({ checkIn: '2026-12-01', checkOut: '2026-12-08', roster }), {
    stayFrom: '2026-12-01', stayTo: '2026-12-08', nights: 7, roster: '14:7 roster',
  });
  assert.equal(inquirySummary({ checkIn: '2026-12-01', checkOut: '2026-12-08' }).roster, null);
});
