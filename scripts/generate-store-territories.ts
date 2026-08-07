// ---------------------------------------------------------------------------
// [WI-2746] Derive store-territory availability from `country_policy_registry`.
//
// The launch-country decision is DB-mastered (WI-2690). Nothing turned it into
// the territory lists actually configured in App Store Connect and Google Play,
// so the registry and the store configuration could disagree with nothing
// detecting it. This generator reads the SAME `launch_status` the runtime gate
// reads, so the two cannot drift apart silently.
//
// SHAPE: the derivation is a PURE function over rows + a mapping. The DB read
// is a thin shell around it. Every ruled failure mode therefore has unit
// coverage with no database in the test path.
// ---------------------------------------------------------------------------

/** One registry row, reduced to what territory derivation actually needs. */
export interface RegistryLaunchRow {
  countryCode: string;
  launchStatus: string;
}

/**
 * Per-store territory identifiers for one ISO 3166-1 alpha-2 country.
 *
 * [WI-2746 AC-3] ISO alpha-2 is the CANONICAL vocabulary; each store's own
 * identifier is an explicit mapped value, never an assumption. App Store
 * Connect and Google Play do not agree on the format, so neither may be
 * derived from the other or from the alpha-2 code.
 */
export interface StoreTerritoryIdentifiers {
  appStoreConnect: string;
  googlePlay: string;
}

export type StoreTerritoryMapping = Readonly<
  Record<string, StoreTerritoryIdentifiers>
>;

/**
 * [WI-2746 AC-3] DELIBERATELY EMPTY — this is not an oversight and it must not
 * be populated from memory.
 *
 * How App Store Connect names its territories is NOT knowable from this repo,
 * and it does not match Google Play's vocabulary: ASC has historically used
 * three-letter territory codes while Play uses ISO alpha-2. A table authored
 * from recollection would be wrong in a uniform, plausible-looking way across
 * every row — the failure mode that survives review because each row looks
 * equally confident, and whose consequence is the app mis-listed or delisted in
 * real storefronts.
 *
 * THE AUTHORITATIVE SOURCE IS AN EXPORT OF WHAT IS ALREADY CONFIGURED. WI-1115
 * (closed, Manual, console-settings-only) configured both consoles to the
 * agreed launch set with hard-blocks applied, so the consoles themselves are
 * authoritative by construction rather than by anyone's recollection. Populate
 * this from that export.
 *
 * Until then every country is unmapped, so `deriveStoreTerritories` REFUSES for
 * all of them. That is the intended state: this generator can only refuse, it
 * can never emit a wrong territory list.
 */
export const STORE_TERRITORY_MAPPING: StoreTerritoryMapping = {};

export interface StoreTerritoryList {
  /** [AC-4] Which store this list is for. */
  store: 'app_store_connect' | 'google_play';
  /** Store-native territory identifiers, sorted for byte-identical re-runs. */
  territories: string[];
}

export interface StoreTerritoryArtifact {
  /** Canonical ISO alpha-2 set the lists were derived from. */
  countryCodes: string[];
  lists: StoreTerritoryList[];
}

/** Thrown for every ruled hard-error case, so callers cannot catch one by accident. */
export class StoreTerritoryDerivationError extends Error {
  override readonly name = 'StoreTerritoryDerivationError';
}

/**
 * [WI-2746] Derive the per-store territory lists. Pure.
 *
 * Two ruled HARD ERRORS, both of which exist because the failure they prevent
 * is worse than no output at all:
 *
 *  - AC-2 EMPTY RESULT. Every registry row reads launch_status='blocked' today,
 *    so a naive generator emits an empty list — and writing an empty list to a
 *    store territory configuration DELISTS THE APP EVERYWHERE. An empty enabled
 *    set is never a valid artifact; it is always a refusal.
 *  - AC-3 UNMAPPED STOREFRONT. An enabled country with no store identifier is
 *    refused, never silently dropped. A silent drop would ship a list that
 *    looks complete while omitting a country we decided to launch in.
 */
