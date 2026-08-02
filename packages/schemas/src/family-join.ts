import { z } from 'zod';
import { authorizationFormSchema } from './country-policy.ts';
import { visibilityContractSchema } from './visibility-contract.ts';

// [WI-1753] Family-join request contracts — the cross-account existing-teen
// family join. Shared rather than route-local so mobile and API bind to ONE
// typed contract (AGENTS.md: "@eduagent/schemas is the shared contract. Do not
// redefine API-facing types locally.").

/**
 * Parent-issued invite. `.strict()` matters for anti-enumeration: the endpoint's
 * whole guarantee is that it never branches on whether the address belongs to a
 * real account, so a stray key that could smuggle in a hint is a validation
 * error rather than something the handler might come to depend on.
 */
export const familyJoinInviteRequestSchema = z
  .object({
    invitedEmail: z.string().email(),
  })
  .strict();

export type FamilyJoinInviteRequest = z.infer<
  typeof familyJoinInviteRequestSchema
>;

/**
 * Teen-side accept. `token` is the raw emailed token — it is re-matched against
 * the invite row (token equality + live expiry) at claim time, so possession of
 * a superseded or expired token cannot redeem.
 *
 * `optInSupportership` is the teen's explicit grant of parent visibility. It is
 * deliberately required, not defaulted: joining the family plan and letting a
 * parent see your learning are separate decisions, and a silent default would
 * make the more invasive one implicit.
 */
export const familyJoinAcceptRequestSchema = z
  .object({
    token: z.string().min(1),
    optInSupportership: z.boolean(),
  })
  .strict();

export type FamilyJoinAcceptRequest = z.infer<
  typeof familyJoinAcceptRequestSchema
>;

export const familyJoinAcceptResultSchema = z
  .object({
    familyOrgId: z.string().uuid(),
    alreadyMember: z.boolean(),
    storeCancelNudge: z
      .object({ originalAppUserId: z.string() })
      .strict()
      .nullable(),
    visibilityContract: visibilityContractSchema.nullable(),
  })
  .strict();

export type FamilyJoinAcceptResult = z.infer<
  typeof familyJoinAcceptResultSchema
>;

// WI-2534 — the durable family-join journey. The invite token locates a
// workflow; it never supplies an organization, Person, consent posture, or
// guardian authority. Those facts are always resolved server-side.

export const familyJoinSupportershipDecisionSchema = z.enum([
  'accept',
  'decline',
]);
export type FamilyJoinSupportershipDecision = z.infer<
  typeof familyJoinSupportershipDecisionSchema
>;

export const familyJoinSupportershipAuthoritySchema = z.enum([
  'learner',
  'guardian',
]);
export type FamilyJoinSupportershipAuthority = z.infer<
  typeof familyJoinSupportershipAuthoritySchema
>;

export const familyJoinJourneyRequestSchema = z
  .object({
    token: z.string().trim().min(1),
    familyMembershipDecision: z.literal('accept'),
    destinationProcessingAssent: z.literal(true),
    supportershipDecision: familyJoinSupportershipDecisionSchema,
  })
  .strict();
export type FamilyJoinJourneyRequest = z.infer<
  typeof familyJoinJourneyRequestSchema
>;

const familyJoinGuardianHoldingResultSchema = z
  .object({
    status: z.literal('awaiting_guardian'),
    familyOrgId: z.string().uuid(),
    authorizationForm: authorizationFormSchema.exclude(['self']),
    supportershipAuthority: z.literal('guardian'),
    supportershipDecision: z.literal('pending'),
    visibilityContract: z.null(),
  })
  .strict();

const familyJoinReadyResultSchema = z.discriminatedUnion(
  'supportershipAuthority',
  [
    z
      .object({
        status: z.literal('ready_to_join'),
        familyOrgId: z.string().uuid(),
        authorizationForm: z.literal('self'),
        supportershipAuthority: z.literal('learner'),
        supportershipDecision: familyJoinSupportershipDecisionSchema,
        visibilityContract: visibilityContractSchema.nullable(),
      })
      .strict(),
    z
      .object({
        status: z.literal('ready_to_join'),
        familyOrgId: z.string().uuid(),
        authorizationForm: authorizationFormSchema.exclude(['self']),
        supportershipAuthority: z.literal('guardian'),
        supportershipDecision: familyJoinSupportershipDecisionSchema,
        visibilityContract: visibilityContractSchema.nullable(),
      })
      .strict(),
  ],
);

const familyJoinJoinedResultSchema = z
  .object({
    status: z.literal('joined'),
    familyOrgId: z.string().uuid(),
    alreadyMember: z.boolean(),
    storeCancelNudge: z
      .object({ originalAppUserId: z.string() })
      .strict()
      .nullable(),
    supportershipAuthority: familyJoinSupportershipAuthoritySchema,
    supportershipDecision: familyJoinSupportershipDecisionSchema,
    visibilityContract: visibilityContractSchema.nullable(),
  })
  .strict();

const familyJoinTerminalResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('declined') }).strict(),
  z.object({ status: z.literal('withdrawn') }).strict(),
  z.object({ status: z.literal('expired') }).strict(),
]);

export const familyJoinJourneyResultSchema = z.union([
  familyJoinGuardianHoldingResultSchema,
  familyJoinReadyResultSchema,
  familyJoinJoinedResultSchema,
  familyJoinTerminalResultSchema,
]);
export type FamilyJoinJourneyResult = z.infer<
  typeof familyJoinJourneyResultSchema
>;

export const familyJoinGuardianInitiationRequestSchema = z
  .object({
    token: z.string().trim().min(1),
    verificationHandle: z.string().trim().min(16).max(4096),
  })
  .strict();
export type FamilyJoinGuardianInitiationRequest = z.infer<
  typeof familyJoinGuardianInitiationRequestSchema
>;

export const familyJoinGuardianCompletionRequestSchema = z
  .object({
    token: z.string().trim().min(1),
    authorityToken: z.string().min(1),
    authorizeSupportership: z.boolean(),
  })
  .strict();
export type FamilyJoinGuardianCompletionRequest = z.infer<
  typeof familyJoinGuardianCompletionRequestSchema
>;

export const familyJoinFinalizeRequestSchema = z
  .object({ token: z.string().trim().min(1) })
  .strict();
export type FamilyJoinFinalizeRequest = z.infer<
  typeof familyJoinFinalizeRequestSchema
>;

export const familyJoinDeclineRequestSchema = z
  .object({ token: z.string().trim().min(1) })
  .strict();
export type FamilyJoinDeclineRequest = z.infer<
  typeof familyJoinDeclineRequestSchema
>;

export const familyJoinWithdrawRequestSchema = z.object({}).strict();
export type FamilyJoinWithdrawRequest = z.infer<
  typeof familyJoinWithdrawRequestSchema
>;

export const familyJoinWithdrawParamsSchema = z
  .object({ inviteId: z.string().uuid() })
  .strict();
export type FamilyJoinWithdrawParams = z.infer<
  typeof familyJoinWithdrawParamsSchema
>;
