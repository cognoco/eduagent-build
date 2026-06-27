import { z } from 'zod';
import { verificationTypeSchema } from './assessments.ts';
import { IMAGE_BASE64_MAX, isoDateField } from './common.ts';
import { challengeRoundEvaluationItemSchema } from './llm-envelope.ts';
import {
  celebrationReasonSchema,
  pendingCelebrationSchema,
} from './progress.ts';

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

// Interest context — narrow the meaning of an extracted interest to school
// vs free-time vs both. Signal extraction infers this when the transcript makes
// the register obvious; ambiguous interests default to 'both'.
export const interestContextValueSchema = z.enum([
  'school',
  'free_time',
  'both',
]);
export type InterestContextValue = z.infer<typeof interestContextValueSchema>;

// Analogy framing — the LLM's read of the learner's preferred analogy register.
// Mentor uses this to bias example choice in early sessions; defaults to
// 'concrete' downstream when missing (safest for ages 11-14 per spec).
export const analogyFramingSchema = z.enum(['concrete', 'abstract', 'playful']);
export type AnalogyFraming = z.infer<typeof analogyFramingSchema>;

// Pace hint — derived mechanically from transcript message length, not from
// the LLM. `density` reflects how much info the learner packs per turn;
// `chunkSize` reflects how much they tolerate back.
export const paceHintSchema = z.object({
  density: z.enum(['low', 'medium', 'high']),
  chunkSize: z.enum(['short', 'medium', 'long']),
});
export type PaceHint = z.infer<typeof paceHintSchema>;

// Extracted signals — structured data parsed from early learner transcripts.
// `interests` and the fast-path fields (`interestContext`, `analogyFraming`,
// `paceHint`) are all optional: short or off-topic interviews may yield
// empty extraction, and consumers MUST tolerate missing fields by applying
// neutral defaults. The interests-context picker (non-fast-path flow) and
// downstream mentor prompts (fast-path) are the two consumers today.
export const extractedInterviewSignalsSchema = z.object({
  goals: z.array(z.string()),
  experienceLevel: z.string(),
  currentKnowledge: z.string(),
  interests: z.array(z.string()).optional(),
  interestContext: z.record(z.string(), interestContextValueSchema).optional(),
  analogyFraming: analogyFramingSchema.optional(),
  paceHint: paceHintSchema.optional(),
});
export type ExtractedInterviewSignals = z.infer<
  typeof extractedInterviewSignalsSchema
>;

// Engagement signal + session type enums live in the dependency-free
// ./session-enums.ts leaf module to avoid a circular import with progress.ts
// (sessions.ts imports celebration schemas from progress.ts). Re-export them
// here so existing `from './sessions'` consumers and the package barrel are
// unaffected.
import {
  ENGAGEMENT_SIGNALS,
  engagementSignalSchema,
  sessionTypeSchema,
  type EngagementSignal,
  type SessionType,
} from './session-enums.ts';

export { ENGAGEMENT_SIGNALS, engagementSignalSchema, sessionTypeSchema };
export type { EngagementSignal, SessionType };

// Session schemas

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

/**
 * Maximum number of homework problems allowed in a single session sync.
 * The mobile UI is URL-budget-capped well below this value; the server-side
 * cap guards the write path (POST /v1/sessions/:id/homework-state) against
 * resource-exhaustion via oversized arrays (F-158 server-side follow-up).
 */
export const MAX_HOMEWORK_PROBLEMS = 50;

