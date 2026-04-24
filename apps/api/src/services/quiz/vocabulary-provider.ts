import {
  cefrLevelSchema,
  type CefrLevel,
  type VocabularyLlmOutput,
  type VocabularyQuestion,
} from '@eduagent/schemas';
import { createLogger } from '../logger';
import { VocabularyContextError } from '../../errors';
import type { LibraryItem } from './content-resolver';
import { describeAgeBracket, type AgeBracket, type Interest } from './config';
import { shuffle } from './shuffle';

const logger = createLogger();

export const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export interface VocabularyPromptParams {
  discoveryCount: number;
  ageBracket: AgeBracket;
  recentAnswers: string[];
  bankEntries?: Array<{ term: string; translation: string }>;
  languageCode: string;
  cefrCeiling: CefrLevel;
  themePreference?: string;
  interests?: Interest[];
  libraryTopics?: string[];
  ageYears?: number;
  learnerNativeLanguage?: string;
  /**
   * Struggle topics from the learner's profile. The prompt uses these as a
   * soft preference for semantic fields worth reinforcing — not as a hard
   * filter. [P1-4]
   */
  recentStruggles?: string[];
  /**
   * Recently missed vocabulary items (surfaced=false). Extracted from
   * `quiz_missed_items.questionText` for prior rounds; the prompt asks
   * the LLM to re-include them where they fit the theme/CEFR ceiling.
   * [P1 — quiz_missed_items wiring]
   */
  recentlyMissedItems?: string[];
}

export interface ValidatedVocabularyQuestion {
  term: string;
  correctAnswer: string;
  acceptedAnswers: string[];
  distractors: string[];
  funFact: string;
  cefrLevel: CefrLevel;
}

export interface ValidatedVocabularyRound {
  theme: string;
  targetLanguage: string;
  questions: ValidatedVocabularyQuestion[];
}

export type VocabularyMasteryQuestionResult =
  | {
      ok: true;
      question: VocabularyQuestion;
    }
  | {
      ok: false;
      reason: 'insufficient_distractors';
      distractorsFound: number;
    };

function tryNormalizeCefrLevel(
  level: string | null | undefined
): CefrLevel | null {
  if (!level) return null;
  const normalized = level.trim().toUpperCase();
  const parsed = cefrLevelSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

function getMasteredCefrIndices(
  vocabWithCards: Array<{
    cefrLevel: string | null;
    repetitions: number | null;
  }>,
  minRepetitions: number
): number[] {
  return vocabWithCards
    .filter((item) => (item.repetitions ?? 0) >= minRepetitions)
    .flatMap((item) => {
      const level = tryNormalizeCefrLevel(item.cefrLevel);
      if (!level) return [];
      return [CEFR_ORDER.indexOf(level)];
    })
    .sort((a, b) => a - b);
}

function getPercentileCefrLevel(indices: number[]): CefrLevel {
  const percentileIndex = Math.max(0, Math.ceil(indices.length * 0.9) - 1);
  return CEFR_ORDER[indices[percentileIndex] ?? 0] ?? 'A1';
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(trimmed);
  }

  return deduped;
}

function normalizeCefrLevelOrThrow(level: string): CefrLevel {
  const normalized = tryNormalizeCefrLevel(level);
  if (!normalized) {
    throw new Error(`Invalid CEFR level: "${level}"`);
  }
  return normalized;
}

export function nextCefrLevel(level: string): CefrLevel {
  const normalized = normalizeCefrLevelOrThrow(level);
  const idx = CEFR_ORDER.indexOf(normalized);
  return CEFR_ORDER[Math.min(idx + 1, CEFR_ORDER.length - 1)] ?? 'C2';
}

export function detectCefrCeilingMasteryWeighted(
  vocabWithCards: Array<{
    cefrLevel: string | null;
    repetitions: number | null;
  }>,
  minRepetitions = 3
): CefrLevel {
  const masteredIndices = getMasteredCefrIndices(
    vocabWithCards,
    minRepetitions
  );
  if (masteredIndices.length === 0) return 'A1';
  return getPercentileCefrLevel(masteredIndices);
}

export function getCefrCeilingForDiscovery(
  vocabWithCards: Array<{
    cefrLevel: string | null;
    repetitions: number | null;
  }>,
  minRepetitions = 3
): CefrLevel {
  const masteredIndices = getMasteredCefrIndices(
    vocabWithCards,
    minRepetitions
  );
  if (masteredIndices.length === 0) return 'A1';
  return nextCefrLevel(getPercentileCefrLevel(masteredIndices));
}

