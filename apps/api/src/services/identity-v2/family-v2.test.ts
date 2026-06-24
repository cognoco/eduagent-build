// ---------------------------------------------------------------------------
// [WI-959] getFirstActiveChildNameV2 — single bounded person query
//
// Problem: the original implementation called getChargePersonIds to get all
// charge ids, then issued one serial db.query.person.findFirst per charge id
// until it found a non-archived child — N round-trips in the worst case.
//
// Fix: after obtaining the charge ids, issue a single db.query.person.findFirst
// with inArray(person.id, charges) AND isNull(person.archivedAt) — one bounded
// query regardless of how many charges the guardian holds.
//
// Red-green evidence:
//   GREEN (fix applied):  db.query.person.findFirst is called exactly once even
//     when there are multiple charges (two archived + one active), and returns
//     the first active child's display name.
//   RED   (fix reverted to serial): db.query.person.findFirst would be called N
//     times (once per charge) — the mock would be called 3 times (two returning
//     null/archived, one returning the active child), making the
//     "called exactly once" assertion fail.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import { getFirstActiveChildNameV2 } from './family-v2';

// ---------------------------------------------------------------------------
// Fake DB builder
// ---------------------------------------------------------------------------

/**
 * Collect all string values that appear as leaves in any Drizzle AST object.
 * Used to detect which charge ids are referenced by the `where` clause — this
 * lets the mock behave correctly for both the OLD code (eq(person.id, singleId))
 * and the NEW code (inArray(person.id, [id1, id2, ...])).
 */
function collectStrings(node: unknown, seen = new Set<unknown>()): string[] {
  if (node == null || typeof node !== 'object' || seen.has(node)) return [];
  seen.add(node);
  const strs: string[] = [];
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (typeof value === 'string') {
      strs.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        strs.push(...collectStrings(item, seen));
      }
    } else if (value != null && typeof value === 'object') {
      strs.push(...collectStrings(value, seen));
    }
  }
  return strs;
}

/**
 * Builds a hand-rolled fake Database that drives the REAL
 * getFirstActiveChildNameV2 (+ real getChargePersonIds internally). The DB
 * is a true external boundary; we substitute it with a fake rather than
 * mocking internal modules (GC1 rule).
 *
 * The fake exposes two surfaces:
 *  - `guardianship.findMany` — returns the configured charge ids (active edges).
 *  - `person.findFirst` — the call we are counting and asserting.
 *
 * The `person.findFirst` mock simulates the DB predicate by:
 *  - Collecting all string values from `args.where` (the Drizzle AST).
 *  - Finding the first person whose id appears in those strings AND whose
 *    archivedAt is null. This correctly handles both `eq(person.id, singleId)`
 *    (OLD code) and `inArray(person.id, [...ids])` (NEW code).
 */
function makeDb(options: {
  chargeIds: string[];
  /** Map of personId → { displayName, archivedAt }; persons NOT in the map are absent. */
  persons: Map<string, { displayName: string; archivedAt: Date | null }>;
}) {
  const personFindFirstMock = jest
    .fn()
    .mockImplementation(async (args?: { where?: unknown }) => {
      // Collect all string values from the WHERE AST to find referenced ids.
      const referencedIds = new Set(collectStrings(args?.where));
      // Return the first person whose id is in the WHERE AST and is not archived.
      // This correctly simulates both the old single-id eq() and the new inArray().
      for (const [personId, p] of options.persons) {
        if (referencedIds.has(personId) && p.archivedAt === null) {
          return { displayName: p.displayName };
        }
      }
      return undefined;
    });

  const db = {
    query: {
      guardianship: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            options.chargeIds.map((id) => ({ chargePersonId: id })),
          ),
      },
      person: {
        findFirst: personFindFirstMock,
      },
    },
  } as unknown as Database;

  return { db, personFindFirstMock };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('[WI-959] getFirstActiveChildNameV2 — single bounded person query', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the first active child name and issues exactly one person query when multiple charges exist', async () => {
    // Three charges: first two are archived, third is active.
    // With the OLD serial implementation, person.findFirst would be called
    // three times (once per charge id, short-circuiting at the third).
    // With the FIX, person.findFirst is called exactly once with inArray.
    const persons = new Map([
      [
        'charge-archived-1',
        { displayName: 'Alice (archived)', archivedAt: new Date('2025-01-01') },
      ],
      [
        'charge-archived-2',
        { displayName: 'Bob (archived)', archivedAt: new Date('2025-06-01') },
      ],
      ['charge-active-3', { displayName: 'Charlie', archivedAt: null }],
    ]);

    const { db, personFindFirstMock } = makeDb({
      chargeIds: ['charge-archived-1', 'charge-archived-2', 'charge-active-3'],
      persons,
    });

    const result = await getFirstActiveChildNameV2(db, 'guardian-person-id');

    // Returns the active child's name.
    expect(result).toBe('Charlie');

    // THE KEY GUARD: person.findFirst must be called exactly ONCE, not N times.
    // With the old serial loop this would be called 3 times (once per charge
    // id) — restoring the loop would make this assertion fail (3 ≠ 1).
    expect(personFindFirstMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when there are no charges', async () => {
    const { db, personFindFirstMock } = makeDb({
      chargeIds: [],
      persons: new Map(),
    });

    const result = await getFirstActiveChildNameV2(db, 'guardian-person-id');

    expect(result).toBeNull();
    // No person query needed when there are no charges.
    expect(personFindFirstMock).not.toHaveBeenCalled();
  });

  it('returns null when all charges are archived', async () => {
    const persons = new Map([
      [
        'charge-archived-1',
        {
          displayName: 'Alice (archived)',
          archivedAt: new Date('2025-01-01'),
        },
      ],
    ]);

    const { db, personFindFirstMock } = makeDb({
      chargeIds: ['charge-archived-1'],
      persons,
    });

    const result = await getFirstActiveChildNameV2(db, 'guardian-person-id');

    expect(result).toBeNull();
    // One person query is issued (inArray lookup); finds no active child.
    expect(personFindFirstMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when guardian person has charges but person rows are absent', async () => {
    // chargeIds present in guardianship but absent from the person table.
    const { db, personFindFirstMock } = makeDb({
      chargeIds: ['orphaned-charge-id'],
      persons: new Map(), // no matching person rows
    });

    const result = await getFirstActiveChildNameV2(db, 'guardian-person-id');

    expect(result).toBeNull();
    expect(personFindFirstMock).toHaveBeenCalledTimes(1);
  });
});
