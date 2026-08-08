import type { ConsentAgeBand, CountryPolicyDecision } from '@eduagent/schemas';

/**
 * [WI-2745] Classification of a re-resolved policy decision against the
 * decision a person previously held.
 *
 * The whole point of this module is the ASYMMETRY in AC-2: a relaxation may be
 * applied automatically, a restriction may NEVER silently revoke live access.
 * Keeping the classification pure — no database, no clock, no policy lookup —
 * is what lets the safety rule be proven directly rather than inferred from the
 * behaviour of a scheduled job.
 */
export type PolicyChangeKind = 'unchanged' | 'relaxation' | 'restriction';

/**
 * Consent age bands in increasing order of capability. This ordering is the
 * definition of "relaxation" on the age axis: a person only ever moves UP it as
 * they age, so an age-driven change is a relaxation by construction.
 *
 * A DOWNWARD move is therefore never age-driven — it can only come from a
 * policy-version change or a residence change arriving on the same decision.
 * That is precisely why AC-2's restriction rule is not dead code on an
 * age-axis job: the axis cannot produce a restriction, but the job re-resolves
 * a WHOLE decision, and the rest of that decision can.
 *
 * A `Record` keyed by the band union rather than an ordered array, and that
 * choice is load-bearing rather than stylistic: a `ConsentAgeBand[]` lets a
 * newly added schema member compile silently, and `indexOf` then returns -1 for
 * it. -1 sorts BELOW every real band, so an unknown PRIOR band makes
 * `bandRaised` true against any known next band — the change classifies as a
 * relaxation and `mayApplyAutomatically` returns true. That is failure in the
 * one direction this module exists to prevent. As a Record, a new band is a
 * compile error here instead.
 */
const AGE_BAND_RANK: Record<ConsentAgeBand, number> = {
  below_minimum: 0,
  guardian_required_minor: 1,
  consent_capable_minor: 2,
  adult: 3,
};

function bandRank(band: ConsentAgeBand): number {
  return AGE_BAND_RANK[band];
}

/**
 * A decision that could not be resolved. Every nullable field is null exactly
 * when no registry row matched, so `consentDecision === null` together with a
 * blocked launch is the fail-closed shape.
 *
 * A fail-closed decision is NOT treated as a restriction of a previously
 * resolved one — see `classifyPolicyChange`.
 */
function isUnresolved(decision: CountryPolicyDecision): boolean {
  return decision.consentDecision === null || decision.regimeKey === null;
}

/**
 * Classify `next` relative to `prior`.
 *
 * Ordering of the checks is deliberate and is the safety property:
 * ANY restriction signal wins over ANY relaxation signal. A decision that
 * relaxes the age band while blocking launch is a RESTRICTION, because the
 * consequence that matters to a live user is the block. Reversing these two
 * branches would let a mixed decision auto-apply a revocation.
 */
export function classifyPolicyChange(
  prior: CountryPolicyDecision,
  next: CountryPolicyDecision,
): PolicyChangeKind {
  // An unresolvable NEW decision never revokes. Resolution can fail for
  // reasons that have nothing to do with the person — a registry row retired,
  // a country not yet configured — and treating that as a restriction would
  // let an operational gap read as a deliberate policy act. It is also the
  // state of every person today, before an ISO residence is collected, so
  // treating it as a change would make the first run a mass event storm.
  if (isUnresolved(next)) return 'unchanged';

  // Becoming resolvable at all is a relaxation only if something actually
  // improved; a person moving from unresolved to blocked has gained nothing.
  if (isUnresolved(prior)) {
    return next.launchDecision === 'allowed' ? 'relaxation' : 'unchanged';
  }

  const priorBand = prior.consentDecision!.ageBand;
  const nextBand = next.consentDecision!.ageBand;
  const priorStatus = prior.consentDecision!.consentStatus;
  const nextStatus = next.consentDecision!.consentStatus;

  // --- restriction signals, checked first and independently -----------------
  const launchWithdrawn =
    prior.launchDecision === 'allowed' && next.launchDecision === 'blocked';
  const bandLowered = bandRank(nextBand) < bandRank(priorBand);
  const consentNewlyRequired =
    priorStatus === 'NOT_REQUIRED' && nextStatus === 'REQUIRED_PENDING';

  if (launchWithdrawn || bandLowered || consentNewlyRequired) {
    return 'restriction';
  }

  // --- relaxation signals ---------------------------------------------------
  const launchGranted =
    prior.launchDecision === 'blocked' && next.launchDecision === 'allowed';
  const bandRaised = bandRank(nextBand) > bandRank(priorBand);
  const consentNoLongerRequired =
    priorStatus === 'REQUIRED_PENDING' && nextStatus === 'NOT_REQUIRED';

  if (launchGranted || bandRaised || consentNoLongerRequired) {
    return 'relaxation';
  }

  return 'unchanged';
}

/**
 * Whether a classified change may be applied automatically.
 *
 * Exists as its own named function rather than an inline `=== 'relaxation'` so
 * the standing never-lock / always-override posture has one place to be read,
 * tested and grepped. A caller that wants to revoke has to disagree with this
 * function by name.
 */
export function mayApplyAutomatically(kind: PolicyChangeKind): boolean {
  return kind === 'relaxation';
}
