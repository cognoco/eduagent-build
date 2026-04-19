/**
 * Integration: session-completed Inngest pipeline (STAB-3.4)
 *
 * Calls the Inngest function handler directly against a real database.
 * No Inngest runtime or dev server required — the handler's business logic
 * and DB interactions are tested end-to-end.
 *
 * Mocked boundaries (true external dependencies):
 * - Voyage AI embedding storage (`storeSessionEmbedding`)
 * - Sentry error reporting (`captureException`)
 *
 * Real:
 * - Database (Drizzle / Neon or pg for CI — shimmed in setup.ts)
 * - Repositories and all internal services
 * - LLM router (registered with mock provider via setup.ts)
 * - Inngest step utilities (simple passthrough object)
 *
 * Test cases:
 *   1. generates curriculum updates after session completion
 *      → SM-2 algorithm is applied to retentionCards (nextReviewAt, intervalDays updated)
 *   2. generates retention cards from session exchanges
 *      → auto-creates a retentionCard row when none exists
 *   3. handles sessions with zero meaningful exchanges gracefully
 *      → no errors, no spurious data, retention/deepening steps skipped
 */

import { eq, and } from 'drizzle-orm';
import {
  accounts,
  familyLinks,
  profiles,
  subjects,
  curricula,
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  sessionEvents,
  retentionCards,
  sessionSummaries,
} from '@eduagent/database';
import {
  registerProvider,
  createMockProvider,
} from '../../apps/api/src/services/llm';
import { getChildSessionDetail } from '../../apps/api/src/services/dashboard';

import { cleanupAccounts, createIntegrationDb } from './helpers';

// ---------------------------------------------------------------------------
// External boundary mocks — must be declared before importing the handler
// ---------------------------------------------------------------------------

const mockStoreSessionEmbedding = jest.fn().mockResolvedValue(undefined);
const mockExtractSessionContent = jest
  .fn()
  .mockResolvedValue(
    'User: What is photosynthesis?\n\nAI: Plants use sunlight to make food.'
  );
const mockCaptureException = jest.fn();

jest.mock('../../apps/api/src/services/embeddings', () => {
  const actual = jest.requireActual(
    '../../apps/api/src/services/embeddings'
  ) as Record<string, unknown>;
  return {
    ...actual,
    storeSessionEmbedding: (...args: unknown[]) =>
      mockStoreSessionEmbedding(...args),
    extractSessionContent: (...args: unknown[]) =>
      mockExtractSessionContent(...args),
  };
});

