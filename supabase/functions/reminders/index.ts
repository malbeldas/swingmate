// reminders (UC-051, NTF-004). Called once a day at 9:00 Perth by pg_cron through
// call_edge_function('reminders') with the service role key; nobody else can call it. The logic is
// in _shared/host-reminder-job.js. Secrets: EMAIL_PROVIDER, RESEND_API_KEY and APP_URL, as in send-email.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { deliver } from '../_shared/send.js';
import { runHostReminders } from '../_shared/host-reminder-job.js';

const env = (name: string) => Deno.env.get(name) ?? '';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey || req.headers.get('authorization') !== `Bearer ${serviceKey}`) return json(401, { error: 'unauthorized' });
  const db = createClient(env('SUPABASE_URL'), serviceKey, { auth: { persistSession: false } });

  const store = {
    async pending() {
      const { data, error } = await db.rpc('pending_host_reminders');
      if (error) throw error;
      return data ?? [];
    },
    async log(row: Record<string, unknown>) {
      await db.from('notification_log').insert(row);
    },
    async markReminded(conversationId: string) {
      await db.from('conversations').update({ reminder_sent_at: new Date().toISOString() }).eq('id', conversationId);
    },
  };
  const send = (args: { to: string; mail: { subject: string; text: string; html: string }; template: string; settingsUrl: string }) =>
    deliver({ provider: env('EMAIL_PROVIDER') || 'log', apiKey: env('RESEND_API_KEY'), ...args });

  return json(200, await runHostReminders({ store, send, appUrl: env('APP_URL') || 'https://swingmate.au' }));
});
