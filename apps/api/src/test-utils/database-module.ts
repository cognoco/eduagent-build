/// <reference types="jest" />
import { createMockDb } from '@eduagent/test-utils';

type MockDatabaseRecord = Record<string, unknown>;

type CreateDatabaseModuleMockOptions<TDb extends MockDatabaseRecord> = {
  db?: TDb;
  includeActual?: boolean;
  exports?: MockDatabaseRecord;
};

// ---------------------------------------------------------------------------
// v2 identity-graph seed (WI-867).
//
// After the IDENTITY_V2_ENABLED collapse, the account-resolve seam calls
// `resolveIdentityV2(db, clerkUserId)` UNCONDITIONALLY. It reads exactly three
// tables — `login` → `membership` (must be exactly one) → `organization` — and
// returns the legacy-shaped `Account` context. Flag-off unit tests never ran
// this path, so their mock dbs carry no `login`/`membership`/`organization`
// query keys and the seam either throws (`db.query.login` undefined) or yields
// a graphless context (→ 403/500).
//
// Seeding the canonical OWNER graph here lets the REAL `resolveIdentityV2` run
// green across the route/function harness with no per-test mocks (GC-clean — no
// `jest.mock` of the identity seam). A test that needs a graphless / non-owner /
// specific identity overrides `db.query.{login,membership,organization}`
// explicitly; those overrides win.
//
// Ids match the harness convention (account/org id 'test-account-id', person id
// 'test-profile-id') so the resolved Account lines up with the legacy
// `findOrCreateAccount` fixtures suites already assert against.
// ---------------------------------------------------------------------------
const V2_IDENTITY_TABLES = ['login', 'membership', 'organization'] as const;

function makeV2IdentityQuery(): Record<
  (typeof V2_IDENTITY_TABLES)[number],
  { findFirst: jest.Mock; findMany: jest.Mock }
> {
  const loginRow = {
    personId: 'test-profile-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
  };
  const membershipRow = {
    personId: 'test-profile-id',
    organizationId: 'test-account-id',
    roles: ['admin', 'learner'],
  };
  const organizationRow = {
    id: 'test-account-id',
    timezone: 'UTC',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  return {
    login: {
      findFirst: jest.fn().mockResolvedValue(loginRow),
      findMany: jest.fn().mockResolvedValue([loginRow]),
    },
    // resolveIdentityV2 requires EXACTLY ONE membership (≠1 → null) — one row.
    membership: {
      findFirst: jest.fn().mockResolvedValue(membershipRow),
      findMany: jest.fn().mockResolvedValue([membershipRow]),
    },
    organization: {
      findFirst: jest.fn().mockResolvedValue(organizationRow),
      findMany: jest.fn().mockResolvedValue([organizationRow]),
    },
  };
}

/**
 * Wrap `db.query` so the three v2 identity tables resolve to a canonical owner
 * graph, while every other table delegates to the test's own db unchanged.
 * Test-provided identity keys win: on the default Proxy db (no real keys) the
 * canonical graph is always used; on a caller-supplied plain-object db a key the
 * test defined (e.g. to force a graphless `login`) takes precedence.
 */
function seedV2IdentityGraph(db: MockDatabaseRecord): void {
  // Some suites pass a db without a `query` object (e.g. the database-middleware
  // test). Proxy requires an object target, so fall back to `{}` — the seeded
  // identity tables are still exposed, every other access returns undefined.
  const originalQuery =
    db.query && typeof db.query === 'object'
      ? (db.query as Record<string | symbol, unknown>)
      : ({} as Record<string | symbol, unknown>);
  const isDefaultMockDb = (db as { __defaultMockDb?: boolean }).__defaultMockDb;
  const graph = makeV2IdentityQuery();

  db.query = new Proxy(originalQuery, {
    get(target, prop) {
      if (
        typeof prop === 'string' &&
        (V2_IDENTITY_TABLES as readonly string[]).includes(prop)
      ) {
        // On a real caller-supplied db, an explicitly-provided key wins so a
        // suite can force graphless/non-owner. The default Proxy db always
        // "has" every key, so gate that branch on the marker.
        if (!isDefaultMockDb && prop in target) {
          return target[prop];
        }
        return graph[prop as (typeof V2_IDENTITY_TABLES)[number]];
      }
      return target[prop];
    },
  });
}

/**
 * Shared factory for tests that still replace `@eduagent/database`.
 *
 * This keeps today's mock-based unit/route suites consistent while making
 * the eventual migration to real DB-backed integration tests cheaper:
 * each suite can later delete one helper usage instead of unwinding a bespoke
 * inline module factory.
 */
export function createDatabaseModuleMock<TDb extends MockDatabaseRecord>(
  options: CreateDatabaseModuleMockOptions<TDb> = {},
): {
  db: TDb;
  createDatabase: jest.Mock;
  closeDatabase: jest.Mock;
  module: MockDatabaseRecord;
} {
  const db = (options.db ?? (createMockDb() as TDb)) as TDb;
  // Seed the v2 identity graph so the now-unconditional resolveIdentityV2 seam
  // resolves the real implementation (WI-867). Idempotent / override-safe.
  seedV2IdentityGraph(db);
  const createDatabase = jest.fn().mockReturnValue(db);
  const closeDatabase = jest.fn().mockResolvedValue(undefined);

  // [F-078] When the mock DB is used, withProfileScope must be overridden to
  // skip the UUID validation (test profiles use non-UUID ids like 'test-profile-id')
  // and to call fn(db) directly — the mock db.transaction handles the pass-through.
  // The actual RLS GUC behavior is tested in the integration suite (rls.integration.test.ts).
  const withProfileScope = jest
    .fn()
    .mockImplementation(
      async <T>(
        _db: unknown,
        _profileId: string,
        fn: (tx: unknown) => Promise<T>,
      ) => fn(db),
    );

  return {
    db,
    createDatabase,
    closeDatabase,
    module: {
      ...(options.includeActual
        ? jest.requireActual('@eduagent/database')
        : {}),
      createDatabase,
      closeDatabase,
      withProfileScope,
      ...(options.exports ?? {}),
    },
  };
}

export function createTransactionalMockDb<TDb extends MockDatabaseRecord>(
  overrides: Partial<TDb> = {},
): TDb & { transaction: jest.Mock } {
  const db = {
    ...(createMockDb() as MockDatabaseRecord),
    ...overrides,
  } as TDb & { transaction?: jest.Mock };

  db.transaction = jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));

  return db as TDb & { transaction: jest.Mock };
}
