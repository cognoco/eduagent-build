import {
  streamLanguageLearningActivitySchema,
  computeAgeBracketFromDate,
  type AgeBracket,
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
  type LanguageNextPracticePointer,
  type LanguageSpeakingPracticeArtifact,
  type LanguageStrand,
} from '@eduagent/schemas';

import { SUPPORTED_LANGUAGES, getLanguageByCode } from '../data/languages';
import { generateGradedInputContent } from './graded-input-generation';

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
  previousMeaningOutputTask?: LanguageMeaningOutputArtifact;
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

// WI-1756: the meaning-output correction/retry brief is only present on the
// nextActivity of the turn it is *presented* on — by the following turn the
// strand has rotated away and the brief is gone. This re-surfaces it for
// exactly the one answer turn, so the tutor is anchored to the specific task
// the learner is replying to. Recency-guarded by construction (only the
// single most recent AI turn is consulted, never walked further back),
// unlike findLatestGradedInputEvent above — deliberately not reused/extended
// here (F3, out of scope for this WI).
function findPendingMeaningOutputTask(
  events: Array<{ eventType: string; metadata: unknown }>,
): LanguageMeaningOutputArtifact | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.eventType !== 'ai_response') {
      continue;
    }
    const metadata = event.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return undefined;
    }
    const parsed = streamLanguageLearningActivitySchema.safeParse(
      (metadata as { languageLearning?: unknown }).languageLearning,
    );
    return parsed.success
      ? (parsed.data as LanguageActivityTelemetry).meaningOutput
      : undefined;
  }
  return undefined;
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

