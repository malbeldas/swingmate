// Invisible captcha before sign-up, log-in and reset emails (INT-004, SEC-14, BR-TRU-007).
// Cloudflare Turnstile is the only external script allowed on account screens (SEC-22). It loads
// only when this host has a site key; without one (local, CI, or before Maxi and Tomás create the
// Turnstile site) every call resolves to null and Supabase is configured without captcha.
import { loadConfig } from './config.js';

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TIMEOUT_MS = 20000;

export class CaptchaBlocked extends Error {}

let scriptPromise;

function loadScript() {
  if (globalThis.turnstile?.render) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { script.remove(); scriptPromise = null; reject(new CaptchaBlocked('turnstile did not load')); };
      document.head.append(script);
    });
  }
  return scriptPromise;
}

// integrations-captcha.md: if Turnstile doesn't load, try once more before giving up.
async function loadWithRetry() {
  try {
    await loadScript();
  } catch {
    await loadScript();
  }
}

// One fresh token per auth call: Turnstile tokens are single use. Resolves to null when this host
// has no site key; throws CaptchaBlocked when the check can't run. `container` is where the widget
// may show if Turnstile needs a tap: inside the auth sheet, since a modal dialog covers the page.
export async function captchaToken(container = document.body) {
  const config = await loadConfig();
  const siteKey = config?.turnstileSiteKey;
  if (!siteKey) return null;
  await loadWithRetry();
  const holder = document.createElement('div');
  holder.className = 'captcha-holder';
  container.append(holder);
  let widget;
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new CaptchaBlocked('turnstile timed out')), TIMEOUT_MS);
      widget = globalThis.turnstile.render(holder, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        callback: (token) => { clearTimeout(timer); resolve(token); },
        'error-callback': () => { clearTimeout(timer); reject(new CaptchaBlocked('turnstile error')); },
      });
    });
  } finally {
    if (widget != null) globalThis.turnstile.remove?.(widget);
    holder.remove();
  }
}
