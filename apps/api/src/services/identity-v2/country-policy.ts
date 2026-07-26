// ---------------------------------------------------------------------------
// [WI-2690] The canonical habitual-residence jurisdiction resolver.
//
// This is a PURE function over an effective-dated policy set: it takes the
// registry rows it should consider and returns one typed decision. It holds no
// country list, no threshold table, and no regime mapping — those are DB-
// mastered in `country_policy_registry` (AC1) and reach this function only as
// `input.policies`. Adding a country, changing a threshold, or enabling a
// launch wave is therefore a DATA change, never a code change.
//
// It fails closed (AC6): every path that cannot positively establish an
// allowed jurisdiction returns `launchDecision: 'blocked'` with the reason
// codes that explain why. `allowed` is emitted only when NO reason code fired.
// ---------------------------------------------------------------------------
import {
  NON_COUNTRY_ALPHA2_CODES,
  PROFILE_MINIMUM_AGE,
  residenceAssuranceSchema,
  type AgeConsentDecision,
  type CountryPolicyDecision,
  type CountryPolicyRecord,
  type PolicyReasonCode,
} from '@eduagent/schemas';

export interface ResolveCountryPolicyInput {
  /**
   * The effective-dated registry rows to consider. Callers normally pass every
   * row for the learner's country; passing the whole registry is also valid.
   */
  policies: CountryPolicyRecord[];
  /** Asserted habitual residence as ISO 3166-1 alpha-2, or null if unknown. */
  habitualResidence: string | null;
  /** ISO `YYYY-MM-DD`. */
  birthDate: string;
  /** How habitual residence was asserted; validated, never trusted blindly. */
  residenceAssurance: unknown;
  /** Decision instant — every effective-date and staleness check keys on it. */
  asOf: Date;
}

