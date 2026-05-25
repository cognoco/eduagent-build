import { z } from 'zod';
import { isoDateField } from './common.ts';
import { consentStatusSchema } from './consent.ts';

export const locationSchema = z.enum(['EU', 'US', 'OTHER']);
export type LocationType = z.infer<typeof locationSchema>;

// BKT-C.1 — the tutor's speaking language. ISO 639-1. This is now the union
// of UI locales plus older mentor-only locales retained for existing rows.
export const conversationLanguageSchema = z.enum([
  'en',
  'cs',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'pl',
  'ja',
  'nb',
]);
export type ConversationLanguage = z.infer<typeof conversationLanguageSchema>;

// BKT-C.1 — optional, learner-owned free text. Max 32 chars enforced as
// defence-in-depth: this Zod check at the API/RPC boundary AND a CHECK
// constraint at the DB layer (migration 0052_fixed_hex). Stored as-is
// (no LLM validation).
export const pronounsSchema = z.string().min(1).max(32);
export type Pronouns = z.infer<typeof pronounsSchema>;

export const appContextSchema = z.enum(['study', 'family']);
export type AppContext = z.infer<typeof appContextSchema>;

// BKT-C.1 — age cutoff for pronouns prompt during onboarding (COPPA-transition
// age; below this, the field is never prompted and stays null).
export const PRONOUNS_PROMPT_MIN_AGE = 13;

export const birthYearSchema = z
  .number()
  .int()
  .refine((y) => y >= new Date().getFullYear() - 120, {
    message: 'birthYear is too far in the past',
  })
  .refine((y) => y <= new Date().getFullYear(), {
    message: 'birthYear cannot be in the future',
  })
  // [CR-2026-05-19-H11] Product is strictly 11+. Reject birth years that
  // would compute to age < 11 via `computeAgeBracket` (currentYear - birthYear).
  // The ≤ threshold compensates for the month-level overestimation in
  // that formula: a child born in December of (currentYear - 11) could be
  // only 10 years old, so we require birthYear ≤ (currentYear - 11).
  .refine((y) => y <= new Date().getFullYear() - 11, {
    message: 'birthYear must correspond to a minimum age of 11',
  });

export const profileCreateSchema = z
  .object({
    displayName: z.string().min(1).max(50),
    birthYear: birthYearSchema,
    // WI-297: Optional full birth date components for exact age calculation.
    // Persisted only as birthYear in the DB — these are used server-side to
    // compute consent requirements precisely (avoids year-only overestimation).
    birthMonth: z.number().int().min(1).max(12).optional(),
    birthDay: z.number().int().min(1).max(31).optional(),
    avatarUrl: z.string().url().optional(),
    location: locationSchema.optional(),
    conversationLanguage: conversationLanguageSchema.optional(),
    pronouns: pronounsSchema.nullable().optional(),
  })
  .strict();

export type ProfileCreateInput = z.infer<typeof profileCreateSchema>;

// Mirrors profileCreateSchema minus birthYear/location/birthMonth/birthDay.
// When you add a new field to profileCreateSchema that should be user-editable
// post-onboarding, it auto-flows through .partial() — but if it should also be
// patchable via the dedicated single-field onboarding endpoints below, add a
// parallel onboarding*PatchSchema. Keep these in sync.
// NOTE: birthMonth/birthDay are create-only (used for exact age calculation at
// creation, never persisted); they must not appear in PATCH payloads.
export const profileUpdateSchema = profileCreateSchema
  .partial()
  .omit({ birthYear: true, location: true, birthMonth: true, birthDay: true })
  .strict();
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// BKT-C.1 — onboarding endpoint bodies. Each is a single-field PATCH so the
// wire contract is clear and each step can be retried independently without
// risking a merged write. NOTE: every field here MUST also be present in
// profileUpdateSchema (and therefore profileCreateSchema) — these are parallel
// paths into the same DB columns.
export const onboardingLanguagePatchSchema = z
  .object({
    conversationLanguage: conversationLanguageSchema,
  })
  .strict();
export type OnboardingLanguagePatch = z.infer<
  typeof onboardingLanguagePatchSchema
>;

// null clears the field; a string must be 1..32 chars.
export const onboardingPronounsPatchSchema = z
  .object({
    pronouns: pronounsSchema.nullable(),
  })
  .strict();
export type OnboardingPronounsPatch = z.infer<
  typeof onboardingPronounsPatchSchema
>;

export const profileAppContextUpdateSchema = z
  .object({
    defaultAppContext: appContextSchema,
  })
  .strict();
export type ProfileAppContextUpdateInput = z.infer<
  typeof profileAppContextUpdateSchema
>;

export const profileSwitchSchema = z
  .object({
    profileId: z.string().uuid(),
  })
  .strict();

export type ProfileSwitchInput = z.infer<typeof profileSwitchSchema>;

export const profileSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  birthYear: birthYearSchema,
  location: locationSchema.nullable(),
  isOwner: z.boolean(),
  hasPremiumLlm: z.boolean().default(false),
  defaultAppContext: appContextSchema.nullable().default(null),
  hasFamilyLinks: z.boolean().default(false),
  // BKT-C.1 — default 'en' so legacy profiles parse cleanly before the backfill
  // migration runs. After 0035 migrates, every row has a real value.
  conversationLanguage: conversationLanguageSchema.default('en'),
  pronouns: pronounsSchema.nullable().default(null),
  consentStatus: consentStatusSchema.nullable(),
  linkCreatedAt: isoDateField.nullable(),
  createdAt: isoDateField,
  updatedAt: isoDateField,
});

export type Profile = z.infer<typeof profileSchema>;

// ---------------------------------------------------------------------------
// Route response envelope schemas
// Used in routes/profiles.ts to validate outgoing JSON bodies.
// ---------------------------------------------------------------------------

export const profileResponseSchema = z.object({
  profile: profileSchema,
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

export const profileListResponseSchema = z.object({
  profiles: z.array(profileSchema),
});
export type ProfileListResponse = z.infer<typeof profileListResponseSchema>;

export const profileSwitchResponseSchema = z.object({
  message: z.string(),
  profileId: z.string().uuid(),
});
export type ProfileSwitchResponse = z.infer<typeof profileSwitchResponseSchema>;

// BKT-C.1 / BKT-C.2 — response schema for the onboarding single-field PATCH
// endpoints (language, pronouns, interests/context). All six variants return
// the same shape: { success: true }.
export const onboardingSuccessResponseSchema = z.object({
  success: z.literal(true),
});
export type OnboardingSuccessResponse = z.infer<
  typeof onboardingSuccessResponseSchema
>;

/**
 * Number of completed sessions before a learner is no longer considered "new".
 * When session count is below this, the dashboard shows a "getting started"
 * teaser and the mobile profile UI shows progressive disclosure scaffolding.
 * Both must agree or the parent reads a contradictory summary (the API
 * dashboard headline says "X sessions so far" while mobile shows "Y more
 * sessions to unlock full progress"). [BUG-906]
 *
 * This is the single source of truth — the API (dashboard.ts) and mobile
 * (progressive-disclosure.ts) both import from here so drift is impossible.
 */
export const NEW_LEARNER_SESSION_THRESHOLD = 4;
