// Nights are calendar dates as 'YYYY-MM-DD' strings. Night d is the night that starts on day d.
// All arithmetic runs on UTC day numbers so daylight saving never shifts a night.

const MS_PER_DAY = 86400000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value) {
  const m = ISO_DATE.exec(value ?? '');
  if (!m) return false;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return new Date(t).toISOString().slice(0, 10) === value;
}

export function dayNumber(iso) {
  if (!isIsoDate(iso)) throw new RangeError(`Not a date: ${iso}`);
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

export function fromDayNumber(n) {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  return fromDayNumber(dayNumber(iso) + days);
}

export function daysBetween(fromIso, toIso) {
  return dayNumber(toIso) - dayNumber(fromIso);
}

// Positive modulo: phases before the anchor still land in [0, n).
export function mod(a, n) {
  return ((a % n) + n) % n;
}

// BR-AVL-005: today's date in the listing's (or searched place's) time zone, e.g. 'Australia/Perth'.
export function todayIn(timeZone, instant = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

// Sorted nights grouped into runs of consecutive nights: [['2026-11-01', '2026-11-02'], ['2026-11-05']].
export function groupConsecutive(nights) {
  const runs = [];
  for (const night of nights) {
    const run = runs[runs.length - 1];
    if (run && daysBetween(run[run.length - 1], night) === 1) run.push(night);
    else runs.push([night]);
  }
  return runs;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '1 Nov'
export function formatDay(iso) {
  if (!isIsoDate(iso)) throw new RangeError(`Not a date: ${iso}`);
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

// '1 – 3 Nov' or '30 Oct – 2 Nov'; a single day prints once.
export function formatRange(fromIso, toIso) {
  if (fromIso === toIso) return formatDay(fromIso);
  const sameMonth = fromIso.slice(0, 7) === toIso.slice(0, 7);
  const from = sameMonth ? String(Number(fromIso.slice(8, 10))) : formatDay(fromIso);
  return `${from} – ${formatDay(toIso)}`;
}
