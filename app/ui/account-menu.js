// Header account area: "Log in" and "Sign up" without a session, the name and "Log out" with one.
// Hidden when the host has no database (the coming soon page in production).
import { getClient } from '../db.js';
import { getOwnProfile, getSessionUser, onAuthChange, profileComplete, signOut } from '../session.js';
import { openAuthSheet } from './auth-sheet.js';
import { TEXTS, readRecoveryLink } from '../../core/account.js';
import { isAdmin } from '../../core/moderation.js';

function button(text, cls, onclick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.addEventListener('click', onclick);
  return b;
}

async function render(container, user, { askProfile = true } = {}) {
  if (!user) {
    container.replaceChildren(
      button('Log in', 'btn-text', () => openAuthSheet({ step: 'login', onDone: (u) => render(container, u) })),
      button('Sign up', 'btn btn-primary btn-sm', () => openAuthSheet({ step: 'signup', onDone: (u) => render(container, u) })),
    );
    return;
  }
  const { data: profile } = await getOwnProfile(user.id);
  // UC-032: the name opens My account.
  const name = document.createElement('a');
  name.className = 'account-name';
  name.href = new URL('../../account.html', import.meta.url).pathname;
  name.textContent = profile?.display_name ? `Hi, ${profile.display_name}` : 'Your account';
  // UC-033: the inbox, from every page.
  const inbox = document.createElement('a');
  inbox.className = 'btn-text account-messages';
  inbox.href = new URL('../../messages.html', import.meta.url).pathname;
  inbox.textContent = 'Messages';
  // UC-040: admins reach the report queue from the header too, not only from the NTF-009 email.
  const admin = isAdmin(user) ? document.createElement('a') : null;
  if (admin) {
    admin.className = 'btn-text account-admin';
    admin.href = new URL('../../admin.html', import.meta.url).pathname;
    admin.textContent = 'Reports';
  }
  container.replaceChildren(...[name, inbox, admin].filter(Boolean), button('Log out', 'btn-text', async () => { await signOut(); render(container, null); }));
  // Back from Google (or a half-finished sign-up): finish the minimum profile here (BR-ACC-003).
  if (askProfile && !profileComplete(profile)) openAuthSheet({ step: 'profile', user, onDone: (u) => render(container, u) });
}

// NTF-002 link: take the one-time token out of the address bar first, so it never stays in the
// history, then spend it and ask for the new password. A used or expired link goes back to
// "Reset your password" with a message. Returns whether the sheet was opened.
async function openRecoveryLink(db, container) {
  const link = readRecoveryLink(location.href);
  if (!link) return false;
  history.replaceState(history.state, '', link.cleanUrl);
  const { data, error } = await db.auth.verifyOtp({ token_hash: link.tokenHash, type: 'recovery' });
  const onDone = (u) => render(container, u);
  if (error) openAuthSheet({ step: 'forgot', error: TEXTS.resetExpired, onDone });
  else openAuthSheet({ step: 'newPassword', user: data.user, onDone });
  return true;
}

export async function initAccountMenu(container) {
  const db = container ? await getClient() : null;
  if (!db) return;
  container.hidden = false;
  const recovering = await openRecoveryLink(db, container);
  const { data: user } = await getSessionUser();
  // While the new-password sheet is open, the profile step waits: the sheet asks for it after saving.
  await render(container, user, { askProfile: !recovering });
  onAuthChange((event) => {
    if (event === 'SIGNED_OUT') render(container, null);
  });
}
