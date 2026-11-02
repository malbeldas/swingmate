import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listingNights } from '../../core/availability.js';
import { makeRoster } from '../../core/roster.js';
import { REPHRASE_RULES } from '../../core/text-checks.js';
import {
  calendarCheckDue, calendarUpdatedText, canPublish, checkPhotoFile, conversationView, firstIncompleteStep,
  LISTING_LIMIT, listingLimitReached, listingView, PHOTOS_MAX, publishIssues, resizeDimensions, stepIssues,
  stepLabel, TEXTS, TOTAL_STEPS,
} from '../../core/listing.js';

const ROSTER = makeRoster({ daysOn: 14, daysOff: 7, anchor: '2026-11-02' });

// A complete listing with only the required fields (BR-LST-001). Coordinates are illustrative.
function complete(overrides = {}) {
  return {
    suburbId: 101,
    address: { line: '1 Example St', lat: -32.35, lng: 115.8 },
    placeType: 'private_room',
    bathroom: 'shared',
    weeklyPrice: 260,
    billsIncluded: true,
    bond: 0,
    furnished: true,
    title: 'Quiet room near the freeway',
    photos: [{}, {}, {}],
    availabilityType: 'roster',
    roster: ROSTER,
    ...overrides,
  };
}
const VERIFIED = { emailVerified: true, phoneVerified: true, accuracyDeclared: true };
const codes = (issues) => issues.map((i) => i.code);

test('AC-020-7 every step shows "Step N of 5"', () => {
  assert.equal(TOTAL_STEPS, 5);
  assert.deepEqual([1, 2, 3, 4, 5].map(stepLabel), ['Step 1 of 5', 'Step 2 of 5', 'Step 3 of 5', 'Step 4 of 5', 'Step 5 of 5']);
});

test('AC-020-1 without a verified mobile or the statement, Publish stays disabled and says what is missing', () => {
  assert.equal(canPublish(complete(), VERIFIED), true);
  assert.deepEqual(publishIssues(complete(), VERIFIED), []);

  const noPhone = publishIssues(complete(), { ...VERIFIED, phoneVerified: false });
  assert.deepEqual(noPhone.map((i) => [i.step, i.text]), [[5, 'Verify your mobile']]);

  const noStatement = publishIssues(complete(), { ...VERIFIED, accuracyDeclared: false });
  assert.deepEqual(noStatement.map((i) => i.text), ['Confirm the photos and details are real and current']);

  assert.deepEqual(codes(publishIssues(complete(), {})), ['emailVerified', 'phoneVerified', 'accuracyDeclared']);
});

test('BR-LST-001 an empty draft lists every required field, step by step', () => {
  const issues = publishIssues({}, VERIFIED);
  assert.deepEqual(issues.map((i) => [i.step, i.field]), [
    [1, 'suburbId'], [1, 'address'], [1, 'placeType'], [1, 'bathroom'],
    [2, 'weeklyPrice'], [2, 'billsIncluded'], [2, 'bond'], [2, 'furnished'],
    [3, 'title'], [3, 'photos'],
    [4, 'availabilityType'],
  ]);
  assert.equal(issues.find((i) => i.field === 'photos').text, 'Add at least 3 photos (3 more)');
  assert.equal(firstIncompleteStep({}, VERIFIED), 1);
  assert.equal(firstIncompleteStep(complete({ title: '' }), VERIFIED), 3);
  assert.equal(firstIncompleteStep(complete(), VERIFIED), 0);
});

test('BR-LST-001 the address needs a point on the map, and false or 0 are answers', () => {
  assert.deepEqual(codes(stepIssues(complete({ address: { line: '1 Example St' } }), 1)), ['address']);
  assert.deepEqual(stepIssues(complete({ billsIncluded: false, furnished: false, bond: 0 }), 2), []);
});

test('UC-020 E2 fewer than 3 photos block step 3, and more than 12 too', () => {
  assert.equal(stepIssues(complete({ photos: [{}, {}] }), 3)[0].text, 'Add at least 3 photos (1 more)');
  const many = Array.from({ length: PHOTOS_MAX + 1 }, () => ({}));
  assert.deepEqual(codes(stepIssues(complete({ photos: many }), 3)), ['photosTooMany']);
});

