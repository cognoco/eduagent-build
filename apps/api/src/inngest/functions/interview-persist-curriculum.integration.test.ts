import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  curricula,
  curriculumTopics,
  generateUUIDv7,
  onboardingDrafts,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import { eq, like } from 'drizzle-orm';
import { PersistCurriculumError } from '@eduagent/schemas';

// EXTERNAL boundary mock — routeAndCall is the LLM provider HTTP call. Per C1 D-MOCK-1 this is the formalized LLM external boundary.
// routeAndCall is the true external boundary (provider API). Mock it here so
// extractSignals and generateCurriculum run their real parsing/DB logic while
// the network call is replaced with a deterministic fixture response.
const mockRouteAndCall = jest.fn();
jest.mock('../../services/llm', () => ({
  ...(jest.requireActual('../../services/llm') as Record<string, unknown>),
  routeAndCall: (...args: unknown[]) => mockRouteAndCall(...args),
}));

// EXTERNAL boundary mocks — sendPushNotification (Expo Push API) and sendEmail (Resend HTTP) are the network-egress boundaries. Per C1 D-MOCK-2, formatters/templating run real.
const mockSendPush = jest.fn();
const mockSendEmail = jest.fn();
jest.mock('../../services/notifications', () => ({
  ...(jest.requireActual('../../services/notifications') as Record<string, unknown>),
  sendPushNotification: (...args: unknown[]) => mockSendPush(...args),
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockCaptureException = jest.fn();
jest.mock('../../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('../client', () => ({
  inngest: {
    createFunction: jest.fn(
      (
        config: Record<string, unknown>,
        _trigger: unknown,
        handler: (...a: unknown[]) => unknown
      ) => ({ fn: handler, onFailure: config.onFailure, config })
    ),
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

import { inngest } from '../client';
import { interviewPersistCurriculum } from './interview-persist-curriculum';

// ── LLM fixture responses ────────────────────────────────────────────────────

/** Valid JSON response for extractSignals (signal-extraction prompt) */
const EXTRACT_SIGNALS_RESPONSE = JSON.stringify({
  goals: ['Learn algebra'],
  experienceLevel: 'beginner',
  currentKnowledge: 'basic arithmetic',
  interests: ['math', 'puzzles'],
});

/** Valid JSON array response for generateCurriculum (curriculum designer prompt) */
const GENERATE_CURRICULUM_RESPONSE = JSON.stringify([
  {
    title: 'Introduction to Algebra',
    description: 'Foundations of algebraic thinking',
    relevance: 'core',
    estimatedMinutes: 30,
  },
  {
    title: 'Variables and Expressions',
    description: 'Working with unknowns',
    relevance: 'core',
    estimatedMinutes: 45,
  },
]);

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `clerk_ipc_integ_${RUN_ID}`;
let seedCounter = 0;

// ── Seed helpers ────────────────────────────────────────────────────────────

async function seedAccount(): Promise<{ accountId: string }> {
  const idx = ++seedCounter;
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: `${CLERK_PREFIX}_${idx}`,
      email: `ipc-integ-${RUN_ID}-${idx}@test.invalid`,
    })
    .returning({ id: accounts.id });
  return { accountId: account!.id };
}

async function seedProfile(accountId: string): Promise<{ profileId: string }> {
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId,
      displayName: 'Test User',
      birthYear: 2010,
      isOwner: true,
    })
    .returning({ id: profiles.id });
  return { profileId: profile!.id };
}

async function seedSubject(profileId: string): Promise<{ subjectId: string }> {
  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: 'Math' })
    .returning({ id: subjects.id });
  return { subjectId: subject!.id };
}

async function seedDraft(
  profileId: string,
  subjectId: string,
  overrides: Partial<typeof onboardingDrafts.$inferInsert> = {}
): Promise<{ draftId: string }> {
  const [draft] = await db
    .insert(onboardingDrafts)
    .values({
      profileId,
      subjectId,
      exchangeHistory: [],
      extractedSignals: {},
      status: 'completing',
      ...overrides,
    })
    .returning({ id: onboardingDrafts.id });
  return { draftId: draft!.id };
}

type HandlerFn = (ctx: {
  event: { data: Record<string, unknown> };
  step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> };
}) => Promise<unknown>;

