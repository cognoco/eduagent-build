// ---------------------------------------------------------------------------
// Resend webhook payload types
//
// Minimal shape validation for the Resend/Svix webhook (parity with the
// RevenueCat route's Zod gate). Only the fields the handlers actually read
// are asserted so a malformed payload — e.g. `data` missing entirely — is
// rejected at the boundary instead of throwing inside the handler.
// ---------------------------------------------------------------------------

import { z } from 'zod';

// Resend's `email.bounced` payload carries a `bounce` sub-object whose `type`
// distinguishes a HARD bounce (`Permanent`) from a SOFT/transient one
// (`Transient` / `Undetermined`). Only hard bounces are permanently dead and
// warrant suppression; transient ones may accept mail again later.
// https://resend.com/docs/dashboard/webhooks/event-types
export const resendBounceSchema = z
  .object({
    type: z.string().optional(),
    subType: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export const resendEmailEventDataSchema = z
  .object({
    email_id: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    subject: z.string().optional(),
    bounce: resendBounceSchema.optional(),
  })
  .passthrough();

/** True only for HARD (permanent) bounces — the suppression trigger. */
export function isHardBounce(data: ResendEmailEventData): boolean {
  return data.bounce?.type?.toLowerCase() === 'permanent';
}

export const resendWebhookPayloadSchema = z
  .object({
    type: z.string(),
    data: resendEmailEventDataSchema,
  })
  .passthrough();

export type ResendEmailEventData = z.infer<typeof resendEmailEventDataSchema>;
export type ResendWebhookPayload = z.infer<typeof resendWebhookPayloadSchema>;
