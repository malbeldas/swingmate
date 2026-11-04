import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS_BY_TARGET, canReadConversation, checkAction, checkReport, REPORT_REASONS, REPORT_THANKS, reportQueue,
  REPORT_TEXTS, reportErrorText, reportIssue, ADMIN_TEXTS, actResultText, actionIssue, adminActions, adminQueue, ageText, isAdmin,
  SEARCH_TEXTS, listingLine, logEntries, moderateResultText, personLine, recordActionIssue, recordActions, searchIssue, statusLabel,
} from '../../core/moderation.js';

test('BR-TRU-005 a report has a reason from the list and up to 500 characters of detail', () => {
  assert.deepEqual(Object.values(REPORT_REASONS), [
    'Scam or asking for money', 'Fake listing or photos', 'Offensive or discriminatory', 'Unsafe behaviour', 'Spam', 'Other',
  ]);
  assert.deepEqual(checkReport({ targetType: 'listing', reason: 'scam', details: 'x'.repeat(500) }), []);
  assert.deepEqual(checkReport({ targetType: 'listing', reason: 'rude', details: 'x'.repeat(501) }), ['reason', 'details']);
  assert.deepEqual(checkReport({ targetType: 'photo', reason: 'spam' }), ['targetType']);
  assert.deepEqual(checkReport({ targetType: 'conversation', reason: 'constructor' }), ['reason']);
  assert.equal(REPORT_THANKS, 'Thanks, we’ll review this within 24 hours');
});

test('AC-040-1 no action is applied without a note', () => {
  assert.deepEqual(checkAction({ action: 'hide_listing', targetType: 'listing', note: 'Stolen photos, confirmed' }), []);
  assert.deepEqual(checkAction({ action: 'hide_listing', targetType: 'listing', note: '  ' }), ['note']);
  assert.deepEqual(checkAction({ action: 'suspend_user', targetType: 'user', note: 'ok' }), ['note']);
});

test('BR-ADM-001 actions match the reported object', () => {
  assert.deepEqual(checkAction({ action: 'hide_listing', targetType: 'user', note: 'Spam account' }), ['action']);
  assert.deepEqual(checkAction({ action: 'read_conversation', targetType: 'listing', note: 'Check' }), ['action']);
  for (const target of Object.keys(ACTIONS_BY_TARGET)) assert.ok(ACTIONS_BY_TARGET[target].includes('dismiss'), target);
});

test('AC-040-2 an admin cannot read a conversation without an open report', () => {
  const reports = [
    { targetType: 'conversation', targetId: 'c1', status: 'open' },
    { targetType: 'conversation', targetId: 'c2', status: 'closed' },
    { targetType: 'user', targetId: 'c3', status: 'open' },
  ];
  assert.equal(canReadConversation('c1', reports), true);
  assert.equal(canReadConversation('c2', reports), false);
  assert.equal(canReadConversation('c3', reports), false);
  assert.equal(canReadConversation('c1', []), false);
});

test('AC-034-2 and UC-040 A1 the queue groups reports of the same object, oldest first, and flags 24 h', () => {
  const now = '2026-12-02T12:00:00Z';
  const reports = [
    { id: 'r1', targetType: 'listing', targetId: 'l1', reason: 'fake', status: 'open', createdAt: '2026-12-02T09:00:00Z' },
    { id: 'r2', targetType: 'user', targetId: 'u1', reason: 'spam', status: 'open', createdAt: '2026-12-01T10:00:00Z' },
    { id: 'r3', targetType: 'listing', targetId: 'l1', reason: 'scam', status: 'open', createdAt: '2026-12-02T08:00:00Z' },
    { id: 'r4', targetType: 'listing', targetId: 'l1', reason: 'fake', status: 'open', createdAt: '2026-12-02T11:00:00Z' },
    { id: 'r5', targetType: 'listing', targetId: 'l2', reason: 'spam', status: 'closed', createdAt: '2026-11-30T10:00:00Z' },
  ];
  const queue = reportQueue(reports, now);
  assert.deepEqual(queue.map((g) => [g.targetType, g.targetId, g.count, g.overdue]), [
    ['user', 'u1', 1, true],
    ['listing', 'l1', 3, false],
  ]);
  assert.deepEqual(queue[1].reasons, ['fake', 'scam']);
  assert.equal(queue[1].oldestAt, '2026-12-02T08:00:00Z');
});

