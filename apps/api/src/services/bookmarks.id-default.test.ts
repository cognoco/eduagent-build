import { bookmarks } from '@eduagent/database';

// [BUG-859] Cursor pagination in `listBookmarks` (bookmarks.ts) orders by
// `desc(bookmarks.id)` and filters `lt(bookmarks.id, cursor)`. That keyset is
// correct ONLY because bookmarks.id is a time-ordered, lexicographically
// sortable UUIDv7. If the id default ever changed to a random generator
// (e.g. `gen_random_uuid()` → UUIDv4), pagination would silently produce
// overlapping/skipped rows across pages with no error.
//
// The robust fix (composite keyset on (createdAt, id)) is blocked here because
// the cursor contract in `@eduagent/schemas` pins `cursor`/`nextCursor` to
// `z.string().uuid()`; widening it to an opaque composite cursor is a
// schema-package change out of this fix's API-only scope. So this guard pins
// the load-bearing invariant instead: the bookmarks.id default MUST be the
// UUIDv7 helper. It fails loudly the moment that assumption is broken, before
// the silent-pagination bug can ship.

/** Version nibble of an RFC-4122 UUID string is the first hex digit of the
 * 3rd dash-delimited group (string index 14). '7' = UUIDv7, '4' = UUIDv4. */
function uuidVersion(uuid: string): string {
  return uuid.charAt(14);
}

describe('bookmarks.id default (BUG-859 pagination invariant)', () => {
  // Drizzle exposes a JS-side default generator as `defaultFn` and a SQL-side
  // default as `default`. The UUIDv7 helper is wired via `$defaultFn(...)`.
  const idColumn = bookmarks.id as unknown as {
    hasDefault: boolean;
    default: unknown;
    defaultFn?: () => string;
  };

  it('has a default value', () => {
    expect(idColumn.hasDefault).toBe(true);
  });

  it('generates its default in JS (not a SQL-side random default)', () => {
    // A switch to `gen_random_uuid()` would set `default` to a SQL expression
    // and drop `defaultFn`. Guard against that regression directly.
    expect(typeof idColumn.defaultFn).toBe('function');
    expect(idColumn.default).toBeUndefined();
  });

  it('default generator emits a UUIDv7 (time-ordered), not a random UUIDv4', () => {
    const generated = idColumn.defaultFn!();

    // Shape: canonical RFC-4122 UUID string.
    expect(generated).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    // The invariant the cursor relies on: version 7. A random UUIDv4 default
    // (the exact regression BUG-859 warns about) would put '4' here and fail.
    expect(uuidVersion(generated)).toBe('7');
  });

  it('successive defaults are lexicographically increasing (time-ordered)', () => {
    // UUIDv7 embeds a millisecond timestamp in its high bits, so ids minted
    // later sort after earlier ones — the property `desc(bookmarks.id)`
    // pagination depends on. A random generator would fail this with high
    // probability.
    const ids = Array.from({ length: 50 }, () => idColumn.defaultFn!());
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });
});
