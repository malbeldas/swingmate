// NTF-003 job (notifications-new-message.md, UC-050): one email per row of pending_message_emails.
// The database access and the sending are passed in, so node:test runs it with fakes and
// notify-messages wires it to Supabase and Resend.
import { datesLine } from '../../../core/messaging.js';
import { requestedFit } from '../../../core/inbox.js';
import { newMessageEmail } from './emails/new-message.js';

export const TEMPLATE = 'NTF-003';
export const MAX_ATTEMPTS = 3; // notifications.md rule 6, UC-050 E1

// One pending row (from pending_message_emails) to the template's input.
export function newMessageData(row, appUrl) {
  const app = String(appUrl).replace(/\/+$/, '');
  const fit = row.is_inquiry && row.recipient_role === 'host' && row.nights ? requestedFit(row.nights, row.stay_from) : null;
  return {
    recipientName: row.recipient_name,
    senderName: row.sender_name ?? 'Someone',
    listingTitle: row.listing_title,
    isInquiry: Boolean(row.is_inquiry),
    stayLabel: row.is_inquiry && row.stay_from && row.stay_to ? datesLine({ checkIn: row.stay_from, checkOut: row.stay_to }) : null,
    fitLine: fit?.text ?? null,
    rosterSummary: row.is_inquiry ? row.roster_summary : null,
    messages: row.messages ?? [],
    conversationUrl: `${app}/messages.html?c=${encodeURIComponent(row.conversation_id)}&src=email&ntf=${TEMPLATE}`,
    settingsUrl: `${app}/account.html#notifications`,
  };
}

// store: { pending() -> rows, log(row), failures(conversationId, userId, since) -> failed attempts
//          since the oldest pending message, markEmailed(messageIds) }
// send({ to, mail, template, settingsUrl }) -> { status, providerMessageId, error }
// A conversation whose email fails is tried again on the next run, up to MAX_ATTEMPTS; then its
// messages are marked so it stops (the failures stay in notification_log).
export async function runNewMessages({ store, send, appUrl }) {
  const rows = await store.pending();
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const data = newMessageData(row, appUrl);
    const mail = newMessageEmail(data);
    const result = await send({ to: row.recipient_email, mail, template: TEMPLATE, settingsUrl: data.settingsUrl });
    await store.log({
      user_id: row.recipient_id, template: TEMPLATE, ref_id: row.conversation_id, status: result.status,
      provider_message_id: result.providerMessageId, error: result.error,
    });
    if (result.status === 'sent') {
      sent += 1;
      await store.markEmailed(row.message_ids);
    } else {
      failed += 1;
      if ((await store.failures(row.conversation_id, row.recipient_id, row.first_at)) >= MAX_ATTEMPTS) await store.markEmailed(row.message_ids);
    }
  }
  return { sent, failed };
}
