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
// function), so the contract lives here — the service and the accountability
// route share ONE definition instead of drifting.
export interface ConsentAccountabilityRecord {
  purpose: string;
  lawfulBasis: string;
  granted: boolean;
  /**
   * [WI-1193 AC1] The durable terms-acceptance moment, recorded as its own fact
   * (consent_grant.audit_fact.termsAcceptedAt) at signup — NOT a rename of
   * granted_at. Falls back to granted_at for grants written before the fact was
   * captured, so pre-existing rows still resolve.
   */
  termsAcceptedAt: Date;
  /**
   * [WI-1193 AC1] The consent-policy version accepted at that moment
   * (consent_grant.audit_fact.termsVersion). The versioned half of the
   * terms-acceptance fact MMT-ADR-0011 keeps separate from the lawful basis;
   * null for grants written before the version was captured.
   */
  termsVersion: string | null;
  withdrawnAt: Date | null;
}

// [WI-1193 AC3] Wire shape for the authenticated accountability report route
// (GET /consent/self/accountability) — the ISO-serialized form of
// ConsentAccountabilityRecord. Gives getConsentAccountabilityV2 a production
// caller and lets the DPO/data-subject retrieve the lawful basis + versioned
// terms-acceptance + accepted purposes + any withdrawal in one query.
export const consentAccountabilityRecordSchema = z.object({
  purpose: z.string(),
  lawfulBasis: z.string(),
  granted: z.boolean(),
  termsAcceptedAt: isoDateField,
  termsVersion: z.string().nullable(),
  withdrawnAt: isoDateField.nullable(),
});
export const consentAccountabilityReportSchema = z.object({
  records: z.array(consentAccountabilityRecordSchema),
});
export type ConsentAccountabilityReport = z.infer<
  typeof consentAccountabilityReportSchema
>;

// [WI-1193 AC2] Body for the authenticated adult self-consent purpose-withdrawal
// route (PUT /consent/self/withdraw). Each granular purpose is independently
// revocable: the caller withdraws exactly ONE of their OWN self-consent
// purposes, and withdrawing one never touches the other. The enum is the wire
// contract mirror of the service's ADULT_SELF_CONSENT_PURPOSES.
export const selfConsentWithdrawRequestSchema = z.object({
  purpose: z.enum(['platform_use', 'llm_disclosure']),
});
export type SelfConsentWithdrawRequest = z.infer<
  typeof selfConsentWithdrawRequestSchema
>;
