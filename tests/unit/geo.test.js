import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CITY_RADIUS_KM, cryptoRandom, defaultRadiusKm, destination, distanceKm, isValidRadius, OFFSET_MAX_KM,
  OFFSET_MIN_KM, PUBLIC_CIRCLE_KM, publicCentre, RADIUS_OPTIONS_KM, SUBURB_RADIUS_KM, withinRadius,
} from '../../core/geo.js';

const PERTH = { lat: -31.9523, lng: 115.8613 };
const FREMANTLE = { lat: -32.0569, lng: 115.7439 };
const BALDIVIS = { lat: -32.3290, lng: 115.8270 };

test('BR-SRC-003 distances between real places', () => {
  assert.ok(Math.abs(distanceKm(PERTH, FREMANTLE) - 15.8) < 0.3, String(distanceKm(PERTH, FREMANTLE)));
  assert.ok(Math.abs(distanceKm(PERTH, BALDIVIS) - 42) < 1, String(distanceKm(PERTH, BALDIVIS)));
  assert.equal(distanceKm(PERTH, PERTH), 0);
  assert.ok(Math.abs(distanceKm(PERTH, destination(PERTH, 12.5, 37)) - 12.5) < 1e-9);
});

test('BR-SRC-003 radius: 15 km from a suburb, 40 km from a city, or 5, 15, 25 or 50', () => {
  assert.equal(defaultRadiusKm({ isCity: false }), SUBURB_RADIUS_KM);
  assert.equal(defaultRadiusKm({ isCity: true }), CITY_RADIUS_KM);
  assert.equal(SUBURB_RADIUS_KM, 15);
  assert.equal(CITY_RADIUS_KM, 40);
  assert.deepEqual(RADIUS_OPTIONS_KM, [5, 15, 25, 50]);
  assert.equal(isValidRadius(40, { isCity: true }), true);
  assert.equal(isValidRadius(40, { isCity: false }), false);
  assert.equal(isValidRadius(100, { isCity: true }), false);
  assert.equal(withinRadius(PERTH, FREMANTLE, 15), false);
  assert.equal(withinRadius(PERTH, FREMANTLE, 25), true);
  assert.equal(withinRadius(PERTH, BALDIVIS, CITY_RADIUS_KM), false);
});

test('AC-003-2 the circle centre is less than 500 m from the address and never on it', () => {
  for (let i = 0; i < 2000; i++) {
    const c = publicCentre(BALDIVIS, cryptoRandom);
    const d = distanceKm(BALDIVIS, c);
    assert.ok(d < OFFSET_MAX_KM, `too far: ${d}`);
    assert.ok(d >= OFFSET_MIN_KM - 1e-9, `too close: ${d}`);
    assert.ok(d < PUBLIC_CIRCLE_KM, 'the 1 km circle always contains the home');
  }
});

test('BR-LST-004 the offset spreads over every direction and distance', () => {
  const seq = [0, 0, 0.999999, 0.25, 0.5, 0.5, 0.5, 0.75];
  let i = 0;
  const fixed = () => seq[i++];
  const near = publicCentre(PERTH, fixed);
  assert.ok(Math.abs(distanceKm(PERTH, near) - OFFSET_MIN_KM) < 1e-6, 'u = 0 lands on the minimum');
  assert.ok(near.lat > PERTH.lat, 'v = 0 heads north');
  const far = publicCentre(PERTH, fixed);
  assert.ok(Math.abs(distanceKm(PERTH, far) - OFFSET_MAX_KM) < 1e-3, 'u near 1 lands near the maximum');
  assert.ok(far.lng > PERTH.lng, 'v = 0.25 heads east');
  assert.ok(publicCentre(PERTH, fixed).lat < PERTH.lat, 'v = 0.5 heads south');
  assert.ok(publicCentre(PERTH, fixed).lng < PERTH.lng, 'v = 0.75 heads west');
});

test('BR-LST-004 crypto randomness stays in [0, 1)', () => {
  for (let i = 0; i < 1000; i++) {
    const r = cryptoRandom();
    assert.ok(r >= 0 && r < 1);
  }
});
