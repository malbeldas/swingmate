import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  checkCustomItems, checkOtherRules, discriminationCheck, isDisposableEmail, normalize,
  REPHRASE_RULES, RISK_WARNING, riskCheck,
} from '../../core/text-checks.js';

const fixtures = JSON.parse(readFileSync(new URL('../fixtures/text-checks.json', import.meta.url), 'utf8'));

for (const c of fixtures.cases) {
  test(`AC-033-3 BR-MSG-008 BR-LST-005 "${c.text}"`, () => {
    assert.equal(riskCheck(c.text).risk, c.risk, 'risk');
    assert.equal(discriminationCheck(c.text).flagged, c.discrimination, 'discrimination');
  });
}

test('BR-MSG-008 the warning text, word by word as the rule gives it', () => {
  assert.equal(RISK_WARNING, 'Never pay before seeing the place. Never send ID documents by chat.');
});

test('BR-MSG-008 the check reads whole words, any case, accents and punctuation aside', () => {
  assert.equal(normalize('  Pay-ID, PAYPAL… Café! '), ' pay id paypal cafe ');
  assert.equal(riskCheck('PAYPAL ONLY').risk, true);
  assert.equal(riskCheck('Paypalooza festival this weekend').risk, false);
  assert.deepEqual(riskCheck('Bank transfer please').hits, [{ group: 'money', phrase: 'bank transfer' }]);
});

test('BR-LST-005 other house rules: up to 200 characters, both checks, rephrase text', () => {
  assert.deepEqual(checkOtherRules('Shoes off inside, please'), []);
  assert.deepEqual(checkOtherRules('x'.repeat(200)), []);
  assert.deepEqual(checkOtherRules('x'.repeat(201)), ['tooLong']);
  assert.deepEqual(checkOtherRules('Holding deposit by PayID to secure the room'), ['risk']);
  assert.deepEqual(checkOtherRules('Girls only'), ['discrimination']);
  assert.equal(REPHRASE_RULES, 'Keep it about the home, not about who can live there');
});

test('BR-LST-006 up to 10 own items of up to 40 characters, empty ones dropped', () => {
  assert.deepEqual(checkCustomItems(['Pool', '  ', 'Esky for the drive ']), { items: ['Pool', 'Esky for the drive'], errors: [] });
  assert.deepEqual(checkCustomItems(Array.from({ length: 11 }, (_, i) => `Item ${i}`)).errors, ['tooMany']);
  assert.deepEqual(checkCustomItems(['x'.repeat(41)]).errors, ['tooLong']);
  assert.deepEqual(checkCustomItems(['Ladies only bathroom']).errors, ['discrimination']);
});

test('BR-TRU-007 disposable email domains are rejected, subdomains too', () => {
  assert.equal(isDisposableEmail('someone@mailinator.com'), true);
  assert.equal(isDisposableEmail('Someone@Inbox.Mailinator.com '), true);
  assert.equal(isDisposableEmail('someone@gmail.com'), false);
  assert.equal(isDisposableEmail('someone@notmailinator.com'), false);
  assert.equal(isDisposableEmail('not-an-email'), false);
});
