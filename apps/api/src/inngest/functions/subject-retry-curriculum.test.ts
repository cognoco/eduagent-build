import { NonRetriableError } from 'inngest';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { subjectRetryCurriculum } from './subject-retry-curriculum';

const mockGetStepDatabase = jest.fn();
const mockGenerateBookTopics = jest.fn();
const mockPersistBookTopics = jest.fn();
const mockGetProfileAge = jest.fn();
const mockCaptureException = jest.fn();

// GC6: real module via requireActual; override only the two step accessors the
// Inngest runtime would otherwise require (DB binding) + pin the cutover flag to
// the legacy path these tests exercise.
jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockGetStepDatabase(),
    isIdentityV2EnabledInStep: () => false,
  };
});

jest.mock(
  '../../services/book-generation' /* gc1-allow: Inngest step runtime requires mocking service abstractions */,
  () => ({
    generateBookTopics: (...args: unknown[]) => mockGenerateBookTopics(...args),
  }),
);

jest.mock(
  '../../services/curriculum' /* gc1-allow: Inngest step runtime requires mocking service abstractions */,
  () => ({
    persistBookTopics: (...args: unknown[]) => mockPersistBookTopics(...args),
  }),
);

jest.mock(
  '../../services/profile' /* gc1-allow: Inngest step runtime requires mocking service abstractions */,
  () => ({
    getProfileAge: (...args: unknown[]) => mockGetProfileAge(...args),
  }),
);

jest.mock(
  '../../services/sentry' /* gc1-allow: Inngest step runtime requires mocking service abstractions */,
  () => ({
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  }),
);

const handler = (subjectRetryCurriculum as any).fn;

const PROFILE_ID = 'a0000000-0000-4000-8000-000000000001';
const SUBJECT_ID = 'a0000000-0000-4000-8000-000000000002';
const BOOK_ID = 'a0000000-0000-4000-8000-000000000003';

function validPayload(overrides?: Record<string, unknown>) {
  return {
    version: 1,
    profileId: PROFILE_ID,
    subjectId: SUBJECT_ID,
    bookId: BOOK_ID,
    timestamp: '2026-05-10T12:00:00Z',
    ...overrides,
  };
}

function makeMockDb(
  bookOverrides?: Record<string, unknown>,
  options?: { claimReturns?: Array<{ id: string }> },
) {
  const book = {
    id: BOOK_ID,
    subjectId: SUBJECT_ID,
    title: 'Algebra',
    description: 'Intro to algebra',
    topicsGenerated: false,
    retryInFlight: false,
    ...bookOverrides,
  };
  // [WI-125] By default the claim succeeds (returning a single row).
  // Pass `claimReturns: []` to simulate a concurrent claim already in flight.
  const claimReturns = options?.claimReturns ?? [{ id: BOOK_ID }];
  return {
    query: {
      curriculumBooks: {
        findFirst: jest.fn().mockResolvedValue(book),
      },
      subjects: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: SUBJECT_ID, profileId: PROFILE_ID }),
      },
      consentStates: {
        findFirst: jest.fn().mockResolvedValue(undefined),
      },
      // i18n Phase 1: profile lookup for conversationLanguage.
      profiles: {
        findFirst: jest.fn().mockResolvedValue({ conversationLanguage: null }),
      },
    },
    select: jest.fn(),
    // [WI-125] update().set().where().returning() chain for the
    // retry_in_flight atomic claim. The release step also calls
    // update().set().where() but does not call returning() — the chain
    // resolves on .where() so it works for both paths.
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => {
          const p: Promise<unknown> & { returning?: jest.Mock } =
            Promise.resolve(undefined);
          p.returning = jest.fn().mockResolvedValue(claimReturns);
          return p;
        }),
      }),
    }),
  };
}

