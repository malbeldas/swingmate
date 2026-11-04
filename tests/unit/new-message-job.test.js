import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ATTEMPTS, newMessageData, runNewMessages } from '../../supabase/functions/_shared/new-message-job.js';
import { resendBody } from '../../supabase/functions/_shared/send.js';

const APP = 'https://swingmate.au';
const row = (over = {}) => ({
  conversation_id: 'c1', recipient_id: 'h1', recipient_email: 'host@example.com', recipient_name: 'Ida', recipient_role: 'host',
  sender_name: 'Jai', listing_title: 'Room near the beach', is_inquiry: true, stay_from: '2026-12-07', stay_to: '2026-12-14',
  roster_summary: '8:6 roster', nights: '1110111', first_at: '2026-11-04T10:00:00Z',
  message_ids: ['m1', 'm2', 'm3'], messages: ['Hi Ida, call me on 0412 000 111', 'I work 8:6', 'Parking?'], ...over,
});

test('NTF-003 a first inquiry to the host carries dates, the fit against the calendar and the roster', () => {
  const data = newMessageData(row(), `${APP}/`);
  assert.equal(data.stayLabel, '7 – 14 Dec · 7 nights');
  assert.equal(data.fitLine, '6 of 7 nights free. Taken: 10 Dec.');
  assert.equal(data.rosterSummary, '8:6 roster');
  assert.equal(data.conversationUrl, `${APP}/messages.html?c=c1&src=email&ntf=NTF-003`);
  assert.equal(data.settingsUrl, `${APP}/account.html#notifications`);
});

test('NTF-003 a follow-up has no inquiry block', () => {
  const data = newMessageData(row({ is_inquiry: false, recipient_role: 'seeker', nights: null }), APP);
  assert.deepEqual([data.isInquiry, data.stayLabel, data.fitLine, data.rosterSummary], [false, null, null, null]);
});

function fakeStore(rows, failures = 0) {
  const logged = [];
  const marked = [];
  return {
    logged, marked,
    pending: async () => rows,
    log: async (r) => { logged.push(r); },
    failures: async () => failures,
    markEmailed: async (ids) => { marked.push(...ids); },
  };
}

test('AC-050-1 one email per conversation with all its unread messages, then they are marked', async () => {
  const store = fakeStore([row()]);
  const outbox = [];
  const result = await runNewMessages({ store, appUrl: APP, send: async (m) => { outbox.push(m); return { status: 'sent', providerMessageId: 'p1', error: null }; } });
  assert.deepEqual(result, { sent: 1, failed: 0 });
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, 'host@example.com');
  assert.equal(outbox[0].mail.subject, 'Jai wants to stay at Room near the beach');
  // AC-3: the message is shown as written, contact included (BR-MSG-004); nothing else is added.
  assert.match(outbox[0].mail.text, /call me on 0412 000 111/);
  assert.doesNotMatch(outbox[0].mail.text, /host@example\.com/);
  assert.deepEqual(store.marked, ['m1', 'm2', 'm3']);
  assert.deepEqual(store.logged[0], { user_id: 'h1', template: 'NTF-003', ref_id: 'c1', status: 'sent', provider_message_id: 'p1', error: null });
});

test('BR-MAIL-005 the new message email carries List-Unsubscribe to the settings', async () => {
  let args;
  await runNewMessages({ store: fakeStore([row()]), appUrl: APP, send: async (a) => { args = a; return { status: 'sent', providerMessageId: null, error: null }; } });
  assert.equal(resendBody(args).headers['List-Unsubscribe'], `<${APP}/account.html#notifications>`);
});

test('UC-050 E1 a failed email is tried again on the next run, and given up after 3 attempts', async () => {
  const fail = async () => ({ status: 'failed', providerMessageId: null, error: 'provider_503' });
  const retry = fakeStore([row()], 1);
  assert.deepEqual(await runNewMessages({ store: retry, appUrl: APP, send: fail }), { sent: 0, failed: 1 });
  assert.deepEqual(retry.marked, [], 'still pending for the next run');
  const giveUp = fakeStore([row()], MAX_ATTEMPTS);
  await runNewMessages({ store: giveUp, appUrl: APP, send: fail });
  assert.deepEqual(giveUp.marked, ['m1', 'm2', 'm3']);
  assert.equal(giveUp.logged[0].error, 'provider_503');
});
