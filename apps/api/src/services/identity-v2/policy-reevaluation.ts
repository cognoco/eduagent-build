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
 */
const AGE_BAND_ORDER: readonly ConsentAgeBand[] = [
  'below_minimum',
  'guardian_required_minor',
  'consent_capable_minor',
  'adult',
];

function bandRank(band: ConsentAgeBand): number {
  return AGE_BAND_ORDER.indexOf(band);
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
