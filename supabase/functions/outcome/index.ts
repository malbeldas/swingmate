// outcome (UC-007, AC-007-1). email-action.html posts the signed link from the NTF-005 email and the
// answer tapped; no login is needed, the signature is the proof. The logic is in
// _shared/outcome-answer-job.js. Secret: EMAIL_LINK_SECRET (SEC-26). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. The page calls it with the public anon key.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { runOutcomeAnswer } from '../_shared/outcome-answer-job.js';

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
  let answer = '';
  try {
    const body = await req.json();
    token = String(body?.token ?? '');
    answer = String(body?.answer ?? '');
  } catch { /* no body */ }
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const store = {
    async answer(conversationId: string, choice: string) {
      const { data, error } = await db.rpc('answer_outcome_from_email', { p_conversation_id: conversationId, p_answer: choice });
      return error ? { ok: false, reason: 'failed' } : data;
    },
  };
  const { status, body } = await runOutcomeAnswer({ token, answer, secret: env('EMAIL_LINK_SECRET'), store });
  return json(status, body);
});
