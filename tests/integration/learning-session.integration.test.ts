/**
 * Integration: Learning Session Lifecycle
 *
 * Exercises the real session routes through the full app + real database.
 * Session, interleaved, recall bridge, billing, and settings logic stay real.
 *
 * Mocked boundaries:
 * - JWT verification (Clerk JWKS — via fetch interceptor in setup.ts)
 * - Inngest event HTTP API — via fetch interceptor
 * - LLM provider — via shared provider fixture (real routeAndCall dispatch)
 */

import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { and, asc, eq } from 'drizzle-orm';
import {
  login,
  membership,
  subjects,
  curricula,
  curriculumBooks,
  curriculumTopics,
  retentionCards,
  learningSessions,
  profileQuotaUsage,
  sessionEvents,
  sessionSummaries,
  subscription as subscriptionV2,
} from '@eduagent/database';
import type { SessionType } from '@eduagent/schemas';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import { buildAuthHeaders } from './test-keys';
import { getCapturedInngestEvents, mockInngestEvents } from './mocks';
import { clearFetchCalls } from './fetch-interceptor';
import {
  llmEnvelopeReply,
  registerLlmProviderFixture,
} from '../../apps/api/src/test-utils/llm-provider-fixtures';
import type { ChatMessage } from '../../apps/mobile/src/components/session/ChatShell';
import {
  mentorOpenerIdempotencyKey,
  useSessionStreaming,
} from '../../apps/mobile/src/components/session/use-session-streaming';
import {
  enqueue,
  getOutboxEntry,
} from '../../apps/mobile/src/lib/message-outbox';
import {
  parseSSEStream,
  type StreamFallbackReason,
} from '../../apps/mobile/src/lib/sse';

// External native boundaries only. The real message outbox, mobile session
// orchestration, Hono routes, idempotency middleware, and database all remain
// live in the tests below.
jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = require('@react-native-async-storage/async-storage/jest/async-storage-mock');
  return { __esModule: true, default: storage };
});
jest.mock('expo-crypto', () => ({
  randomUUID: () => crypto.randomUUID(),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }],
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: 'localhost' } },
}));
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ getToken: jest.fn(async () => null) }),
}));
jest.mock('i18next', () => {
  const instance = {
    changeLanguage: jest.fn(async () => undefined),
    init: jest.fn(async () => undefined),
    language: 'en',
    on: jest.fn(),
    t: jest.fn((key: string) => key),
    use: jest.fn(),
  };
  instance.use.mockReturnValue(instance);
  return {
    __esModule: true,
    createInstance: () => instance,
    default: instance,
  };
});
jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  getClient: jest.fn(() => null),
  getCurrentScope: jest.fn(() => ({ clear: jest.fn() })),
  init: jest.fn(),
  setUser: jest.fn(),
}));

// Controllable mock provider — overrides the default mock registered in setup.ts.
// Avoids jest.mock on an internal service (AGENTS.md rule: no internal mocks in
// integration tests). Uses the shared fixture so the full routeAndCall path runs.
beforeAll(() => {
  mockInngestEvents();
  registerLlmProviderFixture({
    chatResponse: {
      feedback: 'Great summary!',
      hasUnderstandingGaps: false,
      gapAreas: [],
      isAccepted: true,
    },
    // [BUG-941] streamMessage's onComplete now runs classifyExchangeOutcome,
    // which requires a parseable envelope with a non-empty `reply` field.
    // Yield a minimal valid envelope so the streaming success-path assertions
    // exercise persist.
    streamResponse: llmEnvelopeReply(
      'Gravity is the force that pulls objects toward each other.',
    ),
  });
});

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();
const AUTH_USER_ID = 'integration-learning-user';
const AUTH_EMAIL = 'integration-learning@integration.test';
const FLAG_EVENT_ID = '00000000-0000-4000-8000-000000000091';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000099';

async function createOwnerProfile(): Promise<string> {
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
      body: JSON.stringify({
        displayName: 'Integration Learner',
        birthYear: 2000,
      }),
    },
    TEST_ENV,
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.profile.id as string;
}

