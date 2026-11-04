import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signLinkToken, verifyLinkToken } from '../../supabase/functions/_shared/link-token.js';
import { hostReminderData, runHostReminders } from '../../supabase/functions/_shared/host-reminder-job.js';
import { runCalendarChecks } from '../../supabase/functions/_shared/calendar-check-job.js';
import { runCalendarConfirm } from '../../supabase/functions/_shared/calendar-confirm-job.js';
import { EMAIL_ACTION_TEXTS, emailActionUrl, readEmailAction } from '../../core/email-actions.js';

const SECRET = 'test-only-secret-0123456789abcdef0123456789';
const NOW = new Date('2026-11-05T00:00:00Z');
const APP = 'https://swingmate.au';
const LISTING = '00000000-0000-0000-0000-0000000032b1';

test('SEC-26 a signed link works only with our key, for its purpose and until it expires', async () => {
  const token = await signLinkToken({ purpose: 'calendar', listing_id: LISTING }, SECRET, { days: 60, now: NOW });
  assert.equal(token.split('.').length, 3, 'a JWT');
  const ok = await verifyLinkToken(token, SECRET, 'calendar', { now: NOW });
  assert.equal(ok.claims.listing_id, LISTING);
  assert.equal(ok.claims.exp, Math.floor(NOW.getTime() / 1000) + 60 * 86400, '60 days (notifications-calendar-check.md)');
  assert.deepEqual(await verifyLinkToken(token, `${SECRET}x`, 'calendar', { now: NOW }), { error: 'invalid' });
  assert.deepEqual(await verifyLinkToken(token, SECRET, 'outcome', { now: NOW }), { error: 'purpose' });
  const old = await verifyLinkToken(token, SECRET, 'calendar', { now: new Date('2027-01-05T00:00:00Z') });
  assert.equal(old.error, 'expired');
  assert.equal(old.claims.listing_id, LISTING, 'an expired link still says what it was for, to send the person there');
  const [h, , s] = token.split('.');
  const forged = `${h}.${Buffer.from(JSON.stringify({ purpose: 'calendar', listing_id: 'other', exp: 9e9 })).toString('base64url')}.${s}`;
  assert.deepEqual(await verifyLinkToken(forged, SECRET, 'calendar', { now: NOW }), { error: 'invalid' });
  assert.deepEqual(await verifyLinkToken('nope', SECRET, 'calendar', { now: NOW }), { error: 'invalid' });
  await assert.rejects(signLinkToken({ purpose: 'calendar' }, 'short'), RangeError);
});

test('AC-054-1 the email link carries the token after the #, never to a server', () => {
  const url = emailActionUrl(`${APP}/`, 'calendar', 'a.b.c', 'NTF-006');
  assert.equal(url, `${APP}/email-action.html?a=calendar&src=email&ntf=NTF-006#t=a.b.c`);
  assert.deepEqual(readEmailAction(url), { action: 'calendar', answer: null, ntf: 'NTF-006', token: 'a.b.c' });
  assert.deepEqual(readEmailAction(`${APP}/email-action.html?a=calendar`), { action: 'calendar', answer: null, ntf: null, token: null });
  assert.equal(EMAIL_ACTION_TEXTS.calendarDone('Room near the port'), 'Thanks. The calendar for Room near the port is marked as up to date.');
});

const reminderRow = {
  conversation_id: 'c1', host_id: 'h1', host_email: 'host@example.com', host_name: 'Matt', seeker_name: 'Alex',
  listing_id: LISTING, listing_title: 'Modern room in Baldivis', stay_from: '2026-10-12', stay_to: '2026-10-19',
};

test('NTF-004 the reminder names the person, the home, the stay and links to the conversation', () => {
  assert.deepEqual(hostReminderData(reminderRow, `${APP}/`), {
    hostName: 'Matt', seekerName: 'Alex', listingTitle: 'Modern room in Baldivis', stayLabel: '12 – 19 Oct',
    conversationUrl: `${APP}/messages.html?c=c1&src=email&ntf=NTF-004`, pauseUrl: `${APP}/account.html#listings`,
    settingsUrl: `${APP}/account.html#notifications`,
  });
});