export const homeworkSessionMetadataSchema = z
  .object({
    problemCount: z.number().int().min(0),
    currentProblemIndex: z.number().int().min(0),
    problems: z.array(homeworkProblemSchema).max(MAX_HOMEWORK_PROBLEMS),
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

/**
 * Challenge Round state machine — lives inside session metadata so a session
 * close + resume preserves which question the learner was on. The server is
 * the source of truth; mobile reads state via the session SSE stream.
 *
 * - `offered`: server has offered the round; learner has not yet responded.
 * - `accepted`: learner tapped Accept; first question is being prepared.
 * - `declined`: learner tapped Decline. Combined with `declinedDontAskAgain`
 *   to gate within-session re-offers.
 * - `active`: a question has been delivered and the learner's answer is awaited.
 * - `drafting`: all questions answered; note is being drafted from solid items.
 * - `complete`: drafted note saved or skipped; the round is fully finished.
 * - `aborted`: learner closed the session or hit silence timeout mid-round.
 */
export const challengeRoundStateEnum = z.enum([
  'offered',
  'accepted',
  'declined',
  'active',
  'drafting',
  'complete',
  'aborted',
]);
export type ChallengeRoundState = z.infer<typeof challengeRoundStateEnum>;

export const challengeRoundSessionStateSchema = z.object({
  state: challengeRoundStateEnum,
  startedAt: isoDateField.optional(),
  questionIndex: z.number().int().min(0).max(9).optional(),
  totalQuestions: z.number().int().min(1).max(10).optional(),
  offerCount: z.number().int().min(0).default(0),
  topicId: z.string().uuid().optional(),
  declinedDontAskAgain: z.boolean().default(false),
  evaluations: z.array(challengeRoundEvaluationItemSchema).max(10).default([]),
  /**
   * T9 grader-stall guard (plan 2026-06-26): number of challenge questions
   * actually asked in the active state, incremented on every active-round turn
   * regardless of whether the grader produced an evaluation. Allows the terminal
   * safeguard to fire when the grader fail-opens repeatedly and `questionIndex`
   * (which only advances on a recorded evaluation) can never reach the cap.
   * Persisted as JSON/JSONB inside session metadata — no SQL migration needed.
   */
  questionsAsked: z.number().int().min(0).optional(),
});
export type ChallengeRoundSessionState = z.infer<
  typeof challengeRoundSessionStateSchema
>;

export const sessionMetadataSchema = z
  .object({
    inputMode: inputModeSchema.optional(),
    homework: homeworkSessionMetadataSchema.optional(),
    homeworkSummary: homeworkSummarySchema.optional(),
    /** Fast onboarding handoff hints extracted before the first session. */
    onboardingFastPath: z
      .object({
        extractedSignals: extractedInterviewSignalsSchema.optional(),
      })
      .optional(),
    /** Topic-probe signals extracted asynchronously from early session turns. */
    extractedSignals: extractedInterviewSignalsSchema.optional(),
    topicProbeFiredAt: isoDateField.optional(),
    topicProbeExtractedAt: isoDateField.optional(),
    topicProbeExtractionStatus: z
      .enum(['pending', 'completed', 'failed'])
      .optional(),
    topicProbePriorKnowledgeQuality: z.number().int().min(0).max(5).optional(),
    /** F-10: UI mode stored at session creation so pipeline can distinguish
     *  practice/review from regular learning without a schema migration. */
    effectiveMode: z.string().optional(),
    /** Session this learning chat is continuing from. Stored in metadata so
     *  completed-session handoffs do not require a migration. */
    resumeFromSessionId: z.string().uuid().optional(),
    gaps: z.array(z.string().min(1).max(120)).max(8).optional(),
    continuationOpenerActive: z.boolean().optional(),
    continuationOpenerStartedExchange: z.number().int().min(0).optional(),
    continuationDepth: z.enum(['low', 'mid', 'high']).optional(),
    reviewCalibrationAttempts: z.number().int().min(0).optional(),
    reviewCalibrationFiredAt: isoDateField.optional(),
    /**
     * Challenge Round state machine for this session. Server-owned; mobile
     * reflects via session-streaming. Absent = no round has been offered.
     */
    challengeRound: challengeRoundSessionStateSchema.optional(),
  })
  .strip();
export type SessionMetadata = z.infer<typeof sessionMetadataSchema>;

export const sessionStartMetadataSchema = sessionMetadataSchema.omit({
  challengeRound: true,
});

export const sessionStartSchema = z
  .object({
    subjectId: z.string().uuid(),
    topicId: z.string().uuid().optional(),
    sessionType: sessionTypeSchema.default('learning'),
    verificationType: z.enum(['standard', 'evaluate', 'teach_back']).optional(),
    inputMode: inputModeSchema.default('text'),
    metadata: sessionStartMetadataSchema.optional(),
    rawInput: z.string().max(500).nullable().optional(),
  })
  .strict();
export type SessionStartInput = z.infer<typeof sessionStartSchema>;

export const firstCurriculumSessionStartSchema = sessionStartSchema
  .omit({ subjectId: true, topicId: true, metadata: true, rawInput: true })
  .extend({
    bookId: z.string().uuid().optional(),
    topicId: z.string().uuid().optional(),
  })
  .strict();
export type FirstCurriculumSessionStartInput = z.infer<
  typeof firstCurriculumSessionStartSchema
>;

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
  'filing_kept_out',
]);
export type FilingStatus = z.infer<typeof filingStatusSchema>;

