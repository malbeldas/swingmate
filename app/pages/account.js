// My account: profile (UC-032) and saved roster (BR-ROS-006, AC-002-4). Texts from the prototype's
// account screen (frontend-migration.md). Other sections (saved homes, alerts, messages, privacy)
// arrive with their own issues.
import { getClient } from '../db.js';
import { getOwnProfile, getOwnRoster, getSessionUser, onAuthChange, photoUrl, saveOwnRoster } from '../session.js';
import { initAccountMenu } from '../ui/account-menu.js';
import { openAuthSheet } from '../ui/auth-sheet.js';
import { attachSuburbList, resolveSuburb, suburbLabel } from '../suburbs.js';
import { clearVisitorRoster, readVisitorRoster } from '../visitor-roster.js';
import { INTENTS, TEXTS } from '../../core/account.js';
import { formatDay } from '../../core/dates.js';
import { AVATAR_MAX_PX, JPEG_QUALITY, PHOTO_INPUT_TYPES, PHOTO_TEXTS, avatarPath, photoIssue, scaleToFit } from '../../core/photo.js';
import { cycleLength, neededNights, rosterLabel, rosterWithArticle } from '../../core/roster.js';
import {
  BIO_MAX, DISPLAY_NAME_MAX, TEXTS as PROFILE_TEXTS, WORK_TYPE_LABELS, profileIssues, publicBioText, publicCardLine,
} from '../../core/trust.js';

const main = document.getElementById('account-main');

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function intentOf(profile) {
  if (profile.is_seeking && profile.is_hosting) return 'both';
  return profile.is_hosting ? 'hosting' : 'seeking';
}

// ---------------------------------------------------------------------------------------------
// Signed out
// ---------------------------------------------------------------------------------------------

function renderSignedOut() {
  main.replaceChildren(
    el('p', { class: 'lead' }, 'Log in to see your profile and your roster.'),
    el('div', { class: 'cta-row' },
      el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => openAuthSheet({ step: 'login', onDone: start }) }, 'Log in'),
      el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => openAuthSheet({ step: 'signup', onDone: start }) }, 'Sign up')),
  );
}

// ---------------------------------------------------------------------------------------------
// Profile (UC-032)
// ---------------------------------------------------------------------------------------------

function avatar(name, url) {
  if (url) return el('img', { class: 'avatar', src: url, alt: '', width: '56', height: '56' });
  return el('span', { class: 'avatar', 'aria-hidden': 'true' }, (name.trim()[0] ?? '?').toUpperCase());
}

// BR-PRV-002: decode, scale down and re-encode to JPEG in the browser. Drawing to a canvas keeps
// only the pixels, so EXIF (location, camera) never leaves the device.
async function reencode(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = scaleToFit(bitmap.width, bitmap.height, AVATAR_MAX_PX);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', JPEG_QUALITY));
}

