// ---------------------------------------------------------------------------
// family-access.test.ts — BUG-746 / T-10 / WI-786
//
// hasParentAccess and assertParentAccess are the IDOR guard for ALL
// parent-scoped routes. This file provides direct unit coverage so that
// a logic regression (e.g. `and` flipped to `or`, wrong column name)
// cannot hide behind mocked call sites.
//
// WI-786 adds v2 dispatch coverage: flag-on routes to the guardianship
// table, flag-off keeps the legacy family_links path. The dispatch tests
// mirror the pattern from family-bridge.test.ts.
//
// Break tests (lines marked [BREAK]) must fail on the pre-fix code if the
// implementation is broken and pass with correct implementation.
// ---------------------------------------------------------------------------

import type { Context } from 'hono';
import type { Database } from '@eduagent/database';
import {
  hasParentAccess,
  assertParentAccess,
  assertCanManageOwnConsent,
} from './family-access';
import { ForbiddenError } from '../errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PARENT_ID = 'parent-profile-aaa';
const CHILD_ID = 'child-profile-bbb';
const UNRELATED_ID = 'unrelated-profile-ccc';

type LinkRow = { parentProfileId: string; childProfileId: string };

/**
 * Build a minimal Database stub that satisfies the one Drizzle call made by
 * hasParentAccess: `db.query.familyLinks.findFirst(...)`.
 *
 * We construct the `familyLinks` table accessor once and store it so the mock
 * identity is stable across multiple property accesses.  (The neon-mock proxy
 * creates a new object on every `.query.tableName` read, so mock overrides on
 * cast references do not stick — this avoids that trap.)
 */
function makeDb(linkRow: LinkRow | undefined): Database {
  const findFirst = jest.fn().mockResolvedValue(linkRow);

  return {
    query: {
      familyLinks: { findFirst },
    },
  } as unknown as Database;
}

/** Mock DB where a family link exists between parent and child. */
function dbWithLink(parentId: string, childId: string): Database {
  return makeDb({ parentProfileId: parentId, childProfileId: childId });
}

/** Mock DB where NO family link exists (findFirst returns undefined). */
function dbWithoutLink(): Database {
  return makeDb(undefined);
}

// ---------------------------------------------------------------------------
// hasParentAccess
// ---------------------------------------------------------------------------

