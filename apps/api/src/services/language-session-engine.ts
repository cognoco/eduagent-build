import type { CefrLevel, InputMode } from '@eduagent/schemas';

import { SUPPORTED_LANGUAGES } from '../data/languages';

export const LANGUAGE_STRANDS = [
  'meaning_input',
  'meaning_output',
  'language_focus',
  'fluency',
] as const;

export type LanguageStrand = (typeof LANGUAGE_STRANDS)[number];

export type LanguageActivityType =
  | 'graded_input'
  | 'free_response'
  | 'correction_retry'
  | 'timed_drill';

export type LanguageActivityModality = 'text' | 'voice' | 'listening';

export type LanguageGradedInputModality = 'reading' | 'listening';

export interface LanguageComprehensionQuestion {
  id: string;
  prompt: string;
  answerHint: string;
}

export interface LanguageGradedInputArtifact {
  type: 'graded_input';
  modality: LanguageGradedInputModality;
  cefrLevel: CefrLevel;
  knownWordRatioTarget: number;
  knownWordEstimate: number;
  targetWords: string[];
  text: string;
  comprehensionQuestions: LanguageComprehensionQuestion[];
  audioEnabled: boolean;
}

export interface LanguageStrandCounts {
  meaning_input: number;
  meaning_output: number;
  language_focus: number;
  fluency: number;
}

export interface LanguageActivityTelemetry {
  strand: LanguageStrand;
  activityType: LanguageActivityType;
  modality: LanguageActivityModality;
  targetWords: string[];
  targetGrammar: string[];
  gradedInput?: LanguageGradedInputArtifact;
}

export interface LanguageSessionState {
  activeStrand: LanguageStrand;
  sessionStrandCounts: LanguageStrandCounts;
  nextActivity: LanguageActivityTelemetry;
}

const LEARNING_INTENT_PATTERN =
  /\b(learn|study|practice|practise|teach me|help me|speak|speaking|write|writing|read|reading|listen|listening|pronounce|pronunciation|translate|how do (i|you) say|how should i say)\b/i;

const NON_LANGUAGE_TOPIC_PATTERN =
  /\b(history|revolution|politics|political|cars?|cuisine|food|culture|cultural|literature|author|movie|film|music|war|geography|economy|economics)\b/i;

const languageNames = SUPPORTED_LANGUAGES.flatMap((language) =>
  language.names.map((name) =>
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''),
  ),
);

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionsSupportedLanguage(normalized: string): boolean {
  return languageNames.some((name) =>
    new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(normalized),
  );
}

function hasTranslateTarget(normalized: string): boolean {
  return languageNames.some((name) => {
    const escaped = escapeRegExp(name);
    return (
      new RegExp(`\\b(in|into|to)\\s+${escaped}\\b`, 'i').test(normalized) ||
      new RegExp(
        `\\b${escaped}\\s+(word|phrase|sentence|translation)\\b`,
        'i',
      ).test(normalized)
    );
  });
}

/**
 * Conservative freeform fast-path detector.
 *
 * Persisted language Subjects still use the stronger subject classifier. This
 * guard only prevents a first freeform turn from borrowing language-teacher
 * behavior when the learner is asking about a culture/history/science topic.
 */
export function isLikelyLanguageLearningIntent(message: string): boolean {
  const normalized = normalize(message);
  if (!mentionsSupportedLanguage(normalized)) {
    return false;
  }

  if (/^\s*(translate|how do (i|you) say|how should i say)\b/i.test(message)) {
    return hasTranslateTarget(normalized);
  }

  if (/\bwhat('s| is)\b.+\bin\b/i.test(normalized)) {
    return hasTranslateTarget(normalized);
  }

  if (NON_LANGUAGE_TOPIC_PATTERN.test(normalized)) {
    return false;
  }

  return LEARNING_INTENT_PATTERN.test(normalized);
}

function emptyCounts(): LanguageStrandCounts {
  return {
    meaning_input: 0,
    meaning_output: 0,
    language_focus: 0,
    fluency: 0,
  };
}

function isLanguageStrand(value: unknown): value is LanguageStrand {
  return (
    typeof value === 'string' &&
    (LANGUAGE_STRANDS as readonly string[]).includes(value)
  );
}

function cleanTerms(terms: string[] | undefined, limit: number): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const term of terms ?? []) {
    const value = term.trim().replace(/\s+/g, ' ');
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    cleaned.push(value);
    if (cleaned.length >= limit) {
      break;
    }
  }
  return cleaned;
}