function profileSection(ctx) {
  const { user, profile } = ctx;
  const status = el('p', { class: 'notice', role: 'status', id: 'profile-status' });
  const error = el('p', { class: 'form-error', role: 'alert', id: 'profile-error', hidden: true });
  const photoError = el('p', { class: 'form-error', role: 'alert', id: 'photo-error', hidden: true });
  const showError = (box, text) => { box.textContent = text; box.hidden = !text; };

  const name = el('input', { name: 'displayName', autocomplete: 'given-name', maxlength: String(DISPLAY_NAME_MAX), value: profile.display_name ?? '' });
  const work = el('select', { name: 'workType' },
    el('option', { value: '' }, 'Choose one'),
    Object.entries(WORK_TYPE_LABELS).map(([value, label]) => el('option', { value, selected: profile.work_type === value }, label)));
  const suburb = el('input', { name: 'suburb', list: 'profile-suburb-options', autocomplete: 'off', placeholder: 'e.g. Rockingham, WA', value: ctx.suburbText });
  const options = el('datalist', { id: 'profile-suburb-options' });
  const known = attachSuburbList(suburb, options);
  const bio = el('textarea', { name: 'bio', rows: '3', maxlength: String(BIO_MAX), placeholder: "e.g. Quiet, tidy, I'm on site most of the month and home for my R&R." });
  bio.value = profile.bio ?? '';
  const bioCount = el('span', { class: 'hint', id: 'bio-count' });
  let intent = intentOf(profile);
  const intents = el('div', { class: 'segmented', role: 'group', 'aria-label': "I'm here to" },
    INTENTS.map((option) => el('button', {
      type: 'button',
      'aria-pressed': String(intent === option.value),
      onclick: (e) => {
        intent = option.value;
        for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      },
    }, option.label)));

  // "How hosts see you": updated as the person types (BR-TRU-003: only public facts).
  const preview = el('div', { class: 'card stack public-card', id: 'public-card' });
  const renderPreview = () => {
    bioCount.textContent = `${bio.value.length}/${BIO_MAX}`;
    preview.replaceChildren(
      el('span', { class: 'micro' }, 'How hosts see you'),
      el('div', { class: 'row' },
        avatar(name.value, ctx.photoUrl),
        el('div', { class: 'stack-tight' },
          el('strong', {}, name.value.trim() || 'Your name'),
          el('span', { class: 'small' }, publicCardLine({
            workType: work.value || null, baseSuburb: suburb.value.trim(), roster: ctx.roster, phoneVerified: Boolean(user.phone_confirmed_at),
          })))),
      el('span', { class: 'small text-2' }, publicBioText(bio.value)),
    );
  };
  for (const input of [name, work, suburb, bio]) input.addEventListener('input', renderPreview);

  const fileInput = el('input', { type: 'file', accept: PHOTO_INPUT_TYPES.join(','), class: 'visually-hidden', id: 'photo-input' });
  const photoButton = el('label', { class: 'btn btn-secondary btn-sm', for: 'photo-input' }, ctx.photoUrl ? 'Change photo' : 'Add a photo');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const issue = photoIssue({ type: file.type, size: file.size });
    if (issue) return showError(photoError, PHOTO_TEXTS[issue]);
    showError(photoError, '');
    let blob;
    try { blob = await reencode(file); } catch { return showError(photoError, PHOTO_TEXTS.unreadable); }
    const db = await getClient();
    const path = avatarPath(user.id, crypto.randomUUID());
    const up = await db.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) return showError(photoError, TEXTS.generic);
    const { error: saveError } = await db.from('profiles').update({ photo_path: path }).eq('id', user.id);
    if (saveError) return showError(photoError, TEXTS.generic);
    if (profile.photo_path) await db.storage.from('avatars').remove([profile.photo_path]);
    profile.photo_path = path;
    ctx.photoUrl = await photoUrl(path);
    photoButton.textContent = 'Change photo';
    photoSlot.replaceChildren(avatar(name.value, ctx.photoUrl));
    renderPreview();
    status.textContent = 'Photo saved.';
  });
  const photoSlot = el('div', { id: 'photo-slot' }, avatar(profile.display_name ?? '', ctx.photoUrl));

  const form = el('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    status.textContent = '';
    const baseSuburbId = await resolveSuburb(suburb.value, known);
    const issues = profileIssues({ displayName: name.value, baseSuburbId, bio: bio.value, workType: work.value || null });
    if (issues.length) return showError(error, PROFILE_TEXTS[issues[0]]);
    showError(error, '');
    const isSeeking = intent === 'seeking' || intent === 'both';
    const isHosting = intent === 'hosting' || intent === 'both';
    const db = await getClient();
    const { error: saveError } = await db.from('profiles').update({
      display_name: name.value.trim(),
      base_suburb_id: baseSuburbId,
      bio: bio.value.trim() || null,
      work_type: work.value || null,
      is_seeking: isSeeking,
      is_hosting: isHosting,
    }).eq('id', user.id);
    if (saveError) return showError(error, TEXTS.generic);
    status.textContent = 'Changes saved.';
  } },
  el('div', { class: 'row' }, photoSlot,
    el('div', { class: 'stack-tight' }, photoButton, fileInput,
      el('span', { class: 'hint' }, 'Hosts reply more to profiles with a clear face photo.'))),
  photoError,
  el('div', { class: 'grid-2' },
    el('label', { class: 'field' }, 'Name shown to hosts', name),
    el('label', { class: 'field' }, 'How you work', work)),
  el('label', { class: 'field' }, "Where you're based (suburb)", suburb, el('span', { class: 'hint' }, 'Suburb only. Hosts never see your address.')),
  options,
  el('label', { class: 'field' }, 'About you', bio, bioCount),
  el('fieldset', { class: 'field plain' }, el('legend', {}, "I'm here to"), intents),
  el('div', { class: 'stack-tight', id: 'verification' },
    el('span', { class: 'micro' }, 'Verification'),
    el('span', { class: 'badge verified' }, '✓ Email verified'),
    user.phone_confirmed_at
      ? el('span', { class: 'badge verified' }, '✓ Phone verified')
      : el('span', { class: 'small text-2' }, 'Phone not verified. Optional, some hosts ask for it.')),
  error,
  el('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Save changes'),
  status);

  renderPreview();
  return el('section', { class: 'card stack', 'aria-labelledby': 'profile-title' }, el('h2', { id: 'profile-title' }, 'Profile'), form, preview);
}

