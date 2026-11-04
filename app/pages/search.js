// Results (UC-001). Texts and layout from the prototype's results screen (frontend-migration.md).
// The database returns active listings in the radius with their nights (search_listings); the fit,
// the filters and the order run here with core/ (DEC-104).
import { getClient } from '../db.js';
import { initEvents, trackEvent } from '../events.js';
import { el } from '../ui/dom.js';
import { initAccountMenu } from '../ui/account-menu.js';
import { openRosterPicker } from '../ui/roster-picker.js';
import { attachSuburbList, getPlace, resolveSuburb } from '../suburbs.js';
import { deleteOwnRoster, getOwnRoster, getSessionUser, saveOwnRoster } from '../session.js';
import { clearVisitorRoster, readVisitorRoster, writeVisitorRoster } from '../visitor-roster.js';
import { addDays, todayIn } from '../../core/dates.js';
import { needFor } from '../../core/fit.js';
import { rosterSummaryText } from '../../core/roster.js';
import {
  TEXTS, cardTexts, cardWeeks, chosenRadius, defaultFilters, radiusOptions, readSearchParams,
  resultsHeading, resultsView, searchIssues, searchParamsFor, searchStart, widerRadius, withFit,
} from '../../core/search.js';

const FIRST_VISIT_KEY = 'swingmate.firstVisitDone'; // AC-002-5: a flag, no personal data
const DEFAULT_ZONE = 'Australia/Perth'; // BR-AVL-005 until a place is chosen

const form = document.getElementById('search-form');
const results = document.getElementById('results');
const filtersBox = document.getElementById('filters');
const known = attachSuburbList(form.place, document.getElementById('place-list'));

const state = {
  place: null,
  radiusKm: null,
  checkIn: null,
  checkOut: null,
  roster: null,
  user: null,
  rows: null,
  start: null,
  need: null,
  filters: defaultFilters(),
};

const today = () => todayIn(state.place?.timezone ?? DEFAULT_ZONE);

// ---------------------------------------------------------------------------------------------
// First visit strip (DEC-016, AC-002-5)
// ---------------------------------------------------------------------------------------------

function firstVisitDone() {
  try { localStorage.setItem(FIRST_VISIT_KEY, '1'); } catch { /* storage off: it shows again */ }
  document.getElementById('first-visit').hidden = true;
}

function initFirstVisit() {
  let done = false;
  try { done = localStorage.getItem(FIRST_VISIT_KEY) === '1'; } catch { /* storage off */ }
  document.getElementById('first-visit').hidden = done;
  document.getElementById('first-visit-close').addEventListener('click', firstVisitDone);
}

// ---------------------------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------------------------

function fillRadius() {
  const select = form.radius;
  const km = chosenRadius(state.radiusKm, state.place);
  select.replaceChildren(...radiusOptions(state.place).map((r) => new Option(`${r} km`, String(r), false, r === km)));
}

function renderRosterButton() {
  document.getElementById('roster-summary').textContent = state.roster ? `${rosterSummaryText(state.roster, today())} · Edit` : 'Add my roster';
}

function showError(id, text) {
  const node = document.getElementById(id);
  node.textContent = text ?? '';
  node.hidden = !text;
}

function renderDatesHint() {
  const hint = document.getElementById('dates-hint');
  const dated = Boolean(state.checkIn && state.checkOut);
  document.getElementById('clear-dates').hidden = !dated;
  if (dated && state.need?.capped) {
    hint.textContent = TEXTS.capped(state.need.totalNights);
  } else if (dated && state.roster) {
    hint.textContent = 'Your dates are used for this search instead of your roster.';
  } else {
    hint.textContent = '';
  }
  hint.hidden = !hint.textContent;
}

