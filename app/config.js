// infrastructure.md §1: the host picks the database. Local hosts read app/config.local.json
// (written by `npm run local:config`); any other host uses production.

// Public values of swingmate-prod (project URL and anon key are meant to be public). Empty
// until the project exists; while empty, the site works without accounts.
const PRODUCTION = { url: '', anonKey: '' };

const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

let cached;

export function loadConfig() {
  if (!cached) cached = readConfig();
  return cached;
}

async function readConfig() {
  if (!LOCAL_HOSTS.includes(location.hostname)) {
    return PRODUCTION.url && PRODUCTION.anonKey ? PRODUCTION : null;
  }
  try {
    const res = await fetch(new URL('./config.local.json', import.meta.url), { cache: 'no-store' });
    if (!res.ok) return null;
    const local = await res.json();
    return local?.url && local?.anonKey ? { url: local.url, anonKey: local.anonKey } : null;
  } catch {
    // No local Supabase running: the page still works, just without accounts.
    return null;
  }
}
