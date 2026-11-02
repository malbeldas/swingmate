// Shared pieces of every product email (notifications.md, cross-cutting rules 1, 5 and 8).
// Each template is a pure function: data in, { subject, text, html } out. No network, no DOM, so
// node:test runs them and the Edge Function send-email imports them as they are.

export const SIGN_OFF = 'The SwingMate team';

// Product emails people can turn off: "Manage email settings" and a List-Unsubscribe header
// (notifications.md rule 5, BR-MAIL-005). NTF-001, 002, 008 and 009 cannot be turned off.
export const UNSUBSCRIBABLE = ['NTF-003', 'NTF-004', 'NTF-006', 'NTF-007'];

// Brand colours from assets/tokens.css. Email clients ignore CSS variables, so they are copied here.
const C = {
  navy: '#152238', amber: '#E68A4B', cream: '#FAF6EF', white: '#FFFFFF', line: '#E3D9C4',
  sand: '#F1E9D8', text: '#3C4656', muted: '#5C6470', teal: '#2C7A76', tealSoft: '#DCEDEB',
};
export const COLORS = C;

const FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif";
const DISPLAY = "Manrope, 'Segoe UI', Helvetica, Arial, sans-serif";

// Every value from the database or from a person goes through this before it reaches the HTML.
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only http(s) links go into an href; anything else becomes '#'.
export function safeUrl(url) {
  return /^https?:\/\//i.test(String(url ?? '')) ? escapeHtml(url) : '#';
}

export function paragraph(html, style = '') {
  return `<p style="margin:0 0 16px;font:15px/22px ${FONT};color:${C.text};${style}">${html}</p>`;
}

export function button(url, label, { secondary = false } = {}) {
  const bg = secondary ? C.white : C.navy;
  const fg = secondary ? C.navy : C.white;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr>`
    + `<td style="border-radius:8px;background:${bg};border:1px solid ${C.navy}">`
    + `<a href="${safeUrl(url)}" style="display:inline-block;padding:12px 20px;font:600 15px/20px ${FONT};color:${fg};text-decoration:none">${escapeHtml(label)}</a>`
    + `</td></tr></table>`;
}

export function link(url, label) {
  return `<a href="${safeUrl(url)}" style="color:${C.teal};font-weight:600">${escapeHtml(label)}</a>`;
}

export function box(html, { background = C.sand } = {}) {
  return `<div style="margin:0 0 16px;padding:16px;border-radius:12px;background:${background}">${html}</div>`;
}

// One 600 px column, brand header as text so it reads without images (rule 8). The header is the
// existing horizontal logo: "Swing" and "Mate" in Manrope 800, "Mate" in amber (design-system.md).
export function layout({ preheader = '', body, settingsUrl = null }) {
  const footer = [
    settingsUrl ? link(settingsUrl, 'Manage email settings') : '',
    escapeHtml(SIGN_OFF),
  ].filter(Boolean).join('<br>');
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1"><title>SwingMate</title></head>`
    + `<body style="margin:0;padding:0;background:${C.cream}">`
    + `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream}"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.white};border-radius:12px;overflow:hidden">`
    + `<tr><td style="background:${C.navy};padding:16px 24px;font:800 22px/28px ${DISPLAY}">`
    + `<span style="color:${C.cream}">Swing</span><span style="color:${C.amber}">Mate</span></td></tr>`
    + `<tr><td style="padding:24px">${body}</td></tr>`
    + `<tr><td style="padding:16px 24px;border-top:1px solid ${C.line};font:13px/18px ${FONT};color:${C.muted}">${footer}</td></tr>`
    + `</table></td></tr></table></body></html>`;
}

// Text version footer.
export function textFooter(settingsUrl) {
  return [settingsUrl ? `Manage email settings: ${settingsUrl}` : null, SIGN_OFF].filter(Boolean).join('\n');
}

// Collapses blank-line runs and trims, so optional blocks leave no gaps.
export function tidy(text) {
  return text.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
