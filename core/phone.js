// Mobile verification rules that don't need the network (UC-021, BR-LST-003, BR-TRU-004, SEC-09,
// NTF-008). Supabase Auth sends and checks the code; this file decides what may be sent and what the
// person reads.
import { cleanCode } from './account.js';

export { cleanCode };
export const CODE_LENGTH = 6; // NTF-008
export const RESEND_SECONDS = 60; // UC-021 A1, SEC-09
export const DAILY_CODES = 5; // SEC-09, T-07: per number, in 24 hours, whatever the account
export const WRONG_CODES = 5; // AC-021-2
export const LOCK_MINUTES = 60; // AC-021-2, UC-021 E3

export const PHONE_TEXTS = {
  listTitle: 'Verify your mobile to publish',
  sheetTitle: 'Verify your phone',
  sheetBody: (host) => `${host} only takes messages from people with a verified phone. We never show your number to anyone.`,
  accountBody: 'Some hosts only take messages from people with a verified phone. We never show your number to anyone.',
  mobileLabel: 'Mobile number',
  mobilePlaceholder: '04xx xxx xxx',
  codeLabel: 'Code we texted you',
  codePlaceholder: '6 digits',
  send: 'Send code',
  sendAgain: 'Send again',
  sendAgainIn: (seconds) => `Send again in ${seconds} s`,
  sending: 'Sending…',
  verify: 'Verify',
  verifyAndSend: 'Verify and send',
  checking: 'Checking…',
  sent: (number) => `We texted a code to ${number}. It expires in 10 minutes.`,
  verified: '✓ Mobile verified',
  verifyButton: 'Verify my phone',
  // Errors (UC-021 E1 to E4, SEC-09, INT-003).
  notAustralian: 'Only Australian mobile numbers work here, like 0412 345 678.',
  inUse: 'This number is already in use',
  daily: 'This number has had 5 codes today. Try again tomorrow.',
  locked: 'Too many wrong codes. Try again in an hour.',
  tooSoon: 'Wait a minute before asking for another code.',
  codeShort: 'Enter the 6-digit code.',
  wrongCode: 'That code is wrong or has expired. Check it or send a new one.',
  sendFailed: 'We couldn’t send the code. Try again in a few minutes.',
  generic: 'Something went wrong. Try again.',
};

// UC-021 E1 and NTF-008 AC-2: an Australian mobile in any usual spelling ("0412 345 678",
// "+61 412 345 678", "61412345678", "0061 412…") becomes "+61412345678"; anything else is null, and
// nothing is sent.
export function auMobile(input) {
  const raw = String(input ?? '').trim();
  if (!raw || /[^\d\s+().-]/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  const plus = raw.lastIndexOf('+');
  if (plus > 0) return null;
  if (plus === 0) return /^614\d{8}$/.test(digits) ? `+${digits}` : null;
  if (/^04\d{8}$/.test(digits)) return `+61${digits.slice(1)}`;
  if (/^4\d{8}$/.test(digits)) return `+61${digits}`;
  if (/^614\d{8}$/.test(digits)) return `+${digits}`;
  if (/^00614\d{8}$/.test(digits)) return `+${digits.slice(2)}`;
  return null;
}

// The number as the person reads it back to themselves: "0412 345 678". Never shown to anyone else
// (BR-TRU-003).
export function formatAuMobile(e164) {
  const m = /^\+614(\d{2})(\d{3})(\d{3})$/.exec(String(e164 ?? ''));
  return m ? `04${m[1]} ${m[2]} ${m[3]}` : '';
}

// UC-021 A1: whole seconds until "Send again" works, 0 when it already does.
export function resendIn(sentAt, now = new Date()) {
  if (!sentAt) return 0;
  const left = RESEND_SECONDS - Math.floor((new Date(now) - new Date(sentAt)) / 1000);
  return Math.max(0, Math.min(RESEND_SECONDS, left));
}

// phone_code_check and phone_code_wrong answer { ok, reason }; the reason is a key of PHONE_TEXTS.
export function checkText(result) {
  if (!result || result.ok) return '';
  return PHONE_TEXTS[result.reason] ?? PHONE_TEXTS.generic;
}

// Supabase Auth errors from updateUser({ phone }) and verifyOtp({ type: 'phone_change' }).
// `step` is 'send' or 'verify', because the same status means different things in each.
export function phoneErrorText(error, step = 'send') {
  if (!error) return '';
  const code = String(error.code ?? '');
  const message = String(error.message ?? '');
  if (code === 'phone_exists' || /already (been )?registered|already in use/i.test(message)) return PHONE_TEXTS.inUse;
  if (code === 'over_sms_send_rate_limit' || (step === 'send' && error.status === 429)) return PHONE_TEXTS.tooSoon;
  if (code === 'validation_failed' && /phone/i.test(message)) return PHONE_TEXTS.notAustralian;
  if (step === 'verify') {
    if (code === 'otp_expired' || /token has expired|invalid/i.test(message)) return PHONE_TEXTS.wrongCode;
    if (error.status === 429 || code.startsWith('over_')) return PHONE_TEXTS.locked;
    return PHONE_TEXTS.generic;
  }
  // A send refused by the provider, or by the daily limit in the database, reads the same: try later.
  return PHONE_TEXTS.sendFailed;
}

// Whether a verify error was a wrong or expired code, which counts toward AC-021-2.
export function isWrongCode(error) {
  if (!error) return false;
  return String(error.code ?? '') === 'otp_expired' || /token has expired|invalid/i.test(String(error.message ?? ''));
}
