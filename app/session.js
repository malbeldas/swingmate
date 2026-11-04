// Session and profile of the person using the page (engineering-constitution.md §3).
import { getClient } from './db.js';
import { rosterFromRow, rosterToRow } from '../core/roster.js';

// Placeholder until the lawyer's Terms and Privacy exist (decision-log.md Q-01, DEC-017).
export const TERMS_VERSION = 'uat-2026-11';

const PROFILE_COLUMNS = 'id, display_name, base_suburb_id, bio, photo_path, work_type, is_seeking, is_hosting, terms_accepted_at, message_rule';
const ROSTER_COLUMNS = 'days_on, days_off, anchor_date, fly_home_last_day, fly_out_first_day';

export async function getSessionUser() {
  const db = await getClient();
  if (!db) return { data: null, error: null };
  const { data, error } = await db.auth.getSession();
  return { data: data?.session?.user ?? null, error };
}

export async function getOwnProfile(userId) {
  const db = await getClient();
  if (!db) return { data: null, error: null };
  return db.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
}

// BR-ACC-003: the minimum profile. The database has the final word (profile_is_ready).
export function profileComplete(profile) {
  return Boolean(profile?.display_name && profile?.base_suburb_id && profile?.terms_accepted_at);
}

export async function signOut() {
  const db = await getClient();
  if (!db) return { error: null };
  return db.auth.signOut();
}

// Fires on sign in, sign out and token refresh.
export async function onAuthChange(callback) {
  const db = await getClient();
  if (!db) return () => {};
  const { data } = db.auth.onAuthStateChange((event, session) => callback(event, session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

// P-05: the person's own roster, or null for "No fixed roster".
export async function getOwnRoster(userId) {
  const db = await getClient();
  if (!db) return { data: null, error: null };
  const { data, error } = await db.from('rosters').select(ROSTER_COLUMNS).eq('user_id', userId).maybeSingle();
  return { data: rosterFromRow(data), error };
}

export async function saveOwnRoster(userId, roster) {
  const db = await getClient();
  return db.from('rosters').upsert({ user_id: userId, ...rosterToRow(roster) });
}

// BR-ROS-005: "No fixed roster" is no row.
export async function deleteOwnRoster(userId) {
  const db = await getClient();
  return db.from('rosters').delete().eq('user_id', userId);
}

// schema.md §11: avatars are public by URL.
export async function photoUrl(path) {
  if (!path) return '';
  const db = await getClient();
  return db ? db.storage.from('avatars').getPublicUrl(path).data.publicUrl : '';
}
