// Report and block sheets (UC-034, BR-TRU-005). The report goes straight to the reports table (P-21);
// the person who reports never reads it back (P-22). Blocking goes through set_conversation_block,
// so the page never needs the other person's id. Native <dialog> with showModal keeps the focus in.
import { getClient } from '../db.js';
import { el } from './dom.js';
import { REPORT_DETAILS_MAX, REPORT_REASONS, REPORT_TEXTS, reportErrorText, reportIssue } from '../../core/moderation.js';

let dialog;

function build() {
  dialog = el('dialog', { class: 'sheet', 'aria-labelledby': 'report-title', id: 'report-sheet' },
    el('div', { class: 'sheet-head' },
      el('span', { class: 'sheet-step micro' }, REPORT_TEXTS.report),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => dialog.close() }, '×')),
    el('div', { class: 'sheet-body stack' }));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
}

function show(step, ...children) {
  if (!dialog) build();
  dialog.querySelector('.sheet-step').textContent = step;
  dialog.querySelector('.sheet-body').replaceChildren(...children);
  if (!dialog.open) dialog.showModal();
}

async function setBlock(conversationId, blocked) {
  const db = await getClient();
  const { data, error } = await db.rpc('set_conversation_block', { p_conversation_id: conversationId, p_blocked: blocked });
  return { ok: !error && data === blocked };
}

function thanks(onDone) {
  const close = el('button', { type: 'button', class: 'btn btn-primary', onclick: () => dialog.close() }, REPORT_TEXTS.close);
  show(REPORT_TEXTS.report,
    el('h2', { id: 'report-title', tabindex: '-1' }, REPORT_TEXTS.thanks),
    close);
  dialog.addEventListener('close', () => onDone?.(), { once: true });
  close.focus();
}

// targetType: 'listing' | 'user' | 'conversation'. For a conversation, blockName offers "Also block
// {name}" in the same step (UC-034 step 3). onDone({ blocked }) runs when the sheet closes after sending.
export function openReportSheet({ targetType, targetId, blockName = null, onDone = () => {} }) {
  const reasons = Object.entries(REPORT_REASONS).map(([value, label]) => el('label', { class: 'check' },
    el('input', { type: 'radio', name: 'reason', value }), el('span', {}, label)));
  const details = el('textarea', { name: 'details', rows: '3', maxlength: String(REPORT_DETAILS_MAX) });
  const alsoBlock = blockName && el('input', { type: 'checkbox', name: 'block' });
  const error = el('p', { class: 'form-error', id: 'report-error', role: 'alert', hidden: true });
  const submit = el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, REPORT_TEXTS.send);

  async function send(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const report = { targetType, reason: form.reason.value, details: details.value };
    const issue = reportIssue(report);
    if (issue) {
      error.textContent = issue;
      error.hidden = false;
      return;
    }
    submit.disabled = true;
    submit.textContent = REPORT_TEXTS.sending;
    const db = await getClient();
    const { error: dbError } = await db.from('reports')
      .insert({ target_type: targetType, target_id: targetId, reason: report.reason, details: details.value.trim() || null });
    let blocked = false;
    if (!dbError && alsoBlock?.checked) blocked = (await setBlock(targetId, true)).ok;
    if (dbError) {
      error.textContent = reportErrorText(dbError);
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = REPORT_TEXTS.send;
      return;
    }
    thanks(() => onDone({ blocked }));
  }

  show(REPORT_TEXTS.report,
    el('form', { class: 'stack', novalidate: true, onsubmit: send },
      el('h2', { id: 'report-title' }, REPORT_TEXTS.heading[targetType]),
      el('fieldset', { class: 'stack-tight plain-fieldset' }, el('legend', { class: 'field' }, REPORT_TEXTS.reasonLegend), reasons),
      el('label', { class: 'field' }, REPORT_TEXTS.detailsLabel, details),
      alsoBlock && el('label', { class: 'check' }, alsoBlock, el('span', {}, REPORT_TEXTS.alsoBlock(blockName))),
      error,
      submit));
  dialog.querySelector('input[name="reason"]').focus();
}

// UC-034 A1: block without reporting, after a confirmation. onDone(true) once blocked.
export function openBlockSheet({ conversationId, name, onDone = () => {} }) {
  const error = el('p', { class: 'form-error', role: 'alert', hidden: true });
  const confirm = el('button', { type: 'button', class: 'btn btn-danger btn-block', id: 'confirm-block' }, REPORT_TEXTS.block);
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    const { ok } = await setBlock(conversationId, true);
    if (!ok) {
      error.textContent = REPORT_TEXTS.blockFailed;
      error.hidden = false;
      confirm.disabled = false;
      return;
    }
    dialog.close();
    onDone(true);
  });
  show(REPORT_TEXTS.block,
    el('h2', { id: 'report-title' }, REPORT_TEXTS.blockHeading(name)),
    el('p', {}, REPORT_TEXTS.blockBody),
    error,
    confirm,
    el('button', { type: 'button', class: 'btn-text', onclick: () => dialog.close() }, REPORT_TEXTS.cancel));
  confirm.focus();
}

export { setBlock as setConversationBlock };
