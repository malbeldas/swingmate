// INT-006: one-off import of the ABS Suburbs and Localities (SAL, ASGS Edition 3) into a migration.
// Reads the SAL boundary shapefile (.shp + .dbf), takes each area's centroid, its state, time zone
// and whether it is a city (BR-SRC-003), and writes INSERTs into public.suburbs with id = SAL code
// (schema.md §3). No dependencies, so it runs the same in a GitHub Action and in node:test.
//
//   node scripts/import-suburbs.mjs <SAL.shp> <SAL.dbf> <out.sql>
//
// .github/workflows/import-suburbs.yml downloads the ABS file and runs this; abs.gov.au is not
// reachable from every machine.
import { readFileSync, writeFileSync } from 'node:fs';

export const STATES = {
  'New South Wales': 'NSW', Victoria: 'VIC', Queensland: 'QLD', 'South Australia': 'SA',
  'Western Australia': 'WA', Tasmania: 'TAS', 'Northern Territory': 'NT', 'Australian Capital Territory': 'ACT',
};

const STATE_TIMEZONES = {
  WA: 'Australia/Perth', NSW: 'Australia/Sydney', VIC: 'Australia/Melbourne', QLD: 'Australia/Brisbane',
  SA: 'Australia/Adelaide', TAS: 'Australia/Hobart', NT: 'Australia/Darwin', ACT: 'Australia/Sydney',
};

// The NSW places that keep South Australian or Lord Howe time.
const TIMEZONE_EXCEPTIONS = {
  'NSW|Broken Hill': 'Australia/Broken_Hill',
  'NSW|Silverton': 'Australia/Broken_Hill',
  'NSW|Lord Howe Island': 'Australia/Lord_Howe',
};

// BR-SRC-003: capitals and large regional cities search 40 km. A fixed list (integrations-suburbs.md).
export const CITIES = new Set([
  'WA|Perth', 'WA|Mandurah', 'WA|Bunbury', 'WA|Geraldton', 'WA|Kalgoorlie', 'WA|Karratha', 'WA|Port Hedland',
  'WA|Broome', 'WA|Albany', 'WA|Newman',
  'NSW|Sydney', 'NSW|Newcastle', 'NSW|Wollongong', 'NSW|Dubbo', 'NSW|Wagga Wagga', 'NSW|Tamworth', 'NSW|Orange',
  'NSW|Broken Hill', 'NSW|Muswellbrook', 'NSW|Singleton',
  'VIC|Melbourne', 'VIC|Geelong', 'VIC|Ballarat Central', 'VIC|Bendigo', 'VIC|Mildura', 'VIC|Traralgon',
  'QLD|Brisbane City', 'QLD|Townsville City', 'QLD|Cairns City', 'QLD|Mackay', 'QLD|Rockhampton City',
  'QLD|Toowoomba City', 'QLD|Gladstone Central', 'QLD|Bundaberg Central', 'QLD|Emerald', 'QLD|Moranbah',
  'QLD|Mount Isa City',
  'SA|Adelaide', 'SA|Whyalla', 'SA|Port Augusta', 'SA|Roxby Downs',
  'TAS|Hobart', 'TAS|Launceston', 'TAS|Devonport', 'TAS|Burnie',
  'NT|Darwin City', 'NT|Alice Springs', 'NT|Katherine',
  'ACT|City',
]);

// "Kingston (Tas.)" -> "Kingston"; "Mount Pleasant (Perth - WA)" -> "Mount Pleasant (Perth)", so two
// places with the same name in one state stay apart.
export function cleanName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  const m = /^(.*?) \((.+)\)$/.exec(name);
  if (!m) return name;
  const inside = m[2].trim();
  if (/^(NSW|Vic\.|Qld|SA|WA|Tas\.|NT|ACT)$/.test(inside)) return m[1];
  const region = /^(.*) - (NSW|Vic\.|Qld|SA|WA|Tas\.|NT|ACT)$/.exec(inside);
  return region ? `${m[1]} (${region[1]})` : name;
}

export function timezoneFor(state, name) {
  return TIMEZONE_EXCEPTIONS[`${state}|${name}`] ?? STATE_TIMEZONES[state] ?? null;
}

// Areas that are not places: "No usual address (WA)", "Migratory - Offshore - Shipping (NSW)".
export function isPlace(name) {
  return !/^(No usual address|Migratory - Offshore - Shipping)\b/i.test(name);
}

// ---- Shapefile and dBASE readers (only what SAL uses: polygons and character/numeric fields) ----

export function readDbf(buffer) {
  const records = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  const fields = [];
  for (let at = 32; buffer[at] !== 0x0d; at += 32) {
    const name = buffer.toString('latin1', at, at + 11).replace(/\0.*$/, '');
    fields.push({ name, length: buffer[at + 16] });
  }
  const rows = [];
  for (let r = 0; r < records; r += 1) {
    let at = headerLength + r * recordLength;
    const deleted = buffer[at] === 0x2a;
    at += 1;
    const row = {};
    for (const f of fields) {
      row[f.name] = buffer.toString('utf8', at, at + f.length).trim();
      at += f.length;
    }
    if (!deleted) rows.push(row);
    else rows.push(null);
  }
  return rows;
}

