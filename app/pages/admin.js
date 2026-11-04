// Admin panel: the report queue and its actions (UC-040). Everything goes through the admin RPCs
// (admin_reports, admin_read_conversation, admin_act), which check the role again (BR-ADM-004),
// log every read and action (BR-ADM-001, BR-ADM-002) and never return emails or phones.
import { getClient } from '../db.js';
import { el } from '../ui/dom.js';
import { initAccountMenu } from '../ui/account-menu.js';
import { openAuthSheet } from '../ui/auth-sheet.js';
import { getSessionUser, onAuthChange } from '../session.js';
import { createFinder } from './admin-find.js';
import {
  SEARCH_TEXTS, ACTION_LABELS, ADMIN_TEXTS, REPORT_REASONS, actResultText, actionIssue, adminActions, adminQueue, ageText, isAdmin,
} from '../../core/moderation.js';

const main = document.getElementById('admin-main');
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Perth';
const timeFormat = new Intl.DateTimeFormat('en-AU', { timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const state = {
  user: null,
  view: 'reports', // 'reports' | 'find' | 'record' (UC-041)
  queue: [],
  openId: null,
  conversation: null, // messages once read
  readError: '',
  action: '',
  note: '',
  error: '',
  notice: '',
  busy: false,
};

function openGroup() {
  return state.queue.find((g) => g.reportIds.includes(state.openId)) ?? null;
}

// ---------------------------------------------------------------------------------------------
// Queue (UC-040 step 1, A1)
// ---------------------------------------------------------------------------------------------

function queueSection() {
  const items = state.queue.map((g) => el('li', {},
    el('a', {
      class: 'queue-link', href: `#report=${encodeURIComponent(g.key)}`, 'data-report': g.key,
      'aria-current': g.reportIds.includes(state.openId) ? 'page' : null,
    },
      el('span', { class: 'queue-top' },
        el('span', { class: 'badge report-type' }, g.type),
        g.overdue && el('span', { class: 'badge overdue' }, ADMIN_TEXTS.overdue),
        el('span', { class: 'small text-2' }, g.age)),
      el('strong', {}, g.label),
      g.person && g.targetType !== 'user' && el('span', { class: 'small' }, g.person),
      el('span', { class: 'small text-2' }, `${g.countText} · ${g.reasonText}`))));
  return el('section', { class: 'card stack', id: 'report-queue', 'aria-labelledby': 'admin-title' },
    el('h1', { id: 'admin-title' }, ADMIN_TEXTS.title),
    state.notice && el('p', { class: 'notice', id: 'admin-notice', role: 'status' }, state.notice),
    items.length ? el('ul', { class: 'plain-list report-list' }, items) : el('p', { id: 'no-reports' }, ADMIN_TEXTS.empty));
}

// ---------------------------------------------------------------------------------------------
// One report (UC-040 steps 2 to 4)
// ---------------------------------------------------------------------------------------------

function reportsList(g) {
  return el('section', { class: 'stack-tight', 'aria-labelledby': 'reports-heading' },
    el('h3', { id: 'reports-heading', class: 'micro' }, ADMIN_TEXTS.reportsHeading),
    el('ul', { class: 'plain-list report-entries' }, g.reports.map((r) => el('li', { class: 'report-entry' },
      el('strong', {}, REPORT_REASONS[r.reason] ?? REPORT_REASONS.other),
      r.details && el('p', { class: 'report-details' }, r.details),
      el('span', { class: 'small text-2' }, `${r.reporter_name || 'Deleted account'} · ${ageText(r.created_at, new Date())}`)))));
}

function conversationBlock(g) {
  if (g.targetType !== 'conversation') return null;
  if (!state.conversation) {
    return el('div', { class: 'stack-tight' },
      el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'read-conversation', onclick: () => readConversation(g) }, ADMIN_TEXTS.readConversation),
      el('span', { class: 'small text-2' }, ADMIN_TEXTS.readNote),
      state.readError && el('p', { class: 'form-error', role: 'alert' }, state.readError));
  }
  return el('div', { class: 'thread admin-thread', id: 'admin-thread', role: 'log', 'aria-label': 'Reported conversation' },
    state.conversation.flatMap((m) => [
      m.risk_flag && el('p', { class: 'risk-warning small', role: 'note' }, 'Flagged by the risk check'),
      el('div', { class: `bubble ${m.sender === 'host' ? 'mine' : 'theirs'}`, 'data-message': m.id },
        el('span', { class: 'bubble-sender small' }, `${m.sender_name || 'Deleted account'} (${m.sender === 'host' ? 'host' : 'seeker'})`),
        el('p', { class: 'bubble-text' }, m.body),
        el('span', { class: 'bubble-time' }, timeFormat.format(new Date(m.created_at)))),
    ]));
}

