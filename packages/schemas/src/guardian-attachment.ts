import { z } from 'zod';

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
