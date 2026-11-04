// The outcome question (UC-007, UC-052, BR-MAIL-003): the three answers, the same in the email
// (NTF-005) and in the conversation, and what the conversation shows. Pure.

export const OUTCOME_ANSWERS = [
  { answer: 'found_here', label: 'Yes, through SwingMate' },
  { answer: 'found_elsewhere', label: 'Yes, somewhere else' },
  { answer: 'not_yet', label: 'Not yet' },
];

export const OUTCOME_TEXTS = {
  question: 'Did you find a place through SwingMate?',
  from: 'From SwingMate',
  hint: 'One tap is enough. Only you see this question.',
  saved: 'Thanks. You can change your answer here any time.',
  failed: 'We couldn’t save your answer. Try again.',
};

export const isOutcomeAnswer = (answer) => OUTCOME_ANSWERS.some((o) => o.answer === answer);

// The card in the conversation: the question, the three answers with the chosen one pressed, and
// the line under them.
export function outcomeCard(answer, { error = false } = {}) {
  return {
    question: OUTCOME_TEXTS.question,
    options: OUTCOME_ANSWERS.map((o) => ({ ...o, pressed: o.answer === answer })),
    note: error ? OUTCOME_TEXTS.failed : (isOutcomeAnswer(answer) ? OUTCOME_TEXTS.saved : OUTCOME_TEXTS.hint),
    error,
  };
}
