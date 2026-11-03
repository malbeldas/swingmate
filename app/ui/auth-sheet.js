// Sign up and log in sheet (UC-030, frontend-migration.md: steps and texts from the prototype).
// Steps: signup, login, verify (6-digit email code), profile (minimum profile, BR-ACC-003).
// The sheet opens over the current page and closes there, so the person stays where they were
// (AC-030-3). Google returns to the same URL (redirectTo = current page).
import { getClient } from '../db.js';
import { TERMS_VERSION, getOwnProfile, profileComplete } from '../session.js';
import { INTENTS, PASSWORD_MIN, TEXTS, authErrorText, cleanCode, intentFlags, passwordHint, signupIssues } from '../../core/account.js';
import { TEXTS as PROFILE_TEXTS, profileIssues, DISPLAY_NAME_MAX } from '../../core/trust.js';

const STEP_LABELS = { signup: 'Create account', login: 'Log in', verify: 'Verify email', profile: 'Your profile' };

let dialog;
let state;
let onDoneCallback = () => {};

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

function field(label, input, hint) {
  return el('label', { class: 'field' }, label, input, hint ? el('span', { class: 'hint' }, hint) : null);
}

function errorBox() {
  return el('p', { class: 'form-error', role: 'alert', hidden: !state.error }, state.error || '');
}

function linkButton(text, onclick) {
  return el('button', { type: 'button', class: 'link-btn', onclick }, text);
}

function googleButton(text) {
  return el(
    'button',
    { type: 'button', class: 'btn btn-secondary btn-block', 'data-provider': 'google', onclick: withGoogle },
    el('span', { class: 'g-mark', 'aria-hidden': 'true' }, 'G'),
    text,
  );
}

function go(step, patch = {}) {
  state = { ...state, ...patch, step, error: patch.error ?? '' };
  render();
}

function setBusy(busy) {
  for (const control of dialog.querySelectorAll('button, input')) control.disabled = busy;
}

// ---------------------------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------------------------

function signupStep() {
  const email = el('input', { type: 'email', name: 'email', autocomplete: 'email', required: true, value: state.email, placeholder: 'you@example.com' });
  const password = el('input', { type: 'password', name: 'password', autocomplete: 'new-password', required: true, minlength: String(PASSWORD_MIN) });
  const hint = el('span', { class: 'hint', id: 'password-hint' }, passwordHint(''));
  password.setAttribute('aria-describedby', 'password-hint');
  password.addEventListener('input', () => { hint.textContent = passwordHint(password.value); });
  const form = el(
    'form',
    { class: 'stack', novalidate: true, onsubmit: (e) => { e.preventDefault(); signUpWithEmail(email.value, password.value); } },
    el('label', { class: 'field' }, 'Email', email),
    el('label', { class: 'field' }, 'Create a password', password, hint),
    errorBox(),
    el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Continue with email'),
  );
  return [
    el('h2', { id: 'auth-title' }, 'Create your SwingMate account'),
    el('p', { class: 'muted' }, 'Hosts share their home, so both sides sign up before talking. It takes under a minute.'),
    googleButton('Continue with Google'),
    el('div', { class: 'divider', 'aria-hidden': 'true' }, 'or'),
    form,
    linkButton('Already have an account? Log in', () => go('login')),
  ];
}

