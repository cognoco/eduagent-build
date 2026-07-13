import { z } from 'zod';

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
