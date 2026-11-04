// List your place (UC-020, #13): the 5-step wizard, its draft and Publish. Step titles and most texts
// from the prototype's host wizard (frontend-migration.md); the checks live in core/listing.js and the
// base has the final word (listings_check_publishable, publish_listing).
// The exact address and the pin only travel between this page and listing_private (BR-LST-004,
// BR-TRU-003); nothing about the listing goes to localStorage, the address bar or the events.
import { initEvents, trackEvent } from '../events.js';
import { getClient } from '../db.js';
import { el } from '../ui/dom.js';
import { initAccountMenu } from '../ui/account-menu.js';
import { openAuthSheet } from '../ui/auth-sheet.js';
import { openRosterPicker, rosterLegend } from '../ui/roster-picker.js';
import { drawPinMap } from '../ui/map.js';
import { nightPicker } from '../ui/night-picker.js';
import { about, calendar, gallery, locationSection } from '../ui/listing-detail.js';
import { getOwnProfile, getOwnRoster, getSessionUser, onAuthChange, profileComplete, saveOwnRoster } from '../session.js';
import { attachSuburbList, getPlace, resolveSuburb, suburbLabel } from '../suburbs.js';
import { addDays, todayIn } from '../../core/dates.js';
import { detailView, priceLine, subtitle } from '../../core/detail.js';
import { needFor } from '../../core/fit.js';
import {
  DESCRIPTION_MAX, exceptionsToRows, FEATURES, firstIncompleteStep, listingFromRow, listingPhotoPath, listingToRow,
  nextBlockedText, nextPhotoPosition, PARKING_OPTIONS, PERKS, PHOTO_MAX_SIDE, PHOTOS_MAX, PHOTOS_MIN, photosText,
  publishIssues, publishResultText, rangesToRows, saveIssues, SMOKING_OPTIONS, STEP_TIPS, STEP_TITLES, stepLabel,
  TITLE_MAX, TOTAL_STEPS, WIZARD_TEXTS,
} from '../../core/listing.js';
import { JPEG_QUALITY, PHOTO_INPUT_TYPES, PHOTO_TEXTS, photoIssue, scaleToFit } from '../../core/photo.js';
import { rosterDetailText, rosterSummaryText } from '../../core/roster.js';
import { BATHROOM_LABELS, PLACE_TYPE_LABELS } from '../../core/search.js';
import { CUSTOM_ITEM_MAX_LENGTH, CUSTOM_ITEMS_MAX, OTHER_RULES_MAX } from '../../core/text-checks.js';

const main = document.getElementById('list-main');
const TZ = 'Australia/Perth'; // BR-AVL-005: the listing's zone; the pilot's suburbs are all in WA

const state = {
  user: null,
  profile: null,
  listing: null, // core/listing.js shape
  step: 1,
  place: null, // the suburb's centre, for the map
  suburbText: '',
  hasAddress: false,
  addressDirty: false,
  availabilityDirty: false,
  declared: false,
  tipsClosed: new Set(),
  message: '',
  error: '',
  busy: false,
};

const today = () => todayIn(TZ);
const isDraft = () => (state.listing.status ?? 'draft') === 'draft';
const account = () => ({
  emailVerified: Boolean(state.user?.email_confirmed_at),
  phoneVerified: Boolean(state.user?.phone_confirmed_at),
  // BR-LST-003: the statement is made each time a draft goes live, not on every edit afterwards.
  accuracyDeclared: isDraft() ? state.declared : true,
});
const numberOrNull = (value) => (String(value).trim() === '' ? null : Number(value));

// ---------------------------------------------------------------------------------------------
// Small controls
// ---------------------------------------------------------------------------------------------

function choice(name, options, value, onPick) {
  return el('div', { class: 'segmented', role: 'group', 'aria-label': name },
    Object.entries(options).map(([key, label]) => el('button', {
      type: 'button',
      'aria-pressed': String(value === key),
      onclick: (e) => {
        for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        onPick(key);
      },
    }, label)));
}

function yesNo(name, value, onPick, labels = ['Yes', 'No']) {
  const key = value == null ? null : value ? 'yes' : 'no';
  return choice(name, { yes: labels[0], no: labels[1] }, key, (k) => onPick(k === 'yes'));
}

function chips(name, options, selected, onChange) {
  return el('div', { class: 'segmented', role: 'group', 'aria-label': name },
    Object.entries(options).map(([key, label]) => el('button', {
      type: 'button',
      'aria-pressed': String(selected.includes(key)),
      onclick: (e) => {
        const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
        e.currentTarget.setAttribute('aria-pressed', String(on));
        selected = on ? [...selected.filter((k) => k !== key), key] : selected.filter((k) => k !== key);
        onChange(selected);
      },
    }, label)));
}

