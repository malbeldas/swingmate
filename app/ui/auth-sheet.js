// Sign up and log in sheet (UC-030, frontend-migration.md: steps and texts from the prototype).
// Steps: signup, login, verify (6-digit email code), profile (minimum profile, BR-ACC-003),
// forgot and newPassword (UC-031, NTF-002), roster (offer to save the visitor roster, AC-002-4).
// The sheet opens over the current page and closes there, so the person stays where they were
// (AC-030-3). Google and Facebook return to the same URL (redirectTo = current page). Which of them
// show comes from the config (BR-ACC-002).
import { trackEvent } from '../events.js';
import { getClient } from '../db.js';
import { loadConfig } from '../config.js';
import { CaptchaBlocked, captchaToken } from '../captcha.js';
import { TERMS_VERSION, getOwnProfile, getOwnRoster, profileComplete, saveOwnRoster } from '../session.js';
import { clearVisitorRoster, readVisitorRoster } from '../visitor-roster.js';
import { rosterWithArticle } from '../../core/roster.js';
import { formatDay } from '../../core/dates.js';
import { attachSuburbList, resolveSuburb } from '../suburbs.js';
import {
  INTENTS, PASSWORD_MIN, TEXTS, authErrorText, cleanCode, intentFlags, isEmail, passwordHint, resetSentText, signupIssues,
  withCaptcha,
} from '../../core/account.js';
import { TEXTS as PROFILE_TEXTS, profileIssues, DISPLAY_NAME_MAX } from '../../core/trust.js';

const STEP_LABELS = {
  signup: 'Create account', login: 'Log in', verify: 'Verify email', profile: 'Your profile',
  forgot: 'Reset password', newPassword: 'Reset password', roster: 'Your roster',
};

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

const PROVIDERS = {
  google: { name: 'Google', mark: 'G' },
  facebook: { name: 'Facebook', mark: 'f' },
};

// One button per sign-in provider in the config, in its order. verb: 'Continue' or 'Log in'.
function providerButtons(verb) {
  return state.providers.filter((id) => PROVIDERS[id]).map((id) => el(
    'button',
    { type: 'button', class: 'btn btn-secondary btn-block', 'data-provider': id, onclick: () => withProvider(id) },
    el('span', { class: `${id === 'google' ? 'g' : 'f'}-mark`, 'aria-hidden': 'true' }, PROVIDERS[id].mark),
    `${verb} with ${PROVIDERS[id].name}`,
  ));
}

function go(step, patch = {}) {
  state = { ...state, ...patch, step, error: patch.error ?? '' };
  render();
}

function setBusy(busy) {
  for (const control of dialog.querySelectorAll('button, input')) control.disabled = busy;
}

// INT-004: a fresh Turnstile token for one auth call, as the options supabase-js takes. Returns
// null (after showing the error on `step`) when the check can't run, so the caller stops there.
async function authOptions(step, fields, options) {
  try {
    return withCaptcha(options, await captchaToken(dialog.querySelector('.sheet-body') ?? dialog));
  } catch (err) {
    if (!(err instanceof CaptchaBlocked)) throw err;
    go(step, { ...fields, error: TEXTS.captchaBlocked });
    return null;
  }
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
    ...providerButtons('Continue'),
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
    ...providerButtons('Log in'),
    el('div', { class: 'divider', 'aria-hidden': 'true' }, 'or'),
    form,
    el('div', { class: 'link-row' },
      linkButton('Forgot password?', () => go('forgot', { email: email.value.trim(), sent: false })),
      linkButton('New to SwingMate? Sign up', () => go('signup'))),
  ];
}

