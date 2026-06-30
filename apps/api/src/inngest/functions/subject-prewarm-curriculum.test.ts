// Lazy select chain for MIN(grantedAt) fallback in reduceBasisState.
// Called only when currentGrant != null && request == null (WITHDRAWN path).
const mockSelectChain = {
  from: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnValue({
      // Returns [{ minGrantedAt: null }] — the ordering-key fallback path.
      then: (resolve: (v: unknown) => unknown) =>
        resolve([{ minGrantedAt: null }]),
    }),
  }),
};

// Capture chain for db.update(...).set(...).where(...) so tests can assert the
// persisted terminal-failure payload (failedReason / failedAt).
const updateWhere = jest.fn().mockResolvedValue(undefined);
const updateSet = jest.fn().mockReturnValue({ where: updateWhere });

const mockDb: Record<string, any> = {
  update: jest.fn().mockReturnValue({ set: updateSet }),
  query: {
    curriculumBooks: { findFirst: jest.fn().mockResolvedValue(null) },
    profiles: { findFirst: jest.fn().mockResolvedValue(null) },
    subjects: { findFirst: jest.fn().mockResolvedValue(null) },
    consentStates: { findFirst: jest.fn() },
    // v2 consent path (used by isGdprProcessingAllowedV2 when IDENTITY_V2_ENABLED=true)
    // Default: null membership → no org → processing allowed (mirrors "no row → allowed" legacy)
    membership: { findFirst: jest.fn().mockResolvedValue(null) },
    consentGrant: { findFirst: jest.fn().mockResolvedValue(undefined) },
    consentRequest: { findFirst: jest.fn().mockResolvedValue(undefined) },
    // person queried by getPersonLlmContext (v2 path for learner age + conversation language)
    person: { findFirst: jest.fn().mockResolvedValue(null) },
  },
  // select chain for MIN(grantedAt) fallback in reduceBasisState (called when
  // currentGrant != null && request == null, e.g. WITHDRAWN without a request row)
  select: jest.fn().mockReturnValue(mockSelectChain),
};

import { createDatabaseModuleMock } from '../../test-utils/database-module';

const col = (name: string) => ({ name });
const mockDatabaseModule = createDatabaseModuleMock({
  db: mockDb,
  exports: {
    curriculumBooks: {
      id: col('id'),
      subjectId: col('subjectId'),
      title: col('title'),
      description: col('description'),
      topicsGenerated: col('topicsGenerated'),
    },
    profiles: { id: col('id'), birthYear: col('birthYear') },
    subjects: { id: col('id'), profileId: col('profileId') },
    consentStates: {
      profileId: col('profileId'),
      consentType: col('consentType'),
      requestedAt: col('requestedAt'),
    },
    // [WI-586] v2 consent path: membership/consentGrant/consentRequest/person needed
    // when IDENTITY_V2_ENABLED=true (from .env.development.local)
    person: {
      id: col('id'),
      birthDate: col('birth_date'),
      conversationLanguage: col('conversation_language'),
    },
    membership: {
      personId: col('person_id'),
      organizationId: col('organization_id'),
    },
    consentGrant: {
      chargePersonId: col('charge_person_id'),
      purpose: col('purpose'),
      organizationId: col('organization_id'),
      lawfulBasis: col('lawful_basis'),
      granted: col('granted'),
      withdrawnAt: col('withdrawn_at'),
      grantedAt: col('granted_at'),
      id: col('id'),
    },
    consentRequest: {
      chargePersonId: col('charge_person_id'),
      purpose: col('purpose'),
      organizationId: col('organization_id'),
      requestedBasis: col('requested_basis'),
      status: col('status'),
      requestedAt: col('requested_at'),
      createdAt: col('created_at'),
    },
  },
});

jest.mock(
  '@eduagent/database' /* gc1-allow: inngest unit test — prevents real Neon connection; real DB exercised via .integration.test.ts harness */,
  () => mockDatabaseModule.module,
);

const mockGetStepDatabase = jest.fn();
const mockRunWithStepDatabaseScope = jest.fn(
  async <T>(callback: () => Promise<T>) => callback(),
);
const mockCloseStepDatabases = jest.fn().mockResolvedValue(undefined);

