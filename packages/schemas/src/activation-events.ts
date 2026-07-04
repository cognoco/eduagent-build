import { z } from 'zod';

/**
 * WI-1504 — launch activation instrumentation (first-party only; MVP).
 *
 * Mirrors the `activation_events_event_type_known` DB check constraint in
 * `packages/database/src/schema/activation-events.ts`. Keep the two in sync.
 */
export const activationEventTypeSchema = z.enum([
  'app_opened',
  'signup_started',
  'signup_completed',
  'onboarding_completed',
  'first_subject_or_lesson_started',
  'first_session_started',
  'first_session_completed',
  'review_card_seen',
  'review_card_tapped',
  'day2_return',
]);
export type ActivationEventType = z.infer<typeof activationEventTypeSchema>;

/**
 * The subset of activation events that a CLIENT is allowed to report through
 * the ingest route (`POST /activation-events`). These are purely
 * client-observed and may fire before a profile exists.
 *
 * The four server-owned types (`signup_completed`,
 * `first_subject_or_lesson_started`, `first_session_started`,
 * `first_session_completed`) are deliberately EXCLUDED: they are recorded
 * server-side by the route/service that owns that transition. Excluding them
 * here rejects a forged server-owned funnel event AT THE ZOD TRUST BOUNDARY,
 * not in a single-point handler guard. Internal writers keep the full
 * `activationEventTypeSchema`.
 */
export const clientActivationEventTypeSchema = z.enum([
  'app_opened',
  'signup_started',
  'onboarding_completed',
  'review_card_seen',
  'review_card_tapped',
  'day2_return',
]);
export type ClientActivationEventType = z.infer<
  typeof clientActivationEventTypeSchema
>;

export const activationProfileShapeSchema = z.enum([
  'solo_owner',
  'guardian',
  'child',
  'proxy',
  'unknown',
]);
export type ActivationProfileShape = z.infer<
  typeof activationProfileShapeSchema
>;

/**
 * Request body for the client-driven activation ingest route
 * (`POST /activation-events`). Reserved for events that are purely
 * client-observed — app_opened, signup_started, onboarding_completed,
 * review_card_seen, review_card_tapped, day2_return — and that may fire
 * before a profile exists. Server-side touchpoints (signup_completed,
 * first_subject_or_lesson_started, first_session_started,
 * first_session_completed) are NOT sent through this route; they are recorded
 * directly by the route/service that owns that transition. `eventType` uses
 * `clientActivationEventTypeSchema` so a forged server-owned type is rejected
 * at the Zod boundary (HTTP 400), not by a downstream handler guard.
 */
export const activationEventIngestRequestSchema = z.object({
  eventType: clientActivationEventTypeSchema,
  anonymousId: z.string().min(1).max(200),
  occurredAt: z.string().datetime().optional(),
  environment: z.string().max(50).optional(),
  appVersion: z.string().max(50).optional(),
  platform: z.string().max(30).optional(),
  route: z.string().max(200).optional(),
  /**
   * Distinguishes repeated occurrences of the same eventType for the same
   * actor when a day-level dedupe bucket would be too coarse — e.g. a card
   * id for review_card_seen/review_card_tapped, so seeing 5 different cards
   * in one day records 5 rows, not 1. Omit for events where "once per UTC
   * day" is the intended dedupe granularity (app_opened, day2_return,
   * onboarding_completed, signup_started).
   */
  occurrenceId: z.string().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ActivationEventIngestRequest = z.infer<
  typeof activationEventIngestRequestSchema
>;

export const activationEventIngestResponseSchema = z.object({
  recorded: z.boolean(),
});
export type ActivationEventIngestResponse = z.infer<
  typeof activationEventIngestResponseSchema
>;
