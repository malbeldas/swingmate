// "Find my match" step by step (UC-002 A0 and UC-001, DEC-016): the roster, the next swing on a
// calendar that paints itself, then the place. It ends on the results page with the roster kept
// like any other (BR-ROS-006: the profile with a session, this browser tab without one).
import { addDays, formatDayLong, todayIn } from '../../core/dates.js';
import { MAX_DAYS, MIN_DAYS, ROSTER_PATTERNS, makeRoster, rosterLabel } from '../../core/roster.js';
import {
  FIND_STEPS, canContinue, monthOf, monthTitle, monthWeeks, needText, paintMonth, patternPreview, patternText, shiftMonth,
} from '../../core/onboarding.js';
import { chosenRadius, radiusOptions, searchParamsFor } from '../../core/search.js';
import { el } from '../ui/dom.js';
import { initAccountMenu } from '../ui/account-menu.js';
import { attachSuburbList, getPlace, resolveSuburb } from '../suburbs.js';
import { getSessionUser, saveOwnRoster } from '../session.js';
import { writeVisitorRoster } from '../visitor-roster.js';
import { initEvents, trackEvent } from '../events.js';
import { getClient } from '../db.js';

const FIRST_VISIT_KEY = 'swingmate.firstVisitDone'; // AC-002-5: same flag as the results page
const OTHER = 'other';
const KIND_TEXT = { away: 'on site', travel: 'last day on site, you fly home', home: 'home' };

const today = () => todayIn('Australia/Perth'); // BR-AVL-005 until a place is chosen
const form = document.getElementById('find-form');

const state = {
  step: 0,
  pattern: null, daysOn: null, daysOff: null,
  anchor: null, month: monthOf(today()),
  fliesHomeLastDay: true, fliesOutFirstDay: true,
  placeText: '', placeId: null, place: null, radiusKm: null,
  known: new Map(),
  user: null,
};

const roster = () => (state.anchor ? makeRoster({
  daysOn: state.daysOn, daysOff: state.daysOff, anchor: state.anchor,
  fliesHomeLastDay: state.fliesHomeLastDay, fliesOutFirstDay: state.fliesOutFirstDay,
}) : null);

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

function strip(kinds) {
  return el('div', { class: 'find-strip', role: 'img', 'aria-label': `One swing: ${kinds.filter((k) => k === 'away').length} nights on site, ${kinds.filter((k) => k !== 'away').length} nights you need a bed` },
    kinds.map((k) => el('span', { class: `night ${k}` })));
}

function legend() {
  return el('div', { class: 'legend' },
    el('span', {}, el('span', { class: 'swatch away', 'aria-hidden': 'true' }), 'On site'),
    el('span', {}, el('span', { class: 'swatch travel', 'aria-hidden': 'true' }), 'You fly home'),
    el('span', {}, el('span', { class: 'swatch home', 'aria-hidden': 'true' }), 'Home: you need a bed'));
}

function question(title, text) {
  return el('div', { class: 'stack-tight' }, el('h1', { class: 'find-title', id: 'find-title', tabindex: '-1' }, title), el('p', { class: 'text-2' }, text));
}

function continueBar(label, enabled) {
  const back = state.step > 0 ? el('button', { type: 'button', class: 'btn btn-secondary', id: 'find-back', onclick: () => go(state.step - 1) }, 'Back') : null;
  return el('div', { class: 'find-actions' }, back,
    el('button', { type: 'submit', class: 'btn btn-primary', id: 'find-next', disabled: !enabled, 'aria-disabled': String(!enabled) }, label));
}

// ---------------------------------------------------------------------------------------------
// Step 1: the roster
// ---------------------------------------------------------------------------------------------

