// ---------------------------------------------------------------------------
// [BUG-784 / WI-1166] Regression guard: the 23505 LOGIN_EMAIL_UNIQUE race
// branch must NOT emit app/account.reclaim_attempt when the post-race email
// re-read returns undefined (existingClerkUserId would be null — the handler
// rejects null payloads and fires a Sentry exception instead of notifying the
// account owner).
//
// RED pre-fix:  refuseReclaim emits the event with existingClerkUserId: null,
//               so expect(sentWithNull).toBe(false) FAILS.
// GREEN post-fix: refuseReclaim guards the safeSend call and skips emission
//                 when existingClerkUserId is null.
//
// These are unit tests (mocked DB / external boundaries).  The real-DB happy
// path and concurrent-race path live in identity-graph.integration.test.ts.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { join } from 'path';
import type { Database } from '@eduagent/database';
import { PROFILE_MINIMUM_AGE } from '@eduagent/schemas';
import { ConflictError } from '../../errors';
import { ProfileValidationError } from '../profile';
import {
  createIdentityGraph,
  residenceJurisdictionForCreate,
  LEGACY_UNKNOWN_RESIDENCE_BUCKET,
} from './identity-graph';

// ── External-boundary mocks (not internal — gc1-allow for each) ─────────

// Mock the inngest client so we can assert what events are sent without a
// real Inngest server.  safeSend wraps the callback; mocking `inngest.send`
// is sufficient to capture the dispatch.
const mockInngestSend = jest
  .fn<Promise<unknown>, [unknown]>()
  .mockResolvedValue(undefined);
jest.mock(
  // gc1-allow: external boundary — no real Inngest client in unit-test env
  '../../inngest/client',
  () => {
    const actual = jest.requireActual(
      '../../inngest/client',
    ) as typeof import('../../inngest/client');
    return {
      ...actual,
      inngest: { send: (...args: unknown[]) => mockInngestSend(args[0]) },
    };
  },
);

const mockCaptureException = jest.fn();
jest.mock(
  // gc1-allow: external boundary — Sentry not initialised in unit-test env
  '../sentry',
  () => {
    const actual = jest.requireActual(
      '../sentry',
    ) as typeof import('../sentry');
    return {
      ...actual,
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    };
  },
);

// ── Helper: minimal mock DB ──────────────────────────────────────────────

/**
 * Returns a minimal Database-shaped object that:
 *   - makes `db.transaction(cb)` throw a 23505 `login_email_unique` error
 *     WITHOUT calling `cb` (simulates the loser in a concurrent race).
 *   - returns `raceReRead` for the subsequent `db.query.login.findFirst` call
 *     in the catch block (the post-race re-read by email).
 */
function makeRaceDb(
  raceReRead: { clerkUserId: string; email: string } | undefined,
): Database {
  return {
    transaction: jest.fn().mockRejectedValue({
      code: '23505',
      constraint: 'login_email_unique',
    }),
    query: {
      login: {
        findFirst: jest.fn().mockResolvedValue(raceReRead),
      },
    },
  } as unknown as Database;
}

/**
 * [WI-3019] A Database that refuses to be used at all. Any access is a test
 * failure by construction, which is what makes it the right instrument for a
 * guard that must reject BEFORE opening a transaction.
 */
function makeUntouchableDb(): Database {
  const touched = () => {
    throw new Error(
      'database was touched: the minimum-age floor must reject before any database work',
    );
  };
  return {
    transaction: touched,
    query: { login: { findFirst: touched } },
  } as unknown as Database;
}

// Minimum valid input (consent + age pass; no birthMonth/Day → birthYear-01-01).
const BASE_INPUT = {
  clerkUserId: 'incoming_clerk',
  verifiedEmail: 'victim@example.com',
  displayName: 'Test User',
  birthYear: 1990,
} as const;

// ── Tests ────────────────────────────────────────────────────────────────