async function storeRoster(roster) {
  if (state.user) {
    const { error } = roster ? await saveOwnRoster(state.user.id, roster) : await deleteOwnRoster(state.user.id);
    if (error) return { error };
  } else if (roster) {
    writeVisitorRoster(roster);
  } else {
    clearVisitorRoster();
  }
  state.roster = roster;
  if (roster) firstVisitDone(); // AC-002-5
  renderRosterButton();
  if (state.rows) recompute();
  return {};
}

async function submit(e) {
  e?.preventDefault();
  const label = form.place.value;
  const placeId = label ? await resolveSuburb(label, known) : null;
  const checkIn = form.checkIn.value || null;
  const checkOut = form.checkOut.value || null;
  const issues = searchIssues({ placeId, checkIn, checkOut }, today());
  form.place.setAttribute('aria-invalid', String(issues.includes('place')));
  form.checkIn.setAttribute('aria-invalid', String(issues.includes('checkIn')));
  form.checkOut.setAttribute('aria-invalid', String(issues.includes('checkOut')));
  showError('place-error', issues.includes('place') ? TEXTS.chooseLocation : '');
  showError('dates-error', issues.includes('checkIn') ? TEXTS.checkIn : issues.includes('checkOut') ? TEXTS.checkOut : '');
  if (issues.length) return; // UC-001 E1/E2: no search

  if (placeId !== state.place?.id) {
    state.place = await getPlace(placeId);
    state.radiusKm = null;
    fillRadius();
  }
  state.radiusKm = chosenRadius(Number(form.radius.value), state.place);
  state.checkIn = checkIn;
  state.checkOut = checkOut;
  history.replaceState(null, '', `?${searchParamsFor({ placeId, radiusKm: state.radiusKm, checkIn, checkOut })}`);
  await load();
}

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

async function load() {
  const db = await getClient();
  state.start = searchStart(state, today());
  results.replaceChildren(el('p', { class: 'muted' }, 'Loading homes…'));
  const { data, error } = await db.rpc('search_listings', {
    p_lat: state.place.lat, p_lng: state.place.lng, p_radius_km: state.radiusKm, p_start: state.start,
  });
  if (error) {
    // UC-001 E3: keep what was typed and offer to retry.
    state.rows = null;
    filtersBox.hidden = true;
    results.replaceChildren(el('div', { class: 'card stack empty-state', id: 'load-error' },
      el('p', {}, TEXTS.loadError),
      el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: load }, 'Try again')));
    return;
  }
  state.rows = data ?? [];
  recompute();
  trackSearch();
}

// BR-ANL-001 search_performed: how many homes of each fit came back, never the place typed.
function trackSearch() {
  const n = (fitClass) => state.items.filter((i) => i.fitClass === fitClass).length;
  trackEvent('search_performed', {
    has_dates: Boolean(state.checkIn && state.checkOut),
    has_roster: Boolean(state.roster),
    radius_km: state.radiusKm,
    n_full: n('full'), n_strong: n('strong'), n_partial: n('partial'), n_poor: n('poor'),
    state: state.place.state,
  });
}

function showNear(view) {
  trackEvent('near_matches_opened', { n_partial: view.nearHidden });
  writeFilters({ ...state.filters, near: true });
}

function recompute() {
  state.start = searchStart(state, today());
  state.need = needFor({ checkIn: state.checkIn, checkOut: state.checkOut, roster: state.roster }, today());
  state.items = state.rows.map((row) => withFit(row, state.need, state.start));
  renderDatesHint();
  renderResults();
}

function readFilters() {
  const f = filtersBox;
  state.filters = {
    great: f.querySelector('[name=great]').checked,
    good: f.querySelector('[name=good]').checked,
    near: f.querySelector('[name=near]').checked,
    placeTypes: ['private_room', 'entire_place'].filter((t) => f.querySelector(`[name=${t}]`).checked),
    maxPrice: f.querySelector('[name=maxPrice]').value ? Number(f.querySelector('[name=maxPrice]').value) : null,
  };
  renderResults();
}