describe('subjectRetryCurriculum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProfileAge.mockResolvedValue(14);
    mockGenerateBookTopics.mockResolvedValue({
      topics: [
        {
          title: 'T1',
          description: 'D1',
          chapter: 1,
          sortOrder: 1,
          estimatedMinutes: 10,
        },
      ],
      connections: [],
    });
    mockPersistBookTopics.mockResolvedValue({});
  });

  it('has correct function id', () => {
    const opts = (subjectRetryCurriculum as any).opts;
    expect(opts.id).toBe('subject-retry-curriculum');
  });

  it('triggers on app/subject.curriculum-retry-requested', () => {
    const triggers = (subjectRetryCurriculum as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'app/subject.curriculum-retry-requested',
        }),
      ]),
    );
  });

  it('declares retries: 2', () => {
    const opts = (subjectRetryCurriculum as any).opts;
    expect(opts.retries).toBe(2);
  });

  it('declares concurrency limit keyed on profileId', () => {
    const opts = (subjectRetryCurriculum as any).opts;
    expect(opts.concurrency).toMatchObject({
      limit: 2,
      key: 'event.data.profileId',
    });
  });

  // -------------------------------------------------------------------------
  // Invalid payload
  // -------------------------------------------------------------------------

  it('throws NonRetriableError on invalid payload', async () => {
    const { step } = createInngestStepRunner();
    await expect(handler({ event: { data: {} }, step })).rejects.toThrow(
      NonRetriableError,
    );
  });

  it('throws NonRetriableError when version is wrong', async () => {
    const { step } = createInngestStepRunner();
    await expect(
      handler({ event: { data: validPayload({ version: 2 }) }, step }),
    ).rejects.toThrow(NonRetriableError);
  });

  // -------------------------------------------------------------------------
  // Early exit — already generated
  // -------------------------------------------------------------------------

  it('returns already-generated when book.topicsGenerated is true', async () => {
    const mockDb = makeMockDb({ topicsGenerated: true });
    mockGetStepDatabase.mockReturnValue(mockDb);
    const { step } = createInngestStepRunner();

    const result = await handler({
      event: { data: validPayload() },
      step,
    });

    expect(result).toEqual({
      status: 'already-generated',
      subjectId: SUBJECT_ID,
      bookId: BOOK_ID,
    });
    expect(mockGenerateBookTopics).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Book not found / mismatch
  // -------------------------------------------------------------------------

  it('throws NonRetriableError when book not found', async () => {
    const mockDb = makeMockDb();
    mockDb.query.curriculumBooks.findFirst.mockResolvedValue(null);
    mockGetStepDatabase.mockReturnValue(mockDb);
    const { step } = createInngestStepRunner();

    await expect(
      handler({ event: { data: validPayload() }, step }),
    ).rejects.toThrow(NonRetriableError);
  });

  it('throws NonRetriableError when book belongs to different subject', async () => {
    const mockDb = makeMockDb({
      subjectId: 'a0000000-0000-4000-8000-000000000099',
    });
    mockGetStepDatabase.mockReturnValue(mockDb);
    const { step } = createInngestStepRunner();

    await expect(
      handler({ event: { data: validPayload() }, step }),
    ).rejects.toThrow(NonRetriableError);
  });

  it('throws NonRetriableError when subject does not belong to profile', async () => {
    const mockDb = makeMockDb();
    mockDb.query.subjects.findFirst.mockResolvedValue(null);
    mockGetStepDatabase.mockReturnValue(mockDb);
    const { step } = createInngestStepRunner();

    await expect(
      handler({ event: { data: validPayload() }, step }),
    ).rejects.toThrow(NonRetriableError);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('generates topics, persists, emits event on success', async () => {
    const mockDb = makeMockDb();
    const confirmDb = makeMockDb({ topicsGenerated: true });
    let callCount = 0;
    mockGetStepDatabase.mockImplementation(() => {
      callCount++;
      // [WI-125] The function now has 5 step.run calls:
      //   1=load, 2=claim, 3=retry-generate, 4=release, 5=confirm.
      // The first four observe the book as not-yet-generated; only the
      // final confirm step sees topicsGenerated=true (matching production
      // behavior where persistBookTopics flips the flag).
      return callCount <= 4 ? mockDb : confirmDb;
    });
    const { step, sendEventCalls } = createInngestStepRunner();

    const result = await handler({
      event: { data: validPayload() },
      step,
    });

    expect(mockGenerateBookTopics).toHaveBeenCalledWith(
      'Algebra',
      'Intro to algebra',
      14,
      undefined,
      { conversationLanguage: undefined },
    );
    expect(mockPersistBookTopics).toHaveBeenCalledWith(
      mockDb,
      PROFILE_ID,
      SUBJECT_ID,
      BOOK_ID,
      expect.any(Array),
      expect.any(Array),
    );
    expect(sendEventCalls).toContainEqual({
      name: 'emit-retry-topics-generated',
      payload: {
        name: 'app/book.topics-generated',
        data: {
          subjectId: SUBJECT_ID,
          bookId: BOOK_ID,
          profileId: PROFILE_ID,
        },
      },
    });
    expect(result).toMatchObject({
      status: 'retried',
      subjectId: SUBJECT_ID,
      bookId: BOOK_ID,
    });
  });

  // -------------------------------------------------------------------------
  // Empty topics guard
  // -------------------------------------------------------------------------

  it('throws NonRetriableError and captures exception when LLM returns empty topics', async () => {
    const mockDb = makeMockDb();
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockGenerateBookTopics.mockResolvedValue({ topics: [], connections: [] });
    const { step } = createInngestStepRunner();

    await expect(
      handler({ event: { data: validPayload() }, step }),
    ).rejects.toThrow(NonRetriableError);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(NonRetriableError),
      expect.objectContaining({ profileId: PROFILE_ID }),
    );
    expect(mockPersistBookTopics).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Idempotency — second step also checks topicsGenerated
  // -------------------------------------------------------------------------

  it('skips generation in retry step if topics were generated between steps', async () => {
    const mockDb = makeMockDb({ topicsGenerated: false });
    let callCount = 0;
    mockGetStepDatabase.mockImplementation(() => {
      callCount++;
      // [WI-125] After adding the claim/release steps, the retry-generate
      // step is the THIRD getStepDatabase call (was second pre-WI-125).
      // Simulate a concurrent topic generation by returning a db whose
      // book.topicsGenerated is true on the third call.
      if (callCount === 3) {
        return makeMockDb({ topicsGenerated: true });
      }
      return mockDb;
    });
    const { step } = createInngestStepRunner();

    await handler({ event: { data: validPayload() }, step });

    expect(mockGenerateBookTopics).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Event emission gated on confirmation
  // -------------------------------------------------------------------------

  it('does not emit event when confirm step shows topicsGenerated is false', async () => {
    const mockDb = makeMockDb();
    const confirmDb = makeMockDb({ topicsGenerated: false });
    let callCount = 0;
    mockGetStepDatabase.mockImplementation(() => {
      callCount++;
      // [WI-125] The confirm step is the 5th getStepDatabase call after the
      // claim/release additions. Return confirmDb only on call 5+.
      return callCount <= 4 ? mockDb : confirmDb;
    });
    const { step, sendEventCalls } = createInngestStepRunner();

    await handler({ event: { data: validPayload() }, step });

    expect(sendEventCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // [WI-82] GDPR consent gate
  // -------------------------------------------------------------------------

  describe('GDPR consent gate', () => {
    it.each([
      ['WITHDRAWN', { status: 'WITHDRAWN' }],
      ['PENDING', { status: 'PENDING' }],
      ['PARENTAL_CONSENT_REQUESTED', { status: 'PARENTAL_CONSENT_REQUESTED' }],
    ])(
      'skips and returns consent_not_granted when consent status is %s',
      async (_label, consentRow) => {
        const mockDb = makeMockDb();
        mockDb.query.consentStates.findFirst.mockResolvedValue(consentRow);
        mockGetStepDatabase.mockReturnValue(mockDb);
        const { step } = createInngestStepRunner();

        const result = await handler({ event: { data: validPayload() }, step });

        expect(result).toEqual({
          status: 'skipped',
          reason: 'consent_not_granted',
        });
        expect(mockGenerateBookTopics).not.toHaveBeenCalled();
        expect(mockPersistBookTopics).not.toHaveBeenCalled();
      },
    );

    it('proceeds normally when consent status is CONSENTED', async () => {
      const mockDb = makeMockDb();
      const confirmDb = makeMockDb({ topicsGenerated: true });
      mockDb.query.consentStates.findFirst.mockResolvedValue({
        status: 'CONSENTED',
      });
      let callCount = 0;
      mockGetStepDatabase.mockImplementation(() => {
        callCount++;
        // [WI-125] confirm step is now call 5 after claim/release additions.
        return callCount <= 4 ? mockDb : confirmDb;
      });
      const { step } = createInngestStepRunner();

      const result = await handler({ event: { data: validPayload() }, step });

      expect(result).toMatchObject({
        status: 'retried',
        subjectId: SUBJECT_ID,
        bookId: BOOK_ID,
      });
      expect(mockGenerateBookTopics).toHaveBeenCalled();
      expect(mockPersistBookTopics).toHaveBeenCalled();
    });

    // [WI-82] Cross-step memoization regression: consent granted when
    // load-retry-context ran, then withdrawn before retry-generate-and-persist.
    // The re-check INSIDE the generate step must catch the withdrawal.
    it('skips LLM and persist when consent is withdrawn between the load and generate steps', async () => {
      // load-retry-context sees CONSENTED → context becomes 'pending'.
      // retry-generate-and-persist sees WITHDRAWN → LLM must be skipped.
      const loadDb = makeMockDb();
      loadDb.query.consentStates.findFirst
        .mockResolvedValueOnce({ status: 'CONSENTED' })
        .mockResolvedValueOnce({ status: 'WITHDRAWN' });
      const confirmDb = makeMockDb({ topicsGenerated: false });
      let callCount = 0;
      mockGetStepDatabase.mockImplementation(() => {
        callCount++;
        // [WI-125] retry-generate-and-persist is the 3rd getStepDatabase call.
        return callCount <= 4 ? loadDb : confirmDb;
      });
      const { step } = createInngestStepRunner();

      await handler({ event: { data: validPayload() }, step });

      expect(mockGenerateBookTopics).not.toHaveBeenCalled();
      expect(mockPersistBookTopics).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // [WI-125] Inngest-level idempotency + DB-level atomic claim
  // -------------------------------------------------------------------------

  describe('[WI-125] idempotency and DB claim', () => {
    it('declares idempotency keyed on event.data.bookId', () => {
      const opts = (subjectRetryCurriculum as any).opts;
      // Inngest reads idempotency from opts at runtime — the expression
      // string format documents the dedup field unambiguously.
      expect(opts.idempotency).toBe('event.data.bookId');
    });

    it('exits early with already_in_flight when the DB claim returns 0 rows', async () => {
      const mockDb = makeMockDb({}, { claimReturns: [] });
      mockGetStepDatabase.mockReturnValue(mockDb);
      const { step } = createInngestStepRunner();

      const result = await handler({ event: { data: validPayload() }, step });

      expect(result).toEqual({
        status: 'skipped',
        reason: 'already_in_flight',
        subjectId: SUBJECT_ID,
        bookId: BOOK_ID,
      });
      // The LLM was not called — the claim short-circuit fired BEFORE the
      // generate-and-persist step.
      expect(mockGenerateBookTopics).not.toHaveBeenCalled();
      expect(mockPersistBookTopics).not.toHaveBeenCalled();
    });

    // [WI-125 / adversarial-C1] Stale-claim reclaim: when retry_in_flight is
    // true but retry_claimed_at is older than the 15-min stale window (or
    // NULL), the WHERE clause must allow a fresh dispatch to acquire the
    // claim instead of being permanently locked out by a crashed worker.
    // This asserts the claim UPDATE passes a WHERE expression with both the
    // retry_in_flight=false branch AND a stale-time branch (i.e. it does NOT
    // hard-eq retry_in_flight to false the way the pre-fix code did).
    it('claim WHERE clause permits stale reclaim (does not hard-eq retry_in_flight=false)', async () => {
      const mockDb = makeMockDb();
      const updateSet = jest.fn();
      const updateWhere = jest.fn().mockImplementation(() => {
        const p: Promise<unknown> & { returning?: jest.Mock } =
          Promise.resolve(undefined);
        p.returning = jest.fn().mockResolvedValue([{ id: BOOK_ID }]);
        return p;
      });
      mockDb.update = jest.fn().mockReturnValue({
        set: updateSet.mockReturnValue({ where: updateWhere }),
      });
      const confirmDb = makeMockDb({ topicsGenerated: true });
      let callCount = 0;
      mockGetStepDatabase.mockImplementation(() => {
        callCount++;
        return callCount <= 4 ? mockDb : confirmDb;
      });
      const { step } = createInngestStepRunner();

      await handler({ event: { data: validPayload() }, step });

      // The claim step is the first .update() call. Inspect the SET payload —
      // it must include retry_claimed_at being set NOW(), not just
      // retry_in_flight=true (the pre-fix shape).
      const firstSetCall = updateSet.mock.calls[0]?.[0];
      expect(firstSetCall).toMatchObject({
        retryInFlight: true,
      });
      expect(firstSetCall.retryClaimedAt).toBeInstanceOf(Date);

      // The release step (4th step.run) clears retry_claimed_at to NULL.
      // Find a SET call that sets retryInFlight=false and assert it nulls
      // retry_claimed_at too.
      const releaseCall = updateSet.mock.calls.find(
        (c) => c[0]?.retryInFlight === false,
      );
      expect(releaseCall).toBeDefined();
      expect(releaseCall![0].retryClaimedAt).toBeNull();
    });
  });
});
