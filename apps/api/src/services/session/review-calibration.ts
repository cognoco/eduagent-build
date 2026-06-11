import type { ConversationLanguage } from '@eduagent/schemas';

const MIN_SUBSTANTIVE_WORDS = 4;
const MIN_SUBSTANTIVE_CHARS = 18;

const LOCALE_NON_ANSWERS: Record<ConversationLanguage | 'default', string[]> = {
  default: [
    'idk',
    "i don't know",
    "i don't remember",
    'i dont know',
    'i dont remember',
    'dunno',
    'no idea',
    'not sure',
    'nothing',
    'no',
    'nah',
    'maybe',
    '?',
  ],
  en: [
    'idk',
    "i don't know",
    "i don't remember",
    'i dont know',
    'i dont remember',
    'dunno',
    'no idea',
    'not sure',
    'nothing',
    'no',
    'nah',
  ],
  cs: ['nevim', 'nevím', 'netusim', 'netuším', 'ne', 'nic'],
  es: ['no se', 'no sé', 'ni idea', 'no recuerdo', 'nada', 'no'],
  fr: ['je ne sais pas', 'je sais pas', 'aucune idee', 'aucune idée', 'non'],
  de: [
    'ich weiss nicht',
    'ich weiß nicht',
    'keine ahnung',
    'nicht sicher',
    'nein',
  ],
  it: ['non lo so', 'non so', 'boh', 'nessuna idea', 'no'],
  pt: ['nao sei', 'não sei', 'sem ideia', 'nao lembro', 'não lembro', 'no'],
  pl: ['nie wiem', 'nie pamietam', 'nie pamiętam', 'brak pomyslu', 'nie'],
  ja: [
    'わからない',
    '分からない',
    'わかりません',
    '知らない',
    'しらない',
    'いいえ',
  ],
  nb: ['vet ikke', 'jeg vet ikke', 'aner ikke', 'husker ikke', 'nei'],
};

function normalizeAnswer(text: string): string {
  return text
    .trim()
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s?']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasCjkText(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
}

function matchesNonAnswerPhrase(normalized: string, token: string): boolean {
  if (token.length <= 2) return normalized === token;
  if (normalized === token) return true;
  // CJK scripts have no word separators — substring matching is correct and
  // safe because CJK non-answer tokens are distinct phrases (e.g. わかりません)
  // that would only appear embedded in a longer response in a meaningful
  // context (e.g. わかりませんでした already IS a non-answer admission).
  // Decide per TOKEN script, not per answer: a mixed-script answer (Latin
  // words + a CJK term) must keep word-boundary checks for Latin tokens.
  if (hasCjkText(token)) return normalized.includes(token);
  // Latin/Cyrillic/etc.: whole-word/phrase guard. The token must be flanked by
  // string boundaries or whitespace so short tokens like 'nah' don't match
  // inside words like 'nahe', and 'nada' doesn't match inside 'granada'.
  // `?` is also a boundary: normalizeAnswer retains it (the standalone '?'
  // token must stay matchable), so ?-suffixed non-answers like 'idk?' would
  // otherwise slip past the whitespace-only boundary check.
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\s?])${escaped}(?:[\\s?]|$)`).test(normalized);
}

export function isSubstantiveCalibrationAnswer(
  text: string,
  conversationLanguage?: ConversationLanguage,
): boolean {
  const normalized = normalizeAnswer(text);
  if (!normalized) return false;

  const localeTokens = [
    ...LOCALE_NON_ANSWERS.default,
    ...(conversationLanguage ? LOCALE_NON_ANSWERS[conversationLanguage] : []),
  ].map(normalizeAnswer);

  if (localeTokens.some((token) => matchesNonAnswerPhrase(normalized, token))) {
    return false;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (!hasCjkText(normalized) && words.length < MIN_SUBSTANTIVE_WORDS) {
    return false;
  }

  return normalized.replace(/\s/g, '').length >= MIN_SUBSTANTIVE_CHARS;
}
