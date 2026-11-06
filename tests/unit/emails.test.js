import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, safeUrl, UNSUBSCRIBABLE } from '../../supabase/functions/_shared/emails/layout.js';
import { newMessageEmail, MAX_MESSAGE_LENGTH } from '../../supabase/functions/_shared/emails/new-message.js';
import { hostReminderEmail } from '../../supabase/functions/_shared/emails/host-reminder.js';
import { outcomeQuestionEmail } from '../../supabase/functions/_shared/emails/outcome-question.js';
import { calendarCheckEmail, nextFreeLine } from '../../supabase/functions/_shared/emails/calendar-check.js';
import { alertDigestEmail } from '../../supabase/functions/_shared/emails/alert-digest.js';
import { adminReportEmail } from '../../supabase/functions/_shared/emails/admin-report.js';

const APP = 'https://swingmate.au';
const settingsUrl = `${APP}/account.html#notifications`;

const inquiry = {
  recipientName: 'Matt',
  senderName: 'Alex',
  listingTitle: 'Modern room in Baldivis',
  isInquiry: true,
  stayLabel: '12 – 19 Oct (7 nights)',
  fitLine: 'Your room is free all 7 nights',
  rosterSummary: 'FIFO 14:7',
  messages: ['Hi Matt, is the room free for my next R&R?'],
  conversationUrl: `${APP}/messages.html?c=abc&src=email&ntf=NTF-003`,
  settingsUrl,
};

function assertShape(mail) {
  assert.equal(typeof mail.subject, 'string');
  assert.ok(mail.text.endsWith('\n'));
  assert.match(mail.html, /^<!doctype html>/);
  assert.match(mail.html, /max-width:600px/, 'one 600 px column (rule 8)');
  assert.doesNotMatch(mail.html, /<img(?![^>]*alt=)/, 'every image has alt text');
}

