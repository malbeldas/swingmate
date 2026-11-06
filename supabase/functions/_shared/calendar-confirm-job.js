// calendar-confirm (UC-054 step 2, AC-054-1): the page the email's button opens sends the signed
// link here; if it is ours, for a calendar and not expired, the listing's calendar is marked as up
// to date without logging in. The database is passed in, so node:test runs it with a fake.
import { verifyLinkToken } from './link-token.js';

// store: { confirm(listingId) -> { ok, title } | { ok: false, reason } }
// Returns { status, body }.
export async function runCalendarConfirm({ token, secret, store, now = new Date() }) {
  const { claims, error } = await verifyLinkToken(token, secret, 'calendar', { now });
  if (error === 'expired') return { status: 410, body: { ok: false, reason: 'expired' } };
  if (error) return { status: 400, body: { ok: false, reason: 'invalid' } };
  const result = await store.confirm(claims.listing_id);
  if (!result?.ok) return { status: 409, body: { ok: false, reason: result?.reason ?? 'failed' } };
  return { status: 200, body: { ok: true, title: result.title, listing_id: claims.listing_id } };
}
