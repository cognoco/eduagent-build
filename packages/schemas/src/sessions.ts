import { z } from 'zod';
import { verificationTypeSchema } from './assessments.ts';
import {
  celebrationReasonSchema,
  pendingCelebrationSchema,
} from './progress.ts';
import { persistFailureCodeSchema } from './errors.ts';

// Interview schemas

export const interviewMessageSchema = z.object({
  message: z.string().min(1).max(5000),
});
export type InterviewMessageInput = z.infer<typeof interviewMessageSchema>;

export const draftStatusSchema = z.enum([
  'in_progress',
  'completing',
  'completed',
  'failed',
  'expired',
]);
export type DraftStatus = z.infer<typeof draftStatusSchema>;

export const orphanReasonSchema = z.enum([
  'llm_stream_error',
  'llm_empty_or_unparseable',
  'persist_curriculum_failed',
  'unknown_post_stream',
]);
export type OrphanReason = z.infer<typeof orphanReasonSchema>;

export const exchangeEntrySchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  client_id: z.string().min(1).max(128).optional(),
  orphan_reason: orphanReasonSchema.optional(),
});
export type ExchangeEntry = z.infer<typeof exchangeEntrySchema>;

// Extracted signals — structured data parsed from a completed interview.
// `interests` is surfaced to the interests-context picker on mobile, which
// lets the learner tag each extracted label as school / free-time / both.
// Optional because the LLM extraction may return an empty array for short
// or off-topic interviews — consumers MUST tolerate missing/empty interests.
export const extractedInterviewSignalsSchema = z.object({
  goals: z.array(z.string()),
  experienceLevel: z.string(),
  currentKnowledge: z.string(),
  interests: z.array(z.string()).optional(),
});
export type ExtractedInterviewSignals = z.infer<
  typeof extractedInterviewSignalsSchema
>;

export const interviewStateSchema = z.object({
  draftId: z.string().uuid(),
  status: draftStatusSchema,
  exchangeCount: z.number().int(),
  subjectName: z.string(),
  resumeSummary: z.string().nullable().optional(),
  exchangeHistory: z.array(exchangeEntrySchema).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  failureCode: persistFailureCodeSchema.nullable().optional(),
  extractedSignals: extractedInterviewSignalsSchema.optional(),
});
export type InterviewState = z.infer<typeof interviewStateSchema>;

// Interview context — input for processing interview exchanges

export const interviewContextSchema = z.object({
  subjectName: z.string(),
  exchangeHistory: z.array(exchangeEntrySchema),
  bookTitle: z.string().optional(),
});
export type InterviewContext = z.infer<typeof interviewContextSchema>;

// Interview result — response from a single interview exchange

export const interviewResultSchema = z.object({
  response: z.string(),
  isComplete: z.boolean(),
  extractedSignals: extractedInterviewSignalsSchema.optional(),
});
export type InterviewResult = z.infer<typeof interviewResultSchema>;

// Onboarding draft — persisted interview state

export const onboardingDraftSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  subjectId: z.string().uuid(),
  exchangeHistory: z.array(exchangeEntrySchema),
  extractedSignals: z.record(z.string(), z.unknown()),
  status: draftStatusSchema,
  failureCode: persistFailureCodeSchema.nullable().default(null),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;

// Engagement signal — parent-facing session recap classification
// Canonical source for all engagement signal values used by API (session-highlights)
// and mobile (EngagementChip). Do not redefine these locally.

export const ENGAGEMENT_SIGNALS = [
  'curious',
  'stuck',
  'breezing',
  'focused',
  'scattered',
] as const;

export const engagementSignalSchema = z.enum(ENGAGEMENT_SIGNALS);
export type EngagementSignal = z.infer<typeof engagementSignalSchema>;

// Session schemas

export const sessionTypeSchema = z.enum([
  'learning',
  'homework',
  'interleaved',
]);
export type SessionType = z.infer<typeof sessionTypeSchema>;

export const inputModeSchema = z.enum(['text', 'voice']);
export type InputMode = z.infer<typeof inputModeSchema>;

export const homeworkModeSchema = z.enum(['help_me', 'check_answer']);
export type HomeworkMode = z.infer<typeof homeworkModeSchema>;

export const homeworkProblemSourceSchema = z.enum(['ocr', 'manual']);
export type HomeworkProblemSource = z.infer<typeof homeworkProblemSourceSchema>;

export const homeworkCaptureSourceSchema = z.enum(['camera', 'gallery']);
export type HomeworkCaptureSource = z.infer<typeof homeworkCaptureSourceSchema>;

export const homeworkProblemStatusSchema = z.enum([
  'pending',
  'active',
  'completed',
]);
export type HomeworkProblemStatus = z.infer<typeof homeworkProblemStatusSchema>;

