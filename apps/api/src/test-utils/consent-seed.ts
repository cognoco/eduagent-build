/// <reference types="jest" />
// ---------------------------------------------------------------------------
// Consent v2 test seed (WI-867).
//
// [WI-868] The identity-v2 flag is gone; GDPR-consent gating runs
// unconditionally through the v2 chain:
//   resolveOrgIdForPerson → db.query.membership.findFirst
//   resolveConsentStatus  → db.query.consentGrant.findFirst
//                         → db.query.consentRequest.findFirst
//   isGuardianOf          → db.query.guardianship.findFirst
//
// This helper seeds those four seams so tests can exercise the real service
// implementations without mocking the service layer (GC1-clean).
//
// IMPORTANT: db.query.consentRequest.findFirst is called with TWO distinct
// column sets across the codebase:
//   - STATUS call  (reduceBasisState): columns {status, requestedAt, createdAt}
//   - DETAILS call (lookupConsentDetails): columns {guardianEmail, token}
// The returned mock distinguishes by inspecting the `columns` argument.
// ---------------------------------------------------------------------------

type QueryOptions = { columns?: Record<string, boolean> };
type MockDatabaseRecord = Record<string, unknown>;

// ── Consent states ──────────────────────────────────────────────────────────

export type SeedConsentState =
  | 'CONSENTED'
  | 'WITHDRAWN'
  | 'PENDING'
  | 'PCR' // PARENTAL_CONSENT_REQUESTED
  | null; // no rows (profile deleted / no consent cycle)

const REFERENCE_DATE = new Date('2026-05-01T00:00:00.000Z');

/**
 * Map a SeedConsentState to the grant row that reduceBasisFromRows expects.
 * Returns null when the state is driven by a request row only (no grant).
 */
function grantRowForState(
  state: SeedConsentState,
): { granted: boolean; withdrawnAt: Date | null; grantedAt: Date } | null {
  if (state === 'CONSENTED') {
    return { granted: true, withdrawnAt: null, grantedAt: REFERENCE_DATE };
  }
  if (state === 'WITHDRAWN') {
    return {
      granted: true,
      withdrawnAt: new Date(REFERENCE_DATE.getTime() + 1000),
      grantedAt: REFERENCE_DATE,
    };
  }
  // PENDING / PCR / null → no grant row
  return null;
}

/**
 * Map a SeedConsentState to the request row that reduceBasisFromRows expects.
 *
 * Rule: always return a request row alongside a grant (avoids the lazy
 * db.select(MIN(granted_at)) path — needsMin = grant!=null && request==null).
 */
function requestStatusRowForState(
  state: SeedConsentState,
): { status: string; requestedAt: Date; createdAt: Date } | null {
  if (state === 'CONSENTED' || state === 'WITHDRAWN') {
    // Dummy 'approved' request alongside the grant — prevents needsMin path.
    return {
      status: 'approved',
      requestedAt: REFERENCE_DATE,
      createdAt: REFERENCE_DATE,
    };
  }
  if (state === 'PENDING') {
    return {
      status: 'pending',
      requestedAt: REFERENCE_DATE,
      createdAt: REFERENCE_DATE,
    };
  }
  if (state === 'PCR') {
    return {
      status: 'requested',
      requestedAt: REFERENCE_DATE,
      createdAt: REFERENCE_DATE,
    };
  }
  return null;
}

// ── Seed API ─────────────────────────────────────────────────────────────────

export interface ConsentSeedOptions {
  /**
   * personId the membership + consent rows belong to.
   * Defaults to 'test-profile-id' (harness convention).
   */
  personId?: string;
  /**
   * organizationId the membership row points to.
   * Defaults to 'test-account-id' (harness convention).
   */
  organizationId?: string;
  /**
   * Consent state — or an ordered sequence of states for tests that exercise
   * a multi-call flow (each call to consentGrant/consentRequest.findFirst
   * pops the next state). If a sequence is exhausted the last state is
   * repeated.
   *
   * For consent-reminders: pass [day7State, day14State, day25State, day30State].
   * Each "step" calls getCurrentConsentRequestStatus once, which fires one
   * consentGrant.findFirst + one consentRequest.findFirst pair.
   */
  state: SeedConsentState | SeedConsentState[];
  /**
   * For DETAILS calls (lookupConsentDetails / `columns.guardianEmail`):
   * the row returned when the requestedAt window matches.
   * Defaults match the harness conventions tests assert against.
   */
  details?: {
    guardianEmail?: string | null;
    token?: string | null;
  };
}

/**
 * Seed the v2 consent chain onto a mock db's `query` object.
 *
 * Operates on the db IN PLACE (same Proxy-extension pattern as
 * `seedV2IdentityGraph`). Call after `createDatabaseModuleMock` /
 * `createTransactionalMockDb` so the identity graph is already seeded.
 *
 * Returns the three jest.Mock handles so tests can inspect call counts /
 * arguments (e.g. to assert the WHERE predicate for WI-84 window tests).
 */
