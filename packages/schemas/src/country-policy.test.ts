import {
  ageConsentDecisionSchema,
  countryPolicyDecisionSchema,
  countryPolicyRecordSchema,
  residenceAssuranceSchema,
} from './country-policy.js';

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

describe('country policy contracts', () => {
  it('accepts a complete effective-dated country policy record', () => {
    expect(
      countryPolicyRecordSchema.parse({
        countryCode: 'NO',
        countryName: 'Norway',
        regimeKey: 'EU_GDPR_13',
        article8Threshold: 13,
        authorizationForm: 'guardian',
        launchStatus: 'enabled',
        launchBlockReason: null,
        legalVerificationStatus: 'verified',
        legalReviewedAt: new Date('2026-07-24T00:00:00Z'),
        legalReviewValidUntil: new Date('2026-07-31T00:00:00Z'),
        launchDayReviewRequired: true,
        processingLocationClass: 'eea_only',
        policyVersion: '2026-07-24.1',
        effectiveAt: new Date('2026-07-24T00:00:00Z'),
        expiresAt: null,
        sourceProvenance: [
          {
            title: 'Personal Data Act §5',
            url: 'https://lovdata.no/dokument/NLE/lov/2018-06-15-38/%C2%A75',
            checkedAt: new Date('2026-07-24T00:00:00Z'),
          },
        ],
        controllerGates: allControllerGatesClosed,
      }),
    ).toMatchObject({
      countryCode: 'NO',
      article8Threshold: 13,
      launchStatus: 'enabled',
    });
  });

  it.each([
    ['lowercase country code', { countryCode: 'no' }],
    ['out-of-range threshold', { article8Threshold: 12 }],
    [
      'enabled but unverified',
      {
        launchStatus: 'enabled',
        legalVerificationStatus: 'unverified',
      },
    ],
    [
      'enabled with an open controller gate',
      {
        launchStatus: 'enabled',
        controllerGates: {
          ...allControllerGatesClosed,
          operationalRightsAndIncidents: false,
        },
      },
    ],
  ])('rejects %s', (_label, patch) => {
    const candidate = {
      countryCode: 'NO',
      countryName: 'Norway',
      regimeKey: 'EU_GDPR_13',
      article8Threshold: 13,
      authorizationForm: 'guardian',
      launchStatus: 'enabled',
      launchBlockReason: null,
      legalVerificationStatus: 'verified',
      legalReviewedAt: new Date('2026-07-24T00:00:00Z'),
      legalReviewValidUntil: new Date('2026-07-31T00:00:00Z'),
      launchDayReviewRequired: true,
      processingLocationClass: 'eea_only',
      policyVersion: '2026-07-24.1',
      effectiveAt: new Date('2026-07-24T00:00:00Z'),
      expiresAt: null,
      sourceProvenance: [
        {
          title: 'Personal Data Act §5',
          url: 'https://lovdata.no/dokument/NLE/lov/2018-06-15-38/%C2%A75',
          checkedAt: new Date('2026-07-24T00:00:00Z'),
        },
      ],
      controllerGates: allControllerGatesClosed,
      ...patch,
    };

    expect(countryPolicyRecordSchema.safeParse(candidate).success).toBe(false);
  });

  it('accepts only authoritative residence evidence as the primary assertion', () => {
    expect(
      residenceAssuranceSchema.parse({
        method: 'self_report',
        confidence: 0.8,
        assertedAt: new Date('2026-07-24T00:00:00Z'),
        corroboratingMethods: ['billing_address', 'storefront_country'],
      }),
    ).toMatchObject({ method: 'self_report' });

    expect(
      residenceAssuranceSchema.safeParse({
        method: 'geo_ip',
        confidence: 1,
        assertedAt: new Date('2026-07-24T00:00:00Z'),
        corroboratingMethods: [],
      }).success,
    ).toBe(false);
  });

  it('locks the AgeConsentDecision interface and resolved policy envelope', () => {
    const consentDecision = ageConsentDecisionSchema.parse({
      ageBand: 'consent_capable_minor',
      consentStatus: 'REQUIRED_PENDING',
      assuranceLevel: 'SELF_DECLARED',
      consentMethod: 'self_report',
      jurisdiction: 'NO',
      purposeScope: {
        core: true,
        thirdPartyShare: false,
        targetedAds: false,
        aiTraining: false,
      },
      retentionExpiresAt: null,
      receiptId: null,
    });

    expect(
      countryPolicyDecisionSchema.parse({
        habitualResidence: 'NO',
        regimeKey: 'EU_GDPR_13',
        launchDecision: 'allowed',
        consentDecision,
        processingLocationClass: 'eea_only',
        policyVersion: '2026-07-24.1',
        effectiveAt: new Date('2026-07-24T00:00:00Z'),
        reasonCodes: [],
        article8Threshold: 13,
        authorizationForm: 'self',
        legalRefreshRequired: false,
      }),
    ).toMatchObject({
      habitualResidence: 'NO',
      launchDecision: 'allowed',
    });
  });
});
