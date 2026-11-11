// cleanup (BR-PRV-003). Called once a day at 3:00 Perth by pg_cron through
// call_edge_function('cleanup') with the service role key; nobody else can call it. The logic is in
// _shared/cleanup-job.js.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { runCleanup } from '../_shared/cleanup-job.js';

const env = (name: string) => Deno.env.get(name) ?? '';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey || req.headers.get('authorization') !== `Bearer ${serviceKey}`) return json(401, { error: 'unauthorized' });
  const db = createClient(env('SUPABASE_URL'), serviceKey, { auth: { persistSession: false } });

  const store = {
    async run() {
      const { data, error } = await db.rpc('cleanup_run');
      if (error) throw error;
      return data;
    },
    async orphanFiles() {
      const { data, error } = await db.rpc('cleanup_orphan_files');
      if (error) throw error;
      return data ?? [];
    },
    async remove(bucket: string, paths: string[]) {
      const { error } = await db.storage.from(bucket).remove(paths);
      return { error };
    },
  };

  return json(200, await runCleanup({ store }));
});
