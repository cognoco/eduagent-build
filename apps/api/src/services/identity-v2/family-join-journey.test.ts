import type { CountryPolicyDecision } from '@eduagent/schemas';

import {
  decideFamilyJoinPosture,
  familyJoinEmailsMatch,
} from './family-join-journey';

function policy(
  overrides: Partial<CountryPolicyDecision> = {},
): CountryPolicyDecision {
  return {
    habitualResidence: 'DE',
    regimeKey: 'EU_GDPR_16',
    launchDecision: 'allowed',
    consentDecision: {
      ageBand: 'guardian_required_minor',
      consentStatus: 'REQUIRED_PENDING',
      assuranceLevel: 'VERIFIED',
      consentMethod: 'verified_credential',
      jurisdiction: 'DE',
      purposeScope: {
        core: true,
        thirdPartyShare: false,
        targetedAds: false,
        aiTraining: false,
      },
      retentionExpiresAt: null,
      receiptId: null,
    },
    processingLocationClass: 'eea_only',
    policyVersion: '2026-08-01.1',
    effectiveAt: new Date('2026-08-01T00:00:00.000Z'),
    reasonCodes: [],
    article8Threshold: 16,
    authorizationForm: 'guardian',
    legalRefreshRequired: false,
    ...overrides,
  };
}

describe('family-join journey posture [WI-2534]', () => {
  it('matches only the invited verified login email after harmless normalization', () => {
    expect(
      familyJoinEmailsMatch(' Learner@Example.COM ', 'learner@example.com'),
    ).toBe(true);
    expect(
      familyJoinEmailsMatch('forwarded@example.com', 'learner@example.com'),
    ).toBe(false);
  });

  it('holds a guardian-required learner without treating their preference as authorization', () => {
    expect(decideFamilyJoinPosture(policy(), 'accept')).toEqual({
      state: 'awaiting_guardian',
      jurisdiction: 'DE',
      policyVersion: '2026-08-01.1',
      authorizationForm: 'guardian',
      supportershipAuthority: 'guardian',
      supportershipDecision: null,
      learnerSupportershipPreference: 'accept',
    });
  });

  it('lets a consent-capable learner own the supportership decision', () => {
    const selfPolicy = policy({
      authorizationForm: 'self',
      consentDecision: {
        ...policy().consentDecision!,
        ageBand: 'consent_capable_minor',
        assuranceLevel: 'SELF_DECLARED',
        consentMethod: 'self_report',
      },
    });

    expect(decideFamilyJoinPosture(selfPolicy, 'decline')).toEqual({
      state: 'ready_to_join',
      jurisdiction: 'DE',
      policyVersion: '2026-08-01.1',
      authorizationForm: 'self',
      supportershipAuthority: 'learner',
      supportershipDecision: 'decline',
      learnerSupportershipPreference: 'decline',
    });
  });

  it('fails closed when launch or legal provenance is not current and complete', () => {
    expect(() =>
      decideFamilyJoinPosture(
        policy({ launchDecision: 'blocked', reasonCodes: ['POLICY_STALE'] }),
        'accept',
      ),
    ).toThrow('Family join is not currently available.');
    expect(() =>
      decideFamilyJoinPosture(policy({ policyVersion: null }), 'accept'),
    ).toThrow('Family join is not currently available.');
  });

  it('recomputes authority from the live policy instead of carrying guardian state forward', () => {
    const guardian = decideFamilyJoinPosture(policy(), 'accept');
    const afterBirthday = decideFamilyJoinPosture(
      policy({
        authorizationForm: 'self',
        consentDecision: {
          ...policy().consentDecision!,
          ageBand: 'consent_capable_minor',
          assuranceLevel: 'SELF_DECLARED',
          consentMethod: 'self_report',
        },
      }),
      'accept',
    );

    expect(guardian.supportershipAuthority).toBe('guardian');
    expect(afterBirthday.supportershipAuthority).toBe('learner');
    expect(afterBirthday.state).toBe('ready_to_join');
  });
});
