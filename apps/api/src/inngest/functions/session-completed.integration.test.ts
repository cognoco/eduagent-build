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
  generateUUIDv7,
  learningSessions,
  learningProfiles,
  profiles,
  progressSnapshots,
  retentionCards,
  sessionEvents,
  streaks,
  subjects,
  xpLedger,
  sessionSummaries,
  type Database,
} from '@eduagent/database';
import { and, eq, like } from 'drizzle-orm';

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
});

// ── Deferred scenarios (future iterations) ────────────────────────────────────
//
// TODO [session-completed-integration-2]: freeform session (topicId=null)
//   exercises waitForEvent + re-read-session step; transcript is freeform.
//
// TODO [session-completed-integration-3]: homework session (sessionType='homework')
//   exercises waitForEvent + extractAndStoreHomeworkSummary.
//
// TODO [session-completed-integration-4]: relearn session (mode='relearn')
//   exercises relearn-retention-reset path before SM-2 update.
//
// TODO [session-completed-integration-5]: verification flows
//   verificationType='evaluate' + verificationType='teach_back'
//   exercises processEvaluateCompletion / processTeachBackCompletion.
//
// TODO [session-completed-integration-6]: four_strands pedagogy
//   subject.pedagogyMode='four_strands' + languageCode set
//   exercises vocabulary extraction + milestone celebrations.
//
// TODO [session-completed-integration-7]: struggle detection
//   memoryConsentStatus='granted', memoryCollectionEnabled=true,
//   analyzeSessionTranscript yielding a StruggleNotification → push fired.
//
// TODO [session-completed-integration-8]: silence_timeout close reason
//   skips SM-2 and streak entirely (UNATTENDED_REASONS guard).
//
// TODO [session-completed-integration-9]: memory dedup rollout
//   MEMORY_FACTS_DEDUP_ENABLED=true + profile in rollout → runDedupForProfile.
//
// TODO [session-completed-integration-10]: waitForEvent timeout
//   Freeform session where step.waitForEvent resolves null (timeout) →
//   app/session.filing_timed_out event emitted via step.sendEvent.