function fakeStore(rows, extra = {}) {
  const calls = { log: [], reminded: [] };
  return { calls, async pending() { return rows; }, async log(row) { calls.log.push(row); }, async markReminded(id) { calls.reminded.push(id); }, ...extra };
}

test('AC-051-1 a sent reminder is marked, so the conversation is never reminded again; a failed one is tried next run', async () => {
  const store = fakeStore([reminderRow, { ...reminderRow, conversation_id: 'c2' }]);
  const sent = [];
  const out = await runHostReminders({
    store, appUrl: APP,
    send: async (m) => { sent.push(m); return sent.length === 1 ? { status: 'sent', providerMessageId: 'p1' } : { status: 'failed', error: 'provider_down' }; },
  });
  assert.deepEqual(out, { sent: 1, failed: 1 });
  assert.equal(sent[0].mail.subject, 'Alex is still waiting for your reply');
  assert.equal(sent[0].to, 'host@example.com');
  assert.deepEqual(store.calls.reminded, ['c1']);
  assert.deepEqual(store.calls.log.map((l) => [l.ref_id, l.template, l.status]), [['c1', 'NTF-004', 'sent'], ['c2', 'NTF-004', 'failed']]);
});

const checkRow = {
  listing_id: LISTING, host_id: 'h1', host_email: 'host@example.com', host_name: 'Priya', listing_title: 'Room with pool in Scarborough',
  start: '2026-11-05', availability: '1'.repeat(12) + '0'.repeat(16),
};

test('UC-054 the calendar check carries a signed "up to date" link for its listing', async () => {
  const store = fakeStore([checkRow]);
  const sent = [];
  const out = await runCalendarChecks({ store, appUrl: APP, secret: SECRET, now: NOW, send: async (m) => { sent.push(m); return { status: 'sent' }; } });
  assert.deepEqual(out, { sent: 1, failed: 0 });
  assert.equal(sent[0].mail.subject, 'Is your calendar for Room with pool in Scarborough still right?');
  const link = sent[0].mail.text.match(/https:\/\/swingmate\.au\/email-action\.html\S+/)[0];
  const { token } = readEmailAction(link);
  const { claims } = await verifyLinkToken(token, SECRET, 'calendar', { now: NOW });
  assert.equal(claims.listing_id, LISTING);
  assert.deepEqual(store.calls.log.map((l) => [l.ref_id, l.template]), [[LISTING, 'NTF-006']]);
});

test('UC-054 without the signing key no calendar email goes out', async () => {
  let called = false;
  const out = await runCalendarChecks({ store: fakeStore([checkRow]), appUrl: APP, secret: '', send: async () => { called = true; return { status: 'sent' }; } });
  assert.deepEqual(out, { sent: 0, failed: 0, error: 'no_secret' });
  assert.equal(called, false);
});

test('AC-054-1 confirming from the email marks the calendar without logging in; a bad or old link does nothing', async () => {
  const confirmed = [];
  const store = { async confirm(id) { confirmed.push(id); return { ok: true, title: 'Room near the port' }; } };
  const token = await signLinkToken({ purpose: 'calendar', listing_id: LISTING }, SECRET, { now: NOW });
  assert.deepEqual(await runCalendarConfirm({ token, secret: SECRET, store, now: NOW }),
    { status: 200, body: { ok: true, title: 'Room near the port', listing_id: LISTING } });
  assert.deepEqual(confirmed, [LISTING]);

  assert.deepEqual(await runCalendarConfirm({ token, secret: SECRET, store, now: new Date('2027-02-01T00:00:00Z') }),
    { status: 410, body: { ok: false, reason: 'expired' } });
  const outcome = await signLinkToken({ purpose: 'outcome', conversation_id: 'c1' }, SECRET, { now: NOW });
  assert.equal((await runCalendarConfirm({ token: outcome, secret: SECRET, store, now: NOW })).status, 400);
  assert.equal((await runCalendarConfirm({ token: 'x.y.z', secret: SECRET, store, now: NOW })).status, 400);
  assert.equal(confirmed.length, 1, 'only the good link touched the database');

  const gone = { async confirm() { return { ok: false, reason: 'status' }; } };
  assert.deepEqual(await runCalendarConfirm({ token, secret: SECRET, store: gone, now: NOW }), { status: 409, body: { ok: false, reason: 'status' } });
});
