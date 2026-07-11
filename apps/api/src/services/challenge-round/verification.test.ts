import {
  resolveMasteryVerificationState,
  type MasteryVerificationState,
} from './verification';

// ---------------------------------------------------------------------------
// resolveMasteryVerificationState — read-side gating helper.
//
// Phase 5 read-side hardening (docs/plans/2026-05-18-challenge-round-targets.md
// "Required Enablement Gate"). Centralises the policy that a raw
// `assessments.mastery_challenge_verified_at` timestamp is NEVER treated as
// "permanently verified". Every progress / curriculum / recap read site that
// surfaces challenge-round verification MUST consume the resolved state from
// this function, not the raw timestamp. Forward-only enforcement: PR B updates
// the existing read sites; new sites are caught at code review against this
// contract.
// ---------------------------------------------------------------------------

const VERIFIED_AT = new Date('2026-05-01T12:00:00.000Z');

function row(overrides: { status: string; createdAt: Date }): {
  status: string;
  createdAt: Date;
} {
  return overrides;
}

describe('resolveMasteryVerificationState', () => {
  it('returns "unverified" when verifiedAt is null', () => {
    const result: MasteryVerificationState = resolveMasteryVerificationState({
      verifiedAt: null,
      newWeakSpotRows: [],
    });
    expect(result).toBe('unverified');
  });

  it('returns "unverified" even if weak-spot rows exist, when verifiedAt is null', () => {
    // No verification has ever happened — weak spots are irrelevant to
    // freshness because there's nothing to be fresh or stale relative to.
    const result = resolveMasteryVerificationState({
      verifiedAt: null,
      newWeakSpotRows: [
        row({ status: 'active', createdAt: VERIFIED_AT }),
        row({ status: 'pending_review', createdAt: VERIFIED_AT }),
      ],
    });
    expect(result).toBe('unverified');
  });

  it('returns "fresh" when verifiedAt is set and no weak-spot rows exist', () => {
    const result = resolveMasteryVerificationState({
      verifiedAt: VERIFIED_AT,
      newWeakSpotRows: [],
    });
    expect(result).toBe('fresh');
  });

  it('returns "fresh" when weak-spot rows predate the verification', () => {
    // Verification supersedes earlier weak-spot evidence — the round itself
    // was conducted with awareness of prior weak spots and still passed.
    const olderRow = row({
      status: 'active',
      createdAt: new Date(VERIFIED_AT.getTime() - 24 * 60 * 60 * 1000),
    });
    const result = resolveMasteryVerificationState({
      verifiedAt: VERIFIED_AT,
      newWeakSpotRows: [olderRow],
    });
    expect(result).toBe('fresh');
  });

  it('returns "stale" when an "active" weak-spot row postdates the verification', () => {
    // A corroborated weak spot observed after verification means later
    // evidence has contradicted the verified state.
    const laterRow = row({
      status: 'active',
      createdAt: new Date(VERIFIED_AT.getTime() + 1),
    });
    const result = resolveMasteryVerificationState({
      verifiedAt: VERIFIED_AT,
      newWeakSpotRows: [laterRow],
    });
    expect(result).toBe('stale');
  });

  it('returns "stale" when a "pending_review" weak-spot row postdates the verification', () => {
    // Phase 5 contract: pending_review IS evidence (low-confidence, awaiting
    // corroboration). Until the row expires or is promoted, treat the
    // verification as in question — the conservative read.
    const laterRow = row({
      status: 'pending_review',
      createdAt: new Date(VERIFIED_AT.getTime() + 60 * 1000),
    });
    const result = resolveMasteryVerificationState({
      verifiedAt: VERIFIED_AT,
      newWeakSpotRows: [laterRow],
    });
    expect(result).toBe('stale');
  });

  it('ignores weak-spot rows with non-actionable statuses (expired, resolved, etc.)', () => {
    // Only pending_review + active are counter-evidence. An expired or
    // resolved row represents evidence that either timed out (no
    // corroboration arrived) or was explicitly cleared — neither contradicts
    // the verification.
    const laterButExpired = row({
      status: 'expired',
      createdAt: new Date(VERIFIED_AT.getTime() + 60 * 1000),
    });
    const laterButResolved = row({
      status: 'resolved',
      createdAt: new Date(VERIFIED_AT.getTime() + 60 * 1000),
    });
    const result = resolveMasteryVerificationState({
      verifiedAt: VERIFIED_AT,
      newWeakSpotRows: [laterButExpired, laterButResolved],
    });
    expect(result).toBe('fresh');
  });

  it('[WI-1446] promoting a weak-spot row from pending_review to active does not change the resolved state', () => {
    // ACTIONABLE_STATUSES treats pending_review and active identically — only
    // createdAt vs. verifiedAt matters. WI-1446 promotes unexpired
    // pending_review rows to active (status + pendingExpiresAt only;
    // createdAt is untouched), so this must be a no-op for verification state.
    const createdAt = new Date(VERIFIED_AT.getTime() + 60 * 1000);
    const pending = resolveMasteryVerificationState({
      verifiedAt: VERIFIED_AT,
      newWeakSpotRows: [row({ status: 'pending_review', createdAt })],
    });
    const promoted = resolveMasteryVerificationState({
      verifiedAt: VERIFIED_AT,
      newWeakSpotRows: [row({ status: 'active', createdAt })],
    });
    expect(pending).toBe('stale');
    expect(promoted).toBe('stale');
    expect(promoted).toBe(pending);
  });

  it('returns "stale" when at least one of many rows is a later actionable counter-signal', () => {
    const result = resolveMasteryVerificationState({
      verifiedAt: VERIFIED_AT,
      newWeakSpotRows: [
        row({
          status: 'expired',
          createdAt: new Date(VERIFIED_AT.getTime() + 1000),
        }),
        row({
          status: 'active',
          createdAt: new Date(VERIFIED_AT.getTime() - 1000),
        }), // earlier, ignored
        row({
          status: 'pending_review',
          createdAt: new Date(VERIFIED_AT.getTime() + 2000),
        }), // later + actionable → stale
      ],
    });
    expect(result).toBe('stale');
  });
});
