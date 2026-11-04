// One tap from an email, no login (UC-054 AC-054-1, UC-007 AC-007-1). The email's button opens this page with the
// signed token after the #; the page sends it to the Edge Function that acts on it. Mail scanners
// that only fetch the page don't run this script, so nothing happens without the person.
import { getClient } from '../db.js';
import { initEvents, trackEvent } from '../events.js';
import { el } from '../ui/dom.js';
import { EMAIL_ACTION_TEXTS as T, conversationPath, readEmailAction } from '../../core/email-actions.js';
import { isOutcomeAnswer } from '../../core/outcome.js';

const main = document.getElementById('action-main');
const FUNCTIONS = { calendar: 'calendar-confirm', outcome: 'outcome' };
const NTFS = ['NTF-003', 'NTF-004', 'NTF-005', 'NTF-006', 'NTF-007'];

function show(lead, ...rest) {
  main.replaceChildren(el('p', { class: 'lead', role: 'status', id: 'action-result' }, lead), ...rest.filter(Boolean));
}

const homeLink = () => el('a', { class: 'link-btn', href: './' }, T.home);
const placesLink = () => el('a', { class: 'btn btn-primary btn-sm', href: 'account.html#listings' }, T.manage);
const conversationLink = (id) => id && el('a', { class: 'btn btn-primary btn-sm', href: conversationPath(id) }, T.conversation);

// UC-007: the answer is saved for the conversation the link names; an expired link opens that
// conversation to answer there (E1).
function outcomeResult(body) {
  if (body?.ok) return show(T.outcomeDone, el('p', {}, T.outcomeNext), conversationLink(body.conversation_id));
  if (body?.reason === 'expired') return show(T.expired, el('p', {}, T.outcomeExpiredNext), conversationLink(body.conversation_id));
  if (body?.reason === 'invalid' || body?.reason === 'answer') return show(T.invalid, homeLink());
  if (body?.reason === 'not_found' || body?.reason === 'not_asked') return show(T.outcomeGone, homeLink());
  return show(T.failed, homeLink());
}

async function init() {
  const { action, answer, ntf, token } = readEmailAction(location.href);
  // The token leaves the address bar at once, so it isn't kept in the history or shared by mistake.
  history.replaceState(null, '', location.pathname + location.search);
  const db = await getClient();
  if (!db) return show(T.failed, homeLink());
  initEvents('email-action');
  if (NTFS.includes(ntf)) trackEvent('email_clicked', { ntf });
  const fn = FUNCTIONS[action];
  if (!fn || !token || (action === 'outcome' && !isOutcomeAnswer(answer))) return show(T.invalid, homeLink());

  const payload = action === 'outcome' ? { token, answer } : { token };
  const { data, error } = await db.functions.invoke(fn, { method: 'POST', body: payload });
  let body = data;
  if (error) {
    try { body = await error.context?.json?.(); } catch { body = null; }
  }
  // outcome_answered is recorded by the database when the answer changes (save_outcome).
  if (action === 'outcome') return outcomeResult(body);
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