describe('hasParentAccess', () => {
  it('returns true when a family link exists between parent and child', async () => {
    const db = dbWithLink(PARENT_ID, CHILD_ID);
    const result = await hasParentAccess(db, PARENT_ID, CHILD_ID);
    expect(result).toBe(true);
  });

  // [BREAK / BUG-746] If the WHERE logic were accidentally changed to `or`
  // instead of `and`, a link for (PARENT_ID, OTHER_CHILD) would still return
  // true for (PARENT_ID, UNRELATED_ID) — this test catches that regression.
  it('[BREAK] returns false when no family link exists (unlinked pair)', async () => {
    const db = dbWithoutLink();
    const result = await hasParentAccess(db, PARENT_ID, UNRELATED_ID);
    expect(result).toBe(false);
  });

  it('returns false when called with two unrelated profile IDs', async () => {
    const db = dbWithoutLink();
    const result = await hasParentAccess(db, PARENT_ID, UNRELATED_ID);
    expect(result).toBe(false);
  });

  it('queries familyLinks exactly once per call', async () => {
    const db = dbWithoutLink();
    const findFirstMock = (
      db as unknown as { query: { familyLinks: { findFirst: jest.Mock } } }
    ).query.familyLinks.findFirst;

    await hasParentAccess(db, PARENT_ID, CHILD_ID);

    expect(findFirstMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// assertParentAccess
// ---------------------------------------------------------------------------

describe('assertParentAccess', () => {
  it('resolves without throwing when a family link exists', async () => {
    const db = dbWithLink(PARENT_ID, CHILD_ID);
    await expect(
      assertParentAccess(db, PARENT_ID, CHILD_ID),
    ).resolves.toBeUndefined();
  });

  // [BREAK / BUG-746] This is the critical IDOR break test. If assertParentAccess
  // were removed or short-circuited to always succeed, a parent could access
  // ANY child's data by guessing profile IDs. This test proves the guard fires.
  it('[BREAK] throws ForbiddenError when no family link exists', async () => {
    const db = dbWithoutLink();

    await expect(
      assertParentAccess(db, PARENT_ID, UNRELATED_ID),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError with a descriptive message', async () => {
    const db = dbWithoutLink();

    await expect(
      assertParentAccess(db, PARENT_ID, UNRELATED_ID),
    ).rejects.toThrow('You do not have access to this child profile.');
  });

  it('does not throw for the correct linked pair', async () => {
    const db = dbWithLink(PARENT_ID, CHILD_ID);
    await expect(
      assertParentAccess(db, PARENT_ID, CHILD_ID),
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// assertCanManageOwnConsent — age-gate UTC consistency
//
// [CR LOW] This consent age-gate must compute age with getUTCFullYear() so it
// agrees with the canonical calculateAge() (age-utils.ts) and getProfileAge()
// (profile.ts) at the 18 boundary. A local getFullYear() could disagree by a
// year depending on host timezone. We pin the boundary using birthYear math
// derived from the same UTC year the SUT uses, so the test is timezone-stable.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// WI-786 — v2 dispatch coverage (flag-on reads guardianship, flag-off reads
// family_links). Mirrors the pattern in family-bridge.test.ts.
// ---------------------------------------------------------------------------

describe('hasParentAccess / assertParentAccess v2 dispatch (WI-786)', () => {
  /**
   * A Database stub that exposes BOTH the legacy `familyLinks.findFirst` and
   * the v2 `guardianship.findFirst` so the dispatch tests can assert which
   * table the guard touched. Both findFirst stubs return undefined (no link /
   * no edge), so the guard returns false / throws — what matters is WHICH one
   * was invoked.
   */
  function makeDispatchDb(): {
    db: Database;
    familyLinksFindFirst: jest.Mock;
    guardianshipFindFirst: jest.Mock;
  } {
    const familyLinksFindFirst = jest.fn().mockResolvedValue(undefined);
    const guardianshipFindFirst = jest.fn().mockResolvedValue(undefined);
    const db = {
      query: {
        familyLinks: { findFirst: familyLinksFindFirst },
        guardianship: { findFirst: guardianshipFindFirst },
      },
    } as unknown as Database;
    return { db, familyLinksFindFirst, guardianshipFindFirst };
  }

  it('[WI-786] flag-off: hasParentAccess reads familyLinks, never guardianship', async () => {
    const { db, familyLinksFindFirst, guardianshipFindFirst } =
      makeDispatchDb();

    await hasParentAccess(db, PARENT_ID, CHILD_ID);

    expect(familyLinksFindFirst).toHaveBeenCalledTimes(1);
    expect(guardianshipFindFirst).not.toHaveBeenCalled();
  });

  it('[WI-786] flag-on: hasParentAccess reads guardianship, never familyLinks', async () => {
    const { db, familyLinksFindFirst, guardianshipFindFirst } =
      makeDispatchDb();

    await hasParentAccess(db, PARENT_ID, CHILD_ID, { identityV2Enabled: true });

    expect(guardianshipFindFirst).toHaveBeenCalledTimes(1);
    expect(familyLinksFindFirst).not.toHaveBeenCalled();
  });

  it('[WI-786] flag-off: assertParentAccess reads familyLinks, never guardianship', async () => {
    const { db, familyLinksFindFirst, guardianshipFindFirst } =
      makeDispatchDb();

    // No link → throws ForbiddenError (expected). The assertion is which read ran.
    await expect(assertParentAccess(db, PARENT_ID, CHILD_ID)).rejects.toThrow(
      ForbiddenError,
    );

    expect(familyLinksFindFirst).toHaveBeenCalledTimes(1);
    expect(guardianshipFindFirst).not.toHaveBeenCalled();
  });

  it('[WI-786] flag-on: assertParentAccess reads guardianship, never familyLinks', async () => {
    const { db, familyLinksFindFirst, guardianshipFindFirst } =
      makeDispatchDb();

    // No active edge → throws ForbiddenError (expected). Asserts v2 guard ran.
    await expect(
      assertParentAccess(db, PARENT_ID, CHILD_ID, { identityV2Enabled: true }),
    ).rejects.toThrow(ForbiddenError);

    expect(guardianshipFindFirst).toHaveBeenCalledTimes(1);
    expect(familyLinksFindFirst).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe('assertCanManageOwnConsent', () => {
  // Derive birth years from the UTC year the SUT uses (calculateAge =
  // getUTCFullYear() - birthYear), so the boundary assertions hold regardless
  // of the machine timezone the test runs in.
  const CURRENT_UTC_YEAR = new Date().getUTCFullYear();

  function ctxWith(meta: {
    isOwner?: boolean;
    birthYear?: number | null;
  }): Context {
    return {
      get: (key: string) => (key === 'profileMeta' ? meta : undefined),
    } as unknown as Context;
  }

  it('allows an account owner regardless of age', () => {
    const minorOwner = ctxWith({
      isOwner: true,
      birthYear: CURRENT_UTC_YEAR - 12,
    });
    expect(() => assertCanManageOwnConsent(minorOwner)).not.toThrow();
  });

  it('allows a non-owner adult exactly at the 18 boundary', () => {
    // age === 18 → permitted
    const adult = ctxWith({
      isOwner: false,
      birthYear: CURRENT_UTC_YEAR - 18,
    });
    expect(() => assertCanManageOwnConsent(adult)).not.toThrow();
  });

  it('[BREAK] blocks a non-owner minor one year under the 18 boundary', () => {
    // age === 17 → blocked. With a buggy local getFullYear() in a timezone
    // where the local year differs from the UTC year, the computed age could
    // tip to 18 and wrongly permit this minor. Pinning birthYear off the UTC
    // year keeps this assertion exact.
    const minor = ctxWith({
      isOwner: false,
      birthYear: CURRENT_UTC_YEAR - 17,
    });
    expect(() => assertCanManageOwnConsent(minor)).toThrow(ForbiddenError);
  });

  it('fails closed when birthYear is missing for a non-owner', () => {
    const unknownAge = ctxWith({ isOwner: false, birthYear: null });
    expect(() => assertCanManageOwnConsent(unknownAge)).toThrow(ForbiddenError);
  });
});
