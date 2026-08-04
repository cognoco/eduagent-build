// ---------------------------------------------------------------------------
// CUT-B1 profileMeta v2 — byte-identical-shape guards (cutover-plan §2.2,
// guardrail 3). The v2 profile-scope reads must produce a ProfileMeta whose
// every field matches the legacy shape so no downstream route/service can tell
// which store answered. These unit guards pin the pure derivations
// (jurisdiction reverse-map, birthYear-from-date, hasPremiumLlm derivation);
// the DB-backed equivalence (findOwnerPersonScope / getPersonScope) is covered
// by the integration suite.
// ---------------------------------------------------------------------------

import {
  jurisdictionToLocation,
  listProfilesV2,
  loadProfileRowByIdV2,
} from './profile-v2';

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

  // [WI-2750] The deliberate `null` fallback, pinned for the values that make
  // the former export-v2 copy's 'OTHER' divergence LIVE rather than latent: a
  // real ISO 3166-1 alpha-2 code, which WI-2743 starts persisting into
  // residence_jurisdiction. 'OTHER' here would be an affirmative false claim
  // about the data subject in their Article 15 export. The export surface now
  // calls THIS function (export-v2.ts imports it), so the two surfaces cannot
  // answer differently; the surface-level assertion lives in
  // export-v2.integration.test.ts.
  it('maps a real ISO alpha-2 residence code to null, not the OTHER bucket [WI-2750]', () => {
    expect(jurisdictionToLocation('DE')).toBeNull();
    expect(jurisdictionToLocation('PL')).toBeNull();
    expect(jurisdictionToLocation('GB')).toBeNull();
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
      birthMonth: 5,
      birthDay: 1,
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

  it('maps the year-only YYYY-01-01 sentinel to null birth month/day', async () => {
    const out = await loadProfileRowByIdV2(
      stubDb({
        ...baseRow,
        birthDate: '2000-01-01',
        roles: ['learner'],
      }),
      'person-1',
    );
    expect(out).toMatchObject({
      birthYear: 2000,
      birthMonth: null,
      birthDay: null,
    });
  });

  it('returns null when no live person row matches', async () => {
    const out = await loadProfileRowByIdV2(stubDb(null), 'missing');
    expect(out).toBeNull();
  });
});

describe('[WI-1556] listProfilesV2 — first-Mentor language launch hints', () => {
  const personId = '550e8400-e29b-41d4-a716-446655440000';
  const organizationId = '660e8400-e29b-41d4-a716-446655440000';
  const row = {
    id: personId,
    displayName: 'Ada',
    avatarUrl: null,
    birthDate: '2000-05-01',
    residenceJurisdiction: 'EU',
    conversationLanguage: 'cs',
    conversationLanguageConfirmedAt: null,
    pronouns: null,
    defaultAppContext: null,
    createdAt: new Date('2026-07-30T10:00:00Z'),
    updatedAt: new Date('2026-07-30T10:00:00Z'),
    roles: ['learner'],
  };

  function listDb() {
    return {
      select: jest.fn((projection: Record<string, unknown>) => {
        const rows =
          'displayName' in projection
            ? [row]
            : 'personId' in projection
              ? [{ personId }]
              : [];
        const chain = {
          from: () => chain,
          innerJoin: () => chain,
          where: () => chain,
          limit: () => Promise.resolve(rows),
          then: (resolve: (value: unknown[]) => void) => resolve(rows),
        };
        return chain;
      }),
      query: {
        guardianship: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      },
    } as never;
  }

  it('marks only the server-resolved caller as current and preserves unconfirmed state', async () => {
    const [profile] = await listProfilesV2(listDb(), organizationId, personId);

    expect(profile).toMatchObject({
      id: personId,
      conversationLanguage: 'cs',
      conversationLanguageConfirmed: false,
      isCurrentUser: true,
    });
  });

  it('does not enumerate a sibling target as the authenticated caller', async () => {
    const profiles = await listProfilesV2(
      listDb(),
      organizationId,
      '770e8400-e29b-41d4-a716-446655440000',
    );

    expect(profiles).toEqual([]);
  });
});
