// "Saved homes" in My account (UC-005, #30): newest first, each with its status when it stopped
// being live (AC-005-2, UC-005 E1), "View" and "Remove". Texts from the prototype's account screen.
import { getClient } from '../db.js';
import { el } from './dom.js';
import { SAVED_TEXTS, savedCanOpen, savedLine, savedStatusLabel } from '../../core/saved.js';

function cover(db, row) {
  if (!row.cover) return el('div', { class: 'place-cover empty', 'aria-hidden': 'true' });
  const img = el('img', { class: 'place-cover', src: db.storage.from('listing-photos').getPublicUrl(row.cover).data.publicUrl, alt: '', width: '96', height: '72' });
  img.addEventListener('error', () => img.replaceWith(el('div', { class: 'place-cover empty', 'aria-hidden': 'true' })));
  return img;
}

export function savedSection(ctx) {
  const list = el('div', { class: 'stack', id: 'saved-list' });
  const section = el('section', { class: 'card stack', id: 'saved', 'aria-labelledby': 'saved-title' },
    el('h2', { id: 'saved-title' }, SAVED_TEXTS.title),
    list);

  function savedCard(db, row) {
    const error = el('p', { class: 'form-error small', role: 'alert', hidden: true }, SAVED_TEXTS.failed);
    const label = savedStatusLabel(row.status);
    const href = `listing.html?id=${encodeURIComponent(row.id)}`;
    const card = el('article', { class: 'place-card stack-tight', 'data-saved': row.id, 'aria-labelledby': `saved-${row.id}` },
      el('div', { class: 'place-top' },
        cover(db, row),
        el('div', { class: 'stack-tight place-text' },
          el('div', { class: 'place-title-row' },
            el('h3', { id: `saved-${row.id}` }, savedCanOpen(row) ? el('a', { href }, row.title) : row.title),
            label && el('span', { class: `place-status ${row.status}` }, label)),
          savedLine(row) && el('span', { class: 'small text-2' }, savedLine(row)))),
      el('div', { class: 'place-actions' },
        savedCanOpen(row) && el('a', { class: 'btn btn-primary btn-sm', href }, SAVED_TEXTS.view),
        el('button', {
          type: 'button', class: 'btn btn-secondary btn-sm', 'data-action': 'unsave',
          onclick: async () => {
            const { error: removeError } = await db.from('saved_listings').delete().eq('user_id', ctx.user.id).eq('listing_id', row.id);
            if (removeError) { error.hidden = false; return; }
            ctx.saved = (ctx.saved ?? []).filter((r) => r.id !== row.id);
            draw();
          },
        }, SAVED_TEXTS.remove)),
      error);
    return card;
  }

  async function draw() {
    const db = await getClient();
    const rows = ctx.saved ?? [];
    list.replaceChildren(...(rows.length
      ? rows.map((row) => savedCard(db, row))
      : [el('p', { class: 'small text-2', id: 'saved-empty' }, SAVED_TEXTS.none)]));
  }
  draw();
  return section;
}

export async function loadSavedHomes() {
  const db = await getClient();
  const { data, error } = await db.rpc('my_saved_listings');
  return { rows: data ?? [], error };
}
