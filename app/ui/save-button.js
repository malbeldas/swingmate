// The Save button of a card and of the detail (UC-005, AC-005-1). Without an account it opens the
// sign-up (source 'save') and saves once the person is in; a Google sign-in leaves the page, so the
// listing id waits in sessionStorage (an id, never personal data) and is saved when they come back.
import { getClient } from '../db.js';
import { trackEvent } from '../events.js';
import { getOwnProfile, getSessionUser, profileComplete } from '../session.js';
import { openAuthSheet } from './auth-sheet.js';
import { el } from './dom.js';
import { SAVED_TEXTS, saveButtonState } from '../../core/saved.js';

const PENDING_KEY = 'swingmate.pendingSave';
const saved = new Set();
let user = null;
let loaded = null;

const HEART = 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z';

function heart() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'heart');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', HEART);
  svg.append(path);
  return svg;
}

function paint(id) {
  const state = saveButtonState(saved.has(id));
  for (const button of document.querySelectorAll(`.save-btn[data-listing="${CSS.escape(id)}"]`)) {
    button.setAttribute('aria-pressed', state.pressed);
    button.querySelector('.save-label').textContent = state.text;
  }
}

function readPending() {
  try { return sessionStorage.getItem(PENDING_KEY); } catch { return null; }
}

function writePending(id) {
  try {
    if (id) sessionStorage.setItem(PENDING_KEY, id);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch { /* storage off: the save happens only if the sheet finishes on this page */ }
}

// The ids this person saved, once per page. Call again with the new user after signing in or out.
export async function loadSaved(nextUser) {
  user = nextUser ?? null;
  saved.clear();
  loaded = (async () => {
    if (!user) return;
    const db = await getClient();
    const { data } = await db.from('saved_listings').select('listing_id');
    for (const row of data ?? []) saved.add(row.listing_id);
  })();
  await loaded;
  for (const button of document.querySelectorAll('.save-btn')) paint(button.dataset.listing);
  const pending = readPending();
  if (user && pending) {
    writePending(null);
    if (!saved.has(pending)) await setSaved(pending, true);
  }
}

export function isSaved(id) {
  return saved.has(id);
}

// Saves or removes, and repaints every button of that listing. Returns false when the base refused.
export async function setSaved(id, on) {
  const db = await getClient();
  const { error } = on
    ? await db.from('saved_listings').insert({ user_id: user.id, listing_id: id })
    : await db.from('saved_listings').delete().eq('user_id', user.id).eq('listing_id', id);
  if (error && !(on && error.code === '23505')) return false;
  if (on) saved.add(id); else saved.delete(id);
  if (on && !error) trackEvent('listing_saved', { listing_id: id });
  paint(id);
  return true;
}

async function signInThenSave(id, onFail) {
  writePending(id);
  const done = async (who) => {
    const { data: profile } = await getOwnProfile(who.id);
    if (!profileComplete(profile)) return openAuthSheet({ step: 'profile', user: who, onDone: done });
    await loadSaved(who);
    if (!saved.has(id) && !(await setSaved(id, true))) onFail();
    return null;
  };
  return openAuthSheet({ step: 'signup', source: 'save', onDone: done });
}

export function saveButton(id, { className = 'btn btn-secondary btn-sm' } = {}) {
  const state = saveButtonState(saved.has(id));
  const error = el('span', { class: 'form-error small', role: 'alert', hidden: true }, SAVED_TEXTS.failed);
  const button = el('button', {
    type: 'button', class: `${className} save-btn`, 'data-listing': id, 'aria-pressed': state.pressed,
    onclick: async () => {
      error.hidden = true;
      const fail = () => { error.hidden = false; };
      await loaded;
      if (!user) {
        const { data } = await getSessionUser();
        if (!data) return signInThenSave(id, fail);
        await loadSaved(data);
      }
      if (!(await setSaved(id, !saved.has(id)))) fail();
      return null;
    },
  }, heart(), el('span', { class: 'save-label' }, state.text));
  return el('span', { class: 'save-wrap' }, button, error);
}