test('UC-020 E1 values out of range say the limit', () => {
  assert.equal(stepIssues(complete({ weeklyPrice: 0 }), 2)[0].text, 'The weekly price goes from $1 to $5,000');
  assert.equal(stepIssues(complete({ bond: 20001 }), 2)[0].text, 'The bond goes up to $20,000');
  assert.equal(stepIssues(complete({ title: 'Room' }), 3)[0].text, 'The title needs 5 to 80 characters');
  assert.deepEqual(codes(stepIssues(complete({ minStayWeeks: 53, householdSize: 13, airportMinutes: 0 }), 2)),
    ['minStayWeeks', 'householdSize', 'airportMinutes']);
  assert.deepEqual(codes(stepIssues(complete({ householdSize: 3, householdOnRoster: 4 }), 2)), ['householdOnRoster']);
  assert.deepEqual(stepIssues(complete({ householdSize: 3, householdOnRoster: 3, minStayWeeks: null }), 2), []);
});

test('AC-020-5 house rules over 200 characters are not accepted', () => {
  assert.deepEqual(stepIssues(complete({ otherRules: 'x'.repeat(200) }), 3), []);
  const issues = stepIssues(complete({ otherRules: 'x'.repeat(201) }), 3);
  assert.deepEqual(issues.map((i) => i.text), ['House rules can have up to 200 characters']);
});

test('BR-LST-005 rules with risk or discrimination ask to rephrase', () => {
  for (const otherRules of ['Send me the bond before inspection', 'No Indians']) {
    const issues = stepIssues(complete({ otherRules }), 3);
    assert.deepEqual(issues.map((i) => i.text), [REPHRASE_RULES], otherRules);
  }
  assert.deepEqual(stepIssues(complete({ otherRules: 'No smoking inside. Quiet after 9pm.' }), 3), []);
});

test('AC-020-6 no more than 10 own features or extras, shown in both steps and counted once on Publish', () => {
  const ten = Array.from({ length: 10 }, (_, i) => `Item ${i}`);
  assert.deepEqual(stepIssues(complete({ customItems: ten }), 2), []);
  const eleven = [...ten, 'One more'];
  assert.deepEqual(codes(stepIssues(complete({ customItems: eleven }), 2)), ['customItemsTooMany']);
  assert.deepEqual(codes(stepIssues(complete({ customItems: eleven }), 3)), ['customItemsTooMany']);
  assert.deepEqual(codes(publishIssues(complete({ customItems: eleven }), VERIFIED)), ['customItemsTooMany']);
  assert.deepEqual(codes(stepIssues(complete({ customItems: ['x'.repeat(41)] }), 2)), ['customItemsTooLong']);
});

test('BR-AVL-003 step 4 needs one complete availability rule', () => {
  assert.deepEqual(codes(stepIssues(complete({ roster: { daysOn: 14 } }), 4)), ['roster']);
  assert.deepEqual(codes(stepIssues(complete({ availabilityType: 'from_date' }), 4)), ['availableFrom']);
  assert.deepEqual(stepIssues(complete({ availabilityType: 'from_date', availableFrom: '2026-12-06' }), 4), []);
  assert.equal(stepIssues(complete({ availabilityType: 'ranges', ranges: [] }), 4)[0].text, 'Add the dates it’s free');
});

test('AC-020-3 availability from a 14:7 roster with defaults gives 13 nights per cycle', () => {
  const nights = listingNights(complete(), '2026-11-02', 21, '2026-11-02');
  assert.equal([...nights].filter((n) => n === '1').length, 13);
  const next = listingNights(complete(), '2026-11-23', 21, '2026-11-02');
  assert.equal(next, nights);
});

test('BR-LST-007 active and paused listings count toward the limit of 5; filled and drafts do not', () => {
  assert.equal(LISTING_LIMIT, 5);
  assert.equal(listingLimitReached(['active', 'active', 'paused', 'active']), false);
  assert.equal(listingLimitReached(['active', 'active', 'paused', 'active', 'paused']), true);
  assert.equal(listingLimitReached(['filled', 'filled', 'draft', 'removed', 'hidden', 'active']), false);
  assert.equal(listingLimitReached(['active', 'active', 'active', 'active', 'active'], 8), false);
  assert.match(TEXTS.limit, /Write to support/);
});

