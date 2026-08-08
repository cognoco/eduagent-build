// ---------------------------------------------------------------------------
// [WI-2690] The ONLY read path from `country_policy_registry` into the
// resolver. Every consumer of jurisdiction policy goes through here, so the
// registry stays the single live source (AC1) and no caller ever holds its own
// country, threshold, or regime values.
//
// Data-access note: `country_policy_registry` and `regimes` are global
// reference tables with no `profile_id` column, so `createScopedRepository`
// does not apply — there is no per-profile scope to enforce. A direct
// `db.select()` with a join to `regimes` is the correct pattern here, and the
// join is why the scoped repository could not express it in any case.
// ---------------------------------------------------------------------------
import { eq } from 'drizzle-orm';
import {
  countryPolicyRegistry,
  regimes,
  type Database,
} from '@eduagent/database';
import {
  countryPolicyRecordSchema,
  residenceCountryOptionSchema,
  type CountryPolicyDecision,
  type CountryPolicyRecord,
  type ResidenceCountryOption,
} from '@eduagent/schemas';
import { resolveCountryPolicy } from './country-policy';

type CountryPolicyReader = Pick<Database, 'select'>;

/**
 * jsonb round-trips dates as ISO strings, so the provenance timestamps arrive
 * as text and are revived before the record is validated. Anything else about
 * the row is validated as-is — a malformed registry row must fail loudly at
 * the boundary rather than reach a policy decision.
 */
function reviveSourceProvenance(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw;
  return raw.map((entry) =>
    entry !== null && typeof entry === 'object' && 'checkedAt' in entry
      ? {
          ...(entry as Record<string, unknown>),
          checkedAt: new Date(
            (entry as { checkedAt: string | Date }).checkedAt,
          ),
        }
      : entry,
  );
}

/**
 * Every registry row for one country, in no guaranteed order. Rows are
 * returned unfiltered by effective date: selecting the row in force is the
 * resolver's job (it sorts by effectiveAt itself), and it needs the
 * out-of-window rows to tell "not yet effective" apart from "expired" (AC6).
 */
export async function loadCountryPolicies(
  db: CountryPolicyReader,
  countryCode: string,
): Promise<CountryPolicyRecord[]> {
  const rows = await db
    .select({
      countryCode: countryPolicyRegistry.countryCode,
      countryName: countryPolicyRegistry.countryName,
      regimeKey: regimes.code,
      article8Threshold: countryPolicyRegistry.article8Threshold,
      authorizationForm: countryPolicyRegistry.authorizationForm,
      launchStatus: countryPolicyRegistry.launchStatus,
      launchBlockReason: countryPolicyRegistry.launchBlockReason,
      legalVerificationStatus: countryPolicyRegistry.legalVerificationStatus,
      legalReviewedAt: countryPolicyRegistry.legalReviewedAt,
      legalReviewValidUntil: countryPolicyRegistry.legalReviewValidUntil,
      launchDayReviewRequired: countryPolicyRegistry.launchDayReviewRequired,
      processingLocationClass: countryPolicyRegistry.processingLocationClass,
      policyVersion: countryPolicyRegistry.policyVersion,
      effectiveAt: countryPolicyRegistry.effectiveAt,
      expiresAt: countryPolicyRegistry.expiresAt,
      sourceProvenance: countryPolicyRegistry.sourceProvenance,
      controllerGates: countryPolicyRegistry.controllerGates,
    })
    .from(countryPolicyRegistry)
    .innerJoin(regimes, eq(countryPolicyRegistry.regimeId, regimes.id))
    .where(eq(countryPolicyRegistry.countryCode, countryCode));

  return rows.map((row) =>
    countryPolicyRecordSchema.parse({
      ...row,
      sourceProvenance: reviveSourceProvenance(row.sourceProvenance),
    }),
  );
}

