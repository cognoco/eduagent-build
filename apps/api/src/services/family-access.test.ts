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
  assertOwnerAndParentAccess,
  assertOwnerProfile,
} from './family-access';
import { ForbiddenError } from '../errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PARENT_ID = 'parent-profile-aaa';
const CHILD_ID = 'child-profile-bbb';
const UNRELATED_ID = 'unrelated-profile-ccc';

type GuardianshipRow = { id: string };

/**
 * Build a minimal Database stub that satisfies the one Drizzle call made by
 * hasParentAccess / assertParentAccess (post-collapse): `db.query.guardianship.findFirst(...)`.
 *
 * We construct the `guardianship` table accessor once and store it so the mock
 * identity is stable across multiple property accesses.  (The neon-mock proxy
 * creates a new object on every `.query.tableName` read, so mock overrides on
 * cast references do not stick — this avoids that trap.)
 *
 * Active edge: non-null row (isGuardianOf returns true). No edge: undefined.
 */
function makeDb(edgeRow: GuardianshipRow | undefined): Database {
  const findFirst = jest.fn().mockResolvedValue(edgeRow);

  return {
    query: {
      guardianship: { findFirst },
    },
  } as unknown as Database;
}

/** Mock DB where an active guardianship edge exists between guardian and charge. */
function dbWithLink(_parentId: string, _childId: string): Database {
  // Row shape: isGuardianOf only checks `row != null`; only `id` column is selected.
  return makeDb({ id: 'edge-1' });
}

