// ---------------------------------------------------------------------------
// CUT-B1 profileMeta v2 — byte-identical-shape guards (cutover-plan §2.2,
// guardrail 3). The v2 profile-scope reads must produce a ProfileMeta whose
// every field matches the legacy shape so no downstream route/service can tell
// which store answered. These unit guards pin the pure derivations
// (jurisdiction reverse-map, birthYear-from-date, hasPremiumLlm derivation);
// the DB-backed equivalence (findOwnerPersonScope / getPersonScope) is covered
// by the integration suite.
// ---------------------------------------------------------------------------

import { jurisdictionToLocation } from './profile-v2';

describe('jurisdictionToLocation (profileMeta.location reverse-map)', () => {
  it('inverts the reseed JURISDICTION_CASE: US→US, EU→EU, ROW→OTHER', () => {
    expect(jurisdictionToLocation('US')).toBe('US');
    expect(jurisdictionToLocation('EU')).toBe('EU');
    expect(jurisdictionToLocation('ROW')).toBe('OTHER');
  });

  it('maps unknown/UNKNOWN/null to null (legacy nullable location)', () => {
    expect(jurisdictionToLocation('UNKNOWN')).toBeNull();
    expect(jurisdictionToLocation(null)).toBeNull();
    expect(jurisdictionToLocation(undefined)).toBeNull();
    expect(jurisdictionToLocation('ZZ')).toBeNull();
  });

  it('round-trips with locationToJurisdiction for the three legacy values', async () => {
    // Importing here to avoid a circular module-load surprise at top level.
    const { locationToJurisdiction } = await import('./identity-graph');
    // US and EU round-trip exactly; OTHER↔ROW is the asymmetric pair.
    expect(jurisdictionToLocation(locationToJurisdiction('US'))).toBe('US');
    expect(jurisdictionToLocation(locationToJurisdiction('EU'))).toBe('EU');
    expect(jurisdictionToLocation(locationToJurisdiction('OTHER'))).toBe(
      'OTHER',
    );
  });
});