export function deriveStoreTerritories(
  rows: readonly RegistryLaunchRow[],
  mapping: StoreTerritoryMapping = STORE_TERRITORY_MAPPING,
): StoreTerritoryArtifact {
  const enabled = [
    ...new Set(
      rows
        .filter((row) => row.launchStatus === 'enabled')
        .map((row) => row.countryCode),
    ),
  ].sort();

  if (enabled.length === 0) {
    throw new StoreTerritoryDerivationError(
      'Refusing to emit a store-territory artifact: no country in ' +
        'country_policy_registry has launch_status=enabled. An empty ' +
        'territory list delists the app in every storefront, so an empty ' +
        'result is a hard error rather than a valid empty artifact. Enable at ' +
        'least one country in the registry before generating.',
    );
  }

  const unmapped = enabled.filter((code) => !mapping[code]);
  if (unmapped.length > 0) {
    throw new StoreTerritoryDerivationError(
      `Refusing to emit a store-territory artifact: no store identifiers are ` +
        `mapped for ${unmapped.join(', ')}. ` +
        'If EVERY country is unmapped, STORE_TERRITORY_MAPPING is still in its ' +
        'deliberately-unpopulated initial state — do NOT author it from memory. ' +
        'App Store Connect and Google Play use different territory vocabularies, ' +
        'and a remembered table is wrong in a uniform, plausible-looking way. ' +
        'Populate it from an export of what WI-1115 already configured in both ' +
        'consoles, which is authoritative by construction. An unmapped country ' +
        'is never silently dropped, because that would ship a list that looks ' +
        'complete while omitting a country we decided to launch in.',
    );
  }

  return {
    countryCodes: enabled,
    lists: [
      {
        store: 'app_store_connect',
        territories: enabled
          .map((code) => mapping[code]!.appStoreConnect)
          .sort(),
      },
      {
        store: 'google_play',
        territories: enabled.map((code) => mapping[code]!.googlePlay).sort(),
      },
    ],
  };
}

/**
 * [WI-2746 AC-5] Render the artifact. Sorted throughout and terminated with a
 * single newline, so re-running against an unchanged registry produces
 * byte-identical output and the result is diffable in review.
 */
export function renderStoreTerritories(
  artifact: StoreTerritoryArtifact,
): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

/**
 * [WI-2746 AC-1] The thin DB shell: read the registry's launch status and hand
 * the rows to the pure derivation above. It reads `launch_status` from
 * `country_policy_registry` — the SAME column the runtime gate reads — so the
 * store configuration cannot drift away from the launch decision.
 *
 * Deliberately thin. Everything that can fail on policy grounds fails in
 * `deriveStoreTerritories`, which is why the ruled hard errors are provable
 * without a database.
 *
 * Data-access note: `country_policy_registry` is a global reference table with
 * no `profile_id`, so `createScopedRepository` does not apply — there is no
 * per-profile scope to enforce. Same rationale as `country-policy-loader.ts`.
 */
export async function generateStoreTerritories(): Promise<string> {
  const { createDatabase, countryPolicyRegistry } =
    await import('@eduagent/database');
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new StoreTerritoryDerivationError(
      'DATABASE_URL is not set; the store-territory list is derived from ' +
        'country_policy_registry and cannot be produced without it.',
    );
  }

  const db = createDatabase(databaseUrl);
  const rows = await db
    .select({
      countryCode: countryPolicyRegistry.countryCode,
      launchStatus: countryPolicyRegistry.launchStatus,
    })
    .from(countryPolicyRegistry);

  return renderStoreTerritories(deriveStoreTerritories(rows));
}

// Entry guard: importing this module (tests, other scripts) must not run it.
if (require.main === module) {
  generateStoreTerritories()
    .then((output) => {
      process.stdout.write(output);
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
