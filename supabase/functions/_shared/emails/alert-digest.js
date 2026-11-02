import { button, COLORS, escapeHtml, layout, link, paragraph, safeUrl, SIGN_OFF, tidy } from './layout.js';

// NTF-007 (specs/notifications-alert-digest.md). One email per person per run with every new
// full or strong home; the HTML shows up to 5 cards and links to the rest.
export const MAX_CARDS = 5;

// items: [{ title, suburb, price, fitLabel, fitLine, url, photoUrl? }]
export function alertDigestEmail({ name, items, alertLabel, manageUrl, seeAllUrl }) {
  if (!items?.length) throw new RangeError('An alert email needs at least one home');
  const n = items.length;
  const subject = n === 1 ? `A home that fits: ${items[0].title}` : `${n} homes that fit your roster`;
  const text = tidy(`Hi ${name},

New on SwingMate for ${alertLabel}:

${items.map((i) => `${i.title}, ${i.suburb} · $${i.price}/week · ${i.fitLabel}\n${i.fitLine}\n${i.url}`).join('\n\n')}

Manage your alerts: ${manageUrl}
${SIGN_OFF}`);
  const cards = items.slice(0, MAX_CARDS).map((i) => `<a href="${safeUrl(i.url)}" style="display:block;margin:0 0 12px;border:1px solid ${COLORS.line};border-radius:12px;overflow:hidden;text-decoration:none;color:${COLORS.text}">`
    + (i.photoUrl ? `<img src="${safeUrl(i.photoUrl)}" alt="${escapeHtml(i.title)}" width="552" style="display:block;width:100%;height:auto;border:0">` : '')
    + `<div style="padding:12px 14px;font:15px/22px Inter,Arial,sans-serif">`
    + `<div style="font-weight:600;color:${COLORS.navy}">${escapeHtml(i.title)}</div>`
    + `<div>${escapeHtml(i.suburb)} · $${escapeHtml(i.price)}/week</div>`
    + `<div style="display:inline-block;margin:6px 0 4px;padding:2px 8px;border-radius:999px;background:${COLORS.tealSoft};color:#1F5E5A;font-size:13px">${escapeHtml(i.fitLabel)}</div>`
    + `<div style="color:${COLORS.muted};font-size:13px">${escapeHtml(i.fitLine)}</div>`
    + `</div></a>`).join('');
  const html = layout({
    preheader: subject,
    body: paragraph(`Hi ${escapeHtml(name)},`)
      + paragraph(`New on SwingMate for ${escapeHtml(alertLabel)}:`)
      + cards
      + (n > MAX_CARDS && seeAllUrl ? button(seeAllUrl, `See all ${n} homes`) : '')
      + paragraph(link(manageUrl, 'Manage your alerts')),
  });
  return { subject, text, html };
}
