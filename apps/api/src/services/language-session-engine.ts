import {
  streamLanguageLearningActivitySchema,
  type CefrLevel,
  type InputMode,
  type LanguageActivityTelemetry,
  type LanguageActivityModality,
  type LanguageActivityType,
  type LanguageComprehensionEvaluation,
  type LanguageComprehensionVerdict,
  type LanguageGradedInputArtifact,
  type LanguageMeaningOutputArtifact,
  type LanguageMeaningOutputResponseMode,
  type LanguageMeaningOutputTaskType,
  type LanguageStrand,
} from '@eduagent/schemas';

import { SUPPORTED_LANGUAGES } from '../data/languages';

export const LANGUAGE_STRANDS = [
  'meaning_input',
  'meaning_output',
  'language_focus',
  'fluency',
] as const satisfies readonly LanguageStrand[];

export interface LanguageStrandCounts {
  meaning_input: number;
  meaning_output: number;
  language_focus: number;
  fluency: number;
}

export interface LanguageSessionState {
  activeStrand: LanguageStrand;
  sessionStrandCounts: LanguageStrandCounts;
  previousComprehension?: LanguageComprehensionEvaluation;
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

const ANSWER_STOPWORDS = new Set([
  'about',
  'after',
  'also',
  'and',
  'are',
  'because',
  'does',
  'for',
  'from',
  'has',
  'have',
  'her',
  'him',
  'his',
  'into',
  'its',
  'she',
  'that',
  'the',
  'their',
  'them',
  'then',
  'they',
  'this',
  'was',
  'what',
  'when',
  'where',
  'who',
  'with',
]);

function tokenizeAnswerTerms(value: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const match of value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .matchAll(/[a-z0-9]+/g)) {
    const term = match[0];
    if (term.length < 4 || ANSWER_STOPWORDS.has(term) || seen.has(term)) {
      continue;
    }
    seen.add(term);
    terms.push(term);
  }
  return terms;
}

function findLatestGradedInputEvent(
  events: Array<{ eventType: string; metadata: unknown }>,
): LanguageActivityTelemetry | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.eventType !== 'ai_response') {
      continue;
    }
    const metadata = event.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      continue;
    }
    const parsed = streamLanguageLearningActivitySchema.safeParse(
      (metadata as { languageLearning?: unknown }).languageLearning,
    );
    if (!parsed.success || !parsed.data.gradedInput) {
      continue;
    }
    return parsed.data as LanguageActivityTelemetry;
  }
  return null;
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

type MeaningOutputTaskDefinition = {
  taskType: LanguageMeaningOutputTaskType;
  responseMode: LanguageMeaningOutputResponseMode;
  communicativeGoal: string;
  buildPrompt: (targetWords: string[], targetGrammar: string[]) => string;
};

const MEANING_OUTPUT_TASKS = [
  {
    taskType: 'role_play',
    responseMode: 'dialogue_turn',
    communicativeGoal: 'Use the language to keep a simple conversation moving.',
    buildPrompt: (targetWords, targetGrammar) =>
      `Role-play a real conversation. Reply with one short line using ${formatOutputTargets(
        targetWords,
        targetGrammar,
      )}.`,
  },
  {
    taskType: 'personal_answer',
    responseMode: 'short_answer',
    communicativeGoal:
      'Share a true or imagined personal answer someone could respond to.',
    buildPrompt: (targetWords, targetGrammar) =>
      `Answer personally in one or two short sentences using ${formatOutputTargets(
        targetWords,
        targetGrammar,
      )}.`,
  },
  {
    taskType: 'retell',
    responseMode: 'short_retell',
    communicativeGoal: 'Retell familiar meaning in your own words.',
    buildPrompt: (targetWords, targetGrammar) =>
      `Retell the idea in two short sentences using ${formatOutputTargets(
        targetWords,
        targetGrammar,
      )}.`,
  },
  {
    taskType: 'describe',
    responseMode: 'short_description',
    communicativeGoal:
      'Describe a concrete scene so another person understands it.',
    buildPrompt: (targetWords, targetGrammar) =>
      `Describe a simple scene in two short sentences using ${formatOutputTargets(
        targetWords,
        targetGrammar,
      )}.`,
  },
  {
    taskType: 'ask_question',
    responseMode: 'question',
    communicativeGoal: 'Ask a useful question in a real conversation.',
    buildPrompt: (targetWords, targetGrammar) =>
      `Ask one natural question using ${formatOutputTargets(
        targetWords,
        targetGrammar,
      )}.`,
  },
] satisfies readonly [
  MeaningOutputTaskDefinition,
  ...MeaningOutputTaskDefinition[],
];

