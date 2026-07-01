// ---------------------------------------------------------------------------
// session-cache — focused tests for the BUG-667 supplementary-fetch mutex
// ---------------------------------------------------------------------------
// Goal: prove that two concurrent first-exchange callers do NOT both run the
// 5-query supplementary fan-out. They must collapse onto a single in-flight
// promise so the cold-path DB load is bounded to one round-trip.
//
// The dependencies that make the fan-out (fetchPriorTopics, getTeachingPreference,
// getLearningModeRecord, fetchCrossSubjectHighlights, getLearningProfile) are mocked
// at the module boundary so we can count call counts and time the work.
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();
jest.mock(
  '@eduagent/database' /* gc1-allow: service unit test — db boundary mocked; real DB covered by sibling .integration.test.ts where present */,
  () => mockDatabaseModule.module,
);

const mockFetchPriorTopics = jest.fn();
const mockFetchCrossSubjectHighlights = jest.fn();
jest.mock('../prior-learning', () => {
  const actual = jest.requireActual(
    '../prior-learning',
  ) as typeof import('../prior-learning');
  return {
    ...actual,
    fetchPriorTopics: (...args: unknown[]) => mockFetchPriorTopics(...args),
    fetchCrossSubjectHighlights: (...args: unknown[]) =>
      mockFetchCrossSubjectHighlights(...args),
    buildPriorLearningContext: jest.fn(),
    buildCrossSubjectContext: jest.fn(),
  };
});

const mockGetTeachingPreference = jest.fn();
jest.mock('../retention-data', () => {
  const actual = jest.requireActual(
    '../retention-data',
  ) as typeof import('../retention-data');
  return {
    ...actual,
    getTeachingPreference: (...args: unknown[]) =>
      mockGetTeachingPreference(...args),
  };
});

const mockGetLearningModeRecord = jest.fn();
jest.mock('../settings', () => {
  const actual = jest.requireActual(
    '../settings',
  ) as typeof import('../settings');
  return {
    ...actual,
    getLearningModeRecord: (...args: unknown[]) =>
      mockGetLearningModeRecord(...args),
  };
});

const mockGetLearningProfile = jest.fn();
jest.mock('../learner-profile', () => {
  const actual = jest.requireActual(
    '../learner-profile',
  ) as typeof import('../learner-profile');
  return {
    ...actual,
    getLearningProfile: (...args: unknown[]) => mockGetLearningProfile(...args),
    buildMemoryBlock: jest.fn(),
    buildAccommodationBlock: jest.fn(),
  };
});

const mockBuildHomeworkLibraryContext = jest.fn();
const mockBuildBookLearningHistoryContext = jest.fn();
jest.mock(
  './session-context-builders' /* gc1-allow: session-cache unit test controls context-builder output to verify cache-key writes */,
  () => {
    const actual = jest.requireActual(
      './session-context-builders',
    ) as typeof import('./session-context-builders');
    return {
      ...actual,
      buildHomeworkLibraryContext: (...args: unknown[]) =>
        mockBuildHomeworkLibraryContext(...args),
      buildBookLearningHistoryContext: (...args: unknown[]) =>
        mockBuildBookLearningHistoryContext(...args),
    };
  },
);

const mockGetSubject = jest.fn();
jest.mock('../subject', () => {
  const actual = jest.requireActual(
    '../subject',
  ) as typeof import('../subject');
  return {
    ...actual,
    // gc1-allow: mutex unit test — controls getSubject call count to verify single supplementary fan-out
    getSubject: (...args: unknown[]) => mockGetSubject(...args),
  };
});

const mockLoadProfileRowById = jest.fn();
jest.mock('../profile', () => {
  const actual = jest.requireActual(
    '../profile',
  ) as typeof import('../profile');
  return {
    ...actual,
    // gc1-allow: mutex unit test — controls loadProfileRowById call count to verify single supplementary fan-out
    loadProfileRowById: (...args: unknown[]) => mockLoadProfileRowById(...args),
  };
});

const mockLoadProfileRowByIdV2 = jest.fn();
jest.mock('../identity-v2/profile-v2', () => {
  const actual = jest.requireActual(
    '../identity-v2/profile-v2',
  ) as typeof import('../identity-v2/profile-v2');
  return {
    ...actual,
    // [WI-586] controls reader selection to verify the identity-v2 flag routes
    // the profile read to the person/membership twin vs the legacy profiles read.
    loadProfileRowByIdV2: (...args: unknown[]) =>
      mockLoadProfileRowByIdV2(...args),
  };
});