function stepRoster() {
  const choose = (pattern) => {
    state.pattern = pattern;
    const preset = ROSTER_PATTERNS.find((p) => p.label === pattern);
    if (preset) { state.daysOn = preset.daysOn; state.daysOff = preset.daysOff; }
    if (pattern === OTHER && !Number.isInteger(state.daysOn)) { state.daysOn = 8; state.daysOff = 6; }
    render();
  };
  const chips = el('div', { class: 'find-chips', role: 'group', 'aria-label': 'Roster' },
    ROSTER_PATTERNS.map((p) => el('button', { type: 'button', class: 'find-chip', 'aria-pressed': String(state.pattern === p.label), onclick: () => choose(p.label) }, `${p.daysOn} on / ${p.daysOff} off`)),
    el('button', { type: 'button', class: 'find-chip', 'aria-pressed': String(state.pattern === OTHER), onclick: () => choose(OTHER) }, 'Something else'));

  const other = state.pattern === OTHER ? el('div', { class: 'find-other' },
    el('label', { class: 'field' }, 'Days on site', el('input', { type: 'number', name: 'daysOn', min: MIN_DAYS, max: MAX_DAYS, value: state.daysOn ?? '', inputmode: 'numeric' })),
    el('label', { class: 'field' }, 'Days at home', el('input', { type: 'number', name: 'daysOff', min: MIN_DAYS, max: MAX_DAYS, value: state.daysOff ?? '', inputmode: 'numeric' }))) : null;
  other?.addEventListener('input', (e) => {
    state[e.target.name] = Number(e.target.value);
    const ok = canContinue('roster', state);
    preview.replaceChildren(...previewBody(ok));
    document.getElementById('find-next').disabled = !ok;
  });

  const ok = canContinue('roster', state);
  const preview = el('div', { class: 'find-preview card', id: 'find-preview', 'aria-live': 'polite' }, previewBody(ok));
  return [
    question('What’s your roster?', 'Pick the swing you work. We use it to find rooms that are free when you’re home.'),
    chips, other, preview,
    el('a', { class: 'btn-text find-dates-link', href: 'search.html' }, 'No fixed roster? Search with your dates'),
    continueBar('Continue', ok),
  ];
}

function previewBody(ok) {
  if (!ok) return [el('p', { class: 'micro' }, 'Your swing'), strip(Array(14).fill('off')), el('p', { class: 'small' }, 'Pick a roster to see your swing.')];
  const kinds = patternPreview(state);
  return [el('p', { class: 'micro' }, 'Your swing'), strip(kinds), el('p', { class: 'find-preview-text' }, patternText(state.daysOn, state.daysOff, state.fliesHomeLastDay, state.fliesOutFirstDay))];
}

// ---------------------------------------------------------------------------------------------
// Step 2: the next swing, on a calendar
// ---------------------------------------------------------------------------------------------

function stepStart() {
  const from = today();
  const r = roster();
  const weeks = paintMonth(monthWeeks(state.month), r, from);
  const canPrev = state.month > monthOf(from);
  const canNext = state.month < monthOf(addDays(from, 365));
  const head = el('div', { class: 'find-month' },
    el('button', { type: 'button', class: 'btn-text', disabled: !canPrev, 'aria-label': 'Previous month', onclick: () => { state.month = shiftMonth(state.month, -1); render(); } }, '←'),
    el('h2', { class: 'find-month-title', 'aria-live': 'polite' }, monthTitle(state.month)),
    el('button', { type: 'button', class: 'btn-text', disabled: !canNext, 'aria-label': 'Next month', onclick: () => { state.month = shiftMonth(state.month, 1); render(); } }, '→'));
  const grid = el('div', { class: 'find-cal', role: 'grid', 'aria-label': `When does your next swing start? ${monthTitle(state.month)}` },
    el('div', { class: 'find-cal-row', role: 'row' }, ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => el('span', { class: 'find-dow', role: 'columnheader' }, d))),
    weeks.map((week) => el('div', { class: 'find-cal-row', role: 'row' }, week.map((cell) => {
      if (!cell) return el('span', { role: 'gridcell' });
      const past = cell.date < from;
      const picked = cell.date === state.anchor;
      const label = `${formatDayLong(cell.date)}${cell.kind ? `: ${KIND_TEXT[cell.kind]}` : ''}`;
      return el('button', {
        type: 'button', role: 'gridcell', class: `find-day${cell.kind ? ` night ${cell.kind}` : ''}${picked ? ' picked' : ''}`,
        disabled: past, 'aria-pressed': String(picked), 'aria-label': label, title: label, 'data-date': cell.date,
        onclick: () => { state.anchor = cell.date; render(); document.querySelector(`[data-date="${cell.date}"]`)?.focus(); },
      }, String(Number(cell.date.slice(8, 10))));
    }))));

  const flights = el('fieldset', { class: 'find-flights stack-tight' },
    el('legend', { class: 'small' }, 'Flights (most people leave these on)'),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'fliesOutFirstDay', checked: state.fliesOutFirstDay }), 'I fly out on the first day of my swing'),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'fliesHomeLastDay', checked: state.fliesHomeLastDay }), 'I fly home on the last day, so I need a bed that night'));
  flights.addEventListener('change', (e) => { state[e.target.name] = e.target.checked; render(); });

  const summary = r ? el('p', { class: 'find-summary', id: 'find-summary', 'aria-live': 'polite' }, needText(r, from, 28) || 'No nights in town in the next four weeks.') : el('p', { class: 'small', id: 'find-summary' }, 'Tap the day you fly out to site.');
  return [
    question('When does your next swing start?', 'Tap the day you go back to site. Your swing fills the calendar.'),
    el('div', { class: 'find-cal-box' }, head, grid, r ? legend() : null),
    summary, flights,
    continueBar('Continue', canContinue('start', state, from)),
  ];
}

