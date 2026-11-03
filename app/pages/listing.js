// Listing detail (UC-003). Layout and texts from the prototype's detail screen (frontend-migration.md).
// get_listing returns the public listing with its nights; the fit, the reasons and the 12-week
// calendar come from one calculation in core/ (BR-FIT-005, AC-003-3).
import { getClient } from '../db.js';
import { el } from '../ui/dom.js';
import { initAccountMenu } from '../ui/account-menu.js';
import { openRosterPicker } from '../ui/roster-picker.js';
import { drawAreaMap } from '../ui/map.js';
import { deleteOwnRoster, getOwnRoster, getSessionUser, photoUrl, saveOwnRoster } from '../session.js';
import { clearVisitorRoster, readVisitorRoster, writeVisitorRoster } from '../visitor-roster.js';
import { mondayOf, todayIn } from '../../core/dates.js';
import { needFor } from '../../core/fit.js';
import { TEXTS as LISTING_TEXTS } from '../../core/listing.js';
import { readSearchParams, searchParamsFor } from '../../core/search.js';
import { TEXTS, detailView, priceLine, subtitle } from '../../core/detail.js';

const main = document.getElementById('listing-main');
const params = new URLSearchParams(location.search);
const listingId = params.get('id');
const dates = readSearchParams(params); // the stay carried from the results, if any

const state = { listing: null, roster: null, user: null };

function gone() {
  document.title = 'Home not available · SwingMate';
  main.replaceChildren(el('div', { class: 'card stack empty-state', id: 'gone' },
    el('h1', {}, LISTING_TEXTS.gone),
    el('div', { class: 'cta-row' }, el('a', { class: 'btn btn-primary btn-sm', href: 'search.html' }, TEXTS.searchAgain))));
}

function backLink(l) {
  // Back to the search it came from, or to the listing's suburb when opened from a link.
  const qs = searchParamsFor({ placeId: dates.placeId ?? l.suburb_id, radiusKm: dates.radiusKm, checkIn: dates.checkIn, checkOut: dates.checkOut });
  return el('a', { class: 'btn-text back-link', href: `search.html?${qs}` }, `‹ ${TEXTS.backToSearch}`);
}

function gallery(l, db) {
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

function fitBlock(view, need) {
  const rosterBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: editRoster }, state.roster ? 'Edit roster' : 'Add my roster');
  if (!view.fit.fitClass) {
    return el('section', { class: 'card stack-tight fit-block', 'aria-label': 'Fit' },
      el('span', {}, TEXTS.noFit), rosterBtn);
  }
  return el('section', { class: 'card stack-tight fit-block', 'aria-label': 'Fit', id: 'fit-block' },
    el('div', { class: 'row wrap-row' },
      view.fitLabel && el('span', { class: `fit-badge ${view.fit.fitClass}` }, view.fitLabel),
      el('strong', {}, need.byDates ? 'For your dates' : 'For your roster'),
      rosterBtn),
    el('ul', { class: 'reasons', id: 'fit-reasons' },
      view.reasons.map((r) => el('li', { class: `reason ${r.tone}` }, el('span', { 'aria-hidden': 'true' }, r.tone === 'good' ? '✓' : '!'), r.text))));
}