function starterWordsForLanguage(languageCode?: string): string[] {
  switch (languageCode) {
    case 'es':
      return ['hola', 'gracias', 'agua'];
    case 'fr':
      return ['bonjour', 'merci', 'eau'];
    case 'de':
      return ['hallo', 'danke', 'wasser'];
    case 'it':
      return ['ciao', 'grazie', 'acqua'];
    case 'pt':
      return ['ola', 'obrigado', 'agua'];
    case 'nb':
      return ['hei', 'takk', 'vann'];
    default:
      return ['hello', 'thanks', 'water'];
  }
}

function buildSeedPassage(
  languageCode: string | undefined,
  words: string[],
): string {
  const [first = 'hello', second = 'thanks', third = 'water', ...rest] = words;
  const tail = rest.length > 0 ? ` ${rest.join(' ')}.` : '';
  switch (languageCode) {
    case 'es':
      return `Ana dice ${first}. Ana ve ${second}. Ana quiere ${third}.${tail}`;
    case 'fr':
      return `Ana dit ${first}. Ana voit ${second}. Ana veut ${third}.${tail}`;
    case 'de':
      return `Ana sagt ${first}. Ana sieht ${second}. Ana moechte ${third}.${tail}`;
    case 'it':
      return `Ana dice ${first}. Ana vede ${second}. Ana vuole ${third}.${tail}`;
    case 'pt':
      return `Ana diz ${first}. Ana ve ${second}. Ana quer ${third}.${tail}`;
    case 'nb':
      return `Ana sier ${first}. Ana ser ${second}. Ana vil ha ${third}.${tail}`;
    case 'nl':
      return `Ana zegt ${first}. Ana ziet ${second}. Ana wil ${third}.${tail}`;
    case 'sv':
      return `Ana sager ${first}. Ana ser ${second}. Ana vill ha ${third}.${tail}`;
    case 'da':
      return `Ana siger ${first}. Ana ser ${second}. Ana vil have ${third}.${tail}`;
    case 'ro':
      return `Ana spune ${first}. Ana vede ${second}. Ana vrea ${third}.${tail}`;
    case 'id':
      return `Ana berkata ${first}. Ana melihat ${second}. Ana mau ${third}.${tail}`;
    case 'ms':
      return `Ana kata ${first}. Ana nampak ${second}. Ana mahu ${third}.${tail}`;
    case 'sw':
      return `Ana anasema ${first}. Ana anaona ${second}. Ana anataka ${third}.${tail}`;
    default:
      return `Ana says ${first}. Ana sees ${second}. Ana wants ${third}.${tail}`;
  }
}

function buildGradedInputArtifact(input: {
  modality: LanguageActivityModality;
  languageCode?: string;
  cefrLevel?: CefrLevel | null;
  knownWords?: string[];
  targetWords?: string[];
}): LanguageGradedInputArtifact {
  const knownWords = cleanTerms(input.knownWords, 6);
  const targetWords = cleanTerms(input.targetWords, 3);
  const seedWords =
    knownWords.length > 0 || targetWords.length > 0
      ? [...knownWords.slice(0, 6), ...targetWords]
      : starterWordsForLanguage(input.languageCode);
  const text = buildSeedPassage(input.languageCode, seedWords);
  const denominator = Math.max(1, knownWords.length + targetWords.length);
  const estimate = Number((knownWords.length / denominator).toFixed(2));

  return {
    type: 'graded_input',
    modality: input.modality === 'listening' ? 'listening' : 'reading',
    cefrLevel: input.cefrLevel ?? 'A1',
    knownWordRatioTarget: 0.96,
    knownWordEstimate: Math.min(1, Math.max(0, estimate)),
    targetWords,
    text,
    comprehensionQuestions: [
      {
        id: 'gist-1',
        prompt: 'What is the main thing happening in this passage?',
        answerHint: text,
      },
    ],
    audioEnabled: input.modality === 'listening',
  };
}

