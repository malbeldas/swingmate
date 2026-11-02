// Word checks on free text (BR-MSG-008, BR-LST-005, BR-LST-006) and on sign-up emails (BR-TRU-007).
// The lists live here, in code, as the rules ask. The SQL trigger messages_before_insert marks
// risk_flag with the same risk list: tests/fixtures/text-checks.json holds the shared cases.
// These are nudges, not security: anyone can spell around a word list. The message still goes out.

export const RISK_WARNING = 'Never pay before seeing the place. Never send ID documents by chat.'; // BR-MSG-008
export const REPHRASE_RULES = 'Keep it about the home, not about who can live there'; // BR-LST-005

export const OTHER_RULES_MAX = 200; // BR-LST-005
export const CUSTOM_ITEMS_MAX = 10; // BR-LST-006
export const CUSTOM_ITEM_MAX_LENGTH = 40; // BR-LST-006

// Lower case, accents off, punctuation to spaces, so "Pay-ID" and "PayID" both read "pay id"/"payid".
export function normalize(text) {
  return ` ${String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9$]+/g, ' ')
    .trim()} `;
}

// Each entry is a phrase in normalized form, matched as whole words, or a RegExp run on the
// normalized text (words separated by single spaces, padded with one space at each end).
// BR-MSG-008: asks for money or a transfer, or for ID documents.
export const RISK_PHRASES = {
  money: [
    'bank transfer', 'transfer the money', 'transfer money', 'transfer the deposit', 'transfer the bond',
    'send money', 'send the money', 'send the deposit', 'send the bond', 'send a deposit',
    'pay the deposit', 'pay a deposit', 'pay the bond upfront', 'pay upfront', 'pay up front', 'pay in advance',
    'holding deposit', 'holding fee', 'deposit to hold', 'deposit to secure', 'secure the room', 'secure the place',
    'payid', 'pay id', 'paypal', 'western union', 'moneygram', 'wire transfer', 'wise transfer',
    'gift card', 'gift cards', 'bitcoin', 'crypto', 'usdt', 'bsb', 'account number',
    / (send|pay|transfer|wire)( me| us)?( the| a| your)? (deposit|bond|money|rent|holding fee) /,
  ],
  documents: [
    'passport', 'drivers licence', 'drivers license', 'driver licence', 'driver license', 'licence photo', 'license photo',
    'payslip', 'payslips', 'pay slip', 'pay slips', 'bank statement', 'bank statements',
    'medicare card', 'tax file number', 'tfn', 'copy of your id', 'photo of your id', 'picture of your id', 'send your id',
    'id documents', 'id document', 'proof of identity',
  ],
};

// BR-LST-005: terms that exclude people by origin, religion, age, gender or orientation.
export const DISCRIMINATION_PHRASES = {
  origin: [
    'race', 'racial', 'ethnic', 'ethnicity', 'nationality', 'nationalities', 'cultural background',
    'asian', 'asians', 'indian', 'indians', 'chinese', 'african', 'africans', 'aboriginal', 'aboriginals', 'indigenous',
    'european', 'europeans', 'caucasian', 'caucasians', 'whites only', 'white only', 'white people', 'blacks', 'black people',
    'australians only', 'australian only', 'aussies only', 'aussie only', 'locals only', 'english speakers only',
    'foreigner', 'foreigners', 'immigrant', 'immigrants', 'migrant', 'migrants', 'refugee', 'refugees', 'accent',
  ],
  religion: [
    'religion', 'religious', 'christian', 'christians', 'catholic', 'catholics', 'muslim', 'muslims', 'islam', 'islamic',
    'jew', 'jews', 'jewish', 'hindu', 'hindus', 'sikh', 'sikhs', 'buddhist', 'buddhists', 'atheist', 'atheists', 'church goer',
  ],
  age: [
    'age limit', 'age range', 'your age', 'aged', 'young people', 'young person', 'older people', 'older person', 'elderly',
    'old people', 'retiree', 'retirees', 'pensioner', 'pensioners', 'twenties', 'thirties', 'forties', 'fifties',
    'millennial', 'millennials',
    / (under|over|below|above) (?!18s? )\d{2}s? /, / \d{2} ?(yo|y o|years old|year olds|yrs old) /, / \d{2} to \d{2} (yo|years|year olds) /,
  ],
  gender: [
    'gender', 'male', 'males', 'female', 'females', 'men only', 'women only', 'man only', 'woman only',
    'guys only', 'girls only', 'ladies only', 'gents only', 'no men', 'no women', 'no guys', 'no girls', 'no ladies',
  ],
  orientation: [
    'gay', 'gays', 'lesbian', 'lesbians', 'straight only', 'heterosexual', 'homosexual', 'homosexuals', 'bisexual',
    'lgbt', 'lgbtq', 'lgbtqi', 'queer', 'transgender', 'sexual orientation', 'sexuality',
  ],
};

