import { z } from 'zod';

export const filingTimedOutEventSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  sessionType: z.string().nullable(),
  timeoutMs: z.number().int().positive(),
  timestamp: z.string().datetime(),
});
export type FilingTimedOutEvent = z.infer<typeof filingTimedOutEventSchema>;

export const filingRetryEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  sessionMode: z.enum(['freeform', 'homework']),
  sessionTranscript: z.string().optional(),
});
export type FilingRetryEvent = z.infer<typeof filingRetryEventSchema>;

export const filingRetryCompletedEventSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  timestamp: z.string().datetime(),
});
export type FilingRetryCompletedEvent = z.infer<
  typeof filingRetryCompletedEventSchema
>;

export const filingResolvedEventSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  resolution: z.enum([
    'late_completion',
    'retry_succeeded',
    'unrecoverable',
    'recovered',
    'recovered_after_window',
  ]),
  timestamp: z.string().datetime(),
});
export type FilingResolvedEvent = z.infer<typeof filingResolvedEventSchema>;

export const subjectCurriculumPrewarmRequestedEventSchema = z.object({
  version: z.literal(1),
  subjectId: z.string().uuid(),
  profileId: z.string().uuid(),
  bookId: z.string().uuid(),
  timestamp: z.string().datetime(),
});
export type SubjectCurriculumPrewarmRequestedEvent = z.infer<
  typeof subjectCurriculumPrewarmRequestedEventSchema
>;

export const orphanPersistFailedEventSchema = z.object({
  profileId: z.string().uuid(),
  draftId: z.string().uuid(),
  route: z.string(),
  reason: z.string().nullable(),
  error: z.string(),
});
export type OrphanPersistFailedEvent = z.infer<
  typeof orphanPersistFailedEventSchema
>;

export const appNotificationSuppressedEventSchema = z.object({
  profileId: z.string().uuid(),
  notificationType: z.enum(['daily_reminder', 'review_reminder']),
  reason: z.string(),
  timestamp: z.string().datetime(),
});
export type AppNotificationSuppressedEvent = z.infer<
  typeof appNotificationSuppressedEventSchema
>;

export const reviewCalibrationRequestedEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  topicId: z.string().uuid(),
  learnerMessage: z.string().min(1),
  topicTitle: z.string().min(1),
  timestamp: z.string().datetime(),
});
export type ReviewCalibrationRequestedEvent = z.infer<
  typeof reviewCalibrationRequestedEventSchema
>;

export const topicProbeRequestedEventSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid(),
  learnerMessage: z.string().min(1),
  topicTitle: z.string().min(1),
  timestamp: z.string().datetime(),
});
export type TopicProbeRequestedEvent = z.infer<
  typeof topicProbeRequestedEventSchema
>;
