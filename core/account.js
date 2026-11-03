// Sign-up and log-in rules that don't need the network (UC-030, BR-ACC-001, BR-ACC-002, BR-TRU-007).
import { isDisposableEmail } from './text-checks.js';

export const PASSWORD_MIN = 8; // BR-ACC-002
export const CODE_LENGTH = 6; // BR-ACC-002, NTF-001

export const TEXTS = {
  emailInvalid: 'Enter a valid email address',
  emailDisposable: 'Please use a permanent email address.',
  passwordShort: `At least ${PASSWORD_MIN} characters`,
  codeInvalid: 'That code is wrong or has expired. Check it or send a new one.',
  credentials: 'Email or password is wrong.',
  rateLimited: 'Wait a minute before asking for another code.',
  notConfirmed: 'Confirm your email first. We can send you a new code.',
  googleDown: "Google sign-in isn't working right now. Use your email instead.",
  termsRequired: 'Accept the Terms of Use and Privacy Policy to continue',
  resetExpired: 'That reset link has expired or was already used. Ask for a new one below.',
  samePassword: 'Choose a password different from your current one.',
  generic: 'Something went wrong. Try again.',
};

// BR-ACC-001: one account; the intent switches on seeking, hosting or both.
export const INTENTS = [
  { value: 'seeking', label: 'Find a place' },
  { value: 'hosting', label: 'List a place' },
  { value: 'both', label: 'Both' },
];

export function intentFlags(intent) {
  return {
    isSeeking: intent === 'seeking' || intent === 'both',
    isHosting: intent === 'hosting' || intent === 'both',
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(email) {
  return EMAIL_RE.test(String(email ?? '').trim());
}

// UC-030 E1 and E3: checked before sending; the database checks the email again (sign-up hook).
export function signupIssues({ email, password }) {
  const out = [];
  const clean = String(email ?? '').trim();
  if (!isEmail(clean)) out.push('emailInvalid');
  else if (isDisposableEmail(clean)) out.push('emailDisposable');
  if (String(password ?? '').length < PASSWORD_MIN) out.push('passwordShort');
  return out;
}

export function passwordHint(password) {
  const n = String(password ?? '').length;
  return n > 0 && n < PASSWORD_MIN ? `${TEXTS.passwordShort} (${n} so far)` : TEXTS.passwordShort;
}

// Keeps digits only, up to the code length, for the code field.
export function cleanCode(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, CODE_LENGTH);
}

// Supabase Auth errors to words a person understands. Unknown errors get the generic text.
export function authErrorText(error) {
  if (!error) return '';
  const code = String(error.code ?? '');
  const message = String(error.message ?? '');
  if (message === TEXTS.emailDisposable) return TEXTS.emailDisposable;
  if (code === 'otp_expired' || code === 'otp_disabled' || /token has expired|invalid/i.test(message) && /otp|token/i.test(message)) {
    return TEXTS.codeInvalid;
  }
  if (code === 'invalid_credentials') return TEXTS.credentials;
  if (code === 'email_not_confirmed') return TEXTS.notConfirmed;
  if (code.startsWith('over_') || error.status === 429) return TEXTS.rateLimited;
  if (code === 'weak_password') return TEXTS.passwordShort;
  if (code === 'same_password') return TEXTS.samePassword;
  if (code === 'email_address_invalid') return TEXTS.emailInvalid;
  return TEXTS.generic;
}

// UC-031 E1 and AC-031-1: the same words whether or not the email has an account.
export function resetSentText(email) {
  return `If there's an account for ${String(email ?? '').trim()}, a reset link is on its way. It works for 1 hour. Check your spam folder too.`;
}

// NTF-002: the reset email links to the site with `?token_hash=…&type=recovery`. The page reads it,
// spends it once and removes it from the address bar. Returns null for any other URL.
export function readRecoveryLink(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  const tokenHash = url.searchParams.get('token_hash');
  if (url.searchParams.get('type') !== 'recovery' || !tokenHash) return null;
  url.searchParams.delete('token_hash');
  url.searchParams.delete('type');
  return { tokenHash, cleanUrl: url.pathname + url.search + url.hash };
}

// "Notifications" in My account (BR-MAIL-001, BR-MAIL-005, UC-050 A1). The other switches
// (alerts, reminders) join when their emails exist.
export const NOTIFY_TEXTS = {
  title: 'Notifications',
  newMessages: 'Email me when I get a new message',
  newMessagesHint: 'We always email you about a new enquiry, even with this off.',
  saved: 'Saved.',
  failed: 'We couldn’t save that. Try again.',
};