// ---------------------------------------------------------------------------------------------
// Step 3: the place
// ---------------------------------------------------------------------------------------------

function stepPlace() {
  const input = el('input', { type: 'text', name: 'place', list: 'find-place-list', autocomplete: 'off', placeholder: 'Suburb or city', value: state.placeText, 'aria-describedby': 'find-place-error' });
  const list = el('datalist', { id: 'find-place-list' });
  for (const [k, v] of attachSuburbList(input, list)) state.known.set(k, v);
  const error = el('span', { class: 'form-error', id: 'find-place-error', role: 'alert', hidden: true });
  const radius = el('select', { name: 'radius', id: 'find-radius' });
  const fillRadius = () => {
    const km = chosenRadius(state.radiusKm, state.place);
    radius.replaceChildren(...radiusOptions(state.place).map((o) => el('option', { value: o, selected: o === km }, `${o} km`)));
    state.radiusKm = km;
  };
  fillRadius();
  const choose = async () => {
    state.placeText = input.value;
    state.placeId = input.value ? await resolveSuburb(input.value, state.known) : null;
    state.place = state.placeId ? await getPlace(state.placeId) : null;
    fillRadius();
    error.hidden = true;
  };
  input.addEventListener('change', choose);
  radius.addEventListener('change', () => { state.radiusKm = Number(radius.value); });
  const r = roster();
  return [
    question('Where do you want to stay?', 'A suburb or a city. We look around it.'),
    el('div', { class: 'stack-tight find-place' }, el('label', { class: 'field' }, 'Location', input), list, error),
    el('label', { class: 'field find-radius' }, 'How far from it', radius),
    el('div', { class: 'find-recap card' },
      el('p', { class: 'micro' }, 'Your search'),
      el('p', { class: 'find-recap-text' }, `${rosterLabel(r)} roster · ${needText(r, today(), 28) || 'next swing ' + formatDayLong(r.anchor)}`)),
    continueBar('Show my matches', true),
  ];
}

// ---------------------------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------------------------

const STEP_VIEWS = { roster: stepRoster, start: stepStart, place: stepPlace };

function render() {
  const name = FIND_STEPS[state.step];
  document.getElementById('find-step-label').textContent = `Step ${state.step + 1} of ${FIND_STEPS.length}`;
  document.querySelectorAll('.find-progress span').forEach((s, i) => s.classList.toggle('on', i <= state.step));
  form.dataset.step = name;
  form.replaceChildren(...STEP_VIEWS[name]().filter(Boolean));
}

function go(step) {
  state.step = step;
  render();
  document.getElementById('find-title')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

async function finish() {
  const input = form.querySelector('input[name="place"]');
  if (input && input.value !== state.placeText) {
    state.placeText = input.value;
    state.placeId = input.value ? await resolveSuburb(input.value, state.known) : null;
  }
  if (!canContinue('place', state)) {
    const error = document.getElementById('find-place-error');
    error.textContent = 'Choose a suburb or city from the list.';
    error.hidden = false;
    input?.setAttribute('aria-invalid', 'true');
    input?.focus();
    return;
  }
  const r = roster();
  // BR-ROS-006: with a session the roster goes to the profile; without one, to this tab only.
  if (state.user) {
    const { error } = await saveOwnRoster(state.user.id, r);
    if (error) writeVisitorRoster(r);
  } else {
    writeVisitorRoster(r);
  }
  try { localStorage.setItem(FIRST_VISIT_KEY, '1'); } catch { /* storage off */ } // AC-002-5
  trackEvent('roster_completed', { pattern: rosterLabel(r), fly_home_last_day: r.fliesHomeLastDay, fly_out_first_day: r.fliesOutFirstDay, logged_in: Boolean(state.user) });
  location.href = `search.html?${searchParamsFor({ placeId: state.placeId, radiusKm: state.radiusKm })}`;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = FIND_STEPS[state.step];
  if (name === 'place') { finish(); return; }
  if (!canContinue(name, state, today())) return;
  go(state.step + 1);
});

async function init() {
  render();
  initAccountMenu(document.getElementById('account'));
  const db = await getClient();
  if (!db) return;
  initEvents('find');
  const { data: user } = await getSessionUser();
  state.user = user ?? null;
}

init();
