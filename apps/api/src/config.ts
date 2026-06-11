import { z } from 'zod';

const envSchema = z.object({
  ENVIRONMENT: z
    .enum(['development', 'staging', 'production'])
    .default('development'),
  DATABASE_URL: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  CLERK_JWKS_URL: z.string().url().optional(),
  CLERK_AUDIENCE: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  // Interactive-routing v2 vendors (MMT-ADR-0016 §1.5). Optional: registered
  // when present (middleware/llm.ts) but only selected behind
  // LLM_ROUTING_V2_ENABLED, so absence is inert until cutover.
  CEREBRAS_API_KEY: z.string().min(1).optional(),
  MISTRAL_API_KEY: z.string().min(1).optional(),
  APP_URL: z.string().url().default('https://www.mentomate.com'),
  // Optional outside production: only consent/settings email-link flows need it.
  // Keeping it optional here prevents unrelated routes from failing globally
  // in staging/dev deployments that are missing this binding.
  API_ORIGIN: z.string().url().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Stripe — optional. Dormant until web client added; mobile uses RevenueCat IAP.
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRICE_PLUS_MONTHLY: z.string().min(1).optional(),
  STRIPE_PRICE_PLUS_YEARLY: z.string().min(1).optional(),
  STRIPE_PRICE_FAMILY_MONTHLY: z.string().min(1).optional(),
  STRIPE_PRICE_FAMILY_YEARLY: z.string().min(1).optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().min(1).optional(),
  STRIPE_PRICE_PRO_YEARLY: z.string().min(1).optional(),
  STRIPE_CUSTOMER_PORTAL_URL: z.string().url().optional(),

  // Voyage AI — embedding provider
  VOYAGE_API_KEY: z.string().min(1).optional(),

  // Resend — transactional email
  RESEND_API_KEY: z.string().min(1).optional(),
  // Resend webhook signing secret (whsec_... format from Resend dashboard)
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
  EMAIL_FROM: z.string().email().default('noreply@mentomate.com'),

  // [Bug #872] Parental consent policy version. Stored alongside each
  // consent_states row so we can answer "which policy version did the parent
  // consent to" without depending on Cloudflare access logs (which roll over).
  // Bump this in Doppler whenever the GDPR/COPPA consent copy or terms
  // change. Format is freeform; suggest ISO date or semver.
  CONSENT_POLICY_VERSION: z.string().min(1).default('2026-05-31'),

  // Sentry — error tracking
  SENTRY_DSN: z.string().url().optional(),

  // Test seed — shared secret for /__test/* routes (optional, dev/staging only)
  TEST_SEED_SECRET: z.string().min(1).optional(),

  // Maintenance endpoints — optional, managed through Doppler when an
  // operator needs to trigger one-shot backfills.
  MAINTENANCE_SECRET: z.string().min(1).optional(),

  // RevenueCat — webhook authentication
  REVENUECAT_WEBHOOK_SECRET: z.string().min(1).optional(),

  // Inngest — webhook signing key (validates inbound calls from Inngest Cloud
  // to /v1/inngest) and event ingestion key (outbound inngest.send()). Both
  // must be set per-environment in Doppler (mentomate dev/stg/prd). Without
  // a signing key the `serve()` helper from `inngest/hono` accepts unsigned
  // POSTs (dev posture). With wrong-env signing key, Inngest Cloud's request
  // signature won't verify and the cross-env webhook is rejected at the
  // Inngest SDK boundary. We add both to the schema so missing values fail
  // env-validation at boot (loud) instead of silently disabling signature
  // checks (cross-env webhook replay risk).
  // [BUG-242]
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),
  INNGEST_EVENT_KEY: z.string().min(1).optional(),

  // Empty-reply stream guard — per-request kill switch for the
  // [EMPTY-REPLY-GUARD] classifier in streamMessage.onComplete and
  // streamInterviewExchange.onComplete. When 'false', the service skips
  // classification and falls through to the legacy parse-and-persist path
  // (same behavior as before [EMPTY-REPLY-GUARD-1]). Flip to 'false' in
  // Doppler to disable the feature without redeploying if the classifier
  // misfires in production. Default: 'true'.
  EMPTY_REPLY_GUARD_ENABLED: z.enum(['true', 'false']).default('true'),

  // Retention Phase 1 — destructive transcript purge stays dark until the
  // summary-generation pipeline has baked in production long enough.
  RETENTION_PURGE_ENABLED: z.enum(['true', 'false']).default('false'),

  // Memory architecture Phase 1 — keep reads on legacy JSONB until backfill
  // and semantic parity gates pass. Dual-write is code-driven, this flag only
  // controls prompt/read reconstruction.
  MEMORY_FACTS_READ_ENABLED: z.enum(['true', 'false']).default('false'),
  MEMORY_FACTS_RELEVANCE_RETRIEVAL: z.enum(['true', 'false']).default('false'),
  MEMORY_FACTS_DEDUP_ENABLED: z.enum(['true', 'false']).default('false'),
  MEMORY_FACTS_DEDUP_THRESHOLD: z.coerce.number().min(0).max(2).default(0.15),
  MAX_DEDUP_LLM_CALLS_PER_SESSION: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .default(10),
  MEMORY_FACTS_DEDUP_ROLLOUT_PCT: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .default(0),

  // Topic intent matcher for first curriculum sessions. Keep dark by default
  // for first deploy; flip through Doppler after staging soak.
  MATCHER_ENABLED: z.enum(['true', 'false']).default('false'),

  // Prelaunch override for the IDEMPOTENCY_KV production deploy gate.
  // The idempotency middleware gates replay dedup on the IDEMPOTENCY_KV
  // KV binding; if the binding is absent the middleware silently falls
  // through to the downstream handler, leaving a real duplicate-side-effect
  // window (billing webhooks, session writes) even with signature +
  // timestamp checks. Production refuses to serve traffic in that posture
  // unless this flag is set to 'true' as an explicit prelaunch opt-in;
  // when active, env validation emits a structured warning so the
  // override remains visible in telemetry. Default: 'false' (gate on).
  ALLOW_MISSING_IDEMPOTENCY_KV: z.enum(['true', 'false']).default('false'),

  // [OPT-C] Adult-owner gate — server-side enforcement of the 18+ requirement
  // for a parent creating a child profile. Paired with the mobile-side
  // ADULT_OWNER_GATE_ENABLED feature flag (apps/mobile/src/lib/feature-flags.ts).
  // Default: true. Flip to 'false' via Doppler to disable without redeploying.
  ADULT_OWNER_GATE_ENABLED: z.enum(['true', 'false']).default('true'),

  // Challenge Round runtime — single kill switch for the Phase 1+ wiring
  // (envelope offer → state machine → mastery/weak-spot persistence → typed
  // SSE → mobile rendering). Defaults to 'false' so the wiring may merge
  // dark; flipped in Doppler only after Phase 5 read-side hardening lands
  // (resolveMasteryVerificationState integration, pending_review promotion
  // + expiry cron, no-clinical-copy ratchet). While false:
  //   - exchange-prompts.ts emits no Challenge Round prompt block
  //     (offer/active/drafting), even if state/eligibility says otherwise.
  //   - LLM `signals.challenge_round_offer` must be ignored downstream.
  //   - SSE done frames must not carry typed challengeOffer / challengeRound
  //     / draftedNote fields, so mobile has nothing to render.
  // See docs/plans/2026-05-18-challenge-round-targets.md "Rollout Gate".
  CHALLENGE_ROUND_RUNTIME_ENABLED: z.enum(['true', 'false']).default('false'),

  // Interactive routing v2 (MMT-ADR-0016 §1.5 / the gpt-oss-cerebras-build
  // spec). Default-OFF: while 'false', getModelConfig/getFallbackConfig stay
  // byte-identical to today's Gemini-default routing. Flipping to 'true' pins
  // the §1.5 matrix (Cerebras gpt-oss primary, tier-aware secondaries) and the
  // fail-closed, Gemini-forbidden fallback. The flag flip for MINOR traffic is
  // additionally gated by non-code legal prerequisites (G-P1/G-P2/G-P3) — see
  // the build spec; this flag only controls the code path.
  LLM_ROUTING_V2_ENABLED: z.enum(['true', 'false']).default('false'),

  // S1 mobile-shell flag; reserved at S0 so the name is final. No API code
  // reads this yet.
  MODE_NAV_V2_ENABLED: z.enum(['true', 'false']).default('false'),
});

