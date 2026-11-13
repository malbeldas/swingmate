import { addDays, dayNumber, mod } from '../../core/dates.js';
import { ROSTER_PATTERNS, cycleLength, makeRoster, nightKind, neededBlocks, neededNights } from '../../core/roster.js';
import { HORIZON_NIGHTS, cardLine, computeFit, fitLabel } from '../../core/fit.js';
import { writeVisitorRoster } from '../visitor-roster.js';
import { initAnalytics, track } from '../analytics.js';
import { initAccountMenu } from '../ui/account-menu.js';
import { getClient } from '../db.js';
import { el } from '../ui/dom.js';
import { attachSuburbList, getPlace, resolveSuburb } from '../suburbs.js';
import {
  BATHROOM_LABELS, PLACE_TYPE_LABELS, TEXTS, chosenRadius, searchIssues, searchParamsFor,
} from '../../core/search.js';

const WEEKS = 4;
const KIND_LABEL = { away: 'away on site', travel: 'flying home, sleeping in town', home: 'in town' };

// The example home on the coming soon page is a swing share: its host is on site whenever the
// visitor is in town, so it is free for every night they need. It is labelled "Example" and is
// not a listing (BR-TRU-006).
const EXAMPLE_AVAILABILITY = '1'.repeat(HORIZON_NIGHTS);

// BR-AVL-005: the pilot runs in WA, so "today" is Perth's date.
function todayInPerth() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth' }).format(new Date());
}

function nextMonday(iso) {
  // 1970-01-01 (day 0) was a Thursday, so Monday is day number 4 mod 7.
  return addDays(iso, mod(4 - dayNumber(iso), 7) || 7);
}

const partsFmt = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
// "Sun 15 Nov", as in the prototype, without the commas en-AU adds.
const dateFmt = {
  format(date) {
    const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
    return `${p.weekday} ${p.day} ${p.month}`;
  },
};
const dowFmt = new Intl.DateTimeFormat('en-AU', { weekday: 'narrow', timeZone: 'UTC' });
const asDate = (iso) => new Date(dayNumber(iso) * 86400000);

function readRoster(form) {
  const pattern = ROSTER_PATTERNS[Number(form.pattern.value)];
  return makeRoster({
    daysOn: pattern.daysOn,
    daysOff: pattern.daysOff,
    anchor: form.anchor.value,
    fliesHomeLastDay: form.fliesHome.checked,
    fliesOutFirstDay: form.fliesOut.checked,
  });
}

function render(form, today) {
  if (!form.anchor.value) return;
  const roster = readRoster(form);
  const cycle = cycleLength(roster);
  const perCycle = neededNights(roster, roster.anchor, cycle).length;
  document.getElementById('nights-summary').textContent = `You need ${perCycle} nights every ${cycle} days`;

  const [next] = neededBlocks(roster, today, cycle * 2);
  const nextStay = document.getElementById('next-stay');
  nextStay.textContent = next
    ? `Next stay in town: ${dateFmt.format(asDate(next[0]))} to ${dateFmt.format(asDate(addDays(next[1], 1)))}`
    : '';

  const strip = document.getElementById('strip');
  const cells = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const night = addDays(today, i);
    const kind = nightKind(roster, night);
    const cell = document.createElement('div');
    cell.className = `night ${kind}`;
    cell.setAttribute('role', 'listitem');
    cell.title = `${dateFmt.format(asDate(night))}: ${KIND_LABEL[kind]}`;
    cell.setAttribute('aria-label', cell.title);
    const dow = document.createElement('span');
    dow.className = 'dow';
    dow.textContent = dowFmt.format(asDate(night));
    const day = document.createElement('span');
    day.textContent = String(asDate(night).getUTCDate());
    cell.append(dow, day);
    cells.push(cell);
  }
  strip.replaceChildren(...cells);
  renderExample(roster, today);
}

function nightCell(night, kind, label) {
  const cell = document.createElement('div');
  cell.className = `night ${kind}`;
  cell.setAttribute('role', 'listitem');
  cell.title = `${dateFmt.format(asDate(night))}: ${label}`;
  cell.setAttribute('aria-label', cell.title);
  const dow = document.createElement('span');
  dow.className = 'dow';
  dow.textContent = dowFmt.format(asDate(night));
  const day = document.createElement('span');
  day.textContent = String(asDate(night).getUTCDate());
  cell.append(dow, day);
  return cell;
}

// BR-FIT-001, BR-FIT-002 and BR-FIT-005 with the same core/fit.js the search will use.
function renderExample(roster, today) {
  const needed = neededNights(roster, today, HORIZON_NIGHTS);
  const fit = computeFit(needed, EXAMPLE_AVAILABILITY, today);
  document.getElementById('example-fit').textContent = fitLabel(fit.fitClass, false) ?? '';
  document.getElementById('example-line').textContent = cardLine(fit, { byDates: false });
  const neededSet = new Set(needed);
  const cells = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const night = addDays(today, i);
    cells.push(neededSet.has(night) ? nightCell(night, 'free', "free, you're in town") : nightCell(night, 'off', "you're on site"));
  }
  document.getElementById('example-strip').replaceChildren(...cells);
}

