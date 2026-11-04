// The pilot funnel from the browser (BR-ANL-001, BR-ANL-002, observability.md §2). Only the events
// of the screen go from here; the base records the rest itself (SERVER_EVENTS). Every event passes
// checkEvent first and is dropped if it doesn't, and a failure never reaches the person.
// The tab gets an anonymous id in sessionStorage: it is random, never personal data
// (engineering-constitution.md §10), and it ends with the tab.
import { getClient } from './db.js';
import { BROWSER_EVENTS, checkEvent, landingSource, scrubErrorMessage } from '../core/analytics.js';

const TAB_KEY = 'swingmate.tab';
const MAX_ERRORS_PER_PAGE = 5;

let memoryTab = null;
let isNewTab = false;

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? '00000000-0000-4000-8000-000000000000'.replace(/0/g, () => Math.floor(Math.random() * 16).toString(16));
}

export function tabId() {
  try {
    let id = sessionStorage.getItem(TAB_KEY);
    if (!id) {
      id = newId();
      sessionStorage.setItem(TAB_KEY, id);
      isNewTab = true;
    }
    return id;
  } catch {
    if (!memoryTab) { memoryTab = newId(); isNewTab = true; }
    return memoryTab;
  }
}

export async function trackEvent(name, props = {}) {
  try {
    if (!BROWSER_EVENTS.includes(name) || checkEvent(name, props).length) return false;
    const db = await getClient();
    if (!db) return false;
    const { error } = await db.from('analytics_events').insert({ name, session_id: tabId(), props });
    return !error;
  } catch {
    return false;
  }
}

// Call once per page. landing_viewed goes only on the first page of a tab; errors that nobody
// caught go as client_error, scrubbed and at most five per page.
let started = false;

export function initEvents(page) {
  if (started) return;
  started = true;
  tabId();
  if (isNewTab) trackEvent('landing_viewed', { page, src: landingSource(location.href, document.referrer) });
  let errors = 0;
  const report = (kind, message) => {
    if (errors >= MAX_ERRORS_PER_PAGE) return;
    errors += 1;
    trackEvent('client_error', { page, kind, message: scrubErrorMessage(message) });
  };
  window.addEventListener('error', (e) => report('error', e.message || 'Script error'));
  window.addEventListener('unhandledrejection', (e) => report('rejection', e.reason?.message ?? String(e.reason)));
}
