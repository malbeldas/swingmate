import { addDays, dayNumber, mod } from '../../core/dates.js';
import { ROSTER_PATTERNS, cycleLength, makeRoster, nightKind, neededBlocks, neededNights } from '../../core/roster.js';

const WEEKS = 4;
const KIND_LABEL = { away: 'away on site', travel: 'flying home, sleeping in town', home: 'in town' };

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
  form.addEventListener('submit', (e) => e.preventDefault());
  render(form, today);
}

init();
