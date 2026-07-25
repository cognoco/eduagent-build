import { z } from 'zod';

/**
 * [WI-2690] Shared contract for the DB-mastered habitual-residence country
 * matrix and the typed jurisdiction decision it produces.
 *
 * This module deliberately contains NO country list, NO regime list, and NO
 * Article 8 threshold values. Those are volatile legal data and live in the
 * `country_policy_registry` / `regimes` tables (MMT-ADR-0013 — policy-engine
 * spine; records the *shape* of the policy model and leaves the live values
 * DB-mastered). What lives here is only the shape every consumer agrees on.
 */

/** ISO 3166-1 alpha-2, uppercase. Lowercase is rejected, not coerced. */
export const countryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, 'Expected an uppercase ISO 3166-1 alpha-2 country code');

/**
 * ISO 3166-1 alpha-2 reserves a handful of codes that are not countries. Only
 * the ones a caller in this codebase can realistically pass are listed: `EU`
 * and `EZ` (European Union — and the value our legacy three-way
 * `locationSchema` bucket emits, so a leaked legacy bucket is caught here
 * rather than silently treated as a country), `UK` (the United Kingdom's ISO
 * code is `GB`), and `UN`. Anything else that is two uppercase letters is
 * treated as a real country and resolves to "unsupported" when the registry
 * has no row for it.
 */
export const NON_COUNTRY_ALPHA2_CODES = new Set(['EU', 'EZ', 'UK', 'UN']);

/**
 * How the learner's habitual residence was asserted. Only these methods may be
 * the PRIMARY assertion — GDPR habitual residence is a fact about the person,
 * so it is either stated by them or evidenced by a credential.
 */
export const residencePrimaryMethodSchema = z.enum([
  'self_report',
  'verified_credential',
]);
export type ResidencePrimaryMethod = z.infer<
  typeof residencePrimaryMethodSchema
>;

/**
 * Signals that may CORROBORATE habitual residence but never replace it
 * (WI-2690 AC6). Each of these is a fact about a device, a payment instrument,
 * or a storefront account — not about where the person habitually lives.
 */
export const residenceCorroboratingMethodSchema = z.enum([
  'billing_address',
  'geo_ip',
  'storefront_country',
  'device_locale',
]);
export type ResidenceCorroboratingMethod = z.infer<
  typeof residenceCorroboratingMethodSchema
>;

/**
 * `confidence` is recorded for audit but is deliberately NOT thresholded in
 * application code: a minimum-confidence value is a policy value, and policy
 * values are DB-mastered (AC1). Sufficiency here is decided by the method
 * CLASS — a corroborating-only signal is insufficient however confident it is.
 */
export const residenceAssuranceSchema = z.object({
  method: residencePrimaryMethodSchema,
  confidence: z.number().min(0).max(1),
  assertedAt: z.date(),
  corroboratingMethods: z.array(residenceCorroboratingMethodSchema),
});
export type ResidenceAssurance = z.infer<typeof residenceAssuranceSchema>;

/** Who must act for the learner's processing to have a lawful basis. */
export const authorizationFormSchema = z.enum([
  'self',
  'guardian',
  'joint_child_guardian',
]);
export type AuthorizationForm = z.infer<typeof authorizationFormSchema>;

export const launchStatusSchema = z.enum(['enabled', 'blocked']);
export type LaunchStatus = z.infer<typeof launchStatusSchema>;

export const legalVerificationStatusSchema = z.enum(['verified', 'unverified']);
export type LegalVerificationStatus = z.infer<
  typeof legalVerificationStatusSchema
>;

/**
 * Where AI processing for this country may happen. A stable POLICY class, not
 * a vendor or model choice — the country matrix never selects a provider
 * (AC7). Provider eligibility is resolved separately by the policy-engine
 * router against this class.
 */
export const processingLocationClassSchema = z.enum(['eea_only', 'blocked']);
export type ProcessingLocationClass = z.infer<
  typeof processingLocationClassSchema
>;

/** A citable legal source for one registry row. */
export const policySourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  checkedAt: z.date(),
});
export type PolicySource = z.infer<typeof policySourceSchema>;

/**
 * The controller-approved launch gates that must ALL close before a country
 * may be enabled. A threshold of 13 is not by itself a legal-risk clearance
 * (AC3) — these are the rest of the clearance.
 */
export const controllerGatesSchema = z.object({
  externalPrivacyLegalReview: z.boolean(),
  aiActClassification: z.boolean(),
  reliableAgeAndResidence: z.boolean(),
  childTransparency: z.boolean(),
  adultCommercialRelationship: z.boolean(),
  countryAllowlist: z.boolean(),
  operationalRightsAndIncidents: z.boolean(),
  launchDayLegalRefresh: z.boolean(),
});
export type ControllerGates = z.infer<typeof controllerGatesSchema>;

export const CONTROLLER_GATE_KEYS = Object.keys(
  controllerGatesSchema.shape,
) as (keyof ControllerGates)[];

/**
 * One effective-dated row of the country matrix. `regimeKey` is a free string
 * because the live regime taxonomy is DB-mastered in `regimes.code`
 * (MMT-ADR-0013) — reproducing it as an enum here would create the second
 * source of truth AC1 forbids.
 */
