import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHOTO_MAX_BYTES, PHOTO_TEXTS, avatarPath, photoIssue, scaleToFit } from '../../core/photo.js';

test('UC-032 E1 a photo that is not an image or is over 5 MB is refused with the reason', () => {
  assert.equal(photoIssue({ type: 'image/jpeg', size: 200_000 }), null);
  assert.equal(photoIssue({ type: 'image/png', size: PHOTO_MAX_BYTES }), null);
  assert.equal(photoIssue({ type: 'application/pdf', size: 1000 }), 'type');
  assert.equal(photoIssue({ type: 'image/gif', size: 1000 }), 'type');
  assert.equal(photoIssue({ type: 'image/webp', size: PHOTO_MAX_BYTES + 1 }), 'size');
  assert.equal(photoIssue({ type: 'image/jpeg', size: 0 }), 'size');
  assert.equal(PHOTO_TEXTS.size, 'That photo is over 5 MB. Choose a smaller one.');
});

test('BR-PRV-002 photos are scaled down, never up, keeping the shape', () => {
  assert.deepEqual(scaleToFit(4032, 3024), { width: 800, height: 600 });
  assert.deepEqual(scaleToFit(1080, 1920), { width: 450, height: 800 });
  assert.deepEqual(scaleToFit(300, 200), { width: 300, height: 200 });
});

test('schema.md §11 the photo path is the owner folder and a uuid', () => {
  assert.equal(avatarPath('u1', '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'), 'u1/6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f.jpg');
});
