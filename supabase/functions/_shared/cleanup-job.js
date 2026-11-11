// cleanup (BR-PRV-003, infrastructure.md §4). Once a day: the database part (removed listings after
// 90 days, past exceptions, reports and moderation entries after 2 years, phone code events after
// 2 days) runs in cleanup_run; then the files no row points to are removed from Storage, in batches,
// so a purged listing's photos, a deleted account's leftovers and unsaved uploads don't stay. The
// database and Storage are passed in, so node:test runs it with fakes.

export const BATCH = 100;

// store: { run() -> counts, orphanFiles() -> [{ bucket, path }], remove(bucket, paths) -> { error } }
// Returns { database, files: { removed, failed } }. A batch that fails is tried again the next day,
// because its files are still listed.
export async function runCleanup({ store }) {
  const database = await store.run();
  const byBucket = new Map();
  for (const { bucket, path } of (await store.orphanFiles()) ?? []) {
    if (!['listing-photos', 'avatars'].includes(bucket) || !path) continue;
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket).push(path);
  }
  let removed = 0;
  let failed = 0;
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += BATCH) {
      const batch = paths.slice(i, i + BATCH);
      const { error } = await store.remove(bucket, batch);
      if (error) failed += batch.length;
      else removed += batch.length;
    }
  }
  return { database, files: { removed, failed } };
}
