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
  consentType: consentTypeSchema.default('GDPR'),
});

export type ConsentRequest = z.infer<typeof consentRequestSchema>;

export const consentResponseSchema = z.object({
  token: z.string(),
  approved: z.boolean(),
});

export type ConsentResponse = z.infer<typeof consentResponseSchema>;

// Consent request result — response after submitting a consent request

export const consentRequestResultSchema = z.object({
  message: z.string(),
  consentType: consentTypeSchema,
  emailStatus: z.enum(['sent', 'failed']),
});
export type ConsentRequestResult = z.infer<typeof consentRequestResultSchema>;

// Response after a parent processes a consent token (approve/deny)
export const consentRespondResultSchema = z.object({
  message: z.string(),
});
export type ConsentRespondResult = z.infer<typeof consentRespondResultSchema>;

// Response for GET /consent/my-status (child profile view)
export const myConsentStatusSchema = z.object({
  consentStatus: consentStatusSchema.nullable(),
  parentEmail: z.string().nullable(),
  consentType: consentTypeSchema.nullable(),
});
export type MyConsentStatus = z.infer<typeof myConsentStatusSchema>;

// Response for GET /consent/:childProfileId/status (parent view)
export const childConsentStatusSchema = z.object({
  consentStatus: consentStatusSchema.nullable(),
  respondedAt: z.string().datetime().nullable(),
  consentType: consentTypeSchema.nullable(),
});
export type ChildConsentStatus = z.infer<typeof childConsentStatusSchema>;

// Response for PUT /consent/:childProfileId/revoke and /restore
export const consentActionResultSchema = z.object({
  message: z.string(),
  consentStatus: consentStatusSchema,
});
export type ConsentActionResult = z.infer<typeof consentActionResultSchema>;
