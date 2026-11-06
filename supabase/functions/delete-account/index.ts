// delete-account (UC-035, BR-ACC-007). Called by the person from "Privacy and data" with their own
// session; it needs a sign-in in the last 5 minutes (roles-permissions.md §4). The logic is in
// _shared/delete-account-job.js. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { runDeleteAccount } from '../_shared/delete-account-job.js';

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
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data } = token ? await db.auth.getUser(token) : { data: null };

  const store = {
    async storagePaths(userId: string) {
      const { data: paths, error } = await db.rpc('account_storage_paths', { p_user_id: userId });
      if (error) throw error;
      return paths;
    },
    async deleteAccount(userId: string) {
      const { data: result, error } = await db.rpc('delete_account', { p_user_id: userId });
      return error ? { ok: false, reason: 'failed' } : result;
    },
    async removeFiles(bucket: string, paths: string[]) {
      const { error } = await db.storage.from(bucket).remove(paths);
      return { error };
    },
  };

  const { status, body } = await runDeleteAccount({ user: data?.user ?? null, store });
  return json(status, body);
});