/**
 * [WI-2743] The selectable habitual-residence countries, mastered by the
 * registry (AC-1 forbids a hard-coded picker list). One entry per country, not
 * per registry row: the registry is effective-dated and carries several rows
 * per country, but a picker wants the country once.
 *
 * `countryName` is taken from the row IN FORCE at `now` — not simply the newest
 * row — so a rename staged ahead of its legal date is not published early. Ties
 * and out-of-window-only countries fall back to the latest effectiveAt, which
 * is also what makes the name deterministic rather than whichever row the
 * database happened to return first.
 *
 * Unfiltered by launch status, deliberately — see residenceCountryOptionSchema.
 * Sorted by country name so the caller does not have to, and so the order is
 * stable across calls.
 */
export async function listResidenceCountries(
  db: CountryPolicyReader,
  now: Date = new Date(),
): Promise<ResidenceCountryOption[]> {
  const rows = await db
    .select({
      countryCode: countryPolicyRegistry.countryCode,
      countryName: countryPolicyRegistry.countryName,
      effectiveAt: countryPolicyRegistry.effectiveAt,
      expiresAt: countryPolicyRegistry.expiresAt,
    })
    .from(countryPolicyRegistry);

  // The name comes from the row IN FORCE, not merely the newest one. Choosing
  // by latest effectiveAt alone would show a scheduled rename before it takes
  // effect — the registry is effective-dated precisely so a rename can be
  // staged ahead of time, so "newest row" and "current row" genuinely differ.
  //
  // MEMBERSHIP IS NOT FILTERED BY THE WINDOW, deliberately, and for the same
  // reason the list is unfiltered by launch status: habitual residence is a
  // fact about the person, not a permission. A country whose only registry row
  // is expired or not yet effective is still a real place someone lives, and
  // dropping it here would leave them unable to state where that is. The
  // fallback below therefore always yields a name.
  // `== null` rather than `=== null`: expires_at is a nullable column, and an
  // open-ended row must read as in force whether the driver hands back null or
  // leaves the field absent.
  const isInForce = (r: {
    effectiveAt: Date;
    expiresAt: Date | null;
  }): boolean =>
    r.effectiveAt <= now && (r.expiresAt == null || r.expiresAt > now);

  const bestByCode = new Map<
    string,
    { name: string; effectiveAt: Date; inForce: boolean }
  >();
  for (const row of rows) {
    const candidate = {
      name: row.countryName,
      effectiveAt: row.effectiveAt,
      inForce: isInForce(row),
    };
    const seen = bestByCode.get(row.countryCode);
    // An in-force row always beats an out-of-window one; between two rows of
    // the same standing, the later effectiveAt wins.
    const better =
      !seen ||
      (candidate.inForce && !seen.inForce) ||
      (candidate.inForce === seen.inForce &&
        candidate.effectiveAt > seen.effectiveAt);
    if (better) bestByCode.set(row.countryCode, candidate);
  }

  return [...bestByCode.entries()]
    .map(([countryCode, { name }]) =>
      residenceCountryOptionSchema.parse({ countryCode, countryName: name }),
    )
    .sort((a, b) => a.countryName.localeCompare(b.countryName));
}

export interface ResolveJurisdictionInput {
  /** Asserted habitual residence as ISO 3166-1 alpha-2, or null if unknown. */
  habitualResidence: string | null;
  /** ISO `YYYY-MM-DD`. */
  birthDate: string;
  residenceAssurance: unknown;
  asOf: Date;
}

/**
 * The one call every consumer makes. An unknown or malformed residence never
 * reaches the database: it fails closed on the spot with the same typed
 * decision shape a resolved country produces.
 */
export async function resolveJurisdiction(
  db: CountryPolicyReader,
  input: ResolveJurisdictionInput,
): Promise<CountryPolicyDecision> {
  const policies =
    input.habitualResidence && /^[A-Z]{2}$/.test(input.habitualResidence)
      ? await loadCountryPolicies(db, input.habitualResidence)
      : [];

  return resolveCountryPolicy({ ...input, policies });
}
