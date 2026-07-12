import { z } from 'zod';

import {
  challengeRoundSessionStateSchema,
  escalationRungSchema,
} from './sessions.ts';
import { cefrLevelSchema } from './language.ts';

// ---------------------------------------------------------------------------
// Stream fallback contract — emitted as an SSE frame BEFORE the `done` frame
// when the LLM produced a malformed/empty/orphan-marker response that would
// otherwise dead-end the user with an empty bubble + feedback chips.
//
// Three distinct reason buckets so triage can separate LLM format drift
// (malformed_envelope) from widget-trigger-without-handler (orphan_marker)
// from LLM-refused-to-answer (empty_reply). Do NOT collapse to one reason —
// the buckets drive different remediation work (prompt tuning vs. handler
// wiring vs. eval-harness coverage).
// ---------------------------------------------------------------------------

export const exchangeFallbackReasonSchema = z.enum([
  'empty_reply',
  'malformed_envelope',
  'orphan_marker',
]);
export type ExchangeFallbackReason = z.infer<
  typeof exchangeFallbackReasonSchema
>;

export const streamFallbackFrameSchema = z.object({
  type: z.literal('fallback'),
  reason: exchangeFallbackReasonSchema,
  /** User-visible text for the reconnect-prompt bubble. Server-authored. */
  fallbackText: z.string().min(1),
});
export type StreamFallbackFrame = z.infer<typeof streamFallbackFrameSchema>;

export const streamErrorFrameSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
  code: z.string().optional(),
});
export type StreamErrorFrame = z.infer<typeof streamErrorFrameSchema>;

export const exchangeFallbackSchema = z.object({
  reason: exchangeFallbackReasonSchema,
  fallbackText: z.string().min(1),
});
export type ExchangeFallback = z.infer<typeof exchangeFallbackSchema>;

// ---------------------------------------------------------------------------
// Stream `done` frame contract — the terminal SSE frame the mobile client
// consumes after a streamed exchange completes. Previously this payload was
// assembled from a local `interface DoneFrameSource` + `buildDoneFramePayload`
// in `apps/api/src/routes/sessions.ts` with several fields typed `unknown`,
// while the sibling `error` / `fallback` frames were already schematized here
// and `.parse()`d before emission. That left the client-facing `done` contract
// as the only stream frame with no shared Zod schema or runtime validation, so
// a field rename/shape drift could ship silently to the mobile consumer.
//
// This schema is the canonical contract for the `done` frame. The API parses
// every emitted `done` payload through it (matching the error/fallback frames),
// and the mobile `StreamDoneEvent` interface mirrors it field-for-field.
// ---------------------------------------------------------------------------

/** Fluency-drill annotation surfaced on the `done` frame for language sessions. */
export const streamFluencyDrillSchema = z.object({
  active: z.boolean(),
  durationSeconds: z.number().optional(),
  score: z
    .object({
      correct: z.number().int(),
      total: z.number().int(),
    })
    .optional(),
});
export type StreamFluencyDrill = z.infer<typeof streamFluencyDrillSchema>;

export const streamLanguageComprehensionQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string().min(1),
  answerHint: z.string().min(1),
});
export type StreamLanguageComprehensionQuestion = z.infer<
  typeof streamLanguageComprehensionQuestionSchema
>;
export type LanguageComprehensionQuestion = StreamLanguageComprehensionQuestion;

export const streamLanguageGradedInputSchema = z.object({
  type: z.literal('graded_input'),
  modality: z.enum(['reading', 'listening']),
  cefrLevel: cefrLevelSchema,
  knownWordRatioTarget: z.number().min(0).max(1),
  knownWordEstimate: z.number().min(0).max(1),
  targetWords: z.array(z.string()),
  text: z.string().min(1),
  comprehensionQuestions: z.array(streamLanguageComprehensionQuestionSchema),
  audioEnabled: z.boolean(),
});
export type StreamLanguageGradedInput = z.infer<
  typeof streamLanguageGradedInputSchema
>;
export type LanguageGradedInputModality = StreamLanguageGradedInput['modality'];
export type LanguageGradedInputArtifact = StreamLanguageGradedInput;

export const streamLanguageMeaningOutputTaskSchema = z.enum([
  'role_play',
  'personal_answer',
  'retell',
  'describe',
  'ask_question',
]);
export type StreamLanguageMeaningOutputTask = z.infer<
  typeof streamLanguageMeaningOutputTaskSchema
>;

export const streamLanguageMeaningOutputResponseModeSchema = z.enum([
  'dialogue_turn',
  'short_answer',
  'short_retell',
  'short_description',
  'question',
]);
export type StreamLanguageMeaningOutputResponseMode = z.infer<
  typeof streamLanguageMeaningOutputResponseModeSchema
>;

