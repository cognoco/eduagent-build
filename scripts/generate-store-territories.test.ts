// ---------------------------------------------------------------------------
// [WI-2746] Store-territory derivation guards.
//
// Both ruled HARD ERRORS are covered here, not only the happy path (AC-7). No
// database is involved: the derivation is pure, which is why these guards hold
// regardless of registry state.
// ---------------------------------------------------------------------------

import {
  STORE_TERRITORY_MAPPING,
  StoreTerritoryDerivationError,
  deriveStoreTerritories,
  renderStoreTerritories,
  type RegistryLaunchRow,
  type StoreTerritoryMapping,
} from './generate-store-territories';

const MAPPING: StoreTerritoryMapping = {
  DE: { appStoreConnect: 'DEU', googlePlay: 'DE' },
  FR: { appStoreConnect: 'FRA', googlePlay: 'FR' },
  US: { appStoreConnect: 'USA', googlePlay: 'US' },
};

const row = (countryCode: string, launchStatus: string): RegistryLaunchRow => ({
  countryCode,
  launchStatus,
});

describe('[WI-2746] deriveStoreTerritories — ruled hard errors', () => {
  // AC-2. This is the highest-consequence failure mode in the item: every
  // registry row reads launch_status='blocked' today, so a naive generator
  // emits an empty list, and an empty territory list DELISTS THE APP EVERYWHERE.
  it('throws on zero enabled countries rather than emitting an empty list', () => {
    const allBlocked = [row('DE', 'blocked'), row('US', 'blocked')];

    expect(() => deriveStoreTerritories(allBlocked, MAPPING)).toThrow(
      StoreTerritoryDerivationError,
    );
    expect(() => deriveStoreTerritories(allBlocked, MAPPING)).toThrow(
      /no country .* has launch_status=enabled/,
    );
  });

  it('throws on an empty registry, not just an all-blocked one', () => {
    expect(() => deriveStoreTerritories([], MAPPING)).toThrow(
      StoreTerritoryDerivationError,
    );
  });

  // AC-3. A silent drop would ship a list that looks complete while omitting a
  // country we decided to launch in.
  it('throws on an enabled country with no store mapping, naming it', () => {
    const rows = [row('DE', 'enabled'), row('NO', 'enabled')];

    expect(() => deriveStoreTerritories(rows, MAPPING)).toThrow(
      StoreTerritoryDerivationError,
    );
    expect(() => deriveStoreTerritories(rows, MAPPING)).toThrow(/NO/);
  });

  it('never silently drops the unmapped country from an otherwise valid list', () => {
    const rows = [row('DE', 'enabled'), row('NO', 'enabled')];

    // The failure mode being excluded: a 1-entry artifact for DE alone.
    expect(() => deriveStoreTerritories(rows, MAPPING)).toThrow();
  });

  // The shipped mapping is deliberately empty, so the generator can only
  // refuse — it can never emit a wrong territory list. This guard fails the
  // moment someone populates it, which is the intended prompt to also update
  // this expectation with the provenance of the data they added.
  it('ships an unpopulated mapping, so every enabled country is refused', () => {
    expect(Object.keys(STORE_TERRITORY_MAPPING)).toHaveLength(0);
    expect(() =>
      deriveStoreTerritories([row('DE', 'enabled')], STORE_TERRITORY_MAPPING),
    ).toThrow(/deliberately-unpopulated initial state/);
  });
});

describe('[WI-2746] deriveStoreTerritories — output contract', () => {
  const enabled = [
    row('US', 'enabled'),
    row('DE', 'enabled'),
    row('FR', 'blocked'),
  ];

  // AC-4.
  it('identifies which store each list targets, with store-native identifiers', () => {
    const artifact = deriveStoreTerritories(enabled, MAPPING);

    expect(artifact.countryCodes).toEqual(['DE', 'US']);
    expect(artifact.lists.map((l) => l.store)).toEqual([
      'app_store_connect',
      'google_play',
    ]);
    // The two stores do NOT share a vocabulary — that is the whole reason the
    // mapping layer is explicit rather than derived from the alpha-2 code.
    expect(artifact.lists[0]!.territories).toEqual(['DEU', 'USA']);
    expect(artifact.lists[1]!.territories).toEqual(['DE', 'US']);
  });

  it('excludes blocked countries', () => {
    expect(deriveStoreTerritories(enabled, MAPPING).countryCodes).not.toContain(
      'FR',
    );
  });

  // AC-5.
  it('is byte-identical across re-runs and insensitive to registry row order', () => {
    const shuffled = [
      row('FR', 'blocked'),
      row('DE', 'enabled'),
      row('US', 'enabled'),
    ];

    const first = renderStoreTerritories(
      deriveStoreTerritories(enabled, MAPPING),
    );
    const second = renderStoreTerritories(
      deriveStoreTerritories(shuffled, MAPPING),
    );

    expect(first).toBe(second);
    expect(first.endsWith('\n')).toBe(true);
  });

  it('deduplicates a country carrying several effective-dated registry rows', () => {
    const duplicated = [row('DE', 'enabled'), row('DE', 'enabled')];

    expect(deriveStoreTerritories(duplicated, MAPPING).countryCodes).toEqual([
      'DE',
    ]);
  });
});
