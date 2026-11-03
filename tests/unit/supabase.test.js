// Checks on supabase/ that don't need a database: SQL twins of core/ and the
// no-sample-data rule (engineering-constitution.md §8, BR-TRU-006).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { DISPOSABLE_EMAIL_DOMAINS, isDisposableEmail } from '../../core/text-checks.js';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const migrationFiles = readdirSync(new URL('supabase/migrations/', root))
  .filter((f) => f.endsWith('.sql'))
  .sort();
const migrations = migrationFiles.map((f) => ({ file: f, sql: read(`supabase/migrations/${f}`) }));

// The latest definition of a SQL function wins, as when the migrations run in order.
function lastFunctionBody(name) {
  let body = null;
  for (const { sql } of migrations) {
    const re = new RegExp(`create or replace function public\\.${name}\\b[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, 'gi');
    for (const m of sql.matchAll(re)) body = m[1];
  }
  return body;
}

test('AC-030-4 the disposable domain list in SQL matches core/text-checks.js', () => {
  const body = lastFunctionBody('is_disposable_email');
  assert.ok(body, 'is_disposable_email is defined in a migration');
  const list = body.match(/array\[([\s\S]*?)\]/i);
  assert.ok(list, 'is_disposable_email has an array literal');
  const sqlDomains = [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...sqlDomains].sort(), [...DISPOSABLE_EMAIL_DOMAINS].sort());
});

test('AC-030-4 core/isDisposableEmail agrees with the cases the pgTAP test uses', () => {
  assert.equal(isDisposableEmail('someone@mailinator.com'), true);
  assert.equal(isDisposableEmail('Someone@Mail.YOPMAIL.com'), true);
  assert.equal(isDisposableEmail('ana@gmail.com'), false);
  assert.equal(isDisposableEmail('ana@notmailinator.com'), false);
});

test('BR-TRU-006 no migration carries "Sample" data', () => {
  const offenders = migrations.filter(({ sql }) => /\bsample\b/i.test(sql)).map(({ file }) => file);
  assert.deepEqual(offenders, []);
});

test('BR-TRU-006 seed.sql is only used by local and CI, never by a deploy workflow', () => {
  const dir = new URL('.github/workflows/', root);
  const workflows = existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)) : [];
  const offenders = workflows
    .filter((f) => f !== 'ci.yml')
    .filter((f) => /seed\.sql|db reset|--include-seed/.test(read(`.github/workflows/${f}`)));
  assert.deepEqual(offenders, []);
});

test('migrations are named <timestamp>_<name>.sql and never share a timestamp', () => {
  const stamps = migrationFiles.map((f) => {
    assert.match(f, /^\d{14}_[a-z0-9_]+\.sql$/);
    return f.slice(0, 14);
  });
  assert.equal(new Set(stamps).size, stamps.length);
});

test('hard rule 2: every table created in a migration enables RLS', () => {
  const all = migrations.map(({ sql }) => sql).join('\n');
  const tables = [...all.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)].map((m) => m[1]);
  const missing = tables.filter((t) => !new RegExp(`alter table public\\.${t} enable row level security`, 'i').test(all));
  assert.deepEqual(missing, []);
});
