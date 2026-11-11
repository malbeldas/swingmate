// phone-verify (UC-021, AC-021-2, SEC-09). The only way a code confirms a number: the try is counted
// in the database before Auth checks the code, so 5 wrong codes lock verification for an hour even
// for whoever skips the page. Auth itself refuses to confirm a number this function didn't ask for
// (phone_verify_guard). The database and Auth are passed in, so node:test runs it with fakes.
import { CODE_LENGTH, auMobile, cleanCode } from '../../../core/phone.js';

// user: the auth user of the caller's token (null when it is not valid).
// store: { begin(userId, phone, code) -> { ok, try_id } | { ok: false, reason, until? },
//          end(userId, tryId, wrong) -> { ok } | { ok: false, reason: 'locked', until } }
// auth:  { verify(phone, code) -> { ok: true } | { ok: false, status, code } }, Auth's
//        POST /verify with type phone_change.
// Returns { status, body }; body is { ok } or { ok: false, reason } with a key of PHONE_TEXTS.
export async function runPhoneVerify({ user, phone, code, store, auth }) {
  if (!user?.id) return { status: 401, body: { ok: false, reason: 'unauthorized' } };
  const e164 = auMobile(phone);
  if (!e164) return { status: 400, body: { ok: false, reason: 'notAustralian' } };
  const token = cleanCode(code);
  if (token.length !== CODE_LENGTH) return { status: 400, body: { ok: false, reason: 'codeShort' } };

  const begin = await store.begin(user.id, e164, token);
  if (!begin?.ok) return { status: 200, body: refusal(begin) };

  let answer;
  try {
    answer = await auth.verify(e164, token);
  } catch {
    answer = { ok: false, status: 0, code: 'network' };
  }
  if (answer.ok) {
    await store.end(user.id, begin.try_id, false);
    return { status: 200, body: { ok: true } };
  }
  if (isWrong(answer)) {
    const end = await store.end(user.id, begin.try_id, true);
    return { status: 200, body: end?.ok ? { ok: false, reason: 'wrongCode' } : refusal(end) };
  }
  // Auth failed for another reason (rate limit, outage): the try doesn't count.
  await store.end(user.id, begin.try_id, false);
  return { status: 502, body: { ok: false, reason: 'generic' } };
}

function refusal(result) {
  const reason = ['locked', 'wrongCode'].includes(result?.reason) ? result.reason : 'generic';
  return { ok: false, reason, ...(reason === 'locked' && result.until && { until: result.until }) };
}

// Auth answers a wrong or expired code with 403 otp_expired ("Token has expired or is invalid").
function isWrong({ status, code }) {
  return code === 'otp_expired' || status === 403;
}
