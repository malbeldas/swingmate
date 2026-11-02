// Distances, search radius and the public circle of a listing (BR-SRC-003, BR-LST-004).
// Coordinates are WGS84 degrees; distances are kilometres on a sphere, plenty for a 50 km search.

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

// Great-circle distance (haversine).
export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// The point `km` away from `from` heading `bearingDeg` (0 = north, 90 = east).
export function destination(from, km, bearingDeg) {
  const d = km / EARTH_RADIUS_KM;
  const b = toRad(bearingDeg);
  const lat1 = toRad(from.lat);
  const lng1 = toRad(from.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 };
}

// BR-SRC-003: 15 km from a suburb, 40 km from a city (suburbs.is_city); the person can pick 5, 15,
// 25 or 50 km instead.
export const RADIUS_OPTIONS_KM = [5, 15, 25, 50];
export const SUBURB_RADIUS_KM = 15;
export const CITY_RADIUS_KM = 40;

export function defaultRadiusKm(place) {
  return place?.isCity ? CITY_RADIUS_KM : SUBURB_RADIUS_KM;
}

export function isValidRadius(km, place) {
  return RADIUS_OPTIONS_KM.includes(km) || km === defaultRadiusKm(place);
}

export function withinRadius(center, point, radiusKm) {
  return distanceKm(center, point) <= radiusKm;
}

// BR-LST-004: the map shows a 1 km circle whose centre is moved at random up to 500 m from the
// real address, once, when the listing is published. The minimum keeps the centre from landing on
// the house itself (AC-003-2 "no coincide"). Because 500 m < 1 km, the circle always contains the
// home, so the area shown is honest.
export const PUBLIC_CIRCLE_KM = 1;
export const OFFSET_MAX_KM = 0.5;
export const OFFSET_MIN_KM = 0.1;

// `random` returns numbers in [0, 1); pass crypto-backed randomness in production so the offset
// cannot be guessed, and a fixed sequence in tests.
export function publicCentre(address, random = Math.random) {
  const u = random();
  const v = random();
  // Uniform over the ring between the minimum and maximum, so no distance is favoured.
  const min2 = OFFSET_MIN_KM ** 2;
  const km = Math.sqrt(min2 + u * (OFFSET_MAX_KM ** 2 - min2));
  return destination(address, km, v * 360);
}

// Random numbers in [0, 1) from the Web Crypto API, available in browsers, Node and Deno.
export function cryptoRandom() {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}
