import type { ConversationLanguage } from '@eduagent/schemas';

const MIN_SUBSTANTIVE_WORDS = 4;
const MIN_SUBSTANTIVE_CHARS = 18;

const LOCALE_NON_ANSWERS: Record<ConversationLanguage | 'default', string[]> = {
  default: [
    'idk',
    "i don't know",
    'i dont know',
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
    'i dont know',
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

export function isSubstantiveCalibrationAnswer(
  text: string,
  conversationLanguage?: ConversationLanguage
): boolean {
  const normalized = normalizeAnswer(text);
  if (!normalized) return false;

  const localeTokens = [
    ...LOCALE_NON_ANSWERS.default,
    ...(conversationLanguage ? LOCALE_NON_ANSWERS[conversationLanguage] : []),
  ].map(normalizeAnswer);

  if (localeTokens.includes(normalized)) return false;

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < MIN_SUBSTANTIVE_WORDS) return false;

  return normalized.replace(/\s/g, '').length >= MIN_SUBSTANTIVE_CHARS;
}