export type SessionEffectiveMode = 'freeform' | 'learning';

export function getSessionEffectiveMode(session: {
  metadata?: unknown;
}): SessionEffectiveMode | undefined {
  const parsed = sessionMetadataSchema.safeParse(session.metadata ?? {});
  if (!parsed.success) {
    return undefined;
  }

  return parsed.data.effectiveMode === 'freeform' ||
    parsed.data.effectiveMode === 'learning'
    ? parsed.data.effectiveMode
    : undefined;
}

export const summaryStatusSchema = z.enum([
  'pending',
  'submitted',
  'accepted',
  'skipped',
  'auto_closed',
]);
export type SummaryStatus = z.infer<typeof summaryStatusSchema>;

export const MIN_EXCHANGES_FOR_TOPIC_COMPLETION = 5;

/**
 * Maximum exchanges allowed per session — defense-in-depth cap so a session
 * can never run away (e.g. if the LLM never emits a finish signal). Both
 * server (enforces hard cap before invoking the LLM) and mobile (uses to
 * predict when the next message will be rejected) need this constant, so it
 * lives in the shared schemas package.
 *
 * Moved here from `apps/api/src/services/session/session-crud.ts` in
 * 2026-05-18 schemas tightening (BUG-211).
 */
export const MAX_EXCHANGES_PER_SESSION = 50;

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
    imageBase64: z.string().max(IMAGE_BASE64_MAX).optional(),
    /** MIME type of the attached image */
    imageMimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
  })
  .strict()
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
  startedAt: isoDateField,
  lastActivityAt: isoDateField,
  endedAt: isoDateField.nullable(),
  durationSeconds: z.number().int().nullable(),
  wallClockSeconds: z.number().int().nullable(),
  metadata: sessionMetadataSchema.optional(),
  rawInput: z.string().nullable().optional(),
  filedAt: isoDateField.nullable(),
  filingStatus: filingStatusSchema.nullable(),
  filingRetryCount: z.number().int().nonnegative(),
});
export type LearningSession = z.infer<typeof learningSessionSchema>;

// Session close request

export const sessionCloseSchema = z
  .object({
    reason: z.enum(['user_ended', 'silence_timeout']).optional(),
    summaryStatus: summaryStatusSchema.optional(),
    milestonesReached: z.array(celebrationReasonSchema).optional(),
  })
  .strict();
export type SessionCloseInput = z.infer<typeof sessionCloseSchema>;

// System-prompt intent (WI-373 — server-owned prompt resolution).
//
// The client no longer supplies system-role text. It sends a typed intent
// token; the server resolves the canonical prompt string from a server-owned
// map (apps/api/src/services/session/system-prompt-intents.ts). This inverts
// the trust so a crafted client cannot inject arbitrary role:'system' content.
//
// The quick-chip ids mirror the contextual chips in the mobile client
// (apps/mobile/src/components/session/session-types.ts → ContextualQuickChipId).
// The non-contextual chips (switch_topic, park, wrong_subject) carry no system
// prompt and are intentionally excluded here.
export const systemPromptQuickChipSchema = z.enum([
  'hint',
  'example',
  'know_this',
  'explain_differently',
  'too_easy',
  'too_hard',
]);
export type SystemPromptQuickChip = z.infer<typeof systemPromptQuickChipSchema>;

export const messageFeedbackActionSchema = z.enum([
  'helpful',
  'not_helpful',
  'incorrect',
]);
export type MessageFeedbackAction = z.infer<typeof messageFeedbackActionSchema>;

export const systemPromptIntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('silence_nudge') }).strict(),
  z
    .object({
      kind: z.literal('quick_chip'),
      chip: systemPromptQuickChipSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('message_feedback'),
      action: messageFeedbackActionSchema,
      eventId: z.string().min(1),
    })
    .strict(),
]);
export type SystemPromptIntent = z.infer<typeof systemPromptIntentSchema>;

export const sessionAnalyticsEventTypeSchema = z.enum([
  'quick_action',
  'user_feedback',
]);
export type SessionAnalyticsEventType = z.infer<
  typeof sessionAnalyticsEventTypeSchema
>;

// [WI-982] Mirrors the mobile `MessageFeedbackState` union
// (apps/mobile/src/components/session/session-types.ts). Defined here because
// @eduagent/schemas is the shared API contract and must not import from mobile;
// the mobile call site passes one of these values as `metadata.value`.
export const messageFeedbackStateSchema = z.enum([
  'helpful',
  'not_helpful',
  'incorrect',
]);
export type MessageFeedbackState = z.infer<typeof messageFeedbackStateSchema>;

