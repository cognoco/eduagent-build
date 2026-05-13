import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  generateUUIDv7,
  learningSessions,
  profiles,
  sessionEvents,
  sessionSummaries,
  subjects,
  type Database,
} from '@eduagent/database';
import { eq, like } from 'drizzle-orm';
import {
  flagContent,
  getSession,
  getSessionTranscript,
  recordSessionEvent,
  resetSessionStaticContextCache,
  setSessionInputMode,
  startSession,
  syncHomeworkState,
} from './session';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

const RUN_ID = generateUUIDv7();
let seedCounter = 0;

async function seedProfile(): Promise<{
  accountId: string;
  profileId: string;
}> {
  const idx = ++seedCounter;
  const clerkUserId = `clerk_session_ops_${RUN_ID}_${idx}`;
  const email = `session-ops-${RUN_ID}-${idx}@test.invalid`;

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Integration Learner',
      birthYear: 2010,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  return { accountId: account!.id, profileId: profile!.id };
}

async function seedSubject(profileId: string): Promise<string> {
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: 'Mathematics',
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  return subject!.id;
}

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set for session operations integration tests',
    );
  }

  db = createDatabase(databaseUrl);
});

beforeEach(() => {
  resetSessionStaticContextCache();
});

afterAll(async () => {
  resetSessionStaticContextCache();
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `clerk_session_ops_${RUN_ID}%`));
});

