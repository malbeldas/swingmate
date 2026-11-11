// The closed catalog of analytics events and the guard every event passes before it is stored
// (BR-ANL-001, BR-ANL-002, SEC-13, observability.md §2). The database CHECK uses the same names.
// A new event goes into observability.md §2 first; tests/unit/analytics.test.js fails until this
// catalog matches that table.

export const MAX_PROPS_BYTES = 2048; // SEC-13
export const CLIENT_ERROR_MAX = 200; // observability.md §2

const ids = ['listing_id'];
const conv = ['conversation_id'];

// name -> allowed property names. Enumerated values live in ENUMS.
export const EVENTS = {
  landing_viewed: ['page', 'src'],
  search_performed: ['has_dates', 'has_roster', 'radius_km', 'n_full', 'n_strong', 'n_partial', 'n_poor', 'state'],
  near_matches_opened: ['n_partial'],
  listing_viewed: [...ids, 'fit_class'],
  fit_reasons_opened: [...ids, 'fit_class'],
  listing_saved: [...ids],
  alert_created: ['has_dates', 'has_roster'],
  roster_completed: ['pattern', 'fly_home_last_day', 'fly_out_first_day', 'logged_in'],
  roster_updated: ['pattern'],
  message_draft_started: [...ids, 'logged_in'],
  send_message_clicked: [...ids, 'logged_in', 'dates_conflict'],
  auth_gate_opened: ['source'],
  signup_started: ['method', 'source'],
  signup_completed: ['method', 'source'],
  profile_completed: ['intent'],
  phone_verified: ['as_host'],
  conversation_started: [...conv, ...ids, 'fit_class'],
  message_sent: [...conv, 'role', 'risk_flag'],
  first_reply_received: [...conv, 'hours_to_reply'],
  conversation_opened: [...conv, 'role'],
  listing_created: [...ids],
  listing_published: [...ids, 'availability_type', 'n_photos'],
  availability_exception_added: [...ids, 'n_nights'],
  calendar_confirmed: [...ids, 'source'],
  report_created: ['target_type', 'reason'],
  user_blocked: [],
  outcome_asked: [...conv],
  outcome_answered: [...conv, 'answer', 'source'],
  email_clicked: ['ntf'],
  client_error: ['page', 'kind', 'message'],
};

// Values fixed by observability.md §2, per event and property ('*' = any event).
export const ENUMS = {
  'landing_viewed.src': ['direct', 'email', 'social', 'other'],
  'auth_gate_opened.source': ['header', 'message', 'save', 'alert', 'list_place'],
  'signup_started.source': ['header', 'message', 'save', 'alert', 'list_place'],
  'signup_completed.source': ['header', 'message', 'save', 'alert', 'list_place'],
  'signup_started.method': ['google', 'facebook', 'email'],
  'signup_completed.method': ['google', 'facebook', 'email'],
  'calendar_confirmed.source': ['email', 'web'],
  '*.role': ['seeker', 'host'],
  '*.fit_class': ['full', 'strong', 'partial', 'poor'],
  '*.availability_type': ['roster', 'from_date', 'ranges'],
  'email_clicked.ntf': ['NTF-003', 'NTF-004', 'NTF-005', 'NTF-006', 'NTF-007'],
};

// Recorded by triggers in the base, never sent by the browser (supabase/migrations/
// 20261116090000_analytics.sql, P-26): they count even when a script is blocked or a tab closes.
export const SERVER_EVENTS = [
  'signup_completed', 'phone_verified', 'conversation_started', 'message_sent', 'first_reply_received',
  'listing_created', 'listing_published', 'report_created', 'user_blocked', 'outcome_asked',
];
export const BROWSER_EVENTS = Object.keys(EVENTS).filter((name) => !SERVER_EVENTS.includes(name));

