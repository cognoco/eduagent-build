import { z } from 'zod';

export const guardianQualificationSchema = z.enum([
  'biological_parent',
  'adoptive_parent',
  'stepparent',
  'grandparent',
  'court_appointed_guardian',
  'foster_parent',
  'kinship_caregiver',
  'sibling_with_custody',
  'other',
]);
export type GuardianQualification = z.infer<typeof guardianQualificationSchema>;

export const guardianAttachmentInitiationRequestSchema = z
  .object({
    chargePersonId: z.string().uuid(),
    /**
     * Opaque, single-use handle returned by the configured platform/VPC
     * provider. The server redeems it directly with that provider.
     */
    verificationHandle: z.string().trim().min(16).max(4096),
  })
  .strict();
export type GuardianAttachmentInitiationRequest = z.infer<
  typeof guardianAttachmentInitiationRequestSchema
>;

export const guardianAttachmentInitiationResultSchema = z.object({
  authorityToken: z.string().min(1),
});
export type GuardianAttachmentInitiationResult = z.infer<
  typeof guardianAttachmentInitiationResultSchema
>;

/**
 * Credentialed-learner guardian attachment. The authority token is opaque:
 * identity, adult-age, parental-responsibility, jurisdiction and policy facts
 * are signed server-side after VPC verification and are never caller-authored.
 */
export const guardianAttachmentRequestSchema = z
  .object({
    chargePersonId: z.string().uuid(),
    authorityToken: z.string().min(1),
  })
  .strict();
export type GuardianAttachmentRequest = z.infer<
  typeof guardianAttachmentRequestSchema
>;

export const guardianAttachmentResultSchema = z.object({
  status: z.enum(['attached', 'already_satisfied']),
  consentSatisfied: z.literal(true),
});
export type GuardianAttachmentResult = z.infer<
  typeof guardianAttachmentResultSchema
>;