async function loadAccount(): Promise<{ id: string } | undefined> {
  const db = createIntegrationDb();
  // [WI-1145] Resolve the owner's org/account v2-first — the create route writes
  // login/membership unconditionally post-WI-867 collapse (legacy `accounts` empty
  // on the flag-off main lane). Only `.id` is consumed downstream.
  const loginRow = await db.query.login.findFirst({
    where: eq(login.clerkUserId, AUTH_USER_ID),
    columns: { personId: true },
  });
  if (loginRow) {
    const membershipRow = await db.query.membership.findFirst({
      where: eq(membership.personId, loginRow.personId),
      columns: { organizationId: true },
    });
    if (membershipRow) return { id: membershipRow.organizationId };
  }

  return undefined;
}

async function seedSubject(
  profileId: string,
  overrides: Partial<{
    name: string;
    status: 'active' | 'paused' | 'archived';
  }> = {},
) {
  const db = createIntegrationDb();
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: overrides.name ?? 'Biology',
      status: overrides.status ?? 'active',
      pedagogyMode: 'socratic',
    })
    .returning();

  return subject!;
}

async function seedCurriculum(
  subjectId: string,
  topicTitles: string[] = ['Photosynthesis'],
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
    .values({ subjectId, title: 'Test Book', sortOrder: 1 })
    .returning();

  const topics = await db
    .insert(curriculumTopics)
    .values(
      topicTitles.map((title, index) => ({
        curriculumId: curriculum!.id,
        bookId: book!.id,
        title,
        description: `${title} description`,
        sortOrder: index + 1,
        estimatedMinutes: 15,
      })),
    )
    .returning();

  return {
    curriculum: curriculum!,
    topics,
  };
}

async function seedRetentionCards(profileId: string, topicIds: string[]) {
  const db = createIntegrationDb();
  await db.insert(retentionCards).values(
    topicIds.map((topicId, index) => ({
      profileId,
      topicId,
      easeFactor: '2.50',
      intervalDays: 3,
      nextReviewAt: new Date(Date.now() - (index + 1) * 60 * 60 * 1000),
      consecutiveSuccesses: index + 1,
    })),
  );
}

async function startSession(
  profileId: string,
  subjectId: string,
  input?: Record<string, unknown>,
) {
  const res = await app.request(
    `/v1/subjects/${subjectId}/sessions`,
    {
      method: 'POST',
      headers: buildAuthHeaders(
        { sub: AUTH_USER_ID, email: AUTH_EMAIL },
        profileId,
      ),
      body: JSON.stringify({
        subjectId,
        ...(input ?? {}),
      }),
    },
    TEST_ENV,
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  return body.session as {
    id: string;
    subjectId: string;
    topicId: string | null;
    sessionType: SessionType;
    status: string;
  };
}

async function loadSession(sessionId: string) {
  const db = createIntegrationDb();
  return db.query.learningSessions.findFirst({
    where: eq(learningSessions.id, sessionId),
  });
}

async function loadSummary(sessionId: string) {
  const db = createIntegrationDb();
  return db.query.sessionSummaries.findFirst({
    where: eq(sessionSummaries.sessionId, sessionId),
  });
}

async function loadSessionEvents(sessionId: string) {
  const db = createIntegrationDb();
  return db.query.sessionEvents.findMany({
    where: eq(sessionEvents.sessionId, sessionId),
    orderBy: [asc(sessionEvents.createdAt), asc(sessionEvents.id)],
  });
}

type MobileStreamMessage = Parameters<
  typeof useSessionStreaming
>[0]['streamMessage'];

function buildRealMobileStream(profileId: string): MobileStreamMessage {
  return async (message, onChunk, onDone, overrideSessionId, options) => {
    if (!overrideSessionId) {
      throw new Error('Expected the mobile session hook to allocate a session');
    }

    const headers = new Headers(
      buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }, profileId),
    );
    headers.set('Accept', 'text/event-stream');
    if (options?.idempotencyKey) {
      headers.set('Idempotency-Key', options.idempotencyKey);
    }

    const response = await app.request(
      `/v1/sessions/${overrideSessionId}/stream`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ message }),
      },
      TEST_ENV,
    );
    expect(response.status).toBe(200);

    if (response.headers.get('Idempotency-Replay') === 'true') {
      options?.onReplay?.(await response.json());
      return;
    }

    let accumulated = '';
    let fallback:
      | { reason: StreamFallbackReason; fallbackText: string }
      | undefined;
    for await (const event of parseSSEStream(response)) {
      if (event.type === 'chunk') {
        accumulated += event.content;
        onChunk(accumulated);
      } else if (event.type === 'replace') {
        accumulated = event.content;
        onChunk(accumulated);
      } else if (event.type === 'fallback') {
        fallback = {
          reason: event.reason,
          fallbackText: event.fallbackText,
        };
      } else if (event.type === 'done') {
        await onDone({
          exchangeCount: event.exchangeCount,
          escalationRung: event.escalationRung ?? 0,
          expectedResponseMinutes: event.expectedResponseMinutes,
          aiEventId: event.aiEventId,
          fallback,
        });
      } else if (event.type === 'error') {
        throw new Error(event.message);
      }
    }
  };
}

