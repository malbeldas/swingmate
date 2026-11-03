// BR-ROS-006: a visitor's roster lives only in this browser session. A roster isn't personal data
// (no name, email or place), so it may sit in sessionStorage; it is gone when the tab closes.
import { parseStoredRoster } from '../core/roster.js';

const KEY = 'swingmate.visitorRoster';

export function readVisitorRoster() {
  try { return parseStoredRoster(sessionStorage.getItem(KEY)); } catch { return null; }
}

export function writeVisitorRoster(roster) {
  try { sessionStorage.setItem(KEY, JSON.stringify(roster)); } catch { /* private mode: nothing to keep */ }
}

export function clearVisitorRoster() {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing stored */ }
}
