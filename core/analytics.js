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
  'signup_started.method': ['google', 'email'],
  'signup_completed.method': ['google', 'email'],
  'calendar_confirmed.source': ['email', 'web'],
  '*.role': ['seeker', 'host'],
  '*.fit_class': ['full', 'strong', 'partial', 'poor'],
  '*.availability_type': ['roster', 'from_date', 'ranges'],
  'email_clicked.ntf': ['NTF-003', 'NTF-004', 'NTF-005', 'NTF-006', 'NTF-007'],
};

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
    const values = allowedValues(name, key);
    if (values && !values.includes(value)) errors.push(`${key} must be one of ${values.join(', ')}`);
    if (typeof value === 'string' && (EMAIL.test(value) || PHONE.test(value))) errors.push(`${key} looks like personal data`);
    if (value !== null && typeof value === 'object') errors.push(`${key} must be a plain value`);
  }
  if (new TextEncoder().encode(JSON.stringify(props)).length > MAX_PROPS_BYTES) errors.push('props over 2 KB');
  return errors;
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
