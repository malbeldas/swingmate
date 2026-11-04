import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signLinkToken, verifyLinkToken } from '../../supabase/functions/_shared/link-token.js';
import { runOutcomeQuestions } from '../../supabase/functions/_shared/outcome-question-job.js';
import { runOutcomeAnswer } from '../../supabase/functions/_shared/outcome-answer-job.js';
import { OUTCOME_ANSWERS, OUTCOME_TEXTS, isOutcomeAnswer, outcomeCard } from '../../core/outcome.js';
import { EMAIL_ACTION_TEXTS, conversationPath, emailActionUrl, readEmailAction } from '../../core/email-actions.js';
import { messageGroups } from '../../core/inbox.js';
import { resendBody } from '../../supabase/functions/_shared/send.js';

const SECRET = 'test-only-secret-0123456789abcdef0123456789';
const NOW = new Date('2026-11-19T02:00:00Z');
const APP = 'https://swingmate.au';
const CONV = '00000000-0000-0000-0000-0000000033c1';

const row = {
  conversation_id: CONV, seeker_id: 's1', seeker_email: 'alex@example.com', seeker_name: 'Alex',
  host_name: 'Matt', listing_title: 'Modern room in Baldivis', failures: 0,
};

function fakeStore(rows) {
  const calls = { log: [], asked: [] };
  return { calls, async pending() { return rows; }, async log(r) { calls.log.push(r); }, async markAsked(id) { calls.asked.push(id); } };
}

test('AC-007-1 each answer in the email is a one-tap link with the signed token after the #', async () => {
  const store = fakeStore([row]);
  const sent = [];
  const out = await runOutcomeQuestions({ store, appUrl: `${APP}/`, secret: SECRET, now: NOW, send: async (m) => { sent.push(m); return { status: 'sent', providerMessageId: 'p1' }; } });
  assert.deepEqual(out, { sent: 1, failed: 0 });
  assert.equal(sent[0].to, 'alex@example.com');
  assert.equal(sent[0].template, 'NTF-005');
  assert.equal(sent[0].mail.subject, 'Did you find a place, Alex?');
  const links = sent[0].mail.text.match(/https:\/\/swingmate\.au\/email-action\.html\S+/g);
  assert.deepEqual(links.map((l) => readEmailAction(l).answer), ['found_here', 'found_elsewhere', 'not_yet']);
  for (const link of links) {
    const { token, action, ntf } = readEmailAction(link);
    assert.equal(action, 'outcome');
    assert.equal(ntf, 'NTF-005');
    assert.ok(!link.split('#')[0].includes(token), 'the token never goes in the part a server sees');
    const { claims } = await verifyLinkToken(token, SECRET, 'outcome', { now: NOW });
    assert.equal(claims.conversation_id, CONV);
    assert.equal(claims.exp, Math.floor(NOW.getTime() / 1000) + 60 * 86400, '60 days (NTF-005)');
  }
  assert.equal(resendBody(sent[0]).headers, undefined, 'NTF-005 cannot be switched off: no List-Unsubscribe');
});

test('AC-052-1 a sent question marks the conversation as asked; a failed one is tried again until the third failure', async () => {
  const store = fakeStore([row, { ...row, conversation_id: 'c2' }, { ...row, conversation_id: 'c3', failures: 2 }]);
  const out = await runOutcomeQuestions({
    store, appUrl: APP, secret: SECRET, now: NOW,
    send: async () => (store.calls.log.length === 0 ? { status: 'sent' } : { status: 'failed', error: 'provider_500' }),
  });
  assert.deepEqual(out, { sent: 1, failed: 2 });
  assert.deepEqual(store.calls.log.map((l) => [l.ref_id, l.template, l.status]),
    [[CONV, 'NTF-005', 'sent'], ['c2', 'NTF-005', 'failed'], ['c3', 'NTF-005', 'failed']]);
  assert.deepEqual(store.calls.asked, [CONV, 'c3'], 'after the third failure the question still appears in the conversation, once');
});

test('UC-052 without the signing key no question goes out', async () => {
  const store = fakeStore([row]);
  let called = false;
  const out = await runOutcomeQuestions({ store, appUrl: APP, secret: '', send: async () => { called = true; return { status: 'sent' }; } });
  assert.deepEqual(out, { sent: 0, failed: 0, error: 'no_secret' });
  assert.equal(called, false);
  assert.deepEqual(store.calls.asked, []);
});

test('AC-007-1 answering from the email saves the answer for the conversation the link names, without logging in', async () => {
  const saved = [];
  const store = { async answer(id, a) { saved.push([id, a]); return { ok: true, answer: a, conversation_id: id }; } };
  const token = await signLinkToken({ purpose: 'outcome', conversation_id: CONV }, SECRET, { now: NOW });
  assert.deepEqual(await runOutcomeAnswer({ token, answer: 'found_here', secret: SECRET, store, now: NOW }),
    { status: 200, body: { ok: true, answer: 'found_here', conversation_id: CONV } });
  assert.deepEqual(saved, [[CONV, 'found_here']]);
});