export const homeworkProblemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(10000),
  originalText: z.string().nullable().optional(),
  source: homeworkProblemSourceSchema,
  status: homeworkProblemStatusSchema.optional(),
  selectedMode: homeworkModeSchema.nullable().optional(),
});
export type HomeworkProblem = z.infer<typeof homeworkProblemSchema>;

export const homeworkSessionMetadataSchema = z
  .object({
    problemCount: z.number().int().min(0),
    currentProblemIndex: z.number().int().min(0),
    problems: z.array(homeworkProblemSchema),
    ocrText: z.string().optional(),
    source: homeworkCaptureSourceSchema.optional(),
  })
  .strip();
export type HomeworkSessionMetadata = z.infer<
  typeof homeworkSessionMetadataSchema
>;

export const homeworkSummarySchema = z.object({
  problemCount: z.number().int().min(0),
  practicedSkills: z.array(z.string()),
  independentProblemCount: z.number().int().min(0),
  guidedProblemCount: z.number().int().min(0),
  summary: z.string().min(1),
  displayTitle: z.string().min(1),
});
export type HomeworkSummary = z.infer<typeof homeworkSummarySchema>;

export const sessionMetadataSchema = z
  .object({
    inputMode: inputModeSchema.optional(),
    homework: homeworkSessionMetadataSchema.optional(),
    homeworkSummary: homeworkSummarySchema.optional(),
    /** F-10: UI mode stored at session creation so pipeline can distinguish
     *  practice/review from regular learning without a schema migration. */
    effectiveMode: z.string().optional(),
    /** Session this learning chat is continuing from. Stored in metadata so
     *  completed-session handoffs do not require a migration. */
    resumeFromSessionId: z.string().uuid().optional(),
  })
  .strip();
export type SessionMetadata = z.infer<typeof sessionMetadataSchema>;

export const sessionStartSchema = z.object({
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().optional(),
  sessionType: sessionTypeSchema.default('learning'),
  verificationType: z.enum(['standard', 'evaluate', 'teach_back']).optional(),
  inputMode: inputModeSchema.default('text'),
  metadata: sessionMetadataSchema.optional(),
  rawInput: z.string().max(500).nullable().optional(),
});
export type SessionStartInput = z.infer<typeof sessionStartSchema>;

export const sessionStatusSchema = z.enum([
  'active',
  'paused',
  'completed',
  'auto_closed',
]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const filingStatusSchema = z.enum([
  'filing_pending',
  'filing_failed',
  'filing_recovered',
]);
export type FilingStatus = z.infer<typeof filingStatusSchema>;

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

export const sessionMessageSchema = z
  .object({
    message: z.string().min(1).max(10000),
    sessionType: sessionTypeSchema.optional(),
    /** FR228: Homework mode — "Help me solve it" or "Check my answer" */
    homeworkMode: homeworkModeSchema.optional(),
    /** Base64-encoded image to send alongside the message (homework photos) */
    imageBase64: z.string().max(2_000_000).optional(),
    /** MIME type of the attached image */
    imageMimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
  })
  .refine((data) => !!data.imageBase64 === !!data.imageMimeType, {
    message:
      'imageBase64 and imageMimeType must both be provided or both omitted',
  });
export type SessionMessageInput = z.infer<typeof sessionMessageSchema>;

// Session state response

export const learningSessionSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  sessionType: sessionTypeSchema,
  inputMode: inputModeSchema,
  verificationType: verificationTypeSchema.nullable(),
  status: sessionStatusSchema,
  escalationRung: escalationRungSchema,
  exchangeCount: z.number().int(),
  startedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  durationSeconds: z.number().int().nullable(),
  wallClockSeconds: z.number().int().nullable(),
  metadata: sessionMetadataSchema.optional(),
  rawInput: z.string().nullable().optional(),
  filedAt: z.string().datetime().nullable(),
  filingStatus: filingStatusSchema.nullable(),
  filingRetryCount: z.number().int().nonnegative(),
});
export type LearningSession = z.infer<typeof learningSessionSchema>;

// Session close request

export const sessionCloseSchema = z.object({
  reason: z.enum(['user_ended', 'silence_timeout']).optional(),
  summaryStatus: summaryStatusSchema.optional(),
  milestonesReached: z.array(celebrationReasonSchema).optional(),
});
export type SessionCloseInput = z.infer<typeof sessionCloseSchema>;

