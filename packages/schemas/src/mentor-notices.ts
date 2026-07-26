import { z } from 'zod';

import { isoDateField } from './common.ts';

export const mentorNoticeStatusSchema = z.enum([
  'open',
  'locked_in',
  'dismissed',
  'faded',
  // [WI-2501] Terminal status for a completed 'not_yet' re-check.
  'not_yet',
]);
export type MentorNoticeStatus = z.infer<typeof mentorNoticeStatusSchema>;

export const mentorNoticeNudgeStatusSchema = z.enum([
  'pending',
  'sent',
  'skipped',
  'suppressed',
]);
export type MentorNoticeNudgeStatus = z.infer<
  typeof mentorNoticeNudgeStatusSchema
>;

export const mentorNoticeRecheckOutcomeSchema = z.enum([
  'locked_in',
  'not_yet',
  'dismissed',
  'deferred',
]);
export type MentorNoticeRecheckOutcome = z.infer<
  typeof mentorNoticeRecheckOutcomeSchema
>;

export const mentorNoticeAcceptedSchema = z.object({
  id: z.string().uuid(),
  concept: z.string().min(1).max(200),
  correctionHint: z.string().min(1).max(500).nullable(),
});
export type MentorNoticeAccepted = z.infer<typeof mentorNoticeAcceptedSchema>;

export const mentorNoticeSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  sourceSessionId: z.string().uuid(),
  concept: z.string().min(1).max(200),
  correctionHint: z.string().min(1).max(500).nullable(),
  status: mentorNoticeStatusSchema,
  lastOfferedSessionId: z.string().uuid().nullable(),
  lastOfferedAt: isoDateField.nullable(),
  lastDeferredAt: isoDateField.nullable(),
  offerCount: z.number().int().nonnegative(),
  recheckAttemptCount: z.number().int().nonnegative(),
  firstRecheckAt: isoDateField.nullable(),
  lastRecheckAt: isoDateField.nullable(),
  lastRecheckOutcome: mentorNoticeRecheckOutcomeSchema.nullable(),
  nudgeStatus: mentorNoticeNudgeStatusSchema,
  nudgedAt: isoDateField.nullable(),
  createdAt: isoDateField,
  resolvedAt: isoDateField.nullable(),
});
export type MentorNotice = z.infer<typeof mentorNoticeSchema>;

// ---------------------------------------------------------------------------
// [WI-2627] Mentor-notice policy OBSERVATION — the public wire contract
// ---------------------------------------------------------------------------
//
// SAFETY BOUNDARY. A client that has been told the mentor-notice rollout is off
// must not be able to re-enable a cached notice surface because of an
// out-of-order response, a warm restart, or a hydration race. WI-2504 gave the
// client a single opaque epoch to key its cache on; an epoch is comparable for
// EQUALITY only, so two responses carrying different epochs cannot be ordered
// and the later-arriving one wins whatever it says. This observation adds the
// missing ORDER.
//
// WHAT EACH FIELD IS FOR — they are deliberately not interchangeable:
//
//   rolloutRevision — a nonnegative integer, DEPLOYMENT-scoped. It orders
//     rollout states across deploys and is the ONLY field a client compares
//     with `<`, `===`, or `>`.
//
//   rolloutEnabled — the DEPLOYMENT-scoped rollout flag, and nothing else. It
//     is NOT "may notice data be projected on this request": that answer also
//     depends on per-request conditions (proxy session, caller-is-not-subject,
//     subject consent withdrawn) which a deployment revision does not order.
//     Folding those into a monotonic, disabled-wins field would let ONE proxy
//     read at revision N latch the surface off for the same learner's own
//     legitimate read at revision N until a deploy bumped the revision — proxy
//     poisoning self. So the per-request tightenings stay where WI-2498/WI-2504
//     put them: inside `projectionEpoch` (which keys the cache, so a tightened
//     read simply misses) and the client's own proxy strip.
//
//   projectionEpoch — the OPAQUE cache-binding token, carrying the revision and
//     every per-request conjunct of the visibility predicate V. The client
//     stores it and keys its persisted projection on it; it never parses it, so
//     adding a branch server-side can only ever cause a cache miss, never a
//     leak.
//
// The three travel together because a client that received the epoch without
// the revision could not order it, and a revision without the epoch would not
// invalidate anything.
export const mentorNoticePolicyObservationSchema = z.object({
  rolloutRevision: z.number().int().nonnegative(),
  rolloutEnabled: z.boolean(),
  projectionEpoch: z.string().min(1),
});
export type MentorNoticePolicyObservation = z.infer<
  typeof mentorNoticePolicyObservationSchema
>;

/**
 * [WI-2627] The observation as it appears on a response.
 *
 * `.optional()` rather than `.nullable()`, for the same reason
 * `mentorNoticePolicyEpoch` is optional (see now-feed.ts): absence is not a
 * value any current server sends, it is how a client recognises a response
 * carrying NO observation at all — a worker predating this field. That is
 * "nothing was observed", never "an absence of policy was observed", and a
 * client must not be credited with knowing a change it never received.
 */
export const mentorNoticePolicyObservationField =
  mentorNoticePolicyObservationSchema.optional();

/**
 * [WI-2627] Recheck/defer echo the observation on SUCCESS.
 *
 * These are mutations, not persisted projections — WI-2504 deliberately did not
 * put the epoch on them because a flag-off answers 404 and there is no body to
 * invalidate. That reasoning covered CACHE INVALIDATION; it does not cover
 * ORDERING. A successful mutation is a fresh, authenticated observation of the
 * live policy, and a client that acts on a mutation result must be able to
 * order it against whatever the Now feed last told it. Emitting here costs one
 * field and closes the window where a mutation's success is applied under a
 * policy state the client has since superseded.
 */
export const mentorNoticeRecheckResponseSchema = z.object({
  sessionId: z.string().uuid(),
  mentorNoticePolicy: mentorNoticePolicyObservationField,
});
export type MentorNoticeRecheckResponse = z.infer<
  typeof mentorNoticeRecheckResponseSchema
>;

export const mentorNoticeDeferResponseSchema = z.object({
  noticeId: z.string().uuid(),
  deferredAt: isoDateField,
  mentorNoticePolicy: mentorNoticePolicyObservationField,
});
export type MentorNoticeDeferResponse = z.infer<
  typeof mentorNoticeDeferResponseSchema
>;