export function seedConsentState(
  db: MockDatabaseRecord,
  opts: ConsentSeedOptions,
): {
  membershipFindFirst: jest.Mock;
  consentGrantFindFirst: jest.Mock;
  consentRequestFindFirst: jest.Mock;
} {
  const personId = opts.personId ?? 'test-profile-id';
  const organizationId = opts.organizationId ?? 'test-account-id';
  const states = Array.isArray(opts.state) ? opts.state : [opts.state];
  // Use explicit undefined-check: null is a valid "no email" signal, not a fallback.
  const detailsGuardianEmail =
    opts.details !== undefined && 'guardianEmail' in opts.details
      ? opts.details.guardianEmail
      : 'parent@example.com';
  const detailsToken = opts.details?.token ?? 'test-token-abc123';

  let callIndex = 0;

  function currentState(): SeedConsentState {
    const idx = Math.min(callIndex, states.length - 1);
    const state = states[idx];
    if (state === undefined) {
      throw new Error('seedConsentState: opts.state must be a non-empty array');
    }
    return state;
  }

  // membership.findFirst — always returns the single membership row so
  // resolveOrgIdForPerson gets organizationId. Static; no sequence needed.
  const membershipFindFirst = jest
    .fn()
    .mockResolvedValue({ organizationId, personId });

  // consentGrant.findFirst — returns the grant row for the current state.
  // Called once per getCurrentConsentRequestStatus() invocation.
  const consentGrantFindFirst = jest.fn().mockImplementation(async () => {
    return grantRowForState(currentState());
  });

  // consentRequest.findFirst — two distinct call shapes:
  //   STATUS  (reduceBasisState):   columns has 'status'       → return status row; advance index
  //   DETAILS (lookupConsentDetails): columns has 'guardianEmail' → return details row (no advance)
  const consentRequestFindFirst = jest
    .fn()
    .mockImplementation(async (opts: QueryOptions) => {
      const columns = opts?.columns ?? {};
      if ('guardianEmail' in columns) {
        // DETAILS call — return guardianEmail + token; index unchanged.
        return { guardianEmail: detailsGuardianEmail, token: detailsToken };
      }
      // STATUS call — return the request row for the current state.
      const row = requestStatusRowForState(currentState());
      // Advance AFTER reading grant+request pair (grant fires first, request fires here).
      callIndex++;
      return row;
    });

  // Patch db.query — same Proxy pattern as seedV2IdentityGraph: caller-provided
  // keys win for the identity tables; consent tables always come from here.
  const CONSENT_TABLES = [
    'membership',
    'consentGrant',
    'consentRequest',
  ] as const;
  const originalQuery =
    db.query && typeof db.query === 'object'
      ? (db.query as Record<string | symbol, unknown>)
      : ({} as Record<string | symbol, unknown>);

  // Preserve findMany from the underlying identity-graph mock so resolveIdentityV2
  // (which calls membership.findMany) still works after consent-seed layers on top.
  const originalMembership = originalQuery.membership as
    | { findFirst?: unknown; findMany?: unknown }
    | undefined;

  const consentGraph = {
    membership: {
      findFirst: membershipFindFirst,
      findMany: originalMembership?.findMany,
    },
    consentGrant: { findFirst: consentGrantFindFirst },
    consentRequest: { findFirst: consentRequestFindFirst },
  };

  db.query = new Proxy(originalQuery, {
    get(target, prop) {
      if (
        typeof prop === 'string' &&
        (CONSENT_TABLES as readonly string[]).includes(prop)
      ) {
        // Prefer already-installed seam (e.g. seedV2IdentityGraph already
        // owns membership for the identity resolve path). Don't override
        // unless the caller didn't install one.
        //
        // For consent tables: override always — consent-seed owns these.
        return consentGraph[prop as (typeof CONSENT_TABLES)[number]];
      }
      return target[prop];
    },
  });

  return {
    membershipFindFirst,
    consentGrantFindFirst,
    consentRequestFindFirst,
  };
}

/**
 * Seed guardianship so `isGuardianOf(db, guardianPersonId, chargePersonId)`
 * returns true. Used for family-facing tests (getChildConsentForParentV2, etc.).
 */
export function seedGuardianship(
  db: MockDatabaseRecord,
  guardianPersonId: string,
  chargePersonId: string,
): { guardianshipFindFirst: jest.Mock } {
  const guardianshipFindFirst = jest.fn().mockResolvedValue({
    guardianPersonId,
    chargePersonId,
  });

  const originalQuery =
    db.query && typeof db.query === 'object'
      ? (db.query as Record<string | symbol, unknown>)
      : ({} as Record<string | symbol, unknown>);

  db.query = new Proxy(originalQuery, {
    get(target, prop) {
      if (prop === 'guardianship') return { findFirst: guardianshipFindFirst };
      return target[prop];
    },
  });

  return { guardianshipFindFirst };
}
