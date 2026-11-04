// outcome (UC-007, AC-007-1): the page an answer in the NTF-005 email opens sends the signed link
// and the answer here; if the link is ours, for the outcome question and not expired, the answer is
// saved for the conversation the link names, without logging in. A link for another purpose, a
// forged one or an expired one saves nothing (AC-3). The database is passed in, so node:test runs it
// with a fake.
import { isOutcomeAnswer } from '../../../core/outcome.js';
import { verifyLinkToken } from './link-token.js';

// store: { answer(conversationId, answer) -> { ok, answer } | { ok: false, reason } }
// Returns { status, body }. An expired link still names its conversation, so the page can open it
// (UC-007 E1).
export async function runOutcomeAnswer({ token, answer, secret, store, now = new Date() }) {
  const { claims, error } = await verifyLinkToken(token, secret, 'outcome', { now });
  if (error === 'expired') return { status: 410, body: { ok: false, reason: 'expired', conversation_id: claims?.conversation_id ?? null } };
  if (error) return { status: 400, body: { ok: false, reason: 'invalid' } };
  if (!isOutcomeAnswer(answer)) return { status: 400, body: { ok: false, reason: 'answer', conversation_id: claims.conversation_id } };
  const result = await store.answer(claims.conversation_id, answer);
  if (!result?.ok) return { status: 409, body: { ok: false, reason: result?.reason ?? 'failed' } };
  return { status: 200, body: { ok: true, answer, conversation_id: claims.conversation_id } };
}
