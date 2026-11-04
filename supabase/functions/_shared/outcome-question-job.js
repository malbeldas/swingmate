// NTF-005 job (notifications-outcome-question.md, UC-052, BR-MAIL-003): on day 14 of a conversation
// the person who searched gets "Did you find a place?" with three one-tap answers that work without
// logging in (AC-007-1), and the question appears in the conversation. The database, the signing key
// and the sending are passed in, so node:test runs it with fakes and the outcomes Edge Function wires
// it to Supabase and Resend.
import { emailActionUrl } from '../../../core/email-actions.js';
import { outcomeQuestionEmail } from './emails/outcome-question.js';
import { signLinkToken } from './link-token.js';

export const TEMPLATE = 'NTF-005';
export const LINK_DAYS = 60;
const LAST_TRY = 3; // notifications.md rule 6

// store: { pending() -> rows of pending_outcome_questions, log(row), markAsked(conversationId) }
// send({ to, mail, template }) -> { status, providerMessageId, error }
// The conversation is marked as asked once the email went out, or after its third failure, so the
// question still appears in the conversation and is never asked twice (AC-052-1). Without the
// signing key nothing happens: the answers would be links that can't work.
export async function runOutcomeQuestions({ store, send, appUrl, secret, now = new Date() }) {
  if (!secret || String(secret).length < 32) return { sent: 0, failed: 0, error: 'no_secret' };
  const app = String(appUrl).replace(/\/+$/, '');
  let sent = 0;
  let failed = 0;
  for (const row of await store.pending()) {
    const token = await signLinkToken({ purpose: 'outcome', conversation_id: row.conversation_id }, secret, { days: LINK_DAYS, now });
    const mail = outcomeQuestionEmail({
      seekerName: row.seeker_name,
      hostName: row.host_name ?? 'the host',
      listingTitle: row.listing_title,
      answerUrl: (answer) => emailActionUrl(app, 'outcome', token, TEMPLATE, { answer }),
    });
    const result = await send({ to: row.seeker_email, mail, template: TEMPLATE });
    await store.log({
      user_id: row.seeker_id, template: TEMPLATE, ref_id: row.conversation_id, status: result.status,
      provider_message_id: result.providerMessageId, error: result.error,
    });
    if (result.status === 'sent') sent += 1;
    else failed += 1;
    if (result.status === 'sent' || Number(row.failures ?? 0) + 1 >= LAST_TRY) await store.markAsked(row.conversation_id);
  }
  return { sent, failed };
}