import {
  clearSessionStaticContextForProfile,
  getCachedBookLearningHistoryContext,
  getCachedHomeworkLibraryContext,
  getSessionStaticContext,
  getSessionStaticContextCacheKey,
  getOrLoadSessionSupplementary,
  resetSessionStaticContextCache,
  _sessionStaticContextCacheSize,
  _supplementaryInflightSize,
  type SessionStaticContextCacheEntry,
} from './session-cache';

describe('[BUG-667 / S-10] getOrLoadSessionSupplementary — concurrent fetch mutex', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSessionStaticContextCache();
    // Default resolved values for the 5 fan-out queries.
    mockFetchPriorTopics.mockResolvedValue([]);
    mockFetchCrossSubjectHighlights.mockResolvedValue([]);
    mockGetTeachingPreference.mockResolvedValue(null);
    mockGetLearningModeRecord.mockResolvedValue(null);
    mockGetLearningProfile.mockResolvedValue(null);
    mockGetSubject.mockResolvedValue(null);
    mockLoadProfileRowById.mockResolvedValue(null);
    mockLoadProfileRowByIdV2.mockResolvedValue(null);
    mockBuildHomeworkLibraryContext.mockResolvedValue('homework context');
    mockBuildBookLearningHistoryContext.mockResolvedValue('book context');
  });

  async function makeCachedEntry(
    overrides: Partial<SessionStaticContextCacheEntry> = {},
  ): Promise<SessionStaticContextCacheEntry> {
    return getSessionStaticContext(
      {} as never,
      overrides.profileId ?? 'profile-1',
      overrides.sessionId ?? 'session-1',
      {
        subjectId: overrides.subjectId ?? 'subject-1',
        topicId: overrides.topicId ?? null,
      } as never,
    );
  }

  it('runs the 5-query fan-out exactly ONCE under concurrent first-exchange calls', async () => {
    // Arrange: two concurrent callers will hit the cache miss path
    // simultaneously. Pre-fix, each caller would invoke each fan-out query
    // independently — call counts would be 2x. With the mutex, the second
    // caller awaits the first caller's in-flight promise.
    const entry = await makeCachedEntry();

    const [first, second] = await Promise.all([
      getOrLoadSessionSupplementary(
        {} as never,
        'profile-1',
        'session-1',
        'subject-1',
        false,
        entry,
      ),
      getOrLoadSessionSupplementary(
        {} as never,
        'profile-1',
        'session-1',
        'subject-1',
        false,
        entry,
      ),
    ]);

    // Each fan-out query must have run exactly once across both callers.
    expect(mockFetchPriorTopics).toHaveBeenCalledTimes(1);
    expect(mockGetTeachingPreference).toHaveBeenCalledTimes(1);
    expect(mockGetLearningModeRecord).toHaveBeenCalledTimes(1);
    expect(mockFetchCrossSubjectHighlights).toHaveBeenCalledTimes(1);
    expect(mockGetLearningProfile).toHaveBeenCalledTimes(1);

    // Both callers must have received the SAME materialized object — proves
    // they collapsed onto one promise rather than running independent loads.
    expect(first).toBe(second);

    // The in-flight slot must be released after the load resolves so a
    // future TTL miss can retry without being short-circuited.
    expect(_supplementaryInflightSize()).toBe(0);
  });

  it('caches the resolved value on the entry and skips the fan-out entirely on repeat calls', async () => {
    const entry = await makeCachedEntry();

    await getOrLoadSessionSupplementary(
      {} as never,
      'profile-1',
      'session-1',
      'subject-1',
      false,
      entry,
    );
    expect(mockFetchPriorTopics).toHaveBeenCalledTimes(1);

    // Subsequent call with the same entry — supplementary now populated, so
    // no further DB work should fire.
    await getOrLoadSessionSupplementary(
      {} as never,
      'profile-1',
      'session-1',
      'subject-1',
      false,
      entry,
    );
    expect(mockFetchPriorTopics).toHaveBeenCalledTimes(1);
    expect(entry.supplementary).toEqual(expect.objectContaining({}));
  });

  it('clears the in-flight slot on rejection so the next caller can retry', async () => {
    // First call rejects; we must not cache the rejection. A retry should
    // run the fan-out fresh.
    mockFetchPriorTopics.mockRejectedValueOnce(new Error('transient DB blip'));

    const entry = await makeCachedEntry();
    await expect(
      getOrLoadSessionSupplementary(
        {} as never,
        'profile-1',
        'session-1',
        'subject-1',
        false,
        entry,
      ),
    ).rejects.toThrow('transient DB blip');

    expect(_supplementaryInflightSize()).toBe(0);
    expect(entry.supplementary).toBeUndefined();

    // Retry succeeds — proves we did not cache the rejection.
    await expect(
      getOrLoadSessionSupplementary(
        {} as never,
        'profile-1',
        'session-1',
        'subject-1',
        false,
        entry,
      ),
    ).resolves.toEqual(expect.objectContaining({}));
    expect(mockFetchPriorTopics).toHaveBeenCalledTimes(2); // initial fail + retry
  });

  it('skips freeform-irrelevant queries (priorTopics, teachingPref, crossSubjectHighlights)', async () => {
    // Freeform sessions have no subject-specific learning history, so those
    // three queries should be elided regardless of the mutex.
    const entry = await makeCachedEntry();

    await getOrLoadSessionSupplementary(
      {} as never,
      'profile-1',
      'session-1',
      'subject-1',
      true, // isFreeform
      entry,
    );

    expect(mockFetchPriorTopics).not.toHaveBeenCalled();
    expect(mockGetTeachingPreference).not.toHaveBeenCalled();
    expect(mockFetchCrossSubjectHighlights).not.toHaveBeenCalled();
    // But the always-on lookups still fire.
    expect(mockGetLearningModeRecord).toHaveBeenCalledTimes(1);
    expect(mockGetLearningProfile).toHaveBeenCalledTimes(1);
  });

  it('clears cached session context only for the requested profile', async () => {
    await makeCachedEntry({ profileId: 'profile-1', sessionId: 'session-1' });
    await makeCachedEntry({ profileId: 'profile-1', sessionId: 'session-2' });
    await makeCachedEntry({ profileId: 'profile-2', sessionId: 'session-3' });

    clearSessionStaticContextForProfile('profile-1');
    mockGetSubject.mockClear();

    expect(_sessionStaticContextCacheSize()).toBe(1);
    const remaining = await getSessionStaticContext(
      {} as never,
      'profile-2',
      'session-3',
      { subjectId: 'subject-1', topicId: null } as never,
    );
    expect(remaining.profileId).toBe('profile-2');
    expect(mockGetSubject).not.toHaveBeenCalled(); // profile-2 cache survived the clear
  });

  it('clear during in-flight fetch does not resurrect stale supplementary cache', async () => {
    let resolveLearningMode!: (value: { mode: 'casual' }) => void;
    mockGetLearningModeRecord.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLearningMode = resolve;
      }),
    );
    const entry = await makeCachedEntry();

    const promise = getOrLoadSessionSupplementary(
      {} as never,
      'profile-1',
      'session-1',
      'subject-1',
      false,
      entry,
    );

    expect(_supplementaryInflightSize()).toBe(1);
    clearSessionStaticContextForProfile('profile-1');
    expect(_supplementaryInflightSize()).toBe(0);

    resolveLearningMode({ mode: 'casual' });
    await promise;

    expect(_sessionStaticContextCacheSize()).toBe(0);
    expect(entry.supplementary).toBeUndefined();
  });

  it('[WI-911] supplementary loads write back to the cache entry', async () => {
    const entry = await makeCachedEntry({});

    await getOrLoadSessionSupplementary(
      {} as never,
      'profile-1',
      'session-1',
      'subject-1',
      false,
      entry,
    );

    expect(entry.supplementary).toEqual(expect.objectContaining({}));
  });

  it('[WI-911] homework context touches the same cache key as the static context read', async () => {
    await getCachedHomeworkLibraryContext(
      {} as never,
      'profile-1',
      'session-1',
      { subjectId: 'subject-1', topicId: null } as never,
    );

    await getSessionStaticContext({} as never, 'profile-1', 'session-1', {
      subjectId: 'subject-1',
      topicId: null,
    } as never);

    expect(mockLoadProfileRowByIdV2).toHaveBeenCalledTimes(1);
    // [WI-867] Post-collapse the legacy/idv2 key split is gone — both reads
    // share the single :idv2 key, so the static cache holds one entry.
    expect(_sessionStaticContextCacheSize()).toBe(1);
    expect(getSessionStaticContextCacheKey('profile-1', 'session-1')).toBe(
      'profile-1:session-1:idv2',
    );
  });

  it('[WI-911] book context touches the same cache key as the static context read', async () => {
    await getCachedBookLearningHistoryContext(
      {} as never,
      'profile-1',
      'session-1',
      { subjectId: 'subject-1', topicId: null } as never,
      'topic-1',
      'book-1',
    );

    await getSessionStaticContext({} as never, 'profile-1', 'session-1', {
      subjectId: 'subject-1',
      topicId: null,
    } as never);

    expect(mockLoadProfileRowByIdV2).toHaveBeenCalledTimes(1);
    // [WI-867] Post-collapse the legacy/idv2 key split is gone — both reads
    // share the single :idv2 key, so the static cache holds one entry.
    expect(_sessionStaticContextCacheSize()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // [WI-963] parallel resolution — both contexts available / one context absent
  //
  // These tests pin the filtering behaviour that prepareExchangeContext relies on
  // when resolving getCachedBookLearningHistoryContext and
  // getCachedHomeworkLibraryContext in parallel via Promise.all.
  // -------------------------------------------------------------------------

  it('[WI-963] both contexts present: parallel Promise.all resolves both correctly', async () => {
    mockBuildBookLearningHistoryContext.mockResolvedValue('Book context text');
    mockBuildHomeworkLibraryContext.mockResolvedValue('Homework context text');

    const session = {
      subjectId: 'subject-963a',
      topicId: 'topic-963a',
    } as never;

    const [bookCtx, hwCtx] = await Promise.all([
      getCachedBookLearningHistoryContext(
        {} as never,
        'prof-963a',
        'sess-963a',
        session,
        'topic-963a',
        'book-963a',
      ),
      getCachedHomeworkLibraryContext(
        {} as never,
        'prof-963a',
        'sess-963a',
        session,
      ),
    ]);

    // Both resolvers returned strings — filter preserves them in order
    const parts = [bookCtx, hwCtx].filter((part): part is string =>
      Boolean(part),
    );
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('Book context text');
    expect(parts[1]).toBe('Homework context text');
    expect(parts.join('\n\n')).toBe(
      'Book context text\n\nHomework context text',
    );
  });

  it('[WI-963] one context absent: filter excludes undefined and preserves the present one', async () => {
    // Homework context absent (returns undefined) — only book context present
    mockBuildBookLearningHistoryContext.mockResolvedValue('Book context text');
    mockBuildHomeworkLibraryContext.mockResolvedValue(undefined);

    const session = {
      subjectId: 'subject-963b',
      topicId: 'topic-963b',
    } as never;

    const [bookCtx, hwCtx] = await Promise.all([
      getCachedBookLearningHistoryContext(
        {} as never,
        'prof-963b',
        'sess-963b',
        session,
        'topic-963b',
        'book-963b',
      ),
      getCachedHomeworkLibraryContext(
        {} as never,
        'prof-963b',
        'sess-963b',
        session,
      ),
    ]);

    const parts = [bookCtx, hwCtx].filter((part): part is string =>
      Boolean(part),
    );
    expect(parts).toHaveLength(1);
    expect(parts[0]).toBe('Book context text');
  });
});

// ---------------------------------------------------------------------------
// [WI-586] Profile reader selection. getSessionStaticContext must read the
// cached profile row from the person/membership twin (loadProfileRowByIdV2),
// never the legacy `profiles` table (loadProfileRowById) — [WI-867] collapsed
// the flag branch, [WI-868] removed the flag param entirely. After migration
// 0118 drops `profiles`, a read that still hit the legacy path would 500 on
// the hot tutoring exchange path.
// ---------------------------------------------------------------------------
describe('[WI-586] getSessionStaticContext — identity-v2 profile reader selection', () => {
  const legacyRow = { id: 'p', isOwner: false, source: 'legacy' } as never;
  const v2Row = { id: 'p', isOwner: true, source: 'v2' } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    resetSessionStaticContextCache();
    mockGetSubject.mockResolvedValue(null);
    mockLoadProfileRowById.mockResolvedValue(legacyRow);
    mockLoadProfileRowByIdV2.mockResolvedValue(v2Row);
  });

  function read(profileId: string) {
    return getSessionStaticContext({} as never, profileId, 'session-1', {
      subjectId: 'subject-1',
      topicId: null,
    } as never);
  }

  it('reads the person/membership twin, never the legacy profiles table', async () => {
    const entry = await read('profile-on');

    expect(mockLoadProfileRowByIdV2).toHaveBeenCalledTimes(1);
    expect(mockLoadProfileRowByIdV2).toHaveBeenCalledWith(
      {} as never,
      'profile-on',
    );
    expect(mockLoadProfileRowById).not.toHaveBeenCalled();
    expect(entry.profile).toBe(v2Row);
  });
});
