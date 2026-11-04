import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BROWSER_EVENTS, checkEvent, CLIENT_ERROR_MAX, EVENTS, SERVER_EVENTS, scrubErrorMessage, shouldLoadGa, gaPageLocation, checkGaEvent, GA_EVENTS,
} from '../../core/analytics.js';
import { ROSTER_PATTERNS } from '../../core/roster.js';

// observability.md §2 is the source of truth: every row there must be in EVENTS, with the same
// properties, and nothing else.
function catalogFromSpec() {
  const md = readFileSync(new URL('../../specs/observability.md', import.meta.url), 'utf8');
  const section = md.split('## 2. Catálogo de eventos')[1].split('## 3.')[0];
  const rows = section.split('\n').filter((l) => /^\| `[a-z_]+` \|/.test(l));
  return Object.fromEntries(rows.map((row) => {
    const cells = row.split('|').map((c) => c.trim());
    // Enumerated values are also in backticks inside parentheses: keep only the property names.
    const names = cells[3].replace(/\([^)]*\)/g, '');
    return [cells[1].replaceAll('`', ''), [...names.matchAll(/`([a-z_]+)`/g)].map((m) => m[1])];
  }));
}

test('BR-ANL-001 the event catalog matches observability.md §2', () => {
  const spec = catalogFromSpec();
  assert.equal(Object.keys(spec).length, 30);
  assert.deepEqual(Object.keys(EVENTS).sort(), Object.keys(spec).sort());
  for (const [name, props] of Object.entries(spec)) assert.deepEqual([...EVENTS[name]].sort(), [...props].sort(), name);
});

test('BR-ANL-001 known events with allowed properties and values pass', () => {
  assert.deepEqual(checkEvent('search_performed', { has_dates: true, has_roster: false, radius_km: 15, n_full: 2, n_strong: 1, n_partial: 0, n_poor: 3, state: 'WA' }), []);
  assert.deepEqual(checkEvent('auth_gate_opened', { source: 'message' }), []);
  assert.deepEqual(checkEvent('message_sent', { conversation_id: '7d1c0e2a-1b8f-4a52-9a37-0f6a1c2b3d4e', role: 'host', risk_flag: false }), []);
  assert.deepEqual(checkEvent('user_blocked'), []);
});

test('SEC-13 unknown names, extra properties and values outside the list are rejected', () => {
  assert.deepEqual(checkEvent('page_scrolled', {}), ['unknown event page_scrolled']);
  const id = '7d1c0e2a-1b8f-4a52-9a37-0f6a1c2b3d4e';
  assert.deepEqual(checkEvent('listing_saved', { listing_id: id, price: 300 }), ['property price not allowed']);
  assert.deepEqual(checkEvent('listing_saved', { listing_id: 'sam@example.com' }), ['listing_id must be an id']);
  assert.deepEqual(checkEvent('auth_gate_opened', { source: 'banner' }),
    ['source must be one of header, message, save, alert, list_place']);
  assert.deepEqual(checkEvent('listing_viewed', { listing_id: id, fit_class: 'great' }),
    ['fit_class must be one of full, strong, partial, poor']);
  assert.deepEqual(checkEvent('landing_viewed', { page: { path: '/' } }), ['page must be a plain value']);
  assert.deepEqual(checkEvent('client_error', { message: 'x'.repeat(2100) }), ['props over 2 KB']);
});

test('BR-ANL-002 events never carry an email or a phone number', () => {
  assert.deepEqual(checkEvent('landing_viewed', { page: 'sam@example.com' }), ['page looks like personal data']);
  assert.deepEqual(checkEvent('client_error', { message: 'failed for 0412 345 678' }), ['message looks like personal data']);
});

test('BR-ANL-002 client errors are scrubbed and cut to 200 characters', () => {
  assert.equal(scrubErrorMessage('Fetch failed for sam@example.com'), 'Fetch failed for [email]');
  assert.equal(scrubErrorMessage('Bad phone +61 412 345 678 in form'), 'Bad phone [number] in form');
  assert.equal(scrubErrorMessage('GET https://swingmate.au/outcome.html?token=abc123 failed'), 'GET https://swingmate.au/outcome.html failed');
  assert.equal(scrubErrorMessage("Cannot read properties of undefined (reading 'x')"), "Cannot read properties of undefined (reading 'x')");
  assert.equal(scrubErrorMessage('x'.repeat(500)).length, CLIENT_ERROR_MAX);
  const scrubbed = scrubErrorMessage('Fetch failed for sam@example.com');
  assert.deepEqual(checkEvent('client_error', { page: 'search', kind: 'network', message: scrubbed }), []);
});

test('DEC-019 GA4 loads only on swingmate.au, with an ID, and never where the database is set up', () => {
  assert.equal(shouldLoadGa({ hostname: 'swingmate.au', measurementId: 'G-ABC123XYZ9', hasDatabase: false }), true);
  assert.equal(shouldLoadGa({ hostname: 'www.swingmate.au', measurementId: 'G-ABC123XYZ9', hasDatabase: false }), true);
  assert.equal(shouldLoadGa({ hostname: 'swingmate.au', measurementId: '', hasDatabase: false }), false);
  assert.equal(shouldLoadGa({ hostname: 'swingmate.au', measurementId: 'UA-123-1', hasDatabase: false }), false);
  assert.equal(shouldLoadGa({ hostname: 'swingmate.au', measurementId: 'G-ABC123XYZ9', hasDatabase: true }), false);
  assert.equal(shouldLoadGa({ hostname: 'localhost', measurementId: 'G-ABC123XYZ9', hasDatabase: false }), false);
  assert.equal(shouldLoadGa({ hostname: 'malbeldas.github.io', measurementId: 'G-ABC123XYZ9', hasDatabase: false }), false);
});