export type Env = z.infer<typeof envSchema>;

export function isMemoryFactsReadEnabled(value: string | undefined): boolean {
  return value === 'true';
}

export function isMemoryFactsRelevanceEnabled(
  value: string | undefined,
): boolean {
  return value === 'true';
}

export function isMemoryFactsDedupEnabled(value: string | undefined): boolean {
  return value === 'true';
}

/**
 * Stable profile rollout gate. Hashing keeps a profile either in or out for
 * the whole rollout window, avoiding session-to-session oscillation.
 */
export function isProfileInDedupRollout(
  profileId: string,
  pct: number,
): boolean {
  if (pct <= 0) return false;
  if (pct >= 100) return true;

  let hash = 0x811c9dc5;
  const id = profileId.toLowerCase();
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100 < pct;
}

export function isTopicIntentMatcherEnabled(
  value: string | undefined,
): boolean {
  return value === 'true';
}

/**
 * Challenge Round runtime kill switch. Threaded into `ExchangeContext` as
 * `challengeRuntimeEnabled` at the route boundary; gates every CR prompt
 * block in exchange-prompts.ts and every downstream consumer of LLM
 * `signals.challenge_round_offer` / `signals.challenge_round_evaluation` /
 * `ui_hints.note_draft`.
 *
 * Default-closed: undefined / anything-other-than 'true' returns false so
 * a missing binding never accidentally enables the runtime. The full
 * rollout contract lives in
 * docs/plans/2026-05-18-challenge-round-targets.md.
 */
