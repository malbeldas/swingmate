// calendar-checks (UC-054, NTF-006). Called once a day at 8:00 Perth by pg_cron through
// call_edge_function('calendar-checks') with the service role key; nobody else can call it. The logic
// is in _shared/calendar-check-job.js. Secrets: EMAIL_PROVIDER, RESEND_API_KEY, APP_URL and
// EMAIL_LINK_SECRET (the key that signs the "My calendar is up to date" link, SEC-26).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { deliver } from '../_shared/send.js';
import { runCalendarChecks } from '../_shared/calendar-check-job.js';

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
      const { data, error } = await db.rpc('pending_calendar_checks');
      if (error) throw error;
      return data ?? [];
    },
    async log(row: Record<string, unknown>) {
      await db.from('notification_log').insert(row);
    },
  };
  const send = (args: { to: string; mail: { subject: string; text: string; html: string }; template: string; settingsUrl: string }) =>
    deliver({ provider: env('EMAIL_PROVIDER') || 'log', apiKey: env('RESEND_API_KEY'), ...args });

  return json(200, await runCalendarChecks({ store, send, appUrl: env('APP_URL') || 'https://swingmate.au', secret: env('EMAIL_LINK_SECRET') }));
});