// [BUG-543] Throws VocabularyContextError instead of plain Error so the
// quiz route's catch block handles it as a 400, not an untyped 500.
export function getLanguageDisplayName(code: string): string {
  try {
    const [canonical] = Intl.getCanonicalLocales(code.trim().toLowerCase());
    if (!canonical) {
      throw new VocabularyContextError(`Unknown language code: ${code}`);
    }

    const normalized = canonical.toLowerCase();
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(
      normalized
    );

    if (!name || name.toLowerCase() === normalized) {
      throw new VocabularyContextError(`Unknown language code: ${code}`);
    }

    return name;
  } catch (error) {
    if (error instanceof VocabularyContextError) throw error;
    // Intl.getCanonicalLocales can throw RangeError for malformed codes.
    // Preserve the original error as cause so Sentry captures the root RangeError
    // stack alongside the wrapper — without this, tickets point only at the throw
    // site and the real parser failure is lost.
    throw new VocabularyContextError(`Invalid language code: ${code}`, {
      cause: error,
    });
  }
}

// Language pairs where L1 false-cognate distractors are especially valuable.
// Format: `${learnerNativeLanguage}-${targetLanguage}` (both lower-cased BCP-47).
const L1_AWARE_PAIRS: ReadonlySet<string> = new Set([
  'en-es',
  'es-en',
  'en-fr',
  'fr-en',
  'cs-de',
  'de-cs',
  'en-de',
  'de-en',
]);

function buildL1DistractorHint(
  learnerNativeLanguage: string | undefined,
  languageCode: string
): string {
  if (!learnerNativeLanguage) return '';
  const pairKey = `${learnerNativeLanguage.trim().toLowerCase()}-${languageCode
    .trim()
    .toLowerCase()}`;
  if (!L1_AWARE_PAIRS.has(pairKey)) return '';

  let nativeName: string;
  try {
    nativeName = new Intl.DisplayNames(['en'], { type: 'language' }).of(
      learnerNativeLanguage.trim().toLowerCase()
    ) as string;
    if (
      !nativeName ||
      nativeName.toLowerCase() === learnerNativeLanguage.trim().toLowerCase()
    ) {
      nativeName = learnerNativeLanguage;
    }
  } catch {
    nativeName = learnerNativeLanguage;
  }

  return `\n- Distractors that exploit false cognates with ${nativeName} are especially valuable — the learner's native language is ${nativeName}.`;
}

export function buildVocabularyPrompt(params: VocabularyPromptParams): string {
  const {
    discoveryCount,
    ageBracket,
    recentAnswers,
    bankEntries = [],
    languageCode,
    cefrCeiling,
    themePreference,
    interests = [],
    libraryTopics = [],
    ageYears,
    learnerNativeLanguage,
    recentStruggles = [],
    recentlyMissedItems = [],
  } = params;

  const languageName = getLanguageDisplayName(languageCode);
  const ageLabel =
    ageYears !== undefined
      ? `${ageYears}-year-old`
      : describeAgeBracket(ageBracket);
  const recentExclusions =
    recentAnswers.length > 0
      ? `Do NOT repeat these recently seen English answers: ${recentAnswers.join(
          ', '
        )}`
      : 'No recent-answer exclusions.';
  const bankExclusions =
    bankEntries.length > 0
      ? `Do NOT include any of these vocabulary-bank entries: ${bankEntries
          .slice(0, 50)
          .map((entry) => `${entry.term} = ${entry.translation}`)
          .join('; ')}`
      : 'No existing bank-entry exclusions.';

  // Interest-driven theme: prefer explicit themePreference, then build from interests
  let themeInstruction: string;
  if (themePreference) {
    themeInstruction = `Theme: "${themePreference}"`;
  } else if (interests.length > 0) {
    const interestLabels = interests
      .filter((i) => i.context === 'free_time' || i.context === 'both')
      .map((i) => i.label);
    const allLabels =
      interestLabels.length > 0
        ? interestLabels
        : interests.map((i) => i.label);
    themeInstruction = `Choose a vocabulary theme that connects to the learner's interests: ${allLabels
      .slice(0, 5)
      .join(', ')}. (e.g. "${languageName} ${allLabels[0] ?? 'Animals'}")`;
  } else {
    themeInstruction = `Choose an age-appropriate theme (e.g. "${languageName} Animals", "${languageName} Food", "${languageName} at School").`;
  }

  const libraryHint =
    libraryTopics.length > 0
      ? `\nThe learner is also studying these curriculum topics — you may draw vocabulary from them: ${libraryTopics
          .slice(0, 20)
          .join('; ')}.`
      : '';

  const struggleHint =
    recentStruggles.length > 0
      ? `\nRecent weaker areas: ${recentStruggles
          .slice(0, 10)
          .join(
            '; '
          )}. Where it fits the theme, prefer vocabulary from these semantic fields so the learner gets extra reps on what they find hard — do not force it if the fit is weak.`
      : '';

  const missedHint =
    recentlyMissedItems.length > 0
      ? `\nRecently missed vocabulary (re-surface where the theme and CEFR fit): ${recentlyMissedItems
          .slice(0, 8)
          .join(
            ', '
          )}. Include at least one of these as a question when the chosen theme and CEFR ceiling allow it.`
      : '';

  const l1DistractorHint = buildL1DistractorHint(
    learnerNativeLanguage,
    languageCode
  );

  return `You are generating a multiple-choice vocabulary quiz for a ${ageLabel} learner studying ${languageName}.

Activity: Vocabulary quiz
Target language: ${languageName}
Maximum CEFR level: ${cefrCeiling}
${themeInstruction}
Questions needed: exactly ${discoveryCount}

${recentExclusions}
${bankExclusions}${libraryHint}${struggleHint}${missedHint}

Rules:
- Generate exactly ${discoveryCount} questions.
- Each question shows a ${languageName} word or phrase and asks for the English translation.
- Include articles where the language normally uses them.
- acceptedAnswers must include the main translation plus any common equivalent phrasing.
- Distractors must be plausible English translations but still clearly wrong.
- Fun facts should be one sentence maximum.
- Keep every question at or below CEFR ${cefrCeiling}.${l1DistractorHint}

Respond with ONLY valid JSON in this shape:
{
  "theme": "Theme Name",
  "targetLanguage": "${languageName}",
  "questions": [
    {
      "term": "Word in ${languageName}",
      "correctAnswer": "English translation",
      "acceptedAnswers": ["English translation", "alternative phrasing"],
      "distractors": ["Wrong 1", "Wrong 2", "Wrong 3"],
      "funFact": "One interesting fact about this word.",
      "cefrLevel": "A1"
    }
  ]
}`;
}

