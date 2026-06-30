import { z } from 'zod';
import { PROFILE_MINIMUM_AGE } from './age.ts';
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
export const PRONOUNS_PROMPT_MIN_AGE = PROFILE_MINIMUM_AGE;

export const birthYearSchema = z
  .number()
  .int()
  .refine((y) => y >= new Date().getFullYear() - 120, {
    message: 'birthYear is too far in the past',
  })
  .refine((y) => y <= new Date().getFullYear(), {
    message: 'birthYear cannot be in the future',
  })
  // WI-570 (data-model.md §2A.5): v1 launch floor is 13+ (was 11+).
  // birthYearSchema flips ≤ currentYear-11 → ≤ currentYear-13 per the
  // ratified data model. The ≤ threshold compensates for the month-level
  // overestimation in computeAgeBracket (currentYear - birthYear): a user
  // born in December of (currentYear - 13) could be only 12 years old,
  // so we require birthYear ≤ (currentYear - 13) for the v1 floor.
  // Ships with this documented rationale (data-model.md §2A.5 requirement).
  .refine((y) => y <= new Date().getFullYear() - PROFILE_MINIMUM_AGE, {
    message: `birthYear must correspond to a minimum age of ${PROFILE_MINIMUM_AGE}`,
  });

export const profileCreateSchema = z
  .object({
    displayName: z.string().min(1).max(50),
    birthYear: birthYearSchema,
    // WI-297 / WI-367: Optional full birth date components for exact age.
    // Used server-side at create to compute consent requirements precisely, and
    // (WI-367) now persisted to profiles.birth_month / birth_day so post-hoc age
    // reads (consent-revocation COPPA boundary, add-child adult gate) compute
    // exact age. Create-only/immutable — profileUpdateSchema omits them.
    birthMonth: z.number().int().min(1).max(12).optional(),
    birthDay: z.number().int().min(1).max(31).optional(),
    avatarUrl: z.string().url().optional(),
    location: locationSchema.optional(),
    conversationLanguage: conversationLanguageSchema.optional(),
    pronouns: pronounsSchema.nullable().optional(),
    // WI-811: flag-on add-child discriminator. Absent = owner bootstrap/replay
    // (the historical payload). Flag-off ignores it entirely — the legacy
    // createProfileWithLimitCheck classifies first-vs-child by profile COUNT,
    // so existing payloads stay byte-identical. Under IDENTITY_V2_ENABLED,
    // kind:'child' routes the post-graph POST to createChildProfileV2 instead
    // of the idempotent owner replay.
    kind: z.enum(['owner', 'child']).optional(),
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
  .omit({
    birthYear: true,
    location: true,
    birthMonth: true,
    birthDay: true,
    // WI-811: `kind` is create-only (owner-vs-child at creation), never patched.
    kind: true,
  })
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

// [CR-2026-05-21-181 / BUG-projectSchemaAccountIdLeak] Internal vs public split.
//
// `internalProfileSchema` is the server-side shape — it includes `accountId`
// because billing, family-link resolution, and ownership checks all need it.
// Service-layer code (services/profile.ts, services/billing/family.ts) reads
// rows mapped to this shape and never sends them directly over the wire.
//
// `publicProfileSchema` is the client-facing shape — it omits `accountId`.
// On a family plan, multiple profiles share a single accountId; exposing it
// to mobile lets a client correlate sibling profiles back to one account
// holder (a stable identifier that survives profile switches). Mobile code
// never reads `profile.accountId`; ownership-style checks use `isOwner` and
// the active `profileId` from the JWT/session, not accountId equality.
// All `/profiles*` route responses serialize through the public schema.
//
// `profileSchema` stays as an alias of `internalProfileSchema` for backward
// compatibility with existing server-side consumers (profile.ts, family.ts,
// test factories). Routes MUST use `profileResponseSchema` /
// `profileListResponseSchema` (which wrap the public shape) for client
// responses — see `clientFacingProfileSchemaShape` guard test below.
const profileSchemaShape = {
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
} as const;

export const internalProfileSchema = z.object(profileSchemaShape);
export type InternalProfile = z.infer<typeof internalProfileSchema>;

/**
 * Backward-compat alias of {@link internalProfileSchema}. Server-side service
 * code that reads DB rows mapped to the full shape (including `accountId`)
 * should keep using this. New code that ships a profile to a client MUST use
 * {@link publicProfileSchema} via the response envelope schemas below.
 */
export const profileSchema = internalProfileSchema;
export type Profile = z.infer<typeof profileSchema>;

/**
 * Client-facing profile shape. Omits `accountId` to prevent cross-profile
 * correlation by the mobile client (a stable per-account identifier that
 * survives profile switches and would leak across owner/child boundaries
 * on a family plan).
 */
export const publicProfileSchema = internalProfileSchema.omit({
  accountId: true,
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

// ---------------------------------------------------------------------------
// Route response envelope schemas
// Used in routes/profiles.ts to validate outgoing JSON bodies. These wrap the
// PUBLIC shape so `accountId` cannot accidentally cross the trust boundary.
// ---------------------------------------------------------------------------

export const profileResponseSchema = z.object({
  profile: publicProfileSchema,
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

export const profileListResponseSchema = z.object({
  profiles: z.array(publicProfileSchema),
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
