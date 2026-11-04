// send-email (notifications.md, INT-002). Called by the database through request_email() with the
// service role key; nobody else can call it. For now it sends NTF-009 (admin email for a new report);
// the other product emails join here as their issues land.
//
// Secrets (set with `supabase secrets set`, never in the repo):
//   EMAIL_PROVIDER  'resend' in production, 'log' to only record (local, CI, UAT without a domain)
//   RESEND_API_KEY  only with EMAIL_PROVIDER=resend
//   APP_URL         the public site, e.g. https://swingmate.au
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { deliver } from '../_shared/send.js';
import { TEMPLATE as ADMIN_REPORT, runAdminReport } from '../_shared/admin-report-job.js';

const env = (name: string) => Deno.env.get(name) ?? '';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function supabaseStore(db: ReturnType<typeof createClient>) {
  return {
    async report(id: string) {
      const { data } = await db.from('reports').select('id, target_type, target_id, reason').eq('id', id).maybeSingle();
      return data;
    },
    // Only public labels: a listing title or a display name (rule 3).
    async targetLabel(report: { target_type: string; target_id: string }) {
      if (report.target_type === 'listing') {
        const { data } = await db.from('listings').select('title').eq('id', report.target_id).maybeSingle();
        return data?.title ?? null;
      }
      if (report.target_type === 'user') {
        const { data } = await db.from('profiles').select('display_name').eq('id', report.target_id).maybeSingle();
        return data?.display_name ?? null;
      }
      const { data } = await db.from('conversations').select('listings(title)').eq('id', report.target_id).maybeSingle();
      const title = (data as { listings?: { title?: string } } | null)?.listings?.title;
      return title ? `Conversation about ${title}` : null;
    },
    async openReports() {
      const { count } = await db.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open');
      return count ?? 1;
    },
    // roles-permissions.md §2: the admin role lives in app_metadata.
    async admins() {
      const admins: { id: string; email: string }[] = [];
      for (let page = 1; page <= 10; page += 1) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
        if (error || !data?.users?.length) break;
        for (const u of data.users) if (u.app_metadata?.role === 'admin' && u.email) admins.push({ id: u.id, email: u.email });
        if (data.users.length < 200) break;
      }
      return admins;
    },
    async sentTo(template: string, refId: string) {
      const { data } = await db.from('notification_log').select('user_id').eq('template', template).eq('ref_id', refId).eq('status', 'sent');
      return new Set((data ?? []).map((r: { user_id: string }) => r.user_id));
    },
    async log(row: Record<string, unknown>) {
      await db.from('notification_log').insert(row);
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey || req.headers.get('authorization') !== `Bearer ${serviceKey}`) return json(401, { error: 'unauthorized' });

  const { template, ref_id: refId } = await req.json().catch(() => ({}));
  if (typeof refId !== 'string') return json(400, { error: 'ref_id' });

  const db = createClient(env('SUPABASE_URL'), serviceKey, { auth: { persistSession: false } });
  const send = ({ to, mail, template: t }: { to: string; mail: { subject: string; text: string; html: string }; template: string }) =>
    deliver({ provider: env('EMAIL_PROVIDER') || 'log', apiKey: env('RESEND_API_KEY'), to, mail, template: t });

  if (template === ADMIN_REPORT) {
    const result = await runAdminReport({ reportId: refId, store: supabaseStore(db), send, appUrl: env('APP_URL') || 'https://swingmate.au' });
    return json(200, result);
  }
  return json(400, { error: 'template' });
});
