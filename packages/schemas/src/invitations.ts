import { z } from 'zod';

import { isoDateField } from './common.ts';

export const membershipRoleSchema = z.enum(['owner', 'mentor', 'student']);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const invitationCreateSchema = z
  .object({
    invitedRoles: z.array(membershipRoleSchema).min(1),
    email: z.email().optional(),
  })
  .strict();
export type InvitationCreateInput = z.infer<typeof invitationCreateSchema>;

export const invitationAcceptSchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();
export type InvitationAcceptInput = z.infer<typeof invitationAcceptSchema>;

export const invitationClaimCreateSchema = z
  .object({
    targetProfileId: z.string().uuid(),
    email: z.email().optional(),
  })
  .strict();
export type InvitationClaimCreateInput = z.infer<
  typeof invitationClaimCreateSchema
>;

export const invitationKindSchema = z.enum(['invite', 'claim']);
export type InvitationKind = z.infer<typeof invitationKindSchema>;

export const invitationStatusSchema = z.enum([
  'pending',
  'accepted',
  'revoked',
  'expired',
]);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

export const publicInvitationSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  kind: invitationKindSchema,
  invitedRoles: z.array(membershipRoleSchema).min(1),
  targetProfileId: z.string().uuid().nullable(),
  emailHint: z.string().nullable(),
  status: invitationStatusSchema,
  expiresAt: isoDateField,
  createdAt: isoDateField,
});
export type PublicInvitation = z.infer<typeof publicInvitationSchema>;

export const invitationTokenResponseSchema = z.object({
  invitation: publicInvitationSchema,
  token: z.string().min(1),
});
export type InvitationTokenResponse = z.infer<
  typeof invitationTokenResponseSchema
>;

export const invitationAcceptResponseSchema = z.object({
  membershipId: z.string().uuid(),
  organizationId: z.string().uuid(),
});
export type InvitationAcceptResponse = z.infer<
  typeof invitationAcceptResponseSchema
>;

export const invitationRedeemResponseSchema = z.object({
  graduatedProfileId: z.string().uuid(),
});
export type InvitationRedeemResponse = z.infer<
  typeof invitationRedeemResponseSchema
>;
