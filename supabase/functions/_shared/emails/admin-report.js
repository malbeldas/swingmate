import { button, escapeHtml, layout, paragraph } from './layout.js';

// NTF-009 (specs/notifications-admin-report.md). Never carries the reporter's text or anyone's
// contact details: the template does not take them.
export function adminReportEmail({ reason, targetType, targetLabel, openReports, adminUrl }) {
  const subject = `[SwingMate] New report: ${reason}`;
  const text = `New report about a ${targetType}: ${targetLabel}
Reason: ${reason}
Open reports: ${openReports}

Review it: ${adminUrl}
`;
  const html = layout({
    preheader: `${reason} · ${openReports} open`,
    body: paragraph(`New report about a ${escapeHtml(targetType)}: <strong>${escapeHtml(targetLabel)}</strong>`)
      + paragraph(`Reason: ${escapeHtml(reason)}<br>Open reports: ${escapeHtml(openReports)}`)
      + button(adminUrl, 'Review it'),
  });
  return { subject, text, html };
}