function actionForm(g) {
  const radios = adminActions(g.targetType).map((a) => el('label', { class: 'check' },
    el('input', {
      type: 'radio', name: 'action', value: a, checked: state.action === a,
      onchange: () => { state.action = a; },
    }),
    el('span', {}, ACTION_LABELS[a])));
  const note = el('textarea', { name: 'note', id: 'action-note', rows: '3', maxlength: '1000', 'aria-describedby': 'action-error' });
  note.value = state.note;
  note.addEventListener('input', () => { state.note = note.value; });
  return el('form', { class: 'stack action-form', id: 'action-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); applyAction(g); } },
    el('fieldset', { class: 'stack-tight plain-fieldset' }, el('legend', { class: 'field' }, ADMIN_TEXTS.actionLegend), radios),
    el('label', { class: 'field' }, ADMIN_TEXTS.noteLabel, note),
    el('p', { class: 'form-error', id: 'action-error', role: 'alert', hidden: !state.error }, state.error),
    el('button', { type: 'submit', class: 'btn btn-primary', id: 'apply-action', disabled: state.busy },
      state.busy ? ADMIN_TEXTS.applying : ADMIN_TEXTS.apply));
}

function detailSection() {
  const back = el('a', { class: 'btn-text back-link', href: '#', onclick: (e) => { e.preventDefault(); closeReport(); } }, `‹ ${ADMIN_TEXTS.back}`);
  const g = openGroup();
  if (!g) return el('section', { class: 'card stack', id: 'report-detail' }, back, el('p', {}, ADMIN_TEXTS.notFound));
  return el('section', { class: 'card stack', id: 'report-detail', 'aria-labelledby': 'report-title' },
    back,
    el('div', { class: 'stack-tight' },
      el('span', { class: 'micro' }, `${g.type} · ${g.countText}`),
      el('h2', { id: 'report-title' }, g.label),
      g.person && g.targetType !== 'user' && el('span', { class: 'small' }, g.targetType === 'listing' ? `Host: ${g.person}` : `Reported person: ${g.person}`),
      g.status && el('span', { class: 'small text-2', id: 'target-status' }, `Status: ${g.status}`),
      g.targetType === 'listing' && el('a', { class: 'btn-text', href: `listing.html?id=${encodeURIComponent(g.targetId)}`, target: '_blank', rel: 'noopener' }, ADMIN_TEXTS.openListing)),
    reportsList(g),
    conversationBlock(g),
    actionForm(g));
}

// Reports (UC-040) and Find (UC-041), as two tabs of the same page.
function tabs() {
  const onReports = state.view === 'reports';
  return el('nav', { class: 'admin-tabs', 'aria-label': 'Admin' },
    el('a', { href: '#', id: 'tab-reports', 'aria-current': onReports ? 'page' : null }, ADMIN_TEXTS.title),
    el('a', { href: '#find', id: 'tab-find', 'aria-current': onReports ? null : 'page' }, SEARCH_TEXTS.tab));
}

function render(focus) {
  let content;
  if (state.view === 'find') content = finder.searchView();
  else if (state.view === 'record') content = finder.recordView();
  else {
    const open = Boolean(state.openId);
    content = el('div', { class: `admin-layout${open ? ' has-open' : ''}` },
      el('div', { class: `list-pane${open ? ' pane-hidden-mobile' : ''}` }, queueSection()),
      open && el('div', { class: 'detail-pane' }, detailSection()));
  }
  main.replaceChildren(tabs(), content);
  if (focus) document.querySelector(focus)?.focus();
}

const finder = createFinder(render);

// ---------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------

async function loadQueue(db) {
  const { data, error } = await db.rpc('admin_reports');
  if (error) throw error;
  state.queue = adminQueue(data ?? [], new Date());
}

function resetDetail() {
  state.conversation = null;
  state.readError = '';
  state.action = '';
  state.note = '';
  state.error = '';
  state.busy = false;
}

function openReport(id) {
  if (id !== state.openId) resetDetail();
  state.openId = id;
  state.notice = '';
  render('#report-title');
}

function closeReport() {
  state.openId = null;
  resetDetail();
  history.pushState(null, '', location.pathname + location.search);
  render('#admin-title');
}

async function readConversation(g) {
  const db = await getClient();
  const { data, error } = await db.rpc('admin_read_conversation', { p_conversation_id: g.targetId });
  if (error) {
    state.readError = ADMIN_TEXTS.readFailed;
    return render();
  }
  state.conversation = data ?? [];
  render('#admin-thread');
}

async function applyAction(g) {
  const issue = actionIssue({ action: state.action, targetType: g.targetType, note: state.note });
  if (issue) {
    state.error = issue;
    return render(state.action ? '#action-note' : 'input[name="action"]');
  }
  const db = await getClient();
  state.busy = true;
  state.error = '';
  render();
  const { data, error } = await db.rpc('admin_act', { p_report_id: g.key, p_action: state.action, p_note: state.note.trim() });
  state.busy = false;
  const text = actResultText(data, error);
  if (!data?.ok) {
    state.error = text;
    return render('#action-note');
  }
  try { await loadQueue(db); } catch { /* the notice still says it worked */ }
  state.openId = null;
  resetDetail();
  state.notice = text;
  history.pushState(null, '', location.pathname + location.search);
  render('#admin-title');
}

// ---------------------------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------------------------

function message(id, text, withLogin) {
  main.replaceChildren(el('div', { class: 'card stack empty-state', id },
    el('h1', {}, ADMIN_TEXTS.title),
    el('p', {}, text),
    withLogin && el('div', { class: 'cta-row' },
      el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => openAuthSheet({ step: 'login', onDone: () => init() }) }, 'Log in'))));
}

