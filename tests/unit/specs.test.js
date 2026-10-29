// Keeps the requirement consistent: every ID cited anywhere in the docs is defined in its spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const specFiles = readdirSync(new URL('specs/', root)).filter((f) => f.endsWith('.md')).map((f) => `specs/${f}`);
const docs = [...specFiles, 'CLAUDE.md', 'task-execution-prompt.md', 'README.md'];
const text = Object.fromEntries(docs.map((f) => [f, readFileSync(new URL(f, root), 'utf8')]));

// Where each kind of ID is defined, as a regex over the defining file.
const KINDS = [
  { name: 'BR', ref: /\bBR-[A-Z]+-\d{3}\b/g, file: 'specs/business-rules.md', def: /^### (BR-[A-Z]+-\d{3})\b/gm },
  { name: 'UC', ref: /\bUC-\d{3}\b/g, file: 'specs/use-cases.md', def: /^## (UC-\d{3})\b/gm },
  { name: 'P', ref: /\bP-\d{2}\b/g, file: 'specs/roles-permissions.md', def: /^\| (P-\d{2}) \|/gm },
  { name: 'T', ref: /\bT-\d{2}\b/g, file: 'specs/security.md', def: /^\| (T-\d{2}) \|/gm },
  { name: 'SEC', ref: /\bSEC-\d{2}\b/g, file: 'specs/security.md', def: /(?:\*\*|^\| )(SEC-\d{2})\b/gm },
  { name: 'NTF', ref: /\bNTF-\d{3}\b/g, file: 'specs/notifications.md', def: /^\| (NTF-\d{3}) \|/gm },
  { name: 'INT', ref: /\bINT-\d{3}\b/g, file: 'specs/integrations.md', def: /^\| (INT-\d{3}) \|/gm },
  { name: 'DEC', ref: /\bDEC-\d{3}\b/g, file: 'specs/decision-log.md', def: /^(?:###|\|) (DEC-\d{3})\b/gm },
  { name: 'Q', ref: /\bQ-\d{2}\b/g, file: 'specs/decision-log.md', def: /^### (Q-\d{2})\b/gm },
];

// "UC-001 a UC-019" style ranges name the bounds of a numbering block, not a case.
function referencesOutsideRanges(src, re) {
  const ids = new Set();
  for (const m of src.matchAll(re)) {
    const before = src.slice(Math.max(0, m.index - 12), m.index);
    if (/(?:\b(?:UC|NTF|INT)-\d{3}|\bP-\d{2})\s*(?:a|–|-|al)\s*$/.test(before)) continue;
    const after = src.slice(m.index + m[0].length, m.index + m[0].length + 4);
    if (/^\s*(?:a|–|-)\s*\d/.test(after) || /^–/.test(after)) continue;
    ids.add(m[0]);
  }
  return ids;
}

for (const kind of KINDS) {
  test(`${kind.name}: every cited ID is defined in ${kind.file}`, () => {
    const defined = new Set([...text[kind.file].matchAll(kind.def)].map((m) => m[1]));
    assert.ok(defined.size > 0, `no ${kind.name} definitions found`);
    const missing = [];
    for (const [file, src] of Object.entries(text)) {
      for (const id of referencesOutsideRanges(src, kind.ref)) {
        if (!defined.has(id)) missing.push(`${id} in ${file}`);
      }
    }
    assert.deepEqual(missing, []);
  });
}

test('every acceptance criterion AC-NNN-n belongs to a defined use case', () => {
  const defined = new Set([...text['specs/use-cases.md'].matchAll(/^## (UC-\d{3})\b/gm)].map((m) => m[1].slice(3)));
  const missing = [];
  for (const [file, src] of Object.entries(text)) {
    for (const m of src.matchAll(/\bAC-(\d{3})-\d+\b/g)) {
      if (!defined.has(m[1])) missing.push(`${m[0]} in ${file}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('docs link only to files that exist', () => {
  const files = new Set(docs.map((f) => f.replace(/^specs\//, '')));
  const broken = [];
  for (const [file, src] of Object.entries(text)) {
    for (const m of src.matchAll(/\]\(\.\/([a-z0-9-]+\.md)\)/g)) {
      if (!files.has(m[1])) broken.push(`${m[1]} in ${file}`);
    }
  }
  assert.deepEqual(broken, []);
});
