import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHONE_TEXTS, auMobile, checkText, cleanCode, formatAuMobile, isWrongCode, phoneErrorText, resendIn,
} from '../../core/phone.js';

test('UC-021 E1 the usual spellings of an Australian mobile become one number', () => {
  for (const input of ['0412 345 678', '0412-345-678', '(04) 1234 5678', '412345678', '+61 412 345 678', '61412345678', '0061 412 345 678']) {
    assert.equal(auMobile(input), '+61412345678', input);
  }
});

test('UC-021 E1 NTF-008 AC-2 a number that is not an Australian mobile is stopped before sending', () => {
  for (const input of ['', '08 9123 4567', '+64 21 123 4567', '+1 415 212 7777', '0412 345 67', '0412 345 6789', '04123x5678', '+0412345678', '0412+345678', '61 812 345 678']) {
    assert.equal(auMobile(input), null, input);
  }
});

test('UC-021 the number reads back the way it is written in Australia', () => {
  assert.equal(formatAuMobile('+61412345678'), '0412 345 678');
  assert.equal(formatAuMobile('+64211234567'), '');
});

test('UC-021 A1 "Send again" waits 60 seconds after the last code', () => {
  const sent = new Date('2026-11-06T10:00:00Z');
  assert.equal(resendIn(null), 0);
  assert.equal(resendIn(sent, new Date('2026-11-06T10:00:00Z')), 60);
  assert.equal(resendIn(sent, new Date('2026-11-06T10:00:45Z')), 15);
  assert.equal(resendIn(sent, new Date('2026-11-06T10:01:00Z')), 0);
  assert.equal(resendIn(sent, new Date('2026-11-06T10:05:00Z')), 0);
});

test('UC-021 the code field keeps 6 digits', () => {
  assert.equal(cleanCode(' 12 34-56 7'), '123456');
});

test('SEC-09 AC-021-2 the database limits read as plain words', () => {
  assert.equal(checkText({ ok: true }), '');
  assert.equal(checkText({ ok: false, reason: 'daily' }), 'This number has had 5 codes today. Try again tomorrow.');
  assert.equal(checkText({ ok: false, reason: 'locked', until: '2026-11-06T11:00:00Z' }), 'Too many wrong codes. Try again in an hour.');
  assert.equal(checkText({ ok: false, reason: 'notAustralian' }), PHONE_TEXTS.notAustralian);
  assert.equal(checkText({ ok: false, reason: 'unknown' }), PHONE_TEXTS.generic);
});

test('AC-021-1 UC-021 E4 a number verified in another account reads "This number is already in use"', () => {
  assert.equal(phoneErrorText({ code: 'phone_exists', status: 422, message: 'A user with this phone number has already been registered' }), 'This number is already in use');
});

test('UC-021 the send errors from Supabase Auth', () => {
  assert.equal(phoneErrorText({ code: 'over_sms_send_rate_limit', status: 429 }), PHONE_TEXTS.tooSoon);
  assert.equal(phoneErrorText({ code: 'sms_send_failed', status: 422 }), PHONE_TEXTS.sendFailed);
  assert.equal(phoneErrorText({ status: 500, message: 'Database error updating user for phone' }), PHONE_TEXTS.sendFailed);
  assert.equal(phoneErrorText({ code: 'validation_failed', status: 422, message: 'Invalid phone number format (E.164 required)' }), PHONE_TEXTS.notAustralian);
  assert.equal(phoneErrorText(null), '');
});

test('UC-021 E2 a wrong or expired code says so and counts toward the lock', () => {
  const wrong = { code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' };
  assert.equal(phoneErrorText(wrong, 'verify'), PHONE_TEXTS.wrongCode);
  assert.equal(isWrongCode(wrong), true);
  assert.equal(isWrongCode({ status: 500, message: 'Database error' }), false);
  assert.equal(isWrongCode(null), false);
  assert.equal(phoneErrorText({ code: 'over_request_rate_limit', status: 429 }, 'verify'), PHONE_TEXTS.locked);
});
