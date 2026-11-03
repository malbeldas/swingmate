import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  checkEvent, CLIENT_ERROR_MAX, EVENTS, scrubErrorMessage, shouldLoadGa, gaPageLocation, checkGaEvent, GA_EVENTS,
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
  assert.deepEqual(checkEvent('listing_saved', { listing_id: 'a', price: 300 }), ['property price not allowed']);
  assert.deepEqual(checkEvent('auth_gate_opened', { source: 'banner' }),
    ['source must be one of header, message, save, alert, list_place']);
  assert.deepEqual(checkEvent('listing_viewed', { listing_id: 'a', fit_class: 'great' }),
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