// ---------------------------------------------------------------------------------------------
// Roster (BR-ROS-006, AC-002-4)
// ---------------------------------------------------------------------------------------------

function rosterSummary(roster) {
  const cycle = cycleLength(roster);
  const nights = neededNights(roster, roster.anchor, cycle).length;
  return `${rosterLabel(roster)} roster starting ${formatDay(roster.anchor)} · ${nights} nights in town every ${cycle} days`;
}

function rosterSection(ctx) {
  const body = el('div', { class: 'stack', id: 'roster-body' });
  const section = el('section', { class: 'card stack', 'aria-labelledby': 'roster-title' }, el('h2', { id: 'roster-title' }, 'My roster'), body);
  const render = () => {
    if (ctx.roster) {
      body.replaceChildren(
        el('strong', { id: 'roster-summary' }, rosterSummary(ctx.roster)),
        el('span', { class: 'small text-2' }, 'Every search and listing uses this roster to show how well a home fits your weeks off.'));
      return;
    }
    const tried = readVisitorRoster();
    if (!tried) {
      body.replaceChildren(el('span', { class: 'small text-2' }, 'No roster saved yet. Try the calculator on the home page and save it here.'),
        el('a', { class: 'link-btn', href: './#your-nights' }, 'Try your roster'));
      return;
    }
    const error = el('p', { class: 'form-error', role: 'alert', hidden: true });
    body.replaceChildren(
      el('span', {}, `You tried ${rosterWithArticle(tried)} starting ${formatDay(tried.anchor)}.`),
      error,
      el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: async () => {
        const { error: saveError } = await saveOwnRoster(ctx.user.id, tried);
        if (saveError) { error.textContent = TEXTS.generic; error.hidden = false; return; }
        clearVisitorRoster();
        ctx.roster = tried;
        render();
      } }, 'Save roster'));
  };
  render();
  return section;
}

// ---------------------------------------------------------------------------------------------

let shownUserId = null;

async function start() {
  const { data: user } = await getSessionUser();
  shownUserId = user?.id ?? null;
  if (!user) return renderSignedOut();
  const [{ data: profile }, { data: roster }] = await Promise.all([getOwnProfile(user.id), getOwnRoster(user.id)]);
  // Without the minimum profile, the header opens the profile step (BR-ACC-003).
  if (!profile) {
    main.replaceChildren(el('p', { class: 'lead' }, 'Finish your profile to continue.'));
    return;
  }
  const ctx = { user, profile, roster, suburbText: await suburbLabel(profile.base_suburb_id), photoUrl: await photoUrl(profile.photo_path) };
  main.replaceChildren(profileSection(ctx), rosterSection(ctx));
}

async function init() {
  if (!(await getClient())) {
    main.replaceChildren(el('p', { class: 'lead' }, 'Accounts open with the pilot in Perth.'), el('a', { class: 'link-btn', href: './' }, 'Back to SwingMate'));
    return;
  }
  await initAccountMenu(document.getElementById('account'));
  await start();
  // Logging in or out from the header redraws the page too.
  // Only a change of person redraws, so a token refresh never wipes unsaved edits.
  onAuthChange((event, user) => {
    if ((user?.id ?? null) !== shownUserId) start();
  });
}

init();
