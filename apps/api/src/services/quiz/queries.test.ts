/**
 * queries.test.ts
 *
 * F-078: break-test verifying that getVocabularyRoundContext calls
 * withProfileScope, activating the DB-level GUC (app.current_profile_id)
 * as the second RLS layer alongside createScopedRepository.
 *
 * MMT-ADR-0011 §T3 requires BOTH layers:
 *   1. Application layer: createScopedRepository(db, profileId) — WHERE clause.
 *   2. DB layer: withProfileScope(db, profileId) — SET LOCAL GUC → RLS policies.
 *
 * Without withProfileScope, a Postgres RLS policy referencing
 * current_setting('app.current_profile_id') would see '' or NULL and either
 * fall back to "deny" (safe but unexpected) or "allow-all" (IDOR risk).
 *
 * Red-green verification:
 *   1. Write test — passes (withProfileScope wrapper exists).
 *   2. Remove the wrapper — test FAILS (withProfileScope not called).
 *   3. Restore wrapper — test PASSES again.
 */

// ---------------------------------------------------------------------------
// Internal module spy — not a full mock (GC1 compliant)
// ---------------------------------------------------------------------------
import * as database from '@eduagent/database';

// ---------------------------------------------------------------------------
// Mocks for external / heavy boundaries
// ---------------------------------------------------------------------------

// Mock heavy quiz helpers to avoid real DB calls in a unit test
jest.mock(
  './vocabulary-provider' /* gc1-allow: vocabulary-provider calls external CEFR scoring logic; no real implementation needed for the withProfileScope wiring test */,
  () => ({
    getCefrCeilingForDiscovery: jest.fn().mockReturnValue(undefined),
  }),
);

jest.mock(
  '../logger' /* gc1-allow: observability boundary; logger emits to external log sink, not testable in unit tests */,
  () => ({
    createLogger: () => ({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    }),
  }),
);

import { getVocabularyRoundContext } from './queries';
import type { Database } from '@eduagent/database';

const stubDb = {} as Database;

describe('[F-078 break-test] getVocabularyRoundContext — withProfileScope RLS layer', () => {
  let withProfileScopeSpy: jest.SpyInstance;
  let createScopedRepositorySpy: jest.SpyInstance;

  const mockRepo = {
    subjects: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'subject-1',
        profileId: 'profile-A',
        status: 'active',
        languageCode: 'en',
      }),
    },
    vocabulary: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    vocabularyRetentionCards: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Spy on withProfileScope: intercept and invoke callback with the same db
    // so the inner function can run. This confirms withProfileScope is called
    // AND lets the inner logic run with the mocked scoped repo.
    withProfileScopeSpy = jest
      .spyOn(database, 'withProfileScope')
      .mockImplementation(
        async <T>(
          _db: Database,
          _profileId: string,
          fn: (tx: Database) => Promise<T>,
        ) => fn(stubDb),
      );

    createScopedRepositorySpy = jest
      .spyOn(database, 'createScopedRepository')
      .mockReturnValue(
        mockRepo as unknown as ReturnType<
          typeof database.createScopedRepository
        >,
      );
  });

  afterEach(() => {
    withProfileScopeSpy.mockRestore();
    createScopedRepositorySpy.mockRestore();
  });

  it('[BREAK F-078] calls withProfileScope to activate DB-level RLS GUC', async () => {
    await getVocabularyRoundContext(stubDb, 'profile-A', 'subject-1');

    // Guard: withProfileScope MUST be called with the correct profileId
    expect(withProfileScopeSpy).toHaveBeenCalledWith(
      stubDb,
      'profile-A',
      expect.any(Function),
    );
  });

  it('[BREAK F-078] createScopedRepository is called inside the withProfileScope callback', async () => {
    await getVocabularyRoundContext(stubDb, 'profile-A', 'subject-1');

    // Both layers must be active within the same scoped call
    expect(createScopedRepositorySpy).toHaveBeenCalledWith(
      expect.anything(), // the tx passed by withProfileScope
      'profile-A',
    );
  });

  it('propagates NotFoundError when subject is not found', async () => {
    mockRepo.subjects.findFirst.mockResolvedValueOnce(null);

    const { NotFoundError } = await import('../../errors');
    await expect(
      getVocabularyRoundContext(stubDb, 'profile-A', 'missing-subject'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