function writeFilters(filters) {
  const f = filtersBox;
  state.filters = filters;
  f.querySelector('[name=great]').checked = filters.great;
  f.querySelector('[name=good]').checked = filters.good;
  f.querySelector('[name=near]').checked = filters.near;
  for (const t of ['private_room', 'entire_place']) f.querySelector(`[name=${t}]`).checked = filters.placeTypes.includes(t);
  f.querySelector('[name=maxPrice]').value = filters.maxPrice == null ? '' : String(filters.maxPrice);
  renderResults();
}

function legend(hasFit) {
  return el('div', { class: 'legend', 'aria-label': 'Legend' },
    el('span', {}, el('span', { class: 'swatch free', 'aria-hidden': 'true' }), 'Available'),
    el('span', {}, el('span', { class: 'swatch off', 'aria-hidden': 'true' }), 'Unavailable'),
    hasFit && el('span', {}, el('span', { class: 'swatch need', 'aria-hidden': 'true' }), state.need.byDates ? 'Your dates' : 'Your R&R'));
}

function photo(item) {
  const box = el('div', { class: 'result-photo' });
  if (!item.cover_path) {
    box.append(el('span', { class: 'small' }, 'No photo yet'));
    return box;
  }
  getClient().then((db) => {
    const img = el('img', { src: db.storage.from('listing-photos').getPublicUrl(item.cover_path).data.publicUrl, alt: item.title, loading: 'lazy' });
    img.addEventListener('error', () => box.replaceChildren(el('span', { class: 'small' }, 'No photo yet')));
    box.replaceChildren(img);
  });
  return box;
}

// The detail opens with the same search, so its fit matches the card and "Back to search"
// returns to this list (UC-003).
function listingHref(item) {
  const search = searchParamsFor({ placeId: state.place.id, radiusKm: state.radiusKm, checkIn: state.checkIn, checkOut: state.checkOut });
  return `listing.html?id=${encodeURIComponent(item.id)}&${search}`;
}

function card(item) {
  const t = cardTexts(item, state.need);
  const weeks = cardWeeks(item, state.need, state.start);
  return el('article', { class: 'result-card', 'data-id': item.id, 'data-fit': item.fitClass ?? 'none' },
    photo(item),
    el('div', { class: 'result-body stack-tight' },
      el('div', { class: 'result-top' },
        el('div', { class: 'stack-tight' },
          el('h2', { class: 'result-title' }, item.title),
          el('span', { class: 'small text-2' }, t.where),
          el('span', { class: 'small' }, [t.type, t.bathroom, item.bills_included ? 'Bills included' : null].filter(Boolean).join(' · '))),
        el('div', { class: 'result-price' },
          el('strong', {}, t.price), el('span', { class: 'small text-2' }, ' / week'),
          t.fitLabel && el('span', { class: `fit-badge ${item.fitClass}` }, t.fitLabel))),
      el('div', { class: 'weeks card-weeks', role: 'table', 'aria-label': `Availability for the next ${weeks.length} weeks` },
        weeks.map((w) => el('div', { class: 'week', role: 'row' },
          el('span', { class: 'week-label', role: 'rowheader' }, w.label),
          w.cells.map((c) => el('span', {
            class: `night ${c.free ? 'free' : 'off'}${c.need ? ' need' : ''}`, role: 'cell', title: c.title, 'aria-label': c.title,
          }))))),
      el('div', { class: 'result-bottom' },
        el('span', { class: 'small' }, t.line),
        el('a', { class: 'btn btn-secondary btn-sm', href: listingHref(item) }, 'View home'))));
}

