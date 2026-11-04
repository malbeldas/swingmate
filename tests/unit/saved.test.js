import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVED_TEXTS, saveButtonState, savedCanOpen, savedLine, savedStatusLabel } from '../../core/saved.js';

test('AC-005-1 the button says Save or Saved and announces it as pressed', () => {
  assert.deepEqual(saveButtonState(false), { text: 'Save', pressed: 'false' });
  assert.deepEqual(saveButtonState(true), { text: 'Saved', pressed: 'true' });
});

test('AC-005-2 UC-005 E1 a saved listing that stopped being live says so', () => {
  assert.equal(savedStatusLabel('active'), null);
  assert.equal(savedStatusLabel('paused'), 'Paused');
  assert.equal(savedStatusLabel('filled'), 'Filled');
  assert.equal(savedStatusLabel('gone'), 'No longer available');
});

test('UC-005 the line under each saved home, and which ones still open', () => {
  assert.equal(savedLine({ status: 'active', weekly_price: 270, suburb_name: 'Dampier', state: 'WA' }), '$270 / week · Dampier, WA');
  assert.equal(savedLine({ status: 'gone', title: 'Room' }), '');
  assert.equal(savedCanOpen({ status: 'paused' }), true);
  assert.equal(savedCanOpen({ status: 'gone' }), false);
  assert.equal(SAVED_TEXTS.none, 'Nothing saved yet. Tap “Save” on any home to keep it here.');
});