export function getLanguageStrandCounts(
  events: Array<{ eventType: string; metadata: unknown }>,
): LanguageStrandCounts {
  const counts = emptyCounts();
  for (const event of events) {
    if (event.eventType !== 'ai_response') {
      continue;
    }
    const metadata = event.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      continue;
    }
    const languageLearning = (metadata as { languageLearning?: unknown })
      .languageLearning;
    if (
      !languageLearning ||
      typeof languageLearning !== 'object' ||
      Array.isArray(languageLearning)
    ) {
      continue;
    }
    const strand = (languageLearning as { strand?: unknown }).strand;
    if (isLanguageStrand(strand)) {
      counts[strand] += 1;
    }
  }
  return counts;
}

export function chooseNextLanguageStrand(input: {
  exchangeCount: number;
  priorCounts: Partial<LanguageStrandCounts>;
}): LanguageStrand {
  if (input.exchangeCount === 0) {
    return 'meaning_input';
  }

  const counts = { ...emptyCounts(), ...input.priorCounts };
  return LANGUAGE_STRANDS.reduce<LanguageStrand>((best, candidate) => {
    return counts[candidate] < counts[best] ? candidate : best;
  }, LANGUAGE_STRANDS[0]);
}

export function buildLanguageActivityTelemetry(input: {
  strand: LanguageStrand;
  inputMode?: InputMode;
  languageCode?: string;
  cefrLevel?: CefrLevel | null;
  knownWords?: string[];
  targetWords?: string[];
  targetGrammar?: string[];
}): LanguageActivityTelemetry {
  const activityTypeByStrand: Record<LanguageStrand, LanguageActivityType> = {
    meaning_input: 'graded_input',
    meaning_output: 'free_response',
    language_focus: 'correction_retry',
    fluency: 'timed_drill',
  };
  const modality =
    input.strand === 'meaning_input'
      ? input.inputMode === 'voice'
        ? 'listening'
        : 'text'
      : input.inputMode === 'voice'
        ? 'voice'
        : 'text';

  const activity: LanguageActivityTelemetry = {
    strand: input.strand,
    activityType: activityTypeByStrand[input.strand],
    modality,
    targetWords: input.targetWords?.slice(0, 8) ?? [],
    targetGrammar: input.targetGrammar?.slice(0, 8) ?? [],
  };

  if (input.strand === 'meaning_input') {
    activity.gradedInput = buildGradedInputArtifact({
      modality,
      languageCode: input.languageCode,
      cefrLevel: input.cefrLevel,
      knownWords: input.knownWords,
      targetWords: input.targetWords,
    });
  }

  return activity;
}

export function buildLanguageSessionState(input: {
  exchangeCount: number;
  events: Array<{ eventType: string; metadata: unknown }>;
  inputMode?: InputMode;
  languageCode?: string;
  cefrLevel?: CefrLevel | null;
  knownWords?: string[];
  targetWords?: string[];
  targetGrammar?: string[];
}): LanguageSessionState {
  const sessionStrandCounts = getLanguageStrandCounts(input.events);
  const activeStrand = chooseNextLanguageStrand({
    exchangeCount: input.exchangeCount,
    priorCounts: sessionStrandCounts,
  });

  return {
    activeStrand,
    sessionStrandCounts,
    nextActivity: buildLanguageActivityTelemetry({
      strand: activeStrand,
      inputMode: input.inputMode,
      languageCode: input.languageCode,
      cefrLevel: input.cefrLevel,
      knownWords: input.knownWords,
      targetWords: input.targetWords,
      targetGrammar: input.targetGrammar,
    }),
  };
}