export const streamLanguageMeaningOutputSchema = z.object({
  type: z.literal('meaning_output'),
  taskType: streamLanguageMeaningOutputTaskSchema,
  communicativeGoal: z.string().min(1),
  prompt: z.string().min(1),
  responseMode: streamLanguageMeaningOutputResponseModeSchema,
  targetWords: z.array(z.string()),
  targetGrammar: z.array(z.string()),
  retryExpectation: z.enum(['retry_after_feedback']),
  correctionExpectation: z.enum(['meaning_first_then_form']),
});
export type StreamLanguageMeaningOutput = z.infer<
  typeof streamLanguageMeaningOutputSchema
>;
export type LanguageMeaningOutputTaskType = StreamLanguageMeaningOutputTask;
export type LanguageMeaningOutputResponseMode =
  StreamLanguageMeaningOutputResponseMode;
export type LanguageMeaningOutputArtifact = StreamLanguageMeaningOutput;

// WI-1777: repeat-after-me/shadowing speaking practice. One shape serves both
// modes (`type` discriminates) — the field is named `speakingPractice` rather
// than `repeatAfterMe` for that reason. `retryGuidance` is a fixed enum, not
// freeform text, mirroring `retryExpectation`/`correctionExpectation` above.
export const streamLanguageSpeakingPracticeSchema = z.object({
  type: z.enum(['repeat_after_me', 'shadowing']),
  targetText: z.string().min(1),
  locale: z.string().min(1),
  modality: z.literal('voice'),
  retryGuidance: z.enum(['retry_same_target']),
});
export type StreamLanguageSpeakingPractice = z.infer<
  typeof streamLanguageSpeakingPracticeSchema
>;
export type LanguageSpeakingPracticeArtifact = StreamLanguageSpeakingPractice;

export const languageComprehensionVerdictSchema = z.enum([
  'understood',
  'partial',
  'missed',
]);
export type LanguageComprehensionVerdict = z.infer<
  typeof languageComprehensionVerdictSchema
>;

export const languageComprehensionEvaluationSchema = z.object({
  questionId: z.string().min(1),
  prompt: z.string().min(1),
  answerHint: z.string().min(1),
  learnerAnswer: z.string(),
  verdict: languageComprehensionVerdictSchema,
  matchedTerms: z.array(z.string()),
  missingTerms: z.array(z.string()),
});
export type LanguageComprehensionEvaluation = z.infer<
  typeof languageComprehensionEvaluationSchema
>;

export const streamLanguageLearningActivitySchema = z.object({
  strand: z.enum([
    'meaning_input',
    'meaning_output',
    'language_focus',
    'fluency',
  ]),
  activityType: z.enum([
    'graded_input',
    'free_response',
    'correction_retry',
    'timed_drill',
    'repeat_after_me',
    'shadowing',
  ]),
  modality: z.enum(['text', 'voice', 'listening']),
  targetWords: z.array(z.string()),
  targetGrammar: z.array(z.string()),
  gradedInput: streamLanguageGradedInputSchema.optional(),
  meaningOutput: streamLanguageMeaningOutputSchema.optional(),
  speakingPractice: streamLanguageSpeakingPracticeSchema.optional(),
});
export type StreamLanguageLearningActivity = z.infer<
  typeof streamLanguageLearningActivitySchema
>;
export type LanguageStrand = StreamLanguageLearningActivity['strand'];
export type LanguageActivityType =
  StreamLanguageLearningActivity['activityType'];
export type LanguageActivityModality =
  StreamLanguageLearningActivity['modality'];
export type LanguageActivityTelemetry = StreamLanguageLearningActivity;

/** Server-gated Challenge Round offer pitch. Mobile never parses raw envelope JSON. */
export const streamChallengeOfferSchema = z.object({
  pitch: z.string(),
});
export type StreamChallengeOffer = z.infer<typeof streamChallengeOfferSchema>;

/** Server-validated draft (or fallback composer prompt) for a learner-owned note. */
export const streamDraftedNoteSchema = z.object({
  id: z.string(),
  body: z.string().nullable(),
  sourceAnswerEventIds: z.array(z.string()),
  fallbackPrompt: z.string().optional(),
});
export type StreamDraftedNote = z.infer<typeof streamDraftedNoteSchema>;

export const streamDoneFrameSchema = z.object({
  type: z.literal('done'),
  exchangeCount: z.number().int(),
  escalationRung: escalationRungSchema,
  /**
   * `buildDoneFramePayload` always emits this (defaulting to 0). `0` is outside
   * the 1–20 LLM-estimate range, so the schema accepts the full 0–20 span; the
   * mobile consumer treats 0 as "no estimate".
   */
  expectedResponseMinutes: z.number().int().min(0).max(20).optional(),
  aiEventId: z.string().uuid().optional(),
  notePrompt: z.boolean().optional(),
  notePromptPostSession: z.boolean().optional(),
  fluencyDrill: streamFluencyDrillSchema.optional(),
  languageLearning: streamLanguageLearningActivitySchema.optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  readyToFinish: z.boolean().optional(),
  challengeRound: challengeRoundSessionStateSchema.optional(),
  challengeOffer: streamChallengeOfferSchema.optional(),
  draftedNote: streamDraftedNoteSchema.optional(),
});
export type StreamDoneFrame = z.infer<typeof streamDoneFrameSchema>;
