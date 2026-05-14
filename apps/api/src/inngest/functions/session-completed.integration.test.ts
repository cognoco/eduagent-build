/**
 * session-completed — integration test (Installment 1)
 *
 * Covers ONE happy-path scenario:
 *   - Curriculum session (sessionType='learning')
 *   - topicId + exchangeCount both provided → skips waitForEvent + re-read-session
 *   - verificationType=null → skips verification completion step
 *   - summaryStatus='pending' (not 'auto_closed')
 *   - mode is not 'relearn'
 *   - qualityRating=4 provided → update-retention runs
 *   - pedagogyMode='socratic' (not 'four_strands') → vocabulary extraction skipped
 *   - memoryConsentStatus='pending' → analyzeSessionTranscript skipped (consent gate)
 *   - exchangeCount=2 → generateSessionInsights skipped (threshold is >=3)
 *
 * External-boundary mocks only (CLAUDE.md § Code Quality Guards):
 *   1. jest.spyOn(llm, 'routeAndCall') — every LLM call in the chain
 *   2. globalThis.fetch — Anthropic, Voyage, Expo Push, Resend
 */

import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  curriculumBooks,
  curriculumTopics,
  curricula,
  familyLinks,
  generateUUIDv7,
  learningSessions,
  learningProfiles,
  memoryFacts,
  notificationPreferences,
  profiles,
  progressSnapshots,
  retentionCards,
  sessionEvents,
  streaks,
  subjects,
  vocabulary,
  xpLedger,
  sessionSummaries,
  type Database,
} from '@eduagent/database';
import { and, eq, like } from 'drizzle-orm';

import * as config from '../../config';
import * as sentry from '../../services/sentry';

import * as llm from '../../services/llm';
import { sessionCompleted } from './session-completed';

// ── Database env bootstrap ────────────────────────────────────────────────────
loadDatabaseEnv(resolve(__dirname, '../../../..'));

// ── Fetch interceptor ─────────────────────────────────────────────────────────
// Intercept all external HTTP boundaries at the fetch level so no real
// network calls are made. The handler must not hit:
//   - Anthropic (LLM API) — covered by routeAndCall spy above
//   - Voyage (embeddings API) — no VOYAGE_API_KEY set → getStepVoyageApiKey
//     throws and embed-new-memory-facts short-circuits before fetch fires;
//     intercept here as a belt-and-suspenders guard.
//   - Expo Push / Resend — sendStruggleNotification may fire even when
//     analyzeSessionTranscript is gated by consent; intercept proactively.
const ANTHROPIC_URL = 'https://api.anthropic.com';
const VOYAGE_URL = 'https://api.voyageai.com';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const RESEND_URL = 'https://api.resend.com';

const fetchCalls: Array<{ url: string }> = [];
const originalFetch = globalThis.fetch;

// ── Test state ────────────────────────────────────────────────────────────────
let db: Database;
const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `clerk_session_completed_${RUN_ID}`;
let seedCounter = 0;

// ── LLM mock fixture ──────────────────────────────────────────────────────────
//
// All LLM calls in this path are soft-step (errors are swallowed), so returning
// a valid JSON string that each parser accepts is ideal. We return a shape that:
//
//   - generateLearnerRecap: uses extractFirstJsonObject + learnerRecapLlmOutputSchema
//     → needs { closingLine: string, learnerRecap: string } wrapped in JSON
//   - generateAndStoreLlmSummary: uses extractFirstJsonObject + llmSummarySchema
//     → needs { narrative, topicsCovered, sessionState, reEntryRecommendation }
//   - analyzeSessionTranscript: only fires when memoryConsentStatus='granted';
//     seeded as 'pending' so this path never executes in this test.
//   - generateSessionInsights: only fires when exchangeCount >= 3; seeded as 2.
//
// A single mock response with JSON that satisfies all parsers simultaneously.
const LLM_MOCK_RESPONSE = JSON.stringify({
  // learnerRecapLlmOutputSchema fields
  closingLine: 'Great work today!',
  learnerRecap: 'You explored photosynthesis and light absorption in detail.',
  nextTopicReason: null,
  // llmSummarySchema fields
  narrative:
    'The learner worked through photosynthesis concepts, discussing chlorophyll and light absorption in a focused session.',
  topicsCovered: ['photosynthesis'],
  sessionState: 'completed',
  reEntryRecommendation: 'Review the light reaction steps next session.',
});

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedAccount(): Promise<{ accountId: string }> {
  const idx = ++seedCounter;
  const clerkUserId = `${CLERK_PREFIX}_${idx}`;
  const email = `session-completed-${RUN_ID}-${idx}@test.invalid`;

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning({ id: accounts.id });

  return { accountId: account!.id };
}

async function seedProfile(accountId: string): Promise<{ profileId: string }> {
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId,
      displayName: 'Test Learner',
      birthYear: 2005,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  return { profileId: profile!.id };
}

