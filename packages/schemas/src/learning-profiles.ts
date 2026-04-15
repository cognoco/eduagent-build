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
  interests: z.array(z.string()),
  strengths: z.array(strengthEntrySchema),
  struggles: z.array(struggleEntrySchema),
  communicationNotes: z.array(z.string()),
  suppressedInferences: z.array(z.string()),
  interestTimestamps: z.record(z.string(), z.string()).optional(),
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