const ID_PROPS = ['listing_id', 'conversation_id'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// BR-ANL-002: no email, phone number or long free text in any value. Ids and short codes pass.
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /(\+?\d[\d\s-]{7,}\d)/;

function allowedValues(name, prop) {
  return ENUMS[`${name}.${prop}`] ?? ENUMS[`*.${prop}`] ?? null;
}

// Returns the list of problems; an empty list means the event can be stored as given.
export function checkEvent(name, props = {}) {
  const allowed = EVENTS[name];
  if (!allowed) return [`unknown event ${name}`];
  const errors = [];
  for (const [key, value] of Object.entries(props)) {
    if (!allowed.includes(key)) {
      errors.push(`property ${key} not allowed`);
      continue;
    }
    if (ID_PROPS.includes(key)) {
      // A uuid can hold a long run of digits; it is an id, not a phone number.
      if (!UUID.test(String(value))) errors.push(`${key} must be an id`);
      continue;
    }
    const values = allowedValues(name, key);
    if (values && !values.includes(value)) errors.push(`${key} must be one of ${values.join(', ')}`);
    if (typeof value === 'string' && (EMAIL.test(value) || PHONE.test(value))) errors.push(`${key} looks like personal data`);
    if (value !== null && typeof value === 'object') errors.push(`${key} must be a plain value`);
  }
  if (new TextEncoder().encode(JSON.stringify(props)).length > MAX_PROPS_BYTES) errors.push('props over 2 KB');
  return errors;
}

// landing_viewed.src: where the visit came from, as one of its four values. Only the kind of
// source is kept, never the address that sent the person.
export function landingSource(href, referrer) {
  const url = new URL(href);
  const medium = (url.searchParams.get('utm_medium') ?? '').toLowerCase();
  const source = (url.searchParams.get('utm_source') ?? '').toLowerCase();
  if (medium === 'email' || source === 'email') return 'email';
  if (['instagram', 'facebook', 'tiktok', 'social'].includes(source) || medium === 'social') return 'social';
  if (!referrer) return 'direct';
  let host = '';
  try { host = new URL(referrer).hostname; } catch { return 'other'; }
  if (/(^|\.)(instagram|facebook|fb|tiktok|linkedin|reddit|x|twitter)\.com$/.test(host) || host === 't.co') return 'social';
  return host === url.hostname ? 'direct' : 'other';
}

// client_error: the browser message, cut to 200 characters, with emails and phone numbers replaced
// and URL query strings dropped (they can carry one-tap tokens), so it never carries user data.
export function scrubErrorMessage(message) {
  return String(message ?? '')
    .replace(new RegExp(EMAIL.source, 'g'), '[email]')
    .replace(/\+?\d[\d\s-]{7,}\d/g, '[number]')
    .replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1')
    .slice(0, CLIENT_ERROR_MAX);
}

// ---------------------------------------------------------------------------------------------
// DEC-019: GA4 on the public page (observability.md §6). A separate closed list from the product
// funnel above, which stays in our own table (DEC-105).
// ---------------------------------------------------------------------------------------------

export const GA_HOSTS = ['swingmate.au', 'www.swingmate.au'];
export const GA_EVENTS = {
  cta_clicked: { cta: ['instagram_hero', 'try_roster', 'instagram_hosts', 'instagram_footer'] },
  roster_example_used: { pattern: ['14:7', '8:6', '7:7', '14:14', '21:7'] },
};
const GA_ID = /^G-[A-Z0-9]{4,20}$/;
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

// SEC-22 and DEC-019: GA4 loads only on the published site, with an ID set, and never on a page
// that has the database configured (accounts, private data, one-time links).
export function shouldLoadGa({ hostname, measurementId, hasDatabase }) {
  return GA_HOSTS.includes(hostname) && GA_ID.test(String(measurementId ?? '')) && !hasDatabase;
}

// The address GA4 receives: origin and path plus utm_* tags, nothing else (no tokens, no hash).
export function gaPageLocation(href) {
  const url = new URL(href);
  const out = new URL(url.origin + url.pathname);
  for (const key of UTM) {
    const value = url.searchParams.get(key);
    if (value) out.searchParams.set(key, value.slice(0, 100));
  }
  return out.toString();
}

export function checkGaEvent(name, props = {}) {
  const allowed = GA_EVENTS[name];
  if (!allowed) return [`unknown event ${name}`];
  const errors = [];
  for (const [key, value] of Object.entries(props)) {
    if (!allowed[key]) errors.push(`property ${key} not allowed`);
    else if (!allowed[key].includes(value)) errors.push(`${key} must be one of ${allowed[key].join(', ')}`);
  }
  for (const key of Object.keys(allowed)) if (!(key in props)) errors.push(`${key} missing`);
  return errors;
}

// ---------------------------------------------------------------------------------------------
// Weekly metrics for admins (observability.md §3). admin_metrics_weekly returns raw counts; this
// turns them into the rows of admin.html#metrics.
// ---------------------------------------------------------------------------------------------

export const METRIC_TEXTS = {
  tab: 'Metrics',
  title: 'Pilot metrics',
  intro: 'One column per week, newest first. Weeks start on Monday (UTC). No names, emails or messages are counted.',
  loadFailed: 'We couldn’t load the metrics. Try again.',
  none: '–',
  targets: 'Pilot targets are still to be agreed (decision log Q-13).',
};

// [key, label, value(row)] in the order of observability.md §3.
const pct = (part, whole) => (whole > 0 ? `${Math.round((100 * part) / whole)}%` : METRIC_TEXTS.none);
export const METRICS = [
  ['visitors', 'Visitors', (r) => String(r.visitors)],
  ['signups', 'Sign-ups', (r) => String(r.signups)],
  ['profiles', 'Profiles completed', (r) => String(r.profiles_completed)],
  ['listings', 'Active listings', (r) => String(r.active_listings)],
  ['searches', 'Searches', (r) => String(r.searches)],
  ['fit', 'Searches with a Great or Good fit', (r) => pct(r.searches_with_fit, r.searches)],
  ['send', 'Detail to Send', (r) => pct(r.send_clicks, r.listing_views)],
  ['gate', 'Sign-up started after the message gate', (r) => pct(r.signups_from_message, r.gate_opens_message)],
  ['conversations', 'Conversations', (r) => String(r.conversations)],
  ['reply', 'Replied within 48 hours', (r) => pct(r.replied_48h, r.conversations)],
  ['hours', 'Median hours to first reply', (r) => (r.median_reply_hours == null ? METRIC_TEXTS.none : String(Number(r.median_reply_hours)))],
  ['agreements', 'Agreements', (r) => String(r.agreements)],
];

function weekLabel(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `Week of ${d.getUTCDate()} ${d.toLocaleString('en-AU', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}`;
}

export function metricsRows(rows = []) {
  return rows.map((r) => ({
    week: r.week_start,
    label: weekLabel(r.week_start),
    cells: METRICS.map(([key, label, value]) => ({ key, label, value: value(r) })),
  }));
}
