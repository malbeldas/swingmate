// BR-ACC-005: the message written before signing up lives in this browser session (never in
// localStorage, the URL or analytics) and is deleted when it is sent. One draft at a time.
import { parseDraft } from '../core/messaging.js';

const KEY = 'swingmate.messageDraft';

export function readDraft(listingId) {
  try { return parseDraft(sessionStorage.getItem(KEY), listingId); } catch { return null; }
}

export function writeDraft(draft) {
  try { sessionStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* private mode: the box still holds it */ }
}

export function clearDraft() {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing stored */ }
}