async function renderRealMobileSession(input: {
  profileId: string;
  subjectId?: string;
  rawInput: string;
  activeSessionId?: string;
  mentorOpenerAlreadyPersisted?: boolean;
}) {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const renderer = require('react-test-renderer') as {
    act: (callback: () => void | Promise<void>) => Promise<void>;
    create: (element: React.ReactElement) => { unmount: () => void };
  };
  let currentHook: ReturnType<typeof useSessionStreaming> | null = null;
  let currentSessionId = input.activeSessionId ?? null;
  let messageId = 0;
  const silenceTimerRef: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null> = { current: null };

  function Harness() {
    const [activeSessionId, setActiveSessionId] = React.useState<string | null>(
      input.activeSessionId ?? null,
    );
    const [messages, setMessages] = React.useState<ChatMessage[]>([]);
    currentSessionId = activeSessionId;
    currentHook = useSessionStreaming({
      activeSessionId,
      setActiveSessionId,
      effectiveSubjectId: input.subjectId ?? '',
      effectiveSubjectName: 'Integration subject',
      effectiveMode: 'freeform',
      topicId: undefined,
      topicName: undefined,
      inputMode: 'text',
      rawInput: input.rawInput,
      hasInitialMentorOpener: true,
      mentorOpenerAlreadyPersisted: input.mentorOpenerAlreadyPersisted ?? false,
      resumeFromSessionId: undefined,
      gaps: undefined,
      verificationType: undefined,
      normalizedOcrText: undefined,
      homeworkCaptureSource: undefined,
      messages,
      setMessages,
      setIsStreaming: jest.fn(),
      setExchangeCount: jest.fn(),
      setEscalationRung: jest.fn(),
      setQuotaError: jest.fn(),
      setNotePromptOffered: jest.fn(),
      setShowNoteInput: jest.fn(),
      setResponseHistory: jest.fn(),
      setHomeworkProblemsState: jest.fn(),
      setFluencyDrill: jest.fn(),
      setLanguageLearning: jest.fn(),
      setChallengeRound: jest.fn(),
      setChallengeOffer: jest.fn(),
      setDraftedNote: jest.fn(),
      setLowConfidenceMessageId: jest.fn(),
      homeworkProblemsState: [],
      currentProblemIndex: 0,
      activeHomeworkProblem: undefined,
      homeworkMode: undefined,
      subjectId: input.subjectId,
      classifiedSubject: null,
      isStreaming: false,
      sessionExpired: false,
      quotaError: null,
      draftText: '',
      notePromptOffered: false,
      animationCleanupRef: { current: null },
      silenceTimerRef,
      lastAiAtRef: { current: null },
      lastExpectedMinutesRef: { current: 10 },
      lastRetryPayloadRef: { current: null },
      trackerStateRef: { current: {} as never },
      imageBase64Ref: { current: null },
      imageMimeTypeRef: { current: null },
      activeProfileId: input.profileId,
      apiClient: {
        subjects: {
          ':subjectId': {
            sessions: {
              $post: async ({
                param,
                json,
              }: {
                param: { subjectId: string };
                json: Record<string, unknown>;
              }) =>
                app.request(
                  `/v1/subjects/${param.subjectId}/sessions`,
                  {
                    method: 'POST',
                    headers: buildAuthHeaders(
                      { sub: AUTH_USER_ID, email: AUTH_EMAIL },
                      input.profileId,
                    ),
                    body: JSON.stringify(json),
                  },
                  TEST_ENV,
                ),
            },
          },
        },
      } as never,
      startSession: {
        mutateAsync: async (sessionInput: Record<string, unknown>) => ({
          session: await startSession(
            input.profileId,
            sessionInput.subjectId as string,
            sessionInput,
          ),
        }),
      } as never,
      streamMessage: buildRealMobileStream(input.profileId),
      recordSystemPrompt: { mutateAsync: jest.fn() } as never,
      trackExchange: jest.fn(() => null) as never,
      trigger: jest.fn() as never,
      createLocalMessageId: (prefix) => `${prefix}-${++messageId}`,
      responseHistory: [],
    });
    return null;
  }

  let mounted!: { unmount: () => void };
  await renderer.act(async () => {
    mounted = renderer.create(React.createElement(Harness));
  });

  return {
    act: renderer.act,
    get hook() {
      if (!currentHook) throw new Error('Mobile session hook did not render');
      return currentHook;
    },
    get sessionId() {
      return currentSessionId;
    },
    async unmount() {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      await renderer.act(async () => mounted.unmount());
    },
  };
}