// UC-031: the answer is the same whether or not the email has an account (AC-031-1).
function forgotStep() {
  if (state.sent) {
    return [
      el('h2', { id: 'auth-title' }, 'Check your email'),
      el('p', { class: 'notice', role: 'status', id: 'reset-sent' }, resetSentText(state.email)),
      linkButton('Back to log in', () => go('login')),
    ];
  }
  const email = el('input', { type: 'email', name: 'email', autocomplete: 'email', required: true, value: state.email });
  const form = el(
    'form',
    { class: 'stack', novalidate: true, onsubmit: (e) => { e.preventDefault(); sendResetLink(email.value); } },
    el('label', { class: 'field' }, 'Email', email),
    errorBox(),
    el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Send reset link'),
  );
  return [
    el('h2', { id: 'auth-title' }, 'Reset your password'),
    el('p', { class: 'muted' }, "Enter the email you signed up with and we'll send you a link to choose a new password."),
    form,
    linkButton('Back to log in', () => go('login')),
  ];
}

// Reached from the NTF-002 link, already signed in with the one-time link.
function newPasswordStep() {
  const password = el('input', { type: 'password', name: 'password', autocomplete: 'new-password', required: true, minlength: String(PASSWORD_MIN) });
  const hint = el('span', { class: 'hint', id: 'password-hint' }, passwordHint(''));
  password.setAttribute('aria-describedby', 'password-hint');
  password.addEventListener('input', () => { hint.textContent = passwordHint(password.value); });
  const form = el(
    'form',
    { class: 'stack', novalidate: true, onsubmit: (e) => { e.preventDefault(); saveNewPassword(password.value); } },
    el('label', { class: 'field' }, 'New password', password, hint),
    errorBox(),
    el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Save new password'),
  );
  return [
    el('h2', { id: 'auth-title' }, 'Choose a new password'),
    el('p', { class: 'muted' }, "Once it's saved, you'll be logged out on your other devices."),
    form,
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
  state.suburbs = attachSuburbList(suburb, options);
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

// AC-002-4 and BR-ROS-006: the roster tried before signing up, ready to save in one tap.
function rosterStep() {
  const roster = state.visitorRoster;
  return [
    el('h2', { id: 'auth-title' }, 'Save your roster?'),
    el('p', {}, `You tried ${rosterWithArticle(roster)} starting ${formatDay(roster.anchor)}.`),
    el('p', { class: 'muted' }, 'Every search and listing uses this roster to show how well a home fits your weeks off.'),
    errorBox(),
    el('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: saveVisitorRoster }, 'Save roster'),
    linkButton('Not now', () => { clearVisitorRoster(); finish(state.user); }),
  ];
}

const STEPS = {
  signup: signupStep, login: loginStep, verify: verifyStep, profile: profileStep,
  forgot: forgotStep, newPassword: newPasswordStep, roster: rosterStep,
};

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

// BR-ANL-001: which button led to the sheet (auth_gate_opened.source), when it is one of the list.
function trackSignupStarted(method) {
  if (state.source) trackEvent('signup_started', { method, source: state.source });
}

async function withProvider(provider) {
  trackSignupStarted(provider);
  const db = await getClient();
  // INT-001, INT-007: back to this same page, so the person keeps their place (AC-030-3).
  const { error } = await db.auth.signInWithOAuth({ provider, options: { redirectTo: location.href } });
  if (error) go(state.step, { error: provider === 'google' ? TEXTS.googleDown : TEXTS.facebookDown });
}

async function signUpWithEmail(emailValue, password) {
  const email = emailValue.trim();
  const issues = signupIssues({ email, password });
  if (issues.length) return go('signup', { email, error: TEXTS[issues[0]] });
  trackSignupStarted('email');
  setBusy(true);
  const options = await authOptions('signup', { email }, { emailRedirectTo: location.href });
  if (!options) return;
  const db = await getClient();
  const { error } = await db.auth.signUp({ email, password, options });
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
  const options = await authOptions('verify', {}, {});
  if (!options) return;
  const db = await getClient();
  const { error } = await db.auth.resend({ type: 'signup', email: state.email, options });
  go('verify', { resent: !error, error: error ? authErrorText(error) : '' });
}

async function logInWithEmail(emailValue, password) {
  const email = emailValue.trim();
  if (!email || !password) return go('login', { email, error: TEXTS.credentials });
  setBusy(true);
  const options = await authOptions('login', { email }, {});
  if (!options) return;
  const db = await getClient();
  const { data, error } = await db.auth.signInWithPassword({ email, password, options });
  if (error?.code === 'email_not_confirmed') {
    const resendOptions = await authOptions('login', { email }, {});
    if (!resendOptions) return;
    await db.auth.resend({ type: 'signup', email, options: resendOptions });
    return go('verify', { email, resent: true });
  }
  if (error) return go('login', { email, error: authErrorText(error) });
  await afterSignIn(data.user);
}

async function sendResetLink(emailValue) {
  const email = emailValue.trim();
  if (!isEmail(email)) return go('forgot', { email, error: TEXTS.emailInvalid });
  setBusy(true);
  const options = await authOptions('forgot', { email }, {});
  if (!options) return;
  const db = await getClient();
  const { error } = await db.auth.resetPasswordForEmail(email, options);
  // AC-031-1: an answer from Supabase Auth, even a refusal such as the 1-per-minute limit (SEC-08),
  // shows the same words, so the screen never tells whether the email has an account. Only a
  // failure to reach the server shows an error.
  if (error && !(error.status >= 400 && error.status < 500)) return go('forgot', { email, error: TEXTS.generic });
  go('forgot', { email, sent: true });
}

async function saveNewPassword(password) {
  if (password.length < PASSWORD_MIN) return go('newPassword', { error: TEXTS.passwordShort });
  setBusy(true);
  const db = await getClient();
  const { data, error } = await db.auth.updateUser({ password });
  if (error) return go('newPassword', { error: authErrorText(error) });
  // UC-031 postcondition and NTF-002 AC-2: every other session ends.
  await db.auth.signOut({ scope: 'others' });
  await afterSignIn(data.user);
}

// BR-ACC-003: with a session, ask for whatever the minimum profile still lacks.
async function afterSignIn(user) {
  const { data: profile } = await getOwnProfile(user.id);
  if (profileComplete(profile)) return complete(user);
  go('profile', { userId: user.id, name: profile?.display_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? '' });
}

async function saveProfile(name, suburbLabel, termsAccepted) {
  state.name = name;
  state.suburbLabel = suburbLabel;
  const baseSuburbId = await resolveSuburb(suburbLabel, state.suburbs);
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
  trackEvent('profile_completed', { intent: state.intent });
  const { data } = await db.auth.getUser();
  await complete(data.user);
}

// With the minimum profile done, offer the visitor roster once if there is no saved roster yet.
async function complete(user) {
  const visitorRoster = readVisitorRoster();
  if (visitorRoster) {
    const { data: saved } = await getOwnRoster(user.id);
    if (!saved) return go('roster', { user, visitorRoster });
    clearVisitorRoster();
  }
  finish(user);
}

async function saveVisitorRoster() {
  setBusy(true);
  const { error } = await saveOwnRoster(state.user.id, state.visitorRoster);
  if (error) return go('roster', { error: TEXTS.generic });
  clearVisitorRoster();
  finish(state.user);
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

// step: 'signup' | 'login' | 'profile' | 'forgot' | 'newPassword'. onDone runs with the signed-in user.
// error: a message to show on the first step (an expired reset link).
// source: what opened the sign-up (observability.md §2 auth_gate_opened), when it is on the list.
export async function openAuthSheet({ step = 'signup', user = null, error = '', source = null, onDone = () => {} } = {}) {
  if (!dialog) build();
  onDoneCallback = onDone;
  const providers = (await loadConfig())?.providers ?? ['google'];
  state = {
    providers, step, email: '', error, resent: false, sent: false, intent: source === 'list_place' ? 'hosting' : 'seeking', name: '', suburbLabel: '', userId: user?.id ?? null, source,
  };
  if (step === 'signup' && source) trackEvent('auth_gate_opened', { source });
  if (step === 'profile' && user) {
    state.name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? '';
  }
  render();
  if (!dialog.open) dialog.showModal();
}
