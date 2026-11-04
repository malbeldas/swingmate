// calendar-confirm (UC-054 step 2, AC-054-1). email-action.html posts the signed link from the
// NTF-006 email here; no login is needed, the signature is the proof. The logic is in
// _shared/calendar-confirm-job.js. Secret: EMAIL_LINK_SECRET (SEC-26). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. The page calls it with the public anon key.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { runCalendarConfirm } from '../_shared/calendar-confirm-job.js';

const env = (name: string) => Deno.env.get(name) ?? '';
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { ok: false, reason: 'method' });
  let token = '';
  try { token = String((await req.json())?.token ?? ''); } catch { /* no body */ }
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const store = {
    async confirm(listingId: string) {
      const { data, error } = await db.rpc('confirm_calendar_from_email', { p_listing_id: listingId });
      return error ? { ok: false, reason: 'failed' } : data;
    },
  };
  const { status, body } = await runCalendarConfirm({ token, secret: env('EMAIL_LINK_SECRET'), store });
  return json(status, body);
});
