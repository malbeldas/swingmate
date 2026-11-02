import { box, escapeHtml, layout, paragraph, button, COLORS, textFooter, tidy } from './layout.js';

// NTF-003 (specs/notifications-new-message.md). Up to 3 unread messages, each cut to 300
// characters and shown as written (BR-MSG-004); nothing else about either account is added.
export const MAX_MESSAGES = 3;
export const MAX_MESSAGE_LENGTH = 300;

export function clip(text, max = MAX_MESSAGE_LENGTH) {
  const s = String(text ?? '').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export function newMessageEmail({
  recipientName, senderName, listingTitle, isInquiry = false, stayLabel, fitLine, rosterSummary,
  messages = [], conversationUrl, settingsUrl,
}) {
  const shown = messages.slice(0, MAX_MESSAGES).map((m) => clip(m));
  const more = messages.length - shown.length;
  const subject = isInquiry ? `${senderName} wants to stay at ${listingTitle}` : `New message from ${senderName}`;

  const inquiryText = isInquiry
    ? [stayLabel && `Dates: ${stayLabel}`, fitLine, rosterSummary && `Roster: ${rosterSummary}`].filter(Boolean).join('\n')
    : '';
  const text = tidy(`Hi ${recipientName},

${senderName} sent you a message about ${listingTitle}.

${inquiryText}

${shown.map((m) => `"${m}"`).join('\n\n')}${more > 0 ? `\n\n+ ${more} more ${more === 1 ? 'message' : 'messages'}` : ''}

Reply on SwingMate: ${conversationUrl}

A quick reply, even a "sorry, not available", helps them keep looking.
Replying to this email won't reach ${senderName}.

${textFooter(settingsUrl)}`);

  const inquiryHtml = isInquiry
    ? box([
      stayLabel && `<strong>Dates:</strong> ${escapeHtml(stayLabel)}`,
      fitLine && escapeHtml(fitLine),
      rosterSummary && `<strong>Roster:</strong> ${escapeHtml(rosterSummary)}`,
    ].filter(Boolean).map((line) => paragraph(line, 'margin:0 0 4px')).join(''), { background: COLORS.tealSoft })
    : '';
  const bubbles = shown.map((m) => `<div style="margin:0 0 8px;padding:12px 14px;border-radius:12px;background:${COLORS.sand};font:15px/22px Inter,Arial,sans-serif;color:${COLORS.text};white-space:pre-wrap">${escapeHtml(m)}</div>`).join('')
    + (more > 0 ? paragraph(`+ ${more} more ${more === 1 ? 'message' : 'messages'}`, `color:${COLORS.muted}`) : '');
  const html = layout({
    preheader: shown[0] ?? '',
    settingsUrl,
    body: paragraph(`Hi ${escapeHtml(recipientName)},`)
      + paragraph(`${escapeHtml(senderName)} sent you a message about <strong>${escapeHtml(listingTitle)}</strong>.`)
      + inquiryHtml
      + bubbles
      + button(conversationUrl, 'Reply on SwingMate')
      + paragraph('A quick reply, even a "sorry, not available", helps them keep looking.')
      + paragraph(`Replying to this email won't reach ${escapeHtml(senderName)}.`, `color:${COLORS.muted};font-size:13px`),
  });
  return { subject, text, html };
}
