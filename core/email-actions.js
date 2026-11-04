// Links in emails that act with one tap and no login (UC-054 AC-054-1, UC-007 AC-007-1): they open
// email-action.html, which sends the signed token to the Edge Function. The token goes after the #,
// so it never reaches a server log or a Referer header. Texts for that page.

// `answer` is the outcome question's answer (UC-007); the token says which conversation.
export function emailActionUrl(appUrl, action, token, ntf, { answer } = {}) {
  const app = String(appUrl).replace(/\/+$/, '');
  const choice = answer ? `&answer=${encodeURIComponent(answer)}` : '';
  return `${app}/email-action.html?a=${encodeURIComponent(action)}${choice}&src=email&ntf=${encodeURIComponent(ntf)}#t=${token}`;
}

// What the page reads from its own address: the action, the answer and the token.
export function readEmailAction(href) {
  const url = new URL(href);
  const token = new URLSearchParams(url.hash.slice(1)).get('t');
  return {
    action: url.searchParams.get('a'),
    answer: url.searchParams.get('answer'),
    ntf: url.searchParams.get('ntf'),
    token: token || null,
  };
}

export const conversationPath = (id) => `messages.html?c=${encodeURIComponent(id)}`;

export const EMAIL_ACTION_TEXTS = {
  working: 'One moment…',
  calendarDone: (title) => `Thanks. ${title ? `The calendar for ${title}` : 'Your calendar'} is marked as up to date.`,
  calendarNext: 'People searching by dates will see it was updated today.',
  expired: 'This link has expired.',
  expiredNext: 'Log in to confirm it in My places.',
  invalid: 'This link doesn’t work.',
  status: 'This listing is no longer on SwingMate, so there is nothing to confirm.',
  failed: 'That didn’t work. Try the link again in a minute.',
  manage: 'Open My places',
  home: 'Go to SwingMate',
  outcomeDone: 'Thanks for telling us.',
  outcomeNext: 'You can change your answer in the conversation.',
  outcomeExpiredNext: 'You can still answer in the conversation.',
  outcomeGone: 'This conversation is no longer on SwingMate.',
  conversation: 'Open the conversation',
};
