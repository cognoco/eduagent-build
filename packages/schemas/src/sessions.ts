import { z } from 'zod';

// Interview schemas

export const interviewMessageSchema = z.object({
  message: z.string().min(1).max(5000),
});
export type InterviewMessageInput = z.infer<typeof interviewMessageSchema>;

export const draftStatusSchema = z.enum([
  'in_progress',
  'completed',
  'expired',
]);
export type DraftStatus = z.infer<typeof draftStatusSchema>;

export const interviewStateSchema = z.object({
  draftId: z.string().uuid(),
  status: draftStatusSchema,
  exchangeCount: z.number().int(),
  subjectName: z.string(),
});
export type InterviewState = z.infer<typeof interviewStateSchema>;

// Session schemas

export const sessionStartSchema = z.object({
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().optional(),
});
export type SessionStartInput = z.infer<typeof sessionStartSchema>;
