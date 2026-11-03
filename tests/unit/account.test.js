import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  signupIssues, passwordHint, cleanCode, intentFlags, authErrorText, TEXTS, INTENTS, resetSentText, readRecoveryLink, isEmail,
} from '../../core/account.js';

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

test('AC-031-1 the reset answer has the same words for any email', () => {
  const known = resetSentText('ana@example.com');
  const unknown = resetSentText('nobody@example.com');
  assert.equal(known.replace('ana@example.com', 'X'), unknown.replace('nobody@example.com', 'X'));
  assert.equal(known, "If there's an account for ana@example.com, a reset link is on its way. It works for 1 hour. Check your spam folder too.");
});

test('UC-031 the reset link is read once and taken out of the address', () => {
  assert.deepEqual(readRecoveryLink('https://swingmate.au/?token_hash=abc123&type=recovery'), { tokenHash: 'abc123', cleanUrl: '/' });
  assert.deepEqual(
    readRecoveryLink('http://localhost:4173/results.html?from=listing&token_hash=abc&type=recovery#how'),
    { tokenHash: 'abc', cleanUrl: '/results.html?from=listing#how' },
  );
  assert.equal(readRecoveryLink('https://swingmate.au/?token_hash=abc&type=signup'), null);
  assert.equal(readRecoveryLink('https://swingmate.au/?type=recovery'), null);
  assert.equal(readRecoveryLink('not a url'), null);
});

test('UC-031 the reset form checks the email and the new password errors read plainly', () => {
  assert.equal(isEmail(' ana@example.com '), true);
  assert.equal(isEmail('ana@'), false);
  assert.equal(authErrorText({ code: 'same_password' }), TEXTS.samePassword);
  assert.equal(authErrorText({ code: 'weak_password' }), TEXTS.passwordShort);
});