// Inclusive wording is not an exclusion: "LGBTQ friendly", "all nationalities welcome".
const INCLUSIVE = [/ all( [a-z0-9]+){1,6} (welcome|welcomed) /g, / [a-z0-9]+ (friendly|welcome|welcomed|welcoming) /g];

function dropInclusive(haystack) {
  let out = haystack;
  for (const re of INCLUSIVE) out = out.replace(re, ' ');
  return out;
}

function findPhrases(text, groups, { inclusiveOk = false } = {}) {
  const normalized = normalize(text);
  const haystack = inclusiveOk ? dropInclusive(normalized) : normalized;
  const hits = [];
  for (const [group, phrases] of Object.entries(groups)) {
    for (const phrase of phrases) {
      const found = phrase instanceof RegExp ? phrase.test(haystack) : haystack.includes(` ${phrase} `);
      if (found) hits.push({ group, phrase: String(phrase) });
    }
  }
  return hits;
}

// BR-MSG-008: the receiver sees RISK_WARNING above the message; the message is delivered anyway.
export function riskCheck(text) {
  const hits = findPhrases(text, RISK_PHRASES);
  return { risk: hits.length > 0, hits };
}

export function discriminationCheck(text) {
  const hits = findPhrases(text, DISCRIMINATION_PHRASES, { inclusiveOk: true });
  return { flagged: hits.length > 0, hits };
}

// BR-LST-005: "Other house rules" up to 200 characters and both checks before publishing.
// Returns the error codes; the page shows REPHRASE_RULES for 'risk' and 'discrimination'.
export function checkOtherRules(text) {
  const value = String(text ?? '').trim();
  const errors = [];
  if (value.length > OTHER_RULES_MAX) errors.push('tooLong');
  if (riskCheck(value).risk) errors.push('risk');
  if (discriminationCheck(value).flagged) errors.push('discrimination');
  return errors;
}

// BR-LST-006: up to 10 own items of up to 40 characters, shown as chips. Empty items are dropped.
// The same discrimination check runs here, since a chip is free text too.
export function checkCustomItems(items) {
  const clean = (items ?? []).map((item) => String(item ?? '').trim()).filter(Boolean);
  const errors = [];
  if (clean.length > CUSTOM_ITEMS_MAX) errors.push('tooMany');
  if (clean.some((item) => item.length > CUSTOM_ITEM_MAX_LENGTH)) errors.push('tooLong');
  if (clean.some((item) => discriminationCheck(item).flagged)) errors.push('discrimination');
  return { items: clean, errors };
}

// BR-TRU-007: disposable email domains, rejected at sign-up with email (subdomains too).
export const DISPOSABLE_EMAIL_DOMAINS = [
  '10minutemail.com', '20minutemail.com', 'burnermail.io', 'discard.email', 'dispostable.com', 'emailondeck.com',
  'fakeinbox.com', 'getnada.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'grr.la',
  'mailinator.com', 'mailnesia.com', 'maildrop.cc', 'mintemail.com', 'mohmal.com', 'mytemp.email', 'nada.email',
  'sharklasers.com', 'spamgourmet.com', 'temp-mail.org', 'tempmail.com', 'tempmail.net', 'tempr.email',
  'throwawaymail.com', 'trashmail.com', 'trashmail.de', 'yopmail.com', 'yopmail.net',
];

export function isDisposableEmail(email) {
  const at = String(email ?? '').trim().toLowerCase().lastIndexOf('@');
  if (at < 0) return false;
  const domain = String(email).trim().toLowerCase().slice(at + 1);
  return DISPOSABLE_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}