function loginStep() {
  const email = el('input', { type: 'email', name: 'email', autocomplete: 'email', required: true, value: state.email });
  const password = el('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true });
  const form = el(
    'form',
    { class: 'stack', novalidate: true, onsubmit: (e) => { e.preventDefault(); logInWithEmail(email.value, password.value); } },
    el('label', { class: 'field' }, 'Email', email),
    el('label', { class: 'field' }, 'Password', password),
    errorBox(),
    el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Log in'),
  );
  return [
    el('h2', { id: 'auth-title' }, 'Welcome back'),
    googleButton('Log in with Google'),
    el('div', { class: 'divider', 'aria-hidden': 'true' }, 'or'),
    form,
    linkButton('New to SwingMate? Sign up', () => go('signup')),
  ];
}

function verifyStep() {
  const code = el('input', { name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', placeholder: '6 digits', maxlength: '6', required: true });
  code.addEventListener('input', () => { code.value = cleanCode(code.value); });
  const form = el(
    'form',
    { class: 'stack', novalidate: true, onsubmit: (e) => { e.preventDefault(); verifyCode(code.value); } },
    el('label', { class: 'field' }, 'Code', code),
    errorBox(),
    el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Verify email'),
  );
  return [
    el('h2', { id: 'auth-title' }, 'Check your email'),
    el('p', { class: 'muted' }, 'We sent a 6-digit code to ', el('strong', {}, state.email), '. It works for 1 hour.'),
    form,
    state.resent ? el('p', { class: 'notice', role: 'status' }, 'New code sent.') : null,
    el('div', { class: 'link-row' },
      linkButton('Send a new code', resendCode),
      linkButton('Use a different email', () => go('signup'))),
  ];
}

function profileStep() {
  const name = el('input', { name: 'displayName', autocomplete: 'given-name', required: true, maxlength: String(DISPLAY_NAME_MAX), placeholder: 'e.g. Alex', value: state.name });
  const suburb = el('input', { name: 'suburb', list: 'suburb-options', autocomplete: 'off', required: true, placeholder: 'e.g. Rockingham, WA', value: state.suburbLabel });
  const options = el('datalist', { id: 'suburb-options' });
  suburb.addEventListener('input', () => searchSuburbs(suburb.value, options));
  const intents = el('div', { class: 'segmented', role: 'group', 'aria-label': "I'm here to" },
    INTENTS.map((intent) => el('button', {
      type: 'button',
      'aria-pressed': String(state.intent === intent.value),
      onclick: (e) => {
        state.intent = intent.value;
        for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      },
    }, intent.label)));
  const terms = el('input', { type: 'checkbox', name: 'terms', required: true });
  const form = el(
    'form',
    { class: 'stack', novalidate: true, onsubmit: (e) => { e.preventDefault(); saveProfile(name.value, suburb.value, terms.checked); } },
    el('label', { class: 'field' }, 'Name shown to hosts', name),
    el('label', { class: 'field' }, "Where you're based (suburb)", suburb, el('span', { class: 'hint' }, 'Suburb only. Hosts never see your address.')),
    options,
    el('fieldset', { class: 'field plain' }, el('legend', {}, "I'm here to"), intents),
    el('label', { class: 'check' }, terms, 'I agree to the Terms of Use and Privacy Policy'),
    errorBox(),
    el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Finish'),
    el('p', { class: 'hint' }, 'Photo, bio, phone and roster are optional. Hosts see them as extra trust signals.'),
  );
  return [el('h2', { id: 'auth-title' }, 'A few details hosts need'), form];
}

const STEPS = { signup: signupStep, login: loginStep, verify: verifyStep, profile: profileStep };

function render() {
  const body = dialog.querySelector('.sheet-body');
  dialog.querySelector('.sheet-step').textContent = STEP_LABELS[state.step];
  body.replaceChildren(...STEPS[state.step]().filter(Boolean));
  const first = body.querySelector('input:not([type=checkbox]), button');
  first?.focus();
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

async function withGoogle() {
  const db = await getClient();
  // INT-001: back to this same page, so the person keeps their place (AC-030-3).
  const { error } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } });
  if (error) go(state.step, { error: TEXTS.googleDown });
}

async function signUpWithEmail(emailValue, password) {
  const email = emailValue.trim();
  const issues = signupIssues({ email, password });
  if (issues.length) return go('signup', { email, error: TEXTS[issues[0]] });
  setBusy(true);
  const db = await getClient();
  const { error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: location.href } });
  if (error) return go('signup', { email, error: authErrorText(error) });
  go('verify', { email, resent: false });
}

async function verifyCode(token) {
  if (cleanCode(token).length !== 6) return go('verify', { error: TEXTS.codeInvalid });
  setBusy(true);
  const db = await getClient();
  const { data, error } = await db.auth.verifyOtp({ email: state.email, token: cleanCode(token), type: 'signup' });
  if (error) return go('verify', { error: authErrorText(error) });
  await afterSignIn(data.user);
}

async function resendCode() {
  const db = await getClient();
  const { error } = await db.auth.resend({ type: 'signup', email: state.email });
  go('verify', { resent: !error, error: error ? authErrorText(error) : '' });
}

