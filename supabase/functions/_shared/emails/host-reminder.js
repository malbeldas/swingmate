import { button, link, layout, paragraph, escapeHtml, textFooter, tidy } from './layout.js';

// NTF-004 (specs/notifications-host-reminder.md).
export function hostReminderEmail({ hostName, seekerName, listingTitle, stayLabel, conversationUrl, pauseUrl, settingsUrl }) {
  const subject = `${seekerName} is still waiting for your reply`;
  const text = tidy(`Hi ${hostName},

${seekerName} asked about ${listingTitle} for ${stayLabel} two days ago.

Reply on SwingMate: ${conversationUrl}

Not a fit? A short "sorry, not available" helps them keep looking.
Room already taken? Mark your listing as filled: ${pauseUrl}

${textFooter(settingsUrl)}`);
  const html = layout({
    preheader: `${seekerName} asked about ${listingTitle} two days ago.`,
    settingsUrl,
    body: paragraph(`Hi ${escapeHtml(hostName)},`)
      + paragraph(`${escapeHtml(seekerName)} asked about <strong>${escapeHtml(listingTitle)}</strong> for ${escapeHtml(stayLabel)} two days ago.`)
      + button(conversationUrl, 'Reply')
      + paragraph('Not a fit? A short "sorry, not available" helps them keep looking.')
      + paragraph(`Room already taken? ${link(pauseUrl, 'Mark as filled')}`),
  });
  return { subject, text, html };
}
