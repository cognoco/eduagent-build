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
jest.mock('../prior-learning', () => ({
  fetchPriorTopics: (...args: unknown[]) => mockFetchPriorTopics(...args),
  fetchCrossSubjectHighlights: (...args: unknown[]) =>
    mockFetchCrossSubjectHighlights(...args),
  buildPriorLearningContext: jest.fn(),
  buildCrossSubjectContext: jest.fn(),
}));

const mockGetTeachingPreference = jest.fn();
jest.mock('../retention-data', () => ({
  getTeachingPreference: (...args: unknown[]) =>
    mockGetTeachingPreference(...args),
}));

const mockGetLearningMode = jest.fn();
jest.mock('../settings', () => ({
  getLearningMode: (...args: unknown[]) => mockGetLearningMode(...args),
}));

const mockGetLearningProfile = jest.fn();
jest.mock('../learner-profile', () => ({
  getLearningProfile: (...args: unknown[]) => mockGetLearningProfile(...args),
  buildMemoryBlock: jest.fn(),
  buildAccommodationBlock: jest.fn(),
}));

jest.mock('../subject', () => ({ getSubject: jest.fn() }));

import {
  getOrLoadSessionSupplementary,
  resetSessionStaticContextCache,
  _supplementaryInflightSize,
  type SessionStaticContextCacheEntry,
} from './session-cache';

function makeEntry(
  overrides: Partial<SessionStaticContextCacheEntry> = {}
): SessionStaticContextCacheEntry {
  return {
    profileId: 'profile-1',
    sessionId: 'session-1',
    subjectId: 'subject-1',
    topicId: null,
    expiresAt: Date.now() + 60_000,
    profile: null,
    subject: null,
    homeworkLibraryContextLoaded: false,
    bookLearningHistoryContexts: new Map(),
    ...overrides,
  };
}

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
  });

  it('runs the 5-query fan-out exactly ONCE under concurrent first-exchange calls', async () => {
    // Arrange: two concurrent callers will hit the cache miss path
    // simultaneously. Pre-fix, each caller would invoke each fan-out query
    // independently — call counts would be 2x. With the mutex, the second
    // caller awaits the first caller's in-flight promise.
    const entry = makeEntry();

    const [first, second] = await Promise.all([
      getOrLoadSessionSupplementary(
        {} as never,
        'profile-1',
        'session-1',
        'subject-1',
        false,
        entry
      ),
      getOrLoadSessionSupplementary(
        {} as never,
        'profile-1',
        'session-1',
        'subject-1',
        false,
        entry
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
    const entry = makeEntry();

    await getOrLoadSessionSupplementary(
      {} as never,
      'profile-1',
      'session-1',
      'subject-1',
      false,
      entry
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
      entry
    );
    expect(mockFetchPriorTopics).toHaveBeenCalledTimes(1);
    expect(entry.supplementary).toBeDefined();
  });

  it('clears the in-flight slot on rejection so the next caller can retry', async () => {
    // First call rejects; we must not cache the rejection. A retry should
    // run the fan-out fresh.
    mockFetchPriorTopics.mockRejectedValueOnce(new Error('transient DB blip'));

    const entry = makeEntry();
    await expect(
      getOrLoadSessionSupplementary(
        {} as never,
        'profile-1',
        'session-1',
        'subject-1',
        false,
        entry
      )
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
        entry
      )
    ).resolves.toBeDefined();
    expect(mockFetchPriorTopics).toHaveBeenCalledTimes(2); // initial fail + retry
  });

  it('skips freeform-irrelevant queries (priorTopics, teachingPref, crossSubjectHighlights)', async () => {
    // Freeform sessions have no subject-specific learning history, so those
    // three queries should be elided regardless of the mutex.
    const entry = makeEntry();

    await getOrLoadSessionSupplementary(
      {} as never,
      'profile-1',
      'session-1',
      'subject-1',
      true, // isFreeform
      entry
    );

    expect(mockFetchPriorTopics).not.toHaveBeenCalled();
    expect(mockGetTeachingPreference).not.toHaveBeenCalled();
    expect(mockFetchCrossSubjectHighlights).not.toHaveBeenCalled();
    // But the always-on lookups still fire.
    expect(mockGetLearningMode).toHaveBeenCalledTimes(1);
    expect(mockGetLearningProfile).toHaveBeenCalledTimes(1);
  });
});
