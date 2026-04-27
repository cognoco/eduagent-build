import { z } from 'zod';

export const explanationStyleSchema = z.enum([
  'stories',
  'examples',
  'diagrams',
  'analogies',
  'step-by-step',
  'humor',
]);
export type ExplanationStyle = z.infer<typeof explanationStyleSchema>;

export const pacePreferenceSchema = z.enum(['quick', 'thorough']);
export type PacePreference = z.infer<typeof pacePreferenceSchema>;

export const challengeResponseSchema = z.enum(['motivated', 'discouraged']);
export type ChallengeResponse = z.infer<typeof challengeResponseSchema>;

export const confidenceLevelSchema = z.enum(['low', 'medium', 'high']);
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;

export const engagementLevelSchema = z.enum(['high', 'medium', 'low']);
export type EngagementLevel = z.infer<typeof engagementLevelSchema>;

export const memorySourceSchema = z.enum(['inferred', 'learner', 'parent']);
export type MemorySource = z.infer<typeof memorySourceSchema>;

// BKT-C.2 — per-interest context annotation. Captures *why* a subject is an
// interest so prompts can choose register: `'school'` lands the item in
// curriculum-adjacent examples; `'free_time'` lands it in motivation/lead-in
// examples; `'both'` is the neutral fallback (safest default for LLM-inferred
// additions).
export const interestContextSchema = z.enum(['free_time', 'school', 'both']);
export type InterestContext = z.infer<typeof interestContextSchema>;

export const interestEntrySchema = z.object({
  label: z.string().min(1).max(60),
  context: interestContextSchema,
});
export type InterestEntry = z.infer<typeof interestEntrySchema>;

// BKT-C.2 — forward-compatible reader: accepts legacy `string[]` rows that
// predate the shape migration and normalizes them to `InterestEntry[]` with
// context='both' on read. After 0035 migrates production data, every row is
// already InterestEntry[] on disk — the preprocessor becomes a no-op but is
// kept for defense-in-depth against any lingering legacy inputs.
export const interestsArraySchema = z.preprocess((value) => {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (typeof item === 'string') {
      return { label: item, context: 'both' as const };
    }
    return item;
  });
}, z.array(interestEntrySchema));

export const memoryConsentStatusSchema = z.enum([
  'pending',
  'granted',
  'declined',
]);
export type MemoryConsentStatus = z.infer<typeof memoryConsentStatusSchema>;

export const accommodationModeSchema = z.enum([
  'none',
  'short-burst',
  'audio-first',
  'predictable',
]);
export type AccommodationMode = z.infer<typeof accommodationModeSchema>;

export const learningStyleSchema = z
  .object({
    preferredExplanations: z.array(explanationStyleSchema).optional(),
    pacePreference: pacePreferenceSchema.optional(),
    responseToChallenge: challengeResponseSchema.optional(),
    confidence: confidenceLevelSchema.optional(),
    corroboratingSessions: z.number().int().min(0).optional(),
    source: memorySourceSchema.optional(),
  })
  .nullable();
export type LearningStyle = z.infer<typeof learningStyleSchema>;

export const strengthEntrySchema = z.object({
  subject: z.string(),
  topics: z.array(z.string()),
  confidence: confidenceLevelSchema,
  source: memorySourceSchema.optional(),
});
export type StrengthEntry = z.infer<typeof strengthEntrySchema>;

export const struggleEntrySchema = z.object({
  subject: z.string().nullable(),
  topic: z.string(),
  lastSeen: z.string().datetime(),
  attempts: z.number().int().min(1),
  confidence: confidenceLevelSchema,
  source: memorySourceSchema.optional(),
});
export type StruggleEntry = z.infer<typeof struggleEntrySchema>;

