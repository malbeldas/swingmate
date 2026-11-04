// "Alerts" in My account (UC-006 A1, #31): each alert with its place, nights, filters and status, and
// Pause or Resume, Renew (90 more days, BR-MAIL-004) and Delete. At most 5 on (UC-006 E1).
import { getClient } from '../db.js';
import { el } from './dom.js';
import { ALERT_TEXTS as T, alertFilters, alertLabel, alertStatus, alertStatusLine } from '../../core/alerts.js';
import { todayIn } from '../../core/dates.js';

const COLUMNS = 'id, suburb_id, radius_km, stay_from, stay_to, use_roster, place_type, max_price, paused, expires_at, created_at, suburbs(name, state, timezone)';

export async function loadAlerts() {
  const db = await getClient();
  const { data, error } = await db.from('search_alerts').select(COLUMNS).order('created_at', { ascending: false });
  return { rows: data ?? [], error };
}

// ctx: { alerts, roster }
export function alertsSection(ctx) {
  const list = el('div', { class: 'stack', id: 'alerts-list' });
  const section = el('section', { class: 'card stack', id: 'alerts', 'aria-labelledby': 'alerts-title' },
    el('h2', { id: 'alerts-title' }, T.title),
    el('span', { class: 'small text-2' }, T.intro),
    list);

  const reload = async () => {
    const { rows, error } = await loadAlerts();
    if (!error) ctx.alerts = rows;
    draw();
  };

  function alertCard(db, alert) {
    const place = alert.suburbs ?? null;
    const today = todayIn(place?.timezone ?? 'Australia/Perth');
    const status = alertStatus(alert, new Date(), today);
    const error = el('p', { class: 'form-error small', role: 'alert', hidden: true });
    const fail = (reason) => { error.textContent = reason === 'limit' ? T.limit : T.failed; error.hidden = false; };
    const filters = alertFilters(alert);
    const datesPassed = Boolean(alert.stay_to && alert.stay_to <= today);

    const pause = el('button', {
      type: 'button', class: 'btn btn-secondary btn-sm', 'data-action': alert.paused ? 'resume' : 'pause',
      onclick: async () => {
        const { error: saveError } = await db.from('search_alerts').update({ paused: !alert.paused }).eq('id', alert.id);
        if (saveError) return fail(saveError.code === 'P0001' ? 'limit' : 'failed');
        return reload();
      },
    }, alert.paused ? T.resume : T.pause);
    const renew = el('button', {
      type: 'button', class: 'btn btn-secondary btn-sm', 'data-action': 'renew',
      onclick: async () => {
        const { data, error: renewError } = await db.rpc('renew_alert', { p_alert_id: alert.id });
        if (renewError || !data?.ok) return fail(data?.reason);
        return reload();
      },
    }, T.renew);
    const remove = el('button', {
      type: 'button', class: 'btn-text place-remove', 'data-action': 'delete',
      onclick: async () => {
        const { error: deleteError } = await db.from('search_alerts').delete().eq('id', alert.id);
        if (deleteError) return fail('failed');
        return reload();
      },
    }, T.delete);

    return el('article', { class: 'place-card stack-tight', 'data-alert': alert.id, 'data-status': status },
      el('div', { class: 'place-title-row' },
        el('h3', {}, alertLabel(alert, place, ctx.roster)),
        el('span', { class: `place-status alert-${status}` }, alertStatusLine(status, alert))),
      filters && el('span', { class: 'small text-2' }, filters),
      alert.use_roster && !ctx.roster && el('span', { class: 'small text-2' }, T.noRoster),
      el('div', { class: 'place-actions' },
        status === 'expired' ? (!datesPassed && renew) : pause,
        remove),
      error);
  }

  async function draw() {
    const db = await getClient();
    const rows = ctx.alerts ?? [];
    list.replaceChildren(...(rows.length
      ? rows.map((alert) => alertCard(db, alert))
      : [el('p', { class: 'small text-2', id: 'alerts-empty' }, T.none)]));
  }
  draw();
  return section;
}
