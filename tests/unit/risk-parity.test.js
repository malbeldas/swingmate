import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PARITY_TEST_PATH, riskCheckSql, riskParityPgtap } from '../fixtures/risk-sql.js';
import { riskCheck } from '../../core/text-checks.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/text-checks.json', import.meta.url), 'utf8'));
const migrations = new URL('../../supabase/migrations/', import.meta.url);

test('BR-MSG-008 the newest migration that defines risk_check carries the list in core/text-checks.js', () => {
  const defining = readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => readFileSync(new URL(f, migrations), 'utf8'))
    .filter((sql) => sql.includes('function public.risk_check('));
  assert.ok(defining.length > 0, 'no migration defines public.risk_check');
  assert.ok(defining.at(-1).includes(riskCheckSql()),
    'The phrases changed: add a migration with the output of node tests/fixtures/risk-sql.js function');
});

test('AC-033-3 risk_check parity test is generated from the current fixture', () => {
  const onDisk = readFileSync(new URL(`../../${PARITY_TEST_PATH}`, import.meta.url), 'utf8');
  assert.equal(onDisk, riskParityPgtap(fixture), `Run: node tests/fixtures/risk-sql.js parity > ${PARITY_TEST_PATH}`);
});

test('AC-033-3 the fixture agrees with riskCheck, so the SQL twin is held to the same answers', () => {
  for (const c of fixture.cases) assert.equal(riskCheck(c.text).risk, c.risk, c.text);
  assert.ok(fixture.cases.some((c) => c.risk) && fixture.cases.some((c) => !c.risk));
});
