/**
 * Integration: Session-Completed Chain (P0-008)
 *
 * Exercises the real Inngest session-completed function against a real DB.
 * The orchestration, DB writes, retention logic, streaks, summaries, and
 * coaching-card cache stay real.
 *
 * External boundaries intercepted via fetch interceptor:
 * - Voyage AI embedding API (mockVoyageAI)
 *
 * Mocked boundaries:
 * - Sentry (@sentry/cloudflare SDK — not a plain HTTP call)
 */

import { eq, and } from 'drizzle-orm';
import {
  accounts,
  profiles,
  subjects,
  curricula,
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  sessionEvents,
  sessionSummaries,
  retentionCards,
  assessments,
  streaks,
  learningModes,
  coachingCardCache,
  xpLedger,
} from '@eduagent/database';

import { cleanupAccounts, createIntegrationDb } from './helpers';
import {
  clearFetchCalls,
  getFetchCalls,
  jsonResponse,
} from './fetch-interceptor';
import { mockVoyageAI, type MockHandle } from './external-mocks';
import {
  createMockProvider,
  registerProvider,
} from '../../apps/api/src/services/llm';

const mockCaptureException = jest.fn();

jest.mock('../../apps/api/src/services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { sessionCompleted } from '../../apps/api/src/inngest/functions/session-completed';

const AUTH_USER_ID = 'integration-session-completed-user';
const AUTH_EMAIL = 'integration-session-completed@integration.test';
const SESSION_TIMESTAMP = '2026-02-23T10:00:00.000Z';

let voyageHandle: MockHandle;
let scenarioCounter = 0;
const createdScenarioIdentities: Array<{
  clerkUserId: string;
  email: string;
}> = [];

interface Scenario {
  clerkUserId: string;
  email: string;
  profileId: string;
  subjectId: string;
  topicId: string | null;
  sessionId: string;
}

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
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sleep: jest.fn(),
    waitForEvent: jest.fn().mockResolvedValue(null),
    // [SWEEP-SILENT-RECOVERY] session-completed dispatches an
    // 'app/session.filing_timed_out' event when waitForEvent returns null
    // for freeform/homework sessions; mock must accept the call.
    sendEvent: jest.fn().mockResolvedValue({ ids: [] }),
  };

  const handler = (sessionCompleted as any).fn;
  return handler({
    event: { data: eventData, name: 'app/session.completed' },
    step: mockStep,
  });
}

async function seedScenario(options?: {
  includeTopic?: boolean;
  initialSummarySkips?: number;
}): Promise<Scenario> {
  const db = createIntegrationDb();
  const includeTopic = options?.includeTopic ?? true;
  const identitySuffix = `${Date.now()}-${scenarioCounter++}`;
  const clerkUserId = `${AUTH_USER_ID}-${identitySuffix}`;
  const email = `integration-session-completed+${identitySuffix}@integration.test`;
  createdScenarioIdentities.push({ clerkUserId, email });

  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId,
      email,
    })
    .returning();

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Integration Learner',
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

  let topicId: string | null = null;

  if (includeTopic) {
    const [curriculum] = await db
      .insert(curricula)
      .values({
        subjectId: subject!.id,
        version: 1,
      })
      .returning();

    const [book] = await db
      .insert(curriculumBooks)
      .values({ subjectId: subject!.id, title: 'Test Book', sortOrder: 1 })
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

    topicId = topic!.id;
  }

  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId: profile!.id,
      subjectId: subject!.id,
      topicId,
      sessionType: 'learning',
      status: 'completed',
      escalationRung: 2,
      exchangeCount: 2,
      startedAt: new Date('2026-02-23T09:58:00.000Z'),
      lastActivityAt: new Date('2026-02-23T10:00:30.000Z'),
    })
    .returning();

  await db.insert(sessionEvents).values([
    {
      sessionId: session!.id,
      profileId: profile!.id,
      subjectId: subject!.id,
      topicId: topicId ?? undefined,
      eventType: 'user_message',
      content: 'What is photosynthesis?',
      createdAt: new Date('2026-02-23T10:00:00.000Z'),
    },
    {
      sessionId: session!.id,
      profileId: profile!.id,
      subjectId: subject!.id,
      topicId: topicId ?? undefined,
      eventType: 'ai_response',
      content: 'Photosynthesis is how plants make food from sunlight.',
      createdAt: new Date('2026-02-23T10:00:10.000Z'),
    },
    {
      sessionId: session!.id,
      profileId: profile!.id,
      subjectId: subject!.id,
      topicId: topicId ?? undefined,
      eventType: 'user_message',
      content: 'So they use light, water, and carbon dioxide?',
      createdAt: new Date('2026-02-23T10:00:40.000Z'),
    },
  ]);

  if (topicId) {
    await db.insert(retentionCards).values({
      profileId: profile!.id,
      topicId,
      easeFactor: '2.50',
      intervalDays: 3,
      repetitions: 3,
      lastReviewedAt: new Date('2026-02-20T10:00:00.000Z'),
      nextReviewAt: new Date('2026-02-22T10:00:00.000Z'),
      consecutiveSuccesses: 2,
      xpStatus: 'pending',
      createdAt: new Date('2026-02-20T10:00:00.000Z'),
      updatedAt: new Date('2026-02-20T10:00:00.000Z'),
    });

    await db.insert(assessments).values({
      profileId: profile!.id,
      subjectId: subject!.id,
      topicId,
      sessionId: session!.id,
      verificationDepth: 'recall',
      status: 'passed',
      masteryScore: '0.80',
      qualityRating: 4,
    });
  }

  if (options?.initialSummarySkips != null) {
    await db.insert(learningModes).values({
      profileId: profile!.id,
      mode: 'serious',
      consecutiveSummarySkips: options.initialSummarySkips,
      celebrationLevel: 'all',
    });
  }

  return {
    clerkUserId,
    email,
    profileId: profile!.id,
    subjectId: subject!.id,
    topicId,
    sessionId: session!.id,
  };
}

