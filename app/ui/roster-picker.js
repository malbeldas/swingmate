// Roster picker (UC-002, BR-ROS-001, BR-ROS-002). Texts from the prototype's "Your roster" dialog
// (frontend-migration.md), plus "Other pattern" from BR-ROS-002. Saving is up to the caller:
// onSave(roster) with a roster, or onSave(null) for "No fixed roster" (BR-ROS-005).
import { MAX_DAYS, MIN_DAYS, ROSTER_PATTERNS, makeRoster, rosterLabel, rosterWeeks, validateRoster } from '../../core/roster.js';
import { addDays, mondayOf } from '../../core/dates.js';

const PREVIEW_WEEKS = 4;
const OTHER = 'other';
const NONE = 'none';

let dialog;
let draft;
let onSaveCallback = () => {};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function weekGrid(weeks, { compact = false } = {}) {
  return el('div', { class: `weeks${compact ? ' compact' : ''}`, role: 'table', 'aria-label': 'Your roster by week' },
    compact ? null : el('div', { class: 'week head', role: 'row' }, el('span', { role: 'columnheader' }),
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => el('span', { role: 'columnheader' }, d))),
    weeks.map((w) => el('div', { class: 'week', role: 'row' },
      el('span', { class: 'week-label', role: 'rowheader' }, w.label),
      w.cells.map((c) => el('span', { class: `night ${c.kind}${c.past ? ' past' : ''}`, role: 'cell', title: c.title, 'aria-label': c.title, 'data-date': c.date }, compact ? '' : String(c.day))))));
}

export function rosterLegend() {
  return el('div', { class: 'legend' },
    el('span', {}, el('span', { class: 'swatch away', 'aria-hidden': 'true' }), 'On site'),
    el('span', {}, el('span', { class: 'swatch home', 'aria-hidden': 'true' }), 'Home (R&R)'),
    el('span', {}, el('span', { class: 'swatch travel', 'aria-hidden': 'true' }), 'You fly home (you need a bed that night)'));
}

function draftRoster() {
  if (draft.pattern === NONE) return null;
  const preset = ROSTER_PATTERNS.find((p) => p.label === draft.pattern);
  return makeRoster({
    daysOn: preset ? preset.daysOn : Number(draft.daysOn),
    daysOff: preset ? preset.daysOff : Number(draft.daysOff),
    anchor: draft.anchor,
    fliesHomeLastDay: draft.flyHome,
    fliesOutFirstDay: draft.flyOut,
  });
}

function render() {
  const body = dialog.querySelector('.sheet-body');
  const patterns = [...ROSTER_PATTERNS.map((p) => [p.label, p.label.replace(':', ' : ')]), [OTHER, 'Other pattern'], [NONE, 'No fixed roster']];
  const chips = el('div', { class: 'segmented' }, patterns.map(([key, label]) => el('button', {
    type: 'button',
    'aria-pressed': String(draft.pattern === key),
    onclick: () => { draft.pattern = key; draft.error = ''; render(); },
  }, label)));
  const parts = [
    el('h2', { id: 'roster-title' }, 'Your roster'),
    el('p', { class: 'muted' }, "We use it to show homes that are free when you're home."),
    el('fieldset', { class: 'field plain' }, el('legend', {}, 'Pattern (days on : days off)'), chips),
  ];

  if (draft.pattern === OTHER) {
    const number = (name, label) => {
      const input = el('input', { type: 'number', name, inputmode: 'numeric', min: String(MIN_DAYS), max: String(MAX_DAYS), value: draft[name] });
      input.addEventListener('input', () => { draft[name] = input.value; renderPreview(); });
      return el('label', { class: 'field' }, label, input);
    };
    parts.push(el('div', { class: 'grid-2 tight' }, number('daysOn', 'Days on site'), number('daysOff', 'Days in town')),
      el('span', { class: 'hint' }, `Whole days, from ${MIN_DAYS} to ${MAX_DAYS}.`));
  }

  if (draft.pattern === NONE) {
    parts.push(el('p', { class: 'notice', id: 'no-roster-note' }, "No problem. Search with the dates you need and we'll show homes free for those days."));
  } else {
    const anchor = el('input', { type: 'date', name: 'anchor', value: draft.anchor, 'aria-invalid': draft.error === 'anchor' ? 'true' : null });
    anchor.addEventListener('input', () => { draft.anchor = anchor.value; renderPreview(); });
    const flyHome = el('input', { type: 'checkbox', name: 'flyHome', checked: draft.flyHome });
    flyHome.addEventListener('change', () => { draft.flyHome = flyHome.checked; renderPreview(); });
    const flyOut = el('input', { type: 'checkbox', name: 'flyOut', checked: draft.flyOut });
    flyOut.addEventListener('change', () => { draft.flyOut = flyOut.checked; renderPreview(); });
    parts.push(
      el('label', { class: 'field' }, 'When does your next swing start?', anchor, el('span', { class: 'hint' }, 'The day you fly or drive out. Any weekday works.')),
      el('label', { class: 'check' }, flyHome, 'I fly home on the last day of my swing, so I need a bed that night'),
      el('label', { class: 'check' }, flyOut, 'I fly out on the first day of my next swing, so I need a bed the night before'),
      el('div', { class: 'stack-tight', id: 'roster-preview' }));
  }

  parts.push(
    el('p', { class: 'form-error', role: 'alert', hidden: !draft.error }, draft.error ? errorText(draft.error) : ''),
    el('span', { class: 'hint' }, 'Hosts only see your pattern, never your site or employer. You can change it any time.'),
    el('div', { class: 'cta-row' },
      el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => dialog.close() }, 'Cancel'),
      el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: save }, 'Save roster')),
  );
  body.replaceChildren(...parts);
  renderPreview();
}