test('NTF-003 first inquiry: subject, dates, fit, roster and the reply link', () => {
  const mail = newMessageEmail(inquiry);
  assertShape(mail);
  assert.equal(mail.subject, 'Alex wants to stay at Modern room in Baldivis');
  assert.match(mail.text, /^Hi Matt,\n\nAlex sent you a message about Modern room in Baldivis\.\n\nDates: 12 – 19 Oct \(7 nights\)\nYour room is free all 7 nights\nRoster: FIFO 14:7\n/);
  assert.match(mail.text, /Reply on SwingMate: https:\/\/swingmate\.au\/messages\.html\?c=abc&src=email&ntf=NTF-003/);
  assert.match(mail.text, /Replying to this email won't reach Alex\./);
  assert.match(mail.text, /Manage email settings: https:\/\/swingmate\.au\/account\.html#notifications\nThe SwingMate team\n$/);
});

test('NTF-003 later messages: plain subject and no inquiry block', () => {
  const mail = newMessageEmail({ ...inquiry, isInquiry: false, messages: ['Sure, Saturday works'] });
  assert.equal(mail.subject, 'New message from Alex');
  assert.doesNotMatch(mail.text, /Dates:|Roster:/);
  assert.doesNotMatch(mail.html, /Dates:/);
});

test('AC-050-1 one email carries up to 3 messages, each cut to 300 characters', () => {
  const long = 'a'.repeat(400);
  const mail = newMessageEmail({ ...inquiry, isInquiry: false, messages: [long, 'two', 'three', 'four', 'five'] });
  const quoted = mail.text.match(/^".*"$/gm);
  assert.equal(quoted.length, 3);
  assert.equal(quoted[0].length, MAX_MESSAGE_LENGTH + 2);
  assert.match(quoted[0], /…"$/);
  assert.match(mail.text, /\+ 2 more messages/);
});

test('NTF-003 AC-3 the message text is shown as written but never as HTML', () => {
  const mail = newMessageEmail({ ...inquiry, senderName: 'Al<b>ex', messages: ['<script>alert(1)</script> call me on 0400 000 000'] });
  assert.doesNotMatch(mail.html, /<script>|<b>ex/);
  assert.match(mail.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; call me on 0400 000 000/);
});

test('AC-051-1 NTF-004 host reminder text and links', () => {
  const mail = hostReminderEmail({
    hostName: 'Matt', seekerName: 'Alex', listingTitle: 'Modern room in Baldivis', stayLabel: '12 – 19 Oct',
    conversationUrl: `${APP}/messages.html?c=abc&src=email&ntf=NTF-004`, pauseUrl: `${APP}/account.html#listings`, settingsUrl,
  });
  assertShape(mail);
  assert.equal(mail.subject, 'Alex is still waiting for your reply');
  assert.match(mail.text, /Alex asked about Modern room in Baldivis for 12 – 19 Oct two days ago\./);
  assert.match(mail.text, /Mark your listing as filled: https:\/\/swingmate\.au\/account\.html#listings/);
  assert.match(mail.html, />Reply</);
  assert.match(mail.html, />Mark as filled</);
});

test('AC-007-1 NTF-005 three one-tap answers with their own links and no settings link', () => {
  const mail = outcomeQuestionEmail({
    seekerName: 'Alex', listingTitle: 'Modern room in Baldivis', hostName: 'Matt',
    answerUrl: (a) => `${APP}/email-action.html?a=outcome&answer=${a}#t=TOKEN`,
  });
  assertShape(mail);
  assert.equal(mail.subject, 'Did you find a place, Alex?');
  for (const a of ['found_here', 'found_elsewhere', 'not_yet']) assert.ok(mail.html.includes(`a=outcome&amp;answer=${a}#t=TOKEN`), a);
  assert.match(mail.text, /Yes, through SwingMate: .*answer=found_here#t=TOKEN\nYes, somewhere else: .*answer=found_elsewhere#t=TOKEN\nNot yet: .*answer=not_yet#t=TOKEN/);
  assert.doesNotMatch(mail.text, /Manage email settings/);
});

test('AC-054-1 NTF-006 calendar check shows what the listing has free and both buttons', () => {
  const availability = '0011111111111100000000000000' + '1'.repeat(56);
  const mail = calendarCheckEmail({
    hostName: 'Priya', listingTitle: 'Room with pool in Scarborough', availability, start: '2026-11-01',
    confirmUrl: `${APP}/functions/v1/calendar-confirm?t=TOKEN`, editUrl: `${APP}/account.html#listings`, settingsUrl,
  });
  assertShape(mail);
  assert.equal(mail.subject, 'Is your calendar for Room with pool in Scarborough still right?');
  assert.equal(mail.nextFree, 'Free from 3 Nov, 12 nights in the next 4 weeks');
  assert.match(mail.text, /Right now Room with pool in Scarborough shows: Free from 3 Nov, 12 nights in the next 4 weeks\./);
  assert.equal((mail.html.match(/<td title=/g) ?? []).length, 28, 'four weeks drawn as a table');
  assert.equal(nextFreeLine('0'.repeat(84), '2026-11-01'), 'No free nights in the next 4 weeks');
  assert.equal(nextFreeLine('1' + '0'.repeat(83), '2026-11-01'), 'Free from 1 Nov, 1 night in the next 4 weeks');
});

const homes = Array.from({ length: 7 }, (_, i) => ({
  title: `Home ${i + 1}`, suburb: 'Rockingham', price: 300 + i, fitLabel: 'Great roster fit',
  fitLine: 'Free for all 32 nights you need in the next 12 weeks', url: `${APP}/listing.html?id=${i}&src=email&ntf=NTF-007`,
  photoUrl: `${APP}/storage/v1/object/public/listing-photos/${i}.jpg`,
}));

test('AC-006-1 NTF-007 one email lists every new home; the HTML shows 5 and links to the rest', () => {
  const mail = alertDigestEmail({ name: 'Alex', items: homes, alertLabel: 'Rockingham + 15 km · your 14:7 roster', manageUrl: `${APP}/account.html#alerts`, seeAllUrl: `${APP}/search.html?alert=1` });
  assertShape(mail);
  assert.equal(mail.subject, '7 homes that fit your roster');
  assert.equal((mail.text.match(/^Home \d, Rockingham · \$\d+\/week · Great roster fit$/gm) ?? []).length, 7);
  assert.equal((mail.html.match(/<img /g) ?? []).length, 5);
  assert.match(mail.html, /See all 7 homes/);
  const one = alertDigestEmail({ name: 'Alex', items: homes.slice(0, 1), alertLabel: 'Rockingham', manageUrl: `${APP}/account.html#alerts` });
  assert.equal(one.subject, 'A home that fits: Home 1');
  assert.doesNotMatch(one.html, /See all/);
  assert.throws(() => alertDigestEmail({ name: 'Alex', items: [], alertLabel: 'x', manageUrl: APP }), RangeError);
});

test('NTF-009 AC-2 the admin email has no report text and no contact details to leak', () => {
  const mail = adminReportEmail({ reason: 'Scam or asking for money', targetType: 'listing', targetLabel: 'Modern room in Baldivis', openReports: 3, adminUrl: `${APP}/admin.html#report=r1` });
  assertShape(mail);
  assert.equal(mail.subject, '[SwingMate] New report: Scam or asking for money');
  assert.equal(mail.text, 'New report about a listing: Modern room in Baldivis\nReason: Scam or asking for money\nOpen reports: 3\n\nReview it: https://swingmate.au/admin.html#report=r1\n');
  assert.doesNotMatch(mail.html + mail.text, /@|\+61|04\d{2}/);
});

test('BR-MAIL-005 only product emails carry the unsubscribe link', () => {
  assert.deepEqual(UNSUBSCRIBABLE, ['NTF-003', 'NTF-004', 'NTF-006', 'NTF-007']);
});

test('notifications.md rule 3: emails escape every value and only link to http(s)', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(safeUrl('javascript:alert(1)'), '#');
  assert.equal(safeUrl('https://swingmate.au/?a=1&b=2'), 'https://swingmate.au/?a=1&amp;b=2');
});