function calendar(view, need) {
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

function about(view, l) {
  return el('section', { class: 'card stack', 'aria-labelledby': 'about-title' },
    el('h2', { id: 'about-title' }, 'About the home'),
    l.description && el('p', { class: 'description' }, l.description),
    el('dl', { class: 'facts' }, view.facts.map((f) => el('div', { class: 'fact' }, el('dt', {}, f.label), el('dd', {}, f.value)))),
    view.extras.length > 0 && el('ul', { class: 'extras' }, view.extras.map((x) => el('li', { class: 'pill' }, x))),
    l.other_rules && el('p', { class: 'small' }, el('strong', {}, 'House rules: '), l.other_rules));
}

function locationSection(l) {
  const fallback = el('p', { class: 'small', id: 'map-fallback', hidden: true }, TEXTS.mapFallback(l.suburb_name));
  const box = el('div', { class: 'area-map', id: 'area-map', role: 'img', 'aria-label': `Approximate area around ${l.suburb_name}` });
  const section = el('section', { class: 'card stack', 'aria-labelledby': 'location-title' },
    el('h2', { id: 'location-title' }, 'Location'),
    box, fallback,
    el('span', { class: 'small text-2' }, TEXTS.approximate(l.host.display_name)));
  requestAnimationFrame(() => drawAreaMap(box, { lat: l.public_lat, lng: l.public_lng }, () => { box.hidden = true; fallback.hidden = false; }));
  return section;
}

async function hostBlock(view, l) {
  const url = await photoUrl(l.host.photo_path);
  const initial = (l.host.display_name ?? '?').trim().charAt(0).toUpperCase();
  return el('section', { class: 'card host-block', 'aria-label': 'Host', id: 'host-block' },
    url ? el('img', { class: 'avatar', src: url, alt: '', width: '56', height: '56' }) : el('span', { class: 'avatar', 'aria-hidden': 'true' }, initial),
    el('div', { class: 'stack-tight' },
      el('strong', {}, `Hosted by ${view.host.name}`),
      view.host.lines.map((line) => el('span', { class: line === 'Phone verified host' ? 'badge verified' : 'small text-2' }, line === 'Phone verified host' ? `✓ ${line}` : line))));
}

async function render() {
  const l = state.listing;
  const db = await getClient();
  const today = todayIn(l.timezone ?? 'Australia/Perth');
  const need = needFor({ checkIn: dates.checkIn, checkOut: dates.checkOut, roster: state.roster }, today);
  const view = detailView(l, need);
  document.title = `${l.title} · SwingMate`;

  const side = [
    calendar(view, need),
    view.editButton && el('a', { class: 'btn btn-primary btn-block', id: 'edit-listing', href: `list.html?id=${encodeURIComponent(l.id)}` }, TEXTS.editListing),
    await hostBlock(view, l),
  ];
  main.replaceChildren(...[
    backLink(l),
    view.label && el('p', { class: 'status-label', id: 'status-label', role: 'status' }, view.label),
    gallery(l, db),
    el('div', { class: 'detail-layout' },
      el('div', { class: 'stack' },
        el('div', { class: 'detail-head' },
          el('div', { class: 'stack-tight' }, el('h1', {}, l.title), el('span', { class: 'small text-2' }, subtitle(l))),
          el('div', { class: 'detail-price' }, el('strong', {}, `$${l.weekly_price}`), el('span', { class: 'small text-2' }, priceLine(l)))),
        fitBlock(view, need),
        about(view, l),
        locationSection(l)),
      el('aside', { class: 'stack' }, side)),
  ].filter(Boolean));
}

async function storeRoster(roster) {
  if (state.user) {
    const { error } = roster ? await saveOwnRoster(state.user.id, roster) : await deleteOwnRoster(state.user.id);
    if (error) return { error };
  } else if (roster) writeVisitorRoster(roster);
  else clearVisitorRoster();
  state.roster = roster;
  await render();
  return {};
}

function editRoster() {
  openRosterPicker({ roster: state.roster, today: todayIn(state.listing.timezone ?? 'Australia/Perth'), onSave: storeRoster });
}

async function init() {
  const db = await getClient();
  initAccountMenu(document.getElementById('account'));
  if (!db || !listingId) return gone();
  const { data: user } = await getSessionUser();
  state.user = user;
  state.roster = user ? (await getOwnRoster(user.id)).data : readVisitorRoster();
  // From the Monday of the check-in week, so the calendar's first row is real nights, not blanks.
  const { data, error } = await db.rpc('get_listing', { p_id: listingId, p_start: dates.checkIn ? mondayOf(dates.checkIn) : null });
  if (error) {
    // Same retry as the results (UC-001 E3).
    main.replaceChildren(el('div', { class: 'card stack empty-state' },
      el('p', {}, "We couldn't load this home. Try again."),
      el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: init }, 'Try again')));
    return;
  }
  if (!data) return gone(); // UC-003 E1
  state.listing = data;
  await render();
}

init();
