/// <reference types="jest" />

// Walks a Drizzle SQL fragment (or a wrapping object such as the
// `{ where: SQL, ... }` arg passed to `db.query.<table>.findFirst`) and
// returns the literal `Param.value`s found inside. Lets tests pin the actual
// parent/child UUIDs being checked rather than only that `findFirst` was
// called once — a stripped or reordered `eq(...)` in production code would
// change the param set and fail the test.
//
// Implementation note: Drizzle's column objects (PgUUID, etc.) hold a back
// reference to their table (`column.table`), and the table holds the columns,
// forming cycles. We rely on the `WeakSet` to break cycles and skip the
// `table` back-ref explicitly to avoid pulling unrelated column names into
// the result.
export function extractDrizzleParamValues(
  node: unknown,
  visited: WeakSet<object> = new WeakSet(),
  depth = 0
): string[] {
  if (depth > 12) return [];
  if (node === null || node === undefined) return [];
  if (typeof node !== 'object') return [];
  if (visited.has(node as object)) return [];
  visited.add(node as object);

  const values: string[] = [];
  const obj = node as Record<string, unknown>;

  // Drizzle `Param` instances expose the raw SQL parameter on `.value`.
  if ('value' in obj) {
    const v = obj['value'];
    if (typeof v === 'string' || typeof v === 'number') {
      values.push(String(v));
    }
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      values.push(...extractDrizzleParamValues(item, visited, depth + 1));
    }
    return values;
  }

  for (const key of Object.getOwnPropertyNames(obj)) {
    // Skip the column → table back-ref to avoid traversing unrelated columns.
    if (key === 'table') continue;
    const child = obj[key];
    if (child === null || child === undefined) continue;
    if (typeof child === 'function') continue;
    values.push(...extractDrizzleParamValues(child, visited, depth + 1));
  }

  return values;
}