test('DEC-019 and BR-ANL-002 GA4 gets the address without tokens, other parameters or the hash', () => {
  assert.equal(gaPageLocation('https://swingmate.au/?token_hash=abc&type=recovery#faq'), 'https://swingmate.au/');
  assert.equal(
    gaPageLocation('https://swingmate.au/?utm_source=instagram&utm_campaign=launch&email=ana@example.com'),
    'https://swingmate.au/?utm_source=instagram&utm_campaign=launch',
  );
});

test('DEC-019 the GA4 events are a closed list with fixed values (observability.md §6)', () => {
  assert.deepEqual(checkGaEvent('cta_clicked', { cta: 'try_roster' }), []);
  assert.deepEqual(checkGaEvent('roster_example_used', { pattern: '8:6' }), []);
  assert.deepEqual(ROSTER_PATTERNS.map((p) => p.label), GA_EVENTS.roster_example_used.pattern);
  assert.deepEqual(checkGaEvent('cta_clicked', { cta: 'ana@example.com' }), ['cta must be one of instagram_hero, try_roster, instagram_hosts, instagram_footer']);
  assert.deepEqual(checkGaEvent('cta_clicked', {}), ['cta missing']);
  assert.deepEqual(checkGaEvent('signup_completed', { method: 'email' }), ['unknown event signup_completed']);
});

test('DEC-019 the GA4 event list matches observability.md §6', () => {
  const md = readFileSync(new URL('../../specs/observability.md', import.meta.url), 'utf8');
  const section = md.split('## 6. Visitas de la página pública (GA4)')[1].split('\n## ')[0];
  const rows = section.split('\n').filter((l) => /^\| `[a-z_]+` \|/.test(l)).map((l) => l.split('|')[1].trim().replaceAll('`', ''));
  assert.deepEqual(rows.sort(), Object.keys(GA_EVENTS).sort());
});

// The migration repeats both lists: the CHECK on every name and the P-26 policy on the names the
// browser may write.
function sqlList(sql, marker) {
  const at = sql.indexOf(marker);
  const open = sql.indexOf('(', sql.indexOf(' in (', at) + 1);
  const close = sql.indexOf(')', open);
  return [...sql.slice(open, close).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
}

test('BR-ANL-001 and P-26 the base knows the same events, and the browser writes only its own', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261116090000_analytics.sql', import.meta.url), 'utf8');
  assert.deepEqual(sqlList(sql, 'name text not null check'), Object.keys(EVENTS).sort());
  assert.deepEqual(sqlList(sql, '"P-26 analytics_events browser events"'), [...BROWSER_EVENTS].sort());
  for (const name of SERVER_EVENTS) assert.ok(EVENTS[name], name);
  assert.equal(BROWSER_EVENTS.length + SERVER_EVENTS.length, 30);
});

test('BR-ANL-002 a uuid with long runs of digits is an id, not a phone number', () => {
  assert.deepEqual(checkEvent('listing_viewed', { listing_id: '12345678-1234-4123-8123-123456789012', fit_class: 'full' }), []);
  assert.deepEqual(checkEvent('message_draft_started', { listing_id: '00000000-0000-0000-0000-00000000f001', logged_in: false }), []);
});

test('observability.md §3 the weekly metrics turn counts into the pilot rates', async () => {
  const { metricsRows, METRICS } = await import('../../core/analytics.js');
  const [week, empty] = metricsRows([
    { week_start: '2026-11-30', visitors: 40, signups: 9, profiles_completed: 7, active_listings: 12, searches: 50,
      searches_with_fit: 35, listing_views: 80, send_clicks: 12, gate_opens_message: 10, signups_from_message: 6,
      conversations: 8, replied_48h: 6, median_reply_hours: '5.5', agreements: 2 },
    { week_start: '2026-11-23', visitors: 0, signups: 0, profiles_completed: 0, active_listings: 0, searches: 0,
      searches_with_fit: 0, listing_views: 0, send_clicks: 0, gate_opens_message: 0, signups_from_message: 0,
      conversations: 0, replied_48h: 0, median_reply_hours: null, agreements: 0 },
  ]);
  assert.equal(METRICS.length, 12);
  assert.equal(week.label, 'Week of 30 Nov 2026');
  const value = (row, key) => row.cells.find((c) => c.key === key).value;
  assert.equal(value(week, 'fit'), '70%');
  assert.equal(value(week, 'send'), '15%');
  assert.equal(value(week, 'gate'), '60%');
  assert.equal(value(week, 'reply'), '75%');
  assert.equal(value(week, 'hours'), '5.5');
  assert.equal(value(week, 'listings'), '12');
  // An empty week shows a dash, never "NaN%".
  assert.equal(value(empty, 'reply'), '–');
  assert.equal(value(empty, 'hours'), '–');
});

test('observability.md §2 landing_viewed says only the kind of source', async () => {
  const { landingSource } = await import('../../core/analytics.js');
  assert.equal(landingSource('https://swingmate.au/search.html', ''), 'direct');
  assert.equal(landingSource('https://swingmate.au/search.html?utm_source=instagram&utm_campaign=bio', ''), 'social');
  assert.equal(landingSource('https://swingmate.au/listing.html?utm_medium=email', ''), 'email');
  assert.equal(landingSource('https://swingmate.au/', 'https://l.instagram.com/'), 'social');
  assert.equal(landingSource('https://swingmate.au/', 'https://www.google.com/'), 'other');
  assert.equal(landingSource('https://swingmate.au/listing.html', 'https://swingmate.au/search.html'), 'direct');
  assert.equal(landingSource('https://swingmate.au/', 'not a url'), 'other');
});
