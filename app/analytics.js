// GA4 on the public page (DEC-019, SEC-22, observability.md §6). Off unless the page carries a
// measurement ID in <meta name="ga-measurement-id"> and runs on swingmate.au without a database.
import { loadConfig } from './config.js';
import { checkGaEvent, gaPageLocation, shouldLoadGa } from '../core/analytics.js';

let gtag = null;

export async function initAnalytics() {
  if (gtag) return true;
  const measurementId = document.querySelector('meta[name="ga-measurement-id"]')?.content ?? '';
  const hasDatabase = Boolean(await loadConfig());
  if (!shouldLoadGa({ hostname: location.hostname, measurementId, hasDatabase })) return false;

  window.dataLayer = window.dataLayer || [];
  // gtag.js reads the arguments object itself, so this must stay a plain function.
  gtag = function gtagProxy() { window.dataLayer.push(arguments); }; // eslint-disable-line prefer-rest-params
  const pageLocation = gaPageLocation(location.href);
  gtag('js', new Date());
  gtag('config', measurementId, {
    send_page_view: false,
    page_location: pageLocation,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  gtag('event', 'page_view', { page_location: pageLocation, page_title: document.title });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(script);
  document.getElementById('analytics-note')?.removeAttribute('hidden');
  return true;
}

// Events outside the closed list, or with other values, are dropped (BR-ANL-002).
export function track(name, props) {
  if (!gtag || checkGaEvent(name, props).length) return;
  gtag('event', name, props);
}
