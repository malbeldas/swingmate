// Verify a mobile (UC-021, NTF-008; steps and texts from the prototype, frontend-migration.md).
// Supabase Auth sends the code with updateUser({ phone }), after phone_code_check (SEC-09). The
// phone-verify Edge Function checks it: it counts each try for AC-021-2 before asking Auth, and Auth
// confirms no number the function didn't ask for.
// The number only goes to Auth; nothing here shows it to anyone else (BR-TRU-003).
// Two ways in: phoneVerifyForm, inline (list your place, step 5), and openPhoneSheet, over the page
// (the message box when the host asks for a verified phone, BR-TRU-004, and the account page).
import { getClient } from '../db.js';
import { el } from './dom.js';
import {
  CODE_LENGTH, PHONE_TEXTS, auMobile, checkText, cleanCode, formatAuMobile, phoneErrorText, resendIn,
} from '../../core/phone.js';

// onVerified(user) runs once Auth confirms the number, with the updated user.
export function phoneVerifyForm({ submitLabel = PHONE_TEXTS.verify, onVerified = () => {} } = {}) {
  let number = null;
  let sentAt = null;
  let timer = null;

  const mobile = el('input', {
    type: 'tel', name: 'mobile', id: 'phone-number', autocomplete: 'tel', inputmode: 'tel', placeholder: PHONE_TEXTS.mobilePlaceholder,
  });
  const sendBtn = el('button', { type: 'button', class: 'btn btn-secondary', id: 'send-code' }, PHONE_TEXTS.send);
  const code = el('input', {
    name: 'code', id: 'phone-code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: String(CODE_LENGTH + 4),
    placeholder: PHONE_TEXTS.codePlaceholder, class: 'code-input',
  });
  const verifyBtn = el('button', { type: 'submit', class: 'btn btn-primary', id: 'verify-code' }, submitLabel);
  const sent = el('p', { class: 'small text-2', id: 'phone-sent', role: 'status' });
  const error = el('p', { class: 'form-error', id: 'phone-error', role: 'alert', hidden: true });
  const codeRow = el('div', { class: 'stack-tight', hidden: true },
    el('label', { class: 'field', for: 'phone-code' }, PHONE_TEXTS.codeLabel),
    el('div', { class: 'inline-form' }, code, verifyBtn));

  const form = el('form', { class: 'stack-tight phone-verify', id: 'phone-verify', novalidate: true },
    el('label', { class: 'field', for: 'phone-number' }, PHONE_TEXTS.mobileLabel),
    el('div', { class: 'inline-form' }, mobile, sendBtn),
    sent,
    codeRow,
    error);

  const showError = (text) => {
    error.textContent = text;
    error.hidden = !text;
  };

  // UC-021 A1: the button counts down to "Send again" after each code.
  const tick = () => {
    const left = resendIn(sentAt);
    sendBtn.disabled = left > 0;
    sendBtn.textContent = left > 0 ? PHONE_TEXTS.sendAgainIn(left) : (sentAt ? PHONE_TEXTS.sendAgain : PHONE_TEXTS.send);
    if (left <= 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  async function sendCode() {
    showError('');
    const e164 = auMobile(mobile.value);
    if (!e164) {
      showError(PHONE_TEXTS.notAustralian);
      return mobile.focus();
    }
    sendBtn.disabled = true;
    sendBtn.textContent = PHONE_TEXTS.sending;
    const db = await getClient();
    const { data: check, error: checkError } = await db.rpc('phone_code_check', { p_phone: e164 });
    const refused = checkError ? PHONE_TEXTS.generic : checkText(check);
    if (refused) {
      showError(refused);
      return tick();
    }
    const { error: authError } = await db.auth.updateUser({ phone: e164 });
    if (authError) {
      showError(phoneErrorText(authError, 'send'));
      return tick();
    }
    number = e164;
    sentAt = new Date();
    sent.textContent = PHONE_TEXTS.sent(formatAuMobile(e164));
    codeRow.hidden = false;
    tick();
    timer = setInterval(tick, 1000);
    code.focus();
  }

  async function verify(e) {
    e.preventDefault();
    showError('');
    if (!number) return sendCode();
    const token = cleanCode(code.value);
    if (token.length !== CODE_LENGTH) {
      showError(PHONE_TEXTS.codeShort);
      return code.focus();
    }
    verifyBtn.disabled = true;
    verifyBtn.textContent = PHONE_TEXTS.checking;
    const done = () => { verifyBtn.disabled = false; verifyBtn.textContent = submitLabel; };
    const db = await getClient();
    // AC-021-2: a wrong code counts; the fifth locks verification for an hour.
    const { data, error: fnError } = await db.functions.invoke('phone-verify', { body: { phone: number, code: token } });
    let result = data;
    if (fnError) {
      try { result = await fnError.context?.json?.(); } catch { result = null; }
    }
    if (!result?.ok) {
      showError(checkText(result ?? { ok: false }));
      code.select();
      return done();
    }
    // The number is confirmed; the session picks it up on refresh.
    await db.auth.refreshSession();
    const { data: fresh } = await db.auth.getUser();
    if (timer) clearInterval(timer);
    form.replaceChildren(el('span', { class: 'badge verified', id: 'phone-verified' }, PHONE_TEXTS.verified));
    onVerified(fresh?.user ?? null);
  }

  sendBtn.addEventListener('click', sendCode);
  mobile.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!sendBtn.disabled) sendCode();
    }
  });
  form.addEventListener('submit', verify);
  return form;
}

let dialog;

function build() {
  dialog = el('dialog', { class: 'sheet', 'aria-labelledby': 'phone-title', id: 'phone-sheet' },
    el('div', { class: 'sheet-head' },
      el('span', { class: 'sheet-step micro' }, PHONE_TEXTS.mobileLabel),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => dialog.close() }, '×')),
    el('div', { class: 'sheet-body stack' }));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
}

// host: the host's display name when a listing asks for a verified phone (BR-TRU-004); without one
// the sheet is the account page's. onDone(user) runs after the number is verified and the sheet closed.
export function openPhoneSheet({ host = null, submitLabel = PHONE_TEXTS.verify, onDone = () => {} } = {}) {
  if (!dialog) build();
  const form = phoneVerifyForm({
    submitLabel,
    onVerified: (user) => {
      dialog.close();
      onDone(user);
    },
  });
  dialog.querySelector('.sheet-body').replaceChildren(
    el('h2', { id: 'phone-title' }, PHONE_TEXTS.sheetTitle),
    el('p', {}, host ? PHONE_TEXTS.sheetBody(host) : PHONE_TEXTS.accountBody),
    form);
  if (!dialog.open) dialog.showModal();
  form.querySelector('#phone-number').focus();
}
