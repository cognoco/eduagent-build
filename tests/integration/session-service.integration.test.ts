/**
 * Integration: Session service
 *
 * Exercises real session service functions against a real database.
 * This suite targets mock-heavy persistence/query paths that route tests do
 * not fully cover on their own.
 */

import { asc, eq } from 'drizzle-orm';
import {
  accounts,
  profiles,
  subjects,
  curricula,
  curriculumBooks,
  curriculumTopics,
  learningModes,
  learningSessions,
  sessionEvents,
  sessionSummaries,
} from '@eduagent/database';
import type {
  SessionType,
  InputMode,
  VerificationType,
} from '@eduagent/schemas';

import {
  backfillSessionTopicId,
  closeSession,
  closeStaleSessions,
  getBookSessions,
  getSessionTranscript,
  recordSystemPrompt,
  setSessionInputMode,
  syncHomeworkState,
} from '../../apps/api/src/services/session';
import { cleanupAccounts, createIntegrationDb } from './helpers';

const TEST_ACCOUNTS = [
  {
    clerkUserId: 'integration-session-service-01',
    email: 'integration-session-service-01@integration.test',
  },
  {
    clerkUserId: 'integration-session-service-02',
    email: 'integration-session-service-02@integration.test',
  },
  {
    clerkUserId: 'integration-session-service-03',
    email: 'integration-session-service-03@integration.test',
  },
  {
    clerkUserId: 'integration-session-service-04',
    email: 'integration-session-service-04@integration.test',
  },
  {
    clerkUserId: 'integration-session-service-05',
    email: 'integration-session-service-05@integration.test',
  },
  {
    clerkUserId: 'integration-session-service-06',
    email: 'integration-session-service-06@integration.test',
  },
];

const ALL_EMAILS = TEST_ACCOUNTS.map((account) => account.email);
const ALL_CLERK_USER_IDS = TEST_ACCOUNTS.map((account) => account.clerkUserId);

async function seedAccount(index: number) {
  const db = createIntegrationDb();
  const account = TEST_ACCOUNTS[index]!;
  const [row] = await db
    .insert(accounts)
    .values({
      clerkUserId: account.clerkUserId,
      email: account.email,
    })
    .returning();

  return row!;
}

async function seedProfile(index: number) {
  const db = createIntegrationDb();
  const account = await seedAccount(index);
  const [row] = await db
    .insert(profiles)
    .values({
      accountId: account.id,
      displayName: `Integration Learner ${index + 1}`,
      birthYear: 2000,
      isOwner: true,
    })
    .returning();

  return {
    account,
    profile: row!,
  };
}

async function seedSubject(profileId: string, name = 'Biology') {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(subjects)
    .values({
      profileId,
      name,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning();

  return row!;
}

async function seedCurriculum(
  subjectId: string,
  topicInputs: Array<{ title: string; chapter?: string }> = [
    { title: 'Photosynthesis', chapter: 'Foundations' },
    { title: 'Cellular Respiration', chapter: 'Foundations' },
  ]
) {
  const db = createIntegrationDb();
  const [curriculum] = await db
    .insert(curricula)
    .values({
      subjectId,
      version: 1,
    })
    .returning();

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId,
      title: 'Integration Test Book',
      sortOrder: 1,
    })
    .returning();

  const topics = await db
    .insert(curriculumTopics)
    .values(
      topicInputs.map((topic, index) => ({
        curriculumId: curriculum!.id,
        bookId: book!.id,
        title: topic.title,
        description: `${topic.title} description`,
        chapter: topic.chapter ?? null,
        sortOrder: index + 1,
        estimatedMinutes: 15,
      }))
    )
    .returning();

  return {
    curriculum: curriculum!,
    book: book!,
    topics,
  };
}