/** Whole years elapsed at `asOf`, computed in UTC to avoid host-tz drift. */
function ageInYearsAt(birthDate: string, asOf: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;
  const [, y, m, d] = match;
  const birthUtc = Date.UTC(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(birthUtc)) return null;
  const born = new Date(birthUtc);
  let age = asOf.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday =
    asOf.getUTCMonth() < born.getUTCMonth() ||
    (asOf.getUTCMonth() === born.getUTCMonth() &&
      asOf.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function isActiveAt(record: CountryPolicyRecord, asOf: Date): boolean {
  return (
    record.effectiveAt.getTime() <= asOf.getTime() &&
    (record.expiresAt === null || record.expiresAt.getTime() > asOf.getTime())
  );
}

/** Fail-closed decision for the paths where no registry row applies. */
function blockedWithoutRecord(
  habitualResidence: string | null,
  reasonCodes: PolicyReasonCode[],
): CountryPolicyDecision {
  return {
    habitualResidence:
      habitualResidence && /^[A-Z]{2}$/.test(habitualResidence)
        ? habitualResidence
        : null,
    regimeKey: null,
    launchDecision: 'blocked',
    consentDecision: null,
    processingLocationClass: null,
    policyVersion: null,
    effectiveAt: null,
    reasonCodes,
    article8Threshold: null,
    authorizationForm: null,
    legalRefreshRequired: false,
  };
}

export function resolveCountryPolicy(
  input: ResolveCountryPolicyInput,
): CountryPolicyDecision {
  const { policies, habitualResidence, birthDate, asOf } = input;

  // 1. Residence must be present, well-formed, and an actual country code.
  if (habitualResidence === null || habitualResidence === undefined) {
    return blockedWithoutRecord(null, ['COUNTRY_UNKNOWN']);
  }
  if (
    !/^[A-Z]{2}$/.test(habitualResidence) ||
    NON_COUNTRY_ALPHA2_CODES.has(habitualResidence)
  ) {
    return blockedWithoutRecord(null, ['COUNTRY_INVALID']);
  }

  // 2. The registry must know the country at all.
  const forCountry = policies.filter(
    (record) => record.countryCode === habitualResidence,
  );
  if (forCountry.length === 0) {
    return blockedWithoutRecord(habitualResidence, ['COUNTRY_UNSUPPORTED']);
  }

  // 3. …and must have a row that is in force right now. A row that exists but
  //    is not yet effective, or has expired, is reported as such rather than
  //    collapsing into "unsupported" — the operator needs to tell those apart.
  const active = forCountry.filter((record) => isActiveAt(record, asOf));
  if (active.length === 0) {
    const windowCodes: PolicyReasonCode[] = [];
    if (forCountry.some((r) => r.effectiveAt.getTime() > asOf.getTime())) {
      windowCodes.push('POLICY_NOT_EFFECTIVE');
    }
    if (
      forCountry.some(
        (r) => r.expiresAt !== null && r.expiresAt.getTime() <= asOf.getTime(),
      )
    ) {
      windowCodes.push('POLICY_STALE');
    }
    return blockedWithoutRecord(habitualResidence, windowCodes);
  }

  // Newest effective row wins; an effective-dated update supersedes without a
  // migration or a deploy.
  const record = active.reduce((newest, candidate) =>
    candidate.effectiveAt.getTime() >= newest.effectiveAt.getTime()
      ? candidate
      : newest,
  );

  const reasonCodes: PolicyReasonCode[] = [];

  // 4. Residence assurance. A corroborating-only signal (geo-IP, billing or
  //    storefront country, device locale) is rejected as the PRIMARY assertion
  //    however confident it is — it may corroborate, never replace (AC6).
  const assurance = residenceAssuranceSchema.safeParse(
    input.residenceAssurance,
  );
  if (!assurance.success) {
    reasonCodes.push('RESIDENCE_ASSURANCE_INSUFFICIENT');
  }

  // 5. Legal standing of the row itself.
  const legalReviewStale =
    record.legalReviewValidUntil.getTime() <= asOf.getTime();
  if (legalReviewStale) {
    reasonCodes.push('LEGAL_REVIEW_STALE');
  }
  if (record.legalVerificationStatus !== 'verified') {
    reasonCodes.push('LEGAL_VERIFICATION_UNVERIFIED');
  }

  // 6. Launch gates. `launchStatus` is the controller's switch; the gate set
  //    is the evidence behind it. Both are reported so a block is explainable.
  if (record.launchStatus !== 'enabled') {
    reasonCodes.push('COUNTRY_BLOCKED');
  }
  const gatesOpen = Object.values(record.controllerGates).some(
    (closed) => !closed,
  );
  if (gatesOpen) {
    reasonCodes.push('CONTROLLER_GATES_OPEN');
  }

  // 7. The universal product age floor, independent of the national threshold.
  const age = ageInYearsAt(birthDate, asOf);
  if (age === null || age < PROFILE_MINIMUM_AGE) {
    reasonCodes.push('BELOW_LAUNCH_MINIMUM_AGE');
  }

  // Consent capacity is a fact about the learner and the national threshold —
  // it is reported even when the launch decision blocks, so a consumer can
  // explain "you could consent here, but we are not open yet".
  const consentDecision: AgeConsentDecision | null =
    age === null
      ? null
      : {
          ageBand:
            age < PROFILE_MINIMUM_AGE
              ? 'below_minimum'
              : age >= 18
                ? 'adult'
                : age >= record.article8Threshold
                  ? 'consent_capable_minor'
                  : 'guardian_required_minor',
          consentStatus: age >= 18 ? 'NOT_REQUIRED' : 'REQUIRED_PENDING',
          assuranceLevel:
            assurance.success && assurance.data.method === 'verified_credential'
              ? 'VERIFIED'
              : 'SELF_DECLARED',
          // 'self_report' is a deliberate sentinel when no assurance parses:
          // the weakest method the schema names, matching the SELF_DECLARED
          // assurance level above. The decision is already blocked by
          // RESIDENCE_ASSURANCE_INSUFFICIENT, so this never grants anything.
          consentMethod: assurance.success
            ? assurance.data.method
            : 'self_report',
          jurisdiction: record.countryCode,
          purposeScope: {
            core: true,
            thirdPartyShare: false,
            targetedAds: false,
            aiTraining: false,
          },
          retentionExpiresAt: null,
          receiptId: null,
        };

  return {
    habitualResidence: record.countryCode,
    regimeKey: record.regimeKey,
    launchDecision: reasonCodes.length === 0 ? 'allowed' : 'blocked',
    consentDecision,
    processingLocationClass: record.processingLocationClass,
    policyVersion: record.policyVersion,
    effectiveAt: record.effectiveAt,
    reasonCodes,
    article8Threshold: record.article8Threshold,
    // Above the national threshold the learner authorizes for themselves;
    // below it the country's own authorization shape applies (France's joint
    // child-plus-guardian form is a row value, not a code branch).
    authorizationForm:
      age !== null && age >= record.article8Threshold
        ? 'self'
        : record.authorizationForm,
    legalRefreshRequired: legalReviewStale || record.launchDayReviewRequired,
  };
}