async function init() {
  const db = await getClient();
  if (!db) return message('signed-out', ADMIN_TEXTS.logIn, false);
  const { data: user } = await getSessionUser();
  if (!user) return message('signed-out', ADMIN_TEXTS.logIn, true);
  if (!isAdmin(user)) return message('not-admin', ADMIN_TEXTS.notAdmin, false);
  state.user = user;
  try {
    await loadQueue(db);
  } catch {
    main.replaceChildren(el('div', { class: 'card stack empty-state' },
      el('p', {}, ADMIN_TEXTS.loadFailed),
      el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: init }, 'Try again')));
    return;
  }
  await route();
}

// The address says which view is open: #report=<id> (also the NTF-009 link), #find, #person=<id>
// or #listing=<id>. Search words never go in it (engineering-constitution.md §10).
async function route() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const from = state.view;
  if (hash.get('person') || hash.get('listing')) {
    state.view = 'record';
    return finder.openRecord(hash.get('person') ? 'user' : 'listing', hash.get('person') || hash.get('listing'));
  }
  if (hash.has('find')) {
    state.view = 'find';
    return render(from === 'reports' ? '#find-query' : null);
  }
  state.view = 'reports';
  if (from !== 'reports') {
    try { await loadQueue(await getClient()); } catch { /* keep the last queue */ }
  }
  const id = hash.get('report');
  if (id) return openReport(id);
  if (state.openId) resetDetail();
  state.openId = null;
  render(from !== 'reports' ? '#admin-title' : null);
}

window.addEventListener('hashchange', () => {
  if (state.user) route();
});

initAccountMenu(document.getElementById('account'));
onAuthChange((event, who) => {
  if (event === 'SIGNED_OUT') { state.user = null; message('signed-out', ADMIN_TEXTS.logIn, true); }
  if (event === 'SIGNED_IN' && who && who.id !== state.user?.id) init();
});
init();

