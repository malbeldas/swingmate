// Signed links in emails that act without logging in (AC-054-1, and AC-007-1 later): an HS256 JWT
// with { purpose, exp } and the id the link is for (notifications-calendar-check.md
// "Implementación"). The key is the EMAIL_LINK_SECRET secret of the Edge Functions (SEC-26), never in
// the repo. Web Crypto only, so the same code runs in Deno and in node:test.

const DAY_SECONDS = 24 * 60 * 60;
const encoder = new TextEncoder();

function b64url(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const jsonPart = (value) => b64url(encoder.encode(JSON.stringify(value)));

async function key(secret) {
  if (!secret || String(secret).length < 32) throw new RangeError('EMAIL_LINK_SECRET must be at least 32 characters');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

// claims: { purpose: 'calendar', listing_id } etc. Valid for `days` days from `now`.
export async function signLinkToken(claims, secret, { days = 60, now = new Date() } = {}) {
  const body = `${jsonPart({ alg: 'HS256', typ: 'JWT' })}.${jsonPart({ ...claims, exp: Math.floor(now.getTime() / 1000) + days * DAY_SECONDS })}`;
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(body)));
  return `${body}.${b64url(signature)}`;
}

// The claims when the token is ours, for this purpose and not expired; otherwise { error } with
// 'invalid', 'purpose' or 'expired'.
export async function verifyLinkToken(token, secret, purpose, { now = new Date() } = {}) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return { error: 'invalid' };
  let header;
  let claims;
  try {
    header = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
  } catch {
    return { error: 'invalid' };
  }
  if (header?.alg !== 'HS256') return { error: 'invalid' };
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await key(secret), fromB64url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  } catch {
    return { error: 'invalid' };
  }
  if (!ok) return { error: 'invalid' };
  if (claims?.purpose !== purpose) return { error: 'purpose' };
  if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= now.getTime()) return { error: 'expired' };
  return { claims };
}
