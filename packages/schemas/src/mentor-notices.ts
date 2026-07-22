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

export const mentorNoticeRecheckResponseSchema = z.object({
  sessionId: z.string().uuid(),
});
export type MentorNoticeRecheckResponse = z.infer<
  typeof mentorNoticeRecheckResponseSchema
>;

export const mentorNoticeDeferResponseSchema = z.object({
  noticeId: z.string().uuid(),
  deferredAt: isoDateField,
});
export type MentorNoticeDeferResponse = z.infer<
  typeof mentorNoticeDeferResponseSchema
>;
