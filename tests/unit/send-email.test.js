import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FROM, REPLY_TO, deliver, resendBody } from '../../supabase/functions/_shared/send.js';
import { runAdminReport } from '../../supabase/functions/_shared/admin-report-job.js';
import { adminReportData } from '../../core/moderation.js';

const mail = { subject: 'S', text: 'T\n', html: '<!doctype html>' };
const APP = 'https://swingmate.au';

test('notifications.md rule 2 the sender and reply-to are fixed', () => {
  const body = resendBody({ to: 'a@example.com', mail, template: 'NTF-009' });
  assert.equal(body.from, FROM);
  assert.equal(body.reply_to, REPLY_TO);
  assert.deepEqual(body.to, ['a@example.com']);
  assert.equal(body.headers, undefined, 'NTF-009 cannot be switched off (rule 5)');
});

test('BR-MAIL-005 an email people can switch off carries List-Unsubscribe', () => {
  const body = resendBody({ to: 'a@example.com', mail, template: 'NTF-003', settingsUrl: `${APP}/account.html#notifications` });
  assert.equal(body.headers['List-Unsubscribe'], `<${APP}/account.html#notifications>`);
  assert.throws(() => resendBody({ to: 'a@example.com', mail, template: 'NTF-003' }));
});

test('INT-002 Resend answers are recorded with a code and no personal data', async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ id: 'msg_1' }) }; };
  assert.deepEqual(await deliver({ provider: 'resend', apiKey: 'k', fetchImpl: ok, to: 'a@example.com', mail, template: 'NTF-009' }),
    { status: 'sent', providerMessageId: 'msg_1', error: null });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.authorization, 'Bearer k');

  const down = async () => ({ ok: false, status: 503, json: async () => ({ message: 'a@example.com bounced' }) });
  const failed = await deliver({ provider: 'resend', apiKey: 'k', fetchImpl: down, to: 'a@example.com', mail, template: 'NTF-009' });
  assert.deepEqual(failed, { status: 'failed', providerMessageId: null, error: 'provider_503' });

  const offline = async () => { throw new Error('connect to a@example.com'); };
  assert.equal((await deliver({ provider: 'resend', apiKey: 'k', fetchImpl: offline, to: 'a@example.com', mail, template: 'NTF-009' })).error, 'network');
});

test('integrations-email.md the log provider never calls out; without a key nothing is sent', async () => {
  const never = async () => { throw new Error('should not fetch'); };
  assert.equal((await deliver({ provider: 'log', fetchImpl: never, to: 'a@example.com', mail, template: 'NTF-009' })).status, 'sent');
  assert.equal((await deliver({ provider: 'resend', apiKey: '', fetchImpl: never, to: 'a@example.com', mail, template: 'NTF-009' })).error, 'not_configured');
});

const report = { id: 'r1', target_type: 'listing', target_id: 'l1', reason: 'scam', details: 'He wants my passport, call 0412 345 678', reporter_id: 'u9' };

test('NTF-009 the email data has the reason, the object and the link, never the detail', () => {
  const data = adminReportData({ report, targetLabel: 'Modern room in Baldivis', openReports: 3, appUrl: `${APP}/` });
  assert.deepEqual(data, {
    reason: 'Scam or asking for money', targetType: 'listing', targetLabel: 'Modern room in Baldivis', openReports: 3,
    adminUrl: `${APP}/admin.html#report=r1`,
  });
  assert.equal(adminReportData({ report: { ...report, reason: 'x' }, targetLabel: null, openReports: 0, appUrl: APP }).targetLabel, 'Deleted');
});

function fakeStore({ admins, sent = [] }) {
  const logged = [];
  return {
    logged,
    report: async (id) => (id === 'r1' ? report : null),
    targetLabel: async () => 'Modern room in Baldivis',
    openReports: async () => 2,
    admins: async () => admins,
    sentTo: async () => new Set(sent),
    log: async (row) => { logged.push(row); },
  };
}

test('AC-034-2 NTF-009 AC-1 every admin gets one email per report, and it is logged', async () => {
  const store = fakeStore({ admins: [{ id: 'a1', email: 'maxi@example.com' }, { id: 'a2', email: 'tomas@example.com' }] });
  const outbox = [];
  const result = await runAdminReport({ reportId: 'r1', store, appUrl: APP, send: async (m) => { outbox.push(m); return { status: 'sent', providerMessageId: `id-${m.to}`, error: null }; } });
  assert.deepEqual(result, { sent: 2, failed: 0 });
  assert.deepEqual(outbox.map((m) => m.to), ['maxi@example.com', 'tomas@example.com']);
  assert.equal(outbox[0].mail.subject, '[SwingMate] New report: Scam or asking for money');
  assert.deepEqual(store.logged.map((r) => [r.user_id, r.template, r.ref_id, r.status]), [['a1', 'NTF-009', 'r1', 'sent'], ['a2', 'NTF-009', 'r1', 'sent']]);
});

test('NTF-009 AC-2 the email has no report detail, emails or phones', async () => {
  const store = fakeStore({ admins: [{ id: 'a1', email: 'maxi@example.com' }] });
  let sentMail;
  await runAdminReport({ reportId: 'r1', store, appUrl: APP, send: async (m) => { sentMail = m.mail; return { status: 'sent', providerMessageId: null, error: null }; } });
  const all = `${sentMail.subject}\n${sentMail.text}\n${sentMail.html}`;
  assert.doesNotMatch(all, /passport|0412|@example\.com|u9/);
});

test('notifications.md rule 7 an admin already emailed about this report is not emailed again; failures are logged', async () => {
  const store = fakeStore({ admins: [{ id: 'a1', email: 'maxi@example.com' }, { id: 'a2', email: 'tomas@example.com' }], sent: ['a1'] });
  const result = await runAdminReport({ reportId: 'r1', store, appUrl: APP, send: async () => ({ status: 'failed', providerMessageId: null, error: 'provider_503' }) });
  assert.deepEqual(result, { sent: 0, failed: 1 });
  assert.deepEqual(store.logged, [{ user_id: 'a2', template: 'NTF-009', ref_id: 'r1', status: 'failed', provider_message_id: null, error: 'provider_503' }]);
  assert.deepEqual(await runAdminReport({ reportId: 'nope', store, appUrl: APP, send: async () => assert.fail() }), { sent: 0, failed: 0, skipped: 'no_report' });
});
