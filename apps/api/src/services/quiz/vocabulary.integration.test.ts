import { and, eq, inArray } from 'drizzle-orm';
import {
  accounts,
  createDatabase,
  profiles,
  quizMissedItems,
  quizRounds,
  subjects,
  vocabulary,
  vocabularyRetentionCards,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { sm2 } from '@eduagent/retention';
import { resolve } from 'path';
import type { QuizQuestion } from '@eduagent/schemas';
import { completeQuizRound } from './complete-round';
import { generateQuizRound } from './generate-round';
import { getVocabularyRoundContext } from './queries';
import { QUIZ_CONFIG } from './config';
import type { ChatMessage, LLMProvider, ModelConfig } from '../llm';
import { _clearProviders, _resetCircuits, registerProvider } from '../llm';

// [CR-758] Single source of truth for the expected vocabulary round size.
// Previously the test asserted `toHaveLength(6)` and `total).toBe(6)` with
// no derivation — if QUIZ_CONFIG.perActivity.vocabulary.roundSize ever
// changed, the test would silently fail with a misleading "expected 6"
// message. Reading from the config makes the test self-documenting AND
// ensures it tracks the production-shipped value.
const VOCAB_ROUND_SIZE = QUIZ_CONFIG.perActivity.vocabulary.roundSize;

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

let llmResponse = '';
const llmProviderCalls: Array<{
  messages: ChatMessage[];
  config: ModelConfig;
}> = [];

function createVocabularyProvider(): LLMProvider {
  return {
    id: 'gemini',
    async chat(messages: ChatMessage[], config: ModelConfig) {
      llmProviderCalls.push({ messages, config });
      return { content: llmResponse, stopReason: 'stop' };
    },
    chatStream() {
      throw new Error('vocabulary integration test does not stream');
    },
  };
}

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

const PREFIX = 'integration-quiz-vocabulary';
const ACCOUNT = {
  clerkUserId: `${PREFIX}-01`,
  email: `${PREFIX}-01@integration.test`,
};

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  const rows = await db.query.accounts.findMany({
    where: inArray(accounts.email, [ACCOUNT.email]),
  });

  if (rows.length > 0) {
    await db.delete(accounts).where(
      inArray(
        accounts.id,
        rows.map((row: typeof accounts.$inferSelect) => row.id),
      ),
    );
  }
}

async function seedProfileAndSubject() {
  const db = createIntegrationDb();
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: ACCOUNT.clerkUserId,
      email: ACCOUNT.email,
    })
    .returning();
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Vocabulary Integration Profile',
      birthYear: 2014,
      isOwner: true,
    })
    .returning();
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: profile!.id,
      name: "Emma's German",
      status: 'active',
      pedagogyMode: 'four_strands',
      languageCode: 'de',
    })
    .returning();

  return {
    db,
    profile: profile!,
    subject: subject!,
  };
}

async function seedVocabularyBank(profileId: string, subjectId: string) {
  const db = createIntegrationDb();
  // Use relative dates so the test works without fake timers.
  // "Due" items have nextReviewAt in the past, "future" items in the future.
  const dueDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
  const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
  const lastReviewedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
  const words = [
    ['der Hund', 'dog', 'A1'],
    ['die Katze', 'cat', 'A1'],
    ['der Vogel', 'bird', 'A1'],
    ['der Fisch', 'fish', 'A1'],
    ['das Pferd', 'horse', 'A2'],
    ['die Kuh', 'cow', 'A2'],
    ['die Maus', 'mouse', 'A1'],
    ['das Schaf', 'sheep', 'A1'],
    ['die Ente', 'duck', 'A1'],
    ['der Hase', 'rabbit', 'A1'],
  ] as const;

  const inserted = [];
  for (const [term, translation, cefrLevel] of words) {
    const [row] = await db
      .insert(vocabulary)
      .values({
        profileId,
        subjectId,
        term,
        termNormalized: term.toLowerCase(),
        translation,
        type: 'word',
        cefrLevel,
      })
      .returning();
    inserted.push(row!);
  }

  const dueItems = inserted.slice(0, 4);
  const futureItems = inserted.slice(4, 6);

  for (const item of dueItems) {
    await db.insert(vocabularyRetentionCards).values({
      profileId,
      vocabularyId: item.id,
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 3,
      lastReviewedAt,
      nextReviewAt: dueDate,
      failureCount: 0,
      consecutiveSuccesses: 3,
    });
  }

  for (const item of futureItems) {
    await db.insert(vocabularyRetentionCards).values({
      profileId,
      vocabularyId: item.id,
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 3,
      lastReviewedAt,
      nextReviewAt: futureDate,
      failureCount: 0,
      consecutiveSuccesses: 3,
    });
  }

  return inserted;
}

