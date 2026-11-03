import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoster } from '../../core/roster.js';
import {
  accountAgeDays, BOX_TEXTS, canReply, canStartConversation, checkMessage, conflictText, dailyLimitReached, datesLine,
  draftIssues, inquirySummary, MESSAGE_MAX, missingProfile, parseDraft, refusalText, showProfileNudge, TEXTS,
  unavailableNights, unavailableText,
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

test('BR-MSG-002 the box needs a message and valid dates before sending', () => {
  const today = '2026-11-03';
  assert.deepEqual(draftIssues({ text: 'Hi', checkIn: '2026-11-10', checkOut: '2026-11-24' }, today), []);
  assert.deepEqual(draftIssues({ text: ' ', checkIn: '2026-11-10', checkOut: '2026-11-24' }, today), ['empty']);
  assert.deepEqual(draftIssues({ text: 'Hi', checkIn: '', checkOut: '' }, today), ['dates']);
  assert.deepEqual(draftIssues({ text: 'Hi', checkIn: '2026-11-01', checkOut: '2026-11-24' }, today), ['checkIn']);
  assert.deepEqual(draftIssues({ text: 'Hi', checkIn: '2026-11-10', checkOut: '2026-11-10' }, today), ['checkOut']);
  assert.deepEqual(draftIssues({ text: 'x'.repeat(MESSAGE_MAX + 1), checkIn: '', checkOut: '' }, today), ['tooLong', 'dates']);
  for (const code of ['empty', 'tooLong', 'dates', 'checkIn', 'checkOut']) assert.ok(TEXTS[code], code);
});

test('AC-004-4 taken nights warn but never block', () => {
  assert.equal(conflictText(0), null);
  assert.equal(conflictText(1), '1 of these nights isn’t available. You can still send it, or change your dates.');
  assert.equal(conflictText(3), '3 of these nights aren’t available. You can still send it, or change your dates.');
  // The warning is not one of the issues that stop the box.
  assert.deepEqual(draftIssues({ text: 'Hi', checkIn: '2026-11-10', checkOut: '2026-11-24' }, '2026-11-03'), []);
});

test('UC-004 the sent state shows the dates and their nights', () => {
  assert.equal(datesLine({ checkIn: '2026-12-07', checkOut: '2026-12-21' }), '7 – 21 Dec · 14 nights');
  assert.equal(datesLine({ checkIn: '2026-11-30', checkOut: '2026-12-01' }), '30 Nov – 1 Dec · 1 night');
  assert.equal(BOX_TEXTS.sent('Hana'), 'Message sent to Hana');
  assert.match(BOX_TEXTS.sendHint(false, 'Hana'), /sign up or log in when you press Send/);
  assert.match(BOX_TEXTS.sendHint(true, 'Hana'), /^Sends straight to Hana/);
});

test('UC-004 E1 to E3 every refusal of start_conversation has its words', () => {
  assert.equal(refusalText({ ok: true }), null);
  assert.equal(refusalText({ ok: false, reason: 'profile', missing: ['terms', 'baseSuburb'] }), TEXTS.terms);
  assert.equal(refusalText({ ok: false, reason: 'inactive' }), TEXTS.inactive);
  // E3: the same words as any host you can't message, never "blocked".
  assert.equal(refusalText({ ok: false, reason: 'blocked' }), 'You can’t message this host');
  assert.doesNotMatch(refusalText({ ok: false, reason: 'blocked' }), /block/i);
  assert.equal(refusalText({ ok: false, reason: 'dailyLimit' }), TEXTS.dailyLimit);
  assert.equal(refusalText({ ok: false, reason: 'something new' }), TEXTS.failed);
  for (const reason of ['empty', 'tooLong', 'suspended', 'owner', 'phone', 'dates']) {
    assert.ok(refusalText({ ok: false, reason }), reason);
  }
});

test('UC-004 the order of checks matches start_conversation, dates after the host rule', () => {
  assert.deepEqual(canStartConversation(ctx({ datesOk: false })), { ok: false, reason: 'dates' });
  assert.equal(canStartConversation(ctx({ datesOk: false, blockedByHost: true })).reason, 'blocked');
  assert.equal(canStartConversation(ctx({ datesOk: false, accountAgeDays: 1, conversationsStartedToday: 10 })).reason, 'dates');
});

test('BR-ACC-004 after sending, suggest photo, bio and mobile only when one is missing', () => {
  assert.equal(showProfileNudge({ photoPath: 'a/b.jpg', bio: 'Quiet and tidy', phoneVerified: true }), false);
  assert.equal(showProfileNudge({ photoPath: null, bio: 'Quiet and tidy', phoneVerified: true }), true);
  assert.equal(showProfileNudge({ photoPath: 'a/b.jpg', bio: ' ', phoneVerified: true }), true);
  assert.equal(showProfileNudge({ photoPath: 'a/b.jpg', bio: 'Quiet', phoneVerified: false }), true);
});

test('AC-004-2 the saved draft comes back only for its own listing', () => {
  const raw = JSON.stringify({ listingId: 'L1', text: 'Hi Hana', checkIn: '2026-12-07', checkOut: '2026-12-21', pending: true });
  assert.deepEqual(parseDraft(raw, 'L1'), { listingId: 'L1', text: 'Hi Hana', checkIn: '2026-12-07', checkOut: '2026-12-21', pending: true });
  assert.equal(parseDraft(raw, 'L2'), null);
  assert.equal(parseDraft('not json', 'L1'), null);
  assert.equal(parseDraft(null, 'L1'), null);
  assert.deepEqual(parseDraft(JSON.stringify({ listingId: 'L1', text: 5, checkIn: 'soon', email: 'a@b.c' }), 'L1'),
    { listingId: 'L1', text: '', checkIn: '', checkOut: '', pending: false });
});
