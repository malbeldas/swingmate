// Saved homes (UC-005, issue #30): the texts of the Save button and of "Saved homes" in My account,
// from the prototype, and what each saved listing shows by its status (AC-005-2, UC-005 E1).

export const SAVED_TEXTS = {
  title: 'Saved homes',
  none: 'Nothing saved yet. Tap “Save” on any home to keep it here.',
  save: 'Save',
  saved: 'Saved',
  view: 'View',
  remove: 'Remove',
  failed: 'That didn’t save. Try again.',
};

const STATUS_LABELS = { paused: 'Paused', filled: 'Filled', gone: 'No longer available' };

// null for a live listing: it needs no label.
export function savedStatusLabel(status) {
  return STATUS_LABELS[status] ?? null;
}

// What the button says and announces: the heart is decoration, the word carries the state.
export function saveButtonState(saved) {
  return { text: saved ? SAVED_TEXTS.saved : SAVED_TEXTS.save, pressed: saved ? 'true' : 'false' };
}

// "$270 / week · Dampier, WA"; nothing for a listing that is gone.
export function savedLine(row) {
  if (!row || row.status === 'gone') return '';
  const where = row.suburb_name ? `${row.suburb_name}, ${row.state}` : null;
  return [row.weekly_price != null ? `$${row.weekly_price} / week` : null, where].filter(Boolean).join(' · ');
}

// A gone listing can't be opened any more; the others open by link (BR-LST-002).
export function savedCanOpen(row) {
  return Boolean(row) && row.status !== 'gone';
}