function numberField(label, field, { hint, min = 0, max } = {}) {
  const input = el('input', { type: 'number', inputmode: 'numeric', min: String(min), max: max ? String(max) : null, step: '1', name: field, value: state.listing[field] ?? '' });
  input.addEventListener('input', () => { state.listing[field] = numberOrNull(input.value); refreshNav(); });
  return el('label', { class: 'field' }, label, input, hint && el('span', { class: 'hint' }, hint));
}

function selectField(label, field, options) {
  const select = el('select', { name: field },
    el('option', { value: '' }, 'Not saying'),
    Object.entries(options).map(([value, text]) => el('option', { value, selected: state.listing[field] === value }, text)));
  select.addEventListener('change', () => { state.listing[field] = select.value || null; refreshNav(); });
  return el('label', { class: 'field' }, label, select);
}

// BR-LST-006: "+ Add your own", shared by the home's features (step 2) and the FIFO extras (step 3).
function customItems() {
  const box = el('div', { class: 'stack-tight custom-items' });
  const draw = () => {
    const items = state.listing.customItems;
    const input = el('input', { type: 'text', name: 'customItem', maxlength: String(CUSTOM_ITEM_MAX_LENGTH), placeholder: 'e.g. Gym in the garage', 'aria-label': 'Your own item' });
    const add = () => {
      const text = input.value.trim();
      if (!text || items.length >= CUSTOM_ITEMS_MAX) return;
      state.listing.customItems = [...items, text];
      draw();
      refreshNav();
      box.querySelector('input[name=customItem]')?.focus();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    box.replaceChildren(
      items.length > 0 && el('ul', { class: 'extras', 'aria-label': 'Your own items' }, items.map((item, i) => el('li', { class: 'pill' }, item,
        el('button', { type: 'button', class: 'chip-remove', 'aria-label': `Remove ${item}`, onclick: () => {
          state.listing.customItems = items.filter((_, j) => j !== i);
          draw();
          refreshNav();
        } }, '×')))),
      items.length < CUSTOM_ITEMS_MAX
        ? el('div', { class: 'add-own' }, input, el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: add }, '+ Add your own'))
        : el('span', { class: 'hint' }, `Up to ${CUSTOM_ITEMS_MAX} of your own items`));
  };
  draw();
  return box;
}

// ---------------------------------------------------------------------------------------------
// Step 1: where it is and what it is
// ---------------------------------------------------------------------------------------------

function stepWhere() {
  const l = state.listing;
  const suburb = el('input', { name: 'suburb', list: 'list-suburb-options', autocomplete: 'off', placeholder: 'e.g. Baldivis, WA', value: state.suburbText });
  const options = el('datalist', { id: 'list-suburb-options' });
  const known = attachSuburbList(suburb, options);
  const line = el('input', { type: 'text', name: 'address', maxlength: '200', autocomplete: 'street-address', value: l.address?.line ?? '' });
  const mapBox = el('div', { class: 'pin-map', id: 'pin-map', role: 'application', 'aria-label': 'Map to mark the home' });
  const mapNote = el('span', { class: 'hint', id: 'pin-note' }, l.address?.lat != null ? 'The home is marked. Tap again to move it.' : WIZARD_TEXTS.pinHint);

  const setPoint = (point) => {
    l.address = { line: line.value, ...(l.address ?? {}), ...point };
    state.addressDirty = true;
    refreshNav();
  };
  const fallback = () => {
    mapBox.hidden = true;
    mapNote.textContent = WIZARD_TEXTS.pinFallback;
    if (state.place && l.address?.lat == null) setPoint({ lat: state.place.lat, lng: state.place.lng });
  };
  let drawing = null;
  const drawMap = () => {
    if (!state.place) return null;
    drawing ??= drawPinMap(mapBox, {
      center: { lat: state.place.lat, lng: state.place.lng },
      pin,
      onPick: (point) => { setPoint(point); mapNote.textContent = 'The home is marked. Tap again to move it.'; },
      onFail: fallback,
    });
    return drawing;
  };
  const pin = l.address?.lat != null ? { lat: l.address.lat, lng: l.address.lng } : null;

  suburb.addEventListener('change', async () => {
    const id = await resolveSuburb(suburb.value, known);
    l.suburbId = id;
    state.suburbText = suburb.value;
    state.place = id ? await getPlace(id) : null;
    if (state.place) {
      const ready = await (drawing ?? drawMap());
      if (ready) ready.recenter(state.place);
      else setPoint({ lat: state.place.lat, lng: state.place.lng }); // no map: the suburb's middle
    }
    refreshNav();
  });
  line.addEventListener('input', () => {
    l.address = { ...(l.address ?? {}), line: line.value };
    state.addressDirty = true;
    refreshNav();
  });
  requestAnimationFrame(drawMap);

  return [
    el('label', { class: 'field' }, 'Suburb', suburb), options,
    el('label', { class: 'field' }, 'Street address', line, el('span', { class: 'hint' }, WIZARD_TEXTS.addressHint)),
    el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, 'Mark the home on the map'), mapBox, mapNote),
    el('fieldset', { class: 'field plain' }, el('legend', {}, 'What are you offering?'),
      choice('What are you offering?', PLACE_TYPE_LABELS, l.placeType, (k) => { l.placeType = k; refreshNav(); })),
    el('fieldset', { class: 'field plain' }, el('legend', {}, 'Bathroom'),
      choice('Bathroom', BATHROOM_LABELS, l.bathroom, (k) => { l.bathroom = k; refreshNav(); })),
  ];
}

