// Alerts (UC-006, UC-053, BR-MAIL-004, issue #31): what a search saves as an alert, how an alert
// reads in My account, and which new homes it sends. The daily job uses the same search_listings
// rows and the same withFit as the results page, so the fit is the one the person sees (AC-053-1).
import { formatDay, formatRange } from './dates.js';
import { cardLine, fitLabel, needFor } from './fit.js';
import { rosterFromRow, rosterLabel } from './roster.js';
import { searchStart, withFit } from './search.js';

export const MAX_ACTIVE_ALERTS = 5; // UC-006 E1
export const ALERT_DAYS = 90; // BR-MAIL-004

// Texts from the prototype's results and account screens (frontend-migration.md), adapted to an
// alert that needs an account (UC-006).
export const ALERT_TEXTS = {
  create: 'Create an alert',
  created: 'We’ll email you when a home fits.',
  manage: 'Manage alerts',
  limit: 'You have 5 alerts on. Pause or delete one in My account first.',
  failed: 'We couldn’t save the alert. Try again.',
  title: 'Alerts',
  intro: 'We email you once a day when a new home in these places fits your nights.',
  none: 'No alerts yet. Search a place and tap “Create an alert”.',
  pause: 'Pause',
  resume: 'Resume',
  renew: 'Renew',
  delete: 'Delete',
  paused: 'Paused',
  expired: 'Expired',
  emailsOn: (until) => `Emails on · until ${until}`,
  noRoster: 'Add your roster in My account, or this alert finds nothing.',
  notify: 'Email me about new homes that fit my roster',
  notifyHint: 'At most one email a day, with every new home.',
};

const PLACE_TYPE_WORDS = { private_room: 'private rooms', entire_place: 'entire places' };

// The alert a search saves (UC-006 step 2): place, radius, dates or the roster, and the filters.
// null when the search has no nights to fit: no dates and no roster.
export function alertFromSearch({ placeId, radiusKm, checkIn, checkOut, hasRoster, filters = {} }) {
  if (!placeId || !radiusKm) return null;
  const dated = Boolean(checkIn && checkOut);
  if (!dated && !hasRoster) return null;
  const types = filters.placeTypes ?? [];
  return {
    suburb_id: placeId,
    radius_km: radiusKm,
    stay_from: dated ? checkIn : null,
    stay_to: dated ? checkOut : null,
    use_roster: !dated,
    place_type: types.length === 1 ? types[0] : null,
    max_price: filters.maxPrice ?? null,
  };
}

// 'on', 'paused' or 'expired' (AC-006-2). An alert with dates also ends once the stay has passed.
export function alertStatus(alert, now = new Date(), today = null) {
  if (new Date(alert.expires_at).getTime() <= now.getTime()) return 'expired';
  if (alert.stay_to && today && alert.stay_to <= today) return 'expired';
  return alert.paused ? 'paused' : 'on';
}

// "Rockingham, WA · 15 km · your 14:7 roster" or "… · 12 – 19 Dec".
export function alertLabel(alert, place, roster = null) {
  const where = place ? `${place.name}, ${place.state}` : 'Your place';
  const nights = alert.use_roster
    ? (roster ? `your ${rosterLabel(roster)} roster` : 'your roster')
    : formatRange(alert.stay_from, alert.stay_to);
  return `${where} · ${alert.radius_km} km · ${nights}`;
}

// "Private rooms · up to $300 / week", or '' without filters.
export function alertFilters(alert) {
  return [
    alert.place_type ? PLACE_TYPE_WORDS[alert.place_type].replace(/^./, (c) => c.toUpperCase()) : null,
    alert.max_price ? `up to $${alert.max_price} / week` : null,
  ].filter(Boolean).join(' · ');
}

// The status line of an alert in My account.
export function alertStatusLine(status, alert) {
  if (status === 'expired') return ALERT_TEXTS.expired;
  if (status === 'paused') return ALERT_TEXTS.paused;
  return ALERT_TEXTS.emailsOn(formatDay(String(alert.expires_at).slice(0, 10)));
}

// ---------------------------------------------------------------------------------------------
// The daily run (UC-053)
// ---------------------------------------------------------------------------------------------

// The nights an alert needs today: its dates, or the person's roster as it is today.
export function alertNeed(alert, today) {
  const roster = alert.use_roster ? rosterFromRow(alert.roster) : null;
  return needFor({ checkIn: alert.stay_from, checkOut: alert.stay_to, roster }, today);
}

// The search_listings call for an alert, and where its nights string starts.
export function alertSearch(alert, today) {
  const start = searchStart({ checkIn: alert.stay_from, checkOut: alert.stay_to }, today);
  return { p_lat: alert.place.lat, p_lng: alert.place.lng, p_radius_km: alert.radius_km, p_start: start };
}

// The homes to send for one alert: published after the alert was made, not sent before, within its
// filters, and a Great or Good fit with exactly the search's calculation (BR-MAIL-004, AC-053-1).
export function newMatches(alert, rows, today) {
  const need = alertNeed(alert, today);
  if (!need.nights.length) return [];
  const { p_start: start } = alertSearch(alert, today);
  const sent = new Set(alert.delivered ?? []);
  const since = new Date(alert.created_at).getTime();
  return rows
    .filter((row) => !sent.has(row.id))
    .filter((row) => new Date(row.published_at).getTime() > since)
    .filter((row) => !alert.place_type || row.place_type === alert.place_type)
    .filter((row) => !alert.max_price || row.weekly_price <= alert.max_price)
    .map((row) => withFit(row, need, start))
    .filter((item) => item.fitClass === 'full' || item.fitClass === 'strong')
    .map((item) => ({ ...item, byDates: need.byDates }));
}

// One home of the email (notifications-alert-digest.md "Variables del template").
export function digestItem(item, { url, photoUrl = null }) {
  return {
    title: item.title,
    suburb: `${item.suburb_name}, ${item.state}`,
    price: item.weekly_price,
    fitLabel: fitLabel(item.fitClass, item.byDates),
    fitLine: cardLine(item.fit, { byDates: item.byDates }),
    url,
    photoUrl,
  };
}
