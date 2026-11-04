// My places (UC-022, #14) in My account: the host's listings with pause, filled, reactivate, delete,
// and the calendar, where each tapped night is saved at once (AC-022-1). Texts from the prototype's
// host dashboard. A hidden listing shows its reason and nothing to press (AC-022-3).
import { getClient } from '../db.js';
import { trackEvent } from '../events.js';
import { el } from './dom.js';
import { nightPicker } from './night-picker.js';
import { todayIn } from '../../core/dates.js';
import {
  calendarUpdatedText, exceptionChange, listingFromRow, PLACE_STATUS_LABELS, placeActions, PLACES_TEXTS, placeSummary,
  publishResultText,
} from '../../core/listing.js';

const TZ = 'Australia/Perth'; // BR-AVL-005: the pilot's suburbs are in WA

async function loadPlaces() {
  const db = await getClient();
  const { data, error } = await db.rpc('my_listings');
  return { rows: data ?? [], error };
}

function cover(db, row) {
  if (!row.cover) return el('div', { class: 'place-cover empty', 'aria-hidden': 'true' });
  const img = el('img', { class: 'place-cover', src: db.storage.from('listing-photos').getPublicUrl(row.cover).data.publicUrl, alt: '', width: '96', height: '72' });
  img.addEventListener('error', () => img.replaceWith(el('div', { class: 'place-cover empty', 'aria-hidden': 'true' })));
  return img;
}