async function logInWithEmail(emailValue, password) {
  const email = emailValue.trim();
  if (!email || !password) return go('login', { email, error: TEXTS.credentials });
  setBusy(true);
  const db = await getClient();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error?.code === 'email_not_confirmed') {
    await db.auth.resend({ type: 'signup', email });
    return go('verify', { email, resent: true });
  }
  if (error) return go('login', { email, error: authErrorText(error) });
  await afterSignIn(data.user);
}

// BR-ACC-003: with a session, ask for whatever the minimum profile still lacks.
async function afterSignIn(user) {
  const { data: profile } = await getOwnProfile(user.id);
  if (profileComplete(profile)) return finish(user);
  go('profile', { userId: user.id, name: profile?.display_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? '' });
}

let suburbTimer;
async function searchSuburbs(query, datalist) {
  clearTimeout(suburbTimer);
  const q = query.split(',')[0].trim();
  if (q.length < 2) return;
  suburbTimer = setTimeout(async () => {
    const db = await getClient();
    const { data } = await db.from('suburbs').select('id, name, state, postcode').ilike('name', `${q.replace(/[%_]/g, '')}%`).order('name').limit(8);
    state.suburbs = new Map((data ?? []).map((s) => [`${s.name}, ${s.state}`, s.id]));
    datalist.replaceChildren(...[...state.suburbs.keys()].map((label) => el('option', { value: label })));
  }, 150);
}

async function resolveSuburb(label) {
  const clean = label.trim();
  if (state.suburbs?.has(clean)) return state.suburbs.get(clean);
  const [name, st] = clean.split(',').map((s) => s.trim());
  if (!name) return null;
  const db = await getClient();
  let query = db.from('suburbs').select('id').ilike('name', name.replace(/[%_]/g, ''));
  if (st) query = query.eq('state', st.toUpperCase());
  const { data } = await query.limit(2);
  return data?.length === 1 ? data[0].id : null;
}

async function saveProfile(name, suburbLabel, termsAccepted) {
  state.name = name;
  state.suburbLabel = suburbLabel;
  const baseSuburbId = await resolveSuburb(suburbLabel);
  const issues = profileIssues({ displayName: name, baseSuburbId });
  if (issues.length) return go('profile', { error: PROFILE_TEXTS[issues[0]] });
  if (!termsAccepted) return go('profile', { error: TEXTS.termsRequired });
  setBusy(true);
  const db = await getClient();
  const { isSeeking, isHosting } = intentFlags(state.intent);
  const values = {
    display_name: name.trim(),
    base_suburb_id: baseSuburbId,
    is_seeking: isSeeking,
    is_hosting: isHosting,
    terms_version: TERMS_VERSION,
    terms_accepted_at: new Date().toISOString(),
  };
  // Insert or update, never upsert: an upsert also rewrites `id`, which P-04 doesn't let users update.
  const { data: existing } = await getOwnProfile(state.userId);
  const { error } = existing
    ? await db.from('profiles').update(values).eq('id', state.userId)
    : await db.from('profiles').insert({ id: state.userId, ...values });
  if (error) return go('profile', { error: TEXTS.generic });
  const { data } = await db.auth.getUser();
  finish(data.user);
}

function finish(user) {
  dialog.close();
  onDoneCallback(user);
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

function build() {
  dialog = el('dialog', { class: 'sheet', 'aria-labelledby': 'auth-title', id: 'auth-sheet' },
    el('div', { class: 'sheet-head' },
      el('span', { class: 'sheet-step micro' }),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => dialog.close() }, '×')),
    el('div', { class: 'sheet-body stack' }));
  // A click on the backdrop closes the sheet.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
}

// step: 'signup' | 'login' | 'profile'. onDone runs with the signed-in user.
export async function openAuthSheet({ step = 'signup', user = null, onDone = () => {} } = {}) {
  if (!dialog) build();
  onDoneCallback = onDone;
  state = { step, email: '', error: '', resent: false, intent: 'seeking', name: '', suburbLabel: '', userId: user?.id ?? null };
  if (step === 'profile' && user) {
    state.name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? '';
  }
  render();
  if (!dialog.open) dialog.showModal();
}
