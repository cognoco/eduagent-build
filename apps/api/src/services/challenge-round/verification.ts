// ---------------------------------------------------------------------------
// resolveMasteryVerificationState — Challenge Round read-side gating helper.
//
// Phase 5 read-side hardening (Required Enablement Gate in
// docs/plans/2026-05-18-challenge-round-targets.md). Every server read site
// that surfaces challenge-round verification to the learner MUST consume the
// state returned here, not the raw `assessments.mastery_challenge_verified_at`
// timestamp. The raw timestamp encodes a single point-in-time pass; treating
// it as permanently active ignores later weak-spot evidence and inflates the
// learner's apparent mastery.
//
// Counter-evidence policy:
// - `needs_deepening_topics` rows with status IN ('pending_review', 'active')
//   that were created AFTER the verification timestamp downgrade the state to
//   `'stale'`.
// - `pending_review` rows count as evidence even before corroboration: until
//   the row expires or is promoted, the verification is in question.
// - `expired` / `resolved` / other terminal statuses do NOT count — they
//   represent evidence that either timed out without corroboration or was
//   explicitly cleared.
// - Rows that predate the verification do NOT count — the round itself was
//   conducted with awareness of those weak spots and still passed.
// ---------------------------------------------------------------------------

export type MasteryVerificationState = 'unverified' | 'fresh' | 'stale';

/** Counter-evidence row shape. Only the two fields we read are required. */
export interface MasteryWeakSpotRow {
  status: string;
  createdAt: Date;
}

export interface ResolveMasteryVerificationStateInput {
  /**
   * The latest non-null `masteryChallengeVerifiedAt` for the topic+profile,
   * or `null` if no Challenge Round has ever passed. Callers MUST pass the
   * latest such timestamp — passing a stale timestamp when a newer
   * verification exists will under-report the freshness.
   */
  verifiedAt: Date | null;
  /**
   * `needs_deepening_topics` rows for this profile+topic. Source filter is
   * intentionally NOT applied — a weak spot from any source observed after
   * verification is still counter-evidence that the verified understanding
   * is no longer comprehensive. Callers should pass the full set of rows
   * for the topic and let this function apply the status filter.
   */
  newWeakSpotRows: ReadonlyArray<MasteryWeakSpotRow>;
}

const ACTIONABLE_STATUSES: ReadonlySet<string> = new Set([
  'pending_review',
  'active',
]);

export function resolveMasteryVerificationState(
  input: ResolveMasteryVerificationStateInput,
): MasteryVerificationState {
  if (input.verifiedAt === null) {
    return 'unverified';
  }

  const verifiedAtMs = input.verifiedAt.getTime();
  for (const r of input.newWeakSpotRows) {
    if (!ACTIONABLE_STATUSES.has(r.status)) continue;
    if (r.createdAt.getTime() > verifiedAtMs) {
      return 'stale';
    }
  }
  return 'fresh';
}
