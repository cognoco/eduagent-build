/**
 * Creates a forbidden-by-default mock database instance for unit testing.
 *
 * **READ THIS BEFORE USING.** [CR-2026-05-21-183 / BUG-588]
 *
 * The returned object is a Proxy chain that resolves every Drizzle query to
 * `undefined` (`findFirst`) or `[]` (`findMany` and chain-built `select`).
 * That default makes the mock dangerous in two ways:
 *
 *   1. **Silent RLS bypass.** Tests that exercise `if (!profile) throw
 *      ForbiddenError` against this mock pass on the "no profile found"
 *      branch even when the production path returns rows and would proceed
 *      to a different code path. The assertion is a false negative.
 *
 *   2. **Empty-array equivalent to no-results.** A read for sibling profiles,
 *      vocabulary, sessions, etc. returns `[]` and the test passes by
 *      pretending the user has no data — masking real bugs in pagination,
 *      filtering, and RLS scoping.
 *
 * **Correct usage pattern:** ALWAYS override the specific query methods your
 * code under test exercises, BEFORE invoking the function. Treat this mock
 * as "configure or break" — the default empty/undefined values are only
 * acceptable for tests whose explicit subject is the "no data" branch.
 *
 * ```ts
 * const db = createMockDb() as Database;
 * // Without these next two lines, any code that reads profiles would
 * // see `undefined` / `[]` and silently take the "no data" path.
 * (db.query.profiles.findFirst as jest.Mock).mockResolvedValue(fixtureProfile);
 * (db.query.subjects.findMany as jest.Mock).mockResolvedValue([fixtureSubject]);
 * ```
 *
 * **Preferred alternative for new tests:** use a real DB via
 * `createIntegrationDb` from the API test harness so production query
 * behavior, foreign keys, and RLS-style scoping are actually exercised.
 * Internal mocks are GC1/GC6 burn-down backlog — every test edit is an
 * opportunity to replace one with the real implementation.
 *
 * **Source-tree guard:** import sites outside test files are blocked by the
 * forward-only test in `neon-mock.guard.test.ts` (which greps the workspace
 * for `createMockDb` imports in non-`*.test.*` files).
 */
export function createMockDb(): unknown {
  // [CR-2026-05-21-183] Defence-in-depth: fail loudly if this helper is
  // somehow imported from a non-test runtime context. The static guard test
  // (`neon-mock.guard.test.ts`) catches new import sites at PR time; this
  // runtime check catches dynamic imports the grep can't see.
  assertCalledFromTestContext();

  // Recursive chain stub: any property access returns a jest.fn()
  // that resolves to an empty array by default.
  function chainFn(): jest.Mock {
    const fn = jest.fn().mockReturnValue(chain());
    return fn;
  }

  function chain() {
    return new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') return undefined; // prevent auto-await
          return chainFn();
        },
      },
    );
  }

  // Pre-build the top-level query proxy so db.query.tableName.findFirst/findMany work
  const queryProxy = new Proxy(
    {},
    {
      get() {
        return {
          findFirst: jest.fn().mockResolvedValue(undefined),
          findMany: jest.fn().mockResolvedValue([]),
        };
      },
    },
  );

  return {
    query: queryProxy,
    insert: chainFn(),
    update: chainFn(),
    delete: chainFn(),
    select: chainFn(),
    selectDistinct: chainFn(),
    execute: jest.fn().mockResolvedValue([]),
  };
}

/**
 * Best-effort detection that the caller is running inside a Jest test
 * (not application runtime). Throws a loud error otherwise so a stray
 * production import surfaces immediately instead of silently returning
 * an empty-result Proxy in prod.
 *
 * Detection is via the `jest` global, which is only defined inside the
 * Jest worker process. The same `jest` global is referenced in this file
 * (jest.fn / jest.Mock), so non-test runtime would already fail at the
 * first jest.fn() call — this check makes the failure mode explicit
 * with a useful message.
 */
function assertCalledFromTestContext(): void {
  const hasJestGlobal =
    typeof (globalThis as { jest?: unknown }).jest !== 'undefined';
  if (!hasJestGlobal) {
    throw new Error(
      '[createMockDb] called outside Jest test context. ' +
        'This helper is for unit tests only — it returns a forbidden-by-default ' +
        'mock that silently resolves every query to empty results. ' +
        'See packages/test-utils/src/lib/neon-mock.ts header for usage rules.',
    );
  }
}
