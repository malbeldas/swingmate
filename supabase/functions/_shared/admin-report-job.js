// NTF-009 job: one email per admin for a new report (notifications-admin-report.md). The database
// access and the sending are passed in, so node:test runs it with fakes and send-email wires it to
// Supabase and Resend.
import { adminReportData } from '../../../core/moderation.js';
import { adminReportEmail } from './emails/admin-report.js';

export const TEMPLATE = 'NTF-009';

// store: { report(id), targetLabel(report), openReports(), admins() -> [{ id, email }],
//          sentTo(template, refId) -> Set of user ids, log(row) }
// send({ to, mail, template }) -> { status, providerMessageId, error }
export async function runAdminReport({ reportId, store, send, appUrl }) {
  const report = await store.report(reportId);
  if (!report) return { sent: 0, failed: 0, skipped: 'no_report' };
  const [targetLabel, openReports, admins, already] = await Promise.all([
    store.targetLabel(report), store.openReports(), store.admins(), store.sentTo(TEMPLATE, report.id),
  ]);
  const mail = adminReportEmail(adminReportData({ report, targetLabel, openReports, appUrl }));
  let sent = 0;
  let failed = 0;
  for (const admin of admins) {
    if (!admin.email || already.has(admin.id)) continue; // rule 7: never twice
    const result = await send({ to: admin.email, mail, template: TEMPLATE });
    await store.log({
      user_id: admin.id, template: TEMPLATE, ref_id: report.id, status: result.status,
      provider_message_id: result.providerMessageId, error: result.error,
    });
    if (result.status === 'sent') sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}
