// delete-account (UC-035, BR-ACC-007, roles-permissions.md §4). The person's own session calls it;
// it checks the 5-minute sign-in, removes their photos from Storage and deletes the account through
// delete_account. The database and Storage are passed in, so node:test runs it with fakes.
import { signedInRecently } from '../../../core/privacy.js';

// user: the auth user of the caller's token (null when the token is not valid).
// store: { storagePaths(userId) -> { avatars, listing_photos }, deleteAccount(userId) -> { ok },
//          removeFiles(bucket, paths) -> { error } }
// Returns { status, body }.
export async function runDeleteAccount({ user, store, now = new Date() }) {
  if (!user?.id) return { status: 401, body: { ok: false, reason: 'unauthorized' } };
  if (!signedInRecently(user.last_sign_in_at, now)) return { status: 403, body: { ok: false, reason: 'reauth' } };

  // The paths first: once the rows are gone, nothing says which files were theirs.
  const paths = await store.storagePaths(user.id);
  const result = await store.deleteAccount(user.id);
  if (!result?.ok) return { status: 500, body: { ok: false, reason: result?.reason ?? 'failed' } };

  // The account is gone either way; a file that couldn't be removed is reported, and the daily
  // cleanup removes it, since no row points to it any more (cleanup_orphan_files).
  const leftovers = [];
  for (const [bucket, list] of [['avatars', paths?.avatars ?? []], ['listing-photos', paths?.listing_photos ?? []]]) {
    if (!list.length) continue;
    const { error } = await store.removeFiles(bucket, list);
    if (error) leftovers.push(bucket);
  }
  return { status: 200, body: { ok: true, ...(leftovers.length && { leftovers }) } };
}