async function seedSession(input: {
  profileId: string;
  subjectId: string;
  topicId?: string | null;
  sessionType?: SessionType;
  status?: 'active' | 'paused' | 'completed' | 'auto_closed';
  exchangeCount?: number;
  escalationRung?: number;
  inputMode?: InputMode;
  verificationType?: VerificationType | null;
  startedAt?: Date;
  lastActivityAt?: Date;
  endedAt?: Date | null;
  durationSeconds?: number | null;
  wallClockSeconds?: number | null;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const db = createIntegrationDb();
  const [row] = await db
    .insert(learningSessions)
    .values({
      profileId: input.profileId,
      subjectId: input.subjectId,
      topicId: input.topicId ?? null,
      sessionType: input.sessionType ?? 'learning',
      status: input.status ?? 'active',
      exchangeCount: input.exchangeCount ?? 0,
      escalationRung: input.escalationRung ?? 1,
      inputMode: input.inputMode ?? 'text',
      verificationType: input.verificationType ?? null,
      startedAt: input.startedAt ?? new Date('2026-04-10T10:00:00.000Z'),
      lastActivityAt:
        input.lastActivityAt ?? new Date('2026-04-10T10:00:00.000Z'),
      endedAt: input.endedAt ?? null,
      durationSeconds: input.durationSeconds ?? null,
      wallClockSeconds: input.wallClockSeconds ?? null,
      metadata: input.metadata ?? {},
      createdAt: input.createdAt ?? input.startedAt,
      updatedAt: input.updatedAt ?? input.lastActivityAt ?? input.startedAt,
    })
    .returning();

  return row!;
}

async function seedSessionEvents(input: {
  sessionId: string;
  profileId: string;
  subjectId: string;
  topicId?: string | null;
  events: Array<{
    eventType:
      | 'user_message'
      | 'ai_response'
      | 'system_prompt'
      | 'ocr_correction'
      | 'homework_problem_started'
      | 'homework_problem_completed';
    content: string;
    createdAt: Date;
    metadata?: Record<string, unknown>;
  }>;
}) {
  const db = createIntegrationDb();
  await db.insert(sessionEvents).values(
    input.events.map((event) => ({
      sessionId: input.sessionId,
      profileId: input.profileId,
      subjectId: input.subjectId,
      topicId: input.topicId ?? undefined,
      eventType: event.eventType,
      content: event.content,
      metadata: event.metadata ?? {},
      createdAt: event.createdAt,
    }))
  );
}

async function loadSession(sessionId: string) {
  const db = createIntegrationDb();
  return db.query.learningSessions.findFirst({
    where: eq(learningSessions.id, sessionId),
  });
}

async function loadSessionEvents(sessionId: string) {
  const db = createIntegrationDb();
  return db.query.sessionEvents.findMany({
    where: eq(sessionEvents.sessionId, sessionId),
    orderBy: asc(sessionEvents.createdAt),
  });
}

async function loadSummary(sessionId: string) {
  const db = createIntegrationDb();
  return db.query.sessionSummaries.findFirst({
    where: eq(sessionSummaries.sessionId, sessionId),
  });
}

async function loadLearningMode(profileId: string) {
  const db = createIntegrationDb();
  return db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });
}

beforeEach(async () => {
  await cleanupAccounts({
    emails: ALL_EMAILS,
    clerkUserIds: ALL_CLERK_USER_IDS,
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: ALL_EMAILS,
    clerkUserIds: ALL_CLERK_USER_IDS,
  });
});

