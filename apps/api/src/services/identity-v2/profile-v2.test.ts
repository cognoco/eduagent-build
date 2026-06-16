// ---------------------------------------------------------------------------
// CUT-B1 profileMeta v2 — byte-identical-shape guards (cutover-plan §2.2,
// guardrail 3). The v2 profile-scope reads must produce a ProfileMeta whose
// every field matches the legacy shape so no downstream route/service can tell
// which store answered. These unit guards pin the pure derivations
// (jurisdiction reverse-map, birthYear-from-date, hasPremiumLlm derivation);
// the DB-backed equivalence (findOwnerPersonScope / getPersonScope) is covered
// by the integration suite.
// ---------------------------------------------------------------------------

import { jurisdictionToLocation, loadProfileRowByIdV2 } from './profile-v2';

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

// ---------------------------------------------------------------------------
// [WI-586] loadProfileRowByIdV2 — person/membership → profiles.$inferSelect
// shaping guard. Pins the field derivations that the legacy cached profile row
// consumers depend on, especially isOwner := membership.roles ∋ 'admin' (a
// prior cutover attempt mistakenly hard-coded isOwner=false). DB equivalence is
// covered by profile-v2.integration.test.ts; this guard stubs the select chain
// to pin the pure mapping without a live DB.
// ---------------------------------------------------------------------------
describe('[WI-586] loadProfileRowByIdV2 — person→profiles row shaping', () => {
  // Minimal chainable db.select(...).from().innerJoin().where().limit() stub.
  function stubDb(row: Record<string, unknown> | null) {
    const chain = {
      select: () => chain,
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(row ? [row] : []),
    };
    return chain as never;
  }

  const baseRow = {
    id: 'person-1',
    organizationId: 'org-1',
    displayName: 'Ada',
    avatarUrl: null,
    birthDate: '2000-05-01',
    residenceJurisdiction: 'US',
    conversationLanguage: 'en',
    pronouns: null,
    defaultAppContext: null,
    createdAt: new Date('2020-01-01T00:00:00Z'),
    updatedAt: new Date('2020-02-01T00:00:00Z'),
  };

  it('maps an admin membership to a byte-identical profiles row with isOwner=true', async () => {
    const out = await loadProfileRowByIdV2(
      stubDb({ ...baseRow, roles: ['admin'] }),
      'person-1',
    );
    expect(out).toEqual({
      id: 'person-1',
      accountId: 'org-1', // account.id = organization.id
      displayName: 'Ada',
      avatarUrl: null,
      birthYear: 2000, // year(birth_date)
      birthYearSetBy: null,
      location: 'US',
      isOwner: true, // roles ∋ 'admin'
      hasPremiumLlm: false, // derived (§1.3)
      defaultAppContext: null,
      conversationLanguage: 'en',
      pronouns: null,
      createdAt: baseRow.createdAt,
      updatedAt: baseRow.updatedAt,
      archivedAt: null, // read filters to live persons
    });
  });

  it('derives isOwner=false for a non-admin (charge) membership', async () => {
    const out = await loadProfileRowByIdV2(
      stubDb({ ...baseRow, roles: ['learner'] }),
      'person-1',
    );
    expect(out?.isOwner).toBe(false);
  });

  it('returns null when no live person row matches', async () => {
    const out = await loadProfileRowByIdV2(stubDb(null), 'missing');
    expect(out).toBeNull();
  });
});
