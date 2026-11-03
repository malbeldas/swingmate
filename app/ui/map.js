// Approximate area map (INT-005, BR-LST-004): OpenStreetMap tiles with vendored Leaflet, centred on
// the public circle, zoom capped at 14 so it never reads as a pin. If the tiles don't load, the map
// hides and the text fallback stays.
const VENDOR_JS = new URL('../../vendor/leaflet-1.9.4.js', import.meta.url);
const VENDOR_CSS = new URL('../../vendor/leaflet-1.9.4.css', import.meta.url);
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const CIRCLE_METRES = 1000;

let loading;

function loadLeaflet() {
  if (globalThis.L?.map) return Promise.resolve(globalThis.L);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: VENDOR_CSS.href });
      const js = Object.assign(document.createElement('script'), { src: VENDOR_JS.href });
      js.onload = () => resolve(globalThis.L);
      js.onerror = () => reject(new Error('Leaflet failed to load'));
      document.head.append(css, js);
    });
  }
  return loading;
}

// box: the element to draw in. onFail: called when the map can't be shown.
export async function drawAreaMap(box, { lat, lng }, onFail) {
  if (lat == null || lng == null) return onFail();
  let L;
  try {
    L = await loadLeaflet();
  } catch {
    return onFail();
  }
  const map = L.map(box, { center: [lat, lng], zoom: 13, maxZoom: 14, minZoom: 10, scrollWheelZoom: false, attributionControl: true });
  let loaded = 0;
  let failed = 0;
  const tiles = L.tileLayer(TILE_URL, { maxZoom: 14, attribution: '© OpenStreetMap contributors' });
  tiles.on('tileload', () => { loaded += 1; });
  tiles.on('tileerror', () => {
    failed += 1;
    if (!loaded && failed >= 4) {
      map.remove();
      onFail();
    }
  });
  map.attributionControl.setPrefix(false);
  tiles.addTo(map);
  L.circle([lat, lng], {
    radius: CIRCLE_METRES,
    color: getComputedStyle(document.documentElement).getPropertyValue('--teal').trim(),
    weight: 2,
    fillOpacity: 0.16,
    interactive: false,
  }).addTo(map);
  return map;
}