// ---------------------------------------------------------------------------------------------
// Step 2: price, bills and the household
// ---------------------------------------------------------------------------------------------

function stepPrice() {
  const l = state.listing;
  return [
    el('div', { class: 'grid-2 tight' },
      numberField('Rent per week (AUD)', 'weeklyPrice', { min: 1 }),
      numberField('Bond (AUD)', 'bond', { hint: '0 if there is none' })),
    el('fieldset', { class: 'field plain' }, el('legend', {}, 'Bills included in the rent'),
      yesNo('Bills included in the rent', l.billsIncluded, (v) => { l.billsIncluded = v; refreshNav(); })),
    el('fieldset', { class: 'field plain' }, el('legend', {}, 'Furnished'),
      yesNo('Furnished', l.furnished, (v) => { l.furnished = v; refreshNav(); })),
    numberField('Minimum stay in weeks (optional)', 'minStayWeeks', { min: 1, max: 52, hint: 'Leave it empty for no minimum' }),
    el('div', { class: 'grid-2 tight' },
      numberField('People living here', 'householdSize', { min: 1, max: 12 }),
      numberField('Of them, on a roster', 'householdOnRoster', { max: 12 })),
    el('fieldset', { class: 'field plain' }, el('legend', {}, 'Do you live here?'),
      yesNo('Do you live here?', l.hostLivesOnsite, (v) => { l.hostLivesOnsite = v; refreshNav(); }, ['I live here between swings', 'I live elsewhere'])),
    numberField('Minutes to the airport (optional)', 'airportMinutes', { min: 1, max: 240 }),
    selectField('Parking', 'parking', PARKING_OPTIONS),
    el('fieldset', { class: 'field plain' }, el('legend', {}, 'The home'),
      chips('The home', FEATURES, l.features, (v) => { l.features = v; refreshNav(); }),
      customItems()),
  ];
}

// ---------------------------------------------------------------------------------------------
// Step 3: photos, title, description and rules
// ---------------------------------------------------------------------------------------------