async function cleanupCreatedScenarios(): Promise<void> {
  if (createdScenarioIdentities.length === 0) return;
  const identities = createdScenarioIdentities.splice(0);
  await cleanupAccounts({
    emails: identities.map((identity) => identity.email),
    clerkUserIds: identities.map((identity) => identity.clerkUserId),
  });
}

async function loadRetentionCard(profileId: string, topicId: string) {
  const db = createIntegrationDb();
  return db.query.retentionCards.findFirst({
    where: and(
      eq(retentionCards.profileId, profileId),
      eq(retentionCards.topicId, topicId)
    ),
  });
}

async function loadSummary(sessionId: string) {
  const db = createIntegrationDb();
  return db.query.sessionSummaries.findFirst({
    where: eq(sessionSummaries.sessionId, sessionId),
  });
}

async function loadStreak(profileId: string) {
  const db = createIntegrationDb();
  return db.query.streaks.findFirst({
    where: eq(streaks.profileId, profileId),
  });
}

async function loadLearningMode(profileId: string) {
  const db = createIntegrationDb();
  return db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });
}

async function loadCoachingCache(profileId: string) {
  const db = createIntegrationDb();
  return db.query.coachingCardCache.findFirst({
    where: eq(coachingCardCache.profileId, profileId),
  });
}

async function loadXpEntry(profileId: string, topicId: string) {
  const db = createIntegrationDb();
  return db.query.xpLedger.findFirst({
    where: and(
      eq(xpLedger.profileId, profileId),
      eq(xpLedger.topicId, topicId)
    ),
  });
}

beforeAll(() => {
  // Register Voyage AI fetch interceptor — the real embeddings service
  // calls fetch('https://api.voyageai.com/...') which we intercept
  voyageHandle = mockVoyageAI();
  // Integration setup registers a router-level mock Gemini provider. Override
  // it for this suite so generate-llm-summary receives schema-valid JSON.
  registerProvider({
    ...createMockProvider('gemini'),
    async chat() {
      return {
        content: JSON.stringify({
          narrative:
            'The learner explored photosynthesis and how plants turn sunlight into energy through their leaves.',
          topicsCovered: ['photosynthesis'],
          sessionState: 'completed',
          reEntryRecommendation:
            'Next time, look at how different plants adapt this process to their environment.',
        }),
        stopReason: 'stop',
      };
    },
  });
});

