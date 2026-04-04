export interface LanguageEntry {
  code: string;
  names: string[];
  fsiCategory: 1 | 2;
  fsiHours: number;
  cefrMilestones: {
    A1: number;
    A2: number;
    B1: number;
    B2: number;
    C1: number;
    C2: number;
  };
  sttLocale: string;
  ttsVoice: string;
}

export const SUPPORTED_LANGUAGES: LanguageEntry[] = [
  {
    code: 'es',
    names: ['spanish', 'espanol', 'español', 'castellano'],
    fsiCategory: 1,
    fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'es-ES',
    ttsVoice: 'es-ES',
  },
  {
    code: 'fr',
    names: ['french', 'francais', 'français'],
    fsiCategory: 1,
    fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'fr-FR',
    ttsVoice: 'fr-FR',
  },
  {
    code: 'it',
    names: ['italian', 'italiano'],
    fsiCategory: 1,
    fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'it-IT',
    ttsVoice: 'it-IT',
  },
  {
    code: 'pt',
    names: ['portuguese', 'portugues', 'português'],
    fsiCategory: 1,
    fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'pt-PT',
    ttsVoice: 'pt-PT',
  },
  {
    code: 'nl',
    names: ['dutch', 'nederlands'],
    fsiCategory: 1,
    fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'nl-NL',
    ttsVoice: 'nl-NL',
  },
  {
    code: 'nb',
    names: ['norwegian', 'norsk', 'bokmal', 'bokmål'],
    fsiCategory: 1,
    fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'nb-NO',
    ttsVoice: 'nb-NO',
  },
  {
    code: 'sv',
    names: ['swedish', 'svenska'],
    fsiCategory: 1,
    fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'sv-SE',
    ttsVoice: 'sv-SE',
  },
  {
    code: 'da',
    names: ['danish', 'dansk'],
    fsiCategory: 1,
    fsiHours: 750,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'da-DK',
    ttsVoice: 'da-DK',
  },
  {
    code: 'ro',
    names: ['romanian', 'romana', 'română'],
    fsiCategory: 1,
    fsiHours: 600,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'ro-RO',
    ttsVoice: 'ro-RO',
  },
  {
    code: 'de',
    names: ['german', 'deutsch'],
    fsiCategory: 2,
    fsiHours: 900,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'de-DE',
    ttsVoice: 'de-DE',
  },
  {
    code: 'id',
    names: ['indonesian', 'bahasa indonesia', 'bahasa'],
    fsiCategory: 2,
    fsiHours: 900,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'id-ID',
    ttsVoice: 'id-ID',
  },
  {
    code: 'ms',
    names: ['malay', 'bahasa melayu', 'melayu'],
    fsiCategory: 2,
    fsiHours: 900,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'ms-MY',
    ttsVoice: 'ms-MY',
  },
  {
    code: 'sw',
    names: ['swahili', 'kiswahili'],
    fsiCategory: 2,
    fsiHours: 900,
    cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
    sttLocale: 'sw-TZ',
    ttsVoice: 'sw-TZ',
  },
];

const STRIP_PREFIX_PATTERN =
  /^(i want to |i'd like to |let me |help me )?(learn|study|practice|speak)\s+/i;

function normalizeLanguageText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function detectLanguageHint(rawInput: string): LanguageEntry | null {
  const normalized = normalizeLanguageText(rawInput);
  const stripped = normalized.replace(STRIP_PREFIX_PATTERN, '').trim();

  for (const language of SUPPORTED_LANGUAGES) {
    for (const name of language.names) {
      const normalizedName = normalizeLanguageText(name);
      if (normalized === normalizedName || stripped === normalizedName) {
        return language;
      }
      if (
        stripped.startsWith(`${normalizedName} `) ||
        stripped.endsWith(` ${normalizedName}`)
      ) {
        return language;
      }
    }
  }

  return null;
}

export function getLanguageByCode(code: string): LanguageEntry | null {
  return SUPPORTED_LANGUAGES.find((language) => language.code === code) ?? null;
}