// BR-PRV-002, AC-020-2: drawing to a canvas keeps only the pixels, so EXIF and GPS never upload.
async function reencode(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = scaleToFit(bitmap.width, bitmap.height, PHOTO_MAX_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', JPEG_QUALITY));
  return { blob, width, height };
}

function photosBlock(db) {
  const box = el('div', { class: 'stack-tight', id: 'photos' });
  const error = el('p', { class: 'form-error', role: 'alert', id: 'photo-error', hidden: true });
  const showError = (text) => { error.textContent = text; error.hidden = !text; };
  const input = el('input', { type: 'file', accept: PHOTO_INPUT_TYPES.join(','), multiple: true, class: 'visually-hidden', id: 'photo-input' });

  const draw = () => {
    const photos = state.listing.photos;
    const count = photos.length;
    box.replaceChildren(
      el('ul', { class: 'photo-grid', 'aria-label': `${count} photos` }, photos.map((p, i) => el('li', { class: 'photo-thumb' },
        el('img', { src: db.storage.from('listing-photos').getPublicUrl(p.path).data.publicUrl, alt: `Photo ${i + 1}`, width: String(p.width), height: String(p.height) }),
        i === 0 && el('span', { class: 'photo-cover' }, 'Cover'),
        el('button', { type: 'button', class: 'chip-remove photo-remove', 'aria-label': `Remove photo ${i + 1}`, onclick: () => removePhoto(p) }, '×')))),
      count < PHOTOS_MAX && el('label', { class: 'btn btn-secondary btn-sm', for: 'photo-input' }, '+ Add photos'),
      input,
      el('span', { class: 'hint', id: 'photo-count' }, count < PHOTOS_MIN ? photosText(count) : `${count} photos. Add the room, the bathroom, the kitchen and the living area.`),
      error);
  };

  async function removePhoto(photo) {
    showError('');
    const { error: delError } = await db.from('listing_photos').delete().eq('id', photo.id);
    if (delError) return showError(WIZARD_TEXTS.saveFailed);
    await db.storage.from('listing-photos').remove([photo.path]);
    state.listing.photos = state.listing.photos.filter((p) => p.id !== photo.id);
    draw();
    refreshNav();
  }

  input.addEventListener('change', async () => {
    const files = [...(input.files ?? [])];
    input.value = '';
    showError('');
    for (const file of files) {
      const position = nextPhotoPosition(state.listing.photos);
      if (position < 0) break;
      const issue = photoIssue({ type: file.type, size: file.size });
      if (issue) { showError(PHOTO_TEXTS[issue]); continue; }
      let encoded;
      try { encoded = await reencode(file); } catch { showError(PHOTO_TEXTS.unreadable); continue; }
      // SEC-18: the name is a uuid, never the file's own name.
      const path = listingPhotoPath(state.listing.id, crypto.randomUUID());
      const up = await db.storage.from('listing-photos').upload(path, encoded.blob, { contentType: 'image/jpeg', upsert: false });
      if (up.error) { showError(WIZARD_TEXTS.photoFailed); continue; }
      const row = { listing_id: state.listing.id, storage_path: path, position, width: encoded.width, height: encoded.height };
      const { data, error: rowError } = await db.from('listing_photos').insert(row).select('id').single();
      if (rowError) {
        await db.storage.from('listing-photos').remove([path]);
        showError(WIZARD_TEXTS.photoFailed);
        continue;
      }
      state.listing.photos = [...state.listing.photos, { id: data.id, path, position, width: encoded.width, height: encoded.height }]
        .sort((a, b) => a.position - b.position);
      draw();
      refreshNav();
    }
  });
  draw();
  return box;
}

function stepPhotos(db) {
  const l = state.listing;
  const title = el('input', { type: 'text', name: 'title', maxlength: String(TITLE_MAX), value: l.title ?? '', placeholder: 'e.g. Quiet room near Kwinana, perfect for R&R' });
  title.addEventListener('input', () => { l.title = title.value; refreshNav(); });
  const description = el('textarea', { name: 'description', rows: '5', maxlength: String(DESCRIPTION_MAX) });
  description.value = l.description ?? '';
  description.addEventListener('input', () => { l.description = description.value; refreshNav(); });
  const rules = el('textarea', { name: 'otherRules', rows: '2', maxlength: String(OTHER_RULES_MAX), placeholder: "e.g. Quiet after 9pm, I'm up at 4am for flights" });
  rules.value = l.otherRules ?? '';
  const rulesCount = el('span', { class: 'hint', id: 'other-rules-hint' });
  const countRules = () => { rulesCount.textContent = `${rules.value.length} / ${OTHER_RULES_MAX} · ${WIZARD_TEXTS.otherRulesHint}`; };
  rules.addEventListener('input', () => { l.otherRules = rules.value; countRules(); refreshNav(); });
  countRules();
  return [
    el('fieldset', { class: 'field plain' }, el('legend', {}, 'Photos'), photosBlock(db)),
    el('label', { class: 'field' }, 'Title', title),
    el('label', { class: 'field' }, 'Describe the room and the household', description),
    el('fieldset', { class: 'field plain' }, el('legend', {}, 'House rules'),
      el('div', { class: 'grid-2 tight rules' },
        el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, 'Couples'),
          yesNo('Couples', l.couplesOk, (v) => { l.couplesOk = v; refreshNav(); }, ['OK', 'Not OK'])),
        el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, 'Pets'),
          yesNo('Pets', l.petsOk, (v) => { l.petsOk = v; refreshNav(); }, ['OK', 'Not OK']))),
      selectField('Smoking', 'smoking', SMOKING_OPTIONS)),
    el('label', { class: 'field' }, 'Other house rules (optional)', rules, rulesCount),
    el('fieldset', { class: 'field plain' }, el('legend', {}, 'Extras for FIFO workers'),
      chips('Extras for FIFO workers', PERKS, l.perks, (v) => { l.perks = v; refreshNav(); }),
      customItems()),
  ];
}

// ---------------------------------------------------------------------------------------------
// Step 4: availability (BR-AVL-003) with the 12-week preview and exceptions (BR-AVL-002)
// ---------------------------------------------------------------------------------------------

