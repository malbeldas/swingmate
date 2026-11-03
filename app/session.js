// Session and profile of the person using the page (engineering-constitution.md §3).
import { getClient } from './db.js';

// Placeholder until the lawyer's Terms and Privacy exist (decision-log.md Q-01, DEC-017).
export const TERMS_VERSION = 'uat-2026-11';

const PROFILE_COLUMNS = 'id, display_name, base_suburb_id, is_seeking, is_hosting, terms_accepted_at';

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
