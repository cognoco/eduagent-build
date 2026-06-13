/**
 * session-filing-dispatch.test.ts
 *
 * [F-098 break-test] isClosePathAutoFileEligible — eligibility guard.
 *
 * The guard in session-filing-dispatch.ts controls whether a freeform session
 * receives an auto-file dispatch when it is closed. Removing or mis-wiring
 * any of its five conditions would either file sessions that should not be
 * filed (wrong mode, already filed, insufficient exchanges, has a topicId)
 * or silently skip filing for sessions that should be filed.
 *
 * This test suite is the regression guard:
 *   1. Write tests — all PASS (guard is correct).
 *   2. Temporarily comment the guard body (return true always) — break tests FAIL.
 *   3. Restore guard — tests PASS again.
 *
 * Red-green pattern per AGENTS.md "Security fixes require a break test."
 *
 * No internal mocks needed: isClosePathAutoFileEligible is a pure function
 * operating only on the session object and imported constants. No DB, no
 * Inngest, no external boundaries — real implementations throughout (GC1/GC6).
 */

import { isClosePathAutoFileEligible } from './session-filing-dispatch';
import { FILING_CONFIG } from '../../config/filing';

// Canonical minimum exchange count for auto-filing eligibility.
const MIN = FILING_CONFIG.minFreeformExchanges; // 5

// Builds a session object that satisfies all five eligibility conditions.
function eligibleSession(
  overrides: {
    metadata?: unknown;
    topicId?: string | null;
    filedAt?: string | null;
    filingStatus?: string | null;
    exchangeCount?: number;
  } = {},
) {
  return {
    metadata: { effectiveMode: 'freeform' },
    topicId: null,
    filedAt: null,
    filingStatus: null,
    exchangeCount: MIN,
    ...overrides,
  };
}

describe('[F-098 break-test] isClosePathAutoFileEligible — eligibility guard', () => {
  describe('positive path — all conditions met', () => {
    it('returns true for a fully eligible freeform session at the minimum exchange boundary', () => {
      expect(isClosePathAutoFileEligible(eligibleSession())).toBe(true);
    });

    it('returns true when exchangeCount exceeds the minimum', () => {
      expect(
        isClosePathAutoFileEligible(
          eligibleSession({ exchangeCount: MIN + 10 }),
        ),
      ).toBe(true);
    });
  });

  describe('[BREAK F-098] condition: effectiveMode must be freeform', () => {
    it('returns false when effectiveMode is learning', () => {
      expect(
        isClosePathAutoFileEligible(
          eligibleSession({ metadata: { effectiveMode: 'learning' } }),
        ),
      ).toBe(false);
    });

    it('returns false when effectiveMode is absent (session has no metadata)', () => {
      expect(
        isClosePathAutoFileEligible(eligibleSession({ metadata: {} })),
      ).toBe(false);
    });

    it('returns false when metadata is null', () => {
      expect(
        isClosePathAutoFileEligible(eligibleSession({ metadata: null })),
      ).toBe(false);
    });
  });

  describe('[BREAK F-098] condition: topicId must be null', () => {
    it('returns false when topicId is set (curriculum-linked session)', () => {
      expect(
        isClosePathAutoFileEligible(
          eligibleSession({ topicId: 'topic-uuid-123' }),
        ),
      ).toBe(false);
    });
  });

  describe('[BREAK F-098] condition: filedAt must be null', () => {
    it('returns false when filedAt is already set (already filed)', () => {
      expect(
        isClosePathAutoFileEligible(
          eligibleSession({ filedAt: '2026-01-01T00:00:00.000Z' }),
        ),
      ).toBe(false);
    });
  });

  describe('[BREAK F-098] condition: filingStatus must be null', () => {
    it('returns false when filingStatus is filing_pending', () => {
      expect(
        isClosePathAutoFileEligible(
          eligibleSession({ filingStatus: 'filing_pending' }),
        ),
      ).toBe(false);
    });

    it('returns false when filingStatus is filing_failed', () => {
      expect(
        isClosePathAutoFileEligible(
          eligibleSession({ filingStatus: 'filing_failed' }),
        ),
      ).toBe(false);
    });
  });

  describe('[BREAK F-098] condition: exchangeCount must meet the minimum', () => {
    it('returns false when exchangeCount is below the minimum', () => {
      expect(
        isClosePathAutoFileEligible(
          eligibleSession({ exchangeCount: MIN - 1 }),
        ),
      ).toBe(false);
    });

    it('returns false when exchangeCount is zero', () => {
      expect(
        isClosePathAutoFileEligible(eligibleSession({ exchangeCount: 0 })),
      ).toBe(false);
    });

    it('returns false when exchangeCount is undefined (defaults to 0)', () => {
      const session: Omit<
        ReturnType<typeof eligibleSession>,
        'exchangeCount'
      > = {
        metadata: { effectiveMode: 'freeform' },
        topicId: null,
        filedAt: null,
        filingStatus: null,
      };
      expect(isClosePathAutoFileEligible(session)).toBe(false);
    });

    it('returns true at exactly the minimum exchange boundary', () => {
      expect(
        isClosePathAutoFileEligible(eligibleSession({ exchangeCount: MIN })),
      ).toBe(true);
    });
  });
});
