import {
  cefrLevelSchema,
  type CefrLevel,
  type VocabularyLlmOutput,
  type VocabularyQuestion,
} from '@eduagent/schemas';
import { createLogger } from '../logger';
import type { LibraryItem } from './content-resolver';
import { shuffle } from './shuffle';

const logger = createLogger();

export const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export interface VocabularyPromptParams {
  discoveryCount: number;
  ageBracket: 'child' | 'adolescent' | 'adult';
  recentAnswers: string[];
  bankEntries?: Array<{ term: string; translation: string }>;
  languageCode: string;
  cefrCeiling: CefrLevel;
  themePreference?: string;
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

function describeAgeBracket(
  ageBracket: VocabularyPromptParams['ageBracket']
): string {
  switch (ageBracket) {
    case 'child':
      return '6-9';
    case 'adolescent':
      return '10-13';
    default:
      return '14+';
  }
}

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

export function getLanguageDisplayName(code: string): string {
  const [canonical] = Intl.getCanonicalLocales(code.trim().toLowerCase());
  if (!canonical) {
    throw new Error(`Unknown language code: ${code}`);
  }

  const normalized = canonical.toLowerCase();
  const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(
    normalized
  );

  if (!name || name.toLowerCase() === normalized) {
    throw new Error(`Unknown language code: ${code}`);
  }

  return name;
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
  } = params;

  const languageName = getLanguageDisplayName(languageCode);
  const ageLabel = describeAgeBracket(ageBracket);
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
  const themeInstruction = themePreference
    ? `Theme: "${themePreference}"`
    : `Choose an age-appropriate theme (e.g. "${languageName} Animals", "${languageName} Food", "${languageName} at School").`;

  return `You are generating a multiple-choice vocabulary quiz for a ${ageLabel} learner studying ${languageName}.

Activity: Vocabulary quiz
Target language: ${languageName}
Maximum CEFR level: ${cefrCeiling}
${themeInstruction}
Questions needed: exactly ${discoveryCount}

${recentExclusions}
${bankExclusions}

Rules:
- Generate exactly ${discoveryCount} questions.
- Each question shows a ${languageName} word or phrase and asks for the English translation.
- Include articles where the language normally uses them.
- acceptedAnswers must include the main translation plus any common equivalent phrasing.
- Distractors must be plausible English translations but still clearly wrong.
- Fun facts should be one sentence maximum.
- Keep every question at or below CEFR ${cefrCeiling}.

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