function getHandler(): HandlerFn {
  return (interviewPersistCurriculum as unknown as { fn: HandlerFn }).fn;
}

function getOnFailure(): (ctx: {
  event: Record<string, unknown>;
  error: unknown;
}) => Promise<unknown> {
  return (
    interviewPersistCurriculum as unknown as {
      onFailure: (ctx: {
        event: Record<string, unknown>;
        error: unknown;
      }) => Promise<unknown>;
    }
  ).onFailure;
}

function makeStep() {
  return {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };
}

function makeEvent(profileId: string, draftId: string, subjectId: string) {
  return {
    data: {
      version: 1,
      draftId,
      profileId,
      subjectId,
      subjectName: 'Math',
    },
  };
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set for interview-persist-curriculum integration tests'
    );
  }
  db = createDatabase(databaseUrl);
}, 30_000);

beforeEach(() => jest.clearAllMocks());

afterAll(async () => {
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
}, 30_000);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('interview-persist-curriculum integration', () => {
  it('cache hit: uses existing extractedSignals, skips LLM extraction', async () => {
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const cached = {
      goals: ['Learn algebra'],
      experienceLevel: 'beginner',
      currentKnowledge: 'basic arithmetic',
      interests: ['math'],
    };
    const { draftId } = await seedDraft(profileId, subjectId, {
      extractedSignals: cached,
      exchangeHistory: [{ role: 'user', content: 'hi' }],
    });
    // Only generateCurriculum calls routeAndCall when signals are already cached.
    mockRouteAndCall.mockResolvedValueOnce({
      response: GENERATE_CURRICULUM_RESPONSE,
    });
    mockSendPush.mockResolvedValue(undefined);

    const handler = getHandler();
    await handler({
      event: makeEvent(profileId, draftId, subjectId),
      step: makeStep(),
    });

    // extractSignals skipped → routeAndCall called exactly once (by generateCurriculum)
    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);

    // Draft marked completed in the real DB
    const row = await db.query.onboardingDrafts.findFirst({
      where: eq(onboardingDrafts.id, draftId),
    });
    expect(row?.status).toBe('completed');
    expect(row?.failureCode).toBeNull();

    // persistCurriculum ran for real: a curriculum row and topics exist
    const curriculum = await db.query.curricula.findFirst({
      where: eq(curricula.subjectId, subjectId),
    });
    expect(curriculum).not.toBeUndefined();
    const topics = await db.query.curriculumTopics.findMany({
      where: eq(curriculumTopics.curriculumId, curriculum!.id),
    });
    expect(topics.length).toBeGreaterThan(0);

    // Notification boundary was reached with the correct interview_ready payload
    // (proves sendPushNotification was called with real args, not silently skipped)
    expect(mockSendPush).toHaveBeenCalledWith(
      expect.anything(), // db
      expect.objectContaining({
        profileId,
        title: 'Your learning path is ready',
        body: 'Math is set up — tap to review',
        type: 'interview_ready',
      })
    );
  });

  it('cache miss: empty signals triggers fresh extraction then persists', async () => {
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { draftId } = await seedDraft(profileId, subjectId, {
      extractedSignals: {
        goals: [],
        experienceLevel: 'beginner',
        currentKnowledge: '',
        interests: [],
      },
      exchangeHistory: [
        { role: 'user', content: 'I want to learn algebra' },
        { role: 'assistant', content: 'Great choice!' },
      ],
    });
    // Call 1: extractSignals → returns signals JSON
    mockRouteAndCall.mockResolvedValueOnce({
      response: EXTRACT_SIGNALS_RESPONSE,
    });
    // Call 2: generateCurriculum → returns topics JSON
    mockRouteAndCall.mockResolvedValueOnce({
      response: GENERATE_CURRICULUM_RESPONSE,
    });
    mockSendPush.mockResolvedValue(undefined);

    const handler = getHandler();
    await handler({
      event: makeEvent(profileId, draftId, subjectId),
      step: makeStep(),
    });

    // Both extractSignals and generateCurriculum called routeAndCall
    expect(mockRouteAndCall).toHaveBeenCalledTimes(2);

    // extractedSignals saved into the DB (the 'save-signals' step)
    const row = await db.query.onboardingDrafts.findFirst({
      where: eq(onboardingDrafts.id, draftId),
    });
    expect(row?.status).toBe('completed');
    const savedSignals = row?.extractedSignals as {
      goals: string[];
      experienceLevel: string;
      currentKnowledge: string;
      interests: string[];
    };
    expect(savedSignals.goals).toEqual(['Learn algebra']);
    expect(savedSignals.interests).toContain('math');

    // persistCurriculum ran for real: curriculum and topics in the DB
    const curriculum = await db.query.curricula.findFirst({
      where: eq(curricula.subjectId, subjectId),
    });
    expect(curriculum).not.toBeUndefined();
    const topics = await db.query.curriculumTopics.findMany({
      where: eq(curriculumTopics.curriculumId, curriculum!.id),
    });
    expect(topics.length).toBeGreaterThan(0);
  });

  it('throws NonRetriableError when draft does not exist', async () => {
    const fakeProfileId = generateUUIDv7();
    const fakeDraftId = generateUUIDv7();
    const fakeSubjectId = generateUUIDv7();

    const handler = getHandler();
    await expect(
      handler({
        event: makeEvent(fakeProfileId, fakeDraftId, fakeSubjectId),
        step: makeStep(),
      })
    ).rejects.toThrow(/draft-disappeared/);
  });

  it('onFailure marks draft as failed with classified error code', async () => {
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { draftId } = await seedDraft(profileId, subjectId, {
      status: 'completing',
    });

    const onFailure = getOnFailure();
    await onFailure({
      event: {
        data: {
          event: { data: makeEvent(profileId, draftId, subjectId).data },
          error: new PersistCurriculumError('extract_signals_failed'),
        },
      },
      error: new PersistCurriculumError('extract_signals_failed'),
    });

    const row = await db.query.onboardingDrafts.findFirst({
      where: eq(onboardingDrafts.id, draftId),
    });
    expect(row?.status).toBe('failed');
    expect(row?.failureCode).toBe('extract_signals_failed');
  });

  it('onFailure maps unknown errors to "unknown" code', async () => {
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { draftId } = await seedDraft(profileId, subjectId, {
      status: 'completing',
    });

    const onFailure = getOnFailure();
    await onFailure({
      event: {
        data: {
          event: { data: makeEvent(profileId, draftId, subjectId).data },
          error: new Error('LLM api key sk-zzz... leaked'),
        },
      },
      error: new Error('LLM api key sk-zzz... leaked'),
    });

    const row = await db.query.onboardingDrafts.findFirst({
      where: eq(onboardingDrafts.id, draftId),
    });
    expect(row?.status).toBe('failed');
    expect(row?.failureCode).toBe('unknown');
  });

  it('concurrent claim race: second handler sees completed draft and throws NonRetriableError', async () => {
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { draftId } = await seedDraft(profileId, subjectId, {
      status: 'completed',
      extractedSignals: {
        goals: ['Done'],
        experienceLevel: 'beginner',
        currentKnowledge: '',
        interests: [],
      },
    });

    const handler = getHandler();
    await expect(
      handler({
        event: makeEvent(profileId, draftId, subjectId),
        step: makeStep(),
      })
    ).rejects.toThrow();
  });

  it('push failure captures exception without failing the function', async () => {
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const cached = {
      goals: ['Learn'],
      experienceLevel: 'beginner',
      currentKnowledge: '',
      interests: ['math'],
    };
    const { draftId } = await seedDraft(profileId, subjectId, {
      extractedSignals: cached,
    });
    // Cached signals → only generateCurriculum calls routeAndCall
    mockRouteAndCall.mockResolvedValueOnce({
      response: GENERATE_CURRICULUM_RESPONSE,
    });
    mockSendPush.mockRejectedValueOnce(new Error('Expo down'));

    const handler = getHandler();
    await handler({
      event: makeEvent(profileId, draftId, subjectId),
      step: makeStep(),
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        profileId,
        extra: expect.objectContaining({ phase: 'completion_push_failed' }),
      })
    );

    const row = await db.query.onboardingDrafts.findFirst({
      where: eq(onboardingDrafts.id, draftId),
    });
    expect(row?.status).toBe('completed');
  });
});