function formatOutputTargets(
  targetWords: string[],
  targetGrammar: string[],
): string {
  const parts: string[] = [];
  if (targetWords.length > 0) {
    parts.push(`word(s): ${targetWords.join(', ')}`);
  }
  if (targetGrammar.length > 0) {
    parts.push(`grammar: ${targetGrammar.join(', ')}`);
  }
  return parts.length > 0 ? parts.join('; ') : 'language you already know';
}

function buildMeaningOutputArtifact(input: {
  meaningOutputTurnIndex?: number;
  targetWords: string[];
  targetGrammar: string[];
}): LanguageMeaningOutputArtifact {
  const taskIndex =
    Math.abs(input.meaningOutputTurnIndex ?? 0) % MEANING_OUTPUT_TASKS.length;
  const task = MEANING_OUTPUT_TASKS[taskIndex] ?? MEANING_OUTPUT_TASKS[0];

  return {
    type: 'meaning_output',
    taskType: task.taskType,
    communicativeGoal: task.communicativeGoal,
    prompt: task.buildPrompt(input.targetWords, input.targetGrammar),
    responseMode: task.responseMode,
    targetWords: input.targetWords,
    targetGrammar: input.targetGrammar,
    retryExpectation: 'retry_after_feedback',
    correctionExpectation: 'meaning_first_then_form',
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

export function evaluatePendingGradedInputAnswer(input: {
  events: Array<{ eventType: string; metadata: unknown }>;
  learnerMessage: string;
}): LanguageComprehensionEvaluation | undefined {
  const activity = findLatestGradedInputEvent(input.events);
  const gradedInput = activity?.gradedInput;
  const question = gradedInput?.comprehensionQuestions[0];
  if (!gradedInput || !question) {
    return undefined;
  }

  const expectedTerms = tokenizeAnswerTerms(question.answerHint);
  if (expectedTerms.length === 0) {
    return undefined;
  }

  const answerTerms = new Set(tokenizeAnswerTerms(input.learnerMessage));
  const matchedTerms = expectedTerms.filter((term) => answerTerms.has(term));
  const missingTerms = expectedTerms.filter((term) => !answerTerms.has(term));
  const matchRatio = matchedTerms.length / expectedTerms.length;
  const verdict: LanguageComprehensionVerdict =
    matchedTerms.length === 0
      ? 'missed'
      : matchRatio >= 0.67
        ? 'understood'
        : 'partial';

  return {
    questionId: question.id,
    prompt: question.prompt,
    answerHint: question.answerHint,
    learnerAnswer: input.learnerMessage,
    verdict,
    matchedTerms,
    missingTerms,
  };
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
  meaningOutputTurnIndex?: number;
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

  const targetWords = input.targetWords?.slice(0, 8) ?? [];
  const targetGrammar = input.targetGrammar?.slice(0, 8) ?? [];
  const activity: LanguageActivityTelemetry = {
    strand: input.strand,
    activityType: activityTypeByStrand[input.strand],
    modality,
    targetWords,
    targetGrammar,
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

  if (input.strand === 'meaning_output') {
    activity.meaningOutput = buildMeaningOutputArtifact({
      meaningOutputTurnIndex: input.meaningOutputTurnIndex,
      targetWords,
      targetGrammar,
    });
  }

  return activity;
}

export function buildLanguageSessionState(input: {
  exchangeCount: number;
  events: Array<{ eventType: string; metadata: unknown }>;
  learnerMessage?: string;
  inputMode?: InputMode;
  languageCode?: string;
  cefrLevel?: CefrLevel | null;
  knownWords?: string[];
  targetWords?: string[];
  targetGrammar?: string[];
}): LanguageSessionState {
  const sessionStrandCounts = getLanguageStrandCounts(input.events);
  const previousComprehension = input.learnerMessage
    ? evaluatePendingGradedInputAnswer({
        events: input.events,
        learnerMessage: input.learnerMessage,
      })
    : undefined;
  const activeStrand =
    previousComprehension && previousComprehension.verdict !== 'understood'
      ? 'language_focus'
      : chooseNextLanguageStrand({
          exchangeCount: input.exchangeCount,
          priorCounts: sessionStrandCounts,
        });

  return {
    activeStrand,
    sessionStrandCounts,
    previousComprehension,
    nextActivity: buildLanguageActivityTelemetry({
      strand: activeStrand,
      inputMode: input.inputMode,
      languageCode: input.languageCode,
      cefrLevel: input.cefrLevel,
      knownWords: input.knownWords,
      targetWords: input.targetWords,
      targetGrammar: input.targetGrammar,
      meaningOutputTurnIndex: sessionStrandCounts.meaning_output,
    }),
  };
}
