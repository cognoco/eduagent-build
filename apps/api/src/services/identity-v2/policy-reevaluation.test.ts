import type {
  ConsentAgeBand,
  ConsentRequirementStatus,
  CountryPolicyDecision,
  LaunchDecision,
} from '@eduagent/schemas';
import {
  classifyPolicyChange,
  mayApplyAutomatically,
} from './policy-reevaluation';

// ---------------------------------------------------------------------------
// Builders. A RESOLVED decision by default, so each test states only the axis
// it is about.
// ---------------------------------------------------------------------------

// Deliberately NOT `as CountryPolicyDecision`. The cast this replaced hid four
// wrong enum literals: jest passed on it and `tsc` did not. An assertion tells
// the compiler to stop checking exactly where a fixture is most likely wrong.
function decision(overrides?: {
  band?: ConsentAgeBand;
  status?: ConsentRequirementStatus;
  launch?: LaunchDecision;
}): CountryPolicyDecision {
  return {
    habitualResidence: 'DE',
    regimeKey: 'eu-gdpr',
    launchDecision: overrides?.launch ?? 'allowed',
    consentDecision: {
      ageBand: overrides?.band ?? 'guardian_required_minor',
      consentStatus: overrides?.status ?? 'REQUIRED_PENDING',
      assuranceLevel: 'SELF_DECLARED',
      consentMethod: 'self_report',
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
    policyVersion: 'v1',
    effectiveAt: new Date('2026-01-01T00:00:00Z'),
    reasonCodes: [],
    article8Threshold: 16,
    authorizationForm: 'guardian',
    legalRefreshRequired: false,
  };
}

/** The shape every person holds today, before an ISO residence is collected. */
function unresolved(): CountryPolicyDecision {
  return {
    ...decision(),
    habitualResidence: null,
    regimeKey: null,
    consentDecision: null,
    processingLocationClass: null,
    policyVersion: null,
    launchDecision: 'blocked',
    reasonCodes: ['COUNTRY_UNSUPPORTED'],
  };
}

describe('[WI-2745] classifyPolicyChange', () => {
  it('reports no change when nothing moved', () => {
    expect(classifyPolicyChange(decision(), decision())).toBe('unchanged');
  });

  describe('relaxations — may be applied automatically', () => {
    it('ageing up a consent band is a relaxation', () => {
      expect(
        classifyPolicyChange(
          decision({ band: 'guardian_required_minor' }),
          decision({ band: 'adult' }),
        ),
      ).toBe('relaxation');
    });

    it('consent ceasing to be required is a relaxation', () => {
      expect(
        classifyPolicyChange(
          decision({ status: 'REQUIRED_PENDING' }),
          decision({ status: 'NOT_REQUIRED' }),
        ),
      ).toBe('relaxation');
    });

    it('launch opening is a relaxation', () => {
      expect(
        classifyPolicyChange(
          decision({ launch: 'blocked' }),
          decision({ launch: 'allowed' }),
        ),
      ).toBe('relaxation');
    });
  });

  describe('[BREAK] restrictions — must NEVER be applied automatically', () => {
    // These are the cases AGENTS.md classes as safety-critical: each one, if
    // auto-applied, revokes access a live user currently has.

    it('[BREAK] withdrawing launch is a restriction, never a relaxation', () => {
      const kind = classifyPolicyChange(
        decision({ launch: 'allowed' }),
        decision({ launch: 'blocked' }),
      );
      expect(kind).toBe('restriction');
      expect(mayApplyAutomatically(kind)).toBe(false);
    });

    it('[BREAK] lowering the consent band is a restriction', () => {
      const kind = classifyPolicyChange(
        decision({ band: 'adult' }),
        decision({ band: 'guardian_required_minor' }),
      );
      expect(kind).toBe('restriction');
      expect(mayApplyAutomatically(kind)).toBe(false);
    });

    it('[BREAK] newly requiring consent is a restriction', () => {
      const kind = classifyPolicyChange(
        decision({ status: 'NOT_REQUIRED' }),
        decision({ status: 'REQUIRED_PENDING' }),
      );
      expect(kind).toBe('restriction');
      expect(mayApplyAutomatically(kind)).toBe(false);
    });

    it('[BREAK] a MIXED decision that both relaxes and restricts is a RESTRICTION', () => {
      // The dangerous case, and the reason the restriction branch is evaluated
      // first: someone ages into `adult` (a relaxation) in the same
      // re-resolution that blocks their country (a restriction). Read
      // relaxation-first, this auto-applies a revocation while looking like a
      // birthday. The consequence that matters to a live user is the block.
      const kind = classifyPolicyChange(
        decision({ band: 'guardian_required_minor', launch: 'allowed' }),
        decision({ band: 'adult', launch: 'blocked' }),
      );
      expect(kind).toBe('restriction');
      expect(mayApplyAutomatically(kind)).toBe(false);
    });
  });

  describe('unresolvable decisions never revoke', () => {
    it('[BREAK] a decision that becomes UNRESOLVABLE is not a restriction', () => {
      // A retired registry row or an unconfigured country is an operational
      // gap, not a policy act. Classing it as a restriction would let
      // infrastructure state raise revocation alarms about real people.
      expect(classifyPolicyChange(decision(), unresolved())).toBe('unchanged');
    });

    it('an unresolved population produces NO changes — today, that is everyone', () => {
      // Every person currently holds a legacy residence bucket, which fails
      // closed. This is what makes the first production run a no-op rather
      // than a mass event storm, and it is asserted rather than assumed.
      expect(classifyPolicyChange(unresolved(), unresolved())).toBe(
        'unchanged',
      );
    });

    it('becoming resolvable AND allowed is a relaxation', () => {
      expect(
        classifyPolicyChange(unresolved(), decision({ launch: 'allowed' })),
      ).toBe('relaxation');
    });

    it('becoming resolvable but still blocked has gained nothing', () => {
      expect(
        classifyPolicyChange(unresolved(), decision({ launch: 'blocked' })),
      ).toBe('unchanged');
    });
  });

  describe('mayApplyAutomatically', () => {
    it('permits only relaxations', () => {
      expect(mayApplyAutomatically('relaxation')).toBe(true);
      expect(mayApplyAutomatically('restriction')).toBe(false);
      expect(mayApplyAutomatically('unchanged')).toBe(false);
    });
  });
});
