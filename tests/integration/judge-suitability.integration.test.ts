/**
 * Integration: Suitability Judge handler (MMT-ADR-0016 §2/§7 phase 4).
 *
 * Exercises the post-display suitability-judge Inngest handler end-to-end
 * against the real DB:
 *   1. The event carries opaque session_events row ids only (no text).
 *   2. The handler rehydrates the tutor reply + preceding learner message from
 *      session_events (scoped by profileId) and runs the vendor-independent
 *      judge — all inside ONE step closure.
 *   3. Only the non-PII verdict projection (overall + flags) crosses the step
 *      boundary; the raw reply / learner text never appears in the handler
 *      return (the value Inngest memoizes into its third-party state store).
 *
 * Why integration, not unit: the load-bearing property is the DB rehydration
 * scoped by profileId — mocking it away would test nothing. The LLM is the one
 * true external boundary, mocked at the provider registry (the codebase idiom).
 *
 * External boundaries mocked:
 * - Inngest event HTTP API (captured/swallowed at the fetch boundary)
 * - LLM provider (real routeAndCall dispatch, registered judge provider)
 * - Sentry (captureException)
 */

import { and, eq } from 'drizzle-orm';
import { subjects, learningSessions, sessionEvents } from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import { buildAuthHeaders } from './test-keys';
import { mockInngestEvents } from './mocks';
import { clearFetchCalls } from './fetch-interceptor';
import { registerProvider } from '../../apps/api/src/services/llm';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing modules that use them
// ---------------------------------------------------------------------------

const mockCaptureException = jest.fn();
jest.mock('@sentry/cloudflare', () => ({
  withScope: (fn) =>
    fn({ setUser: jest.fn(), setTag: jest.fn(), setExtra: jest.fn() }),
  captureException: (...args) => mockCaptureException(...args),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  withSentry: (_config, handler) => handler,
}));

import { app } from '../../apps/api/src/index';
import { handleSuitabilityJudge } from '../../apps/api/src/inngest/functions/judge-suitability';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_ENV = buildIntegrationEnv();
const AUTH_USER_ID = 'integration-judge-suitability-user';
const AUTH_EMAIL = 'integration-judge-suitability@integration.test';

const LEARNER_MESSAGE = 'How do plants make their own food?';
const TUTOR_REPLY =
  'Plants use sunlight, water, and carbon dioxide to make glucose — photosynthesis.';

const VERDICT_JSON = JSON.stringify({
  overall: 'concern',
  flags: ['topic_drift'],
  rationale: 'The reply added detail beyond what the learner asked.',
});

// ---------------------------------------------------------------------------
// Judge provider — grader routing (`resolveGraderConfig`, router.ts) picks a
// vendor opposite the tutor's, and only ever anthropic-or-openai (never
// gemini, ADR-0016 §2/§10.1). Register stubs for BOTH non-gemini vendors so
// routeAndCall resolves to a provider regardless of which one the grader
// picks. Per test overrides the canned response (valid verdict vs non-JSON
// degraded).
// ---------------------------------------------------------------------------

let judgeResponse = VERDICT_JSON;

function registerJudgeProvider(): void {
  registerProvider({
    id: 'anthropic',
    async chat() {
      return { content: judgeResponse, stopReason: 'stop' };
    },
    async *chatStream() {
      yield judgeResponse;
    },
  });
  registerProvider({
    id: 'openai',
    async chat() {
      return { content: judgeResponse, stopReason: 'stop' };
    },
    async *chatStream() {
      yield judgeResponse;
    },
  });
}

