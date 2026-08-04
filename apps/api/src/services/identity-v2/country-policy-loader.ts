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
 * `countryName` is taken from the row with the LATEST effectiveAt, so a
 * renamed country reads with its current name rather than whichever row the
 * database happened to return first.
 *
 * Unfiltered by launch status, deliberately — see residenceCountryOptionSchema.
 * Sorted by country name so the caller does not have to, and so the order is
 * stable across calls.
 */
export async function listResidenceCountries(
  db: CountryPolicyReader,
): Promise<ResidenceCountryOption[]> {
  const rows = await db
    .select({
      countryCode: countryPolicyRegistry.countryCode,
      countryName: countryPolicyRegistry.countryName,
      effectiveAt: countryPolicyRegistry.effectiveAt,
    })
    .from(countryPolicyRegistry);

  const latestByCode = new Map<string, { name: string; effectiveAt: Date }>();
  for (const row of rows) {
    const seen = latestByCode.get(row.countryCode);
    if (!seen || row.effectiveAt > seen.effectiveAt) {
      latestByCode.set(row.countryCode, {
        name: row.countryName,
        effectiveAt: row.effectiveAt,
      });
    }
  }

  return [...latestByCode.entries()]
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
