// The parts of the listing detail (UC-003) that the wizard's preview shows too (AC-020-8): the
// gallery, the 12-week calendar, "About the home" and the approximate area. They draw what
// core/detail.js answers and never the exact address (BR-LST-004).
import { el } from './dom.js';
import { drawAreaMap } from './map.js';
import { TEXTS } from '../../core/detail.js';

export function gallery(l, db) {
  const photos = l.photos ?? [];
  if (!photos.length) return el('div', { class: 'gallery empty' }, el('span', { class: 'small' }, 'No photos yet'));
  return el('div', { class: 'gallery', role: 'list', 'aria-label': `${photos.length} photos` },
    photos.map((p, i) => {
      const item = el('div', { class: 'gallery-item', role: 'listitem' });
      const img = el('img', {
        src: db.storage.from('listing-photos').getPublicUrl(p.path).data.publicUrl,
        alt: `Photo ${i + 1} of ${photos.length}: ${l.title}`,
        width: String(p.width), height: String(p.height), loading: i === 0 ? 'eager' : 'lazy',
      });
      img.addEventListener('error', () => item.replaceChildren(el('span', { class: 'small' }, 'Photo not available')));
      item.append(img);
      return item;
    }));
}

export function calendar(view, need) {
  return el('section', { class: 'card stack', 'aria-labelledby': 'calendar-title', id: 'calendar' },
    el('div', { class: 'results-head' },
      el('h2', { id: 'calendar-title' }, 'Availability · next 12 weeks'),
      el('span', { class: 'small text-2', id: 'calendar-updated' }, view.calendarText)),
    el('div', { class: 'weeks card-weeks', role: 'table', 'aria-label': 'Availability by week' },
      el('div', { class: 'week head', role: 'row' }, el('span', { role: 'columnheader' }),
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => el('span', { role: 'columnheader' }, d))),
      view.weeks.map((w) => el('div', { class: 'week', role: 'row' },
        el('span', { class: 'week-label', role: 'rowheader' }, w.label),
        w.cells.map((c) => el('span', {
          class: `night ${c.free ? 'free' : 'off'}${c.need ? ' need' : ''}${c.before ? ' past' : ''}`, role: 'cell', title: c.title, 'aria-label': c.title, 'data-night': c.night,
        }, c.night.slice(8).replace(/^0/, '')))))),
    el('div', { class: 'legend' },
      el('span', {}, el('span', { class: 'swatch free', 'aria-hidden': 'true' }), 'Available'),
      el('span', {}, el('span', { class: 'swatch off', 'aria-hidden': 'true' }), 'Unavailable'),
      view.fit.fitClass && el('span', {}, el('span', { class: 'swatch need', 'aria-hidden': 'true' }), need.byDates ? 'Your dates' : 'Your R&R')),
    el('span', { class: 'small text-2' }, 'Nights before today are Unavailable.'));
}

export function about(view, l) {
  return el('section', { class: 'card stack', 'aria-labelledby': 'about-title' },
    el('h2', { id: 'about-title' }, 'About the home'),
    l.description && el('p', { class: 'description' }, l.description),
    el('dl', { class: 'facts' }, view.facts.map((f) => el('div', { class: 'fact' }, el('dt', {}, f.label), el('dd', {}, f.value)))),
    view.extras.length > 0 && el('ul', { class: 'extras' }, view.extras.map((x) => el('li', { class: 'pill' }, x))),
    l.other_rules && el('p', { class: 'small' }, el('strong', {}, 'House rules: '), l.other_rules));
}

export function locationSection(l) {
  const fallback = el('p', { class: 'small', id: 'map-fallback', hidden: true }, TEXTS.mapFallback(l.suburb_name));
  const box = el('div', { class: 'area-map', id: 'area-map', role: 'img', 'aria-label': `Approximate area around ${l.suburb_name}` });
  const section = el('section', { class: 'card stack', 'aria-labelledby': 'location-title' },
    el('h2', { id: 'location-title' }, 'Location'),
    box, fallback,
    el('span', { class: 'small text-2' }, TEXTS.approximate(l.host.display_name)));
  requestAnimationFrame(() => drawAreaMap(box, { lat: l.public_lat, lng: l.public_lng }, () => { box.hidden = true; fallback.hidden = false; }));
  return section;
}
