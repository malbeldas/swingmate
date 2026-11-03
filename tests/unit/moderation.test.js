import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS_BY_TARGET, canReadConversation, checkAction, checkReport, REPORT_REASONS, REPORT_THANKS, reportQueue,
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
