// ---------------------------------------------------------------------------
// Observer payload schemas — shared contract between the Inngest event
// senders (apps/api routes / services) and the observer terminus functions
// (apps/api/src/inngest/functions/*-observe.ts).
//
// Each schema mirrors the runtime shape that the observer function validates
// with `safeParse` before logging / acting on the payload. Extracting these
// to `@eduagent/schemas` keeps the contract centralized (CLAUDE.md rule:
// "@eduagent/schemas is the shared contract; do not redefine API-facing
// types locally") and lets future senders import the same schema for
// build-time validation.
// ---------------------------------------------------------------------------

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Ask-gate observability — events emitted by the session depth-evaluation
// endpoint (apps/api/src/routes/sessions.ts) and consumed by
// ask-gate-observe.ts. [AUDIT-INNGEST-1 / PR-17-P1]
// ---------------------------------------------------------------------------

export const askGateDecisionEventSchema = z.object({
  sessionId: z.string().optional(),
  meaningful: z.boolean().optional(),
  reason: z.string().optional(),
  method: z.string().optional(),
  exchangeCount: z.number().optional(),
  learnerWordCount: z.number().optional(),
  topicCount: z.number().optional(),
});
export type AskGateDecisionEvent = z.infer<typeof askGateDecisionEventSchema>;

export const askGateTimeoutEventSchema = z.object({
  sessionId: z.string().optional(),
  exchangeCount: z.number().optional(),
});
export type AskGateTimeoutEvent = z.infer<typeof askGateTimeoutEventSchema>;

// ---------------------------------------------------------------------------
// Email bounced/complained observability — events emitted by the Resend
// webhook handler (apps/api/src/routes/resend-webhook.ts) and consumed by
// email-bounced-observe.ts. [AUDIT-INNGEST-1 / PR-17-P1 / SEC-6 / BUG-722]
//
// The `to` field is pre-masked by the sender; payload carries no raw PII.
// ---------------------------------------------------------------------------

export const emailBouncedEventSchema = z.object({
  type: z.enum(['email.bounced', 'email.complained']).optional(),
  to: z.string().optional(),
  emailId: z.string().nullable().optional(),
  timestamp: z.string().optional(),
});
export type EmailBouncedEvent = z.infer<typeof emailBouncedEventSchema>;