export function validateVocabularyRound(
  llmOutput: VocabularyLlmOutput,
  cefrCeiling: string
): ValidatedVocabularyRound {
  const normalizedCeiling = normalizeCefrLevelOrThrow(cefrCeiling);
  const maxIdx = CEFR_ORDER.indexOf(normalizedCeiling);

  const questions = llmOutput.questions.flatMap((question) => {
    const term = question.term.trim();
    const correctAnswer = question.correctAnswer.trim();
    const level = tryNormalizeCefrLevel(question.cefrLevel);

    if (!term || !correctAnswer || !level) return [];
    if (CEFR_ORDER.indexOf(level) > maxIdx) return [];

    const acceptedAnswers = dedupeCaseInsensitive([
      correctAnswer,
      ...question.acceptedAnswers,
    ]);
    const acceptedAnswerSet = new Set(
      acceptedAnswers.map((answer) => answer.toLowerCase())
    );
    const distractors = dedupeCaseInsensitive(question.distractors).filter(
      (distractor) => !acceptedAnswerSet.has(distractor.toLowerCase())
    );

    if (acceptedAnswers.length === 0 || distractors.length < 3) return [];

    return [
      {
        term,
        correctAnswer,
        acceptedAnswers,
        distractors: distractors.slice(0, 3),
        funFact: question.funFact.trim(),
        cefrLevel: level,
      } satisfies ValidatedVocabularyQuestion,
    ];
  });

  return {
    theme: llmOutput.theme.trim(),
    targetLanguage: llmOutput.targetLanguage.trim(),
    questions,
  };
}

export function pickDistractors(
  correctTranslation: string,
  allVocabulary: Array<{ translation: string }>,
  count = 3
): string[] {
  const correctLower = correctTranslation.trim().toLowerCase();
  const pool: string[] = [];
  const seen = new Set<string>([correctLower]);

  for (const entry of allVocabulary) {
    const candidate = entry.translation.trim();
    if (!candidate) continue;
    // QP2-R13: dedupe is intentionally case-insensitive so `Dog`/`dog`
    // doesn't create fake variety from the same underlying bank entry.
    const normalized = candidate.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    pool.push(candidate);
  }

  return shuffle(pool).slice(0, count);
}

export function buildVocabularyMasteryQuestion(
  item: LibraryItem,
  allVocabulary: Array<{ translation: string }>,
  fallbackCefrLevel: string
): VocabularyMasteryQuestionResult {
  const distractors = pickDistractors(item.answer, allVocabulary, 3);
  if (distractors.length < 3) {
    logger.warn('quiz.vocabulary.mastery_builder_insufficient_distractors', {
      vocabularyId: item.vocabularyId ?? item.id,
      poolSize: allVocabulary.length,
      distractorsFound: distractors.length,
    });
    return {
      ok: false,
      reason: 'insufficient_distractors',
      distractorsFound: distractors.length,
    };
  }

  const cefrLevel = tryNormalizeCefrLevel(item.cefrLevel ?? fallbackCefrLevel);

  return {
    ok: true,
    question: {
      type: 'vocabulary',
      term: item.question,
      correctAnswer: item.answer,
      acceptedAnswers: [item.answer],
      distractors,
      funFact: '',
      cefrLevel: cefrLevel ?? normalizeCefrLevelOrThrow(fallbackCefrLevel),
      isLibraryItem: true,
      vocabularyId: item.vocabularyId ?? null,
    },
  };
}
