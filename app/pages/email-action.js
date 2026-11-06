// One tap from an email, no login (UC-054 AC-054-1). The email's button opens this page with the
// signed token after the #; the page sends it to the Edge Function that acts on it. Mail scanners
// that only fetch the page don't run this script, so nothing happens without the person.
import { getClient } from '../db.js';
import { initEvents, trackEvent } from '../events.js';
import { el } from '../ui/dom.js';
import { EMAIL_ACTION_TEXTS as T, readEmailAction } from '../../core/email-actions.js';

const main = document.getElementById('action-main');
const FUNCTIONS = { calendar: 'calendar-confirm' };
const NTFS = ['NTF-003', 'NTF-004', 'NTF-005', 'NTF-006', 'NTF-007'];

function show(lead, ...rest) {
  main.replaceChildren(el('p', { class: 'lead', role: 'status', id: 'action-result' }, lead), ...rest.filter(Boolean));
}

const homeLink = () => el('a', { class: 'link-btn', href: './' }, T.home);
const placesLink = () => el('a', { class: 'btn btn-primary btn-sm', href: 'account.html#listings' }, T.manage);

async function init() {
  const { action, ntf, token } = readEmailAction(location.href);
  // The token leaves the address bar at once, so it isn't kept in the history or shared by mistake.
  history.replaceState(null, '', location.pathname + location.search);
  const db = await getClient();
  if (!db) return show(T.failed, homeLink());
  initEvents('email-action');
  if (NTFS.includes(ntf)) trackEvent('email_clicked', { ntf });
  const fn = FUNCTIONS[action];
  if (!fn || !token) return show(T.invalid, homeLink());

  const { data, error } = await db.functions.invoke(fn, { method: 'POST', body: { token } });
  let body = data;
  if (error) {
    try { body = await error.context?.json?.(); } catch { body = null; }
  }
  if (body?.ok) {
    trackEvent('calendar_confirmed', { listing_id: body.listing_id, source: 'email' });
    return show(T.calendarDone(body.title), el('p', {}, T.calendarNext), placesLink());
  }
  if (body?.reason === 'expired') return show(T.expired, el('p', {}, T.expiredNext), placesLink());
  if (body?.reason === 'invalid') return show(T.invalid, homeLink());
  if (body?.reason === 'status' || body?.reason === 'not_found') return show(T.status, homeLink());
  return show(T.failed, homeLink());
}

init();