beforeEach(async () => {
  mockCaptureException.mockReset();
  clearFetchCalls();
  process.env['VOYAGE_API_KEY'] = 'voyage-test-key';

  await cleanupCreatedScenarios();
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

afterEach(() => {
  delete process.env['VOYAGE_API_KEY'];
});

afterAll(async () => {
  await cleanupCreatedScenarios();
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

describe('Integration: Session-Completed Chain (P0-008)', () => {
  it('runs the real chain and persists post-session side effects', async () => {
    const scenario = await seedScenario({ initialSummarySkips: 0 });

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

    expect(result.status).toBe('completed');
    expect(result.sessionId).toBe(scenario.sessionId);
    expect(result.outcomes).toHaveLength(17);

    const retentionCard = await loadRetentionCard(
      scenario.profileId,
      scenario.topicId!
    );
    expect(retentionCard).not.toBeNull();
    expect(retentionCard!.repetitions).toBeGreaterThanOrEqual(4);
    expect(retentionCard!.lastReviewedAt).not.toBeNull();

    const summary = await loadSummary(scenario.sessionId);
    expect(summary).not.toBeNull();
    expect(summary!.status).toBe('pending');

    const streak = await loadStreak(scenario.profileId);
    expect(streak).not.toBeNull();
    expect(streak!.currentStreak).toBe(1);
    expect(streak!.lastActivityDate).toBe('2026-02-23');

    const learningMode = await loadLearningMode(scenario.profileId);
    expect(learningMode).not.toBeNull();
    expect(learningMode!.medianResponseSeconds).toBe(30);
    expect(learningMode!.consecutiveSummarySkips).toBe(0);

    const coachingCache = await loadCoachingCache(scenario.profileId);
    expect(coachingCache).not.toBeNull();
    expect(coachingCache!.cardData).toMatchObject({
      kind: 'home_surface_cache_v1',
      legacyCoachingCard: expect.objectContaining({
        profileId: scenario.profileId,
      }),
    });

    const xpEntry = await loadXpEntry(scenario.profileId, scenario.topicId!);
    expect(xpEntry).not.toBeNull();
    expect(xpEntry!.subjectId).toBe(scenario.subjectId);
    expect(xpEntry!.status).toBe('pending');

    // Verify the REAL embeddings service called Voyage AI via fetch
    const voyageCalls = getFetchCalls('voyageai');
    expect(voyageCalls).toHaveLength(1);
    expect(voyageCalls[0].method).toBe('POST');

    const voyageBody = JSON.parse(voyageCalls[0].body!);
    expect(voyageBody.model).toBe('voyage-3.5');
    expect(voyageBody.input[0]).toContain('What is photosynthesis?');

    // Verify the Authorization header used the right API key
    expect(voyageCalls[0].headers['Authorization']).toBe(
      'Bearer voyage-test-key'
    );
  });

  it('skips topic-bound retention work when the event has no topicId', async () => {
    const scenario = await seedScenario({ includeTopic: false });

    const result = await executeChain({
      profileId: scenario.profileId,
      sessionId: scenario.sessionId,
      topicId: null,
      subjectId: scenario.subjectId,
      summaryStatus: 'pending',
      sessionType: 'learning',
      qualityRating: 4,
      timestamp: SESSION_TIMESTAMP,
    });

    expect(result.status).toBe('completed');
    expect(
      result.outcomes.find((outcome) => outcome.step === 'update-retention')
        ?.status
    ).toBe('skipped');
    expect(
      result.outcomes.find(
        (outcome) => outcome.step === 'update-needs-deepening'
      )?.status
    ).toBe('skipped');

    const summary = await loadSummary(scenario.sessionId);
    expect(summary).not.toBeNull();
    expect(summary!.topicId).toBeNull();

    const streak = await loadStreak(scenario.profileId);
    expect(streak).not.toBeNull();

    // Verify Voyage AI was called even without a topic
    const voyageCalls = getFetchCalls('voyageai');
    expect(voyageCalls).toHaveLength(1);
  });

  it('tracks skipped and accepted summaries through the real learning_modes row', async () => {
    const skippedScenario = await seedScenario();

    await executeChain({
      profileId: skippedScenario.profileId,
      sessionId: skippedScenario.sessionId,
      topicId: skippedScenario.topicId,
      subjectId: skippedScenario.subjectId,
      summaryStatus: 'skipped',
      sessionType: 'learning',
      qualityRating: 4,
      timestamp: SESSION_TIMESTAMP,
    });

    const skippedMode = await loadLearningMode(skippedScenario.profileId);
    expect(skippedMode).not.toBeNull();
    expect(skippedMode!.consecutiveSummarySkips).toBe(1);

    await cleanupAccounts({
      emails: [skippedScenario.email],
      clerkUserIds: [skippedScenario.clerkUserId],
    });
    const skippedIdentityIndex = createdScenarioIdentities.findIndex(
      (identity) => identity.email === skippedScenario.email
    );
    if (skippedIdentityIndex >= 0) {
      createdScenarioIdentities.splice(skippedIdentityIndex, 1);
    }
    clearFetchCalls();

    const acceptedScenario = await seedScenario({ initialSummarySkips: 3 });

    await executeChain({
      profileId: acceptedScenario.profileId,
      sessionId: acceptedScenario.sessionId,
      topicId: acceptedScenario.topicId,
      subjectId: acceptedScenario.subjectId,
      summaryStatus: 'accepted',
      sessionType: 'learning',
      qualityRating: 4,
      timestamp: SESSION_TIMESTAMP,
    });

    const acceptedMode = await loadLearningMode(acceptedScenario.profileId);
    expect(acceptedMode).not.toBeNull();
    expect(acceptedMode!.consecutiveSummarySkips).toBe(0);
  });

  it('isolates embedding failures without blocking the rest of the chain', async () => {
    const scenario = await seedScenario();

    // Override Voyage AI to return a 503 for the next call
    voyageHandle.nextResponse(
      () => new Response('Service Unavailable', { status: 503 })
    );

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

    expect(result.status).toBe('completed-with-errors');
    expect(
      result.outcomes.find((outcome) => outcome.step === 'generate-embeddings')
    ).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('503'),
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('503'),
      }),
      expect.objectContaining({ profileId: scenario.profileId })
    );

    // Rest of the chain still completed
    const summary = await loadSummary(scenario.sessionId);
    expect(summary).not.toBeNull();

    const streak = await loadStreak(scenario.profileId);
    expect(streak).not.toBeNull();

    const coachingCache = await loadCoachingCache(scenario.profileId);
    expect(coachingCache).not.toBeNull();
  });
});
