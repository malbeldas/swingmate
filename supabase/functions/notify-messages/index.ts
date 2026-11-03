// notify-messages (UC-050, NTF-003). Called every 5 minutes by pg_cron through
// call_edge_function('notify-messages') with the service role key; nobody else can call it.
// Secrets: EMAIL_PROVIDER, RESEND_API_KEY and APP_URL, as in send-email.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { deliver } from '../_shared/send.js';
import { TEMPLATE, runNewMessages } from '../_shared/new-message-job.js';

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
      const { data, error } = await db.rpc('pending_message_emails');
      if (error) throw error;
      return data ?? [];
    },
    async log(row: Record<string, unknown>) {
      await db.from('notification_log').insert(row);
    },
    // Failed attempts for this conversation and person since its oldest pending message.
    async failures(conversationId: string, userId: string, since: string) {
      const { count } = await db.from('notification_log').select('id', { count: 'exact', head: true })
        .eq('template', TEMPLATE).eq('ref_id', conversationId).eq('user_id', userId).eq('status', 'failed').gte('created_at', since);
      return count ?? 0;
    },
    async markEmailed(ids: string[]) {
      await db.from('messages').update({ emailed_at: new Date().toISOString() }).in('id', ids);
    },
  };
  const send = (args: { to: string; mail: { subject: string; text: string; html: string }; template: string; settingsUrl: string }) =>
    deliver({ provider: env('EMAIL_PROVIDER') || 'log', apiKey: env('RESEND_API_KEY'), ...args });

  return json(200, await runNewMessages({ store, send, appUrl: env('APP_URL') || 'https://swingmate.au' }));
});