function errorText(error) {
  if (error === 'anchor') return 'Choose the day your next swing starts';
  if (error === 'days') return `Days on site and in town go from ${MIN_DAYS} to ${MAX_DAYS}`;
  return 'Something went wrong. Try again.';
}

function renderPreview() {
  const box = dialog.querySelector('#roster-preview');
  if (!box) return;
  const roster = draftRoster();
  if (!roster || validateRoster(roster).length) return box.replaceChildren();
  box.replaceChildren(el('span', { class: 'micro' }, `Next ${PREVIEW_WEEKS} weeks · ${rosterLabel(roster)}`),
    weekGrid(rosterWeeks(roster, draft.today, PREVIEW_WEEKS), { compact: true }), rosterLegend());
}

// UC-002 E1: no saving without the anchor.
async function save() {
  const roster = draftRoster();
  if (roster) {
    const issues = validateRoster(roster);
    if (issues.includes('anchor')) { draft.error = 'anchor'; return render(); }
    if (issues.length) { draft.error = 'days'; return render(); }
  }
  const result = await onSaveCallback(roster);
  if (result?.error) { draft.error = 'generic'; return render(); }
  dialog.close();
}

function build() {
  dialog = el('dialog', { class: 'sheet', 'aria-labelledby': 'roster-title', id: 'roster-picker' },
    el('div', { class: 'sheet-head' },
      el('span', { class: 'sheet-step micro' }, 'Roster'),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => dialog.close() }, '×')),
    el('div', { class: 'sheet-body stack' }));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
}

// roster: the current one or null. today: Perth's date (BR-AVL-005).
export function openRosterPicker({ roster = null, today, onSave }) {
  if (!dialog) build();
  onSaveCallback = onSave;
  const preset = roster && ROSTER_PATTERNS.find((p) => p.daysOn === roster.daysOn && p.daysOff === roster.daysOff);
  draft = {
    today,
    pattern: roster ? (preset ? preset.label : OTHER) : ROSTER_PATTERNS[0].label,
    daysOn: roster ? String(roster.daysOn) : '',
    daysOff: roster ? String(roster.daysOff) : '',
    // BR-ROS-001: by default the next swing starts on the coming Monday and both flight answers are yes.
    anchor: roster?.anchor ?? addDays(mondayOf(today), 7),
    flyHome: roster?.fliesHomeLastDay ?? true,
    flyOut: roster?.fliesOutFirstDay ?? true,
    error: '',
  };
  render();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('[aria-pressed="true"]')?.focus();
}