test('SEC-15 only JPEG or WebP photos up to 5 MB', () => {
  assert.equal(checkPhotoFile({ type: 'image/jpeg', size: 5 * 1024 * 1024 }), null);
  assert.equal(checkPhotoFile({ type: 'image/webp', size: 1000 }), null);
  assert.equal(checkPhotoFile({ type: 'image/png', size: 1000 }).text, 'Use a JPEG or WebP photo');
  assert.equal(checkPhotoFile({ type: 'image/heic', size: 1000 }).code, 'photoType');
  assert.equal(checkPhotoFile({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }).text, 'This photo is over 5 MB');
  assert.equal(checkPhotoFile({ type: 'image/jpeg', size: 0 }).code, 'photoSize');
});

test('SEC-16 photos are re-encoded with the longest side at most 1600 px, never upscaled', () => {
  assert.deepEqual(resizeDimensions(4032, 3024), { width: 1600, height: 1200 });
  assert.deepEqual(resizeDimensions(3024, 4032), { width: 1200, height: 1600 });
  assert.deepEqual(resizeDimensions(1200, 800), { width: 1200, height: 800 });
});

test('AC-020-4 a draft is not visible to anyone but its owner', () => {
  assert.deepEqual(listingView('draft'), {
    visible: false, inSearch: false, label: null, messageBox: false, editButton: false, canManage: false,
  });
  assert.equal(listingView('draft', { isOwner: true }).visible, true);
  assert.equal(listingView('draft', { isOwner: true }).inSearch, false);
});

test('AC-003-4 and AC-022-2 a paused listing leaves search and shows by link with its label and no message box', () => {
  for (const [status, label] of [['paused', 'This listing is paused'], ['filled', 'This listing is filled']]) {
    const view = listingView(status);
    assert.equal(view.visible, true);
    assert.equal(view.inSearch, false);
    assert.equal(view.label, label);
    assert.equal(view.messageBox, false);
  }
  assert.deepEqual(listingView('active'), {
    visible: true, inSearch: true, label: null, messageBox: true, editButton: false, canManage: false,
  });
});

test('BR-LST-008 the owner sees "Edit listing" instead of the message box', () => {
  const view = listingView('active', { isOwner: true });
  assert.equal(view.messageBox, false);
  assert.equal(view.editButton, true);
  assert.equal(view.canManage, true);
});

test('AC-040-3 and AC-022-3 a hidden listing leaves search and its link, and the host cannot reactivate it', () => {
  assert.equal(listingView('hidden').visible, false);
  assert.equal(listingView('removed').visible, false);
  assert.equal(TEXTS.gone, 'This home is no longer available');
  const owner = listingView('hidden', { isOwner: true });
  assert.equal(owner.visible, true);
  assert.equal(owner.canManage, false);
  assert.equal(owner.editButton, false);
  assert.equal(listingView('removed', { isOwner: true }).visible, false);
  assert.throws(() => listingView('archived'), RangeError);
});

test('BR-MSG-005 conversations stay open with the status, except a hidden listing for the seeker', () => {
  assert.deepEqual(conversationView('active', { role: 'seeker' }), { open: true, banner: null });
  assert.deepEqual(conversationView('paused', { role: 'seeker' }), { open: true, banner: 'This listing is paused' });
  assert.deepEqual(conversationView('filled', { role: 'host' }), { open: true, banner: 'This listing is filled' });
  assert.deepEqual(conversationView('hidden', { role: 'seeker' }), { open: false, banner: 'This listing was removed by SwingMate' });
  assert.equal(conversationView('hidden', { role: 'host' }).open, true);
  assert.equal(conversationView('removed', { role: 'seeker' }).open, true);
});

test('AC-003-5 the detail shows "Calendar updated N days ago"', () => {
  assert.equal(calendarUpdatedText('2026-11-02', '2026-11-02'), 'Calendar updated today');
  assert.equal(calendarUpdatedText('2026-11-01', '2026-11-02'), 'Calendar updated 1 day ago');
  assert.equal(calendarUpdatedText('2026-10-03', '2026-11-02'), 'Calendar updated 30 days ago');
});

test('BR-AVL-006 the calendar check is due after 30 days without changes', () => {
  assert.equal(calendarCheckDue('2026-10-04', '2026-11-02'), false);
  assert.equal(calendarCheckDue('2026-10-03', '2026-11-02'), true);
});
