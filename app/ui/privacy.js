// "Privacy and data" in My account (UC-035, #34): download my data (AC-035-2, BR-PRV-004) and delete
// my account (AC-035-1, BR-ACC-007). Both need a sign-in in the last 5 minutes (roles-permissions.md
// §4): the database and the Edge Function check it, and this section asks the person to confirm it
// is them when they answer "reauth". Texts in core/privacy.js.
import { getClient } from '../db.js';
import { captchaToken, CaptchaBlocked } from '../captcha.js';
import { el } from './dom.js';
import { TEXTS as ACCOUNT_TEXTS, withCaptcha } from '../../core/account.js';
import { PRIVACY_TEXTS as T, exportFileName, reauthMethod } from '../../core/privacy.js';

// After "Continue with Google" the page comes back to #privacy; this says which action to reopen.
// Only the action name is kept, never personal data (engineering-constitution.md §10).
const PENDING_KEY = 'swingmate.pendingPrivacy';

function takePending() {
  try {
    const value = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return value;
  } catch { return null; }
}

function savePending(action) {
  try { sessionStorage.setItem(PENDING_KEY, action); } catch { /* the person taps again */ }
}

function saveFile(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = el('a', { href: url, download: name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ctx: { user, listings, profile, onDeleted() }
export function privacySection(ctx) {
  const downloadError = el('p', { class: 'form-error', role: 'alert', id: 'download-error', hidden: true });
  const deleteError = el('p', { class: 'form-error', role: 'alert', id: 'delete-error', hidden: true });
  const reauthBox = el('div', { class: 'stack-tight reauth', id: 'reauth', hidden: true });
  const show = (box, text) => { box.textContent = text; box.hidden = !text; };

  // UC-035 step 2: confirm it's you, then run the action that asked for it.
  function askReauth(action, run) {
    const method = reauthMethod(ctx.user);
    const error = el('p', { class: 'form-error', role: 'alert', id: 'reauth-error', hidden: true });
    if (method === 'google') {
      reauthBox.replaceChildren(
        el('span', { class: 'small' }, T.reauth),
        el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: async () => {
          savePending(action);
          const db = await getClient();
          const redirectTo = new URL('account.html#privacy', location.href).href;
          const { error: oauthError } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
          if (oauthError) show(error, ACCOUNT_TEXTS.generic);
        } }, T.google),
        error);
    } else {
      const password = el('input', { type: 'password', name: 'reauth-password', autocomplete: 'current-password', required: true });
      const confirm = el('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, T.confirm);
      reauthBox.replaceChildren(el('form', { class: 'stack-tight', novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        if (!password.value) return show(error, T.wrongPassword);
        confirm.disabled = true;
        let options;
        try {
          options = withCaptcha({}, await captchaToken(reauthBox));
        } catch (err) {
          confirm.disabled = false;
          if (err instanceof CaptchaBlocked) return show(error, ACCOUNT_TEXTS.captchaBlocked);
          throw err;
        }
        const db = await getClient();
        const { data, error: signInError } = await db.auth.signInWithPassword({ email: ctx.user.email, password: password.value, options });
        confirm.disabled = false;
        if (signInError) return show(error, signInError.code === 'invalid_credentials' ? T.wrongPassword : ACCOUNT_TEXTS.generic);
        ctx.user = data.user ?? ctx.user;
        reauthBox.hidden = true;
        reauthBox.replaceChildren();
        await run();
      } },
      el('span', { class: 'small' }, T.reauth),
      el('label', { class: 'field' }, T.password, password),
      error,
      confirm));
    }
    reauthBox.hidden = false;
    reauthBox.querySelector('input, button')?.focus();
  }

  // ----- Download my data (AC-035-2) -----------------------------------------------------------
  const downloadButton = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'download-data' }, T.download);
  async function download() {
    show(downloadError, '');
    downloadButton.disabled = true;
    const db = await getClient();
    const { data, error } = await db.rpc('export_my_data');
    downloadButton.disabled = false;
    if (error || !data) return show(downloadError, T.downloadFailed); // UC-035 E1
    if (!data.ok && data.reason === 'reauth') return askReauth('download', download);
    if (!data.ok) return show(downloadError, T.downloadFailed);
    reauthBox.hidden = true;
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD on the person's device
    saveFile(exportFileName(today), `${JSON.stringify(data.data, null, 2)}\n`);
  }
  downloadButton.addEventListener('click', download);

  // ----- Delete my account (AC-035-1) ----------------------------------------------------------
  const understand = el('input', { type: 'checkbox', id: 'delete-understand' });
  const deleteButton = el('button', { type: 'button', class: 'btn btn-danger btn-sm', id: 'delete-account', disabled: true }, T.deleteButton);
  understand.addEventListener('change', () => { deleteButton.disabled = !understand.checked; });
  const hosting = ctx.profile?.is_hosting || (ctx.listings ?? []).length > 0;
  const confirmBox = el('div', { class: 'stack-tight delete-confirm', id: 'delete-confirm', hidden: true },
    el('span', { class: 'small text-2' }, T.deleteHint),
    hosting && el('span', { class: 'small text-2', id: 'delete-host-hint' }, T.deleteHostHint),
    el('label', { class: 'check' }, understand, el('span', {}, T.understand)),
    deleteError,
    deleteButton);
  const openDelete = el('button', {
    type: 'button', class: 'btn-text place-remove open-delete', id: 'open-delete', 'aria-expanded': 'false', 'aria-controls': 'delete-confirm',
    onclick: () => {
      confirmBox.hidden = !confirmBox.hidden;
      openDelete.setAttribute('aria-expanded', String(!confirmBox.hidden));
    },
  }, T.delete);

  async function deleteAccount() {
    show(deleteError, '');
    deleteButton.disabled = true;
    const db = await getClient();
    const { data, error } = await db.functions.invoke('delete-account', { method: 'POST' });
    deleteButton.disabled = !understand.checked;
    if (error) {
      const status = error.context?.status;
      let body = null;
      try { body = await error.context?.json?.(); } catch { /* no body */ }
      if (status === 403 && body?.reason === 'reauth') return askReauth('delete', deleteAccount);
      return show(deleteError, T.deleteFailed);
    }
    if (!data?.ok) return show(deleteError, T.deleteFailed);
    await ctx.onDeleted?.();
  }
  deleteButton.addEventListener('click', deleteAccount);

  const section = el('section', { class: 'card stack', id: 'privacy', 'aria-labelledby': 'privacy-title' },
    el('h2', { id: 'privacy-title' }, T.title),
    el('span', { class: 'small text-2' }, T.intro),
    el('div', { class: 'stack-tight' },
      downloadButton,
      el('span', { class: 'small text-2' }, T.downloadHint),
      downloadError),
    reauthBox,
    el('div', { class: 'stack-tight' }, openDelete, confirmBox));

  // Back from Google with a fresh sign-in: reopen what the person was doing. They tap again, so
  // nothing is downloaded or deleted without a tap on this page.
  const pending = takePending();
  if (pending === 'delete') {
    confirmBox.hidden = false;
    openDelete.setAttribute('aria-expanded', 'true');
  }
  return section;
}

// After a deletion: the session is no longer valid, so it is only cleared on this device.
export async function signOutHere() {
  const db = await getClient();
  try { await db.auth.signOut({ scope: 'local' }); } catch { /* already gone */ }
}