const SOURCES = { roster: 'From my roster', from_date: 'From a date', ranges: 'Set dates' };


function rangesEditor(onChange) {
  const l = state.listing;
  const box = el('div', { class: 'stack-tight', id: 'ranges' });
  const draw = () => {
    const ranges = l.ranges ?? [];
    box.replaceChildren(
      ranges.map((r, i) => {
        const from = el('input', { type: 'date', name: `range-from-${i}`, min: today(), value: r.startNight ?? '' });
        // The last night is what people pick; the base stores the day after (end_exclusive).
        const to = el('input', { type: 'date', name: `range-to-${i}`, min: r.startNight || today(), value: r.endExclusive ? addDays(r.endExclusive, -1) : '' });
        const update = () => {
          l.ranges[i] = { startNight: from.value || null, endExclusive: to.value ? addDays(to.value, 1) : null };
          to.min = from.value || today();
          onChange();
        };
        from.addEventListener('change', update);
        to.addEventListener('change', update);
        return el('div', { class: 'range-row' },
          el('label', { class: 'field' }, 'First night', from),
          el('label', { class: 'field' }, 'Last night', to),
          el('button', { type: 'button', class: 'btn-text', 'aria-label': `Remove dates ${i + 1}`, onclick: () => { l.ranges = ranges.filter((_, j) => j !== i); draw(); onChange(); } }, 'Remove'));
      }),
      el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { l.ranges = [...ranges, { startNight: null, endExclusive: null }]; draw(); } }, '+ Add dates'));
  };
  draw();
  return box;
}

function stepAvailability() {
  const l = state.listing;
  const picker = nightPicker({
    listing: l,
    today,
    onToggle: (night, after, before) => {
      if (after.length > before.length && l.id) trackEvent('availability_exception_added', { listing_id: l.id, n_nights: 1 });
      state.availabilityDirty = true;
    },
  });
  const detail = el('div', { class: 'stack-tight', id: 'availability-detail' });
  const changed = () => { state.availabilityDirty = true; picker.draw(); refreshNav(); };

  const drawDetail = () => {
    if (l.availabilityType === 'roster') {
      // UC-020 A2: without a roster, the picker opens right here (UC-002).
      const open = () => openRosterPicker({
        roster: l.roster,
        today: today(),
        onSave: async (roster) => {
          if (!roster) return { error: null };
          const { error } = await saveOwnRoster(state.user.id, roster);
          if (error) return { error };
          l.roster = roster;
          drawDetail();
          changed();
          return {};
        },
      });
      detail.replaceChildren(
        el('span', { class: 'hint' }, WIZARD_TEXTS.rosterHint),
        l.roster
          ? el('div', { class: 'stack-tight' },
            el('strong', { id: 'roster-summary' }, rosterSummaryText(l.roster, today())),
            el('span', { class: 'small text-2' }, rosterDetailText(l.roster, today())),
            el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: open }, 'Change roster'))
          : el('button', { type: 'button', class: 'btn btn-primary btn-sm', id: 'add-roster', onclick: open }, 'Add my roster'),
        l.roster && rosterLegend());
    } else if (l.availabilityType === 'from_date') {
      const date = el('input', { type: 'date', name: 'availableFrom', value: l.availableFrom ?? '' });
      date.addEventListener('change', () => { l.availableFrom = date.value || null; changed(); });
      detail.replaceChildren(el('label', { class: 'field' }, 'Free from', date), el('span', { class: 'hint' }, WIZARD_TEXTS.fromDateHint));
    } else if (l.availabilityType === 'ranges') {
      detail.replaceChildren(el('span', { class: 'hint' }, WIZARD_TEXTS.rangesHint), rangesEditor(changed));
    } else {
      detail.replaceChildren();
    }
  };
  drawDetail();
  return [
    el('fieldset', { class: 'field plain' }, el('legend', {}, 'When can someone use the room?'),
      choice('When can someone use the room?', SOURCES, l.availabilityType, (k) => { l.availabilityType = k; drawDetail(); changed(); })),
    detail,
    el('section', { class: 'stack-tight', 'aria-labelledby': 'next-weeks-title' }, el('h2', { id: 'next-weeks-title', class: 'h3' }, 'Your next 12 weeks'), picker.box),
  ];
}

// ---------------------------------------------------------------------------------------------
// Step 5: verification, the statement, the preview and Publish (BR-LST-003, AC-020-1, AC-020-8)
// ---------------------------------------------------------------------------------------------

