// Header account area: "Log in" and "Sign up" without a session, the name and "Log out" with one.
// Hidden when the host has no database (the coming soon page in production).
import { getClient } from '../db.js';
import { getOwnProfile, getSessionUser, onAuthChange, profileComplete, signOut } from '../session.js';
import { openAuthSheet } from './auth-sheet.js';

function button(text, cls, onclick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.addEventListener('click', onclick);
  return b;
}

async function render(container, user) {
  if (!user) {
    container.replaceChildren(
      button('Log in', 'btn-text', () => openAuthSheet({ step: 'login', onDone: (u) => render(container, u) })),
      button('Sign up', 'btn btn-primary btn-sm', () => openAuthSheet({ step: 'signup', onDone: (u) => render(container, u) })),
    );
    return;
  }
  const { data: profile } = await getOwnProfile(user.id);
  const name = document.createElement('span');
  name.className = 'account-name';
  name.textContent = profile?.display_name ? `Hi, ${profile.display_name}` : 'Your account';
  container.replaceChildren(name, button('Log out', 'btn-text', async () => { await signOut(); render(container, null); }));
  // Back from Google (or a half-finished sign-up): finish the minimum profile here (BR-ACC-003).
  if (!profileComplete(profile)) openAuthSheet({ step: 'profile', user, onDone: (u) => render(container, u) });
}

export async function initAccountMenu(container) {
  if (!container || !(await getClient())) return;
  container.hidden = false;
  const { data: user } = await getSessionUser();
  await render(container, user);
  onAuthChange((event, u) => {
    if (event === 'SIGNED_OUT') render(container, null);
  });
}