// GC6: real module via requireActual; override the step DB accessors the
// Inngest runtime would otherwise require (DB binding) + pin the cutover flag
// to the legacy path these tests exercise.
jest.mock('../helpers' /* gc1-allow: Inngest step DB boundary */, () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockGetStepDatabase(),
    runWithStepDatabaseScope: (callback: () => Promise<unknown>) =>
      mockRunWithStepDatabaseScope(callback),
    closeStepDatabases: () => mockCloseStepDatabases(),
    isIdentityV2EnabledInStep: () => false,
  };
});

const generatedTopics = {
  topics: [
    {
      title: 'Tea Plant Basics',
      description: 'How tea plants grow',
      chapter: 'Foundations',
      sortOrder: 0,
      estimatedMinutes: 30,
    },
  ],
  connections: [],
};

import { NonRetriableError } from 'inngest';
import * as bookGeneration from '../../services/book-generation';
import * as curriculumService from '../../services/curriculum';
import * as sentry from '../../services/sentry';
import { subjectPrewarmCurriculum } from './subject-prewarm-curriculum';

const profileId = '550e8400-e29b-41d4-a716-446655440001';
const subjectId = '550e8400-e29b-41d4-a716-446655440002';
const bookId = '550e8400-e29b-41d4-a716-446655440003';

function createBook(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: bookId,
    subjectId,
    title: 'Tea',
    description: 'The tea plant and drink',
    topicsGenerated: false,
    ...overrides,
  };
}

function createEventData(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    profileId,
    subjectId,
    bookId,
    timestamp: '2026-05-06T12:00:00.000Z',
    ...overrides,
  };
}

async function execute(eventData: Record<string, unknown>) {
  const step = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };
  const handler = (subjectPrewarmCurriculum as any).fn;
  const result = await handler({
    event: {
      name: 'app/subject.curriculum-prewarm-requested',
      data: eventData,
    },
    step,
  });
  return { result, step };
}