export const learningProfileSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  learningStyle: learningStyleSchema,
  // BKT-C.2 — reshape: `string[]` → `InterestEntry[]`. Reads tolerate both
  // shapes via `interestsArraySchema` preprocessor; writes must use
  // `InterestEntry` directly.
  interests: interestsArraySchema,
  strengths: z.array(strengthEntrySchema),
  struggles: z.array(struggleEntrySchema),
  communicationNotes: z.array(z.string()),
  suppressedInferences: z.array(z.string()),
  // [BUG-705 / P-9] DB column `interest_timestamps` is jsonb NOT NULL DEFAULT
  // '{}' (database/src/schema/learning-profiles.ts:30). Previously `.optional()`
  // here let the Zod schema accept undefined, masking real shape violations
  // and drifting from the row that actually comes back from the DB. Use
  // `.default({})` so reads tolerate missing keys (legacy rows from before
  // the DEFAULT was added) and writes still produce a valid object.
  interestTimestamps: z.record(z.string(), z.string()).default({}),
  effectivenessSessionCount: z.number().int().default(0),
  memoryEnabled: z.boolean(),
  memoryConsentStatus: memoryConsentStatusSchema.default('pending'),
  consentPromptDismissedAt: z.string().datetime().nullable().optional(),
  memoryCollectionEnabled: z.boolean().default(false),
  memoryInjectionEnabled: z.boolean().default(true),
  accommodationMode: accommodationModeSchema.default('none'),
  recentlyResolvedTopics: z.array(z.string()).default([]),
  version: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LearningProfile = z.infer<typeof learningProfileSchema>;

export const sessionAnalysisOutputSchema = z.object({
  explanationEffectiveness: z
    .object({
      effective: z.array(explanationStyleSchema),
      ineffective: z.array(explanationStyleSchema),
    })
    .nullable(),
  interests: z.array(z.string()).nullable(),
  strengths: z
    .array(
      z.object({
        topic: z.string(),
        subject: z.string().nullable(),
        source: memorySourceSchema.optional(),
      })
    )
    .nullable(),
  struggles: z
    .array(
      z.object({
        topic: z.string(),
        subject: z.string().nullable(),
        source: memorySourceSchema.optional(),
      })
    )
    .nullable(),
  resolvedTopics: z
    .array(
      z.object({
        topic: z.string(),
        subject: z.string().nullable(),
      })
    )
    .nullable(),
  communicationNotes: z.array(z.string()).nullable(),
  engagementLevel: engagementLevelSchema.nullable(),
  confidence: confidenceLevelSchema,
  urgencyDeadline: z
    .object({
      reason: z.string(),
      daysFromNow: z.number().int().min(1).max(30),
    })
    .nullable()
    .optional(),
});
export type SessionAnalysisOutput = z.infer<typeof sessionAnalysisOutputSchema>;

export const deleteMemoryItemSchema = z.object({
  category: z.enum([
    'interests',
    'strengths',
    'struggles',
    'communicationNotes',
    'learningStyle',
  ]),
  value: z.string().min(1),
  subject: z.string().optional(),
  suppress: z.boolean().optional(),
});
export type DeleteMemoryItemInput = z.infer<typeof deleteMemoryItemSchema>;

export const toggleMemoryEnabledSchema = z.object({
  memoryEnabled: z.boolean(),
});
export type ToggleMemoryEnabledInput = z.infer<
  typeof toggleMemoryEnabledSchema
>;

export const toggleMemoryCollectionSchema = z.object({
  memoryCollectionEnabled: z.boolean(),
});
export type ToggleMemoryCollectionInput = z.infer<
  typeof toggleMemoryCollectionSchema
>;

export const toggleMemoryInjectionSchema = z.object({
  memoryInjectionEnabled: z.boolean(),
});
export type ToggleMemoryInjectionInput = z.infer<
  typeof toggleMemoryInjectionSchema
>;

export const grantMemoryConsentSchema = z.object({
  consent: z.enum(['granted', 'declined']),
});
export type GrantMemoryConsentInput = z.infer<typeof grantMemoryConsentSchema>;

// BKT-C.2 — wholesale replace of interests with context-tagged entries. Used
// by the per-interest picker at the end of the onboarding interview. Writes
// through createScopedRepository(profileId) in the onboarding service.
export const onboardingInterestsContextPatchSchema = z.object({
  interests: z.array(interestEntrySchema).max(20),
});
export type OnboardingInterestsContextPatch = z.infer<
  typeof onboardingInterestsContextPatchSchema
>;

export const tellMentorInputSchema = z.object({
  text: z.string().min(1).max(500),
  childProfileId: z.string().uuid().optional(),
});
export type TellMentorInput = z.infer<typeof tellMentorInputSchema>;

export const unsuppressInferenceSchema = z.object({
  value: z.string().min(1),
});
export type UnsuppressInferenceInput = z.infer<
  typeof unsuppressInferenceSchema
>;

// --- Accommodation Modes (FR253) ---

export const updateAccommodationModeSchema = z.object({
  accommodationMode: accommodationModeSchema,
});
export type UpdateAccommodationModeInput = z.infer<
  typeof updateAccommodationModeSchema
>;
