import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATCH, runCleanup } from '../../supabase/functions/_shared/cleanup-job.js';

function fakeStore({ files = [], failBucket = null } = {}) {
  const calls = [];
  return {
    calls,
    async run() { calls.push(['run']); return { listings: 1 }; },
    async orphanFiles() { calls.push(['orphans']); return files; },
    async remove(bucket, paths) {
      calls.push(['remove', bucket, paths.length]);
      return { error: bucket === failBucket ? { message: 'boom' } : null };
    },
  };
}

test('BR-PRV-003 the database part runs first, then the files no row points to are removed by bucket', async () => {
  const store = fakeStore({ files: [
    { bucket: 'listing-photos', path: 'l1/0.jpg' }, { bucket: 'avatars', path: 'u1/a.jpg' }, { bucket: 'listing-photos', path: 'l1/1.jpg' },
  ] });
  const out = await runCleanup({ store });
  assert.deepEqual(out, { database: { listings: 1 }, files: { removed: 3, failed: 0 } });
  assert.deepEqual(store.calls, [['run'], ['orphans'], ['remove', 'listing-photos', 2], ['remove', 'avatars', 1]]);
});

test('BR-PRV-003 many files go in batches, and a failed bucket is counted to be tried the next day', async () => {
  const files = Array.from({ length: BATCH + 5 }, (_, i) => ({ bucket: 'listing-photos', path: `l/${i}.jpg` }));
  files.push({ bucket: 'avatars', path: 'u/a.jpg' });
  const store = fakeStore({ files, failBucket: 'avatars' });
  const out = await runCleanup({ store });
  assert.deepEqual(out.files, { removed: BATCH + 5, failed: 1 });
  assert.deepEqual(store.calls.filter(([k]) => k === 'remove').map(([, , n]) => n), [BATCH, 5, 1]);
});

test('BR-PRV-003 only the two photo buckets are ever touched', async () => {
  const store = fakeStore({ files: [{ bucket: 'other', path: 'x' }, { bucket: 'avatars', path: '' }] });
  const out = await runCleanup({ store });
  assert.deepEqual(out.files, { removed: 0, failed: 0 });
  assert.equal(store.calls.some(([k]) => k === 'remove'), false);
});
