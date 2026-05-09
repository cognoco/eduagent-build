// ---------------------------------------------------------------------------
// session-cache — focused tests for the BUG-667 supplementary-fetch mutex
// ---------------------------------------------------------------------------
// Goal: prove that two concurrent first-exchange callers do NOT both run the
// 5-query supplementary fan-out. They must collapse onto a single in-flight
// promise so the cold-path DB load is bounded to one round-trip.
//
// The dependencies that make the fan-out (fetchPriorTopics, getTeachingPreference,
// getLearningMode, fetchCrossSubjectHighlights, getLearningProfile) are mocked
// at the module boundary so we can count call counts and time the work.
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();
jest.mock('@eduagent/database', () => mockDatabaseModule.module);

const mockFetchPriorTopics = jest.fn();
const mockFetchCrossSubjectHighlights = jest.fn();
jest.mock('../prior-learning' /* gc1-allow: unit test boundary */, () => ({
  fetchPriorTopics: (...args: unknown[]) => mockFetchPriorTopics(...args),
  fetchCrossSubjectHighlights: (...args: unknown[]) =>
    mockFetchCrossSubjectHighlights(...args),
  buildPriorLearningContext: jest.fn(),
  buildCrossSubjectContext: jest.fn(),
}));

const mockGetTeachingPreference = jest.fn();
jest.mock('../retention-data' /* gc1-allow: unit test boundary */, () => ({
  getTeachingPreference: (...args: unknown[]) =>
    mockGetTeachingPreference(...args),
}));

const mockGetLearningMode = jest.fn();
jest.mock('../settings' /* gc1-allow: unit test boundary */, () => ({
  getLearningMode: (...args: unknown[]) => mockGetLearningMode(...args),
}));

const mockGetLearningProfile = jest.fn();
jest.mock('../learner-profile' /* gc1-allow: unit test boundary */, () => ({
  getLearningProfile: (...args: unknown[]) => mockGetLearningProfile(...args),
  buildMemoryBlock: jest.fn(),
  buildAccommodationBlock: jest.fn(),
}));

const mockGetSubject = jest.fn();
jest.mock('../subject' /* gc1-allow: unit test boundary */, () => ({
  // gc1-allow: mutex unit test — controls getSubject call count to verify single supplementary fan-out
  getSubject: (...args: unknown[]) => mockGetSubject(...args),
}));

const mockLoadProfileRowById = jest.fn();
jest.mock('../profile' /* gc1-allow: unit test boundary */, () => ({
  // gc1-allow: mutex unit test — controls loadProfileRowById call count to verify single supplementary fan-out
  loadProfileRowById: (...args: unknown[]) => mockLoadProfileRowById(...args),
}));

import {
  clearSessionStaticContextForProfile,
  getSessionStaticContext,
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
    mockGetLearningMode.mockResolvedValue(null);
    mockGetLearningProfile.mockResolvedValue(null);
    mockGetSubject.mockResolvedValue(null);
    mockLoadProfileRowById.mockResolvedValue(null);
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
    expect(mockGetLearningMode).toHaveBeenCalledTimes(1);
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
    expect(mockGetLearningMode).toHaveBeenCalledTimes(1);
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
    mockGetLearningMode.mockReturnValueOnce(
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
});