describe('subjectPrewarmCurriculum', () => {
  let generateBookTopicsSpy: jest.SpiedFunction<
    typeof bookGeneration.generateBookTopics
  >;
  let persistBookTopicsSpy: jest.SpiedFunction<
    typeof curriculumService.persistBookTopics
  >;
  let captureExceptionSpy: jest.SpiedFunction<typeof sentry.captureException>;

  beforeEach(() => {
    jest.clearAllMocks();
    generateBookTopicsSpy = jest
      .spyOn(bookGeneration, 'generateBookTopics')
      .mockResolvedValue(generatedTopics);
    persistBookTopicsSpy = jest
      .spyOn(curriculumService, 'persistBookTopics')
      .mockResolvedValue({
        book: {
          id: bookId,
          subjectId,
          title: 'Tea',
          description: null,
          emoji: null,
          sortOrder: 1,
          topicsGenerated: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        topics: [],
        connections: [],
        status: 'NOT_STARTED',
        completedTopicCount: 0,
      });
    captureExceptionSpy = jest
      .spyOn(sentry, 'captureException')
      .mockImplementation(() => undefined);
    mockDb.query.curriculumBooks.findFirst.mockReset().mockResolvedValue(null);
    mockDb.query.profiles.findFirst.mockReset().mockResolvedValue({
      id: profileId,
      birthYear: new Date().getUTCFullYear() - 12,
    });
    mockDb.query.subjects.findFirst.mockReset().mockResolvedValue({
      id: subjectId,
      profileId,
    });
    mockDb.query.consentStates.findFirst
      .mockReset()
      .mockResolvedValue(undefined);
    // v2 path defaults: null membership → no org → processing allowed; null person → null LLM context
    mockDb.query.membership.findFirst.mockReset().mockResolvedValue(null);
    mockDb.query.consentGrant.findFirst
      .mockReset()
      .mockResolvedValue(undefined);
    mockDb.query.consentRequest.findFirst
      .mockReset()
      .mockResolvedValue(undefined);
    mockDb.query.person.findFirst.mockReset().mockResolvedValue(null);
    updateWhere.mockReset().mockResolvedValue(undefined);
    updateSet.mockReset().mockReturnValue({ where: updateWhere });
    mockDb.update.mockReset().mockReturnValue({ set: updateSet });
    mockGetStepDatabase.mockReturnValue(mockDb);
    mockRunWithStepDatabaseScope.mockImplementation(
      async <T>(callback: () => Promise<T>) => callback(),
    );
    mockCloseStepDatabases.mockResolvedValue(undefined);
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  });

  afterEach(() => {
    generateBookTopicsSpy.mockRestore();
    persistBookTopicsSpy.mockRestore();
    captureExceptionSpy.mockRestore();
    delete process.env['DATABASE_URL'];
  });

  it('declares idempotency and profile-scoped concurrency', () => {
    const opts = (subjectPrewarmCurriculum as any).opts;
    expect(opts.id).toBe('subject-prewarm-curriculum');
    expect(opts.retries).toBe(2);
    expect(opts.idempotency).toBe('event.data.bookId');
    expect(opts.concurrency).toEqual({
      limit: 5,
      key: 'event.data.profileId',
    });
  });

  it('short-circuits already-generated books and still emits the cascade', async () => {
    mockDb.query.curriculumBooks.findFirst
      .mockResolvedValueOnce(createBook({ topicsGenerated: true }))
      .mockResolvedValueOnce(createBook({ topicsGenerated: true }));

    const { result, step } = await execute(createEventData());

    expect(result).toEqual(
      expect.objectContaining({
        status: 'already-generated',
        subjectId,
        bookId,
      }),
    );
    expect(generateBookTopicsSpy).not.toHaveBeenCalled();
    expect(persistBookTopicsSpy).not.toHaveBeenCalled();
    expect(step.sendEvent).toHaveBeenCalledWith('emit-topics-generated', {
      name: 'app/book.topics-generated',
      data: { subjectId, bookId, profileId },
    });
  });

  it('throws NonRetriableError when the book no longer exists', async () => {
    await expect(execute(createEventData())).rejects.toThrow(NonRetriableError);
    await expect(execute(createEventData())).rejects.toThrow('book-not-found');
  });

  it('throws NonRetriableError when the book belongs to a different subject', async () => {
    mockDb.query.curriculumBooks.findFirst.mockResolvedValueOnce(
      createBook({ subjectId: '550e8400-e29b-41d4-a716-446655440099' }),
    );

    await expect(execute(createEventData())).rejects.toThrow(
      'book-subject-mismatch',
    );
  });

  // Break test (HIGH-1): crafted event with attacker profileId + victim subjectId/bookId
  // must be rejected before book content is exposed in Inngest run context.
  it('throws NonRetriableError when the subject does not belong to the profile (IDOR break test)', async () => {
    mockDb.query.curriculumBooks.findFirst.mockResolvedValueOnce(createBook());
    mockDb.query.subjects.findFirst.mockResolvedValueOnce(null);

    await expect(
      execute(
        createEventData({ profileId: '550e8400-e29b-41d4-a716-446655440099' }),
      ),
    ).rejects.toThrow('book-profile-mismatch');
  });

  it('generates and persists topics for a pending book', async () => {
    mockDb.query.curriculumBooks.findFirst
      .mockResolvedValueOnce(createBook({ topicsGenerated: false }))
      .mockResolvedValueOnce(createBook({ topicsGenerated: false }))
      .mockResolvedValueOnce(createBook({ topicsGenerated: true }));

    const { result, step } = await execute(createEventData());

    expect(result).toEqual(
      expect.objectContaining({ status: 'completed', subjectId, bookId }),
    );
    expect(generateBookTopicsSpy).toHaveBeenCalledWith(
      'Tea',
      'The tea plant and drink',
      12,
      undefined,
      { conversationLanguage: undefined },
    );
    expect(persistBookTopicsSpy).toHaveBeenCalledWith(
      mockDb,
      profileId,
      subjectId,
      bookId,
      expect.arrayContaining([
        expect.objectContaining({ title: 'Tea Plant Basics' }),
      ]),
      [],
    );
    expect(step.sendEvent).toHaveBeenCalledWith('emit-topics-generated', {
      name: 'app/book.topics-generated',
      data: { subjectId, bookId, profileId },
    });
  });

  it('skips LLM and persist when topicsGenerated flips before step 2', async () => {
    mockDb.query.curriculumBooks.findFirst
      .mockResolvedValueOnce(createBook({ topicsGenerated: false }))
      .mockResolvedValueOnce(createBook({ topicsGenerated: true }))
      .mockResolvedValueOnce(createBook({ topicsGenerated: true }));

    const { result, step } = await execute(createEventData());

    expect(result).toEqual(
      expect.objectContaining({ status: 'pending', subjectId, bookId }),
    );
    expect(generateBookTopicsSpy).not.toHaveBeenCalled();
    expect(persistBookTopicsSpy).not.toHaveBeenCalled();
    expect(step.sendEvent).toHaveBeenCalledWith('emit-topics-generated', {
      name: 'app/book.topics-generated',
      data: { subjectId, bookId, profileId },
    });
  });

  it('captures and throws a non-retriable error when generation returns empty topics', async () => {
    mockDb.query.curriculumBooks.findFirst
      .mockResolvedValueOnce(createBook({ topicsGenerated: false }))
      .mockResolvedValueOnce(createBook({ topicsGenerated: false }));
    generateBookTopicsSpy.mockResolvedValueOnce({
      topics: [],
      connections: [],
    });

    await expect(execute(createEventData())).rejects.toThrow(
      'prewarm-empty-topics',
    );

    expect(persistBookTopicsSpy).not.toHaveBeenCalled();
    expect(captureExceptionSpy).toHaveBeenCalledWith(expect.any(Error), {
      profileId,
      extra: {
        phase: 'prewarm_empty_topics',
        subjectId,
        bookId,
        bookTitle: 'Tea',
        learnerAge: 12,
      },
    });
  });

  // [WI-82] GDPR consent gate — background job must re-check consent at execution time
  // [WI-586] v2 consent path: IDENTITY_V2_ENABLED=true (from .env.development.local)
  // causes isGdprProcessingAllowedV2 to run instead of the legacy isGdprProcessingAllowed.
  // Tests mock membership (to provide an orgId for the consent check) and the v2 consent
  // tables (consentGrant / consentRequest) rather than the legacy consentStates table.
  describe('GDPR consent gate', () => {
    const testOrgId = '550e8400-e29b-41d4-a716-446655440099';
    const now = new Date('2026-06-01T12:00:00.000Z');

    beforeEach(() => {
      // Wire membership so isGdprProcessingAllowedV2 has an org to resolve consent against.
      mockDb.query.membership.findFirst.mockResolvedValue({
        organizationId: testOrgId,
      });
    });

    it.each([
      // WITHDRAWN: grant present + withdrawnAt set
      [
        'WITHDRAWN',
        { granted: true, withdrawnAt: now, grantedAt: now },
        undefined,
      ],
      // PENDING: no grant, request with status 'pending'
      [
        'PENDING',
        undefined,
        { status: 'pending', requestedAt: now, createdAt: now },
      ],
      // PARENTAL_CONSENT_REQUESTED: no grant, request with status 'requested'
      [
        'PARENTAL_CONSENT_REQUESTED',
        undefined,
        { status: 'requested', requestedAt: now, createdAt: now },
      ],
    ])(
      'skips and returns consent_not_granted when consent status is %s',
      async (_label, grantRow, requestRow) => {
        mockDb.query.curriculumBooks.findFirst.mockResolvedValue(
          createBook({ topicsGenerated: false }),
        );
        mockDb.query.consentGrant.findFirst.mockResolvedValue(grantRow);
        mockDb.query.consentRequest.findFirst.mockResolvedValue(requestRow);
        // Dual-mode: legacy path (IDENTITY_V2_ENABLED off) reads consentStates.findFirst.
        // Status label matches legacy enum values (WITHDRAWN/PENDING/PARENTAL_CONSENT_REQUESTED).
        mockDb.query.consentStates.findFirst.mockResolvedValue({
          status: _label,
        });

        const { result } = await execute(createEventData());

        expect(result).toEqual({
          status: 'skipped',
          reason: 'consent_not_granted',
        });
        expect(generateBookTopicsSpy).not.toHaveBeenCalled();
        expect(persistBookTopicsSpy).not.toHaveBeenCalled();
      },
    );

    it('proceeds normally when consent status is CONSENTED', async () => {
      mockDb.query.curriculumBooks.findFirst
        .mockResolvedValueOnce(createBook({ topicsGenerated: false }))
        .mockResolvedValueOnce(createBook({ topicsGenerated: false }))
        .mockResolvedValueOnce(createBook({ topicsGenerated: true }));
      // CONSENTED: grant present + withdrawnAt null
      mockDb.query.consentGrant.findFirst.mockResolvedValue({
        granted: true,
        withdrawnAt: null,
        grantedAt: now,
      });

      const { result } = await execute(createEventData());

      expect(result).toMatchObject({ status: 'completed', subjectId, bookId });
      expect(generateBookTopicsSpy).toHaveBeenCalled();
      expect(persistBookTopicsSpy).toHaveBeenCalled();
    });

    // [WI-82] Cross-step memoization regression: consent granted when
    // load-prewarm-context ran, then withdrawn before generate-and-persist-topics.
    // The re-check INSIDE the generate step must catch the withdrawal.
    it('skips LLM and persist when consent is withdrawn between the load and generate steps', async () => {
      mockDb.query.curriculumBooks.findFirst
        .mockResolvedValueOnce(createBook({ topicsGenerated: false }))
        .mockResolvedValueOnce(createBook({ topicsGenerated: false }))
        .mockResolvedValueOnce(createBook({ topicsGenerated: false }));
      // First call (load-prewarm-context): CONSENTED → context becomes 'pending'.
      // Second call (generate-and-persist-topics): WITHDRAWN → LLM must be skipped.
      mockDb.query.consentGrant.findFirst
        .mockResolvedValueOnce({
          granted: true,
          withdrawnAt: null,
          grantedAt: now,
        })
        .mockResolvedValueOnce({
          granted: true,
          withdrawnAt: now,
          grantedAt: now,
        });
      // Dual-mode: legacy path (IDENTITY_V2_ENABLED off) reads consentStates.findFirst.
      // null (= allowed) on step 1; WITHDRAWN on step 2 → gate blocks.
      mockDb.query.consentStates.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ status: 'WITHDRAWN' });

      const { result } = await execute(createEventData());

      expect(generateBookTopicsSpy).not.toHaveBeenCalled();
      expect(persistBookTopicsSpy).not.toHaveBeenCalled();
      // The handler returns status:'pending' (context.status) when generated===false.
      expect(result).toMatchObject({ status: 'pending', subjectId, bookId });
    });
  });

  // Persisted terminal-failure signal (failedReason / failedAt). Before this,
  // failure was Sentry-only and the subject looked "preparing" forever. Only the
  // terminal failure is persisted: consent-blocked is owned by the consent gate
  // (writes nothing) and there is no persisted "generating" flag.
  describe('persisted failure signal', () => {
    it("writes failedReason='empty_topics' + failedAt when generation returns no topics", async () => {
      mockDb.query.curriculumBooks.findFirst
        .mockResolvedValueOnce(createBook({ topicsGenerated: false }))
        .mockResolvedValueOnce(createBook({ topicsGenerated: false }));
      generateBookTopicsSpy.mockResolvedValueOnce({
        topics: [],
        connections: [],
      });

      await expect(execute(createEventData())).rejects.toThrow(
        'prewarm-empty-topics',
      );

      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          failedReason: 'empty_topics',
          failedAt: expect.any(Date),
        }),
      );
      expect(persistBookTopicsSpy).not.toHaveBeenCalled();
    });

    it('writes no failure signal when consent is not granted at load time (book stays "preparing")', async () => {
      mockDb.query.curriculumBooks.findFirst.mockResolvedValue(
        createBook({ topicsGenerated: false }),
      );
      // Legacy consent path blocked.
      mockDb.query.consentStates.findFirst.mockResolvedValue({
        status: 'WITHDRAWN',
      });
      // v2 path blocked: membership present + grant withdrawn.
      mockDb.query.membership.findFirst.mockResolvedValue({
        organizationId: '550e8400-e29b-41d4-a716-446655440099',
      });
      mockDb.query.consentGrant.findFirst.mockResolvedValue({
        granted: true,
        withdrawnAt: new Date('2026-06-01T12:00:00.000Z'),
        grantedAt: new Date('2026-06-01T12:00:00.000Z'),
      });

      const { result } = await execute(createEventData());

      expect(result).toEqual({
        status: 'skipped',
        reason: 'consent_not_granted',
      });
      // Consent-blocked is owned by the consent gate — no curriculum failure write.
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(generateBookTopicsSpy).not.toHaveBeenCalled();
    });

    it('writes no failure signal on the success path (failure fields cleared by persistBookTopics)', async () => {
      mockDb.query.curriculumBooks.findFirst
        .mockResolvedValueOnce(createBook({ topicsGenerated: false }))
        .mockResolvedValueOnce(createBook({ topicsGenerated: false }))
        .mockResolvedValueOnce(createBook({ topicsGenerated: true }));

      const { result } = await execute(createEventData());

      expect(result).toMatchObject({ status: 'completed', subjectId, bookId });
      // No terminal-failure write on success; clearing of failedReason/failedAt is
      // owned by the real persistBookTopics (spied here, exercised in integration).
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(persistBookTopicsSpy).toHaveBeenCalled();
    });

    describe('onFailure terminal handler', () => {
      const callOnFailure = (
        overrides: Record<string, unknown> = {},
        error: unknown = new Error('transient generation error'),
      ) => {
        const onFailure = (subjectPrewarmCurriculum as any).opts
          .onFailure as (args: {
          event: { data: { event?: { data?: unknown } } };
          error: unknown;
        }) => Promise<unknown>;
        return onFailure({
          event: { data: { event: { data: createEventData(overrides) } } },
          error,
        });
      };

      it('declares an onFailure handler', () => {
        expect(typeof (subjectPrewarmCurriculum as any).opts.onFailure).toBe(
          'function',
        );
      });

      it("writes failedReason='generation_error' + failedAt when retries are exhausted", async () => {
        mockDb.query.curriculumBooks.findFirst.mockResolvedValue(
          createBook({ topicsGenerated: false, failedAt: null }),
        );

        await callOnFailure();

        expect(updateSet).toHaveBeenCalledWith(
          expect.objectContaining({
            failedReason: 'generation_error',
            failedAt: expect.any(Date),
          }),
        );
      });

      it('does not overwrite an already-generated book', async () => {
        mockDb.query.curriculumBooks.findFirst.mockResolvedValue(
          createBook({ topicsGenerated: true, failedAt: null }),
        );

        await callOnFailure();

        expect(mockDb.update).not.toHaveBeenCalled();
      });

      it('does not overwrite a book whose failedAt is already set', async () => {
        mockDb.query.curriculumBooks.findFirst.mockResolvedValue(
          createBook({
            topicsGenerated: false,
            failedAt: new Date('2026-06-01T00:00:00.000Z'),
          }),
        );

        await callOnFailure();

        expect(mockDb.update).not.toHaveBeenCalled();
      });

      it('wraps DB writes in runWithStepDatabaseScope and closes step databases', async () => {
        // Regression guard: onFailure must scope and release the DB handle so
        // connection leaks cannot occur on terminal failures (mirrors
        // auto-file-session.ts and topic-probe-extract.ts onFailure pattern).
        mockDb.query.curriculumBooks.findFirst.mockResolvedValue(
          createBook({ topicsGenerated: false, failedAt: null }),
        );

        await callOnFailure();

        expect(mockRunWithStepDatabaseScope).toHaveBeenCalled();
        expect(mockCloseStepDatabases).toHaveBeenCalled();
      });
    });
  });
});
