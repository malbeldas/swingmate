// alerts (UC-053, NTF-007). Called once a day at 7:00 Perth by pg_cron through
// call_edge_function('alerts') with the service role key; nobody else can call it. The logic is in
// _shared/alerts-job.js. Secrets: EMAIL_PROVIDER, RESEND_API_KEY and APP_URL, as in send-email.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { deliver } from '../_shared/send.js';
import { TEMPLATE, runAlerts } from '../_shared/alerts-job.js';

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
      const { data, error } = await db.rpc('pending_alerts');
      if (error) throw error;
      return data ?? [];
    },
    // The same search the results page runs (AC-053-1).
    async search(args: Record<string, unknown>) {
      const { data, error } = await db.rpc('search_listings', args);
      if (error) throw error;
      return data ?? [];
    },
    photoUrl(path: string) {
      return db.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
    },
    async log(row: Record<string, unknown>) {
      await db.from('notification_log').insert(row);
    },
    // Failed alert emails for this person since their last one that went out.
    async failures(userId: string) {
      const { data: last } = await db.from('notification_log').select('created_at')
        .eq('template', TEMPLATE).eq('user_id', userId).eq('status', 'sent')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      let query = db.from('notification_log').select('id', { count: 'exact', head: true })
        .eq('template', TEMPLATE).eq('user_id', userId).eq('status', 'failed');
      if (last?.created_at) query = query.gt('created_at', last.created_at);
      const { count } = await query;
      return count ?? 0;
    },
    async delivered(pairs: { alert_id: string; listing_id: string }[]) {
      if (pairs.length) await db.from('alert_deliveries').upsert(pairs, { onConflict: 'alert_id,listing_id', ignoreDuplicates: true });
    },
  };
  const send = (args: { to: string; mail: { subject: string; text: string; html: string }; template: string; settingsUrl: string }) =>
    deliver({ provider: env('EMAIL_PROVIDER') || 'log', apiKey: env('RESEND_API_KEY'), ...args });

  return json(200, await runAlerts({ store, send, appUrl: env('APP_URL') || 'https://swingmate.au' }));
});