beforeEach(async () => {
  // No fake timers — useFakeTimers causes the Neon HTTP driver to hang
  // in CI's PostgreSQL service container. The SM-2 assertions use the
  // same sm2() function as the production code, so both sides compute
  // from the same real Date and the assertions still match.
  llmProviderCalls.length = 0;
  _clearProviders();
  _resetCircuits();
  registerProvider(createVocabularyProvider());
  await cleanupTestAccounts();
});

afterAll(async () => {
  await cleanupTestAccounts();
  _clearProviders();
  _resetCircuits();
});

describe('vocabulary quiz round lifecycle (integration)', () => {
  // Timeout raised to 15s — CI PostgreSQL service container is slower than
  // Neon for seeding + full generate → complete lifecycle with real DB writes.
  it('generates a round, completes it, updates SM-2 cards, and stores missed discovery items', async () => {
    const { db, profile, subject } = await seedProfileAndSubject();
    await seedVocabularyBank(profile.id, subject.id);

    llmResponse = JSON.stringify({
      theme: 'German Animals',
      targetLanguage: 'German',
      questions: [
        {
          term: 'das Schwein',
          correctAnswer: 'pig',
          acceptedAnswers: ['pig'],
          distractors: ['dog', 'cat', 'bird'],
          funFact: 'Schwein also appears in some lucky sayings.',
          cefrLevel: 'A1',
        },
        {
          term: 'der Bär',
          correctAnswer: 'bear',
          acceptedAnswers: ['bear'],
          distractors: ['horse', 'cow', 'fish'],
          funFact: 'Bär is common in fairy tales.',
          cefrLevel: 'A2',
        },
        {
          term: 'der Frosch',
          correctAnswer: 'frog',
          acceptedAnswers: ['frog'],
          distractors: ['duck', 'rabbit', 'mouse'],
          funFact: 'Frosch shows up in many beginner stories.',
          cefrLevel: 'A1',
        },
      ],
    });

    const context = await getVocabularyRoundContext(db, profile.id, subject.id);
    expect(context.libraryItems).toHaveLength(4);
    expect(context.cefrCeiling).toBe('B1');

    const round = await generateQuizRound({
      db,
      profileId: profile.id,
      activityType: 'vocabulary',
      birthYear: profile.birthYear,
      themePreference: undefined,
      libraryItems: context.libraryItems,
      recentAnswers: [],
      languageCode: context.languageCode,
      cefrCeiling: context.cefrCeiling,
      allVocabulary: context.allVocabulary,
    });

    expect(round.questions).toHaveLength(VOCAB_ROUND_SIZE);
    // Break-test for D-MOCK-1: prove the real `buildVocabularyPrompt` and
    // `generateQuizRound` orchestration ran before reaching the provider
    // boundary. If `jest.requireActual` is dropped, the barrel becomes a
    // bare stub, the real prompt builder no longer runs, and these
    // content/shape assertions fail. A simple `toHaveBeenCalledTimes(1)`
    // would pass even with a full barrel mock — these don't.
    expect(llmProviderCalls).toHaveLength(1);
    expect(llmProviderCalls[0]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('Activity: Vocabulary quiz'),
        }),
        expect.objectContaining({
          role: 'user',
          content: 'Generate the quiz round.',
        }),
      ]),
    );
    expect(llmProviderCalls[0]!.config.model).toBe('gemini-2.5-flash');
    const [systemPrompt] = llmProviderCalls[0]!.messages as Array<{
      role: string;
      content: string;
    }>;
    expect(systemPrompt.content).toContain(
      'You are an educational AI assistant for young learners.',
    );
    expect(systemPrompt.content).toContain(
      `Maximum CEFR level: ${context.cefrCeiling}`,
    );
    const masteryQuestions = round.questions.filter(
      (
        question: QuizQuestion,
      ): question is Extract<QuizQuestion, { type: 'vocabulary' }> =>
        question.type === 'vocabulary' && question.isLibraryItem,
    );
    expect(masteryQuestions).toHaveLength(3);

    const masteryIds = masteryQuestions.map(
      (question: Extract<QuizQuestion, { type: 'vocabulary' }>) =>
        question.vocabularyId!,
    );
    const beforeCards = await db.query.vocabularyRetentionCards.findMany({
      where: inArray(vocabularyRetentionCards.vocabularyId, masteryIds),
    });
    const beforeById = new Map(
      beforeCards.map(
        (card: typeof vocabularyRetentionCards.$inferSelect) =>
          [card.vocabularyId, card] as const,
      ),
    );

    let wrongDiscoveryRecorded = false;
    const masteryQualityById = new Map<string, number>();
    const results = round.questions.map(
      (question: QuizQuestion, index: number) => {
        if (question.type === 'vocabulary' && question.isLibraryItem) {
          const quality = masteryQualityById.size === 1 ? 2 : 4;
          masteryQualityById.set(question.vocabularyId!, quality);
          return {
            questionIndex: index,
            correct: quality === 4,
            answerGiven:
              quality === 4 ? question.correctAnswer : question.distractors[0]!,
            timeMs: 1500,
          };
        }

        const answerGiven =
          !wrongDiscoveryRecorded && question.type === 'vocabulary'
            ? question.distractors[0]!
            : question.correctAnswer;
        if (!wrongDiscoveryRecorded && question.type === 'vocabulary') {
          wrongDiscoveryRecorded = true;
        }

        return {
          questionIndex: index,
          correct: answerGiven === question.correctAnswer,
          answerGiven,
          timeMs: 1800,
        };
      },
    );

    const completion = await completeQuizRound(
      db,
      profile.id,
      round.id,
      results,
    );
    expect(completion.total).toBe(VOCAB_ROUND_SIZE);

    const afterCards = await db.query.vocabularyRetentionCards.findMany({
      where: inArray(vocabularyRetentionCards.vocabularyId, masteryIds),
    });
    expect(afterCards).toHaveLength(3);

    for (const card of afterCards) {
      const before = beforeById.get(card.vocabularyId) as
        | typeof vocabularyRetentionCards.$inferSelect
        | undefined;
      expect(before).toEqual(expect.objectContaining({}));

      const expected = sm2({
        quality: masteryQualityById.get(card.vocabularyId) ?? 4,
        card: {
          easeFactor: Number(before!.easeFactor),
          interval: Math.max(1, before!.intervalDays),
          repetitions: before!.repetitions,
          lastReviewedAt:
            before!.lastReviewedAt?.toISOString() ?? new Date().toISOString(),
          nextReviewAt:
            before!.nextReviewAt?.toISOString() ?? new Date().toISOString(),
        },
      });

      expect(Number(card.easeFactor)).toBe(expected.card.easeFactor);
      expect(card.intervalDays).toBe(expected.card.interval);
      expect(card.repetitions).toBe(expected.card.repetitions);
      // Date assertions use day-level precision — the production and test
      // sm2() calls run milliseconds apart, so exact ISO match is fragile.
      expect(card.lastReviewedAt?.toISOString().slice(0, 10)).toBe(
        expected.card.lastReviewedAt.slice(0, 10),
      );
      expect(card.nextReviewAt?.toISOString().slice(0, 10)).toBe(
        expected.card.nextReviewAt.slice(0, 10),
      );
    }

    const storedRound = await db.query.quizRounds.findFirst({
      where: and(
        eq(quizRounds.id, round.id),
        eq(quizRounds.profileId, profile.id),
      ),
    });
    expect(storedRound?.status).toBe('completed');

    const missedItems = await db.query.quizMissedItems.findMany({
      where: eq(quizMissedItems.sourceRoundId, round.id),
    });
    expect(missedItems.length).toBeGreaterThanOrEqual(1);
    expect(
      missedItems.some((item: typeof quizMissedItems.$inferSelect) =>
        item.questionText.startsWith('Translate: '),
      ),
    ).toBe(true);
  }, 15_000);
});
