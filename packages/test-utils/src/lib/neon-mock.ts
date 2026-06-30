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
  // [CR-2026-05-21-183] Production-misuse protection lives entirely in the
  // static workspace-grep guard (`neon-mock.guard.test.ts`). An earlier
  // runtime check via `globalThis.jest` was removed because many call sites
  // invoke `createMockDb()` at module top-level, where the `jest` global is
  // not yet installed in every Jest worker configuration — the runtime check
  // false-positived across ~40 API suites in CI.

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
          if (prop === 'then') {
            // [WI-867] Chain-built queries (select / insert…returning) resolve
            // to `[]` per this mock's documented contract. Returning a real
            // thenable (instead of `undefined`) means `await db.select()…`
            // yields `[]` — so array consumers get a clean empty result and the
            // "no rows" branch, instead of a truthy garbage proxy that survives
            // an `if (!rows[0])` guard and then crashes on field access
            // (e.g. `rows[0].roles.includes(...)`). Configure the query to
            // return real rows when the test's subject needs data.
            return (onFulfilled: (value: unknown) => unknown) =>
              onFulfilled([]);
          }
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

  const db = {
    query: queryProxy,
    insert: chainFn(),
    update: chainFn(),
    delete: chainFn(),
    select: chainFn(),
    selectDistinct: chainFn(),
    execute: jest.fn().mockResolvedValue([]),
  };
  // Marker so harnesses (createDatabaseModuleMock) can tell this is the
  // configure-or-break default Proxy db — whose `query.<table>` always returns
  // a fresh undefined/[] stub — from a caller-supplied plain-object db. Used to
  // seed the v2 identity graph only when the test didn't bring its own.
  Object.defineProperty(db, '__defaultMockDb', {
    value: true,
    enumerable: false,
  });
  return db;
}
