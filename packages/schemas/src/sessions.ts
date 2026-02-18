import { z } from 'zod';
import { chatExchangeSchema } from './common.js';

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

// Interview context — input for processing interview exchanges

export const interviewContextSchema = z.object({
  subjectName: z.string(),
  exchangeHistory: z.array(chatExchangeSchema),
});
export type InterviewContext = z.infer<typeof interviewContextSchema>;

// Interview result — response from a single interview exchange

export const interviewResultSchema = z.object({
  response: z.string(),
  isComplete: z.boolean(),
  extractedSignals: z
    .object({
      goals: z.array(z.string()),
      experienceLevel: z.string(),
      currentKnowledge: z.string(),
    })
    .optional(),
});
export type InterviewResult = z.infer<typeof interviewResultSchema>;

// Onboarding draft — persisted interview state

export const onboardingDraftSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  subjectId: z.string().uuid(),
  exchangeHistory: z.array(chatExchangeSchema),
  extractedSignals: z.record(z.string(), z.unknown()),
  status: draftStatusSchema,
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;

// Session schemas

export const sessionStartSchema = z.object({
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().optional(),
});
export type SessionStartInput = z.infer<typeof sessionStartSchema>;

// Learning session schemas (Epic 2)

export const sessionTypeSchema = z.enum(['learning', 'homework']);
export type SessionType = z.infer<typeof sessionTypeSchema>;

export const sessionStatusSchema = z.enum([
  'active',
  'paused',
  'completed',
  'auto_closed',
]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const summaryStatusSchema = z.enum([
  'pending',
  'submitted',
  'accepted',
  'skipped',
  'auto_closed',
]);
export type SummaryStatus = z.infer<typeof summaryStatusSchema>;

export const escalationRungSchema = z.number().int().min(1).max(5);
export type EscalationRung = z.infer<typeof escalationRungSchema>;

// Exchange schemas

export const sessionMessageSchema = z.object({
  message: z.string().min(1).max(10000),
  sessionType: sessionTypeSchema.optional(),
});
export type SessionMessageInput = z.infer<typeof sessionMessageSchema>;

// Session state response

export const learningSessionSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  sessionType: sessionTypeSchema,
  status: sessionStatusSchema,
  escalationRung: escalationRungSchema,
  exchangeCount: z.number().int(),
  startedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  durationSeconds: z.number().int().nullable(),
});
export type LearningSession = z.infer<typeof learningSessionSchema>;

// Session close request

export const sessionCloseSchema = z.object({
  reason: z.enum(['user_ended', 'hard_cap', 'silence_timeout']).optional(),
});
export type SessionCloseInput = z.infer<typeof sessionCloseSchema>;

// Content flag

export const contentFlagSchema = z.object({
  eventId: z.string().uuid(),
  reason: z.string().min(1).max(1000).optional(),
});
export type ContentFlagInput = z.infer<typeof contentFlagSchema>;

// Summary submission

export const summarySubmitSchema = z.object({
  content: z.string().min(10).max(2000),
});
export type SummarySubmitInput = z.infer<typeof summarySubmitSchema>;

// Summary response

export const sessionSummarySchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  content: z.string(),
  aiFeedback: z.string().nullable(),
  status: summaryStatusSchema,
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

// Parking lot schemas

export const parkingLotAddSchema = z.object({
  question: z.string().min(1).max(2000),
});
export type ParkingLotAddInput = z.infer<typeof parkingLotAddSchema>;

export const parkingLotItemSchema = z.object({
  id: z.string().uuid(),
  question: z.string(),
  explored: z.boolean(),
  createdAt: z.string().datetime(),
});
export type ParkingLotItem = z.infer<typeof parkingLotItemSchema>;

// Homework OCR schemas

export const ocrRegionSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
});
export type OcrRegion = z.infer<typeof ocrRegionSchema>;

export const ocrResultSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  regions: z.array(ocrRegionSchema),
});
export type OcrResult = z.infer<typeof ocrResultSchema>;

export const OCR_CONSTRAINTS = {
  maxFileSizeBytes: 5 * 1024 * 1024,
  acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
} as const;
