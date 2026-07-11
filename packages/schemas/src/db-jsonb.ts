// ---------------------------------------------------------------------------
// db-jsonb — Zod schemas for JSONB columns that drizzle types as `unknown` or
// via `$type<…>` casts (which TypeScript trusts blindly, providing zero runtime
// validation). Every consumer that reads one of these jsonb columns should
// parse the value through the matching schema below so a row that drifted out
// of contract (older client, partial backfill, malformed legacy data) is
// caught at the boundary instead of silently propagating into business logic.
//
// Rules:
//   • Schemas are PERMISSIVE on optional/legacy fields — production rows may
//     predate a field being added, so parsing must succeed on a "good enough"
//     row and fall back to a normalised default for the missing fields.
//   • Schemas are STRICT on the shape of fields that drive behaviour. A
//     malformed `kind`, `cardData`, or `extractedSignals` SHOULD fail parsing
//     so the caller's recovery path runs instead of pretending the row is
//     valid.
//   • The helpers below return `null` on parse failure rather than throwing;
//     callers decide whether to recover or escalate. This matches the existing
//     normaliser patterns in apps/api/src/services/home-surface-cache.ts.
//
// Tracked bugs:
//   • BUG-220 — coaching_card_cache.card_data jsonb without Zod validation
//   • BUG-222 — session_summaries.llm_summary jsonb cast via $type<…>
//   • BUG-225 — onboarding_drafts.exchange_history / extracted_signals jsonb
//   • BUG-391 — assessments.exchange_history bare jsonb (no $type, no runtime parse)
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { chatExchangeSchema } from './common';
import { llmSummarySchema, type LlmSummary } from './llm-summary';
import {
  extractedInterviewSignalsSchema,
  type ExtractedInterviewSignals,
} from './sessions';
import { coachingCardSchema, pendingCelebrationSchema } from './progress';
import {
  strengthEntrySchema,
  focusAreaEntrySchema,
  type StrengthEntry,
  type FocusAreaEntry,
} from './learning-profiles';
import {
  languageSessionSummarySchema,
  type LanguageSessionSummaryData,
} from './language';

// ---------------------------------------------------------------------------
// [BUG-220] coaching_card_cache.card_data
// ---------------------------------------------------------------------------
// The current production shape (HomeSurfaceCacheData) is a wrapper that holds
// either ranked home cards or a legacy CoachingCard. The schema accepts both
// shapes — strict on the discriminator `kind` and the `cachedAt` timestamp,
// permissive on the home-card / interaction-stats payload because those are
// rendered defensively at the UI layer.
// ---------------------------------------------------------------------------

export const HOME_SURFACE_CACHE_KIND = 'home_surface_cache_v1' as const;

const homeCardInteractionStatsSchema = z
  .object({
    tapsByCardId: z.record(z.string(), z.number()).default({}),
    dismissalsByCardId: z.record(z.string(), z.number()).default({}),
    events: z
      .array(
        z.object({
          cardId: z.string(),
          interactionType: z.enum(['tap', 'dismiss']),
          occurredAt: z.string(),
        }),
      )
      .default([]),
  })
  .default({ tapsByCardId: {}, dismissalsByCardId: {}, events: [] });

const homeCardLikeSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    subtitle: z.string(),
    primaryLabel: z.string(),
    priority: z.number().int(),
  })
  .passthrough();

export const coachingCardCacheDataSchema = z.object({
  kind: z.literal(HOME_SURFACE_CACHE_KIND),
  cachedAt: z.string(),
  legacyCoachingCard: coachingCardSchema.optional(),
  rankedHomeCards: z.array(homeCardLikeSchema).default([]),
  coldStart: z.boolean().optional(),
  interactionStats: homeCardInteractionStatsSchema,
});
export type CoachingCardCacheData = z.infer<typeof coachingCardCacheDataSchema>;

/**
 * Pending celebrations are stored alongside the cache wrapper but in a
 * separate jsonb column (`pending_celebrations`). The schema is a plain
 * array of the canonical pendingCelebrationSchema.
 */
export const coachingCardPendingCelebrationsSchema = z.array(
  pendingCelebrationSchema,
);
export type CoachingCardPendingCelebrations = z.infer<
  typeof coachingCardPendingCelebrationsSchema
>;

/**
 * Parse coaching_card_cache.card_data jsonb. Returns null on failure so the
 * caller can fall back to a freshly-built default cache shape rather than
 * crashing the read path.
 */
