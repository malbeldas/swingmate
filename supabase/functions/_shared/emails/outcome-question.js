import { OUTCOME_ANSWERS } from '../../../../core/outcome.js';
import { button, layout, paragraph, escapeHtml, textFooter, tidy } from './layout.js';

// NTF-005 (specs/notifications-outcome-question.md). Carries "Manage email settings" and is switched
// off with the reminders setting (BR-MAIL-005); replies go to support@swingmate.au.
export { OUTCOME_ANSWERS };

// `answerUrl(answer)` is the one-tap link for that answer (email-action.html, core/email-actions.js).
export function outcomeQuestionEmail({ seekerName, listingTitle, hostName, answerUrl, settingsUrl }) {
  const subject = `Did you find a place, ${seekerName}?`;
  const text = tidy(`Hi ${seekerName},

Two weeks ago you messaged ${hostName} about ${listingTitle}. Did you find a place?

${OUTCOME_ANSWERS.map((o) => `${o.label}: ${answerUrl(o.answer)}`).join('\n')}

One tap is enough. It helps us make SwingMate better for people on rosters.
If you want to tell us more, just reply to this email.

${textFooter(settingsUrl)}`);
  const html = layout({
    preheader: 'One tap is enough.',
    body: paragraph(`Hi ${escapeHtml(seekerName)},`)
      + paragraph(`Two weeks ago you messaged ${escapeHtml(hostName)} about <strong>${escapeHtml(listingTitle)}</strong>. Did you find a place?`)
      + OUTCOME_ANSWERS.map((o) => button(answerUrl(o.answer), o.label, { secondary: true })).join('')
      + paragraph('One tap is enough. It helps us make SwingMate better for people on rosters.')
      + paragraph('If you want to tell us more, just reply to this email.'),
    settingsUrl,
  });
  return { subject, text, html };
}
