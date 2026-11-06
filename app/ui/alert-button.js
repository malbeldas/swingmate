// "Create an alert" on the results (UC-006, #31). It saves the search on screen: place, radius, dates
// or the roster, and the filters. Without an account it opens the sign-up (source 'alert') and saves
// once the person is in; a Google sign-in leaves the page, so a flag waits in sessionStorage (never
// the search itself, which stays in the URL) and the alert is saved when they come back.
import { getClient } from '../db.js';
import { trackEvent } from '../events.js';
import { getOwnProfile, getOwnRoster, profileComplete } from '../session.js';
import { openAuthSheet } from './auth-sheet.js';
import { el } from './dom.js';
import { ALERT_TEXTS, alertFromSearch } from '../../core/alerts.js';

const PENDING_KEY = 'swingmate.pendingAlert';
const created = new Set(); // searches saved on this page, so the box says so after a redraw

function setPending(on) {
  try {
    if (on) sessionStorage.setItem(PENDING_KEY, '1');
    else sessionStorage.removeItem(PENDING_KEY);
  } catch { /* storage off: the alert is saved only if the sheet finishes on this page */ }
}

function takePending() {
  try {
    const on = sessionStorage.getItem(PENDING_KEY) === '1';
    sessionStorage.removeItem(PENDING_KEY);
    return on;
  } catch { return false; }
}

function keyOf(alert) {
  return JSON.stringify(alert);
}

// search(): { placeId, radiusKm, checkIn, checkOut, roster, filters, user }
async function save(search, user) {
  const { data: roster } = search.checkIn && search.checkOut ? { data: null } : await getOwnRoster(user.id);
  const alert = alertFromSearch({ ...search, hasRoster: Boolean(roster ?? search.roster) });
  if (!alert) return { error: 'failed' };
  if (created.has(keyOf(alert))) return { ok: true };
  const db = await getClient();
  const { error } = await db.from('search_alerts').insert({ user_id: user.id, ...alert });
  if (error) return { error: error.code === 'P0001' ? 'limit' : 'failed' };
  created.add(keyOf(alert));
  trackEvent('alert_created', { has_dates: !alert.use_roster, has_roster: alert.use_roster });
  return { ok: true };
}

// The box under the results or in the empty state. null when the search has no nights to fit.
export function alertBox(search) {
  const current = search();
  const preview = alertFromSearch({ ...current, hasRoster: Boolean(current.roster) });
  if (!preview) return null;
  const box = el('div', { class: 'alert-box stack-tight', id: 'alert-box' });
  const error = el('p', { class: 'form-error small', role: 'alert', hidden: true });
  const done = () => box.replaceChildren(el('p', { class: 'notice', role: 'status', id: 'alert-created' },
    `${ALERT_TEXTS.created} `, el('a', { href: 'account.html#alerts' }, ALERT_TEXTS.manage)));
  const fail = (reason) => { error.textContent = ALERT_TEXTS[reason] ?? ALERT_TEXTS.failed; error.hidden = false; };
  const run = async (user) => {
    const result = await save(search(), user);
    if (result.ok) return done();
    return fail(result.error);
  };
  const button = el('button', {
    type: 'button', class: 'btn btn-secondary btn-sm', id: 'create-alert',
    onclick: async () => {
      error.hidden = true;
      const { user } = search();
      if (user) return run(user);
      setPending(true);
      const finish = async (who) => {
        const { data: profile } = await getOwnProfile(who.id);
        if (!profileComplete(profile)) return openAuthSheet({ step: 'profile', user: who, onDone: finish });
        setPending(false);
        return run(who);
      };
      return openAuthSheet({ step: 'signup', source: 'alert', onDone: finish });
    },
  }, ALERT_TEXTS.create);
  if (created.has(keyOf(preview))) done();
  else box.replaceChildren(button, error);
  return box;
}

// Back from Google on the results: save the alert for the search on screen, once.
export async function resumePendingAlert(search) {
  const { user } = search();
  if (!user || !takePending()) return;
  const result = await save(search(), user);
  const box = document.getElementById('alert-box');
  if (box && result.ok) box.replaceWith(alertBox(search) ?? box);
}