test('AC-3 a link for another conversation, forged, for another purpose or expired saves nothing', async () => {
  const saved = [];
  const store = { async answer(id, a) { saved.push([id, a]); return { ok: true }; } };
  const token = await signLinkToken({ purpose: 'outcome', conversation_id: CONV }, SECRET, { now: NOW });
  const [h, , s] = token.split('.');
  const other = `${h}.${Buffer.from(JSON.stringify({ purpose: 'outcome', conversation_id: 'other', exp: 9e9 })).toString('base64url')}.${s}`;
  assert.deepEqual(await runOutcomeAnswer({ token: other, answer: 'found_here', secret: SECRET, store, now: NOW }), { status: 400, body: { ok: false, reason: 'invalid' } });
  const calendar = await signLinkToken({ purpose: 'calendar', listing_id: 'l1' }, SECRET, { now: NOW });
  assert.equal((await runOutcomeAnswer({ token: calendar, answer: 'found_here', secret: SECRET, store, now: NOW })).status, 400);
  assert.equal((await runOutcomeAnswer({ token, answer: 'maybe', secret: SECRET, store, now: NOW })).body.reason, 'answer');
  // UC-007 E1: expired after 60 days, and the page can still open that conversation.
  assert.deepEqual(await runOutcomeAnswer({ token, answer: 'found_here', secret: SECRET, store, now: new Date('2027-01-19T02:00:00Z') }),
    { status: 410, body: { ok: false, reason: 'expired', conversation_id: CONV } });
  assert.deepEqual(saved, [], 'nothing reached the database');

  const gone = { async answer() { return { ok: false, reason: 'not_found' }; } };
  assert.deepEqual(await runOutcomeAnswer({ token, answer: 'not_yet', secret: SECRET, store: gone, now: NOW }), { status: 409, body: { ok: false, reason: 'not_found' } });
});

test('UC-007 the email link carries the answer; the page reads it and links back to the conversation', () => {
  const url = emailActionUrl(APP, 'outcome', 'a.b.c', 'NTF-005', { answer: 'found_elsewhere' });
  assert.equal(url, `${APP}/email-action.html?a=outcome&answer=found_elsewhere&src=email&ntf=NTF-005#t=a.b.c`);
  assert.deepEqual(readEmailAction(url), { action: 'outcome', answer: 'found_elsewhere', ntf: 'NTF-005', token: 'a.b.c' });
  assert.equal(conversationPath(CONV), `messages.html?c=${CONV}`);
  assert.equal(EMAIL_ACTION_TEXTS.outcomeDone, 'Thanks for telling us.');
});

test('UC-007 A1 the question in the conversation shows the three answers, the chosen one pressed', () => {
  assert.deepEqual(OUTCOME_ANSWERS.map((o) => o.label), ['Yes, through SwingMate', 'Yes, somewhere else', 'Not yet']);
  assert.ok(isOutcomeAnswer('not_yet'));
  assert.ok(!isOutcomeAnswer('maybe'));
  const fresh = outcomeCard(null);
  assert.equal(fresh.question, 'Did you find a place through SwingMate?');
  assert.deepEqual(fresh.options.map((o) => o.pressed), [false, false, false]);
  assert.equal(fresh.note, OUTCOME_TEXTS.hint);
  const answered = outcomeCard('found_elsewhere');
  assert.deepEqual(answered.options.map((o) => o.pressed), [false, true, false]);
  assert.equal(answered.note, 'Thanks. You can change your answer here any time.');
  assert.equal(outcomeCard('found_here', { error: true }).note, 'We couldn’t save your answer. Try again.');
});

test('BR-MAIL-003 the question is in the conversation for the person who searched, never for the host', () => {
  const messages = [
    { id: 'm1', sender_id: 'seeker', kind: 'inquiry', body: 'Hi', stay_from: '2026-11-20', stay_to: '2026-11-27', created_at: '2026-11-05T01:00:00Z' },
    { id: 'm2', sender_id: null, kind: 'system', body: 'Did you find a place through SwingMate?', created_at: '2026-11-19T02:00:00Z' },
  ];
  const seeker = messageGroups(messages, 'seeker', NOW, 'Australia/Perth', { role: 'seeker' }).flatMap((g) => g.messages);
  assert.deepEqual(seeker.map((m) => [m.id, Boolean(m.system)]), [['m1', false], ['m2', true]]);
  const host = messageGroups(messages, 'host', NOW, 'Australia/Perth', { role: 'host' }).flatMap((g) => g.messages);
  assert.deepEqual(host.map((m) => m.id), ['m1']);
});
