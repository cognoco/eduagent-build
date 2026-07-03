// ---------------------------------------------------------------------------
// Profile Service Tests
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import { ForbiddenError } from '@eduagent/schemas';
import { updateProfileAppContext } from './profile';

const NOW = new Date('2025-01-15T10:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * Walks a drizzle SQL condition node and returns all text fragments joined.
 * Handles drizzle's internal structure:
 *   - { name: string }          — column reference (e.g. "archived_at")
 *   - { value: string[] }       — SQL literal array (e.g. [" is null"])
 *   - { queryChunks: unknown[] }— recursive condition node
 *   - string                    — raw string chunk
 * Uses a visited set to avoid circular reference stack overflows.
 */
function drizzleConditionToText(
  node: unknown,
  visited = new Set<object>(),
  depth = 0,
): string {
  if (depth > 20) return '';
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node.toLowerCase();
  if (typeof node !== 'object') return '';
  if (visited.has(node as object)) return '';
  visited.add(node as object);

  const obj = node as Record<string, unknown>;

  // Column reference: { name: "archived_at", ... }
  if (typeof obj['name'] === 'string') {
    return obj['name'].toLowerCase();
  }

  // SQL literal fragment: { value: [" is null"] }
  if (Array.isArray(obj['value'])) {
    return (obj['value'] as unknown[])
      .map((v) => (typeof v === 'string' ? v.toLowerCase() : ''))
      .join('');
  }

  // Recursive condition: { queryChunks: [...] }
  if (Array.isArray(obj['queryChunks'])) {
    return (obj['queryChunks'] as unknown[])
      .map((chunk) => drizzleConditionToText(chunk, visited, depth + 1))
      .join(' ');
  }

  return '';
}

// [WI-867] Legacy updateProfileAppContext tests migrated to v2 DB stubs
// post-IDENTITY_V2_ENABLED collapse. The v2 path reads person + membership +
// guardianship (via getChargePersonIds / direct findFirst) + consentGrant +
// consentRequest, and writes person (not profiles). Each inline stub mirrors
// the makeV2Db pattern in the WI-803 block below.
describe('updateProfileAppContext', () => {
  // Inline v2 DB builder for this describe scope — mirrors makeV2Db in WI-803 block.
  function makePersonRow(opts: {
    id: string;
    birthDate: string;
    isOwner: boolean;
    defaultAppContext?: 'study' | 'family' | null;
  }) {
    return {
      id: opts.id,
      birthDate: opts.birthDate,
      displayName: 'Test User',
      avatarUrl: null as string | null,
      residenceJurisdiction: null as string | null,
      conversationLanguage: 'en',
      pronouns: null as string | null,
      defaultAppContext: opts.defaultAppContext ?? null,
      archivedAt: null as Date | null,
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  function makeV2DbLocal(
    personRow: ReturnType<typeof makePersonRow>,
    isOwner: boolean,
    opts: {
      chargeRows?: Array<{ chargePersonId: string }>;
      guardianshipEdge?: { grantedAt: Date };
    } = {},
  ) {
    return {
      query: {
        person: { findFirst: jest.fn().mockResolvedValue(personRow) },
        membership: {
          findFirst: jest.fn().mockResolvedValue({
            roles: isOwner ? ['admin', 'learner'] : ['learner'],
          }),
        },
        consentGrant: { findFirst: jest.fn().mockResolvedValue(undefined) },
        consentRequest: { findFirst: jest.fn().mockResolvedValue(undefined) },
        guardianship: {
          findMany: jest.fn().mockResolvedValue(opts.chargeRows ?? []),
          findFirst: jest.fn().mockResolvedValue(opts.guardianshipEdge),
        },
      },
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([personRow]),
          }),
        }),
      }),
    } as unknown as Database;
  }

  it('returns mapped profile after persisting the default app context', async () => {
    const personRow = makePersonRow({
      id: 'owner-1',
      birthDate: '1985-01-01',
      isOwner: true,
      defaultAppContext: 'family',
    });
    const db = makeV2DbLocal(personRow, true, {
      chargeRows: [{ chargePersonId: 'child-1' }],
    });

    const result = await updateProfileAppContext(
      db,
      'owner-1',
      'account-123',
      'family',
    );

    expect(result).not.toBeNull();
    expect(result!.defaultAppContext).toBe('family');
    expect(result!.hasFamilyLinks).toBe(true);
  });

  it('allows study context for profiles that are not family-capable', async () => {
    const personRow = makePersonRow({
      id: 'child-1',
      birthDate: '2014-05-15',
      isOwner: false,
      defaultAppContext: 'study',
    });
    const db = makeV2DbLocal(personRow, false);

    const result = await updateProfileAppContext(
      db,
      'child-1',
      'account-123',
      'study',
    );

    expect(result).not.toBeNull();
    expect(result!.defaultAppContext).toBe('study');
  });

  it('[BREAK] rejects family context for non-owner profiles', async () => {
    const personRow = makePersonRow({
      id: 'child-1',
      birthDate: '2014-05-15',
      isOwner: false,
    });
    const db = makeV2DbLocal(personRow, false);

    await expect(
      updateProfileAppContext(db, 'child-1', 'account-123', 'family'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('[BREAK] rejects family context for adult owners without family links', async () => {
    const personRow = makePersonRow({
      id: 'owner-1',
      birthDate: '1985-01-01',
      isOwner: true,
    });
    const db = makeV2DbLocal(personRow, true, { chargeRows: [] });

    await expect(
      updateProfileAppContext(db, 'owner-1', 'account-123', 'family'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('[BREAK] rejects family context for under-18 owners with family links', async () => {
    const personRow = makePersonRow({
      id: 'owner-1',
      birthDate: '2012-05-15',
      isOwner: true,
    });
    const db = makeV2DbLocal(personRow, true, {
      chargeRows: [{ chargePersonId: 'child-1' }],
    });

    await expect(
      updateProfileAppContext(db, 'owner-1', 'account-123', 'family'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.update).not.toHaveBeenCalled();
  });

  // [WI-367 / SECURITY] Exact-date family-mode gate. Year-only math
  // (currentYear - birthYear) overestimates age by up to 11 months: an owner
  // born Dec 31 of (currentYear - 18) reads as 18 (adult) by year-only math
  // but is still 17 for all of the current year except a Dec-31 run. Red-
  // green-revert: swap computeAgeBracketFromDate back to
  // computeAgeBracket(birthYear) in profile.ts and this stops throwing (a
  // 17-year-old owner switches into family mode).
  // Pinned system time (mid-year, away from the Dec-31 boundary) so this
  // test is deterministic year-round — not just on every day but Dec 31.
  it('[WI-367][SECURITY] rejects family context for an owner whose exact age is still 17 (year-only reads 18)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    try {
      const personRow = makePersonRow({
        id: 'owner-1',
        birthDate: '2008-12-31',
        isOwner: true,
      });
      const db = makeV2DbLocal(personRow, true, {
        chargeRows: [{ chargePersonId: 'child-1' }],
      });

      await expect(
        updateProfileAppContext(db, 'owner-1', 'account-123', 'family'),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(db.update).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns null when the profile does not exist', async () => {
    // person.findFirst returns undefined → short-circuit null return
    const db = {
      query: {
        person: { findFirst: jest.fn().mockResolvedValue(undefined) },
        membership: { findFirst: jest.fn().mockResolvedValue(undefined) },
        consentGrant: { findFirst: jest.fn().mockResolvedValue(undefined) },
        consentRequest: { findFirst: jest.fn().mockResolvedValue(undefined) },
        guardianship: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue(undefined),
        },
      },
      update: jest.fn(),
    } as unknown as Database;

    const result = await updateProfileAppContext(
      db,
      'profile-123',
      'account-123',
      'study',
    );

    expect(result).toBeNull();
  });

  it('[BREAK] WHERE clause includes archived_at IS NULL guard', async () => {
    // The v2 path writes to the `person` table. Capture the WHERE from
    // db.update(person).set(...).where(condition).
    let capturedWhere: unknown;
    const personRow = makePersonRow({
      id: 'profile-1',
      birthDate: '1985-01-01',
      isOwner: false,
    });
    const db = {
      query: {
        person: { findFirst: jest.fn().mockResolvedValue(personRow) },
        membership: {
          findFirst: jest.fn().mockResolvedValue({ roles: ['learner'] }),
        },
        consentGrant: { findFirst: jest.fn().mockResolvedValue(undefined) },
        consentRequest: { findFirst: jest.fn().mockResolvedValue(undefined) },
        guardianship: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue(undefined),
        },
      },
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation((condition: unknown) => {
            capturedWhere = condition;
            return { returning: jest.fn().mockResolvedValue([personRow]) };
          }),
        }),
      }),
    } as unknown as Database;

    await updateProfileAppContext(db, 'profile-1', 'account-1', 'study');

    const sqlText = drizzleConditionToText(capturedWhere);
    expect(sqlText).toContain('archived_at');
    expect(sqlText).toContain('is null');
  });
});

describe('[WI-803] updateProfileAppContext — loadProfileFamilyMeta v2 dispatch', () => {
  /**
   * Minimal person row for v2 updateProfileAppContext tests.
   * Only includes fields the implementation reads from person/update.returning().
   */
  function mockPersonRow(
    overrides?: Partial<{
      id: string;
      birthDate: string;
      isOwner: boolean;
      defaultAppContext: 'study' | 'family' | null;
      displayName: string;
    }>,
  ) {
    const isOwner = overrides?.isOwner ?? false;
    return {
      id: overrides?.id ?? 'person-1',
      birthDate:
        overrides?.birthDate ?? (isOwner ? '1985-01-01' : '2012-05-15'),
      displayName: overrides?.displayName ?? 'Test Person',
      avatarUrl: null as string | null,
      residenceJurisdiction: null as string | null,
      conversationLanguage: 'en',
      pronouns: null as string | null,
      defaultAppContext: overrides?.defaultAppContext ?? null,
      archivedAt: null as Date | null,
      createdAt: NOW,
      updatedAt: NOW,
      // membership roles (for the membership mock)
      _roles: isOwner
        ? (['admin', 'learner'] as string[])
        : (['learner'] as string[]),
    };
  }

  /**
   * A DB stub that exercises the REAL v2 helpers (no module mock):
   *  - owner branch → getChargePersonIds → db.query.guardianship.findMany
   *  - non-owner branch → db.query.guardianship.findFirst (direct read)
   * It does NOT stub familyLinks — any familyLinks query on this db is
   * undefined and would throw, simulating the post-M-DROP environment.
   *
   * `chargeRows` feeds findMany (owner path); `guardianshipEdge` feeds
   * findFirst (non-owner path). Both default to "no active edges".
   */
  function makeV2Db(
    personData: ReturnType<typeof mockPersonRow>,
    opts: {
      chargeRows?: Array<{ chargePersonId: string }>;
      guardianshipEdge?: { grantedAt: Date };
    } = {},
  ) {
    const findMany = jest.fn().mockResolvedValue(opts.chargeRows ?? []);
    const findFirst = jest.fn().mockResolvedValue(opts.guardianshipEdge);
    const { _roles, ...personRow } = personData;
    return {
      query: {
        person: {
          findFirst: jest.fn().mockResolvedValue(personRow),
        },
        membership: {
          findFirst: jest.fn().mockResolvedValue({ roles: _roles }),
        },
        // consent tables: return no grant/request → null consentStatus
        consentGrant: { findFirst: jest.fn().mockResolvedValue(undefined) },
        consentRequest: { findFirst: jest.fn().mockResolvedValue(undefined) },
        // No familyLinks — post-M-DROP simulation
        guardianship: { findMany, findFirst },
      },
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([personRow]),
          }),
        }),
      }),
    } as unknown as import('@eduagent/database').Database;
  }

  it('[WI-803][BREAK] flag-on owner: reads guardianship (real getChargePersonIds), NOT familyLinks (post-M-DROP safe)', async () => {
    const personData = mockPersonRow({
      id: 'owner-1',
      isOwner: true,
      defaultAppContext: 'study',
    });
    const db = makeV2Db(personData, {
      chargeRows: [{ chargePersonId: 'child-person-1' }],
    });

    const result = await updateProfileAppContext(
      db,
      'owner-1',
      'account-123',
      'study',
    );

    expect(result).not.toBeNull();
    expect(result!.hasFamilyLinks).toBe(true);
    // owner path drove the real getChargePersonIds → guardianship.findMany
    expect(
      (db.query.guardianship as unknown as { findMany: jest.Mock }).findMany,
    ).toHaveBeenCalledTimes(1);
    // familyLinks must NOT have been queried
    expect((db.query as { familyLinks?: unknown }).familyLinks).toBeUndefined();
  });

  it('[WI-803][BREAK] flag-on owner with no charges: hasFamilyLinks = false (post-M-DROP safe)', async () => {
    const personData = mockPersonRow({
      id: 'owner-2',
      isOwner: true,
      defaultAppContext: 'study',
    });
    const db = makeV2Db(personData, { chargeRows: [] });

    const result = await updateProfileAppContext(
      db,
      'owner-2',
      'account-123',
      'study',
    );

    expect(result).not.toBeNull();
    expect(result!.hasFamilyLinks).toBe(false);
    expect(
      (db.query.guardianship as unknown as { findMany: jest.Mock }).findMany,
    ).toHaveBeenCalledTimes(1);
  });

  it('[WI-803][BREAK] flag-on non-owner: reads guardianship edge, NOT familyLinks (post-M-DROP safe)', async () => {
    const personData = mockPersonRow({
      id: 'child-1',
      birthDate: '2012-05-15',
      isOwner: false,
      defaultAppContext: 'study',
    });
    const grantedAt = new Date('2026-02-03T04:05:06.000Z');
    const db = makeV2Db(personData, { guardianshipEdge: { grantedAt } });

    const result = await updateProfileAppContext(
      db,
      'child-1',
      'account-123',
      'study',
    );

    expect(result).not.toBeNull();
    expect(result!.hasFamilyLinks).toBe(true);
    // legacy parity: linkCreatedAt comes from the edge's grantedAt
    expect(result!.linkCreatedAt).toBe(grantedAt.toISOString());
    expect(
      (db.query.guardianship as unknown as { findFirst: jest.Mock }).findFirst,
    ).toHaveBeenCalledTimes(1);
    expect((db.query as { familyLinks?: unknown }).familyLinks).toBeUndefined();
  });

  it('[WI-803][BREAK] flag-on non-owner with no active edge: hasFamilyLinks = false, linkCreatedAt = null', async () => {
    const personData = mockPersonRow({
      id: 'child-2',
      birthDate: '2012-05-15',
      isOwner: false,
      defaultAppContext: 'study',
    });
    const db = makeV2Db(personData, { guardianshipEdge: undefined });

    const result = await updateProfileAppContext(
      db,
      'child-2',
      'account-123',
      'study',
    );

    expect(result).not.toBeNull();
    expect(result!.hasFamilyLinks).toBe(false);
    expect(result!.linkCreatedAt).toBeNull();
  });
});