export function parseCoachingCardCacheData(
  raw: unknown,
): CoachingCardCacheData | null {
  const parsed = coachingCardCacheDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// [BUG-222] session_summaries.llm_summary
// ---------------------------------------------------------------------------
// The schema package already exports llmSummarySchema. The drizzle column
// uses `$type<LlmSummary | null>()` which is TS-only — a corrupted row would
// surface as a runtime crash several call sites later. parseSessionSummary
// returns null on parse failure so the read path can degrade to "summary not
// available yet" instead of throwing.
// ---------------------------------------------------------------------------

export const sessionSummaryLlmSummarySchema = llmSummarySchema.nullable();

export function parseSessionSummaryLlmSummary(raw: unknown): LlmSummary | null {
  if (raw === null || raw === undefined) return null;
  const parsed = llmSummarySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// [WI-1553] session_summaries.language_learning_summary
// ---------------------------------------------------------------------------
// Same additive-jsonb pattern as llm_summary above: the drizzle column uses
// `$type<LanguageSessionSummaryData | null>()` (TS-only), so a legacy row
// (column NULL — predates this WI, or a non-four_strands session that never
// wrote it) or a malformed row both parse to null via this helper rather than
// throwing. This is the mechanism behind AC4 (additive/legacy-safe).
// ---------------------------------------------------------------------------

export function parseLanguageLearningSummary(
  raw: unknown,
): LanguageSessionSummaryData | null {
  if (raw === null || raw === undefined) return null;
  const parsed = languageSessionSummarySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// [BUG-225] onboarding_drafts.exchange_history / extracted_signals
// ---------------------------------------------------------------------------
// exchange_history is an array of chat exchanges; extracted_signals is the
// fast-path interview signals envelope. Both default to empty (the schema
// column DEFAULT matches), so the parser tolerates `[]` / `{}`.
// ---------------------------------------------------------------------------

export const onboardingDraftExchangeHistorySchema = z
  .array(chatExchangeSchema)
  .default([]);
export type OnboardingDraftExchangeHistory = z.infer<
  typeof onboardingDraftExchangeHistorySchema
>;

export const onboardingDraftExtractedSignalsSchema =
  extractedInterviewSignalsSchema.partial().default({
    goals: [],
    experienceLevel: '',
    currentKnowledge: '',
  });
export type OnboardingDraftExtractedSignals =
  Partial<ExtractedInterviewSignals>;

export function parseOnboardingDraftExchangeHistory(
  raw: unknown,
): OnboardingDraftExchangeHistory | null {
  const parsed = onboardingDraftExchangeHistorySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseOnboardingDraftExtractedSignals(
  raw: unknown,
): OnboardingDraftExtractedSignals | null {
  const parsed = onboardingDraftExtractedSignalsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// [BUG-391] assessments.exchange_history
// ---------------------------------------------------------------------------
// The column is declared as bare jsonb() with no $type<…> cast, so Drizzle
// types it as `unknown`. mapAssessmentRow previously cast the value with `as
// ChatExchange[]` — a TypeScript-only cast that provides zero runtime
// validation. A corrupted row (partial backfill, schema drift, malformed
// legacy data) would propagate into shouldEndAssessmentForReview() and the
// LLM prompt builder without any error.
//
// parseAssessmentExchangeHistory returns [] on parse failure rather than null
// so the assessment flow degrades to an empty-history state (same as a brand-
// new assessment) rather than throwing at the call site.
// ---------------------------------------------------------------------------

export const assessmentExchangeHistorySchema = z
  .array(chatExchangeSchema)
  .default([]);
export type AssessmentExchangeHistory = z.infer<
  typeof assessmentExchangeHistorySchema
>;

export function parseAssessmentExchangeHistory(
  raw: unknown,
): AssessmentExchangeHistory {
  const parsed = assessmentExchangeHistorySchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

// ---------------------------------------------------------------------------
// [WI-986] learning_profiles.strengths / learning_profiles.struggles — JSONB
// ---------------------------------------------------------------------------
// These columns are typed as `unknown` by Drizzle. Three service sites
// previously cast or minimally filtered them without per-element Zod
// validation, allowing a malformed element (missing .topics, wrong
// .confidence type) to silently corrupt curated-memory / projection output.
//
// Pattern mirrors interestsArraySchema: parse the full array, drop + log
// invalid elements so DB drift is observable but never silent.
// ---------------------------------------------------------------------------

export { strengthEntrySchema, focusAreaEntrySchema };
export type { StrengthEntry, FocusAreaEntry };

/**
 * Per-element-validated array for learning_profiles.strengths JSONB.
 * Uses z.array with per-element safeParse drop semantics (see parseStrengthArray).
 */
export const strengthArraySchema = z.array(strengthEntrySchema);
export type StrengthArray = StrengthEntry[];

/**
 * Per-element-validated array for learning_profiles.struggles JSONB.
 * Uses z.array with per-element safeParse drop semantics (see parseFocusAreaArray).
 */
export const focusAreaArraySchema = z.array(focusAreaEntrySchema);
export type FocusAreaArray = FocusAreaEntry[];

/**
 * Parse learning_profiles.strengths JSONB. Invalid elements are dropped and
 * logged so DB drift is observable. Returns [] on non-array input.
 */
export function parseStrengthArray(raw: unknown): StrengthEntry[] {
  if (!Array.isArray(raw)) return [];
  const result: StrengthEntry[] = [];
  for (const item of raw) {
    const parsed = strengthEntrySchema.safeParse(item);
    if (parsed.success) {
      result.push(parsed.data);
    } else {
      console.warn(
        '[db-jsonb] Dropped invalid strengthEntry:',
        parsed.error.issues,
      );
    }
  }
  return result;
}

/**
 * Parse learning_profiles.struggles JSONB. Invalid elements are dropped and
 * logged so DB drift is observable. Returns [] on non-array input.
 */
export function parseFocusAreaArray(raw: unknown): FocusAreaEntry[] {
  if (!Array.isArray(raw)) return [];
  const result: FocusAreaEntry[] = [];
  for (const item of raw) {
    const parsed = focusAreaEntrySchema.safeParse(item);
    if (parsed.success) {
      result.push(parsed.data);
    } else {
      console.warn(
        '[db-jsonb] Dropped invalid focusAreaEntry:',
        parsed.error.issues,
      );
    }
  }
  return result;
}
