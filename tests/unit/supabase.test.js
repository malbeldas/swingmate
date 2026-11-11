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

// DEC-017: UAT test listings live outside the migrations, only touch their own ids and are loaded by
// one manual workflow that the repo owner runs; deploy-db never loads them.
test('DEC-017 the UAT test data only touches its own listings and only its workflow loads it', () => {
  const load = read('scripts/uat/load.sql');
  const remove = read('scripts/uat/remove.sql');
  const prefix = '00000000-0000-4000-8000-0000001';
  assert.ok(load.includes(`'${prefix}' || lpad(`), 'listing ids carry the UAT prefix');
  assert.match(remove, new RegExp(`^delete from public\\.listings where id::text like '${prefix}%';$`, 'm'));
  assert.equal((remove.match(/\bdelete\b/gi) ?? []).length, 1, 'remove.sql deletes nothing else');
  assert.doesNotMatch(load, /\b(delete|truncate|drop)\b/i);
  assert.match(load, /UAT test: /, 'every title says it is a test');
  assert.doesNotMatch(read('.github/workflows/deploy-db.yml'), /scripts\/uat/);
  const wf = read('.github/workflows/uat-test-data.yml');
  assert.match(wf, /workflow_dispatch/);
  assert.doesNotMatch(wf, /^\s+(push|pull_request|schedule):/m, 'only by hand');
  assert.match(wf, /github\.actor != github\.repository_owner \|\| github\.triggering_actor != github\.repository_owner/);
  assert.match(wf, /inputs\.confirmar != 'uat'/);
  assert.ok(wf.includes(`PREFIX: ${prefix}`), 'the workflow uses the same prefix');
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

test('NTF-001 AC-1 the sign-up email carries the code in subject and body, and no link', () => {
  const html = read('supabase/templates/email-code.html');
  assert.match(html, /\{\{ \.Token \}\}/);
  assert.doesNotMatch(html, /ConfirmationURL|href=/);
  assert.match(html, /It expires in 1 hour\./);
  const config = read('supabase/config.toml');
  assert.match(config, /\[auth\.email\.template\.confirmation\]\nsubject = "Your SwingMate code: \{\{ \.Token \}\}"\ncontent_path = "\.\/supabase\/templates\/email-code\.html"/);
});

test('NTF-002 the reset email links to the site with a one-time token, and keeps the spec text', () => {
  const html = read('supabase/templates/password-reset.html');
  assert.match(html, /href="\{\{ \.SiteURL \}\}\/\?token_hash=\{\{ \.TokenHash \}\}&amp;type=recovery"/);
  assert.match(html, />Choose a new password</);
  assert.match(html, /Someone asked to reset the password for your SwingMate account\./);
  assert.match(html, /This link works once and expires in 1 hour\. If it wasn't you, ignore this email: your password stays the same\./);
  const config = read('supabase/config.toml');
  assert.match(config, /\[auth\.email\.template\.recovery\]\nsubject = "Reset your SwingMate password"\ncontent_path = "\.\/supabase\/templates\/password-reset\.html"/);
});

test('BR-ACC-002 and SEC-08 auth settings: email code on, 8-character passwords, 1 email a minute', () => {
  const config = read('supabase/config.toml');
  const emailSection = config.slice(config.indexOf('[auth.email]'));
  assert.match(emailSection, /enable_confirmations = true/);
  assert.match(emailSection, /max_frequency = "60s"/);
  assert.match(emailSection, /otp_length = 6/);
  assert.match(config, /minimum_password_length = 8/);
  assert.match(config, /\[auth\.hook\.before_user_created\]\nenabled = true\nuri = "pg-functions:\/\/postgres\/public\/hook_before_user_created"/);
});
