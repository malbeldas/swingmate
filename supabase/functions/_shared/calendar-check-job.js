// NTF-006 job (notifications-calendar-check.md, UC-054, BR-AVL-006): every active listing whose
// calendar wasn't touched in 30 days gets the check, with a signed "My calendar is up to date" link
// that works without logging in (AC-054-1). Database, signing key and sending are passed in, so
// node:test runs it with fakes and the calendar-checks Edge Function wires it to Supabase and Resend.
import { emailActionUrl } from '../../../core/email-actions.js';
import { calendarCheckEmail } from './emails/calendar-check.js';
import { signLinkToken } from './link-token.js';

export const TEMPLATE = 'NTF-006';
export const LINK_DAYS = 60;

// store: { pending() -> rows of pending_calendar_checks, log(row) }
// send({ to, mail, template, settingsUrl }) -> { status, providerMessageId, error }
// Without the signing key nothing is sent: an email whose button can't work helps nobody.
export async function runCalendarChecks({ store, send, appUrl, secret, now = new Date() }) {
  if (!secret || String(secret).length < 32) return { sent: 0, failed: 0, error: 'no_secret' };
  const app = String(appUrl).replace(/\/+$/, '');
  let sent = 0;
  let failed = 0;
  for (const row of await store.pending()) {
    const token = await signLinkToken({ purpose: 'calendar', listing_id: row.listing_id }, secret, { days: LINK_DAYS, now });
    const settingsUrl = `${app}/account.html#notifications`;
    const mail = calendarCheckEmail({
      hostName: row.host_name,
      listingTitle: row.listing_title,
      availability: row.availability ?? '',
      start: row.start,
      confirmUrl: emailActionUrl(app, 'calendar', token, TEMPLATE),
      editUrl: `${app}/account.html#listings`,
      settingsUrl,
    });
    const result = await send({ to: row.host_email, mail, template: TEMPLATE, settingsUrl });
    await store.log({
      user_id: row.host_id, template: TEMPLATE, ref_id: row.listing_id, status: result.status,
      provider_message_id: result.providerMessageId, error: result.error,
    });
    if (result.status === 'sent') sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}