async function previewBlock(db) {
  const box = el('section', { class: 'stack preview', id: 'preview', 'aria-labelledby': 'preview-title' },
    el('h2', { id: 'preview-title' }, 'How people who search see it'));
  if (!state.listing.id) return box;
  const { data } = await db.rpc('get_listing', { p_id: state.listing.id, p_start: null });
  if (!data) {
    box.append(el('p', { class: 'small text-2' }, 'The preview shows once the first steps are saved.'));
    return box;
  }
  // As anyone else would see it (AC-020-8): no "Edit listing", never the exact address.
  const seen = { ...data, is_owner: false, status: 'active' };
  const need = needFor({}, data.today);
  const view = detailView(seen, need);
  box.append(
    gallery(seen, db),
    el('div', { class: 'detail-head' },
      el('div', { class: 'stack-tight' }, el('h3', { class: 'preview-title' }, seen.title ?? 'Your title'), el('span', { class: 'small text-2' }, subtitle(seen))),
      seen.weekly_price != null && el('div', { class: 'detail-price' }, el('strong', {}, `$${seen.weekly_price}`), el('span', { class: 'small text-2' }, priceLine(seen)))),
    about(view, seen),
    calendar(view, need),
    seen.public_lat != null && locationSection(seen));
  return box;
}

function stepReview(db) {
  const acc = account();
  const declaration = el('input', { type: 'checkbox', id: 'accuracy', checked: state.declared });
  declaration.addEventListener('change', () => { state.declared = declaration.checked; refreshNav(); });
  const preview = el('div', { id: 'preview-slot' });
  previewBlock(db).then((node) => preview.replaceChildren(node));
  return [
    el('section', { class: 'stack-tight', id: 'verification', 'aria-labelledby': 'verification-title' },
      el('h2', { id: 'verification-title', class: 'h3' }, acc.phoneVerified ? 'Your contact is verified' : 'Verify your mobile to publish'),
      el('span', { class: 'badge verified' }, '✓ Email verified'),
      acc.phoneVerified
        ? el('span', { class: 'badge verified', id: 'phone-status' }, '✓ Mobile verified')
        : el('div', { class: 'stack-tight', id: 'phone-status' },
          el('span', { class: 'small' }, WIZARD_TEXTS.verifyPhone),
          el('span', { class: 'small text-2' }, WIZARD_TEXTS.verifyPhoneSoon))),
    isDraft() && el('label', { class: 'check declaration' }, declaration, el('span', {}, WIZARD_TEXTS.declaration)),
    preview,
  ];
}

function missingList() {
  const issues = publishIssues(state.listing, account());
  if (!issues.length) return null;
  return el('div', { class: 'notice stack-tight', id: 'publish-missing' },
    el('strong', {}, 'Still to do before you publish'),
    el('ul', { class: 'plain-list' }, issues.map((i) => el('li', {},
      i.step === TOTAL_STEPS
        ? i.text
        : el('button', { type: 'button', class: 'btn-text link-step', onclick: () => go(i.step) }, `${i.text} (step ${i.step})`)))));
}

// ---------------------------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------------------------

async function save() {
  const db = await getClient();
  const l = state.listing;
  const row = listingToRow(l);
  if (!l.id) {
    const id = crypto.randomUUID();
    const { error } = await db.from('listings').insert({ id, owner_id: state.user.id, ...row });
    if (error) return { error };
    l.id = id;
    history.replaceState(history.state, '', `?id=${encodeURIComponent(id)}`);
    // "List a place" is the person saying they host (BR-ACC-001).
    if (!state.profile.is_hosting) {
      await db.from('profiles').update({ is_hosting: true }).eq('id', state.user.id);
      state.profile.is_hosting = true;
    }
  } else {
    const { error } = await db.from('listings').update(row).eq('id', l.id);
    if (error) return { error };
  }
  const a = l.address;
  if (state.addressDirty && a?.line?.trim() && Number.isFinite(a.lat) && Number.isFinite(a.lng)) {
    const address = { address_line: a.line.trim(), lat: a.lat, lng: a.lng };
    const { error } = state.hasAddress
      ? await db.from('listing_private').update(address).eq('listing_id', l.id)
      : await db.from('listing_private').insert({ listing_id: l.id, ...address });
    if (error) return { error };
    state.hasAddress = true;
    state.addressDirty = false;
  }
  if (state.availabilityDirty) {
    const ranges = rangesToRows(l.id, l).filter((r) => r.start_night && r.end_exclusive && r.end_exclusive > r.start_night);
    const exceptions = exceptionsToRows(l.id, l);
    for (const [table, rows] of [['listing_availability_ranges', ranges], ['listing_availability_exceptions', exceptions]]) {
      const del = await db.from(table).delete().eq('listing_id', l.id);
      if (del.error) return { error: del.error };
      if (rows.length) {
        const ins = await db.from(table).insert(rows);
        if (ins.error) return { error: ins.error };
      }
    }
    state.availabilityDirty = false;
  }
  return {};
}

