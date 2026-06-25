import { z } from 'zod';

/**
 * Suitability-judge verdict contract (MMT-ADR-0016 §2 — vendor-independent,
 * non-reasoning judge). The judge reviews a tutor reply to a learner and emits
 * this structured verdict. Stored as scores/flags only — never conversation
 * text (data minimization, §2).
 *
 * Flag categories are the §2.1 T2 deep-suitability rubric, plus `over_blocking`:
 * refusing a legitimate curriculum question is a hard failure equal in weight
 * to leaking harmful content (§1 — "the danger line runs through the word").
 */
export const judgeFlagCategorySchema = z.enum([
  'age_inappropriate',
  'boundary_drift',
  'manipulation',
  'distress_mishandled',
  'topic_drift',
  'over_blocking',
]);
export type JudgeFlagCategory = z.infer<typeof judgeFlagCategorySchema>;

export const JUDGE_FLAG_CATEGORIES = judgeFlagCategorySchema.options;

export const judgeOverallSchema = z.enum(['ok', 'concern', 'violation']);
export type JudgeOverall = z.infer<typeof judgeOverallSchema>;

export const judgeVerdictSchema = z
  .object({
    overall: judgeOverallSchema,
    flags: z.array(judgeFlagCategorySchema),
    rationale: z.string().min(1).max(500),
  })
  .superRefine((v, ctx) => {
    // Internal consistency: 'ok' iff no flags; 'concern'/'violation' need ≥1.
    if (v.overall === 'ok' && v.flags.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['flags'],
        message: "overall 'ok' must carry no flags",
      });
    }
    if (v.overall !== 'ok' && v.flags.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['flags'],
        message: `overall '${v.overall}' requires at least one flag`,
      });
    }
  });
export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;
