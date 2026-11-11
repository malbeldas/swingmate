import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPhoneVerify } from '../../supabase/functions/_shared/phone-verify-job.js';

const USER = { id: 'u1' };

// A database with a lock after 5 wrong tries, and an Auth that knows one right code.
function fakes({ right = '123456', wrongsBefore = 0, authFails = null } = {}) {
  const calls = { begin: [], end: [], verify: [] };
  let wrongs = wrongsBefore;
  let tries = 0;
  const store = {
    async begin(userId, phone, code) {
      calls.begin.push([userId, phone, code]);
      if (wrongs + tries >= 5) return { ok: false, reason: 'locked', until: '2026-11-11T14:00:00Z' };
      tries += 1;
      return { ok: true, try_id: tries };
    },
    async end(userId, tryId, wrong) {
      calls.end.push([userId, tryId, wrong]);
      tries -= 1;
      if (wrong) wrongs += 1;
      return wrongs >= 5 ? { ok: false, reason: 'locked', until: '2026-11-11T14:00:00Z' } : { ok: true };
    },
  };
  const auth = {
    async verify(phone, code) {
      calls.verify.push([phone, code]);
      if (authFails) return authFails;
      return code === right ? { ok: true } : { ok: false, status: 403, code: 'otp_expired' };
    },
  };
  return { store, auth, calls };
}

test('UC-021 without a valid session nothing is tried', async () => {
  const { store, auth, calls } = fakes();
  const r = await runPhoneVerify({ user: null, phone: '0412 345 678', code: '123456', store, auth });
  assert.equal(r.status, 401);
  assert.equal(calls.begin.length + calls.verify.length, 0);
});

test('UC-021 E1 a number or code the page would refuse never reaches Auth', async () => {
  const { store, auth, calls } = fakes();
  assert.deepEqual((await runPhoneVerify({ user: USER, phone: '+64 21 123 4567', code: '123456', store, auth })).body,
    { ok: false, reason: 'notAustralian' });
  assert.deepEqual((await runPhoneVerify({ user: USER, phone: '0412 345 678', code: '12345', store, auth })).body,
    { ok: false, reason: 'codeShort' });
  assert.equal(calls.begin.length + calls.verify.length, 0);
});

test('UC-021 the right code confirms the number and does not count', async () => {
  const { store, auth, calls } = fakes();
  const r = await runPhoneVerify({ user: USER, phone: '0412 345 678', code: '123 456', store, auth });
  assert.deepEqual(r, { status: 200, body: { ok: true } });
  assert.deepEqual(calls.begin, [['u1', '+61412345678', '123456']]);
  assert.deepEqual(calls.verify, [['+61412345678', '123456']]);
  assert.deepEqual(calls.end, [['u1', 1, false]]);
});

test('AC-021-2 a wrong code counts and the fifth locks verification for an hour', async () => {
  const { store, auth, calls } = fakes();
  for (let i = 1; i <= 4; i++) {
    const r = await runPhoneVerify({ user: USER, phone: '0412 345 678', code: '00000' + i, store, auth });
    assert.deepEqual(r.body, { ok: false, reason: 'wrongCode' }, `try ${i}`);
  }
  const fifth = await runPhoneVerify({ user: USER, phone: '0412 345 678', code: '000005', store, auth });
  assert.deepEqual(fifth.body, { ok: false, reason: 'locked', until: '2026-11-11T14:00:00Z' });
  // Locked: even the right code isn't sent to Auth.
  const right = await runPhoneVerify({ user: USER, phone: '0412 345 678', code: '123456', store, auth });
  assert.equal(right.body.reason, 'locked');
  assert.equal(calls.verify.length, 5);
  assert.ok(calls.end.every(([, , wrong]) => wrong));
});

test('AC-021-2 a try is counted before Auth answers, so tries sent at once stop at five', async () => {
  const { store, auth, calls } = fakes();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const slowAuth = { verify: async (...args) => { await gate; return auth.verify(...args); } };
  const all = Array.from({ length: 8 }, (_, i) =>
    runPhoneVerify({ user: USER, phone: '0412 345 678', code: String(100000 + i), store, auth: slowAuth }));
  release();
  const results = await Promise.all(all);
  assert.equal(calls.verify.length, 5, 'Auth sees five codes, not eight');
  assert.equal(results.filter((r) => r.body.reason === 'locked').length, 4, 'three refused at once, and the fifth wrong one locks');
});

test('UC-021 when Auth fails for another reason, the try does not count', async () => {
  const { store, auth, calls } = fakes({ authFails: { ok: false, status: 429, code: 'over_request_rate_limit' } });
  const r = await runPhoneVerify({ user: USER, phone: '0412 345 678', code: '123456', store, auth });
  assert.deepEqual(r, { status: 502, body: { ok: false, reason: 'generic' } });
  assert.deepEqual(calls.end, [['u1', 1, false]]);
});

test('UC-021 an Auth that cannot be reached reads as a generic error', async () => {
  const { store, calls } = fakes();
  const r = await runPhoneVerify({
    user: USER, phone: '0412 345 678', code: '123456', store, auth: { verify: async () => { throw new Error('down'); } },
  });
  assert.equal(r.status, 502);
  assert.deepEqual(calls.end, [['u1', 1, false]]);
});

test('UC-021 a number other than the one the code went to reads as a wrong code', async () => {
  const store = { begin: async () => ({ ok: false, reason: 'wrongCode' }), end: async () => assert.fail('no try') };
  const auth = { verify: async () => assert.fail('Auth is not asked') };
  const r = await runPhoneVerify({ user: USER, phone: '0412 345 678', code: '123456', store, auth });
  assert.deepEqual(r.body, { ok: false, reason: 'wrongCode' });
});
