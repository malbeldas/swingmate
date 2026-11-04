// Inbox and conversation (UC-023, UC-033). Layout and texts from the prototype's Messages screens
// (frontend-migration.md). The list comes from my_conversations, the host's card from inquirer_card,
// the messages straight from the table (P-17) and new ones through Supabase Realtime (AC-033-1).
import { initEvents, trackEvent } from '../events.js';
import { getClient } from '../db.js';
import { el } from '../ui/dom.js';
import { initAccountMenu } from '../ui/account-menu.js';
import { openAuthSheet } from '../ui/auth-sheet.js';
import { getSessionUser, onAuthChange } from '../session.js';
import { MESSAGE_MAX } from '../../core/messaging.js';
import {
  TEXTS, addMessage, conversationHead, inquirerView, listItem, messageGroups, replyErrorText, replyIssue,
} from '../../core/inbox.js';
import { TEXTS as MSG_TEXTS } from '../../core/messaging.js';
import { REPORT_TEXTS } from '../../core/moderation.js';
import { OUTCOME_TEXTS, outcomeCard } from '../../core/outcome.js';
import { openBlockSheet, openReportSheet, setConversationBlock } from '../ui/report-sheet.js';

const main = document.getElementById('messages-main');
const MESSAGE_COLUMNS = 'id, sender_id, kind, body, stay_from, stay_to, created_at, risk_flag';
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Perth';

const state = {
  user: null,
  rows: [],
  openId: new URLSearchParams(location.search).get('c'),
  messages: [],
  card: null,
  draft: '',
  error: '',
  sending: false,
  channel: null,
  outcome: null, // the answer of the person who searched (UC-007)
  outcomeError: false,
  outcomeSaving: false,
};

function coverUrl(db, path) {
  return path ? db.storage.from('listing-photos').getPublicUrl(path).data.publicUrl : '';
}

// ---------------------------------------------------------------------------------------------
// List (UC-023 steps 1 and 2)
// ---------------------------------------------------------------------------------------------

function listSection(db) {
  const items = state.rows.map((row) => {
    const item = listItem(row, new Date(), timeZone);
    const cover = coverUrl(db, row.cover_path);
    return el('li', {},
      el('a', {
        class: `conversation-link${item.unread ? ' unread' : ''}`,
        href: `messages.html?c=${encodeURIComponent(item.id)}`,
        'aria-current': item.id === state.openId ? 'page' : null,
        'data-conversation': item.id,
        onclick: (e) => { e.preventDefault(); openConversation(item.id, true); },
      },
      cover ? el('img', { class: 'conversation-cover', src: cover, alt: '', width: '48', height: '48' })
        : el('span', { class: 'avatar small', 'aria-hidden': 'true' }, item.initial),
      el('span', { class: 'conversation-text' },
        el('span', { class: 'conversation-top' }, el('strong', {}, item.name), el('span', { class: 'small text-2' }, item.when)),
        el('span', { class: 'small text-2' }, `${item.title} · ${item.dates}`),
        item.preview && el('span', { class: 'small conversation-preview' }, item.preview)),
      item.unread && el('span', { class: 'unread-dot', role: 'img', 'aria-label': 'Unread' })));
  });
  return el('section', { class: 'card stack conversation-list', 'aria-labelledby': 'messages-title', id: 'conversation-list' },
    el('h1', { id: 'messages-title' }, TEXTS.title),
    items.length
      ? el('ul', { class: 'plain-list' }, items)
      : el('div', { class: 'stack-tight', id: 'no-messages' },
        el('p', {}, TEXTS.empty),
        el('a', { class: 'btn btn-primary btn-sm', href: 'search.html' }, TEXTS.searchHomes)));
}

// ---------------------------------------------------------------------------------------------
// Conversation (UC-033, UC-023 step 3)
// ---------------------------------------------------------------------------------------------

