/**
 * Creates a mock database instance for unit testing.
 *
 * Returns an object with the common Drizzle query-builder chain methods
 * (insert, update, delete, select, query) pre-mocked with jest.fn().
 * All chain methods return themselves so calls like
 * `db.insert(table).values({}).returning()` work without additional setup.
 *
 * Override specific methods in your test setup for assertions:
 *
 * ```ts
 * const db = createMockDb();
 * (db.query.profiles.findMany as jest.Mock).mockResolvedValue([...]);
 * ```
 *
 * The returned object is cast to `unknown` so consumers can assert it
 * to their own `Database` type without importing `@eduagent/database`
 * as a runtime dependency of test-utils.
 */
export function createMockDb(): unknown {
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
      }
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
    }
  );

  return {
    query: queryProxy,
    insert: chainFn(),
    update: chainFn(),
    delete: chainFn(),
    select: chainFn(),
    execute: jest.fn().mockResolvedValue([]),
  };
}
