import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRIVACY_TEXTS, exportFileName, reauthMethod, signedInRecently } from '../../core/privacy.js';
import { runDeleteAccount } from '../../supabase/functions/_shared/delete-account-job.js';

const NOW = new Date('2026-11-04T10:00:00Z');

test('UC-035 both actions need a sign-in in the last 5 minutes', () => {
  assert.equal(signedInRecently('2026-11-04T09:56:00Z', NOW), true);
  assert.equal(signedInRecently('2026-11-04T09:54:59Z', NOW), false);
  assert.equal(signedInRecently(null, NOW), false);
  assert.equal(signedInRecently('not a date', NOW), false);
});

test('UC-035 the person confirms with their password, or Google for a Google-only account', () => {
  assert.equal(reauthMethod({ app_metadata: { provider: 'email', providers: ['email'] } }), 'password');
  assert.equal(reauthMethod({ app_metadata: { provider: 'google', providers: ['google'] } }), 'google');
  assert.equal(reauthMethod({ app_metadata: { provider: 'google', providers: ['google', 'email'] } }), 'password');
});

test('UC-035 a Facebook-only account confirms with Facebook (BR-ACC-002, INT-007)', () => {
  assert.equal(reauthMethod({ app_metadata: { provider: 'facebook', providers: ['facebook'] } }), 'facebook');
  assert.equal(reauthMethod({ app_metadata: { provider: 'facebook', providers: ['facebook', 'google'] } }), 'google');
  assert.equal(reauthMethod({ app_metadata: { provider: 'facebook', providers: ['facebook', 'email'] } }), 'password');
  assert.equal(PRIVACY_TEXTS.facebook, 'Continue with Facebook');
});

test('BR-PRV-004 the file is named by date only, no personal data', () => {
  assert.equal(exportFileName('2026-11-04'), 'swingmate-my-data-2026-11-04.json');
  assert.equal(PRIVACY_TEXTS.deleteHint, 'Your profile, saved homes and alerts are removed. Hosts keep the messages you already sent, shown as “Deleted user”.');
});

function fakeStore({ deleteOk = true, removeError = null } = {}) {
  const calls = [];
  return {
    calls,
    async storagePaths(id) { calls.push(['paths', id]); return { avatars: [`${id}/a.jpg`], listing_photos: ['l1/0.jpg', 'l1/1.jpg'] }; },
    async deleteAccount(id) { calls.push(['delete', id]); return deleteOk ? { ok: true } : { ok: false, reason: 'not_found' }; },
    async removeFiles(bucket, paths) { calls.push(['remove', bucket, paths]); return { error: removeError }; },
  };
}

test('BR-ACC-007 delete-account removes the account, then the photos from Storage', async () => {
  const store = fakeStore();
  const out = await runDeleteAccount({ user: { id: 'u1', last_sign_in_at: '2026-11-04T09:58:00Z' }, store, now: NOW });
  assert.deepEqual(out, { status: 200, body: { ok: true } });
  assert.deepEqual(store.calls, [
    ['paths', 'u1'], ['delete', 'u1'], ['remove', 'avatars', ['u1/a.jpg']], ['remove', 'listing-photos', ['l1/0.jpg', 'l1/1.jpg']],
  ]);
});

test('roles-permissions §4 delete-account refuses without a valid session or a recent sign-in', async () => {
  const store = fakeStore();
  assert.equal((await runDeleteAccount({ user: null, store, now: NOW })).status, 401);
  const old = await runDeleteAccount({ user: { id: 'u1', last_sign_in_at: '2026-11-04T09:00:00Z' }, store, now: NOW });
  assert.deepEqual(old, { status: 403, body: { ok: false, reason: 'reauth' } });
  assert.deepEqual(store.calls, []);
});

test('BR-ACC-007 a failed deletion touches no file; a file that stays is reported', async () => {
  const failed = fakeStore({ deleteOk: false });
  const out = await runDeleteAccount({ user: { id: 'u1', last_sign_in_at: '2026-11-04T09:58:00Z' }, store: failed, now: NOW });
  assert.equal(out.status, 500);
  assert.equal(failed.calls.some(([k]) => k === 'remove'), false);
  const leftover = fakeStore({ removeError: { message: 'boom' } });
  const ok = await runDeleteAccount({ user: { id: 'u1', last_sign_in_at: '2026-11-04T09:58:00Z' }, store: leftover, now: NOW });
  assert.deepEqual(ok.body, { ok: true, leftovers: ['avatars', 'listing-photos'] });
});
