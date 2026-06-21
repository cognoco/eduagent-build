/**
 * orchestrate-round.test.ts
 *
 * F-097: IDOR ownership break-test for buildAndGenerateRound.
 *
 * The guard at orchestrate-round.ts:82-88 verifies subject ownership for
 * non-vocabulary activity types (capitals, guess_who) via createScopedRepository.
 * Without this guard an attacker could supply another profile's subjectId and
 * have it tagged onto their quiz round + practice_activity_events (write-side IDOR).
 *
 * This test is the regression guard:
 *   1. Write the test — confirm it PASSES (guard exists).
 *   2. Temporarily comment the ownership check — test FAILS (exposure confirmed).
 *   3. Restore check — test PASSES again.
 *
 * Red-green pattern per AGENTS.md "Security fixes require a break test."
 */

// ---------------------------------------------------------------------------
// External boundary mocks (allowed by GC1: bare specifier or external module)
// ---------------------------------------------------------------------------

// LLM router is an external boundary (calls third-party LLM providers)
jest.mock('../../services/llm' /* gc1-allow: external LLM boundary */, () => ({
  parseConversationLanguage: jest.fn().mockReturnValue('en'),
  routeAndCall: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Internal modules — use jest.requireActual + targeted overrides per GC1 rules
// ---------------------------------------------------------------------------

// createScopedRepository is the internal guard we need to override per test.
// We spy on it rather than module-mock the whole database package.
import * as database from '@eduagent/database';

// Mock the heavy quiz sub-functions to prevent real DB calls
jest.mock(
  './queries' /* gc1-allow: quiz query helpers are pure DB adapters with no real implementation available in unit tests; wired in integration tests (vocabulary.integration.test.ts) */,
  () => ({
    getRecentAnswers: jest.fn().mockResolvedValue([]),
    getVocabularyRoundContext: jest.fn().mockResolvedValue({
      languageCode: 'en',
      cefrCeiling: undefined,
      allVocabulary: [],
      libraryItems: [],
    }),
    getDueMasteryItems: jest.fn().mockResolvedValue([]),
    getGuessWhoRoundContext: jest.fn().mockResolvedValue({ topicTitles: [] }),
    getRecentCompletedByActivity: jest.fn().mockResolvedValue([]),
  }),
);

jest.mock(
  './generate-round' /* gc1-allow: LLM-calling round generator; no real LLM available in unit test env */,
  () => ({
    generateQuizRound: jest.fn().mockResolvedValue({
      id: 'round-1',
      theme: 'Test',
      questions: [],
      total: 0,
      difficultyBump: false,
    }),
  }),
);

jest.mock(
  './difficulty-bump' /* gc1-allow: scoring helper; isolated to avoid score-history DB setup */,
  () => ({
    shouldApplyDifficultyBump: jest.fn().mockReturnValue(false),
  }),
);

import { buildAndGenerateRound } from './orchestrate-round';
import { SubjectNotFoundError } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { ProfileMeta } from '../../middleware/profile-scope';
import type { GenerateRoundInput } from '@eduagent/schemas';

// Minimal stub database — real DB not needed for unit-level ownership test
const stubDb = {} as Database;

// Minimal ProfileMeta
const profileMeta: ProfileMeta = {
  birthYear: 2000,
  location: null,
  consentStatus: 'CONSENTED',
  hasPremiumLlm: false,
  conversationLanguage: 'en',
  isOwner: true,
  resolvedVia: 'explicit-header',
};

describe('[F-097 break-test] buildAndGenerateRound — IDOR ownership check', () => {
  let createScopedRepositorySpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (createScopedRepositorySpy) {
      createScopedRepositorySpy.mockRestore();
    }
  });

  it('[BREAK F-097] capitals round with a cross-profile subjectId throws SubjectNotFoundError', async () => {
    // Arrange: scoped repository returns null — subject does not belong to profile-A
    createScopedRepositorySpy = jest
      .spyOn(database, 'createScopedRepository')
      .mockReturnValue({
        subjects: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      } as unknown as ReturnType<typeof database.createScopedRepository>);

    const input: GenerateRoundInput = {
      activityType: 'capitals',
      subjectId: 'subject-belonging-to-profile-B',
    };

    // Act + Assert: ownership check must throw, not silently proceed
    await expect(
      buildAndGenerateRound(stubDb, 'profile-A', profileMeta, input),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);

    // Guard: createScopedRepository must have been called with the correct profileId
    expect(createScopedRepositorySpy).toHaveBeenCalledWith(stubDb, 'profile-A');
  });

  it('[BREAK F-097] guess_who round with a cross-profile subjectId throws SubjectNotFoundError', async () => {
    createScopedRepositorySpy = jest
      .spyOn(database, 'createScopedRepository')
      .mockReturnValue({
        subjects: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      } as unknown as ReturnType<typeof database.createScopedRepository>);

    const input: GenerateRoundInput = {
      activityType: 'guess_who',
      subjectId: 'subject-belonging-to-profile-B',
    };

    await expect(
      buildAndGenerateRound(stubDb, 'profile-A', profileMeta, input),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);
  });

  it('capitals round without subjectId proceeds without ownership check', async () => {
    // No ownership check needed when no subjectId is supplied
    createScopedRepositorySpy = jest.spyOn(database, 'createScopedRepository');

    const input: GenerateRoundInput = {
      activityType: 'capitals',
    };

    const result = await buildAndGenerateRound(
      stubDb,
      'profile-A',
      profileMeta,
      input,
    );

    expect(result.activityType).toBe('capitals');
    expect(createScopedRepositorySpy).not.toHaveBeenCalled();
  });

  it('capitals round with own subjectId (findFirst returns subject) succeeds', async () => {
    createScopedRepositorySpy = jest
      .spyOn(database, 'createScopedRepository')
      .mockReturnValue({
        subjects: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 'own-subject', profileId: 'profile-A' }),
        },
      } as unknown as ReturnType<typeof database.createScopedRepository>);

    const input: GenerateRoundInput = {
      activityType: 'capitals',
      subjectId: 'own-subject',
    };

    const result = await buildAndGenerateRound(
      stubDb,
      'profile-A',
      profileMeta,
      input,
    );

    expect(result.activityType).toBe('capitals');
  });
});
