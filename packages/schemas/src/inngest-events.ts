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

export const interviewReadyToPersistEventSchema = z.object({
  version: z.literal(1),
  draftId: z.string().uuid(),
  profileId: z.string().uuid(),
  subjectId: z.string().uuid(),
  subjectName: z.string().min(1),
  bookId: z.string().uuid().optional(),
});
export type InterviewReadyToPersistEvent = z.infer<
  typeof interviewReadyToPersistEventSchema
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
