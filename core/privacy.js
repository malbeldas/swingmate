// "Privacy and data" in My account (UC-035, issue #34): texts from the prototype, the 5-minute
// sign-in that both actions need (roles-permissions.md §4) and the name of the downloaded file.

export const REAUTH_MINUTES = 5;

export const PRIVACY_TEXTS = {
  title: 'Privacy and data',
  intro: 'We never show your email, phone, employer or site to other people.',
  download: 'Download my data',
  downloadHint: 'A JSON file with your profile, roster, listings, saved homes, alerts and the messages you sent.',
  downloadFailed: 'The download didn’t work. Try again.', // UC-035 E1
  delete: 'Delete my account',
  deleteHint: 'Your profile, saved homes and alerts are removed. Hosts keep the messages you already sent, shown as “Deleted user”.',
  deleteHostHint: 'Your listings are taken down for good.',
  understand: 'I understand this can’t be undone',
  deleteButton: 'Delete account',
  deleteFailed: 'Your account wasn’t deleted. Try again.',
  deleted: 'Your account was deleted.',
  reauth: 'To keep your account safe, confirm it’s you first.',
  password: 'Password',
  confirm: 'Confirm',
  google: 'Continue with Google',
  wrongPassword: 'That password doesn’t match. Try again.',
};

// True when the last sign-in was in the last REAUTH_MINUTES.
export function signedInRecently(lastSignInAt, now = new Date()) {
  if (!lastSignInAt) return false;
  const at = new Date(lastSignInAt).getTime();
  return Number.isFinite(at) && now.getTime() - at <= REAUTH_MINUTES * 60 * 1000 && at <= now.getTime() + 60 * 1000;
}

// swingmate-my-data-2026-11-04.json: the date only, no name or email (engineering-constitution.md §10).
export function exportFileName(today) {
  return `swingmate-my-data-${today}.json`;
}

// How the person proves it is them again: their password, or Google for a Google account.
export function reauthMethod(user) {
  const providers = user?.app_metadata?.providers ?? [user?.app_metadata?.provider].filter(Boolean);
  return providers.includes('email') ? 'password' : 'google';
}