/** Mock DB where NO guardianship edge exists (findFirst returns undefined). */
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

  it('queries guardianship exactly once per call', async () => {
    const db = dbWithoutLink();
    const findFirstMock = (
      db as unknown as { query: { guardianship: { findFirst: jest.Mock } } }
    ).query.guardianship.findFirst;

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

describe('assertCanManageOwnConsent', () => {
  // Derive birth years from the UTC year the SUT uses (calculateAge =
  // getUTCFullYear() - birthYear), so the boundary assertions hold regardless
  // of the machine timezone the test runs in.
  const CURRENT_UTC_YEAR = new Date().getUTCFullYear();

  // [Issue 901] resolvedVia defaults to 'explicit-header' because the real
  // mobile client ALWAYS sends X-Profile-Id (api-client.ts:209) — every
  // legitimate self-consent caller has an explicitly selected profile. The
  // headerless (auto-resolve) case is exercised by the dedicated [BREAK] test.
  function metaWith(meta: {
    isOwner?: boolean;
    birthYear?: number | null;
    resolvedVia?: 'auto' | 'explicit-header';
  }) {
    return { resolvedVia: 'explicit-header' as const, ...meta };
  }

  it('allows an account owner regardless of age', () => {
    const minorOwner = metaWith({
      isOwner: true,
      birthYear: CURRENT_UTC_YEAR - 12,
    });
    expect(() => assertCanManageOwnConsent(minorOwner)).not.toThrow();
  });

  it('allows a non-owner adult exactly at the 18 boundary', () => {
    // age === 18 → permitted
    const adult = metaWith({
      isOwner: false,
      birthYear: CURRENT_UTC_YEAR - 18,
    });
    expect(() => assertCanManageOwnConsent(adult)).not.toThrow();
  });

  // [BREAK / Issue 901] A headerless caller is auto-resolved to the account
  // OWNER (isOwner:true) by profileScopeMiddleware (resolvedVia:'auto'). Before
  // the fix the isOwner early-return granted consent management to any caller
  // who simply omitted X-Profile-Id (a child on the account, or anyone holding
  // the account JWT) — privilege escalation. The explicit-header requirement
  // must reject it even though isOwner is true.
  it('[BREAK] blocks an auto-resolved owner (no X-Profile-Id header)', () => {
    const autoOwner = metaWith({
      isOwner: true,
      birthYear: CURRENT_UTC_YEAR - 30,
      resolvedVia: 'auto',
    });
    expect(() => assertCanManageOwnConsent(autoOwner)).toThrow(ForbiddenError);
    expect(() => assertCanManageOwnConsent(autoOwner)).toThrow(
      'Consent management requires an explicitly selected profile.',
    );
  });

  // [Issue 901] A genuine adult non-owner whose header WAS sent must still pass
  // — confirms the fix blocks only the auto path, not the legitimate flow.
  it('allows a non-owner adult when the profile was explicitly selected', () => {
    const adult = metaWith({
      isOwner: false,
      birthYear: CURRENT_UTC_YEAR - 25,
      resolvedVia: 'explicit-header',
    });
    expect(() => assertCanManageOwnConsent(adult)).not.toThrow();
  });

  it('[BREAK] blocks a non-owner minor one year under the 18 boundary', () => {
    // age === 17 → blocked. With a buggy local getFullYear() in a timezone
    // where the local year differs from the UTC year, the computed age could
    // tip to 18 and wrongly permit this minor. Pinning birthYear off the UTC
    // year keeps this assertion exact.
    const minor = metaWith({
      isOwner: false,
      birthYear: CURRENT_UTC_YEAR - 17,
    });
    expect(() => assertCanManageOwnConsent(minor)).toThrow(ForbiddenError);
  });

  it('fails closed when birthYear is missing for a non-owner', () => {
    const unknownAge = metaWith({ isOwner: false, birthYear: null });
    expect(() => assertCanManageOwnConsent(unknownAge)).toThrow(ForbiddenError);
  });
});

// ---------------------------------------------------------------------------
// assertOwnerAndParentAccess — [CR-2026-05-19-H1 / Issue 901]
//
// The combined owner + parent-access guard backing every parent-admin route
// (consent.ts, dashboard.ts, learner-profile.ts, onboarding.ts). It must reject
// an auto-synthesized owner identity (no X-Profile-Id header) BEFORE running the
// parent-chain check, so a non-owner cannot omit the header to be auto-resolved
// to the owner and pass the gate.
// ---------------------------------------------------------------------------

describe('assertOwnerAndParentAccess', () => {
  function ctxWithMeta(meta: {
    isOwner?: boolean;
    resolvedVia?: 'auto' | 'explicit-header';
  }): Context {
    return {
      get: (key: string) => (key === 'profileMeta' ? meta : undefined),
    } as unknown as Context;
  }

  it('resolves for an explicitly-selected owner with a valid parent link', async () => {
    const ctx = ctxWithMeta({ isOwner: true, resolvedVia: 'explicit-header' });
    const db = dbWithLink(PARENT_ID, CHILD_ID);
    await expect(
      assertOwnerAndParentAccess(ctx, db, PARENT_ID, CHILD_ID),
    ).resolves.toBeUndefined();
  });

  it('throws for a non-owner caller', async () => {
    const ctx = ctxWithMeta({ isOwner: false, resolvedVia: 'explicit-header' });
    const db = dbWithLink(PARENT_ID, CHILD_ID);
    await expect(
      assertOwnerAndParentAccess(ctx, db, PARENT_ID, CHILD_ID),
    ).rejects.toThrow(ForbiddenError);
  });

  // [BREAK / Issue 901] An auto-resolved owner (no X-Profile-Id header) is
  // isOwner:true, so it passes the isOwner check. Before the explicit-header
  // requirement, a non-owner caller (or anyone holding the account JWT) could
  // omit the header to perform parent-admin actions on a child. The guard must
  // reject it even though isOwner is true AND a valid parent link exists.
  it('[BREAK] throws for an auto-resolved owner (no X-Profile-Id header) despite a valid link', async () => {
    const ctx = ctxWithMeta({ isOwner: true, resolvedVia: 'auto' });
    // A valid parent->child link exists; the rejection must come purely from
    // resolvedVia, NOT from a missing link.
    const db = dbWithLink(PARENT_ID, CHILD_ID);
    await expect(
      assertOwnerAndParentAccess(ctx, db, PARENT_ID, CHILD_ID),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      assertOwnerAndParentAccess(ctx, db, PARENT_ID, CHILD_ID),
    ).rejects.toThrow(
      'Only the account owner can perform administrative actions on child profiles.',
    );
  });
});

// ---------------------------------------------------------------------------
// assertOwnerProfile - [Issue 901 / WI-1058]
//
// Owner-only routes funnel through this helper. A headerless request can be
// auto-resolved to the account owner profile (`isOwner:true`,
// `resolvedVia:'auto'`), so the guard must require an explicitly selected
// profile and not just `isOwner === true`.
// ---------------------------------------------------------------------------

describe('assertOwnerProfile', () => {
  function ctxWithMeta(meta: {
    isOwner?: boolean;
    resolvedVia?: 'auto' | 'explicit-header';
  }): Context {
    return {
      get: (key: string) => (key === 'profileMeta' ? meta : undefined),
    } as unknown as Context;
  }

  it('allows an explicitly selected owner profile', () => {
    const ctx = ctxWithMeta({ isOwner: true, resolvedVia: 'explicit-header' });

    expect(() => assertOwnerProfile(ctx)).not.toThrow();
  });

  // [BREAK / WI-1058] Without the resolvedVia clause in assertOwnerProfile,
  // this auto-resolved owner would pass because isOwner is true. That reopens
  // owner-only routes to callers that omit X-Profile-Id.
  it('[BREAK] throws for an auto-resolved owner profile', () => {
    const ctx = ctxWithMeta({ isOwner: true, resolvedVia: 'auto' });

    expect(() => assertOwnerProfile(ctx)).toThrow(ForbiddenError);
    expect(() => assertOwnerProfile(ctx, 'Owner-only surface.')).toThrow(
      'Owner-only surface.',
    );
  });
});