describe('session operations integration', () => {
  it('loads a persisted session and updates its input mode in both column and metadata', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);

    const session = await startSession(db, profileId, subjectId, {
      subjectId,
      sessionType: 'learning',
      inputMode: 'text',
    });

    const loaded = await getSession(db, profileId, session.id);
    const updated = await setSessionInputMode(db, profileId, session.id, {
      inputMode: 'voice',
    });
    const storedRow = await db.query.learningSessions.findFirst({
      where: eq(learningSessions.id, session.id),
    });

    expect(loaded).toEqual(expect.objectContaining({ id: session.id }));
    expect(updated.inputMode).toBe('voice');
    expect(storedRow?.inputMode).toBe('voice');
    expect(storedRow?.metadata).toMatchObject({ inputMode: 'voice' });
  });

  it('returns a transcript with system prompts, learner turns, assistant turns, and milestones', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);

    const session = await startSession(db, profileId, subjectId, {
      subjectId,
      sessionType: 'learning',
      inputMode: 'text',
    });

    await db.insert(sessionEvents).values([
      {
        sessionId: session.id,
        profileId,
        subjectId,
        eventType: 'system_prompt',
        content: 'Use a diagram first.',
      },
      {
        sessionId: session.id,
        profileId,
        subjectId,
        eventType: 'user_message',
        content: 'Can you explain fractions?',
      },
      {
        sessionId: session.id,
        profileId,
        subjectId,
        eventType: 'ai_response',
        content: 'Let us compare the slices.',
        metadata: { escalationRung: 2 },
      },
    ]);

    await db
      .update(learningSessions)
      .set({
        wallClockSeconds: 180,
        metadata: { milestonesReached: ['persistent'] },
      })
      .where(eq(learningSessions.id, session.id));

    const transcript = await getSessionTranscript(db, profileId, session.id);

    if (!transcript || transcript.archived) {
      throw new Error(
        `Expected a live (non-archived) transcript, got: ${JSON.stringify(transcript)}`,
      );
    }
    const liveTranscript = transcript;
    expect(liveTranscript.session).toEqual(
      expect.objectContaining({
        sessionId: session.id,
        subjectId,
        milestonesReached: ['persistent'],
        wallClockSeconds: 180,
      }),
    );
    expect(liveTranscript.exchanges).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'Use a diagram first.',
        isSystemPrompt: true,
      }),
      expect.objectContaining({
        role: 'user',
        content: 'Can you explain fractions?',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Let us compare the slices.',
        escalationRung: 2,
      }),
    ]);
  });

  it('returns the archived transcript shape when purgedAt is set', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);

    const session = await startSession(db, profileId, subjectId, {
      subjectId,
      sessionType: 'learning',
      inputMode: 'text',
    });

    await db.insert(sessionSummaries).values({
      sessionId: session.id,
      profileId,
      topicId: null,
      learnerRecap: 'You connected equivalent fractions to the picture model.',
      llmSummary: {
        narrative:
          'Worked through equivalent fractions and matched each fraction to a visual model together.',
        topicsCovered: ['equivalent fractions', 'visual model'],
        sessionState: 'completed',
        reEntryRecommendation:
          'Resume with one more equivalent-fractions example and ask for the pattern aloud.',
      },
      status: 'accepted',
      summaryGeneratedAt: new Date('2026-03-01T10:00:00.000Z'),
      purgedAt: new Date('2026-04-01T10:00:00.000Z'),
    });

    const transcript = await getSessionTranscript(db, profileId, session.id);

    expect(transcript).not.toBeNull();
    expect(transcript?.archived).toBe(true);
    if (transcript?.archived !== true) {
      throw new Error('expected archived transcript response');
    }
    expect(transcript).toEqual(
      expect.objectContaining({
        archivedAt: '2026-04-01T10:00:00.000Z',
        summary: expect.objectContaining({
          topicId: null,
          learnerRecap:
            'You connected equivalent fractions to the picture model.',
          sessionState: 'completed',
        }),
      }),
    );
  });

  it('syncs homework state, records lifecycle events once, and preserves tracking metadata', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);

    const session = await startSession(db, profileId, subjectId, {
      subjectId,
      sessionType: 'homework',
      inputMode: 'text',
      metadata: {
        homework: {
          problemCount: 2,
          currentProblemIndex: 0,
          problems: [],
        },
      },
    });

    const payload = {
      metadata: {
        problemCount: 2,
        currentProblemIndex: 1,
        source: 'camera' as const,
        problems: [
          {
            id: 'problem-1',
            text: 'Solve 2x = 8',
            originalText: 'Solve 2x = B',
            source: 'ocr' as const,
            status: 'active' as const,
            selectedMode: 'help_me' as const,
          },
          {
            id: 'problem-2',
            text: 'Find the slope.',
            source: 'manual' as const,
            status: 'completed' as const,
            selectedMode: 'check_answer' as const,
          },
        ],
      },
    };

    const firstResult = await syncHomeworkState(
      db,
      profileId,
      session.id,
      payload,
    );
    const secondResult = await syncHomeworkState(
      db,
      profileId,
      session.id,
      payload,
    );
    const events = await db.query.sessionEvents.findMany({
      where: eq(sessionEvents.sessionId, session.id),
    });
    const storedRow = await db.query.learningSessions.findFirst({
      where: eq(learningSessions.id, session.id),
    });

    // The return type annotation `Promise<{ metadata: HomeworkSessionMetadata }>`
    // is narrower than the actual runtime shape, which also includes
    // loggedCorrectionIds / loggedStartedProblemIds / loggedCompletedProblemIds.
    // Widen the source annotation in `services/session/session-homework.ts` and
    // remove this cast. Tracked in Notion bug tracker:
    // https://www.notion.so/35f8bce91f7c8104bc43f77e0627032c
    // (Verified 2026-05-13: no other callers read these three fields, so this
    // is the only test site affected.)
    const firstMeta = firstResult.metadata as Record<string, unknown>;
    expect(firstMeta['loggedCorrectionIds']).toEqual(['problem-1']);
    expect(firstMeta['loggedStartedProblemIds']).toEqual(['problem-1']);
    expect(firstMeta['loggedCompletedProblemIds']).toEqual(['problem-2']);
    expect(secondResult.metadata).toEqual(firstResult.metadata);
    expect(
      events.map((event: typeof sessionEvents.$inferSelect) => event.eventType),
    ).toEqual(
      expect.arrayContaining([
        'session_start',
        'ocr_correction',
        'homework_problem_started',
        'homework_problem_completed',
      ]),
    );
    expect(
      events.filter(
        (event: typeof sessionEvents.$inferSelect) =>
          event.eventType === 'ocr_correction',
      ),
    ).toHaveLength(1);
    expect(
      events.filter(
        (event: typeof sessionEvents.$inferSelect) =>
          event.eventType === 'homework_problem_started',
      ),
    ).toHaveLength(1);
    expect(
      events.filter(
        (event: typeof sessionEvents.$inferSelect) =>
          event.eventType === 'homework_problem_completed',
      ),
    ).toHaveLength(1);
    expect(storedRow?.metadata).toMatchObject({
      homework: expect.objectContaining({
        loggedCorrectionIds: ['problem-1'],
        loggedStartedProblemIds: ['problem-1'],
        loggedCompletedProblemIds: ['problem-2'],
      }),
    });
  });

  it('records quick actions and content flags as session audit events', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);

    const session = await startSession(db, profileId, subjectId, {
      subjectId,
      sessionType: 'learning',
      inputMode: 'text',
    });
    const flaggedEventId = generateUUIDv7();

    await recordSessionEvent(db, profileId, session.id, {
      eventType: 'quick_action',
      content: 'Need an example',
      metadata: { action: 'example' },
    });
    const result = await flagContent(db, profileId, session.id, {
      eventId: flaggedEventId,
      reason: 'Incorrect information',
    });
    const events = await db.query.sessionEvents.findMany({
      where: eq(sessionEvents.sessionId, session.id),
    });

    expect(result).toEqual({
      message: 'Content flagged for review. Thank you!',
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'quick_action',
          content: 'Need an example',
          metadata: { action: 'example' },
        }),
        expect.objectContaining({
          eventType: 'flag',
          content: 'Content flagged',
          metadata: {
            eventId: flaggedEventId,
            reason: 'Incorrect information',
          },
        }),
      ]),
    );
  });
});
