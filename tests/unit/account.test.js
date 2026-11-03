import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signupIssues, passwordHint, cleanCode, intentFlags, authErrorText, TEXTS, INTENTS } from '../../core/account.js';

test('AC-030-4 a disposable email is stopped before sending', () => {
  assert.deepEqual(signupIssues({ email: 'me@mailinator.com', password: 'longenough' }), ['emailDisposable']);
});

test('UC-030 E3 a short password is stopped before sending', () => {
  assert.deepEqual(signupIssues({ email: 'ana@example.com', password: 'short' }), ['passwordShort']);
  assert.deepEqual(signupIssues({ email: 'ana@example.com', password: '12345678' }), []);
});

test('UC-030 an email without a domain is invalid', () => {
  assert.deepEqual(signupIssues({ email: 'ana@', password: '12345678' }), ['emailInvalid']);
  assert.deepEqual(signupIssues({ email: ' ana@example.com ', password: '12345678' }), []);
});

test('BR-ACC-002 the password hint counts characters until 8', () => {
  assert.equal(passwordHint(''), 'At least 8 characters');
  assert.equal(passwordHint('abc'), 'At least 8 characters (3 so far)');
  assert.equal(passwordHint('abcdefgh'), 'At least 8 characters');
});

test('BR-ACC-002 the code field keeps 6 digits', () => {
  assert.equal(cleanCode(' 12a3 456 789'), '123456');
});

test('BR-ACC-001 the intent turns on seeking, hosting or both', () => {
  assert.deepEqual(INTENTS.map((i) => i.label), ['Find a place', 'List a place', 'Both']);
  assert.deepEqual(intentFlags('seeking'), { isSeeking: true, isHosting: false });
  assert.deepEqual(intentFlags('hosting'), { isSeeking: false, isHosting: true });
  assert.deepEqual(intentFlags('both'), { isSeeking: true, isHosting: true });
});

test('UC-030 E2 auth errors become plain words', () => {
  assert.equal(authErrorText({ code: 'otp_expired', message: 'Token has expired or is invalid' }), TEXTS.codeInvalid);
  assert.equal(authErrorText({ code: 'invalid_credentials' }), TEXTS.credentials);
  assert.equal(authErrorText({ code: 'over_email_send_rate_limit', status: 429 }), TEXTS.rateLimited);
  assert.equal(authErrorText({ message: 'Please use a permanent email address.' }), TEXTS.emailDisposable);
  assert.equal(authErrorText({ code: 'unexpected_failure' }), TEXTS.generic);
  assert.equal(authErrorText(null), '');
});
