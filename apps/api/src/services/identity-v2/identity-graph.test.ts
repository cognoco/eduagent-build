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

import type { Database } from '@eduagent/database';
import { ConflictError } from '../../errors';
import { createIdentityGraph } from './identity-graph';

// ── External-boundary mocks (not internal — gc1-allow for each) ─────────

// Mock the inngest client so we can assert what events are sent without a
// real Inngest server.  safeSend wraps the callback; mocking `inngest.send`
// is sufficient to capture the dispatch.
const mockInngestSend = jest
  .fn<Promise<unknown>, [unknown]>()
  .mockResolvedValue(undefined);
jest.mock(
  '../../inngest/client',
  /* gc1-allow: external boundary — no real Inngest client in unit-test env */ () => {
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
  '../sentry',
  /* gc1-allow: external boundary — Sentry not initialised in unit-test env */ () => {
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

  it('[BREAK] race branch with undefined re-read still throws ConflictError (block always active)', async () => {
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
