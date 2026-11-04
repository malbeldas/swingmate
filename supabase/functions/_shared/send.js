// Sending one product email (notifications.md rules 2, 5 and 6, INT-002). Plain JS with the fetch
// passed in, so node:test covers it and the Deno Edge Function uses it as is.
import { UNSUBSCRIBABLE } from './emails/layout.js';

export const FROM = 'SwingMate <hello@swingmate.au>';
export const REPLY_TO = 'support@swingmate.au';
const RESEND_URL = 'https://api.resend.com/emails';

// The body Resend expects. Emails people can switch off carry List-Unsubscribe (BR-MAIL-005).
export function resendBody({ to, mail, template, settingsUrl }) {
  const body = { from: FROM, reply_to: REPLY_TO, to: [to], subject: mail.subject, text: mail.text, html: mail.html };
  if (UNSUBSCRIBABLE.includes(template)) {
    if (!settingsUrl) throw new Error(`${template} needs settingsUrl for List-Unsubscribe`);
    body.headers = { 'List-Unsubscribe': `<${settingsUrl}>` };
  }
  return body;
}

// provider 'resend' sends; 'log' only records it (local and CI, integrations-email.md "Modo local").
// Returns { status: 'sent' | 'failed', providerMessageId, error }, where error is a code without
// personal data (rule 6).
export async function deliver({ provider, apiKey, fetchImpl = fetch, to, mail, template, settingsUrl }) {
  const body = resendBody({ to, mail, template, settingsUrl });
  if (provider === 'log') return { status: 'sent', providerMessageId: null, error: null };
  if (provider !== 'resend' || !apiKey) return { status: 'failed', providerMessageId: null, error: 'not_configured' };
  try {
    const res = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { status: 'failed', providerMessageId: null, error: `provider_${res.status}` };
    const data = await res.json().catch(() => ({}));
    return { status: 'sent', providerMessageId: data?.id ?? null, error: null };
  } catch {
    return { status: 'failed', providerMessageId: null, error: 'network' };
  }
}