function cardBlock(view) {
  if (!view) return null;
  return el('section', { class: 'inquirer-card stack-tight', id: 'inquirer-card', 'aria-label': `About ${view.name}` },
    el('span', { class: 'micro' }, `About ${view.name}`),
    view.fit && el('p', { class: `requested-fit ${view.fit.tone}`, id: 'requested-fit' }, view.fit.text),
    el('span', { class: 'small' }, view.line),
    el('div', { class: 'row wrap-row' }, view.badges.map((b) => el('span', { class: `badge ${b.tone}` }, b.text))),
    el('span', { class: 'small text-2' }, `${view.since} · ${view.activity}`),
    el('p', { class: 'small' }, view.bio));
}

// UC-007 and BR-MAIL-003: the outcome question, only for the person who searched. The answer can be
// changed any time (A1).
function outcomeBlock(m) {
  const card = outcomeCard(state.outcome, { error: state.outcomeError });
  return el('section', { class: 'outcome-card stack-tight', id: 'outcome-question', 'data-message': m.id, 'aria-labelledby': 'outcome-title' },
    el('span', { class: 'micro' }, `${OUTCOME_TEXTS.from} · ${m.time}`),
    el('p', { id: 'outcome-title' }, el('strong', {}, card.question)),
    el('div', { class: 'segmented', role: 'group', 'aria-labelledby': 'outcome-title' },
      card.options.map((o) => el('button', {
        type: 'button',
        'aria-pressed': String(o.pressed),
        disabled: state.outcomeSaving,
        onclick: () => answerOutcome(o.answer),
      }, o.label))),
    el('p', { class: `small ${card.error ? 'form-error' : 'text-2'}`, id: 'outcome-note', role: 'status' }, card.note));
}

