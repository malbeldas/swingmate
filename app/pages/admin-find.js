// Admin panel, "Find": search people and listings, open their record and act on it (UC-041).
// The query never goes in the address (engineering-constitution.md §10): only record ids do.
// No message content ever reaches these views (AC-041-1).
import { getClient } from '../db.js';
import { el } from '../ui/dom.js';
import {
  ACTION_LABELS, ADMIN_TEXTS, REPORT_REASONS, SEARCH_TEXTS, ageText, listingLine, logEntries, moderateResultText,
  personLine, recordActionIssue, recordActions, searchIssue, statusLabel,
} from '../../core/moderation.js';

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Perth';
const dateTime = new Intl.DateTimeFormat('en-AU', { timeZone, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const dateOnly = new Intl.DateTimeFormat('en-AU', { timeZone, day: 'numeric', month: 'short', year: 'numeric' });

// rerender(focusSelector) redraws the page; the finder keeps its own state between views.
export function createFinder(rerender) {
  const s = {
    query: '', results: null, searchError: '', searching: false,
    type: null, id: null, record: null, loadError: '',
    action: '', note: '', formError: '', notice: '', busy: false,
  };

  // -------------------------------------------------------------------------------------------
  // Search (UC-041 step 1)
  // -------------------------------------------------------------------------------------------

  async function search() {
    const issue = searchIssue(s.query);
    if (issue) {
      s.searchError = issue;
      return rerender('#find-query');
    }
    s.searching = true;
    s.searchError = '';
    rerender();
    const db = await getClient();
    const { data, error } = await db.rpc('admin_search', { p_query: s.query.trim() });
    s.searching = false;
    if (error) {
      s.searchError = SEARCH_TEXTS.failed;
      return rerender('#find-query');
    }
    s.results = data ?? { people: [], listings: [] };
    rerender('#find-results');
  }

  function badge(text, cls = '') {
    return el('span', { class: `badge ${cls}`.trim() }, text);
  }

  function personItem(p) {
    return el('li', {}, el('a', { class: 'queue-link', href: `#person=${encodeURIComponent(p.id)}`, 'data-person': p.id },
      el('span', { class: 'queue-top' },
        el('strong', {}, p.display_name || 'No name yet'),
        p.status === 'suspended' && badge(statusLabel(p.status), 'overdue'),
        p.is_admin && badge(SEARCH_TEXTS.admin, 'report-type'),
        Number(p.open_reports) > 0 && badge(`${p.open_reports} open`, 'overdue')),
      el('span', { class: 'small text-2' }, personLine(p))));
  }

  function listingItem(l) {
    return el('li', {}, el('a', { class: 'queue-link', href: `#listing=${encodeURIComponent(l.id)}`, 'data-listing': l.id },
      el('span', { class: 'queue-top' },
        el('strong', {}, l.title || 'Untitled draft'),
        badge(statusLabel(l.status), l.status === 'hidden' ? 'overdue' : 'report-type'),
        Number(l.open_reports) > 0 && badge(`${l.open_reports} open`, 'overdue')),
      el('span', { class: 'small text-2' }, listingLine(l))));
  }

  function resultsBlock() {
    if (!s.results) return null;
    const { people = [], listings = [] } = s.results;
    if (!people.length && !listings.length) return el('p', { id: 'find-results', tabindex: '-1' }, SEARCH_TEXTS.none);
    return el('div', { class: 'stack', id: 'find-results', tabindex: '-1' },
      people.length > 0 && el('section', { class: 'stack-tight', 'aria-labelledby': 'people-heading' },
        el('h2', { class: 'micro', id: 'people-heading' }, `${SEARCH_TEXTS.people} (${people.length})`),
        el('ul', { class: 'plain-list', id: 'people-results' }, people.map(personItem))),
      listings.length > 0 && el('section', { class: 'stack-tight', 'aria-labelledby': 'listings-heading' },
        el('h2', { class: 'micro', id: 'listings-heading' }, `${SEARCH_TEXTS.listings} (${listings.length})`),
        el('ul', { class: 'plain-list', id: 'listing-results' }, listings.map(listingItem))));
  }

  function searchView() {
    const input = el('input', { type: 'search', id: 'find-query', name: 'q', autocomplete: 'off', 'aria-describedby': 'find-error' });
    input.value = s.query;
    input.addEventListener('input', () => { s.query = input.value; });
    return el('section', { class: 'card stack', id: 'find', 'aria-labelledby': 'find-title' },
      el('h1', { id: 'find-title' }, SEARCH_TEXTS.title),
      el('form', { class: 'find-form', role: 'search', novalidate: true, onsubmit: (e) => { e.preventDefault(); search(); } },
        el('label', { class: 'field' }, SEARCH_TEXTS.label, input),
        el('button', { type: 'submit', class: 'btn btn-primary', disabled: s.searching }, SEARCH_TEXTS.submit)),
      el('p', { class: 'form-error', id: 'find-error', role: 'alert', hidden: !s.searchError }, s.searchError),
      resultsBlock());
  }

  // -------------------------------------------------------------------------------------------
  // Records (UC-041 steps 2 and 3)
  // -------------------------------------------------------------------------------------------

  async function openRecord(type, id) {
    if (type !== s.type || id !== s.id) {
      s.action = '';
      s.note = '';
      s.formError = '';
      s.notice = '';
    }
    s.type = type;
    s.id = id;
    s.record = null;
    s.loadError = '';
    rerender();
    const db = await getClient();
    const { data, error } = await db.rpc(type === 'user' ? 'admin_person' : 'admin_listing', { p_id: id });
    if (s.id !== id) return; // another record was opened meanwhile
    if (error || !data) s.loadError = error ? ADMIN_TEXTS.loadFailed : SEARCH_TEXTS.notFound;
    else s.record = data;
    rerender('#record-title');
  }

  async function act() {
    const allowed = recordActions(s.type, s.record);
    const issue = recordActionIssue({ action: s.action, note: s.note }, allowed);
    if (issue) {
      s.formError = issue;
      return rerender(s.action ? '#record-note' : 'input[name="record-action"]');
    }
    s.busy = true;
    s.formError = '';
    rerender();
    const db = await getClient();
    const { data, error } = await db.rpc('admin_moderate', {
      p_target_type: s.type, p_target_id: s.id, p_action: s.action, p_note: s.note.trim(),
    });
    s.busy = false;
    const text = moderateResultText(data, error);
    if (!data?.ok) {
      s.formError = text;
      return rerender('#record-note');
    }
    s.action = '';
    s.note = '';
    await openRecord(s.type, s.id);
    s.notice = text;
    rerender('#record-notice');
  }

  function reportsBlock(reports) {
    return el('section', { class: 'stack-tight', 'aria-labelledby': 'record-reports' },
      el('h3', { class: 'micro', id: 'record-reports' }, SEARCH_TEXTS.reports),
      reports.length
        ? el('ul', { class: 'plain-list report-entries' }, reports.map((r) => el('li', { class: 'report-entry' },
          el('strong', {}, `${REPORT_REASONS[r.reason] ?? REPORT_REASONS.other}${r.status === 'open' ? '' : ' (closed)'}`),
          r.details && el('p', { class: 'report-details' }, r.details),
          el('span', { class: 'small text-2' }, `${r.reporter_name || 'Deleted account'} · ${ageText(r.created_at, new Date())}`))))
        : el('p', { class: 'small text-2' }, SEARCH_TEXTS.noReports));
  }

  function logBlock(log) {
    const entries = logEntries(log, (d) => dateTime.format(d));
    return el('section', { class: 'stack-tight', 'aria-labelledby': 'record-log' },
      el('h3', { class: 'micro', id: 'record-log' }, SEARCH_TEXTS.log),
      entries.length
        ? el('ul', { class: 'plain-list report-entries', id: 'log-entries' }, entries.map((e) => el('li', { class: 'report-entry log-entry' },
          el('strong', {}, e.action),
          el('p', { class: 'report-details' }, e.note),
          el('span', { class: 'small text-2' }, `${e.by} · ${e.when}`))))
        : el('p', { class: 'small text-2' }, SEARCH_TEXTS.noLog));
  }

  function actionForm() {
    const allowed = recordActions(s.type, s.record);
    const radios = allowed.map((a) => el('label', { class: 'check' },
      el('input', { type: 'radio', name: 'record-action', value: a, checked: s.action === a, onchange: () => { s.action = a; } }),
      el('span', {}, ACTION_LABELS[a])));
    const note = el('textarea', { name: 'note', id: 'record-note', rows: '3', maxlength: '1000', 'aria-describedby': 'record-error' });
    note.value = s.note;
    note.addEventListener('input', () => { s.note = note.value; });
    return el('form', { class: 'stack action-form', id: 'record-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); act(); } },
      el('fieldset', { class: 'stack-tight plain-fieldset' }, el('legend', { class: 'field' }, ADMIN_TEXTS.actionLegend), radios),
      el('label', { class: 'field' }, ADMIN_TEXTS.noteLabel, note),
      el('p', { class: 'form-error', id: 'record-error', role: 'alert', hidden: !s.formError }, s.formError),
      el('button', { type: 'submit', class: 'btn btn-primary', id: 'apply-record-action', disabled: s.busy },
        s.busy ? ADMIN_TEXTS.applying : ADMIN_TEXTS.apply));
  }

  function personFacts(p) {
    return [
      el('span', { class: 'small' }, p.email || 'No email'),
      el('span', { class: 'small text-2' }, [p.suburb, `Member since ${dateOnly.format(new Date(p.created_at))}`, p.phone_verified ? 'Phone verified' : 'Phone not verified'].filter(Boolean).join(' · ')),
      el('div', { class: 'queue-top' },
        el('span', { class: `badge ${p.status === 'suspended' ? 'overdue' : 'report-type'}`, id: 'record-status' }, statusLabel(p.status)),
        p.is_admin && el('span', { class: 'badge report-type', id: 'record-admin' }, SEARCH_TEXTS.admin),
        p.is_me && el('span', { class: 'badge report-type' }, SEARCH_TEXTS.you)),
      el('section', { class: 'stack-tight', 'aria-labelledby': 'record-listings' },
        el('h3', { class: 'micro', id: 'record-listings' }, SEARCH_TEXTS.ownListings),
        (p.listings ?? []).length
          ? el('ul', { class: 'plain-list' }, p.listings.map((l) => el('li', {},
            el('a', { href: `#listing=${encodeURIComponent(l.id)}` }, l.title || 'Untitled draft'),
            el('span', { class: 'small text-2' }, ` · ${statusLabel(l.status)}`))))
          : el('p', { class: 'small text-2' }, SEARCH_TEXTS.noListings)),
    ];
  }

  function listingFacts(l) {
    return [
      el('span', { class: 'small' }, l.owner_id
        ? el('a', { href: `#person=${encodeURIComponent(l.owner_id)}` }, `Host: ${l.owner_name || 'No name yet'}`)
        : 'Host: deleted'),
      el('span', { class: 'small text-2' }, [l.suburb, `Created ${dateOnly.format(new Date(l.created_at))}`].filter(Boolean).join(' · ')),
      el('div', { class: 'queue-top' },
        el('span', { class: `badge ${l.status === 'hidden' ? 'overdue' : 'report-type'}`, id: 'record-status' }, statusLabel(l.status))),
      l.hidden_reason && el('p', { class: 'small' }, `Hidden because: ${l.hidden_reason}`),
      el('a', { class: 'btn-text', href: `listing.html?id=${encodeURIComponent(l.id)}`, target: '_blank', rel: 'noopener' }, ADMIN_TEXTS.openListing),
    ];
  }

  function recordView() {
    const back = el('a', { class: 'btn-text back-link', href: '#find' }, `‹ ${SEARCH_TEXTS.back}`);
    if (!s.record) {
      return el('section', { class: 'card stack', id: 'record' }, back,
        s.loadError ? el('p', { id: 'record-title', tabindex: '-1' }, s.loadError) : el('p', { class: 'muted' }, 'Loading…'));
    }
    const r = s.record;
    const person = s.type === 'user';
    return el('section', { class: 'card stack', id: 'record', 'aria-labelledby': 'record-title' },
      back,
      el('div', { class: 'stack-tight' },
        el('span', { class: 'micro' }, person ? 'Person' : 'Listing'),
        el('h2', { id: 'record-title', tabindex: '-1' }, person ? (r.display_name || 'No name yet') : (r.title || 'Untitled draft')),
        ...(person ? personFacts(r) : listingFacts(r))),
      s.notice && el('p', { class: 'notice', id: 'record-notice', role: 'status', tabindex: '-1' }, s.notice),
      reportsBlock(r.reports ?? []),
      logBlock(r.log ?? []),
      actionForm());
  }

  return { searchView, recordView, openRecord };
}