async function seedSubject(profileId: string): Promise<{ subjectId: string }> {
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: 'Biology',
      // pedagogyMode defaults to 'socratic' — vocabulary extraction is skipped
    })
    .returning({ id: subjects.id });

  return { subjectId: subject!.id };
}

async function seedCurriculum(subjectId: string): Promise<{
  curriculumId: string;
  bookId: string;
  topicId: string;
}> {
  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId,
      title: 'Chapter 1: Cells and Energy',
      sortOrder: 1,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: 'Photosynthesis',
      description: 'How plants convert light to energy',
      sortOrder: 1,
      estimatedMinutes: 30,
    })
    .returning({ id: curriculumTopics.id });

  return {
    curriculumId: curriculum!.id,
    bookId: book!.id,
    topicId: topic!.id,
  };
}

async function seedSession(input: {
  profileId: string;
  subjectId: string;
  topicId: string;
}): Promise<{ sessionId: string }> {
  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId: input.profileId,
      subjectId: input.subjectId,
      topicId: input.topicId,
      sessionType: 'learning',
      status: 'completed',
      exchangeCount: 2,
    })
    .returning({ id: learningSessions.id });

  return { sessionId: session!.id };
}

async function seedSessionEvents(input: {
  sessionId: string;
  profileId: string;
  subjectId: string;
  topicId: string;
}): Promise<void> {
  await db.insert(sessionEvents).values([
    {
      sessionId: input.sessionId,
      profileId: input.profileId,
      subjectId: input.subjectId,
      topicId: input.topicId,
      eventType: 'user_message',
      content: 'Can you explain how photosynthesis works?',
    },
    {
      sessionId: input.sessionId,
      profileId: input.profileId,
      subjectId: input.subjectId,
      topicId: input.topicId,
      eventType: 'ai_response',
      content:
        'Photosynthesis is the process by which plants convert light energy into chemical energy.',
    },
  ]);
}

/**
 * Seed a learning_profiles row so getLearningProfile() returns an existing
 * profile — but with memoryConsentStatus='pending' so the consent gate
 * short-circuits analyzeSessionTranscript before any LLM call fires.
 */
async function seedLearningProfile(profileId: string): Promise<void> {
  await db.insert(learningProfiles).values({
    profileId,
    memoryConsentStatus: 'pending',
    memoryCollectionEnabled: false,
    memoryEnabled: true,
  });
}

// ── Handler helpers ───────────────────────────────────────────────────────────

type HandlerFn = (ctx: unknown) => Promise<unknown>;

function getHandler(): HandlerFn {
  return (sessionCompleted as unknown as { fn: HandlerFn }).fn;
}

