import type { CountryPolicyRecord } from '@eduagent/schemas';
import { resolveCountryPolicy } from './country-policy';

const EEA_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IS',
  'IE',
  'IT',
  'LV',
  'LI',
  'LT',
  'LU',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
] as const;

const THRESHOLDS: Record<(typeof EEA_COUNTRIES)[number], 13 | 14 | 15 | 16> = {
  AT: 14,
  BE: 13,
  BG: 14,
  HR: 16,
  CY: 14,
  CZ: 15,
  DK: 15,
  EE: 13,
  FI: 13,
  FR: 15,
  DE: 16,
  GR: 15,
  HU: 16,
  IS: 13,
  IE: 16,
  IT: 14,
  LV: 13,
  LI: 16,
  LT: 14,
  LU: 16,
  MT: 13,
  NL: 16,
  NO: 13,
  PL: 16,
  PT: 13,
  RO: 16,
  SK: 16,
  SI: 15,
  ES: 14,
  SE: 13,
};

const allControllerGatesClosed = {
  externalPrivacyLegalReview: true,
  aiActClassification: true,
  reliableAgeAndResidence: true,
  childTransparency: true,
  adultCommercialRelationship: true,
  countryAllowlist: true,
  operationalRightsAndIncidents: true,
  launchDayLegalRefresh: true,
} as const;

function policy(
  countryCode: string,
  threshold: 13 | 14 | 15 | 16,
  patch: Partial<CountryPolicyRecord> = {},
): CountryPolicyRecord {
  return {
    countryCode,
    countryName: countryCode,
    regimeKey: `EU_GDPR_${threshold}`,
    article8Threshold: threshold,
    authorizationForm:
      countryCode === 'FR' ? 'joint_child_guardian' : 'guardian',
    launchStatus: threshold === 13 ? 'enabled' : 'blocked',
    launchBlockReason:
      threshold === 13 ? null : 'Guardian authorization is not enabled',
    legalVerificationStatus: 'verified',
    legalReviewedAt: new Date('2026-07-24T00:00:00Z'),
    legalReviewValidUntil: new Date('2026-07-31T23:59:59Z'),
    launchDayReviewRequired: countryCode === 'NO' || countryCode === 'PT',
    processingLocationClass: 'eea_only',
    policyVersion: '2026-07-24.1',
    effectiveAt: new Date('2026-07-24T00:00:00Z'),
    expiresAt: null,
    sourceProvenance: [
      {
        title: `${countryCode} primary law`,
        url: `https://example.test/${countryCode}`,
        checkedAt: new Date('2026-07-24T00:00:00Z'),
      },
    ],
    controllerGates:
      threshold === 13
        ? allControllerGatesClosed
        : {
            ...allControllerGatesClosed,
            countryAllowlist: false,
          },
    ...patch,
  };
}

const policies = [
  ...EEA_COUNTRIES.map((code) => policy(code, THRESHOLDS[code])),
  policy('GB', 13, {
    countryName: 'United Kingdom',
    regimeKey: 'UK_AADC',
    launchStatus: 'blocked',
    launchBlockReason: 'United Kingdom is explicitly outside the launch scope',
    processingLocationClass: 'blocked',
    controllerGates: {
      ...allControllerGatesClosed,
      countryAllowlist: false,
    },
  }),
];

const residenceAssurance = {
  method: 'self_report' as const,
  confidence: 0.8,
  assertedAt: new Date('2026-07-24T09:00:00Z'),
  corroboratingMethods: ['billing_address' as const],
};

