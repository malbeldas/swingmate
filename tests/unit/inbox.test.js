import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DELETED_USER, TEXTS, addMessage, conversationHead, dayLabel, inquirerView, listItem, messageGroups, relativeWhen,
  replyErrorText, requestedFit, timeLabel,
} from '../../core/inbox.js';

const TZ = 'Australia/Perth'; // UTC+8, no daylight saving
const NOW = new Date('2026-11-04T10:00:00+08:00'); // a Wednesday

const row = (over = {}) => ({
  id: 'c1', listing_id: 'l1', listing_title: 'Sunny room', listing_status: 'active', suburb_name: 'Baldivis',
  cover_path: null, role: 'seeker', other_name: 'Ruth', other_photo_path: null, stay_from: '2026-12-07',
  stay_to: '2026-12-21', roster_summary: '14:7 roster', last_message_at: '2026-11-04T09:15:00+08:00',
  last_body: 'Yes, it is free', last_from_me: false, unread: true, ...over,
});

test('UC-023 the list says when, in the viewer’s days', () => {
  assert.equal(relativeWhen('2026-11-04T09:59:40+08:00', NOW, TZ), 'Just now');
  assert.equal(relativeWhen('2026-11-04T09:15:00+08:00', NOW, TZ), '45 min ago');
  assert.equal(relativeWhen('2026-11-04T01:00:00+08:00', NOW, TZ), '9 h ago');
  assert.equal(relativeWhen('2026-11-03T23:30:00+08:00', NOW, TZ), 'Yesterday');
  assert.equal(relativeWhen('2026-11-02T12:00:00+08:00', NOW, TZ), 'Mon');
  assert.equal(relativeWhen('2026-10-20T12:00:00+08:00', NOW, TZ), '20 Oct');
});

test('UC-023 a row shows the other person, the dates, the last message and unread', () => {
  assert.deepEqual(listItem(row(), NOW, TZ), {
    id: 'c1', name: 'Ruth', initial: 'R', title: 'Sunny room', when: '45 min ago', dates: '7 – 21 Dec',
    preview: 'Yes, it is free', unread: true,
  });
  assert.equal(listItem(row({ last_from_me: true }), NOW, TZ).preview, 'You: Yes, it is free');
  // BR-ACC-007 and UC-023 E1
  assert.equal(listItem(row({ other_name: null }), NOW, TZ).name, DELETED_USER);
});

test('BR-MSG-005 a listing no longer active keeps the conversation open with its status', () => {
  assert.deepEqual(conversationHead(row({ listing_status: 'filled' })), {
    heading: 'Ruth · Sunny room', banner: 'This listing is filled', requested: 'Requested dates: 7 – 21 Dec · 14 nights',
    canWrite: true, closedText: null,
  });
  assert.equal(conversationHead(row({ listing_status: 'paused' })).banner, 'This listing is paused');
  assert.equal(conversationHead(row({ listing_status: 'active' })).banner, null);
});

test('BR-MSG-005 a listing hidden by SwingMate closes the conversation for the seeker only', () => {
  const seeker = conversationHead(row({ listing_status: 'hidden' }));
  assert.equal(seeker.canWrite, false);
  assert.equal(seeker.closedText, 'This listing was removed by SwingMate');
  assert.equal(conversationHead(row({ listing_status: 'hidden', role: 'host' })).canWrite, true);
});

test('UC-023 E1 nobody can reply to a deleted account', () => {
  const head = conversationHead(row({ other_name: null, role: 'host' }));
  assert.equal(head.heading, 'Deleted user · Sunny room');
  assert.equal(head.canWrite, false);
  assert.equal(head.closedText, TEXTS.deleted);
});

test('AC-023-2 the requested nights against the calendar today', () => {
  assert.deepEqual(requestedFit('1111111', '2026-12-07'), { tone: 'good', text: 'Your place is free for all 7 nights.' });
  assert.deepEqual(requestedFit('1110011', '2026-12-07'), { tone: 'warn', text: '5 of 7 nights free. Taken: 10 – 11 Dec.' });
  assert.deepEqual(requestedFit('0111110', '2026-12-07'), { tone: 'warn', text: '5 of 7 nights free. Taken: 7 Dec, 13 Dec.' });
  assert.equal(requestedFit('', '2026-12-07'), null);
});

test('AC-023-1 the card has name, base, work type, roster, verifications, age and activity, never contact details', () => {
  const card = {
    display_name: 'Kai', photo_path: null, bio: 'Quiet, on site most of the month.', work_type: 'fifo',
    base_suburb: 'New Town, TAS', created_at: '2026-11-02T00:00:00Z', email_verified: true, phone_verified: true,
    roster_pattern: { days_on: 8, days_off: 6 }, hosts_this_month: 1, stay_from: '2026-12-07', stay_to: '2026-12-14', nights: '1111111',
    email: 'kai@example.com', phone: '61400000005',
  };
  const view = inquirerView(card, NOW);
  assert.equal(view.name, 'Kai');
  assert.equal(view.line, 'FIFO · Based in New Town, TAS · 8:6 roster · Email and phone verified');
  assert.deepEqual(view.badges.map((b) => b.text), ['✓ Email verified', '✓ Phone verified', 'No photo yet']);
  assert.equal(view.since, 'Member since Nov 2026');
  assert.equal(view.activity, 'New member · first message');
  assert.equal(view.bio, 'Quiet, on site most of the month.');
  assert.equal(view.fit.tone, 'good');
  assert.doesNotMatch(JSON.stringify(view), /kai@example|61400000005/);
  assert.equal(inquirerView(null), null);
});

test('UC-033 messages are grouped by day, mine apart, and an inquiry shows its dates', () => {
  const messages = [
    { id: 'm2', sender_id: 'host', kind: 'text', body: 'Yes!', created_at: '2026-11-04T09:15:00+08:00' },
    { id: 'm1', sender_id: 'me', kind: 'inquiry', body: 'Free?', stay_from: '2026-12-07', stay_to: '2026-12-21', created_at: '2026-11-03T20:05:00+08:00' },
  ];
  const groups = messageGroups(messages, 'me', NOW, TZ);
  assert.deepEqual(groups.map((g) => g.label), ['Yesterday', 'Today']);
  assert.deepEqual(groups[0].messages[0], { id: 'm1', mine: true, body: 'Free?', time: '8:05 pm', dates: '7 – 21 Dec · 14 nights' });
  assert.equal(groups[1].messages[0].mine, false);
  assert.equal(groups[1].messages[0].dates, null);
  assert.equal(dayLabel('2026-10-28T10:00:00+08:00', NOW, TZ), '28 Oct');
  assert.equal(timeLabel('2026-11-04T09:15:00+08:00', TZ), '9:15 am');
});

test('AC-033-1 a message that arrives twice, from the insert and from Realtime, shows once', () => {
  const one = { id: 'm1' };
  assert.equal(addMessage([one], { id: 'm1' }).length, 1);
  assert.equal(addMessage([one], { id: 'm2' }).length, 2);
});

test('BR-MSG-006 a refused reply never says it was a block', () => {
  assert.equal(replyErrorText({ message: 'blocked' }), TEXTS.cantSend);
  assert.doesNotMatch(TEXTS.cantSend, /block/i);
  assert.equal(replyErrorText({ message: 'suspended' }), TEXTS.suspended);
  assert.equal(replyErrorText({ message: 'Failed to fetch' }), TEXTS.failed);
  assert.equal(replyErrorText(null), TEXTS.failed);
});