// System prompt injection (quick chips: hint, example, simpler)
export const systemPromptBodySchema = z.object({
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SystemPromptBody = z.infer<typeof systemPromptBodySchema>;

export const sessionAnalyticsEventTypeSchema = z.enum([
  'quick_action',
  'user_feedback',
]);
export type SessionAnalyticsEventType = z.infer<
  typeof sessionAnalyticsEventTypeSchema
>;

export const sessionAnalyticsEventSchema = z.object({
  eventType: sessionAnalyticsEventTypeSchema,
  content: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SessionAnalyticsEventInput = z.infer<
  typeof sessionAnalyticsEventSchema
>;

export const sessionTranscriptExchangeSchema = z.object({
  eventId: z.string().uuid().optional(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.string().datetime(),
  escalationRung: z.number().int().min(1).max(5).optional(),
  isSystemPrompt: z.boolean().optional(),
});
export type SessionTranscriptExchange = z.infer<
  typeof sessionTranscriptExchangeSchema
>;

export const sessionTranscriptSchema = z.object({
  session: z.object({
    sessionId: z.string().uuid(),
    subjectId: z.string().uuid(),
    topicId: z.string().uuid().nullable(),
    sessionType: sessionTypeSchema,
    inputMode: inputModeSchema.default('text'),
    verificationType: verificationTypeSchema.nullable().optional(),
    startedAt: z.string().datetime(),
    exchangeCount: z.number().int(),
    milestonesReached: z.array(celebrationReasonSchema).default([]),
    wallClockSeconds: z.number().int().nullable().optional(),
  }),
  exchanges: z.array(sessionTranscriptExchangeSchema),
});
export type SessionTranscript = z.infer<typeof sessionTranscriptSchema>;

export const sessionDonePayloadSchema = z.object({
  exchangeCount: z.number().int(),
  escalationRung: escalationRungSchema,
  expectedResponseMinutes: z.number().int().min(1).max(20).optional(),
  aiEventId: z.string().uuid().optional(),
});
export type SessionDonePayload = z.infer<typeof sessionDonePayloadSchema>;

export const fastCelebrationSummarySchema = z.object({
  celebrations: z.array(pendingCelebrationSchema),
});
export type FastCelebrationSummary = z.infer<
  typeof fastCelebrationSummarySchema
>;

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
  closingLine: z.string().nullable(),
  learnerRecap: z.string().nullable(),
  nextTopicId: z.string().uuid().nullable(),
  nextTopicTitle: z.string().nullable(),
  nextTopicReason: z.string().nullable(),
  baseXp: z.number().nullable().optional(),
  reflectionBonusXp: z.number().nullable().optional(),
  consecutiveSummarySkips: z.number().optional(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const skipSummaryResponseSchema = z.object({
  summary: sessionSummarySchema.pick({
    id: true,
    sessionId: true,
    content: true,
    aiFeedback: true,
    status: true,
  }),
  consecutiveSummarySkips: z.number().optional(),
  pipelineQueued: z.boolean().optional(),
});
export type SkipSummaryResponse = z.infer<typeof skipSummaryResponseSchema>;

export const learnerRecapResponseSchema = z.object({
  closingLine: z.string().min(1).max(150),
  takeaways: z.array(z.string().min(1).max(200)).min(1).max(4),
  nextTopicReason: z.string().min(1).max(120).nullable(),
});
export type LearnerRecapResponse = z.infer<typeof learnerRecapResponseSchema>;

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

export const parkingLotItemsResponseSchema = z.object({
  items: z.array(parkingLotItemSchema),
  count: z.number().int().nonnegative(),
});
export type ParkingLotItemsResponse = z.infer<
  typeof parkingLotItemsResponseSchema
>;

export const parkingLotAddResponseSchema = z.object({
  item: parkingLotItemSchema,
});
export type ParkingLotAddResponse = z.infer<typeof parkingLotAddResponseSchema>;

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

export const homeworkStateSyncSchema = z.object({
  metadata: homeworkSessionMetadataSchema,
});
export type HomeworkStateSyncInput = z.infer<typeof homeworkStateSyncSchema>;

export const sessionInputModeSchema = z.object({
  inputMode: inputModeSchema,
});
export type SessionInputModeInput = z.infer<typeof sessionInputModeSchema>;

// Interleaved session start — optional filters for topic selection

export const interleavedSessionStartSchema = z.object({
  subjectId: z.string().uuid().optional(),
  topicCount: z.number().int().min(1).max(10).default(5),
});
export type InterleavedSessionStartInput = z.infer<
  typeof interleavedSessionStartSchema
>;

// Recall bridge result — returned after homework success

export const recallBridgeResultSchema = z.object({
  questions: z.array(z.string()),
  topicId: z.string().uuid(),
  topicTitle: z.string(),
});
export type RecallBridgeResult = z.infer<typeof recallBridgeResultSchema>;

// Homework start response — POST /subjects/:subjectId/homework → 201

export const homeworkStartResponseSchema = z.object({
  session: learningSessionSchema,
});
export type HomeworkStartResponse = z.infer<typeof homeworkStartResponseSchema>;

// Outbox spillover result — POST /support/outbox-spillover → 200

export const outboxSpilloverResultSchema = z.object({
  written: z.number().int().nonnegative(),
});
export type OutboxSpilloverResult = z.infer<typeof outboxSpilloverResultSchema>;
