import { z } from 'zod';

// ---------------------------------------------------------------------------
// WI-1777: repeat-after-me/shadowing speaking-practice attempt persistence.
// Deterministic server-side text-comparison scoring only — no LLM
// self-grading, no raw audio. See docs/plans/2026-07-11-wi1777-speaking-practice.md.
// ---------------------------------------------------------------------------

export const recordSpeakingPracticeAttemptInputSchema = z
  .object({
    sessionId: z.string().uuid(),
    subjectId: z.string().uuid(),
    mode: z.enum(['repeat_after_me', 'shadowing']),
    targetText: z.string().min(1).max(500),
    transcript: z.string().min(1).max(2000),
    locale: z.string().min(1).max(20),
  })
  .strict();
export type RecordSpeakingPracticeAttemptInput = z.infer<
  typeof recordSpeakingPracticeAttemptInputSchema
>;

export const recordSpeakingPracticeAttemptResponseSchema = z.object({
  attemptNumber: z.number().int().positive(),
  lexicalMatchScore: z.number().min(0).max(1),
  missingWords: z.array(z.string()),
  extraWords: z.array(z.string()),
  isComplete: z.boolean(),
});
export type RecordSpeakingPracticeAttemptResponse = z.infer<
  typeof recordSpeakingPracticeAttemptResponseSchema
>;