async function loadTranscript(profileId: string, sessionId: string) {
  const response = await app.request(
    `/v1/sessions/${sessionId}/transcript`,
    {
      headers: buildAuthHeaders(
        { sub: AUTH_USER_ID, email: AUTH_EMAIL },
        profileId,
      ),
    },
    TEST_ENV,
  );
  expect(response.status).toBe(200);
  return response.json();
}

type PersistedTranscript = {
  archived: false;
  exchanges: Array<{
    role: 'user' | 'assistant';
    content: string;
    eventId: string;
  }>;
};

function expectCanonicalExchangeOrder(
  transcript: PersistedTranscript,
  userInputs: string[],
): void {
  expect(transcript.archived).toBe(false);
  expect(transcript.exchanges.map((exchange) => exchange.role)).toEqual(
    userInputs.flatMap(() => ['user', 'assistant']),
  );
  expect(
    transcript.exchanges
      .filter((exchange) => exchange.role === 'user')
      .map((exchange) => exchange.content),
  ).toEqual(userInputs);
  for (const exchange of transcript.exchanges) {
    expect(exchange.eventId).toEqual(expect.any(String));
    if (exchange.role === 'assistant') {
      expect(exchange.content.trim().length).toBeGreaterThan(0);
    }
  }
}

async function loadSubscriptionAndQuota(profileId: string) {
  const db = createIntegrationDb();
  const account = await loadAccount();
  expect(account).not.toBeNull();

  // [WI-1145] Resolve the subscription v2-first — the owner bootstrap writes
  // subscription-v2 unconditionally post-WI-867 collapse (legacy `subscriptions`
  // empty on the flag-off main lane). Only `.id` is consumed downstream.
  const [v2Sub] = await db
    .select({ id: subscriptionV2.id })
    .from(subscriptionV2)
    .where(eq(subscriptionV2.organizationId, account!.id))
    .limit(1);
  const subscription = v2Sub;
  expect(subscription).not.toBeNull();

  // [WI-1347] profileQuota may be legitimately absent here: with the legacy
  // tables dropped, quota is lazy-provisioned on first real use rather than
  // eagerly at account/profile creation, so a "before any message" snapshot
  // can observe no row yet. Callers must treat a missing row as zero usage,
  // not an error.
  const profileQuota = await db.query.profileQuotaUsage.findFirst({
    where: and(
      eq(profileQuotaUsage.subscriptionId, subscription!.id),
      eq(profileQuotaUsage.profileId, profileId),
    ),
  });

  return {
    account: account!,
    subscription: subscription!,
    profileQuota,
  };
}

beforeEach(async () => {
  clearFetchCalls();
  await AsyncStorage.clear();
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [AUTH_EMAIL],
    clerkUserIds: [AUTH_USER_ID],
  });
});