beforeAll(() => {
  mockInngestEvents();
  registerJudgeProvider();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createOwnerProfile(): Promise<string> {
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      body: JSON.stringify({
        displayName: 'Judge Test User',
        birthYear: 2000,
      }),
    },
    TEST_ENV,
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.profile.id as string;
}

/**
 * Seed a subject + learning_session + two session_events (a `user_message`
 * preceding the reply, and the `ai_response` reply under review). Returns the
 * opaque ids the judge event references.
 */
async function seedExchange(profileId: string): Promise<{
  sessionId: string;
  replyEventId: string;
  precedingLearnerMessageEventId: string;
}> {
  const db = createIntegrationDb();

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: 'Biology',
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  const [session] = await db
    .insert(learningSessions)
    .values({ profileId, subjectId: subject!.id })
    .returning({ id: learningSessions.id });

  const [preceding] = await db
    .insert(sessionEvents)
    .values({
      sessionId: session!.id,
      profileId,
      subjectId: subject!.id,
      eventType: 'user_message',
      content: LEARNER_MESSAGE,
    })
    .returning({ id: sessionEvents.id });

  const [reply] = await db
    .insert(sessionEvents)
    .values({
      sessionId: session!.id,
      profileId,
      subjectId: subject!.id,
      eventType: 'ai_response',
      content: TUTOR_REPLY,
    })
    .returning({ id: sessionEvents.id });

  return {
    sessionId: session!.id,
    replyEventId: reply!.id,
    precedingLearnerMessageEventId: preceding!.id,
  };
}

function buildEvent(
  profileId: string,
  ids: {
    sessionId: string;
    replyEventId: string;
    precedingLearnerMessageEventId: string | null;
  },
) {
  return {
    profileId,
    sessionId: ids.sessionId,
    replyEventId: ids.replyEventId,
    precedingLearnerMessageEventId: ids.precedingLearnerMessageEventId,
    ageBracket: 'adult' as const,
    tutorVendor: 'gemini',
    tutorModel: 'gemini-2.5-flash',
    flow: 'exchange',
    conversationLanguage: 'en' as const,
    timestamp: new Date().toISOString(),
  };
}

async function executeHandler(eventData: unknown) {
  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };
  return handleSuitabilityJudge({
    event: { data: eventData },
    step: mockStep,
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  jest.clearAllMocks();
  clearFetchCalls();
  judgeResponse = VERDICT_JSON;
  await cleanupAccounts({ emails: [AUTH_EMAIL], clerkUserIds: [AUTH_USER_ID] });
});

afterAll(async () => {
  await cleanupAccounts({ emails: [AUTH_EMAIL], clerkUserIds: [AUTH_USER_ID] });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: Suitability Judge handler', () => {
  it('rehydrates from session_events and returns the verdict projection (no text)', async () => {
    const profileId = await createOwnerProfile();
    const ids = await seedExchange(profileId);

    const result = await executeHandler(buildEvent(profileId, ids));

    // Verdict projection — overall + flags only.
    expect(result).toEqual({
      judged: true,
      overall: 'concern',
      flags: ['topic_drift'],
    });

    // Data minimization: neither the reply nor the learner message — nor the
    // judge's free-text rationale — may appear in the memoized handler return.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TUTOR_REPLY);
    expect(serialized).not.toContain(LEARNER_MESSAGE);
    expect(serialized).not.toContain('rationale');
  });

  it('judges with no preceding learner message (reply opens the exchange)', async () => {
    const profileId = await createOwnerProfile();
    const ids = await seedExchange(profileId);

    const result = await executeHandler(
      buildEvent(profileId, {
        ...ids,
        precedingLearnerMessageEventId: null,
      }),
    );

    expect(result).toMatchObject({ judged: true, overall: 'concern' });
  });

  it('skips when the reply row cannot be rehydrated (bad/purged ref)', async () => {
    const profileId = await createOwnerProfile();
    const ids = await seedExchange(profileId);

    const result = await executeHandler(
      buildEvent(profileId, {
        ...ids,
        // A well-formed uuid that is not a session_events row.
        replyEventId: '00000000-0000-4000-8000-000000000000',
      }),
    );

    expect(result).toEqual({ skipped: 'reply_not_found' });
  });

  it('fails open (degraded) when the judge returns no parseable verdict', async () => {
    const profileId = await createOwnerProfile();
    const ids = await seedExchange(profileId);

    judgeResponse = 'I cannot comply.'; // no JSON object → judge returns null

    const result = await executeHandler(buildEvent(profileId, ids));

    expect(result).toEqual({ degraded: true });
  });

  it('skips an invalid event payload without touching the DB', async () => {
    const result = await executeHandler({});
    expect(result).toEqual({ skipped: 'invalid_payload' });
  });
});