export const countryPolicyRecordSchema = z
  .object({
    countryCode: countryCodeSchema,
    countryName: z.string().min(1),
    regimeKey: z.string().min(1),
    article8Threshold: z.number().int().min(13).max(16),
    authorizationForm: authorizationFormSchema,
    launchStatus: launchStatusSchema,
    launchBlockReason: z.string().min(1).nullable(),
    legalVerificationStatus: legalVerificationStatusSchema,
    legalReviewedAt: z.date(),
    legalReviewValidUntil: z.date(),
    launchDayReviewRequired: z.boolean(),
    processingLocationClass: processingLocationClassSchema,
    policyVersion: z.string().min(1),
    effectiveAt: z.date(),
    expiresAt: z.date().nullable(),
    sourceProvenance: z.array(policySourceSchema).min(1),
    controllerGates: controllerGatesSchema,
  })
  .superRefine((record, ctx) => {
    if (record.launchStatus === 'enabled') {
      if (record.legalVerificationStatus !== 'verified') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['legalVerificationStatus'],
          message: 'An enabled country must be legally verified',
        });
      }
      const openGate = CONTROLLER_GATE_KEYS.find(
        (key) => !record.controllerGates[key],
      );
      if (openGate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['controllerGates', openGate],
          message: `An enabled country must have every controller gate closed (${openGate} is open)`,
        });
      }
    } else if (record.launchBlockReason === null) {
      // AC4: a blocked country carries a stable fast-follow reason so the
      // block is explainable without reading application code.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['launchBlockReason'],
        message: 'A blocked country must record a launch block reason',
      });
    }
  });
export type CountryPolicyRecord = z.infer<typeof countryPolicyRecordSchema>;

/**
 * Age band relative to the LAUNCH floor and the country's Article 8 threshold.
 * Distinct from `AgeBracket` in `./age.ts`, which is a product/theming concept.
 */
export const consentAgeBandSchema = z.enum([
  'below_minimum',
  'guardian_required_minor',
  'consent_capable_minor',
  'adult',
]);
export type ConsentAgeBand = z.infer<typeof consentAgeBandSchema>;

/**
 * Whether the law REQUIRES a consent act — deliberately separate from
 * `consentStatusSchema` in `./consent.ts`, which records whether one was
 * OBTAINED. A pure policy function can answer the former and never the latter.
 */
export const consentRequirementStatusSchema = z.enum([
  'NOT_REQUIRED',
  'REQUIRED_PENDING',
]);
export type ConsentRequirementStatus = z.infer<
  typeof consentRequirementStatusSchema
>;

export const consentAssuranceLevelSchema = z.enum([
  'SELF_DECLARED',
  'VERIFIED',
]);
export type ConsentAssuranceLevel = z.infer<typeof consentAssuranceLevelSchema>;

/** The purposes a consent decision scopes. */
export const consentPurposeScopeSchema = z.object({
  core: z.boolean(),
  thirdPartyShare: z.boolean(),
  targetedAds: z.boolean(),
  aiTraining: z.boolean(),
});
export type ConsentPurposeScope = z.infer<typeof consentPurposeScopeSchema>;

/**
 * The consent-focused interface downstream consumers read (AC2). Consumers
 * must NOT infer geography from it beyond `jurisdiction`, and must never infer
 * provider or model choice from it at all.
 */
export const ageConsentDecisionSchema = z.object({
  ageBand: consentAgeBandSchema,
  consentStatus: consentRequirementStatusSchema,
  assuranceLevel: consentAssuranceLevelSchema,
  consentMethod: residencePrimaryMethodSchema,
  jurisdiction: countryCodeSchema,
  purposeScope: consentPurposeScopeSchema,
  retentionExpiresAt: z.date().nullable(),
  receiptId: z.string().min(1).nullable(),
});
export type AgeConsentDecision = z.infer<typeof ageConsentDecisionSchema>;

/**
 * Every reason a decision can be blocked. Stable, auditable codes — never
 * free text, so an operator can grep a block back to its cause.
 */
export const policyReasonCodeSchema = z.enum([
  'COUNTRY_UNKNOWN',
  'COUNTRY_INVALID',
  'COUNTRY_UNSUPPORTED',
  'COUNTRY_BLOCKED',
  'CONTROLLER_GATES_OPEN',
  'LEGAL_VERIFICATION_UNVERIFIED',
  'LEGAL_REVIEW_STALE',
  'POLICY_NOT_EFFECTIVE',
  'POLICY_STALE',
  'RESIDENCE_ASSURANCE_INSUFFICIENT',
  'BELOW_LAUNCH_MINIMUM_AGE',
]);
export type PolicyReasonCode = z.infer<typeof policyReasonCodeSchema>;

export const launchDecisionSchema = z.enum(['allowed', 'blocked']);
export type LaunchDecision = z.infer<typeof launchDecisionSchema>;

/**
 * The single typed result every consumer reads. Nullable fields are null
 * exactly when no registry row could be resolved — a fail-closed decision
 * still carries its reason codes.
 */
export const countryPolicyDecisionSchema = z.object({
  habitualResidence: countryCodeSchema.nullable(),
  regimeKey: z.string().min(1).nullable(),
  launchDecision: launchDecisionSchema,
  consentDecision: ageConsentDecisionSchema.nullable(),
  processingLocationClass: processingLocationClassSchema.nullable(),
  policyVersion: z.string().min(1).nullable(),
  effectiveAt: z.date().nullable(),
  reasonCodes: z.array(policyReasonCodeSchema),
  article8Threshold: z.number().int().min(13).max(16).nullable(),
  authorizationForm: authorizationFormSchema.nullable(),
  legalRefreshRequired: z.boolean(),
});
export type CountryPolicyDecision = z.infer<typeof countryPolicyDecisionSchema>;
