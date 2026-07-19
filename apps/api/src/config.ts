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
  SUPPORT_EMAIL: z.string().email().default('support@mentomate.com'),

  // [Bug #872] Parental consent policy version. Stored alongside each
  // consent_states row so we can answer "which policy version did the parent
  // consent to" without depending on Cloudflare access logs (which roll over).
  // Bump this in Doppler whenever the GDPR/COPPA consent copy or terms
  // change. Format is freeform; suggest ISO date or semver.
  CONSENT_POLICY_VERSION: z.string().min(1).default('2026-05-31'),

  // [P0 email-consent-withdrawal] Dedicated HMAC secret for the stateless,
  // non-expiring consent-withdrawal token emailed to the email-consenting
  // parent (who has no account / no guardianship edge). Independent of any
  // consent *response* token so a leak of one never compromises the other.
  // min(32) like ANALYTICS_HASH_KEY. Read only by the consent-web routes via
  // Bindings; never logged, never exposed through EXPO_PUBLIC_*. Production-
  // required (see PRODUCTION_REQUIRED_BASE_KEYS): a missing secret would make
  // the GDPR Art. 7(3) withdrawal link unsignable/unverifiable — a silent
  // compliance failure — so we fail prod boot loudly instead.
  CONSENT_WITHDRAWAL_TOKEN_SECRET: z.string().min(32).optional(),

  // Sentry — error tracking
  SENTRY_DSN: z.string().url().optional(),

  // Analytics profile pseudonymisation — server-only HMAC key. Never expose
  // this through EXPO_PUBLIC_*; mobile obtains hashes from the API route.
  ANALYTICS_HASH_KEY: z.string().min(32).optional(),

  // Test seed — shared secret for /__test/* routes (optional, dev/staging only)
  TEST_SEED_SECRET: z.string().min(1).optional(),

  // Maintenance endpoints — optional, managed through Doppler when an
  // operator needs to trigger one-shot backfills.
  MAINTENANCE_SECRET: z.string().min(1).optional(),

  // RevenueCat — webhook authentication plus REST API access for GDPR store teardown
  REVENUECAT_WEBHOOK_SECRET: z.string().min(1).optional(),
  REVENUECAT_REST_API_KEY: z.string().min(1).optional(),

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

  // [WI-1753] Family-join (cross-account existing-teen join) stays dark until
  // BOTH remaining gates clear: the accept-authorization security review
  // (token-possession vs. email-equality) and the invite-copy operator sign-off.
  // The accept surface itself does not exist yet either (WI-1927), so there is
  // no user path to these routes — but "no UI path" is not a security control,
  // and this flag is. Default OFF; flip only when both gates are ruled.
  FAMILY_JOIN_ENABLED: z.enum(['true', 'false']).default('false'),

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

  // Homework notice felt moments — single default-off kill switch covering
  // prompt proposals, durable acceptance, read surfaces, routes, and jobs.
  MENTOR_NOTICE_ENABLED: z.enum(['true', 'false']).default('false'),

  // Launch-cohort allowlist for Challenge Round (WI-1754 AC2). Comma-
  // separated profile ids. Narrows CHALLENGE_ROUND_RUNTIME_ENABLED to an
  // explicit cohort instead of the whole environment — see
  // isChallengeRoundEnabledForProfile. Default-closed: empty/unset means no
  // profile is in the cohort (mirrors MEMORY_FACTS_DEDUP_ROLLOUT_PCT's
  // default-0 "nobody yet" posture), so a missing Doppler var never
  // accidentally widens Challenge Round to every profile in an enabled
  // environment.
  CHALLENGE_ROUND_COHORT_PROFILE_IDS: z.string().optional().default(''),

  // Warm review-callback opener (RR-1 + RR-13 minimal thread). When 'true',
  // session-exchange populates ExchangeContext.reviewCallback for review-mode
  // first turns and the REVIEW prompt block emits the outcome-branched warm
  // opener ("last time you had X down — has it stuck?") instead of the legacy
  // "this is a review check, not a fresh lesson" transition line. Defaults to
  // 'false' so it merges dark; flipped per-environment in Doppler after eval +
  // staging soak. See docs/specs/2026-06-27-rr1-rr13-warm-review-callback.md.
  REVIEW_CALLBACK_OPENER_ENABLED: z.enum(['true', 'false']).default('false'),

  // Interactive routing v2 (MMT-ADR-0016 §1.5 / the gpt-oss-cerebras-build
  // spec). Default-OFF: while 'false', getModelConfig/getFallbackConfig stay
  // byte-identical to today's Gemini-default routing. Flipping to 'true' pins
  // the §1.5 matrix (Cerebras gpt-oss primary, tier-aware secondaries) and the
  // fail-closed, Gemini-forbidden fallback. The flag flip for MINOR traffic is
  // additionally gated by non-code legal prerequisites (G-P1/G-P2/G-P3) — see
  // the build spec; this flag only controls the code path.
  LLM_ROUTING_V2_ENABLED: z.enum(['true', 'false']).default('false'),

  // Suitability-judge framework (MMT-ADR-0016 §7 phase 4). Default-OFF: while
  // 'false', the exchange path dispatches NO post-display judge — zero behavior
  // change. Flipped to 'true' in STAGING first to calibrate flag rates from the
  // judge.verdict / judge.degraded metrics before any phase-5 pre-display
  // gating. Production stays off until the vendor/DPA gates in
  // docs/registers/llm-models/master.md clear. The judge is post-display and
  // fail-open, so the flag only controls whether the calibration dispatch fires.
  JUDGE_FRAMEWORK_ENABLED: z.enum(['true', 'false']).default('false'),

  // Suitability-judge ENFORCING output gate for minors (MMT-ADR-0016 §3
  // phase-5, WI-1365). Default-OFF and lands INERT: while 'false', the exchange
  // path runs NO synchronous enforcement judge — zero behavior change, no added
  // latency/cost. When 'true', a minor's reply is judged synchronously and a
  // verdict==='violation' (on a non-allowlisted category) is blocked-and-replaced
  // via the sourceReplacement rail; a 'concern' never blocks; an unavailable
  // judge fails OPEN with a structured operator alarm. MUST NOT be flipped on
  // until the calibration-gated threshold is harvested from real minor-traffic
  // judge.verdict data — pre-launch we have none, so it stays off.
  JUDGE_ENFORCEMENT_ENABLED: z.enum(['true', 'false']).default('false'),

  // Challenge Round grader (MMT-ADR-0016 §2 / plan 2026-06-26). Sources
  // challenge_round_evaluation from a dedicated judge call instead of the
  // inline tutor envelope (gpt-oss silently drops the signal). Default-ON as
  // of 2026-06-27 (Sonnet 4.6 grader bake-off clean; flag set 'true' in all
  // Doppler envs): the grader path runs unless explicitly disabled, so a
  // missing/forgotten binding can never silently disable mastery. Set 'false'
  // in Doppler as an emergency kill-switch to fall back to the inline-tutor
  // path — a valid rollback ONLY while the tutor still emits the signal inline
  // (i.e. pre-V2). The flag + legacy inline branch are slated for removal at
  // the V2/gpt-oss cutover, when the inline path stops being a usable fallback.
  // Independent of LLM_ROUTING_V2_ENABLED so it can be toggled separately.
  CHALLENGE_ROUND_GRADER_ENABLED: z.enum(['true', 'false']).default('true'),

  // Review-continuity opener (plan 2026-06-27 / spec
  // 2026-06-08-memory-task-review-continuity.md, requirements EU-1/EU-2/EU-4).
  // Default-OFF: while 'false', exchange-prompts.ts emits the existing generic
  // review calibration block byte-for-byte — the continuity-framed opener
  // builder is unwired in production. The builder + harness land behind this
  // flag (the same "infra built behind a flag" pattern as LLM_ROUTING_V2_ENABLED);
  // the prod assembler that fills the ReviewContinuityContext from
  // retrieval_events + the EU-2 consent gate land with the table slice, after
  // which this flag is flipped (staging first). This flag only controls the
  // code path.
  REVIEW_CONTINUITY_OPENER_ENABLED: z.enum(['true', 'false']).default('false'),

  // S1 mobile-shell flag; reserved at S0 so the name is final. No API code
  // reads this yet.
  MODE_NAV_V2_ENABLED: z.enum(['true', 'false']).default('false'),

  // S5 managed visibility tier. Built dark for launch: day-one visibility
  // links are credentialed/consent-capable only; managed handoff activation is
  // a separate server-enforced flag flip.
  MANAGED_TIER_ACTIVE: z.enum(['true', 'false']).default('false'),

  // Convergence maintenance gates (WI-586 runbook §4 step 1). Two-stage:
  //   - MAINTENANCE_READONLY: stage 1. The maintenance gate (mounted at the
  //     top of index.ts, before auth/account resolution) 503s every request
  //     EXCEPT the health check and the signed Inngest delivery endpoint
  //     /v1/inngest — which must stay deliverable so in-flight Inngest runs
  //     can drain to zero. Mounted before account resolution because
  //     accountMiddleware JIT-inserts legacy `accounts` + trial rows on ANY
  //     authed request (incl. GET), which a route-scoped gate would not stop.
  //   - MAINTENANCE_BLOCK_INNGEST: stage 2. After the drain reads zero, this
  //     hard-blocks /v1/inngest too (belt-and-braces against a stray late
  //     delivery mid-reseed).
  // Both default-OFF; set in Doppler only during the convergence window.
  MAINTENANCE_READONLY: z.enum(['true', 'false']).default('false'),
  MAINTENANCE_BLOCK_INNGEST: z.enum(['true', 'false']).default('false'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * True when running inside Jest / a Node.js test runner (NODE_ENV=test).
 * Use this instead of raw `process.env['NODE_ENV']` in API code — it
 * centralises the single place where process.env is read for test detection
 * and satisfies the G4 typed-config rule for callers (config.ts itself is
 * exempt from G4 by eslint.config.mjs).
 */
export function isNodeTestEnv(): boolean {
  return process.env['NODE_ENV'] === 'test';
}

export function isMemoryFactsReadEnabled(value: string | undefined): boolean {
  return value === 'true';
}

/** [WI-1753] Fail-closed: anything other than the literal 'true' keeps family-join dark. */
export function isFamilyJoinEnabled(value: string | undefined): boolean {
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

export function isMentorNoticeEnabled(value: string | undefined): boolean {
  return value === 'true';
}

/**
 * Challenge Round launch-cohort gate (WI-1754 AC2). Per-profile allowlist
 * check for CHALLENGE_ROUND_COHORT_PROFILE_IDS, analogous in shape to
 * isProfileInDedupRollout but exact-match rather than probabilistic — cohort
 * membership must be a deliberate allowlist entry, not a percentage bucket.
 *
 * Default-closed like isProfileInDedupRollout(id, 0): an empty/unset
 * allowlist returns false for every profile, so a missing Doppler var
 * narrows the cohort to nobody rather than widening it to everybody.
 */
export function isProfileInChallengeRoundCohort(
  profileId: string,
  allowlist: string | undefined,
): boolean {
  if (!allowlist) return false;
  const ids = allowlist
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter((id) => id.length > 0);
  if (ids.length === 0) return false;
  return ids.includes(profileId.toLowerCase());
}

/**
 * Combined Challenge Round enablement gate for a specific profile (WI-1754
 * AC2). The environment-wide CHALLENGE_ROUND_RUNTIME_ENABLED kill switch and
 * the launch-cohort allowlist must both pass — a flag flip alone can no
 * longer enable Challenge Round broadly, only ever narrow to the cohort.
 * Wired into ExchangeContext.challengeRuntimeEnabled at the sessions route
 * boundary (routes/sessions.ts).
 */
export function isChallengeRoundEnabledForProfile(
  flagValue: string | undefined,
  profileId: string,
  cohortAllowlist: string | undefined,
): boolean {
  return (
    isChallengeRoundRuntimeEnabled(flagValue) &&
    isProfileInChallengeRoundCohort(profileId, cohortAllowlist)
  );
}

/**
 * Warm review-callback opener gate (RR-1 + RR-13). Threaded into session-exchange
 * so it populates ExchangeContext.reviewCallback only for review-mode first turns.
 * Default-closed: undefined / anything other than 'true' keeps today's legacy
 * REVIEW transition copy. See docs/specs/2026-06-27-rr1-rr13-warm-review-callback.md.
 */
export function isReviewCallbackOpenerEnabled(
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

/**
 * Challenge Round grader gate (plan 2026-06-26 / MMT-ADR-0016 §2). Sources
 * challenge_round_evaluation from a dedicated judge call instead of the inline
 * tutor envelope. Threaded into the challenge-round runtime path at the
 * exchange route boundary. Default-OPEN as of 2026-06-27: undefined / any
 * value other than the explicit kill-switch 'false' keeps the grader ON, so a
 * missing binding never silently disables mastery. Set 'false' to fall back to
 * the legacy inline path. Independent of LLM_ROUTING_V2_ENABLED.
 */
export function isChallengeRoundGraderEnabled(
  value: string | undefined,
): boolean {
  return value !== 'false';
}

/**
 * Review-continuity opener gate (plan 2026-06-27 / spec
 * 2026-06-08-memory-task-review-continuity.md). Read at the system-prompt
 * assembly boundary (exchange-prompts.ts) and threaded as
 * `options.reviewContinuityContext` presence: gates whether the
 * continuity-framed review opener replaces the generic calibration line.
 * Default-closed: undefined / anything other than 'true' keeps the existing
 * generic block, so a missing binding never wires the unreleased opener.
 */
export function isReviewContinuityOpenerEnabled(
  value: string | undefined,
): boolean {
  return value === 'true';
}

/**
 * Suitability-judge framework gate (MMT-ADR-0016 §7 phase 4). Read at the
 * exchange route boundary and threaded into processMessage/streamMessage as
 * `options.judgeFrameworkEnabled`; gates the post-display judge dispatch.
 * Default-closed: undefined / anything other than 'true' fires NO dispatch, so
 * a missing binding never accidentally turns the judge on.
 */
export function isJudgeFrameworkEnabled(value: string | undefined): boolean {
  return value === 'true';
}

/**
 * Suitability-judge ENFORCING output gate (MMT-ADR-0016 §3 phase-5, WI-1365).
 * Read at the exchange route boundary and threaded into
 * processMessage/streamMessage → processExchange as
 * `options.judgeEnforcementEnabled`; gates the synchronous minor enforcement
 * judge. Default-closed: undefined / anything other than 'true' runs NO
 * enforcement, so a missing binding never accidentally turns blocking on.
 */
export function isJudgeEnforcementEnabled(value: string | undefined): boolean {
  return value === 'true';
}

export function isManagedTierActive(value: string | undefined): boolean {
  return value === 'true';
}

/**
 * Stage-1 convergence gate. When 'true', the maintenance middleware 503s every
 * request except the health check and the signed `/v1/inngest` delivery
 * endpoint (kept open so in-flight Inngest runs drain to zero). Default-closed.
 */
export function isMaintenanceReadonly(value: string | undefined): boolean {
  return value === 'true';
}

/**
 * [BUG-875] Opt-in escape for running the maintenance *backfill* routes
 * (memory-facts / progress-self-reports) in production. Those routes trigger
 * full-table scans + at-scale Inngest event re-emission, so the
 * MAINTENANCE_SECRET alone is not enough: Doppler pushes that secret to every
 * environment, so a leaked or shared secret would otherwise let anyone fire a
 * prod backfill (LLM token burn, queue flood, possible data corruption).
 *
 * The backfill routes fail-closed on production unless this flag is the literal
 * string 'true'. Default-closed by typed-config equality, NOT JS truthiness —
 * the string 'false' is truthy and would silently re-open the routes. Only
 * '=== true' opts in; everything else (incl. 'false' and undefined) stays
 * closed. development/staging are unaffected by this flag.
 */
export function isMaintenanceProductionEnabled(
  value: string | undefined,
): boolean {
  return value === 'true';
}

/**
 * Stage-2 convergence gate. When 'true' (set only after the Inngest drain
 * reads zero), the maintenance middleware also 503s `/v1/inngest`, hard-blocking
 * any stray late delivery mid-reseed. Default-closed. Only meaningful while
 * MAINTENANCE_READONLY is also 'true'.
 */
export function isMaintenanceBlockInngest(value: string | undefined): boolean {
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

const PRODUCTION_REQUIRED_BASE_KEYS: readonly (keyof Env)[] = [
  'VOYAGE_API_KEY',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'API_ORIGIN',
  'REVENUECAT_WEBHOOK_SECRET',
  'ANALYTICS_HASH_KEY',
  // [P0 email-consent-withdrawal] Required in production so the GDPR Art. 7(3)
  // withdrawal link is always signable/verifiable; a missing secret is a silent
  // compliance failure, so fail prod boot loudly instead.
  'CONSENT_WITHDRAWAL_TOKEN_SECRET',
] as const;

/**
 * [Gemini-retirement Phase A / T-A2] The LLM provider key(s) the *active*
 * routing path needs to boot in production. Path-aware so a Gemini-free
 * deployment is not blocked from booting by a hard GEMINI_API_KEY requirement.
 *
 * - V2 (LLM_ROUTING_V2_ENABLED='true'): the §1.5 matrix is Gemini-free —
 *   Cerebras is the universal text primary, Mistral the free secondary +
 *   free-tier vision, OpenAI the paid vision + EU branch. Those three must be
 *   present; GEMINI_API_KEY is not required (and is never selected).
 * - Legacy (flag off): Gemini is still the default primary, so it stays the
 *   required LLM key — the flag-off path is unchanged.
 *
 * Required-ness is enforced only here (exactly as GEMINI_API_KEY was); all four
 * keys remain parse-optional in the schema.
 */
function productionRequiredLlmKeys(env: Env): readonly (keyof Env)[] {
  return isLlmRoutingV2Enabled(env.LLM_ROUTING_V2_ENABLED)
    ? ['CEREBRAS_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY']
    : ['GEMINI_API_KEY'];
}

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

  // Additional keys required only in production. The LLM key set is path-aware
  // (T-A2): V2 needs the approved providers, legacy still needs Gemini.
  if (env.ENVIRONMENT === 'production') {
    for (const key of [
      ...PRODUCTION_REQUIRED_BASE_KEYS,
      ...productionRequiredLlmKeys(env),
    ]) {
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
// KVNamespace bindings are runtime objects on c.env — they cannot be parsed
// by the zod env schema. This validator runs in the env-validation middleware
// after validateEnv() and short-circuits with 500 ENV_VALIDATION_ERROR if
// production is missing a required binding.
//
// [Issue-888] Added SUBSCRIPTION_KV to the required set. wrangler.toml
// §env.production.kv_namespaces confirms the binding is provisioned; without
// it safeRefreshKvCache silently skips every cache refresh and emits a Sentry
// warning — a "silent billing-cache drift" violation. Added to the same
// hard-gate pattern as IDEMPOTENCY_KV.
//
// SENTRY_DSN is intentionally a WARNING (not a hard missing entry): the Sentry
// SDK no-ops gracefully when the DSN is absent, so it is safe to serve traffic.
// But a missing DSN in production means ALL error events silently drop — ops
// cannot detect incidents. The `warnings` field carries non-fatal advisories
// that the middleware logs loudly without returning a 500.
// ---------------------------------------------------------------------------

export interface ProductionBindings {
  IDEMPOTENCY_KV?: unknown;
  SUBSCRIPTION_KV?: unknown;
}

export interface BindingValidationResult {
  missing: string[];
  overrideApplied: boolean;
  /** Non-fatal advisories — logged as warnings but do not block traffic. */
  warnings: string[];
}

export function validateProductionBindings(
  env: Env,
  bindings: ProductionBindings,
): BindingValidationResult {
  if (env.ENVIRONMENT !== 'production') {
    return { missing: [], overrideApplied: false, warnings: [] };
  }

  const missing: string[] = [];
  const warnings: string[] = [];
  let overrideApplied = false;

  if (bindings.IDEMPOTENCY_KV == null) {
    if (env.ALLOW_MISSING_IDEMPOTENCY_KV === 'true') {
      overrideApplied = true;
    } else {
      missing.push('IDEMPOTENCY_KV');
    }
  }

  // [Issue-888] SUBSCRIPTION_KV is provisioned in wrangler.toml for production.
  // Absence means every safeRefreshKvCache call silently falls through to the
  // DB path with a Sentry warning — billing-cache drift risk.
  if (bindings.SUBSCRIPTION_KV == null) {
    missing.push('SUBSCRIPTION_KV');
  }

  // [Issue-888] SENTRY_DSN warning (non-blocking). SDK gracefully no-ops when
  // absent, but all error events drop silently. Ops must know about this.
  if (!env.SENTRY_DSN) {
    warnings.push('SENTRY_DSN');
  }

  return { missing, overrideApplied, warnings };
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
