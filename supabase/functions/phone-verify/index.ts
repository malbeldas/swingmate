// phone-verify (UC-021, AC-021-2). The page sends { phone, code } with the person's own session;
// the logic is in _shared/phone-verify-job.js. SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { runPhoneVerify } from '../_shared/phone-verify-job.js';

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
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data } = jwt ? await db.auth.getUser(jwt) : { data: null };
  const { phone, code } = await req.json().catch(() => ({}));
  const authUrl = `${env('SUPABASE_URL').replace(/\/$/, '')}/auth/v1`;
  const anon = env('SUPABASE_ANON_KEY');

  const store = {
    async begin(userId: string, e164: string, token: string) {
      const { data: result, error } = await db.rpc('phone_verify_begin', { p_user_id: userId, p_phone: e164, p_code: token });
      return error ? { ok: false, reason: 'generic' } : result;
    },
    async end(userId: string, tryId: number, wrong: boolean) {
      const { data: result, error } = await db.rpc('phone_verify_end', { p_user_id: userId, p_try_id: tryId, p_wrong: wrong });
      return error ? { ok: true } : result;
    },
  };

  const auth = {
    async verify(e164: string, token: string) {
      const res = await fetch(`${authUrl}/verify`, {
        method: 'POST',
        headers: { apikey: anon, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'phone_change', phone: e164, token }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, status: res.status, code: String(body?.error_code ?? body?.code ?? '') };
      // Auth opens a new session with the code; the person keeps theirs, so this one is closed.
      if (body?.access_token) {
        await fetch(`${authUrl}/logout?scope=local`, {
          method: 'POST', headers: { apikey: anon, authorization: `Bearer ${body.access_token}` },
        }).catch(() => {});
      }
      return { ok: true };
    },
  };

  const { status, body } = await runPhoneVerify({ user: data?.user ?? null, phone, code, store, auth });
  return json(status, body);
});
