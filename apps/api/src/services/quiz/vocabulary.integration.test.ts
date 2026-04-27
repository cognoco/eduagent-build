jest.mock('../llm', () => ({
  routeAndCall: jest.fn(),
}));

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
import { routeAndCall } from '../llm';
import { completeQuizRound } from './complete-round';
import { generateQuizRound } from './generate-round';
import { getVocabularyRoundContext } from './queries';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.'
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
        rows.map((row) => row.id)
      )
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
  await cleanupTestAccounts();
});

afterAll(async () => {
  await cleanupTestAccounts();
});

describe('vocabulary quiz round lifecycle (integration)', () => {
  // Timeout raised to 15s — CI PostgreSQL service container is slower than
  // Neon for seeding + full generate → complete lifecycle with real DB writes.
  it('generates a round, completes it, updates SM-2 cards, and stores missed discovery items', async () => {
    const { db, profile, subject } = await seedProfileAndSubject();
    await seedVocabularyBank(profile.id, subject.id);

    (routeAndCall as jest.Mock).mockResolvedValue({
      response: JSON.stringify({
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
      }),
      provider: 'mock',
      model: 'mock',
      latencyMs: 25,
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

    expect(round.questions).toHaveLength(6);
    const masteryQuestions = round.questions.filter(
      (question): question is Extract<QuizQuestion, { type: 'vocabulary' }> =>
        question.type === 'vocabulary' && question.isLibraryItem
    );
    expect(masteryQuestions).toHaveLength(3);

    const masteryIds = masteryQuestions.map(
      (question) => question.vocabularyId!
    );
    const beforeCards = await db.query.vocabularyRetentionCards.findMany({
      where: inArray(vocabularyRetentionCards.vocabularyId, masteryIds),
    });
    const beforeById = new Map(
      beforeCards.map((card) => [card.vocabularyId, card] as const)
    );

    let wrongDiscoveryRecorded = false;
    const masteryQualityById = new Map<string, number>();
    const results = round.questions.map((question, index) => {
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
    });

    const completion = await completeQuizRound(
      db,
      profile.id,
      round.id,
      results
    );
    expect(completion.total).toBe(6);

    const afterCards = await db.query.vocabularyRetentionCards.findMany({
      where: inArray(vocabularyRetentionCards.vocabularyId, masteryIds),
    });
    expect(afterCards).toHaveLength(3);

    for (const card of afterCards) {
      const before = beforeById.get(card.vocabularyId);
      expect(before).toBeDefined();

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
        expected.card.lastReviewedAt.slice(0, 10)
      );
      expect(card.nextReviewAt?.toISOString().slice(0, 10)).toBe(
        expected.card.nextReviewAt.slice(0, 10)
      );
    }

    const storedRound = await db.query.quizRounds.findFirst({
      where: and(
        eq(quizRounds.id, round.id),
        eq(quizRounds.profileId, profile.id)
      ),
    });
    expect(storedRound?.status).toBe('completed');

    const missedItems = await db.query.quizMissedItems.findMany({
      where: eq(quizMissedItems.sourceRoundId, round.id),
    });
    expect(missedItems.length).toBeGreaterThanOrEqual(1);
    expect(
      missedItems.some((item) => item.questionText.startsWith('Translate: '))
    ).toBe(true);
  }, 15_000);
});