function thread() {
  const row = state.rows.find((r) => r.id === state.openId);
  const groups = messageGroups(state.messages, state.user.id, new Date(), timeZone, { role: row?.role });
  return el('div', { class: 'thread', id: 'thread', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages' },
    groups.flatMap((g) => [
      el('p', { class: 'day-label micro' }, g.label),
      ...g.messages.flatMap((m) => m.system ? [outcomeBlock(m)] : [
        m.warning && el('p', { class: 'risk-warning small', role: 'note' }, m.warning),
        el('div', { class: `bubble ${m.mine ? 'mine' : 'theirs'}`, 'data-message': m.id },
          m.dates && el('span', { class: 'bubble-dates small' }, `Dates: ${m.dates}`),
          el('p', { class: 'bubble-text' }, m.body),
          el('span', { class: 'bubble-time' }, m.time)),
      ]),
    ]));
}

function composer(head) {
  if (!head.canWrite) return el('p', { class: 'notice closed-note', id: 'closed-note' }, head.closedText);
  const text = el('textarea', { name: 'reply', id: 'reply-text', rows: '2', maxlength: String(MESSAGE_MAX), placeholder: 'Write a message…' });
  text.value = state.draft;
  text.addEventListener('input', () => { state.draft = text.value; });
  return el('form', { class: 'composer stack-tight', novalidate: true, onsubmit: (e) => { e.preventDefault(); sendReply(); } },
    el('label', { class: 'field' }, el('span', { class: 'visually-hidden' }, TEXTS.write), text),
    el('p', { class: 'form-error', id: 'reply-error', role: 'alert', hidden: !state.error }, state.error),
    el('button', { type: 'submit', class: 'btn btn-primary', id: 'send-reply', disabled: state.sending },
      state.sending ? 'Sending…' : (state.error ? TEXTS.tryAgain : TEXTS.send)));
}

// UC-034: report the conversation, block or unblock the other person. Nothing changes for them on
// screen (BR-MSG-006); the person who blocked sees a note and can undo it here (A2).
function tools(db, row) {
  const name = row.other_name;
  const refresh = () => refreshList(db);
  const report = el('button', {
    type: 'button', class: 'btn-text report-link', id: 'report-conversation',
    onclick: () => openReportSheet({ targetType: 'conversation', targetId: row.id, blockName: name && !row.blocked_by_me ? name : null, onDone: refresh }),
  }, REPORT_TEXTS.report);
  const block = name && (row.blocked_by_me
    ? el('button', {
      type: 'button', class: 'btn-text', id: 'unblock',
      onclick: async () => { await setConversationBlock(row.id, false); await refresh(); },
    }, REPORT_TEXTS.unblock)
    : el('button', {
      type: 'button', class: 'btn-text', id: 'block',
      onclick: () => openBlockSheet({ conversationId: row.id, name, onDone: refresh }),
    }, REPORT_TEXTS.block));
  return [
    el('div', { class: 'conversation-tools' }, block, report),
    row.blocked_by_me && name && el('p', { class: 'blocked-note small', id: 'blocked-note', role: 'status' }, REPORT_TEXTS.blockedNote(name)),
  ];
}

function conversationSection(db) {
  const row = state.rows.find((r) => r.id === state.openId);
  const back = el('a', { class: 'btn-text back-link', href: 'messages.html', onclick: (e) => { e.preventDefault(); closeConversation(); } }, `‹ ${TEXTS.back}`);
  if (!row) {
    return el('section', { class: 'card stack conversation', id: 'conversation' }, back,
      el('p', {}, state.openId ? TEXTS.notFound : TEXTS.choose));
  }
  const head = conversationHead(row);
  const cover = coverUrl(db, row.cover_path);
  return el('section', { class: 'card stack conversation', id: 'conversation', 'aria-labelledby': 'conversation-title' },
    back,
    el('div', { class: 'conversation-head' },
      cover && el('img', { class: 'conversation-cover', src: cover, alt: '', width: '56', height: '56' }),
      el('div', { class: 'stack-tight' },
        el('h2', { id: 'conversation-title' }, el('a', { href: `listing.html?id=${encodeURIComponent(row.listing_id)}` }, head.heading)),
        el('span', { class: 'small text-2', id: 'requested-dates' }, head.requested))),
    ...tools(db, row),
    head.banner && el('p', { class: 'status-label', id: 'listing-status', role: 'status' }, head.banner),
    row.role === 'host' && cardBlock(inquirerView(state.card)),
    thread(),
    composer(head));
}

function render(db, focus) {
  const showList = !state.openId;
  main.replaceChildren(el('div', { class: `messages-layout${state.openId ? ' has-open' : ''}` },
    el('div', { class: `list-pane${showList ? '' : ' pane-hidden-mobile'}` }, listSection(db)),
    el('div', { class: `conversation-pane${showList ? ' pane-hidden-mobile' : ''}` }, conversationSection(db))));
  const threadEl = document.getElementById('thread');
  if (threadEl) threadEl.scrollTop = threadEl.scrollHeight;
  if (focus) document.querySelector(focus)?.focus();
}

// ---------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------

async function loadList(db) {
  const { data, error } = await db.rpc('my_conversations');
  if (error) throw error;
  state.rows = data ?? [];
}

async function subscribe(db, id) {
  if (state.channel) await db.removeChannel(state.channel);
  state.channel = db.channel(`conversation-${id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, async (payload) => {
      if (state.openId !== id) return;
      state.messages = addMessage(state.messages, payload.new);
      if (payload.new.sender_id !== state.user.id) await db.rpc('mark_conversation_read', { p_conversation_id: id });
      await refreshList(db);
    })
    .subscribe();
}

async function refreshList(db) {
  try { await loadList(db); } catch { /* the open conversation still works */ }
  const keepFocus = document.activeElement?.id === 'reply-text' ? '#reply-text' : null;
  render(db, keepFocus);
}

async function openConversation(id, push) {
  const db = await getClient();
  state.openId = id;
  state.messages = [];
  state.card = null;
  state.draft = '';
  state.error = '';
  state.outcome = null;
  state.outcomeError = false;
  if (push) history.pushState({ c: id }, '', `messages.html?c=${encodeURIComponent(id)}`);
  const row = state.rows.find((r) => r.id === id);
  if (!row) return render(db);
  trackEvent('conversation_opened', { conversation_id: id, role: row.role });
  const [{ data: messages }, card, outcome] = await Promise.all([
    db.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id', id).order('created_at').limit(500),
    row.role === 'host' ? db.rpc('inquirer_card', { p_conversation_id: id }) : Promise.resolve({ data: null }),
    row.role === 'seeker'
      ? db.from('outcome_responses').select('answer').eq('conversation_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  state.messages = messages ?? [];
  state.card = card.data ?? null;
  state.outcome = outcome.data?.answer ?? null;
  await subscribe(db, id);
  // UC-033 step 4: opening marks it read.
  await db.rpc('mark_conversation_read', { p_conversation_id: id });
  await refreshList(db);
  document.getElementById('reply-text')?.focus();
}

async function closeConversation() {
  const db = await getClient();
  if (state.channel) await db.removeChannel(state.channel);
  state.channel = null;
  state.openId = null;
  history.pushState({}, '', 'messages.html');
  render(db, '#messages-title');
}

async function sendReply() {
  const db = await getClient();
  const issue = replyIssue(state.draft);
  if (issue) {
    state.error = MSG_TEXTS[issue];
    return render(db, '#reply-text');
  }
  state.sending = true;
  state.error = '';
  render(db);
  const { data, error } = await db.from('messages')
    .insert({ conversation_id: state.openId, sender_id: state.user.id, kind: 'text', body: state.draft.trim() })
    .select(MESSAGE_COLUMNS).single();
  state.sending = false;
  if (error || !data) {
    // UC-033 E1 and E2: the text stays.
    state.error = replyErrorText(error);
    return render(db, '#reply-text');
  }
  state.messages = addMessage(state.messages, data);
  state.draft = '';
  await refreshList(db);
  document.getElementById('reply-text')?.focus();
}

// UC-007 step 1 and A1 from the conversation. outcome_answered is recorded by the database.
async function answerOutcome(answer) {
  const db = await getClient();
  state.outcomeSaving = true;
  state.outcomeError = false;
  render(db);
  const { data, error } = await db.rpc('answer_outcome', { p_conversation_id: state.openId, p_answer: answer });
  state.outcomeSaving = false;
  if (error || !data?.ok) state.outcomeError = true;
  else state.outcome = data.answer;
  render(db, '#outcome-question [aria-pressed="true"]');
}

// ---------------------------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------------------------

function signedOut() {
  main.replaceChildren(el('div', { class: 'card stack empty-state', id: 'signed-out' },
    el('h1', {}, TEXTS.title),
    el('p', {}, TEXTS.logIn),
    el('div', { class: 'cta-row' },
      el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => openAuthSheet({ step: 'login', onDone: () => init() }) }, 'Log in'))));
}

async function init() {
  const db = await getClient();
  if (!db) return signedOut();
  initEvents('messages');
  const { data: user } = await getSessionUser();
  if (!user) return signedOut();
  state.user = user;
  try {
    await loadList(db);
  } catch {
    main.replaceChildren(el('div', { class: 'card stack empty-state' },
      el('p', {}, TEXTS.loadFailed),
      el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: init }, 'Try again')));
    return;
  }
  if (state.openId) await openConversation(state.openId, false);
  else render(db);
}

window.addEventListener('popstate', async () => {
  const id = new URLSearchParams(location.search).get('c');
  if (id) await openConversation(id, false);
  else {
    const db = await getClient();
    if (state.channel) await db.removeChannel(state.channel);
    state.channel = null;
    state.openId = null;
    render(db);
  }
});

initAccountMenu(document.getElementById('account'));
onAuthChange((event, who) => {
  if (event === 'SIGNED_OUT') signedOut();
  // Logging in from the header loads the inbox of that account.
  if (event === 'SIGNED_IN' && who && who.id !== state.user?.id) init();
});
init();
