import { addDays, daysBetween, formatDay, formatRange, groupConsecutive, todayIn, weekdayIndex } from './dates.js';
import { conversationView } from './listing.js';
import { checkMessage, datesLine } from './messaging.js';
import {
  memberSince, publicBioText, publicCardLine, seekerActivity, trustBadges,
} from './trust.js';

// Inbox and conversation (UC-023, UC-033). Pure: the page passes what my_conversations,
// inquirer_card and the messages table returned, and draws what this module answers.
// Texts from the prototype's Messages screens (frontend-migration.md).

export const DELETED_USER = 'Deleted user'; // BR-ACC-007

export const TEXTS = {
  title: 'Messages',
  empty: 'No messages yet. When you message a host, or someone messages you about your place, it shows here.',
  searchHomes: 'Search homes',
  logIn: 'Log in to see your messages',
  choose: 'Choose a conversation',
  notFound: 'This conversation isn’t available.',
  back: 'All messages',
  write: 'Write a message',
  send: 'Send',
  tryAgain: 'Try again',
  failed: 'We couldn’t send your message. It’s still here, so you can try again.',
  cantSend: 'You can’t send messages in this conversation.',
  suspended: 'Your account is suspended, so you can’t send messages.',
  deleted: 'This person deleted their account, so you can’t reply.',
  loadFailed: 'We couldn’t load your messages. Try again.',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MINUTE = 60 * 1000;

// The time next to a conversation: "Just now", "5 min ago", "2 h ago", "Yesterday", "Mon", "3 Nov".
// Days are counted in the viewer's time zone.
export function relativeWhen(iso, now = new Date(), timeZone = 'Australia/Perth') {
  const minutes = Math.floor((new Date(now) - new Date(iso)) / MINUTE);
  const today = todayIn(timeZone, new Date(now));
  const day = todayIn(timeZone, new Date(iso));
  const days = daysBetween(day, today);
  if (days === 0) {
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    return `${Math.floor(minutes / 60)} h ago`;
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return WEEKDAYS[weekdayIndex(day)];
  return formatDay(day);
}

// The separator between days in a conversation: "Today", "Yesterday" or "3 Nov".
export function dayLabel(iso, now = new Date(), timeZone = 'Australia/Perth') {
  const days = daysBetween(todayIn(timeZone, new Date(iso)), todayIn(timeZone, new Date(now)));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return formatDay(todayIn(timeZone, new Date(iso)));
}

// "9:41 am" in the viewer's time zone.
export function timeLabel(iso, timeZone = 'Australia/Perth') {
  return new Intl.DateTimeFormat('en-AU', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(iso)).replace(/\s/g, ' ').toLowerCase();
}

// One row of my_conversations as the list shows it.
export function listItem(row, now = new Date(), timeZone = 'Australia/Perth') {
  const name = row.other_name ?? DELETED_USER;
  return {
    id: row.id,
    name,
    initial: name.trim().charAt(0).toUpperCase(),
    title: row.listing_title,
    when: relativeWhen(row.last_message_at, now, timeZone),
    dates: formatRange(row.stay_from, row.stay_to),
    preview: row.last_body ? `${row.last_from_me ? 'You: ' : ''}${row.last_body}` : '',
    unread: Boolean(row.unread),
  };
}

// The head of an open conversation and whether the person can write in it.
// BR-MSG-005: a listing no longer active keeps the conversation open with its status, except one
// hidden by an admin, which closes it for the person who searched. UC-023 E1: a deleted account
// cannot be answered.
export function conversationHead(row) {
  const view = conversationView(row.listing_status, { role: row.role });
  const deleted = row.other_name == null;
  let closedText = null;
  if (!view.open) closedText = view.banner;
  else if (deleted) closedText = TEXTS.deleted;
  return {
    heading: `${row.other_name ?? DELETED_USER} · ${row.listing_title}`,
    banner: view.banner,
    requested: `Requested dates: ${datesLine({ checkIn: row.stay_from, checkOut: row.stay_to })}`,
    canWrite: closedText == null,
    closedText,
  };
}

// AC-023-2: the requested nights against the listing's calendar today. `nights` is the '1'/'0'
// string of inquirer_card from the move-in night.
export function requestedFit(nights, stayFrom) {
  const total = String(nights ?? '').length;
  if (!total) return null;
  const taken = [...nights].map((c, i) => (c === '1' ? null : addDays(stayFrom, i))).filter(Boolean);
  if (!taken.length) return { tone: 'good', text: `Your place is free for all ${total} ${total === 1 ? 'night' : 'nights'}.` };
  const runs = groupConsecutive(taken).map((run) => formatRange(run[0], run[run.length - 1]));
  return {
    tone: 'warn',
    text: `${total - taken.length} of ${total} nights free. Taken: ${runs.join(', ')}.`,
  };
}

// BR-TRU-001 and AC-023-1: the "About {name}" card for the host. Only public facts.
export function inquirerView(card, now = new Date()) {
  if (!card) return null;
  const roster = card.roster_pattern ? { daysOn: card.roster_pattern.days_on, daysOff: card.roster_pattern.days_off } : null;
  return {
    name: card.display_name,
    line: publicCardLine({
      workType: card.work_type, baseSuburb: card.base_suburb, roster, phoneVerified: card.phone_verified,
    }),
    badges: trustBadges({ emailVerified: card.email_verified, phoneVerified: card.phone_verified, hasPhoto: Boolean(card.photo_path) }),
    since: memberSince(card.created_at),
    activity: seekerActivity({ createdAt: card.created_at, hostsThisMonth: card.hosts_this_month, now }),
    bio: publicBioText(card.bio),
    fit: requestedFit(card.nights, card.stay_from),
  };
}

// Messages grouped by day, oldest first, each marked mine or theirs. An inquiry shows its dates.
export function messageGroups(messages, myId, now = new Date(), timeZone = 'Australia/Perth') {
  const groups = [];
  for (const m of [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const label = dayLabel(m.created_at, now, timeZone);
    if (groups[groups.length - 1]?.label !== label) groups.push({ label, messages: [] });
    groups[groups.length - 1].messages.push({
      id: m.id,
      mine: m.sender_id === myId,
      body: m.body,
      time: timeLabel(m.created_at, timeZone),
      dates: m.kind === 'inquiry' && m.stay_from ? datesLine({ checkIn: m.stay_from, checkOut: m.stay_to }) : null,
    });
  }
  return groups;
}

// Adds a message once, whether it came back from the insert or from Realtime.
export function addMessage(messages, message) {
  return messages.some((m) => m.id === message.id) ? messages : [...messages, message];
}

// What the database said when a reply was refused: the trigger raises 'blocked' or 'suspended'
// (BR-MSG-006); anything else keeps the text with "Try again" (UC-033 E2).
export function replyErrorText(error) {
  const message = String(error?.message ?? '');
  if (/\bsuspended\b/.test(message)) return TEXTS.suspended;
  if (/\bblocked\b/.test(message)) return TEXTS.cantSend; // never says it was a block
  return TEXTS.failed;
}

export function replyIssue(text) {
  return checkMessage(text);
}
