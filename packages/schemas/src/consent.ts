import { z } from 'zod';

export const consentTypeSchema = z.enum(['GDPR', 'COPPA']);
export type ConsentType = z.infer<typeof consentTypeSchema>;

export const consentStatusSchema = z.enum([
  'PENDING',
  'PARENTAL_CONSENT_REQUESTED',
  'CONSENTED',
  'WITHDRAWN',
]);
export type ConsentStatus = z.infer<typeof consentStatusSchema>;

export const consentRequestSchema = z.object({
  childProfileId: z.string().uuid(),
  parentEmail: z.string().email(),
  consentType: consentTypeSchema,
});

export type ConsentRequest = z.infer<typeof consentRequestSchema>;

export const consentResponseSchema = z.object({
  token: z.string(),
  approved: z.boolean(),
});

export type ConsentResponse = z.infer<typeof consentResponseSchema>;
