import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoster } from '../../core/roster.js';
import {
  hostFacts, isNewMember, memberSince, profileIssues, responseTimeText, seekerActivity, toPublicProfile, trustBadges, publicCardLine, publicBioText, WORK_TYPE_LABELS,
  BEFORE_YOU_AGREE,
} from '../../core/trust.js';

const ROSTER = makeRoster({ daysOn: 8, daysOff: 6, anchor: '2026-11-02' });

test('AC-032-1 the name cannot be empty and the base suburb must come from the list', () => {
  const isSuburb = (id) => [12, 13].includes(id);
  assert.deepEqual(profileIssues({ displayName: 'Sam', baseSuburbId: 12 }, { isSuburb }), []);
  assert.deepEqual(profileIssues({ displayName: '  ', baseSuburbId: 99 }, { isSuburb }), ['displayName', 'baseSuburb']);
  assert.deepEqual(profileIssues({ displayName: 'x'.repeat(41), baseSuburbId: 12 }, { isSuburb }), ['displayNameTooLong']);
  assert.deepEqual(profileIssues({ displayName: 'Sam' }), ['baseSuburb']);
});

test('BR-ACC-004 bio up to 300 characters and work type from the list', () => {
  const ok = { displayName: 'Sam', baseSuburbId: 1 };
  assert.deepEqual(profileIssues({ ...ok, bio: 'x'.repeat(300), workType: 'fifo' }), []);
  assert.deepEqual(profileIssues({ ...ok, bio: 'x'.repeat(301), workType: 'shift' }), ['bioTooLong', 'workType']);
});

test('BR-TRU-003 email, phone, employer, work site and address never reach another person', () => {
  const row = {
    id: 'u1', displayName: 'Sam', photoPath: null, bio: 'Hi', baseSuburbId: 12, workType: 'fifo',
    createdAt: '2026-10-01T00:00:00Z', emailVerified: true, phoneVerified: true, roster: ROSTER,
    email: 'sam@example.com', phone: '+61412345678', employer: 'Example Mining', workSite: 'Example site',
    address: '1 Example St',
  };
  const out = toPublicProfile(row);
  const json = JSON.stringify(out);
  for (const secret of ['sam@example.com', '+61412345678', 'Example Mining', 'Example site', '1 Example St']) {
    assert.equal(json.includes(secret), false, secret);
  }
  assert.deepEqual(Object.keys(out).sort(), [
    'baseSuburbId', 'bio', 'createdAt', 'displayName', 'emailVerified', 'id', 'phoneVerified', 'photoPath', 'roster', 'workType',
  ]);
  assert.equal(out.roster, '8:6');
});

test('BR-TRU-001 the host sees how new the person is and how many hosts they messaged', () => {
  const now = '2026-11-03T12:00:00Z';
  assert.equal(seekerActivity({ createdAt: '2026-11-01T00:00:00Z', hostsThisMonth: 1, now }), 'New member · first message');
  assert.equal(seekerActivity({ createdAt: '2026-09-01T00:00:00Z', hostsThisMonth: 2, now }), 'Messaged 2 hosts this month');
  assert.equal(seekerActivity({ createdAt: '2026-09-01T00:00:00Z', hostsThisMonth: 1, now }), 'First message');
  assert.equal(seekerActivity({ createdAt: '2026-11-01T00:00:00Z', hostsThisMonth: 3, now }), 'New member · Messaged 3 hosts this month');
  assert.equal(isNewMember('2026-10-27T12:00:00Z', now), false);
  assert.equal(memberSince('2026-10-29T14:00:00Z'), 'Member since Oct 2026');
});

test('BR-TRU-001 badges: verified email and phone, and "No photo yet"', () => {
  assert.deepEqual(trustBadges({ emailVerified: true, phoneVerified: true, hasPhoto: true }).map((b) => b.text),
    ['✓ Email verified', '✓ Phone verified']);
  assert.deepEqual(trustBadges({ emailVerified: true, phoneVerified: false, hasPhoto: false }),
    [{ tone: 'verified', text: '✓ Email verified' }, { tone: 'missing', text: 'No photo yet' }]);
});

test('BR-TRU-002 the response time shows only with at least 5 answered conversations', () => {
  assert.equal(responseTimeText([10, 20, 30, 40]), null);
  assert.equal(responseTimeText([10, 20, 30, 40, 50]), 'Usually replies within an hour');
  assert.equal(responseTimeText([30, 120, 200, 300, 2000]), 'Usually replies within a few hours');
  assert.equal(responseTimeText([600, 700, 800, 900, 1000, 3000]), 'Usually replies within a day');
  assert.equal(responseTimeText([3000, 3000, 3000, 3000, 3000]), 'Usually replies within a few days');
});

test('BR-TRU-002 the host block: phone verified, member since, lives here or roster', () => {
  const base = { displayName: 'Jo', phoneVerified: true, createdAt: '2026-10-29T00:00:00Z' };
  assert.deepEqual(hostFacts({ ...base, livesOnsite: true, roster: ROSTER }), {
    name: 'Jo', lines: ['Phone verified host', 'Member since Oct 2026', 'Lives here'],
  });
  assert.deepEqual(hostFacts({ ...base, livesOnsite: false, roster: ROSTER, responseMinutes: [5, 5, 5, 5, 5] }).lines,
    ['Phone verified host', 'Member since Oct 2026', '8:6 roster', 'Usually replies within an hour']);
});

test('BR-ACC-004 and BR-TRU-003 the line hosts see carries only public facts', () => {
  assert.equal(
    publicCardLine({ workType: 'fifo', baseSuburb: 'Rockingham, WA', roster: { daysOn: 14, daysOff: 7 }, phoneVerified: false }),
    'FIFO · Based in Rockingham, WA · 14:7 roster · Email verified',
  );
  assert.equal(publicCardLine({ workType: null, baseSuburb: '', roster: null, phoneVerified: true }), 'Email and phone verified');
  assert.equal(publicCardLine({ workType: 'other', baseSuburb: 'Baldivis, WA' }), 'Shift work · Based in Baldivis, WA · Email verified');
  assert.equal(publicBioText('  '), 'No bio yet. A line about you helps hosts say yes.');
  assert.equal(publicBioText(' Quiet and tidy '), 'Quiet and tidy');
  assert.deepEqual(Object.keys(WORK_TYPE_LABELS), ['fifo', 'dido', 'bibo', 'other']);
});

test('BR-TRU-008 "Before you agree" has the four fixed tips, in the order of the rule', () => {
  assert.equal(BEFORE_YOU_AGREE.title, 'Before you agree');
  assert.equal(BEFORE_YOU_AGREE.tips.length, 4);
  assert.match(BEFORE_YOU_AGREE.tips[0], /video call, before you pay/);
  assert.match(BEFORE_YOU_AGREE.tips[1], /ID only in person, never in the chat/);
  assert.match(BEFORE_YOU_AGREE.tips[2], /in writing/);
  assert.match(BEFORE_YOU_AGREE.tips[3], /WA Bond Administrator/);
});
