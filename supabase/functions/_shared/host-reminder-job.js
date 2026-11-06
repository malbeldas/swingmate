// NTF-004 job (notifications-host-reminder.md, UC-051): one reminder per conversation whose first
// enquiry waits 48 hours for the host (AC-051-1). The database and the sending are passed in, so
// node:test runs it with fakes and the reminders Edge Function wires it to Supabase and Resend.
import { formatRange } from '../../../core/dates.js';
import { hostReminderEmail } from './emails/host-reminder.js';

export const TEMPLATE = 'NTF-004';

// One row of pending_host_reminders to the template's input.
export function hostReminderData(row, appUrl) {
  const app = String(appUrl).replace(/\/+$/, '');
  return {
    hostName: row.host_name,
    seekerName: row.seeker_name ?? 'Someone',
    listingTitle: row.listing_title,
    stayLabel: formatRange(row.stay_from, row.stay_to),
    conversationUrl: `${app}/messages.html?c=${encodeURIComponent(row.conversation_id)}&src=email&ntf=${TEMPLATE}`,
    pauseUrl: `${app}/account.html#listings`,
    settingsUrl: `${app}/account.html#notifications`,
  };
}

// store: { pending() -> rows, log(row), markReminded(conversationId) }
// send({ to, mail, template, settingsUrl }) -> { status, providerMessageId, error }
// A failed email is tried on the next run; pending_host_reminders stops after three failures.
export async function runHostReminders({ store, send, appUrl }) {
  let sent = 0;
  let failed = 0;
  for (const row of await store.pending()) {
    const data = hostReminderData(row, appUrl);
    const result = await send({ to: row.host_email, mail: hostReminderEmail(data), template: TEMPLATE, settingsUrl: data.settingsUrl });
    await store.log({
      user_id: row.host_id, template: TEMPLATE, ref_id: row.conversation_id, status: result.status,
      provider_message_id: result.providerMessageId, error: result.error,
    });
    if (result.status === 'sent') {
      sent += 1;
      await store.markReminded(row.conversation_id);
    } else {
      failed += 1;
    }
  }
  return { sent, failed };
}
