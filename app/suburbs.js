// Base suburb picker shared by the sign-up sheet and the profile (INT-006, AC-032-1): the person
// types, picks from the list, and only a suburb from the dataset is saved.
import { getClient } from './db.js';

const clean = (text) => text.replace(/[%_]/g, '');

export function suburbText(s) {
  return `${s.name}, ${s.state}`;
}

// Up to 8 suburbs starting with what was typed, as a Map of "Name, ST" to id.
export async function searchSuburbs(query) {
  const q = query.split(',')[0].trim();
  if (q.length < 2) return new Map();
  const db = await getClient();
  const { data } = await db.from('suburbs').select('id, name, state').ilike('name', `${clean(q)}%`).order('name').limit(8);
  return new Map((data ?? []).map((s) => [suburbText(s), s.id]));
}

// The id for "Name, ST" (or a bare name that only one suburb has), else null.
export async function resolveSuburb(label, known = new Map()) {
  const text = label.trim();
  if (known.has(text)) return known.get(text);
  const [name, st] = text.split(',').map((s) => s.trim());
  if (!name) return null;
  const db = await getClient();
  let query = db.from('suburbs').select('id').ilike('name', clean(name));
  if (st) query = query.eq('state', st.toUpperCase());
  const { data } = await query.limit(2);
  return data?.length === 1 ? data[0].id : null;
}

export async function suburbLabel(id) {
  if (id == null) return '';
  const db = await getClient();
  const { data } = await db.from('suburbs').select('name, state').eq('id', id).maybeSingle();
  return data ? suburbText(data) : '';
}

// Wires a text input to a <datalist>; returns the Map of the latest options.
export function attachSuburbList(input, datalist) {
  const known = new Map();
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const found = await searchSuburbs(input.value);
      for (const [k, v] of found) known.set(k, v);
      const options = [...found.keys()].map((label) => Object.assign(document.createElement('option'), { value: label }));
      datalist.replaceChildren(...options);
    }, 150);
  });
  return known;
}

// The place a search runs around (BR-SRC-003, BR-AVL-005): centre, time zone and whether it is a city.
export async function getPlace(id) {
  if (!id) return null;
  const db = await getClient();
  if (!db) return null;
  const { data } = await db.from('suburbs').select('id, name, state, lat, lng, timezone, is_city').eq('id', id).maybeSingle();
  return data ? { id: data.id, label: suburbText(data), lat: data.lat, lng: data.lng, timezone: data.timezone, isCity: data.is_city } : null;
}
