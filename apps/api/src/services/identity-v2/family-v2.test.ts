// [WI-959] Red-green guard: person.findFirst must be called once (inArray), not N times (serial loop).

import type { Database } from '@eduagent/database';
import { getFirstActiveChildNameV2 } from './family-v2';

// Collect string leaves from a Drizzle AST node — detects ids in eq() and inArray() WHERE clauses.
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

// Fake Database: guardianship.findMany returns chargeIds; person.findFirst simulates the WHERE predicate.
function makeDb(options: {
  chargeIds: string[];
  persons: Map<string, { displayName: string; archivedAt: Date | null }>;
}) {
  const personFindFirstMock = jest
    .fn()
    .mockImplementation(async (args?: { where?: unknown }) => {
      const referencedIds = new Set(collectStrings(args?.where));
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