describe('Integration: Learning Session Lifecycle', () => {
  describe('V2 Mentor opening exchange persistence', () => {
    it('persists a question opener before a Yes follow-up in exact order and rehydrates the downstream transcript', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId, { name: 'Physics' });
      const opener = 'Why do apples fall toward the ground?';
      const mobile = await renderRealMobileSession({
        profileId,
        subjectId: subject.id,
        rawInput: opener,
      });

      try {
        await mobile.act(async () => {
          await mobile.hook.continueWithMessage('Yes');
        });

        expect(mobile.sessionId).toEqual(expect.any(String));
        const persistedSession = await loadSession(mobile.sessionId!);
        expect(persistedSession?.rawInput).toBe(opener);

        const transcript = (await loadTranscript(
          profileId,
          mobile.sessionId!,
        )) as PersistedTranscript;
        expectCanonicalExchangeOrder(transcript, [opener, 'Yes']);
      } finally {
        await mobile.unmount();
      }
    });

    it('persists a declarative opener as the first canonical exchange', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId, { name: 'History' });
      const opener = 'I want to understand why the Roman Republic ended.';
      const mobile = await renderRealMobileSession({
        profileId,
        subjectId: subject.id,
        rawInput: opener,
      });

      try {
        await mobile.act(async () => {
          await mobile.hook.continueWithMessage(opener, {
            initialMentorOpener: true,
          });
        });

        const persistedSession = await loadSession(mobile.sessionId!);
        expect(persistedSession?.rawInput).toBe(opener);
        const transcript = (await loadTranscript(
          profileId,
          mobile.sessionId!,
        )) as PersistedTranscript;
        expectCanonicalExchangeOrder(transcript, [opener]);
      } finally {
        await mobile.unmount();
      }
    });

    it('preserves the opener when subject creation is delayed until after entry', async () => {
      const profileId = await createOwnerProfile();
      const opener = 'Teach me how watercolor pigments mix on wet paper.';
      const mobile = await renderRealMobileSession({
        profileId,
        rawInput: opener,
      });

      try {
        const createdSubject = await seedSubject(profileId, {
          name: 'Watercolor painting',
        });
        await mobile.act(async () => {
          await mobile.hook.continueWithMessage(opener, {
            initialMentorOpener: true,
            sessionSubjectId: createdSubject.id,
            sessionSubjectName: createdSubject.name,
          });
        });

        const persistedSession = await loadSession(mobile.sessionId!);
        expect(persistedSession).toMatchObject({
          subjectId: createdSubject.id,
          rawInput: opener,
        });
        const transcript = (await loadTranscript(
          profileId,
          mobile.sessionId!,
        )) as PersistedTranscript;
        expectCanonicalExchangeOrder(transcript, [opener]);
      } finally {
        await mobile.unmount();
      }
    });

    it('replays a pending opener after retry and restart with one deterministic event pair', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId, { name: 'Chemistry' });
      const opener = 'Why does salt dissolve in water?';
      const firstMount = await renderRealMobileSession({
        profileId,
        subjectId: subject.id,
        rawInput: opener,
      });
      let sessionId = '';

      try {
        await firstMount.act(async () => {
          await firstMount.hook.continueWithMessage(opener, {
            initialMentorOpener: true,
          });
        });
        sessionId = firstMount.sessionId!;
      } finally {
        await firstMount.unmount();
      }

      const openerKey = mentorOpenerIdempotencyKey(sessionId);
      const pendingEntry = await enqueue({
        profileId,
        flow: 'session',
        surfaceKey: sessionId,
        content: opener,
        id: openerKey,
        metadata: { sessionId },
      });
      const restarted = await renderRealMobileSession({
        profileId,
        subjectId: subject.id,
        rawInput: opener,
        activeSessionId: sessionId,
      });

      try {
        await restarted.act(async () => {
          await restarted.hook.continueWithMessage(opener, {
            initialMentorOpener: true,
            existingEntry: pendingEntry,
          });
        });

        const events = await loadSessionEvents(sessionId);
        expect(
          events.filter((event) => event.eventType === 'user_message'),
        ).toEqual([
          expect.objectContaining({ content: opener, clientId: openerKey }),
        ]);
        expect(
          events.filter((event) => event.eventType === 'ai_response'),
        ).toHaveLength(1);
        expect(
          await getOutboxEntry(profileId, 'session', openerKey),
        ).toBeNull();
        const transcript = (await loadTranscript(
          profileId,
          sessionId,
        )) as PersistedTranscript;
        expectCanonicalExchangeOrder(transcript, [opener]);
      } finally {
        await restarted.unmount();
      }
    });

    it('adds a missing opener to an already-created session without replacing its raw input', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId, { name: 'Biology' });
      const opener = 'How do cells turn food into usable energy?';
      const existingSession = await startSession(profileId, subject.id, {
        rawInput: opener,
      });
      const mobile = await renderRealMobileSession({
        profileId,
        subjectId: subject.id,
        rawInput: opener,
        activeSessionId: existingSession.id,
      });

      try {
        await mobile.act(async () => {
          await mobile.hook.continueWithMessage(opener, {
            initialMentorOpener: true,
          });
        });

        const persistedSession = await loadSession(existingSession.id);
        expect(persistedSession?.rawInput).toBe(opener);
        const transcript = (await loadTranscript(
          profileId,
          existingSession.id,
        )) as PersistedTranscript;
        expectCanonicalExchangeOrder(transcript, [opener]);
      } finally {
        await mobile.unmount();
      }
    });

    it('hydrates an already-persisted opener and appends later input without duplication', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId, { name: 'Astronomy' });
      const opener = 'Explain how astronomers measure the distance to stars.';
      const firstMount = await renderRealMobileSession({
        profileId,
        subjectId: subject.id,
        rawInput: opener,
      });
      let sessionId = '';

      try {
        await firstMount.act(async () => {
          await firstMount.hook.continueWithMessage(opener, {
            initialMentorOpener: true,
          });
        });
        sessionId = firstMount.sessionId!;
      } finally {
        await firstMount.unmount();
      }

      const restored = await renderRealMobileSession({
        profileId,
        subjectId: subject.id,
        rawInput: opener,
        activeSessionId: sessionId,
        mentorOpenerAlreadyPersisted: true,
      });
      try {
        await restored.act(async () => {
          await restored.hook.continueWithMessage(
            'Can you give me an example?',
          );
        });

        const persistedSession = await loadSession(sessionId);
        expect(persistedSession?.rawInput).toBe(opener);
        const transcript = (await loadTranscript(
          profileId,
          sessionId,
        )) as PersistedTranscript;
        expectCanonicalExchangeOrder(transcript, [
          opener,
          'Can you give me an example?',
        ]);
      } finally {
        await restored.unmount();
      }
    });
  });

  describe('POST /v1/subjects/:subjectId/sessions', () => {
    it('starts a real learning session and records the session_start event', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);

      const res = await app.request(
        `/v1/subjects/${subject.id}/sessions`,
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({ subjectId: subject.id }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.session.subjectId).toBe(subject.id);
      expect(body.session.sessionType).toBe('learning');
      expect(body.session.status).toBe('active');

      const session = await loadSession(body.session.id);
      expect(session).not.toBeNull();
      expect(session!.profileId).toBe(profileId);

      const events = await loadSessionEvents(body.session.id);
      expect(events.map((event) => event.eventType)).toContain('session_start');
    });

    it('returns 403 when the subject is paused', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId, { status: 'paused' });

      const res = await app.request(
        `/v1/subjects/${subject.id}/sessions`,
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({ subjectId: subject.id }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('SUBJECT_INACTIVE');
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${UNKNOWN_ID}/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId: UNKNOWN_ID }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  describe('GET /v1/sessions/:sessionId', () => {
    it('returns the real persisted session', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const session = await startSession(profileId, subject.id);

      const res = await app.request(
        `/v1/sessions/${session.id}`,
        {
          method: 'GET',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.session.id).toBe(session.id);
      expect(body.session.subjectId).toBe(subject.id);
      expect(body.session.sessionType).toBe('learning');
    });

    it('returns 404 when the session does not exist', async () => {
      const profileId = await createOwnerProfile();

      const res = await app.request(
        `/v1/sessions/${UNKNOWN_ID}`,
        {
          method: 'GET',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/sessions/:sessionId/messages', () => {
    it('processes a real message, persists exchange events, and decrements quota', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const session = await startSession(profileId, subject.id);

      const before = await loadSubscriptionAndQuota(profileId);

      const res = await app.request(
        `/v1/sessions/${session.id}/messages`,
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({ message: 'What is photosynthesis?' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('X-Quota-Remaining')).toBe('699');
      const body = await res.json();
      expect(body.response).toEqual(expect.any(String));
      expect(body.response.length).toBeGreaterThan(0);
      expect(body.exchangeCount).toBe(1);
      expect(body.aiEventId).toEqual(expect.any(String));

      const updatedSession = await loadSession(session.id);
      expect(updatedSession!.exchangeCount).toBe(1);

      const quota = await loadSubscriptionAndQuota(profileId);
      expect(quota.subscription.id).toBe(before.subscription.id);
      expect(quota.profileQuota).not.toBeUndefined();
      // [WI-1347] before.profileQuota may be undefined — lazy-provisioned on
      // this first message, so "before" usage is implicitly 0.
      expect(quota.profileQuota!.usedThisMonth).toBe(
        (before.profileQuota?.usedThisMonth ?? 0) + 1,
      );

      const events = await loadSessionEvents(session.id);
      expect(events.map((event) => event.eventType)).toEqual(
        expect.arrayContaining([
          'session_start',
          'user_message',
          'ai_response',
        ]),
      );
    });

    it('returns 400 when message is missing', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const session = await startSession(profileId, subject.id);

      const res = await app.request(
        `/v1/sessions/${session.id}/messages`,
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/sessions/:sessionId/stream', () => {
    it('returns SSE output and persists the streamed exchange', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const session = await startSession(profileId, subject.id);

      const res = await app.request(
        `/v1/sessions/${session.id}/stream`,
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({ message: 'Explain gravity' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      // Hono's app.request() test helper + TransformStream may not capture
      // intermediate SSE chunks via res.text() — the "done" event is the
      // reliable assertion here. Chunk format is verified by the unit test
      // in sessions.test.ts which mocks streamMessage with pre-built chunks.
      const body = await res.text();
      expect(body).toContain('"type":"done"');

      const updatedSession = await loadSession(session.id);
      expect(updatedSession!.exchangeCount).toBe(1);

      const events = await loadSessionEvents(session.id);
      expect(events.map((event) => event.eventType)).toEqual(
        expect.arrayContaining([
          'session_start',
          'user_message',
          'ai_response',
        ]),
      );
    });
  });

  describe('POST /v1/sessions/:sessionId/close and summary routes', () => {
    it('closes the session with pending summary and does not dispatch completion yet', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const session = await startSession(profileId, subject.id);

      const res = await app.request(
        `/v1/sessions/${session.id}/close`,
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessionId).toBe(session.id);
      expect(body.summaryStatus).toBe('pending');
      expect(body.wallClockSeconds).toEqual(expect.any(Number));
      expect(body.wallClockSeconds).toBeGreaterThanOrEqual(0);
      expect(getCapturedInngestEvents()).toHaveLength(0);

      const persistedSession = await loadSession(session.id);
      expect(persistedSession!.status).toBe('completed');

      const summary = await loadSummary(session.id);
      expect(summary).not.toBeNull();
      expect(summary!.status).toBe('pending');

      const summaryRes = await app.request(
        `/v1/sessions/${session.id}/summary`,
        {
          method: 'GET',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
        },
        TEST_ENV,
      );

      expect(summaryRes.status).toBe(200);
      const summaryBody = await summaryRes.json();
      expect(summaryBody.summary.status).toBe('pending');
      expect(summaryBody.summary.content).toBe('');
      expect(summaryBody.summary.aiFeedback).toBeNull();
    });

    it('submits a learner summary, stores the evaluation, and dispatches completion', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId, { name: 'Photosynthesis' });
      const session = await startSession(profileId, subject.id);

      const closeRes = await app.request(
        `/v1/sessions/${session.id}/close`,
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );
      expect(closeRes.status).toBe(200);

      const res = await app.request(
        `/v1/sessions/${session.id}/summary`,
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({
            content:
              'I learned that plants use sunlight to turn water and carbon dioxide into food.',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.summary.status).toBe('accepted');
      expect(body.summary.aiFeedback).toEqual(expect.any(String));
      expect(body.summary.content).toContain('sunlight');

      const summary = await loadSummary(session.id);
      expect(summary).not.toBeNull();
      expect(summary!.status).toBe('accepted');
      expect(summary!.content).toContain('sunlight');

      // [WI-1347] Scoped to app/session.* — with the legacy tables dropped,
      // quota is lazy-provisioned on first use and emits an unrelated
      // app/billing.profile_quota.lazy_provisioned event earlier in this
      // flow (a billing/quota concern this describe doesn't own). See
      // getCapturedInngestEvents' doc comment, option 3 (scope by event name).
      const sessionEventsCaptured = getCapturedInngestEvents().filter((e) =>
        e.name.startsWith('app/session.'),
      );
      expect(sessionEventsCaptured).toEqual([
        expect.objectContaining({
          name: 'app/session.completed',
          data: expect.objectContaining({
            profileId,
            sessionId: session.id,
            subjectId: subject.id,
            summaryStatus: 'accepted',
            qualityRating: 4,
          }),
        }),
      ]);
    });
  });

  describe('POST /v1/sessions/:sessionId/flag', () => {
    it('records the content flag event', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const session = await startSession(profileId, subject.id);

      const res = await app.request(
        `/v1/sessions/${session.id}/flag`,
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({
            eventId: FLAG_EVENT_ID,
            reason: 'Incorrect information',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toContain('flagged');

      const events = await loadSessionEvents(session.id);
      const flagEvent = events.find((event) => event.eventType === 'flag');
      expect(flagEvent).not.toBeUndefined();
      expect(flagEvent!.metadata).toMatchObject({
        eventId: FLAG_EVENT_ID,
        reason: 'Incorrect information',
      });
    });
  });

  describe('POST /v1/sessions/interleaved', () => {
    it('starts an interleaved session with real retained topics', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId, { name: 'Science' });
      const { topics } = await seedCurriculum(subject.id, [
        'Photosynthesis',
        'Gravity',
      ]);
      await seedRetentionCards(
        profileId,
        topics.map((topic) => topic.id),
      );

      const res = await app.request(
        '/v1/sessions/interleaved',
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({ subjectId: subject.id, topicCount: 2 }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.sessionId).toEqual(expect.any(String));
      expect(body.topics).toHaveLength(2);
      expect(
        body.topics.map((topic: { topicId: string }) => topic.topicId),
      ).toEqual(expect.arrayContaining(topics.map((topic) => topic.id)));

      const session = await loadSession(body.sessionId);
      expect(session).not.toBeNull();
      expect(session!.sessionType).toBe('interleaved');
      expect(session!.metadata).toMatchObject({
        interleavedTopics: expect.arrayContaining(
          topics.map((topic) =>
            expect.objectContaining({
              topicId: topic.id,
              subjectId: subject.id,
            }),
          ),
        ),
      });
    });

    it('returns 400 when there are no retained topics to choose from', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      await seedCurriculum(subject.id, ['Photosynthesis']);

      const res = await app.request(
        '/v1/sessions/interleaved',
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({ subjectId: subject.id }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /v1/sessions/:sessionId/recall-bridge', () => {
    it('generates recall questions for a real homework session', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const { topics } = await seedCurriculum(subject.id, ['Photosynthesis']);
      const homeworkSession = await startSession(profileId, subject.id, {
        topicId: topics[0]!.id,
        sessionType: 'homework',
      });

      const res = await app.request(
        `/v1/sessions/${homeworkSession.id}/recall-bridge`,
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topicId).toBe(topics[0]!.id);
      expect(body.topicTitle).toBe('Photosynthesis');
      expect(body.questions.length).toBeGreaterThan(0);
    });

    it('returns 400 for non-homework sessions', async () => {
      const profileId = await createOwnerProfile();
      const subject = await seedSubject(profileId);
      const session = await startSession(profileId, subject.id);

      const res = await app.request(
        `/v1/sessions/${session.id}/recall-bridge`,
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when the session does not exist', async () => {
      const profileId = await createOwnerProfile();

      const res = await app.request(
        `/v1/sessions/${UNKNOWN_ID}/recall-bridge`,
        {
          method: 'POST',
          headers: buildAuthHeaders(
            { sub: AUTH_USER_ID, email: AUTH_EMAIL },
            profileId,
          ),
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });
  });
});