// Area-weighted centroid of all rings; holes (counter-clockwise in a shapefile) subtract themselves.
export function polygonCentroid(points, parts) {
  if (!points.length) return null;
  // Measured from the first point, so long rings far from (0, 0) keep their precision.
  const [ox, oy] = points[0];
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let p = 0; p < parts.length; p += 1) {
    const start = parts[p];
    const end = p + 1 < parts.length ? parts[p + 1] : points.length;
    for (let i = start; i < end - 1; i += 1) {
      const x0 = points[i][0] - ox;
      const y0 = points[i][1] - oy;
      const x1 = points[i + 1][0] - ox;
      const y1 = points[i + 1][1] - oy;
      const cross = x0 * y1 - x1 * y0;
      area += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
  }
  if (area === 0) return null;
  return { lng: ox + cx / (3 * area), lat: oy + cy / (3 * area) };
}

export function readShpCentroids(buffer) {
  const out = [];
  let at = 100;
  while (at + 8 <= buffer.length) {
    const length = buffer.readInt32BE(at + 4) * 2;
    const content = at + 8;
    const type = buffer.readInt32LE(content);
    if (type === 5 || type === 15 || type === 25) {
      const numParts = buffer.readInt32LE(content + 36);
      const numPoints = buffer.readInt32LE(content + 40);
      const parts = [];
      for (let i = 0; i < numParts; i += 1) parts.push(buffer.readInt32LE(content + 44 + i * 4));
      const pointsAt = content + 44 + numParts * 4;
      const points = [];
      for (let i = 0; i < numPoints; i += 1) {
        points.push([buffer.readDoubleLE(pointsAt + i * 16), buffer.readDoubleLE(pointsAt + i * 16 + 8)]);
      }
      out.push(polygonCentroid(points, parts));
    } else {
      out.push(null); // null shape: an area with no boundary
    }
    at = content + length;
  }
  return out;
}

// ---- Rows and SQL ----

export function suburbRows(dbfRows, centroids) {
  const rows = [];
  dbfRows.forEach((r, i) => {
    if (!r) return;
    const state = STATES[r.STE_NAME21];
    const c = centroids[i];
    if (!state || !c || !isPlace(r.SAL_NAME21)) return;
    const id = Number(r.SAL_CODE21);
    const name = cleanName(r.SAL_NAME21);
    if (!Number.isInteger(id) || !name) return;
    rows.push({
      id, name, state, lat: Number(c.lat.toFixed(5)), lng: Number(c.lng.toFixed(5)),
      timezone: timezoneFor(state, name), isCity: CITIES.has(`${state}|${name}`),
    });
  });
  return rows.sort((a, b) => a.id - b.id);
}

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function migrationSql(rows, { source = 'ABS SAL 2021 (ASGS Edition 3)' } = {}) {
  const lines = [
    `-- INT-006: ${rows.length} suburbs and localities of Australia from the ${source}, written by`,
    '-- scripts/import-suburbs.mjs. id is the SAL code; lat and lng are the centroid of the area.',
    '-- Source: Australian Bureau of Statistics, licensed under Creative Commons Attribution 4.0.',
    '-- Re-running it updates the rows in place.',
  ];
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000).map((r) =>
      `  (${r.id}, ${quote(r.name)}, '${r.state}', ${r.lat}, ${r.lng}, '${r.timezone}', ${r.isCity})`);
    lines.push('', 'insert into public.suburbs (id, name, state, lat, lng, timezone, is_city) values',
      `${chunk.join(',\n')}`,
      'on conflict (id) do update set name = excluded.name, state = excluded.state, lat = excluded.lat,',
      '  lng = excluded.lng, timezone = excluded.timezone, is_city = excluded.is_city;');
  }
  return `${lines.join('\n')}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [shp, dbf, out] = process.argv.slice(2);
  if (!shp || !dbf || !out) {
    console.error('Usage: node scripts/import-suburbs.mjs <SAL.shp> <SAL.dbf> <out.sql>');
    process.exit(1);
  }
  const rows = suburbRows(readDbf(readFileSync(dbf)), readShpCentroids(readFileSync(shp)));
  writeFileSync(out, migrationSql(rows));
  const byState = Object.groupBy ? Object.groupBy(rows, (r) => r.state) : {};
  console.log(`${rows.length} suburbs -> ${out}`);
  for (const [state, list] of Object.entries(byState)) console.log(`  ${state}: ${list.length}`);
  console.log(`  cities: ${rows.filter((r) => r.isCity).map((r) => `${r.name}, ${r.state}`).join('; ')}`);
  const missing = [...CITIES].filter((key) => !rows.some((r) => `${r.state}|${r.name}` === key));
  if (missing.length) console.log(`  cities not found in SAL: ${missing.join('; ')}`);
}