export function isChallengeRoundRuntimeEnabled(
  value: string | undefined,
): boolean {
  return value === 'true';
}

/**
 * Interactive routing v2 gate (MMT-ADR-0016). Threaded into the router's
 * getModelConfig/getFallbackConfig. Default-closed: undefined / anything other
 * than 'true' keeps the current Gemini-default routing so a missing binding
 * never accidentally cuts over. See the gpt-oss-cerebras-build spec.
 */
export function isLlmRoutingV2Enabled(value: string | undefined): boolean {
  return value === 'true';
}

// ---------------------------------------------------------------------------
// Auth keys — required in BOTH staging and production.
// [SEC-1 / BUG-717] CLERK_AUDIENCE must be present whenever the API handles
// real traffic. A missing audience silently disables JWT audience validation,
// allowing tokens minted for one Clerk application to authenticate to another
// sharing the same JWKS endpoint (cross-app token reuse).
// ---------------------------------------------------------------------------

const STAGING_AND_PRODUCTION_REQUIRED_KEYS: readonly (keyof Env)[] = [
  'CLERK_SECRET_KEY',
  'CLERK_JWKS_URL',
  'CLERK_AUDIENCE',
  // [BUG-242] Inngest signing + event keys must be per-env. Missing values
  // would either disable signature validation on the webhook (dev posture in
  // prod = unsigned POSTs accepted) or silently drop outbound dispatches. Both
  // are catastrophic if either staging or production has the wrong env's key,
  // so we enforce presence in both tiers and rely on Doppler to inject the
  // env-correct value.
  'INNGEST_SIGNING_KEY',
  'INNGEST_EVENT_KEY',
] as const;

// ---------------------------------------------------------------------------
// Production-critical keys — must be present when ENVIRONMENT === 'production'
// Stripe secrets optional — dormant until web client added.
// Mobile billing uses native IAP via RevenueCat (Apple/Google handle payments).
// ---------------------------------------------------------------------------

const PRODUCTION_REQUIRED_KEYS: readonly (keyof Env)[] = [
  'GEMINI_API_KEY',
  'VOYAGE_API_KEY',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'API_ORIGIN',
  'REVENUECAT_WEBHOOK_SECRET',
] as const;

/**
 * Validates that all environment-tier-critical keys are present.
 * Returns an array of missing key names (empty if all present).
 *
 * - Staging + production: Clerk auth keys (CLERK_AUDIENCE required for
 *   JWT audience validation — prevents cross-app token reuse).
 * - Production only: LLM providers, email, RevenueCat.
 */
export function validateProductionKeys(env: Env): string[] {
  if (env.ENVIRONMENT === 'development') {
    return [];
  }

  const missing: string[] = [];

  // Auth keys required for staging and production
  for (const key of STAGING_AND_PRODUCTION_REQUIRED_KEYS) {
    if (!env[key]) {
      missing.push(key);
    }
  }

  // Additional keys required only in production
  if (env.ENVIRONMENT === 'production') {
    for (const key of PRODUCTION_REQUIRED_KEYS) {
      if (!env[key]) {
        missing.push(key);
      }
    }
  }

  return missing;
}

// ---------------------------------------------------------------------------
// Production KV-binding gate
//
// IDEMPOTENCY_KV is a runtime KVNamespace object on c.env, not a string —
// it cannot be parsed by the zod env schema. This validator runs in the
// env-validation middleware after validateEnv() and short-circuits with
// 500 ENV_VALIDATION_ERROR if production is missing the binding without
// the explicit prelaunch override. Override use is escalated via a
// structured warning so it remains visible in telemetry.
// ---------------------------------------------------------------------------

export interface ProductionBindings {
  IDEMPOTENCY_KV?: unknown;
}

export interface BindingValidationResult {
  missing: string[];
  overrideApplied: boolean;
}

export function validateProductionBindings(
  env: Env,
  bindings: ProductionBindings,
): BindingValidationResult {
  if (env.ENVIRONMENT !== 'production') {
    return { missing: [], overrideApplied: false };
  }

  const missing: string[] = [];
  let overrideApplied = false;

  if (bindings.IDEMPOTENCY_KV == null) {
    if (env.ALLOW_MISSING_IDEMPOTENCY_KV === 'true') {
      overrideApplied = true;
    } else {
      missing.push('IDEMPOTENCY_KV');
    }
  }

  return { missing, overrideApplied };
}

export function validateEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const formatted = result.error.flatten();
    throw new Error(
      `Invalid environment: ${JSON.stringify(formatted.fieldErrors)}`,
    );
  }

  const env = result.data;
  const missingKeys = validateProductionKeys(env);
  if (missingKeys.length > 0) {
    throw new Error(
      `Production environment missing required keys: ${missingKeys.join(', ')}`,
    );
  }

  return env;
}