describe('resolveCountryPolicy', () => {
  it.each(
    EEA_COUNTRIES.map((countryCode) => [countryCode, THRESHOLDS[countryCode]]),
  )(
    'resolves the configured threshold for %s without a country branch',
    (countryCode, threshold) => {
      const decision = resolveCountryPolicy({
        policies,
        habitualResidence: countryCode,
        birthDate: '2010-07-23',
        residenceAssurance,
        asOf: new Date('2026-07-24T12:00:00Z'),
      });

      expect(decision.article8Threshold).toBe(threshold);
      expect(decision.regimeKey).toBe(`EU_GDPR_${threshold}`);
    },
  );

  it.each(['BE', 'EE', 'FI', 'IS', 'LV', 'MT', 'NO', 'PT', 'SE'])(
    'allows a 13+ learner in enabled threshold-13 country %s after every gate closes',
    (countryCode) => {
      const decision = resolveCountryPolicy({
        policies,
        habitualResidence: countryCode,
        birthDate: '2013-07-23',
        residenceAssurance,
        asOf: new Date('2026-07-24T12:00:00Z'),
      });

      expect(decision.launchDecision).toBe('allowed');
      expect(decision.consentDecision?.ageBand).toBe('consent_capable_minor');
      expect(decision.authorizationForm).toBe('self');
      expect(decision.reasonCodes).toEqual([]);
    },
  );

  it('blocks the age below the universal 13+ product floor', () => {
    const decision = resolveCountryPolicy({
      policies,
      habitualResidence: 'BE',
      birthDate: '2014-07-25',
      residenceAssurance,
      asOf: new Date('2026-07-24T12:00:00Z'),
    });

    expect(decision.launchDecision).toBe('blocked');
    expect(decision.reasonCodes).toContain('BELOW_LAUNCH_MINIMUM_AGE');
  });

  it('keeps a higher-threshold country blocked until its guardian flow and launch gates are enabled', () => {
    const decision = resolveCountryPolicy({
      policies,
      habitualResidence: 'DE',
      birthDate: '2012-07-23',
      residenceAssurance,
      asOf: new Date('2026-07-24T12:00:00Z'),
    });

    expect(decision.launchDecision).toBe('blocked');
    expect(decision.article8Threshold).toBe(16);
    expect(decision.authorizationForm).toBe('guardian');
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining(['COUNTRY_BLOCKED', 'CONTROLLER_GATES_OPEN']),
    );
  });

  it('preserves France’s joint child and guardian authorization form', () => {
    const decision = resolveCountryPolicy({
      policies,
      habitualResidence: 'FR',
      birthDate: '2012-07-23',
      residenceAssurance,
      asOf: new Date('2026-07-24T12:00:00Z'),
    });

    expect(decision.authorizationForm).toBe('joint_child_guardian');
  });

  it('explicitly blocks the United Kingdom', () => {
    const decision = resolveCountryPolicy({
      policies,
      habitualResidence: 'GB',
      birthDate: '2000-01-01',
      residenceAssurance,
      asOf: new Date('2026-07-24T12:00:00Z'),
    });

    expect(decision.launchDecision).toBe('blocked');
    expect(decision.processingLocationClass).toBe('blocked');
    expect(decision.reasonCodes).toContain('COUNTRY_BLOCKED');
  });

  // [WI-2743 AC-7] The three legacy bucket values that rows written before ISO
  // collection still carry. Once residence_jurisdiction holds real country
  // codes these are the ONLY residual values, and every one of them must
  // produce a fail-closed DECISION rather than a throw — a throw at the
  // admission path would be an outage for pre-existing rows, not a refusal.
  // The reason code differs by shape and that is fine: 'EU' and 'ROW' are not
  // valid country codes at all ('EU' is a reserved non-country alpha-2, 'ROW'
  // is three letters), while 'US' is a real alpha-2 that simply has no registry
  // row in this fixture.
  it.each([
    ['missing residence', null, 'COUNTRY_UNKNOWN'],
    ['invalid residence', 'EU', 'COUNTRY_INVALID'],
    ['unsupported residence', 'CH', 'COUNTRY_UNSUPPORTED'],
    ['legacy bucket US', 'US', 'COUNTRY_UNSUPPORTED'],
    ['legacy bucket ROW', 'ROW', 'COUNTRY_INVALID'],
  ])('fails closed for %s', (_label, habitualResidence, reasonCode) => {
    const decision = resolveCountryPolicy({
      policies,
      habitualResidence,
      birthDate: '2000-01-01',
      residenceAssurance,
      asOf: new Date('2026-07-24T12:00:00Z'),
    });

    expect(decision.launchDecision).toBe('blocked');
    expect(decision.reasonCodes).toContain(reasonCode);
  });

  it('fails closed when residence has only a corroborating signal', () => {
    const decision = resolveCountryPolicy({
      policies,
      habitualResidence: 'NO',
      birthDate: '2000-01-01',
      residenceAssurance: {
        method: 'geo_ip',
        confidence: 1,
        assertedAt: new Date('2026-07-24T09:00:00Z'),
        corroboratingMethods: [],
      },
      asOf: new Date('2026-07-24T12:00:00Z'),
    });

    expect(decision.launchDecision).toBe('blocked');
    expect(decision.reasonCodes).toContain('RESIDENCE_ASSURANCE_INSUFFICIENT');
  });

  it('fails closed when the policy is not yet effective or has expired', () => {
    const notEffective = resolveCountryPolicy({
      policies: [
        policy('NO', 13, {
          effectiveAt: new Date('2026-07-25T00:00:00Z'),
        }),
      ],
      habitualResidence: 'NO',
      birthDate: '2000-01-01',
      residenceAssurance,
      asOf: new Date('2026-07-24T12:00:00Z'),
    });
    const expired = resolveCountryPolicy({
      policies: [
        policy('NO', 13, {
          expiresAt: new Date('2026-07-24T11:59:59Z'),
        }),
      ],
      habitualResidence: 'NO',
      birthDate: '2000-01-01',
      residenceAssurance,
      asOf: new Date('2026-07-24T12:00:00Z'),
    });

    expect(notEffective.reasonCodes).toContain('POLICY_NOT_EFFECTIVE');
    expect(expired.reasonCodes).toContain('POLICY_STALE');
  });

  it('requires a fresh launch-day legal review for Norway and Portugal', () => {
    const decision = resolveCountryPolicy({
      policies: [
        policy('NO', 13, {
          legalReviewValidUntil: new Date('2026-07-24T10:00:00Z'),
        }),
      ],
      habitualResidence: 'NO',
      birthDate: '2000-01-01',
      residenceAssurance,
      asOf: new Date('2026-07-24T12:00:00Z'),
    });

    expect(decision.launchDecision).toBe('blocked');
    expect(decision.legalRefreshRequired).toBe(true);
    expect(decision.reasonCodes).toContain('LEGAL_REVIEW_STALE');
  });

  it('enables a fast-follow country through an effective-dated update, with no code change', () => {
    // AC4: a country above the 13 threshold is blocked at launch and becomes
    // enabled later purely by inserting a newer effective-dated row once the
    // guardian flow and the remaining gates are approved.
    const enabledLater = [
      policy('DE', 16),
      policy('DE', 16, {
        launchStatus: 'enabled',
        launchBlockReason: null,
        controllerGates: allControllerGatesClosed,
        policyVersion: '2026-08-01.1',
        effectiveAt: new Date('2026-08-01T00:00:00Z'),
        legalReviewValidUntil: new Date('2026-12-31T00:00:00Z'),
      }),
    ];
    const asOf = new Date('2026-08-02T12:00:00Z');

    const atThreshold = resolveCountryPolicy({
      policies: enabledLater,
      habitualResidence: 'DE',
      birthDate: '2010-07-23',
      residenceAssurance,
      asOf,
    });
    expect(atThreshold.launchDecision).toBe('allowed');
    expect(atThreshold.reasonCodes).toEqual([]);
    expect(atThreshold.authorizationForm).toBe('self');
    expect(atThreshold.policyVersion).toBe('2026-08-01.1');

    // Launch eligibility and consent capacity are separate questions: the
    // country is open, and a learner below its threshold still needs a
    // guardian rather than being refused the country outright.
    const belowThreshold = resolveCountryPolicy({
      policies: enabledLater,
      habitualResidence: 'DE',
      birthDate: '2012-07-23',
      residenceAssurance,
      asOf,
    });
    expect(belowThreshold.launchDecision).toBe('allowed');
    expect(belowThreshold.authorizationForm).toBe('guardian');
    expect(belowThreshold.consentDecision?.ageBand).toBe(
      'guardian_required_minor',
    );
    expect(belowThreshold.consentDecision?.consentStatus).toBe(
      'REQUIRED_PENDING',
    );
  });

  it('treats the national threshold birthday as the boundary, to the day', () => {
    const enabledDe = [
      policy('DE', 16, {
        launchStatus: 'enabled',
        launchBlockReason: null,
        controllerGates: allControllerGatesClosed,
      }),
    ];
    const asOf = new Date('2026-07-24T12:00:00Z');

    const dayBefore = resolveCountryPolicy({
      policies: enabledDe,
      habitualResidence: 'DE',
      birthDate: '2010-07-25',
      residenceAssurance,
      asOf,
    });
    const onBirthday = resolveCountryPolicy({
      policies: enabledDe,
      habitualResidence: 'DE',
      birthDate: '2010-07-24',
      residenceAssurance,
      asOf,
    });

    expect(dayBefore.authorizationForm).toBe('guardian');
    expect(dayBefore.consentDecision?.ageBand).toBe('guardian_required_minor');
    expect(onBirthday.authorizationForm).toBe('self');
    expect(onBirthday.consentDecision?.ageBand).toBe('consent_capable_minor');
  });

  it.each([
    ['AT', 14, '2012-07-24', '2012-07-25'],
    ['CZ', 15, '2011-07-24', '2011-07-25'],
  ] as const)(
    'treats the %s threshold-%i birthday as the boundary, to the day',
    (countryCode, threshold, onBirthday, dayBefore) => {
      const enabled = [
        policy(countryCode, threshold, {
          launchStatus: 'enabled',
          launchBlockReason: null,
          controllerGates: allControllerGatesClosed,
        }),
      ];
      const asOf = new Date('2026-07-24T12:00:00Z');

      const stillBelow = resolveCountryPolicy({
        policies: enabled,
        habitualResidence: countryCode,
        birthDate: dayBefore,
        residenceAssurance,
        asOf,
      });
      const atThreshold = resolveCountryPolicy({
        policies: enabled,
        habitualResidence: countryCode,
        birthDate: onBirthday,
        residenceAssurance,
        asOf,
      });

      expect(stillBelow.authorizationForm).toBe('guardian');
      expect(stillBelow.consentDecision?.ageBand).toBe(
        'guardian_required_minor',
      );
      expect(atThreshold.authorizationForm).toBe('self');
      expect(atThreshold.consentDecision?.ageBand).toBe(
        'consent_capable_minor',
      );
    },
  );

  it('re-resolves a residence change against the new country’s row', () => {
    // AC9: the same learner, resolved before and after moving, must follow
    // the new habitual residence — the resolver is stateless, so a residence
    // change is simply a re-resolution and nothing from the old country leaks.
    const before = resolveCountryPolicy({
      policies,
      habitualResidence: 'BE',
      birthDate: '2010-07-23',
      residenceAssurance,
      asOf: new Date('2026-07-24T12:00:00Z'),
    });
    const after = resolveCountryPolicy({
      policies,
      habitualResidence: 'DE',
      birthDate: '2010-07-23',
      residenceAssurance,
      asOf: new Date('2026-07-24T12:00:00Z'),
    });

    expect(before.habitualResidence).toBe('BE');
    expect(before.launchDecision).toBe('allowed');
    expect(before.article8Threshold).toBe(13);
    expect(after.habitualResidence).toBe('DE');
    expect(after.launchDecision).toBe('blocked');
    expect(after.article8Threshold).toBe(16);
  });

  it('never lets a store-country corroborating signal replace habitual residence', () => {
    // AC6/AC9: a storefront-country signal that disagrees with the asserted
    // habitual residence may corroborate but never silently replace it — the
    // decision is keyed to the primary assertion whether or not the store
    // signal is present. (The assurance shape records which methods
    // corroborated, not the country each asserted; observability of the
    // mismatch itself is a consumer-side concern outside this boundary.)
    const withoutStoreSignal = resolveCountryPolicy({
      policies,
      habitualResidence: 'BE',
      birthDate: '2010-07-23',
      residenceAssurance: {
        method: 'self_report' as const,
        confidence: 0.8,
        assertedAt: new Date('2026-07-24T09:00:00Z'),
        corroboratingMethods: [],
      },
      asOf: new Date('2026-07-24T12:00:00Z'),
    });
    const withStoreSignal = resolveCountryPolicy({
      policies,
      habitualResidence: 'BE',
      birthDate: '2010-07-23',
      residenceAssurance: {
        method: 'self_report' as const,
        confidence: 0.8,
        assertedAt: new Date('2026-07-24T09:00:00Z'),
        corroboratingMethods: ['storefront_country' as const],
      },
      asOf: new Date('2026-07-24T12:00:00Z'),
    });

    expect(withStoreSignal.habitualResidence).toBe('BE');
    expect(withStoreSignal.regimeKey).toBe(withoutStoreSignal.regimeKey);
    expect(withStoreSignal.launchDecision).toBe(
      withoutStoreSignal.launchDecision,
    );
    expect(withStoreSignal.reasonCodes).toEqual(withoutStoreSignal.reasonCodes);
  });

  it('reports a stable eea_only processing-location class across policy versions', () => {
    const decision = resolveCountryPolicy({
      policies,
      habitualResidence: 'BE',
      birthDate: '2010-07-23',
      residenceAssurance,
      asOf: new Date('2026-07-24T12:00:00Z'),
    });
    const acrossVersions = resolveCountryPolicy({
      policies: [
        policy('NO', 13, {
          policyVersion: '2026-07-01.1',
          effectiveAt: new Date('2026-07-01T00:00:00Z'),
        }),
        policy('NO', 13, {
          policyVersion: '2026-07-24.2',
          effectiveAt: new Date('2026-07-24T00:00:00Z'),
        }),
      ],
      habitualResidence: 'NO',
      birthDate: '2000-01-01',
      residenceAssurance,
      asOf: new Date('2026-07-24T12:00:00Z'),
    });

    expect(decision.processingLocationClass).toBe('eea_only');
    expect(acrossVersions.processingLocationClass).toBe('eea_only');
    expect(acrossVersions.policyVersion).toBe('2026-07-24.2');
  });

  it('[WI-2850] resolves the seeded United States record through the registry, still blocked', () => {
    // AC4: a US record shaped like the 0161 seed row (blocked, unverified,
    // zero-length review window, threshold 13, launch-day review required)
    // must resolve THROUGH the registry — i.e. take the "row found but not
    // launch-ready" path, not the fail-closed COUNTRY_UNSUPPORTED path a
    // missing country would hit — and still decide blocked.
    const usPolicy = policy('US', 13, {
      countryName: 'United States',
      regimeKey: 'US_COPPA',
      launchStatus: 'blocked',
      launchBlockReason: 'launch_gates_pending',
      legalVerificationStatus: 'unverified',
      legalReviewedAt: new Date('2026-07-28T00:00:00Z'),
      legalReviewValidUntil: new Date('2026-07-28T00:00:00Z'),
      launchDayReviewRequired: true,
      controllerGates: {
        externalPrivacyLegalReview: false,
        aiActClassification: false,
        reliableAgeAndResidence: false,
        childTransparency: false,
        adultCommercialRelationship: false,
        countryAllowlist: false,
        operationalRightsAndIncidents: false,
        launchDayLegalRefresh: false,
      },
    });

    const decision = resolveCountryPolicy({
      policies: [usPolicy],
      habitualResidence: 'US',
      birthDate: '2010-07-23',
      residenceAssurance,
      asOf: new Date('2026-07-28T12:00:00Z'),
    });

    expect(decision.reasonCodes).not.toContain('COUNTRY_UNSUPPORTED');
    expect(decision.habitualResidence).toBe('US');
    expect(decision.regimeKey).toBe('US_COPPA');
    expect(decision.article8Threshold).toBe(13);
    expect(decision.launchDecision).toBe('blocked');
    expect(decision.legalRefreshRequired).toBe(true);
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining([
        'COUNTRY_BLOCKED',
        'CONTROLLER_GATES_OPEN',
        'LEGAL_VERIFICATION_UNVERIFIED',
        'LEGAL_REVIEW_STALE',
      ]),
    );
  });

  it('selects the newest active effective-dated policy row', () => {
    const decision = resolveCountryPolicy({
      policies: [
        policy('NO', 13, {
          policyVersion: '2026-07-01.1',
          effectiveAt: new Date('2026-07-01T00:00:00Z'),
        }),
        policy('NO', 13, {
          policyVersion: '2026-07-24.2',
          effectiveAt: new Date('2026-07-24T00:00:00Z'),
        }),
      ],
      habitualResidence: 'NO',
      birthDate: '2000-01-01',
      residenceAssurance,
      asOf: new Date('2026-07-24T12:00:00Z'),
    });

    expect(decision.policyVersion).toBe('2026-07-24.2');
    expect(decision.effectiveAt).toEqual(new Date('2026-07-24T00:00:00Z'));
  });
});
