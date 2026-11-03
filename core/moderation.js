// Reports and moderation (BR-TRU-005, BR-ADM-001 to 003, UC-034, UC-040). JS twin of the checks
// on `reports` and `moderation_actions` (schema.md §5), so the admin panel and the report sheet
// refuse the same things the database does.

export const REPORT_REASONS = {
  scam: 'Scam or asking for money',
  fake: 'Fake listing or photos',
  offensive: 'Offensive or discriminatory',
  unsafe: 'Unsafe behaviour',
  spam: 'Spam',
  other: 'Other',
};
export const REPORT_TARGETS = ['listing', 'user', 'conversation'];
export const REPORT_DETAILS_MAX = 500; // BR-TRU-005
export const NOTE_MIN = 3; // moderation_actions.note
export const RESOLVE_HOURS = 24; // BR-ADM-003
export const REPORT_THANKS = 'Thanks, we’ll review this within 24 hours'; // UC-034

// BR-ADM-001: what an admin can do, by the type of object reported. Dismiss closes any report.
export const ACTIONS_BY_TARGET = {
  listing: ['hide_listing', 'warn_user', 'suspend_user', 'dismiss'],
  user: ['warn_user', 'suspend_user', 'dismiss'],
  conversation: ['read_conversation', 'warn_user', 'suspend_user', 'dismiss'],
};

export function checkReport({ targetType, reason, details } = {}) {
  const errors = [];
  if (!REPORT_TARGETS.includes(targetType)) errors.push('targetType');
  if (!Object.hasOwn(REPORT_REASONS, reason)) errors.push('reason');
  if (String(details ?? '').trim().length > REPORT_DETAILS_MAX) errors.push('details');
  return errors;
}

// AC-040-1: no action without a note. Returns the error codes.
export function checkAction({ action, targetType, note }) {
  const errors = [];
  if (!(ACTIONS_BY_TARGET[targetType] ?? []).includes(action)) errors.push('action');
  if (String(note ?? '').trim().length < NOTE_MIN) errors.push('note');
  return errors;
}

// BR-ADM-002 and AC-040-2: an admin reads a conversation only while it has an open report.
export function canReadConversation(conversationId, reports) {
  return (reports ?? []).some((r) => r.targetType === 'conversation' && r.targetId === conversationId && r.status === 'open');
}

// UC-040: the queue groups open reports of the same object (A1), oldest first, and flags the ones
// past the 24-hour target. Each report: { id, targetType, targetId, reason, status, createdAt }.
export function reportQueue(reports, now) {
  const groups = new Map();
  for (const r of reports ?? []) {
    if (r.status !== 'open') continue;
    const key = `${r.targetType}:${r.targetId}`;
    const g = groups.get(key) ?? { targetType: r.targetType, targetId: r.targetId, reportIds: [], reasons: [], oldestAt: r.createdAt };
    g.reportIds.push(r.id);
    if (!g.reasons.includes(r.reason)) g.reasons.push(r.reason);
    if (new Date(r.createdAt) < new Date(g.oldestAt)) g.oldestAt = r.createdAt;
    groups.set(key, g);
  }
  const limit = RESOLVE_HOURS * 60 * 60 * 1000;
  return [...groups.values()]
    .map((g) => ({ ...g, count: g.reportIds.length, overdue: new Date(now) - new Date(g.oldestAt) >= limit }))
    .sort((a, b) => new Date(a.oldestAt) - new Date(b.oldestAt));
}
