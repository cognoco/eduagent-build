// ---------------------------------------------------------------------------
// Observer payload schemas — shared contract between the Inngest event
// senders (apps/api routes / services) and the observer terminus functions
// (apps/api/src/inngest/functions/*-observe.ts).
//
// Each schema mirrors the runtime shape that the observer function validates
// with `safeParse` before logging / acting on the payload. Extracting these
// to `@eduagent/schemas` keeps the contract centralized (AGENTS.md rule:
// "@eduagent/schemas is the shared contract; do not redefine API-facing
// types locally") and lets future senders import the same schema for
// build-time validation.
// ---------------------------------------------------------------------------

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Email bounced/complained observability — events emitted by the Resend
// webhook handler (apps/api/src/routes/resend-webhook.ts) and consumed by
// email-bounced-observe.ts. [AUDIT-INNGEST-1 / PR-17-P1 / SEC-6 / BUG-722]
//
// The `to` field is pre-masked by the sender; payload carries no raw PII.
// ---------------------------------------------------------------------------

export const emailBouncedEventSchema = z.object({
  // [WI-989] `type` and `to` are required — a bounce/complaint event without these
  // fields cannot be meaningfully processed and should be rejected at the schema boundary.
  type: z.enum(['email.bounced', 'email.complained']),
  to: z.string(),
  emailId: z.string().nullable().optional(),
  timestamp: z.string().optional(),
});
export type EmailBouncedEvent = z.infer<typeof emailBouncedEventSchema>;