test('UC-034 the report sheet asks for a reason first and keeps the detail under 500', () => {
  assert.equal(reportIssue({ targetType: 'listing', reason: '', details: '' }), REPORT_TEXTS.chooseReason);
  assert.equal(reportIssue({ targetType: 'listing', reason: 'scam', details: 'x'.repeat(501) }), REPORT_TEXTS.tooLong);
  assert.equal(reportIssue({ targetType: 'conversation', reason: 'unsafe', details: '' }), null);
  assert.equal(REPORT_TEXTS.thanks, 'Thanks, we’ll review this within 24 hours');
});

test('SEC-12 the 21st report of the day says to try tomorrow; anything else says try again', () => {
  assert.equal(reportErrorText({ message: 'tooMany' }), REPORT_TEXTS.tooMany);
  assert.equal(reportErrorText({ message: 'Failed to fetch' }), REPORT_TEXTS.failed);
  assert.equal(reportErrorText(null), REPORT_TEXTS.failed);
});

test('BR-MSG-006 the block texts speak only to the person who blocks', () => {
  assert.equal(REPORT_TEXTS.blockHeading('Kai'), 'Block Kai?');
  assert.match(REPORT_TEXTS.blockBody, /won’t be told/);
  assert.equal(REPORT_TEXTS.blockedNote('Kai'), 'You blocked Kai. They can’t message you.');
});

test('BR-ADM-004 only an app_metadata admin sees the panel', () => {
  assert.equal(isAdmin({ app_metadata: { role: 'admin' } }), true);
  assert.equal(isAdmin({ app_metadata: {}, user_metadata: { role: 'admin' } }), false);
  assert.equal(isAdmin(null), false);
});

test('BR-ADM-001 the action form offers the actions of each object; reading is a separate button', () => {
  assert.deepEqual(adminActions('listing'), ['hide_listing', 'warn_user', 'suspend_user', 'dismiss']);
  assert.deepEqual(adminActions('conversation'), ['warn_user', 'suspend_user', 'dismiss']);
  assert.deepEqual(adminActions('photo'), []);
});

test('AC-040-1 the panel refuses an action without a note before calling the database', () => {
  assert.equal(actionIssue({ action: '', targetType: 'listing', note: 'Fake' }), ADMIN_TEXTS.chooseAction);
  assert.equal(actionIssue({ action: 'hide_listing', targetType: 'listing', note: '  ' }), ADMIN_TEXTS.noteNeeded);
  assert.equal(actionIssue({ action: 'hide_listing', targetType: 'user', note: 'Spam' }), ADMIN_TEXTS.result.action);
  assert.equal(actionIssue({ action: 'dismiss', targetType: 'user', note: 'Not a problem' }), null);
});

test('UC-040 A1 the queue groups reports of one object, oldest first, flagging the overdue', () => {
  const now = new Date('2026-11-04T12:00:00Z');
  const rows = [
    { id: 'r1', target_type: 'listing', target_id: 'L', reason: 'fake', created_at: '2026-11-03T10:00:00Z', target_label: 'Room in Baldivis', person_name: 'Sam', target_status: 'active' },
    { id: 'r2', target_type: 'conversation', target_id: 'C', reason: 'unsafe', created_at: '2026-11-04T11:55:00Z', target_label: 'Conversation about Room', person_name: 'Kai' },
    { id: 'r3', target_type: 'listing', target_id: 'L', reason: 'scam', created_at: '2026-11-04T09:00:00Z', target_label: 'Room in Baldivis', person_name: 'Sam', target_status: 'active' },
  ];
  const queue = adminQueue(rows, now);
  assert.deepEqual(queue.map((g) => g.key), ['r1', 'r2']);
  assert.equal(queue[0].countText, '2 reports');
  assert.equal(queue[0].reasonText, 'Fake listing or photos · Scam or asking for money');
  assert.equal(queue[0].overdue, true);
  assert.equal(queue[0].age, '26 h ago');
  assert.equal(queue[0].type, 'Listing');
  assert.equal(queue[1].overdue, false);
  assert.equal(queue[1].age, '5 min ago');
  assert.equal(queue[1].countText, '1 report');
  assert.equal(ageText('2026-11-01T12:00:00Z', now), '3 days ago');
});

