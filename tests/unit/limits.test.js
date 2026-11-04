import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGE_RULE_TEXTS } from '../../core/account.js';
import { MESSAGES_PER_HOUR, TEXTS, canReply, sendErrorText } from '../../core/messaging.js';

test('SEC-11 the 61st message in an hour is refused, with the same code as the database', () => {
  assert.equal(MESSAGES_PER_HOUR, 60);
  assert.deepEqual(canReply({ status: 'active', blocked: false, sentLastHour: 59 }), { ok: true });
  assert.deepEqual(canReply({ status: 'active', blocked: false, sentLastHour: 60 }), { ok: false, reason: 'hourlyLimit' });
  assert.equal(sendErrorText({ message: 'hourlyLimit' }), TEXTS.hourlyLimit);
  assert.equal(sendErrorText({ message: 'Failed to fetch' }), TEXTS.failed);
  assert.equal(sendErrorText(null), TEXTS.failed);
});

test('UC-024 the host chooses between the two options of BR-TRU-004', () => {
  assert.deepEqual(Object.keys(MESSAGE_RULE_TEXTS.options), ['email', 'phone']);
  assert.equal(MESSAGE_RULE_TEXTS.options.phone.label, 'Only people with a verified phone');
  assert.match(MESSAGE_RULE_TEXTS.options.phone.hint, /already open carry on/);
});
