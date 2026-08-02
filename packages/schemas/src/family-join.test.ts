import * as FamilyJoin from './family-join.js';

type RuntimeSchema = {
  safeParse(value: unknown): { success: boolean };
};

function schema(name: string): RuntimeSchema {
  const candidate = (FamilyJoin as Record<string, unknown>)[name];
  expect(candidate).toBeDefined();
  expect(typeof (candidate as RuntimeSchema | undefined)?.safeParse).toBe(
    'function',
  );
  return candidate as RuntimeSchema;
}

const FAMILY_ORG_ID = '00000000-0000-4000-8000-000000000001';

describe('family-join resumable journey contracts [WI-2534]', () => {
  it('requires separate membership, processing-assent, and visibility decisions', () => {
    const contract = schema('familyJoinJourneyRequestSchema');

    expect(
      contract.safeParse({
        token: 'opaque-invite-code',
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'accept',
      }).success,
    ).toBe(true);
    expect(contract.safeParse({ token: 'opaque-invite-code' }).success).toBe(
      false,
    );
    expect(
      contract.safeParse({
        token: 'opaque-invite-code',
        familyMembershipDecision: 'accept',
        supportershipDecision: 'accept',
      }).success,
    ).toBe(false);
    expect(
      contract.safeParse({
        token: 'opaque-invite-code',
        familyMembershipDecision: 'accept',
        destinationProcessingAssent: true,
        supportershipDecision: 'accept',
        organizationId: FAMILY_ORG_ID,
      }).success,
    ).toBe(false);
  });

  it('models a guardian holding state without implying family membership or visibility', () => {
    const contract = schema('familyJoinJourneyResultSchema');

    expect(
      contract.safeParse({
        status: 'awaiting_guardian',
        familyOrgId: FAMILY_ORG_ID,
        authorizationForm: 'guardian',
        supportershipAuthority: 'guardian',
        supportershipDecision: 'pending',
        visibilityContract: null,
      }).success,
    ).toBe(true);
  });

  it('models guardian-ready and joined states as distinct outcomes', () => {
    const contract = schema('familyJoinJourneyResultSchema');

    expect(
      contract.safeParse({
        status: 'ready_to_join',
        familyOrgId: FAMILY_ORG_ID,
        authorizationForm: 'joint_child_guardian',
        supportershipAuthority: 'guardian',
        supportershipDecision: 'decline',
        visibilityContract: null,
      }).success,
    ).toBe(true);
    expect(
      contract.safeParse({
        status: 'ready_to_join',
        familyOrgId: FAMILY_ORG_ID,
        authorizationForm: 'self',
        supportershipAuthority: 'learner',
        supportershipDecision: 'accept',
        visibilityContract: null,
      }).success,
    ).toBe(true);
    expect(
      contract.safeParse({
        status: 'joined',
        familyOrgId: FAMILY_ORG_ID,
        alreadyMember: false,
        storeCancelNudge: null,
        supportershipAuthority: 'learner',
        supportershipDecision: 'decline',
        visibilityContract: null,
      }).success,
    ).toBe(true);
  });

  it.each(['declined', 'withdrawn', 'expired'] as const)(
    'models %s as a terminal non-authorizing result',
    (status) => {
      const contract = schema('familyJoinJourneyResultSchema');
      expect(contract.safeParse({ status }).success).toBe(true);
      expect(
        contract.safeParse({ status, visibilityContract: {} }).success,
      ).toBe(false);
    },
  );

  it('keeps guardian verification and visibility authorization explicit', () => {
    const initiation = schema('familyJoinGuardianInitiationRequestSchema');
    const completion = schema('familyJoinGuardianCompletionRequestSchema');

    expect(
      initiation.safeParse({
        token: 'opaque-invite-code',
        verificationHandle: 'provider-handle-at-least-16-characters',
      }).success,
    ).toBe(true);
    expect(
      initiation.safeParse({
        token: 'opaque-invite-code',
        verificationHandle: 'provider-handle-at-least-16-characters',
        authorizeSupportership: true,
      }).success,
    ).toBe(false);
    expect(
      completion.safeParse({
        token: 'opaque-invite-code',
        authorityToken: 'opaque-authority-token',
        authorizeSupportership: false,
      }).success,
    ).toBe(true);
    expect(
      completion.safeParse({
        token: 'opaque-invite-code',
        authorityToken: 'opaque-authority-token',
      }).success,
    ).toBe(false);
  });

  it('uses code-only strict contracts for finalization, learner decline, and inviter withdrawal', () => {
    const finalize = schema('familyJoinFinalizeRequestSchema');
    const decline = schema('familyJoinDeclineRequestSchema');
    const withdrawal = schema('familyJoinWithdrawRequestSchema');
    const withdrawalParams = schema('familyJoinWithdrawParamsSchema');

    expect(finalize.safeParse({ token: 'opaque-invite-code' }).success).toBe(
      true,
    );
    expect(
      finalize.safeParse({
        token: 'opaque-invite-code',
        organizationId: FAMILY_ORG_ID,
      }).success,
    ).toBe(false);
    expect(decline.safeParse({ token: 'opaque-invite-code' }).success).toBe(
      true,
    );
    expect(withdrawal.safeParse({}).success).toBe(true);
    expect(
      withdrawalParams.safeParse({ inviteId: FAMILY_ORG_ID }).success,
    ).toBe(true);
    expect(
      withdrawal.safeParse({ chargePersonId: FAMILY_ORG_ID }).success,
    ).toBe(false);
  });
});