// ctx: { user, roster, listings } from the account page.
export function placesSection(ctx) {
  const list = el('div', { class: 'stack', id: 'places-list' });
  const section = el('section', { class: 'card stack', id: 'listings', 'aria-labelledby': 'places-title' },
    el('div', { class: 'results-head' },
      el('h2', { id: 'places-title' }, PLACES_TEXTS.title),
      el('a', { class: 'btn btn-primary btn-sm', href: 'list.html', id: 'list-new' }, PLACES_TEXTS.listNew)),
    list);
  const open = new Set(); // listings whose calendar is open

  const refresh = async () => {
    const { rows, error } = await loadPlaces();
    if (!error) ctx.listings = rows;
    draw();
  };

  // Keeps an open calendar as it is and only rewrites the lines that changed.
  const refreshLines = async (id) => {
    const { rows, error } = await loadPlaces();
    if (error) return;
    ctx.listings = rows;
    const row = rows.find((r) => r.id === id);
    const card = list.querySelector(`[data-listing="${id}"]`);
    if (!row || !card) return;
    card.querySelector('.place-summary').textContent = placeSummary(row);
    const updated = card.querySelector('.place-updated');
    if (updated) updated.textContent = calendarUpdatedText(row.calendar_confirmed_on, row.today);
  };

  function placeCard(db, row) {
    const actions = placeActions(row.status);
    const error = el('p', { class: 'form-error', role: 'alert', hidden: true });
    const fail = (text = PLACES_TEXTS.failed) => { error.textContent = text; error.hidden = false; };
    const calendarSlot = el('div', { class: 'place-calendar' });
    const buttons = el('div', { class: 'place-actions' });

    const setStatus = async (status) => {
      const { error: saveError } = await db.from('listings').update({ status }).eq('id', row.id);
      if (saveError) return fail();
      refresh();
    };
    const goLive = async () => {
      const { data, error: rpcError } = await db.rpc('publish_listing', { p_listing_id: row.id, p_accuracy_declared: false });
      const text = rpcError ? PLACES_TEXTS.failed : publishResultText(data);
      if (text) return fail(text);
      refresh();
    };
    const askRemove = () => {
      buttons.replaceChildren(
        el('p', { class: 'small', id: `confirm-remove-${row.id}` }, PLACES_TEXTS.confirmRemove),
        el('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: () => setStatus('removed') }, PLACES_TEXTS.confirmRemoveYes),
        el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => drawButtons() }, PLACES_TEXTS.keep));
      buttons.querySelector('.btn-secondary').focus();
    };

    const toggleCalendar = async () => {
      if (open.has(row.id)) {
        open.delete(row.id);
        calendarSlot.replaceChildren();
        return drawButtons();
      }
      open.add(row.id);
      drawButtons();
      await drawCalendar();
    };

    async function drawCalendar() {
      const { data } = await db.rpc('my_listing', { p_listing_id: row.id });
      if (!data) return fail();
      const listing = listingFromRow(data, ctx.roster);
      const picker = nightPicker({
        listing,
        id: `calendar-${row.id}`,
        today: () => todayIn(TZ),
        onToggle: async (night, after, before) => {
          const change = exceptionChange(after, night);
          const table = db.from('listing_availability_exceptions');
          const { error: saveError } = change
            ? await table.upsert({ listing_id: row.id, ...change }, { onConflict: 'listing_id,night' })
            : await table.delete().eq('listing_id', row.id).eq('night', night);
          if (saveError) {
            fail();
            return false;
          }
          error.hidden = true;
          if (after.length > before.length) trackEvent('availability_exception_added', { listing_id: row.id, n_nights: 1 });
          refreshLines(row.id);
          return true;
        },
      });
      const confirm = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: `confirm-calendar-${row.id}`, onclick: async () => {
        const { data: done, error: rpcError } = await db.rpc('confirm_calendar', { p_listing_id: row.id });
        if (rpcError || !done?.ok) return fail();
        trackEvent('calendar_confirmed', { listing_id: row.id, source: 'web' });
        refreshLines(row.id);
      } }, PLACES_TEXTS.upToDate);
      calendarSlot.replaceChildren(
        picker.box,
        el('div', { class: 'cta-row' },
          confirm,
          el('a', { class: 'btn-text', href: `list.html?id=${encodeURIComponent(row.id)}&step=4` }, 'Change the rule')));
    }

    function drawButtons() {
      const b = (key, text, onclick, cls = 'btn btn-secondary btn-sm') => actions[key] && el('button', { type: 'button', class: cls, 'data-action': key, onclick }, text);
      buttons.replaceChildren(...[
        actions.finish && el('a', { class: 'btn btn-primary btn-sm', href: `list.html?id=${encodeURIComponent(row.id)}` }, PLACES_TEXTS.finish),
        actions.edit && el('a', { class: 'btn btn-secondary btn-sm', href: `list.html?id=${encodeURIComponent(row.id)}` }, PLACES_TEXTS.edit),
        b('calendar', open.has(row.id) ? PLACES_TEXTS.closeCalendar : PLACES_TEXTS.calendar, toggleCalendar),
        b('pause', PLACES_TEXTS.pause, () => setStatus('paused')),
        b('resume', PLACES_TEXTS.resume, goLive),
        b('fill', PLACES_TEXTS.fill, () => setStatus('filled')),
        b('reactivate', PLACES_TEXTS.reactivate, goLive),
        b('remove', PLACES_TEXTS.remove, askRemove, 'btn-text place-remove'),
      ].filter(Boolean));
    }
    drawButtons();

    const where = [row.suburb_name && `${row.suburb_name}, ${row.state}`, row.weekly_price && `$${row.weekly_price} / week`].filter(Boolean).join(' · ');
    const href = row.status === 'draft' ? `list.html?id=${encodeURIComponent(row.id)}` : `listing.html?id=${encodeURIComponent(row.id)}`;
    const card = el('article', { class: 'place-card stack-tight', 'data-listing': row.id, 'aria-labelledby': `place-${row.id}` },
      el('div', { class: 'place-top' },
        cover(db, row),
        el('div', { class: 'stack-tight place-text' },
          el('div', { class: 'place-title-row' },
            el('h3', { id: `place-${row.id}` }, el('a', { href }, row.title || 'Untitled listing')),
            el('span', { class: `place-status ${row.status}` }, PLACE_STATUS_LABELS[row.status] ?? row.status)),
          where && el('span', { class: 'small text-2' }, where),
          el('span', { class: 'small place-summary' }, placeSummary(row)),
          row.status !== 'draft' && row.status !== 'hidden' && el('span', { class: 'small text-2 place-updated' }, calendarUpdatedText(row.calendar_confirmed_on, row.today)))),
      row.status === 'hidden' && el('p', { class: 'closed-note small', id: `hidden-${row.id}` }, PLACES_TEXTS.hidden(row.hidden_reason)),
      buttons,
      error,
      calendarSlot);
    if (open.has(row.id)) drawCalendar();
    return card;
  }

  async function draw() {
    const db = await getClient();
    const rows = ctx.listings ?? [];
    list.replaceChildren(...(rows.length
      ? rows.map((row) => placeCard(db, row))
      : [el('p', { class: 'small text-2', id: 'places-empty' }, PLACES_TEXTS.none)]));
  }
  draw();
  return section;
}

export { loadPlaces };
