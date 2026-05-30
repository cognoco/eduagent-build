// ---------------------------------------------------------------------------
// Resend webhook payload types
//
// Minimal shape validation for the Resend/Svix webhook (parity with the
// RevenueCat route's Zod gate). Only the fields the handlers actually read
// are asserted so a malformed payload — e.g. `data` missing entirely — is
// rejected at the boundary instead of throwing inside the handler.
// ---------------------------------------------------------------------------

import { z } from 'zod';

export const resendEmailEventDataSchema = z
  .object({
    email_id: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    subject: z.string().optional(),
  })
  .passthrough();

export const resendWebhookPayloadSchema = z
  .object({
    type: z.string(),
    data: resendEmailEventDataSchema,
  })
  .passthrough();

export type ResendEmailEventData = z.infer<typeof resendEmailEventDataSchema>;
export type ResendWebhookPayload = z.infer<typeof resendWebhookPayloadSchema>;
