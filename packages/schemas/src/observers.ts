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
// Ask-gate observability — events emitted by the session depth-evaluation
// endpoint (apps/api/src/routes/sessions.ts) and consumed by
// ask-gate-observe.ts. [AUDIT-INNGEST-1 / PR-17-P1]
//
// [CR-2026-05-21-175 / BUG-580] These payloads previously had every field
// optional, so a misconfigured caller could dispatch an empty event and the
// observer would happily log 'unknown' for every dimension — defeating the
// purpose of the observe terminus. The sender in
// apps/api/src/routes/sessions.ts:564-594 ALWAYS supplies all fields below
// (every field is derived inline from `result` / `transcript`, none are
// conditionally undefined), so requiring them here is the correct contract.
// The observer keeps its safeParse → schema_drift logger.error path
// (ask-gate-observe.ts:75-87, 119-130), so a dispatcher that drops a field
// surfaces as a queryable schema_drift event rather than silently losing
// payload to 'unknown' bucket logging.
// ---------------------------------------------------------------------------

export const askGateDecisionEventSchema = z.object({
  sessionId: z.string(),
  meaningful: z.boolean(),
  reason: z.string(),
  method: z.string(),
  exchangeCount: z.number(),
  learnerWordCount: z.number(),
  topicCount: z.number(),
});
export type AskGateDecisionEvent = z.infer<typeof askGateDecisionEventSchema>;

export const askGateTimeoutEventSchema = z.object({
  sessionId: z.string(),
  exchangeCount: z.number(),
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
  // [WI-989] `type` and `to` are required — a bounce/complaint event without these
  // fields cannot be meaningfully processed and should be rejected at the schema boundary.
  type: z.enum(['email.bounced', 'email.complained']),
  to: z.string(),
  emailId: z.string().nullable().optional(),
  timestamp: z.string().optional(),
});
export type EmailBouncedEvent = z.infer<typeof emailBouncedEventSchema>;