async function saveAndGo(step) {
  if (state.busy) return;
  const blocking = saveIssues(state.listing, state.step, account());
  if (blocking.length) {
    state.error = blocking[0].text;
    state.message = '';
    return refreshNav();
  }
  state.busy = true;
  const { error } = await save();
  state.busy = false;
  if (error) {
    state.error = WIZARD_TEXTS.saveFailed;
    return refreshNav();
  }
  state.error = '';
  if (step === state.step) {
    state.message = WIZARD_TEXTS.saved;
    return refreshNav();
  }
  go(step);
}

function go(step) {
  state.step = step;
  state.message = '';
  state.error = '';
  render();
  window.scrollTo(0, 0);
  document.getElementById('step-title')?.focus();
}

async function publish() {
  if (state.busy || publishIssues(state.listing, account()).length) return;
  state.busy = true;
  refreshNav();
  const { error } = await save();
  if (error) {
    state.busy = false;
    state.error = WIZARD_TEXTS.saveFailed;
    return refreshNav();
  }
  if (!isDraft()) {
    // Editing a live listing: saving is all (the statement was made when it went live).
    state.busy = false;
    return renderDone(WIZARD_TEXTS.changesSaved, '');
  }
  const db = await getClient();
  const { data, error: rpcError } = await db.rpc('publish_listing', { p_listing_id: state.listing.id, p_accuracy_declared: state.declared });
  state.busy = false;
  const text = rpcError ? WIZARD_TEXTS.saveFailed : publishResultText(data);
  if (text) {
    state.error = text;
    return refreshNav();
  }
  state.listing.status = 'active';
  renderDone(WIZARD_TEXTS.published, WIZARD_TEXTS.publishedLead);
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

function refreshNav() {
  const next = document.getElementById('wizard-next');
  if (!next) return;
  const last = state.step === TOTAL_STEPS;
  const blocked = last
    ? (publishIssues(state.listing, account())[0]?.text ?? null)
    : nextBlockedText(state.listing, state.step, account());
  next.disabled = Boolean(blocked) || state.busy;
  if (last) next.textContent = state.busy ? 'Publishing…' : (isDraft() ? 'Publish' : 'Save changes');
  const why = document.getElementById('next-blocked');
  // On the last step the list of what is missing says it already (AC-020-1).
  why.textContent = blocked ?? '';
  why.hidden = !blocked || last;
  const error = document.getElementById('wizard-error');
  error.textContent = state.error;
  error.hidden = !state.error;
  const status = document.getElementById('wizard-status');
  status.textContent = state.message;
  if (last) document.getElementById('publish-missing')?.replaceWith(missingList() ?? el('span', { id: 'publish-missing', hidden: true }));
}

async function render() {
  const db = await getClient();
  const step = state.step;
  document.title = `List your place · ${stepLabel(step)} · SwingMate`;
  const bodies = { 1: stepWhere, 2: stepPrice, 3: stepPhotos, 4: stepAvailability, 5: stepReview };
  const tipOpen = !state.tipsClosed.has(step);
  const last = step === TOTAL_STEPS;
  main.replaceChildren(...[
    el('div', { class: 'stack-tight wizard-head' },
      el('span', { class: 'micro', id: 'step-label' }, `List your place · ${stepLabel(step)}`),
      el('div', { class: 'wizard-progress', 'aria-hidden': 'true' },
        Array.from({ length: TOTAL_STEPS }, (_, i) => el('span', { class: i < step ? 'done' : '' }))),
      el('h1', { id: 'step-title', tabindex: '-1' }, STEP_TITLES[step - 1])),
    // DEC-016, AC-020-7: one short tip per step; closing it keeps everything typed.
    tipOpen && el('aside', { class: 'tip', id: 'step-tip', 'aria-label': 'Tip' },
      el('span', {}, STEP_TIPS[step - 1]),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close tip', onclick: (e) => { state.tipsClosed.add(step); e.currentTarget.parentElement.remove(); } }, '×')),
    el('section', { class: 'card stack wizard-step', id: `step-${step}` }, bodies[step](db)),
    last && (missingList() ?? el('span', { id: 'publish-missing', hidden: true })),
    el('p', { class: 'form-error', role: 'alert', id: 'wizard-error', hidden: true }),
    el('p', { class: 'small text-2', role: 'status', id: 'wizard-status' }),
    el('div', { class: 'wizard-nav' },
      step > 1
        ? el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'wizard-back', onclick: () => saveAndGo(step - 1) }, 'Back')
        : el('a', { class: 'btn btn-secondary btn-sm', id: 'wizard-back', href: 'account.html#listings' }, 'Cancel'),
      el('button', { type: 'button', class: 'btn-text', id: 'save-later', onclick: () => saveAndGo(step) }, 'Save and finish later'),
      el('button', { type: 'button', class: 'btn btn-primary btn-sm', id: 'wizard-next', onclick: () => (last ? publish() : saveAndGo(step + 1)) }, last ? 'Publish' : 'Next')),
    el('p', { class: 'small text-2', id: 'next-blocked', hidden: true }),
  ].filter(Boolean));
  refreshNav();
}