jest.mock('../../apps/api/src/services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { sessionCompleted } from '../../apps/api/src/inngest/functions/session-completed';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTH_USER_ID = 'stab-session-pipeline-integration-user';
const AUTH_EMAIL = 'stab-session-pipeline-integration@test.invalid';
const PARENT_AUTH_USER_ID = 'stab-session-pipeline-integration-parent';
const PARENT_AUTH_EMAIL = 'stab-session-pipeline-parent@test.invalid';
const SESSION_TIMESTAMP = '2026-02-24T10:00:00.000Z';

// ---------------------------------------------------------------------------
// executeChain — calls the handler directly with a passthrough step mock
// ---------------------------------------------------------------------------

interface ChainResult {
  status: 'completed' | 'completed-with-errors';
  sessionId: string;
  outcomes: Array<{
    step: string;
    status: 'ok' | 'skipped' | 'failed';
    error?: string;
  }>;
}

async function executeChain(
  eventData: Record<string, unknown>
): Promise<ChainResult> {
  const mockStep = {
    // Each step's callback is invoked immediately — no Inngest runtime needed
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sleep: jest.fn(),
    waitForEvent: jest.fn().mockResolvedValue(null),
  };

  // Access the raw handler (.fn is the Inngest-internal property set by createFunction)
  const handler = (sessionCompleted as any).fn;
  return handler({
    event: { data: eventData, name: 'app/session.completed' },
    step: mockStep,
  });
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

interface Scenario {
  profileId: string;
  subjectId: string;
  topicId: string;
  sessionId: string;
}

async function seedScenario(options?: {
  includePreExistingRetentionCard?: boolean;
  sessionExchanges?: Array<{
    eventType: 'user_message' | 'ai_response';
    content: string;
    offsetSeconds: number;
  }>;
}): Promise<Scenario> {
  const db = createIntegrationDb();

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId: AUTH_USER_ID, email: AUTH_EMAIL })
    .returning();

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'STAB Pipeline Learner',
      birthYear: 2000,
      isOwner: true,
    })
    .returning();

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: profile!.id,
      name: 'Biology',
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning();

  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id, version: 1 })
    .returning();

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: 'Biology Fundamentals',
      sortOrder: 1,
    })
    .returning();

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: 'Photosynthesis',
      description: 'How plants convert light into energy',
      sortOrder: 1,
      estimatedMinutes: 15,
    })
    .returning();

  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId: profile!.id,
      subjectId: subject!.id,
      topicId: topic!.id,
      sessionType: 'learning',
      status: 'completed',
      escalationRung: 2,
      exchangeCount: options?.sessionExchanges?.length ?? 2,
      startedAt: new Date('2026-02-24T09:58:00.000Z'),
      lastActivityAt: new Date('2026-02-24T10:00:30.000Z'),
    })
    .returning();

  // Seed session exchanges (default: two-turn exchange)
  const exchanges = options?.sessionExchanges ?? [
    {
      eventType: 'user_message' as const,
      content: 'What is photosynthesis?',
      offsetSeconds: 0,
    },
    {
      eventType: 'ai_response' as const,
      content: 'Photosynthesis is how plants make food from sunlight.',
      offsetSeconds: 10,
    },
    {
      eventType: 'user_message' as const,
      content: 'So plants use light, water, and carbon dioxide?',
      offsetSeconds: 40,
    },
  ];

  if (exchanges.length > 0) {
    await db.insert(sessionEvents).values(
      exchanges.map((ex) => ({
        sessionId: session!.id,
        profileId: profile!.id,
        subjectId: subject!.id,
        topicId: topic!.id,
        eventType: ex.eventType,
        content: ex.content,
        createdAt: new Date(
          new Date('2026-02-24T10:00:00.000Z').getTime() +
            ex.offsetSeconds * 1000
        ),
      }))
    );
  }

  // Optionally seed a pre-existing retention card (simulates a topic reviewed before)
  if (options?.includePreExistingRetentionCard) {
    await db.insert(retentionCards).values({
      profileId: profile!.id,
      topicId: topic!.id,
      easeFactor: '2.50',
      intervalDays: 3,
      repetitions: 3,
      lastReviewedAt: new Date('2026-02-21T10:00:00.000Z'),
      nextReviewAt: new Date('2026-02-24T10:00:00.000Z'),
      consecutiveSuccesses: 2,
      xpStatus: 'pending',
      createdAt: new Date('2026-02-21T10:00:00.000Z'),
      updatedAt: new Date('2026-02-21T10:00:00.000Z'),
    });
  }

  return {
    profileId: profile!.id,
    subjectId: subject!.id,
    topicId: topic!.id,
    sessionId: session!.id,
  };
}

async function seedParentLink(childProfileId: string) {
  const db = createIntegrationDb();

  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: PARENT_AUTH_USER_ID,
      email: PARENT_AUTH_EMAIL,
    })
    .returning();

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'STAB Pipeline Parent',
      birthYear: 1985,
      isOwner: true,
    })
    .returning();

  await db.insert(familyLinks).values({
    parentProfileId: profile!.id,
    childProfileId,
  });

  return profile!.id;
}

// ---------------------------------------------------------------------------
// Loader helpers
// ---------------------------------------------------------------------------

async function loadRetentionCard(profileId: string, topicId: string) {
  const db = createIntegrationDb();
  return db.query.retentionCards.findFirst({
    where: and(
      eq(retentionCards.profileId, profileId),
      eq(retentionCards.topicId, topicId)
    ),
  });
}

async function loadSessionSummary(sessionId: string) {
  const db = createIntegrationDb();
  return db.query.sessionSummaries.findFirst({
    where: eq(sessionSummaries.sessionId, sessionId),
  });
}

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  registerProvider(createMockProvider('gemini'));
  mockStoreSessionEmbedding.mockReset();
  mockStoreSessionEmbedding.mockResolvedValue(undefined);
  mockExtractSessionContent.mockReset();
  mockExtractSessionContent.mockResolvedValue(
    'User: What is photosynthesis?\n\nAI: Plants use sunlight to make food.'
  );
  mockCaptureException.mockReset();

  process.env['VOYAGE_API_KEY'] = 'voyage-stab-pipeline-test-key';

  // Clean up any data left from a previous run of this suite
  await cleanupAccounts({
    emails: [AUTH_EMAIL, PARENT_AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID, PARENT_AUTH_USER_ID],
  });
});

