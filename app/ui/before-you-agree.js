// BR-TRU-008: "Before you agree", the same fixed guide for both people, on the listing and in the
// conversation.
import { el } from './dom.js';
import { BEFORE_YOU_AGREE } from '../../core/trust.js';

export function beforeYouAgree({ open = false } = {}) {
  return el('details', { class: 'before-agree', id: 'before-you-agree', open: open || null },
    el('summary', {}, BEFORE_YOU_AGREE.title),
    el('ul', { class: 'small' }, BEFORE_YOU_AGREE.tips.map((tip) => el('li', {}, tip))));
}