test('UC-040 the panel says what admin_act did', () => {
  assert.equal(actResultText({ ok: true, closed: 2 }), 'Done. 2 reports closed.');
  assert.equal(actResultText({ ok: true, closed: 1 }), 'Done. 1 report closed.');
  assert.equal(actResultText({ ok: false, reason: 'note' }), ADMIN_TEXTS.result.note);
  assert.equal(actResultText({ ok: false, reason: 'closed' }), ADMIN_TEXTS.result.closed);
  assert.equal(actResultText(null, { message: 'Failed to fetch' }), ADMIN_TEXTS.result.failed);
});

test('UC-041 the search needs at least 2 characters', () => {
  assert.equal(searchIssue(' a '), SEARCH_TEXTS.tooShort);
  assert.equal(searchIssue('Pe'), null);
});

test('UC-041 a record offers each action or its undo, never on oneself', () => {
  assert.deepEqual(recordActions('listing', { status: 'active' }), ['hide_listing', 'warn_user']);
  assert.deepEqual(recordActions('listing', { status: 'hidden' }), ['unhide_listing', 'warn_user']);
  assert.deepEqual(recordActions('user', { status: 'active', is_admin: false }), ['warn_user', 'suspend_user', 'grant_admin']);
  assert.deepEqual(recordActions('user', { status: 'suspended', is_admin: true }), ['warn_user', 'unsuspend_user', 'revoke_admin']);
  assert.deepEqual(recordActions('user', { status: 'active', is_admin: true, is_me: true }), ['warn_user']);
  assert.deepEqual(recordActions('conversation', {}), []);
});

test('BR-ADM-001 a record action needs one of its actions and a note', () => {
  const allowed = ['warn_user', 'suspend_user'];
  assert.equal(recordActionIssue({ action: '', note: 'Fine note' }, allowed), ADMIN_TEXTS.chooseAction);
  assert.equal(recordActionIssue({ action: 'grant_admin', note: 'Fine note' }, allowed), ADMIN_TEXTS.chooseAction);
  assert.equal(recordActionIssue({ action: 'warn_user', note: 'no' }, allowed), ADMIN_TEXTS.noteNeeded);
  assert.equal(recordActionIssue({ action: 'warn_user', note: 'Rude to a host' }, allowed), null);
});

test('Issue #28 the log shows each action with its date, author and note, newest first', () => {
  const log = [
    { id: 'a', action: 'suspend_user', note: 'Threats', created_at: '2026-11-01T02:00:00Z', admin_name: 'Una' },
    { id: 'b', action: 'unsuspend_user', note: 'Resolved', created_at: '2026-11-03T02:00:00Z', admin_name: null },
  ];
  assert.deepEqual(logEntries(log, (d) => d.toISOString().slice(0, 10)), [
    { id: 'b', action: 'Lift suspension', by: 'Deleted admin', when: '2026-11-03', note: 'Resolved' },
    { id: 'a', action: 'Suspend account', by: 'Una', when: '2026-11-01', note: 'Threats' },
  ]);
});

test('UC-041 result lines and texts', () => {
  assert.equal(personLine({ email: 'ana@example.com', suburb: 'Perth' }), 'ana@example.com · Perth');
  assert.equal(listingLine({ suburb: 'Baldivis', owner_name: 'Sam' }), 'Baldivis · Host: Sam');
  assert.equal(listingLine({ suburb: 'Baldivis', owner_name: null }), 'Baldivis · Host: deleted');
  assert.equal(statusLabel('hidden'), 'Hidden');
  assert.equal(moderateResultText({ ok: true }), SEARCH_TEXTS.done);
  assert.equal(moderateResultText({ ok: false, reason: 'self' }), 'You can’t do that to your own account.');
  assert.equal(moderateResultText(null, { message: 'x' }), SEARCH_TEXTS.result.failed);
});