describe('Integration: session service', () => {
  it('closes a real interleaved session, computes active seconds, and persists skipped-summary state', async () => {
    const { profile } = await seedProfile(0);
    const subject = await seedSubject(profile.id, 'Physics');
    const { topics } = await seedCurriculum(subject.id, [
      { title: 'Gravity', chapter: 'Mechanics' },
      { title: 'Momentum', chapter: 'Mechanics' },
    ]);
    const session = await seedSession({
      profileId: profile.id,
      subjectId: subject.id,
      sessionType: 'interleaved',
      startedAt: new Date('2026-04-10T10:00:00.000Z'),
      lastActivityAt: new Date('2026-04-10T10:06:00.000Z'),
      metadata: {
        interleavedTopics: topics.map((topic) => ({
          topicId: topic.id,
          subjectId: subject.id,
        })),
      },
    });

    await seedSessionEvents({
      sessionId: session.id,
      profileId: profile.id,
      subjectId: subject.id,
      events: [
        {
          eventType: 'user_message',
          content: 'Why do things fall?',
          createdAt: new Date('2026-04-10T10:01:00.000Z'),
        },
        {
          eventType: 'ai_response',
          content: 'Think about the force involved.',
          createdAt: new Date('2026-04-10T10:05:00.000Z'),
          metadata: { escalationRung: 2, expectedResponseMinutes: 2 },
        },
        {
          eventType: 'ai_response',
          content: 'Now connect that to mass.',
          createdAt: new Date('2026-04-10T10:06:00.000Z'),
          metadata: { escalationRung: 3 },
        },
      ],
    });

    const result = await closeSession(
      createIntegrationDb(),
      profile.id,
      session.id,
      {
        summaryStatus: 'skipped',
      }
    );

    const persistedSession = await loadSession(session.id);
    const summary = await loadSummary(session.id);
    const learningMode = await loadLearningMode(profile.id);

    expect(result.summaryStatus).toBe('skipped');
    expect(result.interleavedTopicIds).toEqual(topics.map((topic) => topic.id));
    expect(result.escalationRungs).toEqual([2, 3]);
    expect(persistedSession!.status).toBe('completed');
    expect(persistedSession!.durationSeconds).toBe(300);
    expect(summary!.status).toBe('skipped');
    expect(learningMode!.consecutiveSummarySkips).toBe(1);
  });

  it('persists session input mode and system prompts into the real transcript path', async () => {
    const { profile } = await seedProfile(1);
    const subject = await seedSubject(profile.id, 'Chemistry');
    const { topics } = await seedCurriculum(subject.id, [
      { title: 'Atoms', chapter: 'Basics' },
    ]);
    const session = await seedSession({
      profileId: profile.id,
      subjectId: subject.id,
      topicId: topics[0]!.id,
      metadata: {
        milestonesReached: ['first_correct_answer'],
      },
      startedAt: new Date('2026-04-10T11:00:00.000Z'),
      lastActivityAt: new Date('2026-04-10T11:01:00.000Z'),
    });

    await seedSessionEvents({
      sessionId: session.id,
      profileId: profile.id,
      subjectId: subject.id,
      topicId: topics[0]!.id,
      events: [
        {
          eventType: 'user_message',
          content: 'What is an atom?',
          createdAt: new Date('2026-04-10T11:00:30.000Z'),
        },
        {
          eventType: 'ai_response',
          content: 'It is the basic unit of matter.',
          createdAt: new Date('2026-04-10T11:01:00.000Z'),
          metadata: { escalationRung: 2 },
        },
      ],
    });

    const beforeUpdate = await loadSession(session.id);

    const updated = await setSessionInputMode(
      createIntegrationDb(),
      profile.id,
      session.id,
      {
        inputMode: 'voice',
      }
    );

    await recordSystemPrompt(
      createIntegrationDb(),
      profile.id,
      session.id,
      'Take your time. I am here when you are ready.',
      { source: 'silence-nudge' }
    );

    const transcript = await getSessionTranscript(
      createIntegrationDb(),
      profile.id,
      session.id
    );
    const persistedSession = await loadSession(session.id);
    const events = await loadSessionEvents(session.id);

    expect(updated.inputMode).toBe('voice');
    expect(
      (persistedSession!.metadata as Record<string, unknown>)['inputMode']
    ).toBe('voice');
    expect(persistedSession!.lastActivityAt.getTime()).toBeGreaterThan(
      beforeUpdate!.lastActivityAt.getTime()
    );
    expect(events.map((event) => event.eventType)).toEqual([
      'user_message',
      'ai_response',
      'system_prompt',
    ]);
    expect(transcript).not.toBeNull();
    expect(transcript!.session.inputMode).toBe('voice');
    expect(transcript!.exchanges).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'What is an atom?',
        isSystemPrompt: false,
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'It is the basic unit of matter.',
        escalationRung: 2,
        isSystemPrompt: false,
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Take your time. I am here when you are ready.',
        isSystemPrompt: true,
        escalationRung: undefined,
      }),
    ]);
  });

  it('syncs homework metadata against the real row and logs OCR/status events only once', async () => {
    const { profile } = await seedProfile(2);
    const subject = await seedSubject(profile.id, 'Algebra');
    const { topics } = await seedCurriculum(subject.id, [
      { title: 'Linear Equations', chapter: 'Equations' },
    ]);
    const session = await seedSession({
      profileId: profile.id,
      subjectId: subject.id,
      topicId: topics[0]!.id,
      sessionType: 'homework',
      metadata: {
        homework: {
          problemCount: 0,
          currentProblemIndex: 0,
          problems: [],
        },
      },
    });

    const payload = {
      metadata: {
        problemCount: 2,
        currentProblemIndex: 1,
        problems: [
          {
            id: 'problem-1',
            text: 'Solve 2x + 5 = 17',
            originalText: 'Solve 2x + 5 = l7',
            source: 'ocr' as const,
            status: 'completed' as const,
            selectedMode: 'help_me' as const,
          },
          {
            id: 'problem-2',
            text: 'Factor x^2 + 3x + 2',
            source: 'manual' as const,
            status: 'active' as const,
            selectedMode: 'check_answer' as const,
          },
        ],
      },
    };

    const first = await syncHomeworkState(
      createIntegrationDb(),
      profile.id,
      session.id,
      payload
    );
    await syncHomeworkState(
      createIntegrationDb(),
      profile.id,
      session.id,
      payload
    );

    const persistedSession = await loadSession(session.id);
    const events = await loadSessionEvents(session.id);
    const homeworkMetadata = (
      persistedSession!.metadata as {
        homework?: Record<string, unknown>;
      }
    ).homework as Record<string, unknown>;

    expect(first.metadata.problemCount).toBe(2);
    expect(events.map((event) => event.eventType)).toEqual([
      'ocr_correction',
      'homework_problem_completed',
      'homework_problem_started',
    ]);
    expect(homeworkMetadata['loggedCorrectionIds']).toEqual(['problem-1']);
    expect(homeworkMetadata['loggedCompletedProblemIds']).toEqual([
      'problem-1',
    ]);
    expect(homeworkMetadata['loggedStartedProblemIds']).toEqual(['problem-2']);
  });

  it('returns real book sessions only for qualifying completed rows and includes freeform sessions after backfill', async () => {
    const { profile } = await seedProfile(3);
    const subject = await seedSubject(profile.id, 'History');
    const { book, topics } = await seedCurriculum(subject.id, [
      { title: 'Ancient Egypt', chapter: 'Civilizations' },
      { title: 'Ancient Greece', chapter: 'Civilizations' },
    ]);

    const qualifyingByCount = await seedSession({
      profileId: profile.id,
      subjectId: subject.id,
      topicId: topics[0]!.id,
      status: 'completed',
      exchangeCount: 3,
      durationSeconds: 30,
      startedAt: new Date('2026-04-10T10:00:00.000Z'),
      lastActivityAt: new Date('2026-04-10T10:05:00.000Z'),
      endedAt: new Date('2026-04-10T10:05:00.000Z'),
      createdAt: new Date('2026-04-10T10:00:00.000Z'),
      updatedAt: new Date('2026-04-10T10:05:00.000Z'),
    });
    const qualifyingByDuration = await seedSession({
      profileId: profile.id,
      subjectId: subject.id,
      topicId: topics[1]!.id,
      status: 'completed',
      exchangeCount: 1,
      durationSeconds: 120,
      startedAt: new Date('2026-04-10T11:00:00.000Z'),
      lastActivityAt: new Date('2026-04-10T11:08:00.000Z'),
      endedAt: new Date('2026-04-10T11:08:00.000Z'),
      createdAt: new Date('2026-04-10T11:00:00.000Z'),
      updatedAt: new Date('2026-04-10T11:08:00.000Z'),
    });
    await seedSession({
      profileId: profile.id,
      subjectId: subject.id,
      topicId: topics[0]!.id,
      status: 'completed',
      exchangeCount: 0,
      durationSeconds: 59,
      startedAt: new Date('2026-04-10T12:00:00.000Z'),
      lastActivityAt: new Date('2026-04-10T12:03:00.000Z'),
      endedAt: new Date('2026-04-10T12:03:00.000Z'),
      createdAt: new Date('2026-04-10T12:00:00.000Z'),
      updatedAt: new Date('2026-04-10T12:03:00.000Z'),
    });
    const freeformSession = await seedSession({
      profileId: profile.id,
      subjectId: subject.id,
      topicId: null,
      status: 'completed',
      exchangeCount: 1,
      durationSeconds: 90,
      startedAt: new Date('2026-04-10T13:00:00.000Z'),
      lastActivityAt: new Date('2026-04-10T13:05:00.000Z'),
      endedAt: new Date('2026-04-10T13:05:00.000Z'),
      createdAt: new Date('2026-04-10T13:00:00.000Z'),
      updatedAt: new Date('2026-04-10T13:05:00.000Z'),
    });
    await seedSession({
      profileId: profile.id,
      subjectId: subject.id,
      topicId: topics[1]!.id,
      status: 'active',
      exchangeCount: 6,
      durationSeconds: 500,
      startedAt: new Date('2026-04-10T14:00:00.000Z'),
      lastActivityAt: new Date('2026-04-10T14:05:00.000Z'),
      createdAt: new Date('2026-04-10T14:00:00.000Z'),
      updatedAt: new Date('2026-04-10T14:05:00.000Z'),
    });

    const beforeBackfill = await getBookSessions(
      createIntegrationDb(),
      profile.id,
      book.id
    );

    await backfillSessionTopicId(
      createIntegrationDb(),
      profile.id,
      freeformSession.id,
      topics[0]!.id
    );

    const afterBackfill = await getBookSessions(
      createIntegrationDb(),
      profile.id,
      book.id
    );

    expect(beforeBackfill.map((session) => session.id)).toEqual([
      qualifyingByDuration.id,
      qualifyingByCount.id,
    ]);
    expect(afterBackfill.map((session) => session.id)).toEqual([
      freeformSession.id,
      qualifyingByDuration.id,
      qualifyingByCount.id,
    ]);
    expect(afterBackfill[0]).toMatchObject({
      topicId: topics[0]!.id,
      topicTitle: 'Ancient Egypt',
      chapter: 'Civilizations',
    });
  });

  it('auto-closes only stale active sessions across real profile rows', async () => {
    const first = await seedProfile(4);
    const second = await seedProfile(5);
    const staleSubject = await seedSubject(first.profile.id, 'Geometry');
    const freshSubject = await seedSubject(second.profile.id, 'Literature');
    const staleSession = await seedSession({
      profileId: first.profile.id,
      subjectId: staleSubject.id,
      status: 'active',
      startedAt: new Date('2026-04-10T08:30:00.000Z'),
      lastActivityAt: new Date('2026-04-10T09:00:00.000Z'),
    });
    const freshSession = await seedSession({
      profileId: second.profile.id,
      subjectId: freshSubject.id,
      status: 'active',
      startedAt: new Date('2026-04-10T10:30:00.000Z'),
      lastActivityAt: new Date('2026-04-10T10:45:00.000Z'),
    });

    await seedSessionEvents({
      sessionId: staleSession.id,
      profileId: first.profile.id,
      subjectId: staleSubject.id,
      events: [
        {
          eventType: 'ai_response',
          content: 'Try sketching the shape first.',
          createdAt: new Date('2026-04-10T08:45:00.000Z'),
          metadata: { escalationRung: 2 },
        },
      ],
    });

    const results = await closeStaleSessions(
      createIntegrationDb(),
      new Date('2026-04-10T10:00:00.000Z')
    );

    const persistedStale = await loadSession(staleSession.id);
    const persistedFresh = await loadSession(freshSession.id);
    const staleSummary = await loadSummary(staleSession.id);
    const freshSummary = await loadSummary(freshSession.id);
    const scopedResults = results.filter(
      (result) =>
        result.profileId === first.profile.id ||
        result.profileId === second.profile.id
    );

    expect(scopedResults).toHaveLength(1);
    expect(scopedResults[0]).toMatchObject({
      profileId: first.profile.id,
      sessionId: staleSession.id,
      subjectId: staleSubject.id,
      summaryStatus: 'auto_closed',
      escalationRungs: [2],
    });
    expect(persistedStale!.status).toBe('auto_closed');
    expect(persistedFresh!.status).toBe('active');
    expect(staleSummary!.status).toBe('auto_closed');
    expect(freshSummary).toBeUndefined();
  });
});