function init() {
  const form = document.getElementById('roster-form');
  const today = todayInPerth();
  for (const [i, p] of ROSTER_PATTERNS.entries()) {
    form.pattern.add(new Option(`${p.label} (${p.daysOn} on, ${p.daysOff} off)`, String(i)));
  }
  form.anchor.value = nextMonday(today);
  form.anchor.min = addDays(today, -365);
  form.addEventListener('input', () => render(form, today));
  // BR-ROS-006: once the visitor changes the calculator, their roster is kept for this session,
  // so signing up can offer to save it (AC-002-4).
  form.addEventListener('input', () => writeVisitorRoster(readRoster(form)));
  form.addEventListener('submit', (e) => e.preventDefault());
  render(form, today);
}

// DEC-019: which buttons get used and whether visitors try the roster example (observability.md §6).
function initTracking() {
  const ctas = { 'cta-instagram': 'instagram_hero', 'cta-try': 'try_roster', 'cta-host': 'instagram_hosts', 'footer-instagram': 'instagram_footer' };
  for (const [id, cta] of Object.entries(ctas)) {
    document.getElementById(id)?.addEventListener('click', () => track('cta_clicked', { cta }));
  }
  const form = document.getElementById('roster-form');
  let used = false;
  form.addEventListener('input', () => {
    if (used) return;
    used = true;
    track('roster_example_used', { pattern: ROSTER_PATTERNS[Number(form.pattern.value)].label });
  });
}

// ---------------------------------------------------------------------------------------------
// Search and the newest homes (UC-001, DEC-018). Only with the base configured; without it the
// page stays the explainer it was.
// ---------------------------------------------------------------------------------------------

// The pilot city, by its ABS SAL code (INT-006). Only picks which homes the home page shows first.
const FEATURED_PLACE_ID = 51230; // Perth
const FEATURED_COUNT = 6;

function initSearch(today) {
  const form = document.getElementById('home-search');
  const known = attachSuburbList(form.place, document.getElementById('home-place-list'));
  form.checkIn.min = today;
  form.checkIn.max = addDays(today, 365);
  form.checkOut.min = addDays(today, 1);
  form.checkIn.addEventListener('change', () => { if (form.checkIn.value) form.checkOut.min = addDays(form.checkIn.value, 1); });
  const show = (id, text) => { const box = document.getElementById(id); box.textContent = text; box.hidden = !text; };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const placeId = form.place.value ? await resolveSuburb(form.place.value, known) : null;
    const checkIn = form.checkIn.value || null;
    const checkOut = form.checkOut.value || null;
    const issues = searchIssues({ placeId, checkIn, checkOut }, today);
    form.place.setAttribute('aria-invalid', String(issues.includes('place')));
    show('home-place-error', issues.includes('place') ? TEXTS.chooseLocation : '');
    show('home-dates-error', issues.includes('checkIn') ? TEXTS.checkIn : issues.includes('checkOut') ? TEXTS.checkOut : '');
    if (issues.length) return; // UC-001 E1/E2
    location.href = `search.html?${searchParamsFor({ placeId, checkIn, checkOut })}`;
  });
  form.hidden = false;
}

function homeCard(db, item, search) {
  const noPhoto = () => el('span', { class: 'small' }, 'No photo yet');
  const photo = el('div', { class: 'result-photo' }, noPhoto());
  if (item.cover_path) {
    const img = el('img', { src: db.storage.from('listing-photos').getPublicUrl(item.cover_path).data.publicUrl, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => photo.replaceChildren(noPhoto()));
    photo.replaceChildren(img);
  }
  return el('a', { class: 'home-card', href: `listing.html?id=${encodeURIComponent(item.id)}&${search}`, 'data-id': item.id },
    photo,
    el('div', { class: 'result-body stack-tight' },
      el('h3', { class: 'result-title' }, item.title),
      el('span', { class: 'small text-2' }, `${item.suburb_name}, ${item.state}`),
      el('span', { class: 'small' }, [PLACE_TYPE_LABELS[item.place_type], BATHROOM_LABELS[item.bathroom], item.bills_included ? 'Bills included' : null].filter(Boolean).join(' · ')),
      el('span', { class: 'home-card-price' }, el('strong', {}, `$${item.weekly_price}`), el('span', { class: 'small text-2' }, ' / week'))));
}

// Newest first, like a search without dates or roster (BR-FIT-006). Hidden when there are none.
async function loadHomes(db) {
  const place = await getPlace(FEATURED_PLACE_ID);
  if (!place) return;
  const radiusKm = chosenRadius(50, place);
  const { data, error } = await db.rpc('search_listings', { p_lat: place.lat, p_lng: place.lng, p_radius_km: radiusKm });
  if (error || !data?.length) return;
  const search = searchParamsFor({ placeId: place.id, radiusKm });
  const newest = [...data].sort((a, b) => String(b.published_at).localeCompare(String(a.published_at))).slice(0, FEATURED_COUNT);
  document.getElementById('homes-all').href = `search.html?${search}`;
  document.getElementById('home-cards').replaceChildren(...newest.map((item) => homeCard(db, item, search)));
  document.getElementById('homes').hidden = false;
}

async function initProduct() {
  const db = await getClient();
  if (!db) return;
  initSearch(todayInPerth());
  await loadHomes(db);
}

init();
initTracking();
initProduct();
initAnalytics();
initAccountMenu(document.getElementById('account'));