afterEach(async () => {
  delete process.env['VOYAGE_API_KEY'];
  await cleanupAccounts({
    emails: [AUTH_EMAIL, PARENT_AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID, PARENT_AUTH_USER_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [AUTH_EMAIL, PARENT_AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID, PARENT_AUTH_USER_ID],
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('session-completed Inngest pipeline (integration)', () => {
  it('generates curriculum updates after session completion', async () => {
    // Pre-condition: topic has a retention card from a previous review cycle
    const scenario = await seedScenario({
      includePreExistingRetentionCard: true,
    });

    const result = await executeChain({
      profileId: scenario.profileId,
      sessionId: scenario.sessionId,
      topicId: scenario.topicId,
      subjectId: scenario.subjectId,
      summaryStatus: 'pending',
      sessionType: 'learning',
      qualityRating: 4,
      timestamp: SESSION_TIMESTAMP,
    });

    // The chain must return a structured result
    expect(result.sessionId).toBe(scenario.sessionId);
    expect(['completed', 'completed-with-errors']).toContain(result.status);

    // SM-2 algorithm applied: retention card must be updated
    const retentionCard = await loadRetentionCard(
      scenario.profileId,
      scenario.topicId
    );
    expect(retentionCard).not.toBeNull();
    // Good quality (4/5) increments repetitions: 3 → 4+
    expect(retentionCard!.repetitions).toBeGreaterThanOrEqual(4);
    // Good quality extends interval beyond the seeded 3 days
    expect(retentionCard!.intervalDays).toBeGreaterThanOrEqual(3);
    // nextReviewAt must be set to a future date relative to session timestamp
    expect(retentionCard!.nextReviewAt).not.toBeNull();
    expect(retentionCard!.nextReviewAt!.getTime()).toBeGreaterThan(
      new Date(SESSION_TIMESTAMP).getTime()
    );

    // update-retention step must report success (not failed/skipped)
    const retentionOutcome = result.outcomes.find(
      (o) => o.step === 'update-retention'
    );
    expect(retentionOutcome?.status).toBe('ok');

    // Session summary must also be created by the write-coaching-card step
    const summary = await loadSessionSummary(scenario.sessionId);
    expect(summary).not.toBeNull();
    expect(summary!.status).toBe('pending');
  });

  it('generates retention cards from session exchanges', async () => {
    // Pre-condition: no existing retention card for this topic
    const scenario = await seedScenario({
      includePreExistingRetentionCard: false,
    });

    // Verify no card exists before the pipeline runs
    const cardBefore = await loadRetentionCard(
      scenario.profileId,
      scenario.topicId
    );
    expect(cardBefore).toBeUndefined();

    const result = await executeChain({
      profileId: scenario.profileId,
      sessionId: scenario.sessionId,
      topicId: scenario.topicId,
      subjectId: scenario.subjectId,
      summaryStatus: 'pending',
      sessionType: 'learning',
      qualityRating: 4,
      timestamp: SESSION_TIMESTAMP,
    });

    expect(result.sessionId).toBe(scenario.sessionId);

    // updateRetentionFromSession auto-creates via ensureRetentionCard
    const cardAfter = await loadRetentionCard(
      scenario.profileId,
      scenario.topicId
    );
    expect(cardAfter).not.toBeNull();
    expect(cardAfter!.profileId).toBe(scenario.profileId);
    expect(cardAfter!.topicId).toBe(scenario.topicId);
    // SM-2 on a new card with quality=4: repetitions should be 1+
    expect(cardAfter!.repetitions).toBeGreaterThanOrEqual(1);
    // nextReviewAt must be scheduled into the future
    expect(cardAfter!.nextReviewAt).not.toBeNull();
    expect(cardAfter!.nextReviewAt!.getTime()).toBeGreaterThan(
      new Date(SESSION_TIMESTAMP).getTime()
    );

    // update-retention step must report success
    const retentionOutcome = result.outcomes.find(
      (o) => o.step === 'update-retention'
    );
    expect(retentionOutcome?.status).toBe('ok');

    // Embedding was attempted for the session content
    expect(mockStoreSessionEmbedding).toHaveBeenCalledWith(
      expect.anything(),
      scenario.sessionId,
      scenario.profileId,
      scenario.topicId,
      expect.stringContaining('What is photosynthesis?'),
      'voyage-stab-pipeline-test-key'
    );
  });

  it('handles sessions with zero meaningful exchanges gracefully', async () => {
    // Pre-condition: session with no session_events rows at all
    const scenario = await seedScenario({
      includePreExistingRetentionCard: false,
      sessionExchanges: [],
    });

    const result = await executeChain({
      profileId: scenario.profileId,
      sessionId: scenario.sessionId,
      topicId: scenario.topicId,
      subjectId: scenario.subjectId,
      summaryStatus: 'pending',
      sessionType: 'learning',
      // No qualityRating — handler must gracefully skip retention steps
      timestamp: SESSION_TIMESTAMP,
    });

    // Handler must not throw — always returns a structured result
    expect(result).toBeDefined();
    expect(result.sessionId).toBe(scenario.sessionId);
    expect(['completed', 'completed-with-errors']).toContain(result.status);

    // Without qualityRating, retention update must be SKIPPED (not failed)
    const retentionOutcome = result.outcomes.find(
      (o) => o.step === 'update-retention'
    );
    expect(retentionOutcome?.status).toBe('skipped');

    // needs-deepening step also requires a quality rating — must be SKIPPED
    const needsDeepeningOutcome = result.outcomes.find(
      (o) => o.step === 'update-needs-deepening'
    );
    expect(needsDeepeningOutcome?.status).toBe('skipped');

    // No spurious retention card should be created
    const card = await loadRetentionCard(scenario.profileId, scenario.topicId);
    expect(card).toBeUndefined();

    // Session summary IS created regardless of exchange count
    // (write-coaching-card step runs unconditionally)
    const summary = await loadSessionSummary(scenario.sessionId);
    expect(summary).not.toBeNull();
    expect(summary!.sessionId).toBe(scenario.sessionId);
  });

  it('stores narrative recap fields and exposes them through dashboard session detail', async () => {
    registerProvider({
      id: 'gemini',
      async chat() {
        return JSON.stringify({
          highlight: 'Practiced equivalent fractions',
          narrative:
            'They compared fraction sizes and fixed one shaky step after a hint.',
          conversationPrompt: 'Which fraction felt easiest to compare today?',
          engagementSignal: 'curious',
          confidence: 'high',
        });
      },
      async *chatStream() {
        yield JSON.stringify({
          highlight: 'Practiced equivalent fractions',
          narrative:
            'They compared fraction sizes and fixed one shaky step after a hint.',
          conversationPrompt: 'Which fraction felt easiest to compare today?',
          engagementSignal: 'curious',
          confidence: 'high',
        });
      },
    });

    const scenario = await seedScenario({
      includePreExistingRetentionCard: false,
      sessionExchanges: [
        {
          eventType: 'user_message',
          content:
            'Do I need a common denominator for one half plus one quarter?',
          offsetSeconds: 0,
        },
        {
          eventType: 'ai_response',
          content: 'Yes. Try rewriting one half in quarters.',
          offsetSeconds: 8,
        },
        {
          eventType: 'user_message',
          content:
            'That makes it two quarters plus one quarter equals three quarters.',
          offsetSeconds: 16,
        },
      ],
    });
    const parentProfileId = await seedParentLink(scenario.profileId);

    await executeChain({
      profileId: scenario.profileId,
      sessionId: scenario.sessionId,
      topicId: scenario.topicId,
      subjectId: scenario.subjectId,
      summaryStatus: 'pending',
      sessionType: 'learning',
      qualityRating: 4,
      timestamp: SESSION_TIMESTAMP,
    });

    const summary = await loadSessionSummary(scenario.sessionId);
    expect(summary).not.toBeNull();
    expect(summary!.highlight).toBe('Practiced equivalent fractions');
    expect(summary!.narrative).toBe(
      'They compared fraction sizes and fixed one shaky step after a hint.'
    );
    expect(summary!.conversationPrompt).toBe(
      'Which fraction felt easiest to compare today?'
    );
    expect(summary!.engagementSignal).toBe('curious');

    const sessionDetail = await getChildSessionDetail(
      createIntegrationDb(),
      parentProfileId,
      scenario.profileId,
      scenario.sessionId
    );

    expect(sessionDetail).toEqual(
      expect.objectContaining({
        highlight: 'Practiced equivalent fractions',
        narrative:
          'They compared fraction sizes and fixed one shaky step after a hint.',
        conversationPrompt: 'Which fraction felt easiest to compare today?',
        engagementSignal: 'curious',
      })
    );
  });

  it('falls back to the short-session highlight without narrative fields', async () => {
    const scenario = await seedScenario({
      includePreExistingRetentionCard: false,
      sessionExchanges: [
        {
          eventType: 'user_message',
          content: 'Hi!',
          offsetSeconds: 0,
        },
        {
          eventType: 'ai_response',
          content: 'Hi there.',
          offsetSeconds: 5,
        },
      ],
    });

    await executeChain({
      profileId: scenario.profileId,
      sessionId: scenario.sessionId,
      topicId: scenario.topicId,
      subjectId: scenario.subjectId,
      summaryStatus: 'pending',
      sessionType: 'learning',
      qualityRating: 4,
      timestamp: SESSION_TIMESTAMP,
    });

    const summary = await loadSessionSummary(scenario.sessionId);
    expect(summary).not.toBeNull();
    expect(summary!.highlight).toBeTruthy();
    expect(summary!.narrative).toBeNull();
    expect(summary!.conversationPrompt).toBeNull();
    expect(summary!.engagementSignal).toBeNull();
  });
});
