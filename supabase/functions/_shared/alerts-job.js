// NTF-007 job (notifications-alert-digest.md, UC-053): once a day, every new home that fits any of a
// person's alerts goes in one email to that person (AC-006-1). The database, the search and the
// sending are passed in, so node:test runs it with fakes and the alerts Edge Function wires it to
// Supabase and Resend.
import { alertLabel, digestItem, alertSearch, newMatches } from '../../../core/alerts.js';
import { rosterFromRow } from '../../../core/roster.js';
import { searchParamsFor } from '../../../core/search.js';
import { todayIn } from '../../../core/dates.js';
import { alertDigestEmail } from './emails/alert-digest.js';

export const TEMPLATE = 'NTF-007';
export const MAX_ATTEMPTS = 3; // notifications.md rule 6: three tries, one per run

// store: { pending() -> rows of pending_alerts, search(args) -> rows of search_listings,
//          photoUrl(path) -> url, log(row), failures(userId) -> failed NTF-007 since the last sent,
//          delivered(pairs [{ alert_id, listing_id }]) }
// send({ to, mail, template, settingsUrl }) -> { status, providerMessageId, error }
export async function runAlerts({ store, send, appUrl, now = new Date() }) {
  const app = String(appUrl).replace(/\/+$/, '');
  const alerts = await store.pending();
  const byUser = new Map();
  for (const alert of alerts) {
    if (!byUser.has(alert.user_id)) byUser.set(alert.user_id, []);
    byUser.get(alert.user_id).push(alert);
  }

  let sent = 0;
  let failed = 0;
  for (const [userId, own] of byUser) {
    const items = new Map(); // listing id -> item, once even if two alerts find it
    const pairs = [];
    const labels = [];
    let seeAll = null;
    for (const alert of own) {
      const today = todayIn(alert.place.timezone, now);
      const rows = await store.search(alertSearch(alert, today));
      const matches = newMatches(alert, rows ?? [], today);
      if (!matches.length) continue;
      labels.push(alertLabel(alert, alert.place, rosterFromRow(alert.roster)));
      seeAll ??= `${app}/search.html?${searchParamsFor({ placeId: alert.place.id, radiusKm: alert.radius_km, checkIn: alert.stay_from, checkOut: alert.stay_to })}`;
      for (const item of matches) {
        pairs.push({ alert_id: alert.alert_id, listing_id: item.id });
        if (!items.has(item.id)) {
          items.set(item.id, digestItem(item, {
            url: `${app}/listing.html?id=${encodeURIComponent(item.id)}&src=email&ntf=${TEMPLATE}`,
            photoUrl: item.cover_path ? await store.photoUrl(item.cover_path) : null,
          }));
        }
      }
    }
    if (!items.size) continue;

    const first = own[0];
    const manageUrl = `${app}/account.html#alerts`;
    const mail = alertDigestEmail({
      name: first.name,
      items: [...items.values()],
      alertLabel: labels.join('; '),
      manageUrl,
      seeAllUrl: seeAll,
    });
    const result = await send({ to: first.email, mail, template: TEMPLATE, settingsUrl: `${app}/account.html#notifications` });
    await store.log({
      user_id: userId, template: TEMPLATE, ref_id: first.alert_id, status: result.status,
      provider_message_id: result.providerMessageId, error: result.error,
    });
    if (result.status === 'sent') {
      sent += 1;
      await store.delivered(pairs);
    } else {
      failed += 1;
      // After the third failed run these homes are marked, so they don't block the next ones.
      if ((await store.failures(userId)) >= MAX_ATTEMPTS) await store.delivered(pairs);
    }
  }
  return { sent, failed };
}
