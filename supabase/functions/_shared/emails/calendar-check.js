import { addDays, formatDay } from '../../../../core/dates.js';
import { button, COLORS, escapeHtml, layout, link, paragraph, textFooter, tidy } from './layout.js';

// NTF-006 (specs/notifications-calendar-check.md, BR-AVL-006).
export const CHECK_NIGHTS = 28;

// "Free from 3 Nov, 12 nights in the next 4 weeks", from the listing_nights string that starts on
// `start` (core/availability.js).
export function nextFreeLine(availability, start) {
  const window = availability.slice(0, CHECK_NIGHTS);
  const first = window.indexOf('1');
  if (first < 0) return 'No free nights in the next 4 weeks';
  const count = [...window].filter((c) => c === '1').length;
  return `Free from ${formatDay(addDays(start, first))}, ${count} ${count === 1 ? 'night' : 'nights'} in the next 4 weeks`;
}

// Four weeks as an HTML table: no external images.
export function miniCalendar(availability, start) {
  const rows = [];
  for (let w = 0; w < 4; w++) {
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const i = w * 7 + d;
      const free = availability[i] === '1';
      const day = addDays(start, i);
      cells.push(`<td title="${escapeHtml(formatDay(day))}: ${free ? 'Available' : 'Unavailable'}" style="width:32px;height:28px;text-align:center;border-radius:6px;font:12px/28px Inter,Arial,sans-serif;background:${free ? COLORS.teal : COLORS.line};color:${free ? COLORS.white : COLORS.muted}">${Number(day.slice(8, 10))}</td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table role="presentation" cellpadding="0" cellspacing="4" style="margin:0 0 16px">${rows.join('')}</table>`;
}

export function calendarCheckEmail({ hostName, listingTitle, availability, start, confirmUrl, editUrl, settingsUrl }) {
  const nextFree = nextFreeLine(availability, start);
  const subject = `Is your calendar for ${listingTitle} still right?`;
  const text = tidy(`Hi ${hostName},

People search by dates on SwingMate, so an up-to-date calendar gets you better matches.

Right now ${listingTitle} shows: ${nextFree}.

Yes, it's up to date: ${confirmUrl}
Update my calendar: ${editUrl}

${textFooter(settingsUrl)}`);
  const html = layout({
    preheader: nextFree,
    settingsUrl,
    body: paragraph(`Hi ${escapeHtml(hostName)},`)
      + paragraph('People search by dates on SwingMate, so an up-to-date calendar gets you better matches.')
      + paragraph(`Right now <strong>${escapeHtml(listingTitle)}</strong> shows: ${escapeHtml(nextFree)}.`)
      + miniCalendar(availability, start)
      + button(confirmUrl, "Yes, it's up to date")
      + paragraph(link(editUrl, 'Update my calendar')),
  });
  return { subject, text, html, nextFree };
}