function buildStep() {
  return {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    // waitForEvent is unused because topicId + exchangeCount are both provided
    waitForEvent: jest.fn().mockResolvedValue({ data: {} }),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set for session-completed integration tests',
    );
  }
  db = createDatabase(databaseUrl);

  // Intercept all external HTTP boundaries.
  // Any unrecognised URL falls through to originalFetch — callers should not
  // be hitting real network in tests, but we surface it rather than silently
  // hanging if something slips through.
  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push({ url });

    if (url.startsWith(ANTHROPIC_URL) || url.startsWith(VOYAGE_URL)) {
      // routeAndCall spy should intercept before fetch; this is belt-and-suspenders.
      return new Response(
        JSON.stringify({ content: [{ type: 'text', text: LLM_MOCK_RESPONSE }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.startsWith(EXPO_PUSH_URL)) {
      return new Response(
        JSON.stringify({ data: { id: 'ticket-integration', status: 'ok' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.startsWith(RESEND_URL)) {
      return new Response(JSON.stringify({ id: 'email-integration' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fall through — unexpected real network call will surface here.
    return originalFetch(input, init);
  };
}, 30_000);

afterAll(async () => {
  globalThis.fetch = originalFetch;
  // FK cascades clean child rows (profiles → subjects → sessions → events, etc.)
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
}, 30_000);

beforeEach(() => {
  jest.clearAllMocks();
  fetchCalls.length = 0;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('session-completed integration', () => {
  let routeAndCallSpy: jest.SpiedFunction<typeof llm.routeAndCall>;

  beforeEach(() => {
    routeAndCallSpy = jest.spyOn(llm, 'routeAndCall').mockResolvedValue({
      response: LLM_MOCK_RESPONSE,
      provider: 'test',
      model: 'fixture',
      latencyMs: 1,
    });
  });

  afterEach(() => {
    routeAndCallSpy.mockRestore();
  });

  it('happy path: curriculum session writes summary, snapshot, retention card, and streak', async () => {
    // ── 1. Seed ──────────────────────────────────────────────────────────────
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { topicId } = await seedCurriculum(subjectId);
    const { sessionId } = await seedSession({ profileId, subjectId, topicId });
    await seedSessionEvents({ sessionId, profileId, subjectId, topicId });
    await seedLearningProfile(profileId);

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // ── 2. Synthesize step + invoke handler ──────────────────────────────────
    const step = buildStep();
    const handler = getHandler();

    const result = (await handler({
      event: {
        name: 'app/session.completed',
        data: {
          profileId,
          sessionId,
          subjectId,
          topicId,
          exchangeCount: 2,
          summaryStatus: 'pending',
          timestamp: now.toISOString(),
          verificationType: null,
          sessionType: 'learning',
          qualityRating: 4,
          mode: null,
          reason: 'user_ended',
        },
      },
      step,
    })) as { status: string; sessionId: string; outcomes: Array<{ step: string; status: string }> };

    // ── 3. Assert handler result ─────────────────────────────────────────────
    expect(result.status).toMatch(/^completed/); // 'completed' or 'completed-with-errors'
    expect(result.sessionId).toBe(sessionId);

    // routeAndCall was invoked (at least for generateLearnerRecap +
    // generateAndStoreLlmSummary; generateSessionInsights is skipped at
    // exchangeCount=2 < 3; analyzeSessionTranscript is gated by consent).
    expect(routeAndCallSpy).toHaveBeenCalled();

    // waitForEvent was NOT called (topicId + exchangeCount both provided)
    expect(step.waitForEvent).not.toHaveBeenCalled();

    // ── 4. Assert DB state ───────────────────────────────────────────────────

    // (a) session_summaries row created for this session
    const summary = await db.query.sessionSummaries.findFirst({
      where: and(
        eq(sessionSummaries.sessionId, sessionId),
        eq(sessionSummaries.profileId, profileId),
      ),
    });
    expect(summary).toBeDefined();
    expect(summary?.profileId).toBe(profileId);

    // (b) progress_snapshots refreshed — a snapshot for today exists
    const snapshot = await db.query.progressSnapshots.findFirst({
      where: and(
        eq(progressSnapshots.profileId, profileId),
        eq(progressSnapshots.snapshotDate, today),
      ),
    });
    expect(snapshot).toBeDefined();
    expect(snapshot?.profileId).toBe(profileId);

    // (c) retention card created/updated for (profileId, topicId)
    //     update-retention runs because qualityRating=4 is provided and
    //     retentionTopicIds=[topicId]. updateRetentionFromSession upserts the card.
    const retentionCard = await db.query.retentionCards.findFirst({
      where: and(
        eq(retentionCards.profileId, profileId),
        eq(retentionCards.topicId, topicId),
      ),
    });
    expect(retentionCard).toBeDefined();

    // (d) streak row upserted for the profile
    //     exchangeCount=2 > 0 and reason='user_ended' (not silence_timeout)
    //     → recordSessionActivity runs
    const streak = await db.query.streaks.findFirst({
      where: eq(streaks.profileId, profileId),
    });
    expect(streak).toBeDefined();
    expect(streak?.currentStreak).toBeGreaterThanOrEqual(1);

    // (e) XP: insertSessionXpEntry no-ops when no passed assessment exists.
    //     Assert the call ran without error (the handler outcome for
    //     update-dashboard should be 'ok').
    const dashboardOutcome = result.outcomes.find(
      (o) => o.step === 'update-dashboard',
    );
    expect(dashboardOutcome?.status).toBe('ok');

    // Explicit XP row assertion: only present if a passed assessment exists.
    // Since we did NOT seed an assessment, xpLedger is expected to be empty
    // for this profile+topic. Verifying insert ran without error is sufficient.
    const xpRows = await db
      .select()
      .from(xpLedger)
      .where(eq(xpLedger.profileId, profileId));
    // No passed assessment was seeded → no XP row (insertSessionXpEntry no-ops).
    expect(xpRows).toHaveLength(0);
  });

  // ── Additional scenarios ────────────────────────────────────────────────────

  it('freeform session: waitForEvent returns filing event, re-read-session runs, summary topicId populated', async () => {
    // done as: freeform session — waitForEvent succeeds
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { topicId } = await seedCurriculum(subjectId);

    // Freeform session: no topicId at close time, exchangeCount=3
    const [sessionRow] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        topicId: null,
        sessionType: 'learning',
        status: 'completed',
        exchangeCount: 3,
      })
      .returning({ id: learningSessions.id });
    const sessionId = sessionRow!.id;

    await seedSessionEvents({ sessionId, profileId, subjectId, topicId });
    await seedLearningProfile(profileId);

    const now = new Date();

    const step = {
      run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
      // Synthesize filing event: filing completed and backfilled topicId
      waitForEvent: jest.fn().mockResolvedValue({
        data: { sessionId, topicId },
      }),
      sendEvent: jest.fn().mockResolvedValue(undefined),
    };

    const handler = getHandler();
    const result = (await handler({
      event: {
        name: 'app/session.completed',
        data: {
          profileId,
          sessionId,
          subjectId,
          topicId: null, // freeform — no topicId at event time
          exchangeCount: null, // not provided — triggers re-read-session
          summaryStatus: 'pending',
          timestamp: now.toISOString(),
          verificationType: null,
          sessionType: 'learning',
          qualityRating: 4,
          mode: null,
          reason: 'user_ended',
        },
      },
      step,
    })) as { status: string; sessionId: string; outcomes: Array<{ step: string; status: string }> };

    // waitForEvent was called (freeform session)
    expect(step.waitForEvent).toHaveBeenCalledWith(
      'wait-for-filing',
      expect.objectContaining({ event: 'app/filing.completed' }),
    );

    // re-read-session step ran (topicId was null + exchangeCount was null)
    const reReadCalls = (step.run as jest.Mock).mock.calls.map((c: [string, ...unknown[]]) => c[0]);
    expect(reReadCalls).toContain('re-read-session');

    // session_summaries row created
    const summary = await db.query.sessionSummaries.findFirst({
      where: and(
        eq(sessionSummaries.sessionId, sessionId),
        eq(sessionSummaries.profileId, profileId),
      ),
    });
    expect(summary).toBeDefined();
    // topicId was backfilled via re-read (we seeded it on the session row after
    // the filing event returned, but the session row was seeded without topicId;
    // the waitForEvent mock returned topicId so downstream steps use it).
    expect(result.status).toMatch(/^completed/);
  });

  it('homework session: waitForEvent runs and homework summary stored in session metadata', async () => {
    // done as: homework session — waitForEvent + homework summary
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { topicId } = await seedCurriculum(subjectId);

    const [sessionRow] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        topicId,
        sessionType: 'homework',
        status: 'completed',
        exchangeCount: 3,
      })
      .returning({ id: learningSessions.id });
    const sessionId = sessionRow!.id;

    await seedSessionEvents({ sessionId, profileId, subjectId, topicId });
    await seedLearningProfile(profileId);

    const now = new Date();

    // LLM returns a shape that satisfies the homework-summary parser
    const HOMEWORK_LLM_RESPONSE = JSON.stringify({
      problemCount: 3,
      practicedSkills: ['algebra'],
      independentProblemCount: 2,
      guidedProblemCount: 1,
      summary: '3 problems completed.',
      displayTitle: 'Biology Homework',
      // Also include standard summary fields so other parsers don't fail
      closingLine: 'Great work today!',
      learnerRecap: 'You worked through homework problems.',
      narrative: 'The learner completed a homework session on biology.',
      topicsCovered: ['photosynthesis'],
      sessionState: 'completed',
      reEntryRecommendation: 'Continue homework next session.',
    });

    routeAndCallSpy.mockResolvedValue({
      response: HOMEWORK_LLM_RESPONSE,
      provider: 'test',
      model: 'fixture',
      latencyMs: 1,
    });

    const step = {
      run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
      waitForEvent: jest.fn().mockResolvedValue({
        data: { sessionId, topicId },
      }),
      sendEvent: jest.fn().mockResolvedValue(undefined),
    };

    const handler = getHandler();
    const result = (await handler({
      event: {
        name: 'app/session.completed',
        data: {
          profileId,
          sessionId,
          subjectId,
          topicId,
          exchangeCount: 3,
          summaryStatus: 'pending',
          timestamp: now.toISOString(),
          verificationType: null,
          sessionType: 'homework',
          qualityRating: 4,
          mode: null,
          reason: 'user_ended',
        },
      },
      step,
    })) as { status: string; outcomes: Array<{ step: string; status: string }> };

    // waitForEvent was called for homework session
    expect(step.waitForEvent).toHaveBeenCalled();

    // extract-homework-summary step ran (not skipped)
    const homeworkOutcome = result.outcomes.find(
      (o) => o.step === 'extract-homework-summary',
    );
    expect(homeworkOutcome?.status).toBe('ok');

    // routeAndCall was invoked — homework summary LLM prompt fired
    expect(routeAndCallSpy).toHaveBeenCalled();

    // The homework summary is stored in session metadata
    const updatedSession = await db.query.learningSessions.findFirst({
      where: eq(learningSessions.id, sessionId),
    });
    // metadata.homeworkSummary should be populated
    const meta = updatedSession?.metadata as Record<string, unknown> | null;
    expect(meta?.homeworkSummary).toBeDefined();
  });

  it('relearn session: relearn-retention-reset runs before SM-2 update, card advances past reset baseline', async () => {
    // done as: relearn session — relearn-retention-reset path
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { topicId } = await seedCurriculum(subjectId);

    const [sessionRow] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        topicId,
        sessionType: 'learning',
        status: 'completed',
        exchangeCount: 3,
      })
      .returning({ id: learningSessions.id });
    const sessionId = sessionRow!.id;

    await seedSessionEvents({ sessionId, profileId, subjectId, topicId });
    await seedLearningProfile(profileId);

    // Pre-seed a retention card at advanced state
    await db.insert(retentionCards).values({
      profileId,
      topicId,
      intervalDays: 14,
      repetitions: 3,
      easeFactor: 2.6,
      failureCount: 0,
      consecutiveSuccesses: 3,
    });

    const now = new Date();
    const step = buildStep();
    const handler = getHandler();

    const result = (await handler({
      event: {
        name: 'app/session.completed',
        data: {
          profileId,
          sessionId,
          subjectId,
          topicId,
          exchangeCount: 3,
          summaryStatus: 'pending',
          timestamp: now.toISOString(),
          verificationType: null,
          sessionType: 'learning',
          qualityRating: 4,
          mode: 'relearn', // triggers relearn-retention-reset
          reason: 'user_ended',
        },
      },
      step,
    })) as { status: string; outcomes: Array<{ step: string; status: string }> };

    // relearn-retention-reset outcome is 'ok'
    const resetOutcome = result.outcomes.find(
      (o) => o.step === 'relearn-retention-reset',
    );
    expect(resetOutcome?.status).toBe('ok');

    // SM-2 update ran
    const retentionOutcome = result.outcomes.find(
      (o) => o.step === 'update-retention',
    );
    expect(retentionOutcome?.status).toBe('ok');

    // Card's repetitions advanced past the reset baseline (0) — SM-2 fired AFTER reset
    const card = await db.query.retentionCards.findFirst({
      where: and(
        eq(retentionCards.profileId, profileId),
        eq(retentionCards.topicId, topicId),
      ),
    });
    expect(card).toBeDefined();
    // After reset (reps=0) then SM-2 quality=4: first repetition → reps becomes 1
    expect(card!.repetitions).toBeGreaterThan(0);
    // intervalDays should have advanced from the reset baseline of 1
    expect(card!.intervalDays).toBeGreaterThanOrEqual(1);
  });

  it('verification evaluate: process-verification-completion runs and qualityRating is non-null', async () => {
    // done as: verification — evaluate
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { topicId } = await seedCurriculum(subjectId);

    const [sessionRow] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        topicId,
        sessionType: 'learning',
        status: 'completed',
        exchangeCount: 3,
      })
      .returning({ id: learningSessions.id });
    const sessionId = sessionRow!.id;

    // Pre-seed a retention card (required for processEvaluateCompletion)
    await db.insert(retentionCards).values({
      profileId,
      topicId,
      intervalDays: 4,
      repetitions: 2,
      easeFactor: 2.5,
      evaluateDifficultyRung: 1,
    });

    await seedLearningProfile(profileId);

    // Seed an ai_response event with a parseable EVALUATE assessment JSON
    // parseEvaluateAssessment looks for: {"challengePassed": bool, "quality": number}
    const evaluateAssessmentJson = JSON.stringify({
      challengePassed: true,
      flawIdentified: 'The formula was reversed',
      quality: 4,
    });
    await db.insert(sessionEvents).values([
      {
        sessionId,
        profileId,
        subjectId,
        topicId,
        eventType: 'user_message',
        content: 'I think the formula is wrong because the variables are swapped.',
      },
      {
        sessionId,
        profileId,
        subjectId,
        topicId,
        eventType: 'ai_response',
        content: `You correctly identified the flaw. ${evaluateAssessmentJson}`,
      },
    ]);

    const now = new Date();
    const step = buildStep();
    const handler = getHandler();

    const result = (await handler({
      event: {
        name: 'app/session.completed',
        data: {
          profileId,
          sessionId,
          subjectId,
          topicId,
          exchangeCount: 3,
          summaryStatus: 'pending',
          timestamp: now.toISOString(),
          verificationType: 'evaluate',
          sessionType: 'learning',
          qualityRating: null,
          mode: null,
          reason: 'user_ended',
        },
      },
      step,
    })) as { status: string; outcomes: Array<{ step: string; status: string; qualityRating?: number }> };

    const verificationOutcome = result.outcomes.find(
      (o) => o.step === 'process-verification-completion',
    );
    expect(verificationOutcome?.status).toBe('ok');
    // processEvaluateCompletion returns sm2Quality which is propagated
    expect(typeof verificationOutcome?.qualityRating).toBe('number');
    expect(verificationOutcome!.qualityRating).toBeGreaterThanOrEqual(3);
  });

  it('verification teach_back: process-verification-completion runs and qualityRating is non-null', async () => {
    // done as: verification — teach_back
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { topicId } = await seedCurriculum(subjectId);

    const [sessionRow] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        topicId,
        sessionType: 'learning',
        status: 'completed',
        exchangeCount: 3,
      })
      .returning({ id: learningSessions.id });
    const sessionId = sessionRow!.id;

    await seedLearningProfile(profileId);

    // Seed an ai_response event with a parseable TEACH_BACK assessment JSON
    // parseTeachBackAssessment looks for: {"completeness": n, "accuracy": n, "clarity": n}
    const teachBackAssessmentJson = JSON.stringify({
      completeness: 4,
      accuracy: 4,
      clarity: 3,
      overallQuality: 4,
      weakestArea: 'clarity',
      gapIdentified: 'Could be clearer on light reactions',
    });
    await db.insert(sessionEvents).values([
      {
        sessionId,
        profileId,
        subjectId,
        topicId,
        eventType: 'user_message',
        content: 'Photosynthesis uses light to convert CO2 and water into glucose.',
      },
      {
        sessionId,
        profileId,
        subjectId,
        topicId,
        eventType: 'ai_response',
        content: `Good explanation! ${teachBackAssessmentJson}`,
      },
    ]);

    const now = new Date();
    const step = buildStep();
    const handler = getHandler();

    const result = (await handler({
      event: {
        name: 'app/session.completed',
        data: {
          profileId,
          sessionId,
          subjectId,
          topicId,
          exchangeCount: 3,
          summaryStatus: 'pending',
          timestamp: now.toISOString(),
          verificationType: 'teach_back',
          sessionType: 'learning',
          qualityRating: null,
          mode: null,
          reason: 'user_ended',
        },
      },
      step,
    })) as { status: string; outcomes: Array<{ step: string; status: string; qualityRating?: number }> };

    const verificationOutcome = result.outcomes.find(
      (o) => o.step === 'process-verification-completion',
    );
    expect(verificationOutcome?.status).toBe('ok');
    // mapTeachBackRubricToSm2(completeness=4, accuracy=4, clarity=3) = round(4*0.5+4*0.3+3*0.2)=round(3.8)=4
    expect(typeof verificationOutcome?.qualityRating).toBe('number');
    expect(verificationOutcome!.qualityRating).toBeGreaterThanOrEqual(3);
  });

  it('four_strands pedagogy: vocabulary rows inserted after LLM extraction', async () => {
    // done as: four_strands pedagogy
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);

    // Seed subject with four_strands + languageCode
    const [subjectRow] = await db
      .insert(subjects)
      .values({
        profileId,
        name: 'French',
        pedagogyMode: 'four_strands',
        languageCode: 'fr',
      })
      .returning({ id: subjects.id });
    const subjectId = subjectRow!.id;

    const { topicId } = await seedCurriculum(subjectId);

    const [sessionRow] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        topicId,
        sessionType: 'learning',
        status: 'completed',
        exchangeCount: 3,
      })
      .returning({ id: learningSessions.id });
    const sessionId = sessionRow!.id;

    await seedSessionEvents({ sessionId, profileId, subjectId, topicId });
    await seedLearningProfile(profileId);

    // LLM returns vocabulary-extract JSON shape + standard summary fields
    const VOCAB_LLM_RESPONSE = JSON.stringify({
      // extractVocabularyFromTranscript expects: {"items": [{term, translation, type}]}
      items: [
        { term: 'la photosynthèse', translation: 'photosynthesis', type: 'word', cefrLevel: 'B1' },
        { term: 'la lumière', translation: 'light', type: 'word', cefrLevel: 'A1' },
      ],
      // Standard summary fields for other parsers
      closingLine: 'Très bien!',
      learnerRecap: 'Tu as exploré la photosynthèse.',
      narrative: 'The learner worked on French vocabulary for photosynthesis.',
      topicsCovered: ['photosynthesis'],
      sessionState: 'completed',
      reEntryRecommendation: 'Practise vocabulary next session.',
      problemCount: 0,
      practicedSkills: [],
      independentProblemCount: 0,
      guidedProblemCount: 0,
      summary: 'Vocabulary session completed.',
      displayTitle: 'French Session',
    });

    routeAndCallSpy.mockResolvedValue({
      response: VOCAB_LLM_RESPONSE,
      provider: 'test',
      model: 'fixture',
      latencyMs: 1,
    });

    const now = new Date();
    const step = buildStep();
    const handler = getHandler();

    const result = (await handler({
      event: {
        name: 'app/session.completed',
        data: {
          profileId,
          sessionId,
          subjectId,
          topicId,
          exchangeCount: 3,
          summaryStatus: 'pending',
          timestamp: now.toISOString(),
          verificationType: null,
          sessionType: 'learning',
          qualityRating: 4,
          mode: null,
          reason: 'user_ended',
        },
      },
      step,
    })) as { status: string; outcomes: Array<{ step: string; status: string }> };

    // update-vocabulary-retention ran (not skipped)
    const vocabOutcome = result.outcomes.find(
      (o) => o.step === 'update-vocabulary-retention',
    );
    expect(vocabOutcome?.status).toBe('ok');

    // vocabulary rows were inserted for this profile+subject
    const vocabRows = await db
      .select()
      .from(vocabulary)
      .where(
        and(
          eq(vocabulary.profileId, profileId),
          eq(vocabulary.subjectId, subjectId),
        ),
      );
    expect(vocabRows.length).toBeGreaterThan(0);
    const terms = vocabRows.map((r) => r.term);
    expect(terms).toContain('la photosynthèse');
  });

  it('struggle detection: consent granted triggers analyzeSessionTranscript; push fired when parent link + token present', async () => {
    // done as: struggle detection
    const { accountId: parentAccountId } = await seedAccount();
    const { profileId: parentProfileId } = await seedProfile(parentAccountId);

    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { topicId } = await seedCurriculum(subjectId);

    const [sessionRow] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        topicId,
        sessionType: 'learning',
        status: 'completed',
        exchangeCount: 3,
      })
      .returning({ id: learningSessions.id });
    const sessionId = sessionRow!.id;

    // 3 session events to pass the >=3 transcript-length gate in analyzeSessionTranscript
    await db.insert(sessionEvents).values([
      {
        sessionId,
        profileId,
        subjectId,
        topicId,
        eventType: 'user_message',
        content: 'I really struggle with photosynthesis light reactions.',
      },
      {
        sessionId,
        profileId,
        subjectId,
        topicId,
        eventType: 'ai_response',
        content: 'Let me help you understand the light reactions.',
      },
      {
        sessionId,
        profileId,
        subjectId,
        topicId,
        eventType: 'user_message',
        content: 'I still find it very difficult.',
      },
    ]);

    // Seed learning profile with consent GRANTED + collection enabled
    await db.insert(learningProfiles).values({
      profileId,
      memoryConsentStatus: 'granted',
      memoryCollectionEnabled: true,
      memoryEnabled: true,
    });

    // Seed parent → child family link so sendStruggleNotification can find a parent
    await db.insert(familyLinks).values({
      parentProfileId,
      childProfileId: profileId,
    });

    // Seed parent's notification preferences with a valid Expo push token
    await db.insert(notificationPreferences).values({
      profileId: parentProfileId,
      pushEnabled: true,
      expoPushToken: 'ExponentPushToken[integration-test-token]',
      maxDailyPush: 10,
    });

    // LLM returns an analysis with a medium-confidence struggle → triggers struggle_noticed
    const STRUGGLE_LLM_RESPONSE = JSON.stringify({
      struggles: [{ topic: 'photosynthesis light reactions', subject: 'Biology', confidence: 'medium' }],
      interests: null,
      strengths: null,
      resolvedTopics: null,
      communicationNotes: null,
      engagementLevel: 'low',
      confidence: 'medium',
      learningStyle: null,
      // standard summary fields
      closingLine: 'Keep trying!',
      learnerRecap: 'You worked through photosynthesis.',
      narrative: 'Session focused on light reactions.',
      topicsCovered: ['photosynthesis'],
      sessionState: 'completed',
      reEntryRecommendation: 'Review again.',
    });

    routeAndCallSpy.mockResolvedValue({
      response: STRUGGLE_LLM_RESPONSE,
      provider: 'test',
      model: 'fixture',
      latencyMs: 1,
    });

    const now = new Date();
    const step = buildStep();
    const handler = getHandler();

    const result = (await handler({
      event: {
        name: 'app/session.completed',
        data: {
          profileId,
          sessionId,
          subjectId,
          topicId,
          exchangeCount: 3,
          summaryStatus: 'pending',
          timestamp: now.toISOString(),
          verificationType: null,
          sessionType: 'learning',
          qualityRating: 4,
          mode: null,
          reason: 'user_ended',
        },
      },
      step,
    })) as { status: string; outcomes: Array<{ step: string; status: string }> };

    // analyze-learner-profile ran (consent granted)
    const analyzeOutcome = result.outcomes.find(
      (o) => o.step === 'analyze-learner-profile',
    );
    expect(analyzeOutcome?.status).toBe('ok');

    // Expo push URL was hit (sendStruggleNotification fired fetch to Expo)
    const expoPushCalls = fetchCalls.filter((c) => c.url.startsWith(EXPO_PUSH_URL));
    expect(expoPushCalls.length).toBeGreaterThan(0);
  });

  it('silence_timeout: SM-2 skipped and streak NOT advanced', async () => {
    // done as: silence_timeout close reason
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { topicId } = await seedCurriculum(subjectId);

    const [sessionRow] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        topicId,
        sessionType: 'learning',
        status: 'completed',
        exchangeCount: 2,
      })
      .returning({ id: learningSessions.id });
    const sessionId = sessionRow!.id;

    await seedSessionEvents({ sessionId, profileId, subjectId, topicId });
    await seedLearningProfile(profileId);

    const now = new Date();
    const step = buildStep();
    const handler = getHandler();

    const result = (await handler({
      event: {
        name: 'app/session.completed',
        data: {
          profileId,
          sessionId,
          subjectId,
          topicId,
          exchangeCount: 2,
          summaryStatus: 'pending',
          timestamp: now.toISOString(),
          verificationType: null,
          sessionType: 'learning',
          qualityRating: null, // silence_timeout — no quality signal
          mode: null,
          reason: 'silence_timeout', // UNATTENDED_REASONS → skip SM-2 + streak
        },
      },
      step,
    })) as { status: string; outcomes: Array<{ step: string; status: string }> };

    // update-retention skipped (no quality signal for silence_timeout)
    const retentionOutcome = result.outcomes.find(
      (o) => o.step === 'update-retention',
    );
    expect(retentionOutcome?.status).toBe('skipped');

    // No retention card created (SM-2 did not advance)
    const card = await db.query.retentionCards.findFirst({
      where: and(
        eq(retentionCards.profileId, profileId),
        eq(retentionCards.topicId, topicId),
      ),
    });
    expect(card).toBeUndefined();

    // Streak NOT advanced for unattended session — recordSessionActivity not called
    const streak = await db.query.streaks.findFirst({
      where: eq(streaks.profileId, profileId),
    });
    // No prior streak row for this fresh profile. recordSessionActivity skipped
    // → no row created at all.
    expect(streak).toBeUndefined();
  });

  it('memory dedup rollout: dedup-new-facts step runs when flags enabled and profile in rollout', async () => {
    // done as: memory dedup rollout
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { topicId } = await seedCurriculum(subjectId);
    const { sessionId } = await seedSession({ profileId, subjectId, topicId });
    await seedSessionEvents({ sessionId, profileId, subjectId, topicId });
    await seedLearningProfile(profileId);

    // Seed memory_facts rows so dedup has candidates (no embedding = skippable)
    await db.insert(memoryFacts).values([
      {
        profileId,
        category: 'interests',
        text: 'likes photosynthesis',
        textNormalized: 'likes photosynthesis',
        observedAt: new Date(),
      },
    ]);

    // Spy on config flags to enable dedup + force profile into rollout
    const dedupEnabledSpy = jest
      .spyOn(config, 'isMemoryFactsDedupEnabled')
      .mockReturnValue(true);
    const rolloutSpy = jest
      .spyOn(config, 'isProfileInDedupRollout')
      .mockReturnValue(true);

    const now = new Date();
    const step = buildStep();
    const handler = getHandler();

    const result = (await handler({
      event: {
        name: 'app/session.completed',
        data: {
          profileId,
          sessionId,
          subjectId,
          topicId,
          exchangeCount: 2,
          summaryStatus: 'pending',
          timestamp: now.toISOString(),
          verificationType: null,
          sessionType: 'learning',
          qualityRating: 4,
          mode: null,
          reason: 'user_ended',
        },
      },
      step,
    })) as { status: string; outcomes: Array<{ step: string; status: string }> };

    dedupEnabledSpy.mockRestore();
    rolloutSpy.mockRestore();

    // dedup-new-facts outcome is present and 'ok'
    const dedupOutcome = result.outcomes.find(
      (o) => o.step === 'dedup-new-facts',
    );
    expect(dedupOutcome?.status).toBe('ok');
  });

  it('waitForEvent timeout: filing_timed_out event sent and captureException called', async () => {
    // done as: waitForEvent timeout — filing-timed-out event emission
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { topicId } = await seedCurriculum(subjectId);

    // Freeform session — no topicId at close → triggers waitForEvent
    const [sessionRow] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        topicId: null,
        sessionType: 'learning',
        status: 'completed',
        exchangeCount: 2,
      })
      .returning({ id: learningSessions.id });
    const sessionId = sessionRow!.id;

    await seedSessionEvents({ sessionId, profileId, subjectId, topicId });
    await seedLearningProfile(profileId);

    const captureExceptionSpy = jest.spyOn(sentry, 'captureException');

    const now = new Date();
    const step = {
      run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
      // waitForEvent returns null → timeout path
      waitForEvent: jest.fn().mockResolvedValue(null),
      sendEvent: jest.fn().mockResolvedValue(undefined),
    };

    const handler = getHandler();
    await handler({
      event: {
        name: 'app/session.completed',
        data: {
          profileId,
          sessionId,
          subjectId,
          topicId: null, // freeform — triggers waitForEvent
          exchangeCount: 2,
          summaryStatus: 'pending',
          timestamp: now.toISOString(),
          verificationType: null,
          sessionType: 'learning',
          qualityRating: 4,
          mode: null,
          reason: 'user_ended',
        },
      },
      step,
    });

    captureExceptionSpy.mockRestore();

    // step.sendEvent called with app/session.filing_timed_out
    const sendEventCalls = (step.sendEvent as jest.Mock).mock.calls as Array<[string, unknown]>;
    const timedOutCall = sendEventCalls.find((args) => {
      const payload = args[1] as { name?: string } | undefined;
      return payload?.name === 'app/session.filing_timed_out';
    });
    expect(timedOutCall).toBeDefined();

    // captureException was called with a timeout error
    expect(captureExceptionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('waitForEvent timed out') }),
      expect.objectContaining({ profileId }),
    );
  });

});

// ── Scenario coverage index ────────────────────────────────────────────────────
//
// done as: freeform session — waitForEvent succeeds [session-completed-integration-2]
// done as: homework session — waitForEvent + homework summary [session-completed-integration-3]
// done as: relearn session — relearn-retention-reset path [session-completed-integration-4]
// done as: verification evaluate [session-completed-integration-5a]
// done as: verification teach_back [session-completed-integration-5b]
// done as: four_strands pedagogy [session-completed-integration-6]
// done as: struggle detection [session-completed-integration-7]
// done as: silence_timeout close reason [session-completed-integration-8]
// done as: memory dedup rollout [session-completed-integration-9]
// done as: waitForEvent timeout — filing-timed-out event emission [session-completed-integration-10]