// [WI-982] Discriminated union replaces the open `z.record` passthrough so that
// only expected metadata keys reach the DB — closes prototype-pollution and
// arbitrary-key injection via the analytics-event endpoint. Each branch's
// metadata shape mirrors the real client payload in
// apps/mobile/src/components/session/use-session-actions.ts:
//   quick_action  → { chip, sourceMessageId? }   (lines ~508-514)
//   user_feedback → { value, eventId }            (lines ~566-573)
export const sessionAnalyticsEventSchema = z.discriminatedUnion('eventType', [
  z
    .object({
      eventType: z.literal('quick_action'),
      content: z.string().max(1000).optional(),
      metadata: z
        .object({
          chip: z.string(),
          sourceMessageId: z.string().optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      eventType: z.literal('user_feedback'),
      content: z.string().max(1000).optional(),
      metadata: z
        .object({
          value: messageFeedbackStateSchema,
          eventId: z.string(),
        })
        .strict()
        .optional(),
    })
    .strict(),
]);
export type SessionAnalyticsEventInput = z.infer<
  typeof sessionAnalyticsEventSchema
>;

export const sessionTranscriptExchangeSchema = z.object({
  eventId: z.string().uuid().optional(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: isoDateField,
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
    startedAt: isoDateField,
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

export const contentFlagSchema = z
  .object({
    eventId: z.string().uuid(),
    reason: z.string().min(1).max(1000).optional(),
  })
  .strict();
export type ContentFlagInput = z.infer<typeof contentFlagSchema>;

// Summary submission

export const summarySubmitSchema = z
  .object({
    content: z.string().min(10).max(2000),
  })
  .strict();
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
  purgedAt: isoDateField.nullable().optional(),
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
  pipelineQueued: z.boolean().optional(),
});
export type SkipSummaryResponse = z.infer<typeof skipSummaryResponseSchema>;

export const learnerRecapLlmOutputSchema = z.object({
  closingLine: z.string().min(1).max(150),
  takeaways: z.array(z.string().min(1).max(200)).min(1).max(4),
  nextTopicReason: z.string().min(1).max(120).nullable(),
});
export type LearnerRecapLlmOutput = z.infer<typeof learnerRecapLlmOutputSchema>;

// Parking lot schemas

export const parkingLotAddSchema = z
  .object({
    question: z.string().min(1).max(2000),
  })
  .strict();
export type ParkingLotAddInput = z.infer<typeof parkingLotAddSchema>;

export const parkingLotItemSchema = z.object({
  id: z.string().uuid(),
  question: z.string(),
  explored: z.boolean(),
  createdAt: isoDateField,
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

export const homeworkStateSyncSchema = z
  .object({
    metadata: homeworkSessionMetadataSchema,
  })
  .strict();
export type HomeworkStateSyncInput = z.infer<typeof homeworkStateSyncSchema>;

export const sessionInputModeSchema = z
  .object({
    inputMode: inputModeSchema,
  })
  .strict();
export type SessionInputModeInput = z.infer<typeof sessionInputModeSchema>;

// Interleaved session start — optional filters for topic selection

export const interleavedSessionStartSchema = z
  .object({
    subjectId: z.string().uuid().optional(),
    topicCount: z.number().int().min(1).max(10).default(5),
  })
  .strict();
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

// [CCR PR #281 / B68] Idempotent session replay body — returned by the
// metering middleware (`maybeReplayIdempotentSessionRequest`) when a request
// carrying an Idempotency-Key for a `/sessions/:id/messages` or
// `/sessions/:id/stream` POST has already been processed. The accompanying
// `Idempotency-Replay: true` header is set on the response by the server.
//
// Canonical schema lives here so:
//   - apps/api/src/middleware/metering.ts can type `c.json(...)` against it
//   - apps/mobile/src/lib/api-client.ts can drop its local type alias and
//     import this single source of truth (avoids future contract drift)
//
// `replayed` is `true` literal — the success branch only fires on a real
// replay hit. `status` is `'persisted'` literal — replay only happens after
// the original turn was committed end-to-end.
export const maybeReplayResponseSchema = z.object({
  replayed: z.literal(true),
  clientId: z.string(),
  status: z.literal('persisted'),
  assistantTurnReady: z.boolean(),
  latestExchangeId: z.string().nullable(),
});
export type MaybeReplayResponse = z.infer<typeof maybeReplayResponseSchema>;
