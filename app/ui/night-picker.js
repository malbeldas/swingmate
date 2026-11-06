// The 12-week night picker (BR-AVL-002, BR-AVL-004): each tap flips a night between Available and
// Unavailable as an exception to the rule. Used by step 4 of the wizard (UC-020) and by the calendar
// in My places (UC-022). onToggle(night, exceptions) gets the new list; returning false undoes it.
import { el } from './dom.js';
import { listingNights, validateAvailability } from '../../core/availability.js';
import { addDays, formatDay, mondayOf } from '../../core/dates.js';
import { toggleNight, WIZARD_TEXTS } from '../../core/listing.js';

const WEEKS = 12;

export function nightPicker({ listing, today, onToggle, id = 'night-picker' }) {
  const l = listing;
  const box = el('div', { class: 'stack-tight', id });
  const draw = () => {
    if (validateAvailability(l).length) {
      box.replaceChildren(el('span', { class: 'hint' }, 'Your next 12 weeks show here once the availability is set.'));
      return;
    }
    const now = today();
    const from = mondayOf(now);
    const nights = listingNights(l, from, WEEKS * 7, now);
    const changed = new Set((l.exceptions ?? []).map((e) => e.night));
    const weeks = [];
    for (let w = 0; w < WEEKS; w++) {
      const first = addDays(from, w * 7);
      weeks.push(el('div', { class: 'week', role: 'row' },
        el('span', { class: 'week-label', role: 'rowheader' }, formatDay(first)),
        Array.from({ length: 7 }, (_, d) => {
          const night = addDays(first, d);
          const free = nights[w * 7 + d] === '1';
          const past = night < now;
          const label = `${formatDay(night)}: ${free ? 'Available' : 'Unavailable'}${changed.has(night) ? ', changed by you' : ''}`;
          return el('span', { role: 'cell' }, el('button', {
            type: 'button', class: `night ${free ? 'free' : 'off'}${changed.has(night) ? ' changed' : ''}${past ? ' past' : ''}`,
            'aria-label': label, title: label, 'aria-pressed': String(free), disabled: past, 'data-night': night,
            onclick: async () => {
              const before = l.exceptions ?? [];
              l.exceptions = toggleNight(l, night, now);
              draw();
              box.querySelector(`[data-night="${night}"]`)?.focus();
              if ((await onToggle?.(night, l.exceptions, before)) === false) {
                l.exceptions = before;
                draw();
              }
            },
          }, night.slice(8).replace(/^0/, '')));
        })));
    }
    box.replaceChildren(
      el('div', { class: 'weeks night-picker', role: 'table', 'aria-label': 'Availability, next 12 weeks' },
        el('div', { class: 'week head', role: 'row' }, el('span', { role: 'columnheader' }),
          ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => el('span', { role: 'columnheader' }, d))),
        weeks),
      el('div', { class: 'legend' },
        el('span', {}, el('span', { class: 'swatch free', 'aria-hidden': 'true' }), 'Available'),
        el('span', {}, el('span', { class: 'swatch off', 'aria-hidden': 'true' }), 'Unavailable'),
        el('span', {}, el('span', { class: 'swatch changed', 'aria-hidden': 'true' }), 'Changed by you')),
      el('span', { class: 'hint' }, WIZARD_TEXTS.nightsHint));
  };
  draw();
  return { box, draw };
}
