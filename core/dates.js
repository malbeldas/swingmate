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