function emptyState(view) {
  const place = state.place.label;
  const wider = widerRadius(state.radiusKm, state.place);
  // BR-SRC-005: near matches, a wider radius, alerts, "List your place", in that order. Alerts
  // arrive with UC-006.
  const outs = [
    view.nearHidden > 0 && el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => showNear(view) }, 'Show near matches'),
    wider && el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'widen', onclick: () => { form.radius.value = String(wider); submit(); } }, TEXTS.widen(wider)),
  ];
  if (view.state === 'filtered-empty') {
    return el('div', { class: 'card stack empty-state', id: 'filtered-empty' },
      el('h1', {}, TEXTS.filteredEmptyTitle),
      el('p', {}, TEXTS.filteredEmptyBody(place)),
      el('div', { class: 'cta-row' },
        view.nearHidden > 0 && outs[0],
        el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => writeFilters(defaultFilters()) }, 'Clear filters')));
  }
  return el('div', { class: 'card stack empty-state', id: 'no-results' },
    el('h1', {}, view.state === 'none' ? TEXTS.noResultsTitle(place) : TEXTS.noFitTitle(place)),
    el('div', { class: 'cta-row' }, outs),
    el('p', { class: 'small' }, el('a', { href: 'list.html' }, TEXTS.listYourPlace(place))));
}

function renderResults() {
  if (!state.items) return;
  const view = resultsView(state.items, state.filters);
  filtersBox.hidden = view.state === 'none';
  document.getElementById('fit-filters').hidden = !view.hasFit;
  document.getElementById('fit-filters-off').hidden = view.hasFit;

  if (view.state !== 'results') {
    results.replaceChildren(emptyState(view));
    return;
  }
  results.replaceChildren(
    el('div', { class: 'results-head' },
      el('div', {},
        el('h1', { id: 'results-heading' }, resultsHeading(view.shown.length, state.place.label)),
        el('span', { class: 'small text-2' }, view.hasFit ? TEXTS.sortNote : TEXTS.sortNoteNoFit)),
      legend(view.hasFit)),
    el('div', { class: 'stack' }, view.shown.map(card)),
    view.nearHidden > 0 && el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'show-near', onclick: () => showNear(view) },
      `Show near matches (${view.nearHidden})`),
    view.hasFit && view.poorCount > 0 && el('p', { class: 'small text-2' }, TEXTS.poorNote));
}

// ---------------------------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------------------------

async function init() {
  initFirstVisit();
  const db = await getClient();
  initAccountMenu(document.getElementById('account'));
  if (db) initEvents('search');
  if (!db) {
    form.hidden = true;
    results.replaceChildren(el('p', { class: 'lead' }, 'Search opens with the pilot. ', el('a', { href: './' }, 'Back to SwingMate')));
    return;
  }

  const { data: user } = await getSessionUser();
  state.user = user;
  state.roster = user ? (await getOwnRoster(user.id)).data : readVisitorRoster();
  renderRosterButton();

  const t = today();
  form.checkIn.min = t;
  form.checkIn.max = addDays(t, 365);
  form.checkOut.min = addDays(t, 1);
  form.checkIn.addEventListener('change', () => { if (form.checkIn.value) form.checkOut.min = addDays(form.checkIn.value, 1); });
  form.addEventListener('submit', submit);
  form.radius.addEventListener('change', () => { if (state.place) submit(); });
  document.getElementById('clear-dates').addEventListener('click', () => { form.checkIn.value = ''; form.checkOut.value = ''; submit(); });
  document.getElementById('roster-btn').addEventListener('click', () => openRosterPicker({ roster: state.roster, today: today(), onSave: storeRoster }));
  filtersBox.addEventListener('change', readFilters);
  // Filters start open beside the list on wide screens and folded above it on phones.
  filtersBox.open = matchMedia('(min-width: 1024px)').matches;

  const params = readSearchParams(new URLSearchParams(location.search));
  state.place = await getPlace(params.placeId);
  state.radiusKm = params.radiusKm;
  fillRadius();
  if (!state.place) return;
  form.place.value = state.place.label;
  known.set(state.place.label, state.place.id);
  if (params.checkIn && params.checkOut) {
    form.checkIn.value = params.checkIn;
    form.checkOut.value = params.checkOut;
  }
  await submit();
}

init();
