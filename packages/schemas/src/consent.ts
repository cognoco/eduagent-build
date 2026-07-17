import { z } from 'zod';
import { isoDateField } from './common.ts';

export const consentTypeSchema = z.enum(['GDPR', 'COPPA']);
export type ConsentType = z.infer<typeof consentTypeSchema>;

export const consentStatusSchema = z.enum([
  'PENDING',
  'PARENTAL_CONSENT_REQUESTED',
  'CONSENTED',
  'WITHDRAWN',
]);
export type ConsentStatus = z.infer<typeof consentStatusSchema>;

export const consentRequestSchema = z
  .object({
    childProfileId: z.string().uuid(),
    parentEmail: z.string().email(),
    consentType: consentTypeSchema.default('GDPR'),
  })
  .strict();

export type ConsentRequest = z.infer<typeof consentRequestSchema>;

// [WI-374] Resend is bound to the consent request, not a client-supplied
// recipient. The resend payload carries NO email — the server reuses the
// stored parentEmail — so a masked/arbitrary address can never be sent on
// resend. `.strict()` makes a stray `parentEmail` key a validation error.
export const consentResendSchema = z
  .object({
    childProfileId: z.string().uuid(),
    consentType: consentTypeSchema.default('GDPR'),
  })
  .strict();

export type ConsentResendRequest = z.infer<typeof consentResendSchema>;

export const consentRespondRequestSchema = z
  .object({
    token: z.string(),
    approved: z.boolean(),
  })
  .strict();

export type ConsentRespondRequest = z.infer<typeof consentRespondRequestSchema>;

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
  respondedAt: isoDateField.nullable(),
  consentType: consentTypeSchema.nullable(),
});
export type ChildConsentStatus = z.infer<typeof childConsentStatusSchema>;

// Response for PUT /consent/:childProfileId/revoke and /restore
export const consentActionResultSchema = z.object({
  message: z.string(),
  consentStatus: consentStatusSchema,
});
export type ConsentActionResult = z.infer<typeof consentActionResultSchema>;

// [WI-1193 AC3] One purpose's current consent state, as surfaced to the
// accountability report the api service's getConsentAccountabilityV2 returns
// (GDPR Art 5(2)/7(1)). Client-facing (returned by an exported service
// function), so the contract lives here — the service and the follow-up
// accountability route share ONE definition instead of drifting.
export interface ConsentAccountabilityRecord {
  purpose: string;
  lawfulBasis: string;
  granted: boolean;
  /** The moment consent (or terms acceptance, for `adult_self_consent`) was given. */
  termsAcceptedAt: Date;
  withdrawnAt: Date | null;
}
