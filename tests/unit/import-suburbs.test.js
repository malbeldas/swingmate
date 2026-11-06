import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanName, isPlace, migrationSql, polygonCentroid, readDbf, readShpCentroids, suburbRows, timezoneFor,
} from '../../scripts/import-suburbs.mjs';

// A dBASE file with SAL_CODE21, SAL_NAME21 and STE_NAME21, as the ABS ships it.
function dbf(rows) {
  const fields = [['SAL_CODE21', 5], ['SAL_NAME21', 45], ['STE_NAME21', 50]];
  const headerLength = 32 + fields.length * 32 + 1;
  const recordLength = 1 + fields.reduce((s, [, l]) => s + l, 0);
  const buf = Buffer.alloc(headerLength + rows.length * recordLength + 1, 0x20);
  buf.fill(0, 0, headerLength);
  buf[0] = 3;
  buf.writeUInt32LE(rows.length, 4);
  buf.writeUInt16LE(headerLength, 8);
  buf.writeUInt16LE(recordLength, 10);
  fields.forEach(([name, length], i) => {
    buf.write(name, 32 + i * 32, 'latin1');
    buf[32 + i * 32 + 11] = 0x43;
    buf[32 + i * 32 + 16] = length;
  });
  buf[headerLength - 1] = 0x0d;
  rows.forEach((row, r) => {
    let at = headerLength + r * recordLength + 1;
    fields.forEach(([, length], i) => { buf.write(String(row[i]).padEnd(length), at, 'latin1'); at += length; });
  });
  return buf;
}

// A shapefile with one polygon per entry (an array of rings, each closed); null is a null shape.
function shp(shapes) {
  const records = shapes.map((rings, i) => {
    if (!rings) {
      const b = Buffer.alloc(12);
      b.writeInt32BE(i + 1, 0); b.writeInt32BE(2, 4); b.writeInt32LE(0, 8);
      return b;
    }
    const points = rings.flat();
    const content = Buffer.alloc(44 + rings.length * 4 + points.length * 16);
    content.writeInt32LE(5, 0);
    content.writeInt32LE(rings.length, 36);
    content.writeInt32LE(points.length, 40);
    let start = 0;
    rings.forEach((ring, p) => { content.writeInt32LE(start, 44 + p * 4); start += ring.length; });
    points.forEach(([x, y], k) => {
      content.writeDoubleLE(x, 44 + rings.length * 4 + k * 16);
      content.writeDoubleLE(y, 44 + rings.length * 4 + k * 16 + 8);
    });
    const head = Buffer.alloc(8);
    head.writeInt32BE(i + 1, 0); head.writeInt32BE(content.length / 2, 4);
    return Buffer.concat([head, content]);
  });
  return Buffer.concat([Buffer.alloc(100), ...records]);
}

// Clockwise squares, the way a shapefile writes outer rings.
const square = (x, y, size) => [[x, y], [x, y + size], [x + size, y + size], [x + size, y], [x, y]];

test('INT-006 the centroid of an area, holes included', () => {
  assert.deepEqual(polygonCentroid(square(115, -33, 2), [0]), { lng: 116, lat: -32 });
  const withHole = [...square(0, 0, 4), ...[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]];
  const c = polygonCentroid(withHole, [0, 5]);
  assert.ok(c.lng > 2 && c.lat > 2, 'the hole in the corner pulls the centre away from it');
});

test('INT-006 SAL names lose the state, keep the region that tells two places apart', () => {
  assert.equal(cleanName('Kingston (Tas.)'), 'Kingston');
  assert.equal(cleanName('Baldivis'), 'Baldivis');
  assert.equal(cleanName('Mount Pleasant (Perth - WA)'), 'Mount Pleasant (Perth)');
  assert.equal(cleanName('Hillside (Vic.)'), 'Hillside');
  assert.equal(isPlace('No usual address (WA)'), false);
  assert.equal(isPlace('Migratory - Offshore - Shipping (NSW)'), false);
});

test('INT-006 AC-2 every suburb has a time zone, Broken Hill and Lord Howe their own', () => {
  assert.equal(timezoneFor('WA', 'Baldivis'), 'Australia/Perth');
  assert.equal(timezoneFor('QLD', 'Mackay'), 'Australia/Brisbane');
  assert.equal(timezoneFor('ACT', 'Braddon'), 'Australia/Sydney');
  assert.equal(timezoneFor('NSW', 'Broken Hill'), 'Australia/Broken_Hill');
  assert.equal(timezoneFor('NSW', 'Lord Howe Island'), 'Australia/Lord_Howe');
});

test('INT-006 AC-1 the shapefile becomes suburbs with SAL code, state, centre and city flag', () => {
  const rows = suburbRows(
    readDbf(dbf([
      ['50061', 'Baldivis', 'Western Australia'],
      ['31779', 'Mackay', 'Queensland'],
      ['51234', 'Perth', 'Western Australia'],
      ['59499', 'No usual address (WA)', 'Western Australia'],
      ['90001', 'Jervis Bay', 'Other Territories'],
      ['50999', 'Nowhere', 'Western Australia'],
    ])),
    readShpCentroids(shp([[square(115.8, -32.4, 0.1)], [square(149.1, -21.2, 0.2)], [square(115.8, -32.0, 0.1)], [square(0, 0, 1)], [square(150, -35, 1)], null])),
  );
  assert.deepEqual(rows.map((r) => [r.id, r.name, r.state, r.timezone, r.isCity]), [
    [31779, 'Mackay', 'QLD', 'Australia/Brisbane', true],
    [50061, 'Baldivis', 'WA', 'Australia/Perth', false],
    [51234, 'Perth', 'WA', 'Australia/Perth', true],
  ]);
  assert.deepEqual([rows[1].lng, rows[1].lat], [115.85, -32.35]);

  const sql = migrationSql([...rows, { id: 50070, name: "O'Connor", state: 'WA', lat: -32, lng: 115.8, timezone: 'Australia/Perth', isCity: false }]);
  assert.match(sql, /insert into public\.suburbs \(id, name, state, lat, lng, timezone, is_city\) values/);
  assert.match(sql, /\(50061, 'Baldivis', 'WA', -32\.35, 115\.85, 'Australia\/Perth', false\)/);
  assert.match(sql, /'O''Connor'/);
  assert.match(sql, /on conflict \(id\) do update/);
  assert.match(sql, /Creative Commons Attribution 4\.0/);
});