function renderDone(title, lead) {
  document.title = `${title} · SwingMate`;
  main.replaceChildren(el('section', { class: 'card stack empty-state', id: 'published' },
    el('span', { class: 'sent-mark', 'aria-hidden': 'true' }, '✓'),
    el('h1', { tabindex: '-1' }, title),
    lead && el('p', { class: 'lead' }, lead),
    el('div', { class: 'cta-row' },
      el('a', { class: 'btn btn-primary btn-sm', id: 'see-listing', href: `listing.html?id=${encodeURIComponent(state.listing.id)}` }, 'See your listing'),
      el('a', { class: 'btn btn-secondary btn-sm', href: 'account.html#listings' }, 'Go to my places'))));
  main.querySelector('h1').focus();
}

function message(text, action) {
  main.replaceChildren(el('div', { class: 'card stack empty-state' }, el('h1', {}, text), action));
}

let shownUserId;

async function start() {
  const { data: user } = await getSessionUser();
  shownUserId = user?.id ?? null;
  if (!user) {
    // UC-020 precondition: sign up first, then the wizard opens here.
    return message('Log in or sign up to list your place.', el('div', { class: 'cta-row' },
      el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => openAuthSheet({ step: 'signup', source: 'list_place', onDone: start }) }, 'Sign up'),
      el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => openAuthSheet({ step: 'login', onDone: start }) }, 'Log in')));
  }
  const { data: profile } = await getOwnProfile(user.id);
  if (!profileComplete(profile)) {
    message('Finish your profile to list your place.', el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => openAuthSheet({ step: 'profile', user, source: 'list_place', onDone: start }) }, 'Finish your profile'));
    return openAuthSheet({ step: 'profile', user, source: 'list_place', onDone: start });
  }
  Object.assign(state, { user, profile, hasAddress: false, addressDirty: false, availabilityDirty: false, declared: false, message: '', error: '' });
  const { data: roster } = await getOwnRoster(user.id);
  const db = await getClient();
  const id = new URLSearchParams(location.search).get('id');
  if (id) {
    const { data, error } = await db.rpc('my_listing', { p_listing_id: id });
    if (error) return message(WIZARD_TEXTS.saveFailed, el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: start }, 'Try again'));
    if (!data) return message(WIZARD_TEXTS.notFound, el('a', { class: 'btn btn-primary btn-sm', href: 'list.html' }, 'List a place'));
    if (['hidden', 'removed'].includes(data.listing.status)) return message(WIZARD_TEXTS.cantEdit, el('a', { class: 'btn btn-primary btn-sm', href: 'account.html' }, 'My account'));
    state.listing = listingFromRow(data, roster);
    state.hasAddress = Boolean(data.address);
  } else {
    state.listing = listingFromRow(null, roster);
    state.listing.suburbId = profile.base_suburb_id ?? null; // most hosts list where they live
  }
  state.suburbText = await suburbLabel(state.listing.suburbId);
  state.place = await getPlace(state.listing.suburbId);
  // "Save and finish later" comes back to the first step with something missing (UC-020 A1).
  const asked = Number(new URLSearchParams(location.search).get('step'));
  state.step = asked >= 1 && asked <= TOTAL_STEPS ? asked : (id ? (firstIncompleteStep(state.listing, account()) || TOTAL_STEPS) : 1);
  render();
}

async function init() {
  if (!(await getClient())) {
    message('Listing opens with the pilot in Perth.', el('a', { class: 'link-btn', href: './' }, 'Back to SwingMate'));
    return;
  }
  initEvents('list');
  await initAccountMenu(document.getElementById('account'));
  await start();
  // Logging in or out from the header redraws; a token refresh (same person) keeps what is typed.
  onAuthChange((event, user) => {
    if ((user?.id ?? null) !== shownUserId) start();
  });
}

init();
