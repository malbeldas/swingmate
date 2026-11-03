import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PARITY_TEST_PATH, availabilityPgtap } from '../fixtures/availability-pgtap.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/availability.json', import.meta.url), 'utf8'));

test('listing_nights parity test is generated from the current availability fixture', () => {
  const onDisk = readFileSync(new URL(`../../${PARITY_TEST_PATH}`, import.meta.url), 'utf8');
  assert.equal(onDisk, availabilityPgtap(fixture),
    'Run: node tests/fixtures/availability-pgtap.js > supabase/tests/database/08_listing_nights_parity.sql');
});

test('every fixture case becomes one pgTAP assertion', () => {
  const sql = availabilityPgtap(fixture);
  assert.match(sql, new RegExp(`select plan\\(${fixture.cases.length}\\);`));
  assert.equal(sql.match(/select is\(public\.listing_nights_at/g).length, fixture.cases.length);
});