describe('[WI-1166] createIdentityGraph — LOGIN_EMAIL_UNIQUE race null-clerkUserId guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Null re-read (the bug path) ──────────────────────────────────────

  it('race branch with undefined re-read always throws ConflictError (invariant — holds before and after fix)', async () => {
    // The loser of the concurrent race: transaction throws 23505
    // login_email_unique, the post-race re-read returns undefined (row deleted
    // between the 23505 and the re-read — an unusual but real edge case).
    // ConflictError must always be thrown regardless of emission logic.
    const db = makeRaceDb(undefined);
    await expect(createIdentityGraph(db, BASE_INPUT)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('[BREAK] race branch with undefined re-read MUST NOT emit app/account.reclaim_attempt with null existingClerkUserId', async () => {
    // Pre-fix behaviour: refuseReclaim called safeSend unconditionally, emitting
    //   { name: 'app/account.reclaim_attempt', data: { existingClerkUserId: null, … } }
    // which the handler's reclaimAttemptEventSchema rejects (expects string.min(1)).
    // Post-fix: the safeSend call is guarded by `existingClerkUserId !== null`
    // so the event is never dispatched in this edge case.
    const db = makeRaceDb(undefined);
    try {
      await createIdentityGraph(db, BASE_INPUT);
    } catch {
      // ConflictError expected — continue to assertions.
    }

    const nullPayloadCall = mockInngestSend.mock.calls.find(
      (callArgs) =>
        typeof callArgs[0] === 'object' &&
        callArgs[0] !== null &&
        (callArgs[0] as { name?: string }).name ===
          'app/account.reclaim_attempt' &&
        (callArgs[0] as { data?: { existingClerkUserId?: unknown } }).data
          ?.existingClerkUserId === null,
    );
    expect(nullPayloadCall).toBeUndefined();
  });

  // ── Non-null re-read (the expected path — control case) ─────────────

  it('race branch with a known victim clerkUserId DOES emit app/account.reclaim_attempt', async () => {
    // When the post-race re-read finds the winning row, the event must still be
    // emitted so the existing owner receives the security notification email.
    const db = makeRaceDb({
      clerkUserId: 'victim_clerk',
      email: 'victim@example.com',
    });
    try {
      await createIdentityGraph(db, BASE_INPUT);
    } catch {
      // ConflictError expected.
    }

    const emittedEvent = mockInngestSend.mock.calls.find(
      (callArgs) =>
        typeof callArgs[0] === 'object' &&
        callArgs[0] !== null &&
        (callArgs[0] as { name?: string }).name ===
          'app/account.reclaim_attempt',
    );
    expect(emittedEvent).toBeDefined();
    expect(
      (emittedEvent?.[0] as { data?: { existingClerkUserId?: string } })?.data
        ?.existingClerkUserId,
    ).toBe('victim_clerk');
  });
});

describe('[WI-2788] createIdentityGraph — pending Clerk erasure fence', () => {
  it('checks the erasure fence before inserting a replacement login', () => {
    const source = readFileSync(join(__dirname, 'identity-graph.ts'), 'utf8');
    const createGraph = source.slice(
      source.indexOf('export async function createIdentityGraph('),
    );
    const fenceAt = createGraph.indexOf(
      'assertClerkIdentityBootstrapAllowedTx(txDb, input.clerkUserId)',
    );
    const loginInsertAt = createGraph.indexOf('.insert(login)');

    expect(fenceAt).toBeGreaterThanOrEqual(0);
    expect(loginInsertAt).toBeGreaterThanOrEqual(0);
    expect(fenceAt).toBeLessThan(loginInsertAt);
  });
});

// ---------------------------------------------------------------------------
// [WI-3019] createIdentityGraph — writer-level fail-closed minimum-age floor.
//
// profileCreateSchema requires birthMonth/birthDay once birthYear reaches the
// floor year, so the ROUTE never hands a year-only floor-year payload to this
// writer. isBelowMinimumAgeAtCreation is wired in here as defence-in-depth for
// a caller that reaches the writer WITHOUT passing through zValidator, and the
// attack that layer exists to stop is precisely "first layer bypassed".
// Calling createIdentityGraph directly is that bypass.
//
// The floor is evaluated before db.transaction is opened, so an untouchable
// Database is the instrument: it proves both that the payload is rejected and
// that nothing reaches the database. Relative year, never a literal.
//
// Red-green-revert: restore the previous `consentCheck.belowMinimumAge` test in
// identity-graph.ts and the BREAK case stops throwing ProfileValidationError —
// it dies on the untouchable DB instead, i.e. an under-age owner would have
// been written.
// ---------------------------------------------------------------------------
describe('[WI-3019] createIdentityGraph — minimum-age floor with the schema layer bypassed', () => {
  const CURRENT_YEAR = new Date().getUTCFullYear();

  it('[BREAK] rejects a year-only payload at the floor birth year before any database work', async () => {
    await expect(
      createIdentityGraph(makeUntouchableDb(), {
        ...BASE_INPUT,
        birthYear: CURRENT_YEAR - PROFILE_MINIMUM_AGE,
        // No birthMonth/birthDay — calendar-year math reads this as exactly
        // PROFILE_MINIMUM_AGE while the person may still be a year younger.
      }),
    ).rejects.toBeInstanceOf(ProfileValidationError);
  });

  it('still admits a year-only payload one year clear of the floor', async () => {
    // Proves the guard is a floor and not a blanket ban on year-only input:
    // this payload passes the age check and then dies on the untouchable DB,
    // so the rejection is NOT a ProfileValidationError.
    await expect(
      createIdentityGraph(makeUntouchableDb(), {
        ...BASE_INPUT,
        birthYear: CURRENT_YEAR - PROFILE_MINIMUM_AGE - 1,
      }),
    ).rejects.not.toBeInstanceOf(ProfileValidationError);
  });
});

// ---------------------------------------------------------------------------
// [WI-2743] residenceJurisdictionForCreate — the single create-time mapping
// from the collected ISO habitual-residence country to
// person.residence_jurisdiction. Pure; no DB. The DB-backed proof that both
// writers actually persist what this returns lives in the integration suite.
//
// This is the function that ends the "every person row reads 'ROW'" state that
// made the WI-2690 country registry inert: resolveJurisdiction requires a real
// ISO alpha-2, so while the column only ever held the three legacy buckets, no
// country could ever be enabled.
// ---------------------------------------------------------------------------
describe('[WI-2743] residenceJurisdictionForCreate', () => {
  it('persists a collected ISO alpha-2 country VERBATIM, not collapsed into a bucket', () => {
    expect(residenceJurisdictionForCreate('DE')).toBe('DE');
    expect(residenceJurisdictionForCreate('PL')).toBe('PL');
    expect(residenceJurisdictionForCreate('GB')).toBe('GB');
    // The pre-WI-2743 writers collapsed every one of these to 'ROW' via
    // locationToJurisdiction, which is precisely why the registry resolved
    // nothing for anybody.
    expect(residenceJurisdictionForCreate('NO')).not.toBe(
      LEGACY_UNKNOWN_RESIDENCE_BUCKET,
    );
  });

  it('writes the legacy unknown bucket when no country was collected', () => {
    // Deliberate and non-gating: this item collects residence, it does not
    // refuse admission without it. 'ROW' has no registry row keyed to it, so
    // resolveCountryPolicy fails closed on these rows (country-policy.test.ts
    // "fails closed for legacy bucket ROW") and WI-2927 owns turning that
    // fail-closed decision into an actual refusal.
    expect(residenceJurisdictionForCreate(undefined)).toBe(
      LEGACY_UNKNOWN_RESIDENCE_BUCKET,
    );
    expect(residenceJurisdictionForCreate(null)).toBe(
      LEGACY_UNKNOWN_RESIDENCE_BUCKET,
    );
    expect(residenceJurisdictionForCreate('')).toBe(
      LEGACY_UNKNOWN_RESIDENCE_BUCKET,
    );
  });
});