async function buildGradedInputArtifact(input: {
  modality: LanguageActivityModality;
  languageCode?: string;
  cefrLevel?: CefrLevel | null;
  knownWords?: string[];
  targetWords?: string[];
  interests?: string[];
  birthYear?: number | null;
  birthMonth?: number | null;
  birthDay?: number | null;
}): Promise<LanguageGradedInputArtifact> {
  const knownWords = cleanTerms(input.knownWords, 6);
  const targetWords = cleanTerms(input.targetWords, 3);
  // The artifact's own modality is a narrower type ('reading' | 'listening')
  // than the enclosing activity's modality ('text' | 'voice' | 'listening') —
  // keep them distinct rather than reusing one variable for both.
  const modality: 'reading' | 'listening' =
    input.modality === 'listening' ? 'listening' : 'reading';

  // Server-owned known-word estimate: computed from vocabulary counts, never
  // from the LLM's own self-report, regardless of whether `text` below comes
  // from the LLM or the deterministic fallback (see docs/plans/2026-07-02-4-strands.md
  // audit — "the LLM's own number is trusted" is a documented weakness this
  // deliberately avoids repeating).
  const denominator = Math.max(1, knownWords.length + targetWords.length);
  const estimate = Number((knownWords.length / denominator).toFixed(2));
  const knownWordEstimate = Math.min(1, Math.max(0, estimate));

  // Fail-closed age bracket, matching the minor-safety gate pattern used
  // elsewhere in session-exchange.ts: an unknown/non-finite birthYear never
  // silently lets a generation call route to a provider excluded for minors.
  const ageBracket: AgeBracket = Number.isFinite(input.birthYear)
    ? computeAgeBracketFromDate(
        input.birthYear as number,
        input.birthMonth ?? undefined,
        input.birthDay ?? undefined,
      )
    : 'child';

  const generated = await generateGradedInputContent({
    languageCode: input.languageCode,
    cefrLevel: input.cefrLevel,
    knownWords,
    targetWords,
    modality,
    interests: input.interests,
    ageBracket,
  });

  if (generated) {
    return {
      type: 'graded_input',
      modality,
      cefrLevel: input.cefrLevel ?? 'A1',
      knownWordRatioTarget: 0.96,
      knownWordEstimate,
      targetWords,
      text: generated.text,
      comprehensionQuestions: generated.comprehensionQuestions.map(
        (question, index) => ({
          id: `gist-${index + 1}`,
          prompt: question.prompt,
          answerHint: question.answerHint,
        }),
      ),
      audioEnabled: modality === 'listening',
    };
  }

  const seedWords =
    knownWords.length > 0 || targetWords.length > 0
      ? [...knownWords.slice(0, 6), ...targetWords]
      : starterWordsForLanguage(input.languageCode);
  const text = buildSeedPassage(input.languageCode, seedWords);

  return {
    type: 'graded_input',
    modality,
    cefrLevel: input.cefrLevel ?? 'A1',
    knownWordRatioTarget: 0.96,
    knownWordEstimate,
    targetWords,
    text,
    comprehensionQuestions: [
      {
        id: 'gist-1',
        prompt: 'What is the main thing happening in this passage?',
        answerHint: text,
      },
    ],
    audioEnabled: modality === 'listening',
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

// WI-1777: short, single-sentence targets for repeat-after-me/shadowing —
// deliberately NOT `buildSeedPassage` (that emits three sentences, which
// would make transcript-comparison scoring noisy for a verbatim-repeat
// exercise). Deterministic, no LLM: same code list/switch shape as
// `starterWordsForLanguage`/`buildSeedPassage` above, defaulting to English
// for any language code not in this table.
const DEFAULT_REPEAT_AFTER_ME_SENTENCES: readonly [string, ...string[]] = [
  'Hello, how are you.',
  'I like coffee.',
  'I live in a big house.',
];

const REPEAT_AFTER_ME_SENTENCES: Record<
  string,
  readonly [string, ...string[]]
> = {
  es: ['Hola, como estas.', 'Me gusta el cafe.', 'Vivo en una casa grande.'],
  fr: [
    'Bonjour, comment ca va.',
    "J'aime le cafe.",
    "J'habite dans une grande maison.",
  ],
  de: [
    'Hallo, wie geht es dir.',
    'Ich mag Kaffee.',
    'Ich wohne in einem grossen Haus.',
  ],
  it: ['Ciao, come stai.', 'Mi piace il caffe.', 'Vivo in una casa grande.'],
  pt: [
    'Ola, como voce esta.',
    'Eu gosto de cafe.',
    'Eu moro em uma casa grande.',
  ],
  nb: [
    'Hei, hvordan har du det.',
    'Jeg liker kaffe.',
    'Jeg bor i et stort hus.',
  ],
  nl: [
    'Hallo, hoe gaat het met je.',
    'Ik hou van koffie.',
    'Ik woon in een groot huis.',
  ],
  sv: ['Hej, hur mar du.', 'Jag gillar kaffe.', 'Jag bor i ett stort hus.'],
  da: [
    'Hej, hvordan har du det.',
    'Jeg kan lide kaffe.',
    'Jeg bor i et stort hus.',
  ],
  ro: [
    'Buna, ce mai faci.',
    'Imi place cafeaua.',
    'Locuiesc intr-o casa mare.',
  ],
  id: ['Halo, apa kabar.', 'Saya suka kopi.', 'Saya tinggal di rumah besar.'],
  ms: ['Helo, apa khabar.', 'Saya suka kopi.', 'Saya tinggal di rumah besar.'],
  sw: [
    'Habari, hujambo.',
    'Ninapenda kahawa.',
    'Ninaishi katika nyumba kubwa.',
  ],
};

function pickRepeatAfterMeSentence(
  languageCode: string | undefined,
  turnIndex: number,
): string {
  const sentences =
    (languageCode ? REPEAT_AFTER_ME_SENTENCES[languageCode] : undefined) ??
    DEFAULT_REPEAT_AFTER_ME_SENTENCES;
  const index = Math.abs(turnIndex) % sentences.length;
  return sentences[index] ?? sentences[0];
}

// WI-1777: one shape serves both `repeat_after_me` and `shadowing` — `mode`
// selection is a hook for future work (see `selectSpeakingPracticeMode`
// below), always `repeat_after_me` in this MVP.
function selectSpeakingPracticeMode(): 'repeat_after_me' | 'shadowing' {
  return 'repeat_after_me';
}

function buildSpeakingPracticeArtifact(input: {
  languageCode?: string;
  fluencyTurnIndex?: number;
}): LanguageSpeakingPracticeArtifact {
  return {
    type: selectSpeakingPracticeMode(),
    targetText: pickRepeatAfterMeSentence(
      input.languageCode,
      input.fluencyTurnIndex ?? 0,
    ),
    locale: getLanguageByCode(input.languageCode ?? '')?.sttLocale ?? 'en-US',
    modality: 'voice',
    retryGuidance: 'retry_same_target',
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

function leastUsedStrand(counts: LanguageStrandCounts): LanguageStrand {
  return LANGUAGE_STRANDS.reduce<LanguageStrand>((best, candidate) => {
    return counts[candidate] < counts[best] ? candidate : best;
  }, LANGUAGE_STRANDS[0]);
}

export function chooseNextLanguageStrand(input: {
  exchangeCount: number;
  priorCounts: Partial<LanguageStrandCounts>;
  // WI-1552: cross-session pointer persisted at the end of a prior session
  // (see computeNextPracticePointer below). Only consulted at the first
  // exchange of a session — once priorCounts start accumulating within this
  // session, the existing least-used-strand balancing takes over unchanged.
  // Undefined/omitted preserves the pre-WI-1552 behavior exactly (AC4c).
  crossSessionPointer?: LanguageNextPracticePointer;
}): LanguageStrand {
  if (input.exchangeCount === 0) {
    return input.crossSessionPointer?.strand ?? 'meaning_input';
  }

  const counts = { ...emptyCounts(), ...input.priorCounts };
  return leastUsedStrand(counts);
}

// WI-1552: computes the next-practice pointer persisted at session-completed
// time (apps/api/src/inngest/functions/session-completed.ts) for four_strands
// subjects. `reason` is safe debug metadata (strand counts only) — never
// rendered verbatim in the mobile UI.
export function computeNextPracticePointer(
  sessionStrandCounts: LanguageStrandCounts,
): LanguageNextPracticePointer {
  const strand = leastUsedStrand(sessionStrandCounts);
  return {
    strand,
    reason: `least-practiced strand from the prior session (meaning_input=${sessionStrandCounts.meaning_input}, meaning_output=${sessionStrandCounts.meaning_output}, language_focus=${sessionStrandCounts.language_focus}, fluency=${sessionStrandCounts.fluency})`,
    sessionStrandCounts,
    computedAt: new Date().toISOString(),
  };
}

export async function buildLanguageActivityTelemetry(input: {
  strand: LanguageStrand;
  inputMode?: InputMode;
  languageCode?: string;
  cefrLevel?: CefrLevel | null;
  knownWords?: string[];
  targetWords?: string[];
  targetGrammar?: string[];
  meaningOutputTurnIndex?: number;
  // WI-1777: session-scoped fluency-turn counter, threaded the same way as
  // `meaningOutputTurnIndex` above — picks which deterministic target
  // sentence rotates in across a session's fluency turns.
  fluencyTurnIndex?: number;
  interests?: string[];
  birthYear?: number | null;
  birthMonth?: number | null;
  birthDay?: number | null;
}): Promise<LanguageActivityTelemetry> {
  const activityTypeByStrand: Record<LanguageStrand, LanguageActivityType> = {
    meaning_input: 'graded_input',
    meaning_output: 'free_response',
    language_focus: 'correction_retry',
    fluency: 'timed_drill',
  };
  // WI-1777: "beginner speaking practice" narrows to an explicit A1/A2
  // cefrLevel — an unset/null cefrLevel is NOT treated as beginner here, so
  // fluency turns with no known level keep today's exact `timed_drill`
  // behavior (verified against the existing "maps fluency strands to timed
  // drill telemetry" test, which calls this with no cefrLevel at all).
  const isBeginnerFluency =
    input.strand === 'fluency' &&
    (input.cefrLevel === 'A1' || input.cefrLevel === 'A2');
  const activityType: LanguageActivityType = isBeginnerFluency
    ? selectSpeakingPracticeMode()
    : activityTypeByStrand[input.strand];
  const modality =
    activityType === 'repeat_after_me' || activityType === 'shadowing'
      ? 'voice'
      : input.strand === 'meaning_input'
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
    activityType,
    modality,
    targetWords,
    targetGrammar,
  };

  if (input.strand === 'meaning_input') {
    activity.gradedInput = await buildGradedInputArtifact({
      modality,
      languageCode: input.languageCode,
      cefrLevel: input.cefrLevel,
      knownWords: input.knownWords,
      targetWords: input.targetWords,
      interests: input.interests,
      birthYear: input.birthYear,
      birthMonth: input.birthMonth,
      birthDay: input.birthDay,
    });
  }

  if (input.strand === 'meaning_output') {
    activity.meaningOutput = buildMeaningOutputArtifact({
      meaningOutputTurnIndex: input.meaningOutputTurnIndex,
      targetWords,
      targetGrammar,
    });
  }

  if (isBeginnerFluency) {
    activity.speakingPractice = buildSpeakingPracticeArtifact({
      languageCode: input.languageCode,
      fluencyTurnIndex: input.fluencyTurnIndex,
    });
  }

  return activity;
}

export async function buildLanguageSessionState(input: {
  exchangeCount: number;
  events: Array<{ eventType: string; metadata: unknown }>;
  learnerMessage?: string;
  inputMode?: InputMode;
  languageCode?: string;
  cefrLevel?: CefrLevel | null;
  knownWords?: string[];
  targetWords?: string[];
  targetGrammar?: string[];
  interests?: string[];
  birthYear?: number | null;
  birthMonth?: number | null;
  birthDay?: number | null;
  // WI-1552: pointer read back from the subject's persisted state (set at the
  // end of a prior session). Only affects the choice at exchangeCount === 0 —
  // see chooseNextLanguageStrand.
  crossSessionPointer?: LanguageNextPracticePointer;
}): Promise<LanguageSessionState> {
  const sessionStrandCounts = getLanguageStrandCounts(input.events);
  const previousComprehension = input.learnerMessage
    ? evaluatePendingGradedInputAnswer({
        events: input.events,
        learnerMessage: input.learnerMessage,
      })
    : undefined;
  const previousMeaningOutputTask = input.learnerMessage
    ? findPendingMeaningOutputTask(input.events)
    : undefined;
  const activeStrand =
    previousComprehension && previousComprehension.verdict !== 'understood'
      ? 'language_focus'
      : chooseNextLanguageStrand({
          exchangeCount: input.exchangeCount,
          priorCounts: sessionStrandCounts,
          crossSessionPointer: input.crossSessionPointer,
        });

  return {
    activeStrand,
    sessionStrandCounts,
    previousComprehension,
    previousMeaningOutputTask,
    nextActivity: await buildLanguageActivityTelemetry({
      strand: activeStrand,
      inputMode: input.inputMode,
      languageCode: input.languageCode,
      cefrLevel: input.cefrLevel,
      knownWords: input.knownWords,
      targetWords: input.targetWords,
      targetGrammar: input.targetGrammar,
      meaningOutputTurnIndex: sessionStrandCounts.meaning_output,
      fluencyTurnIndex: sessionStrandCounts.fluency,
      interests: input.interests,
      birthYear: input.birthYear,
      birthMonth: input.birthMonth,
      birthDay: input.birthDay,
    }),
  };
}
