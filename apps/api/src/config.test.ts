import {
  isMemoryFactsDedupEnabled,
  isMemoryFactsRelevanceEnabled,
  isProfileInDedupRollout,
  isChallengeRoundRuntimeEnabled,
  isManagedTierActive,
  isTopicIntentMatcherEnabled,
  validateEnv,
  validateProductionBindings,
  validateProductionKeys,
} from './config';
import type { Env } from './config';

// ---------------------------------------------------------------------------
// validateProductionKeys
// ---------------------------------------------------------------------------

describe('validateProductionKeys', () => {
  // [BUG-279] Zod-coerced numeric env vars (MEMORY_FACTS_DEDUP_THRESHOLD,
  // MAX_DEDUP_LLM_CALLS_PER_SESSION, MEMORY_FACTS_DEDUP_ROLLOUT_PCT) are
  // string-typed at the Cloudflare Workers boundary — we route this base
  // fixture through validateEnv() so the coerce path is exercised the same
  // way production env construction does it, instead of hand-crafting a
  // post-parse Env literal that hides string→number coercion gaps.
  const BASE_ENV: Env = validateEnv({
    ENVIRONMENT: 'development',
    DATABASE_URL: 'postgresql://localhost/test',
    APP_URL: 'https://www.mentomate.com',
    API_ORIGIN: 'https://api.mentomate.com',
    LOG_LEVEL: 'info',
    EMAIL_FROM: 'noreply@mentomate.com',
    CONSENT_POLICY_VERSION: '2026-05-31',
    EMPTY_REPLY_GUARD_ENABLED: 'true',
    RETENTION_PURGE_ENABLED: 'false',
    MEMORY_FACTS_READ_ENABLED: 'false',
    MEMORY_FACTS_RELEVANCE_RETRIEVAL: 'false',
    MEMORY_FACTS_DEDUP_ENABLED: 'false',
    MEMORY_FACTS_DEDUP_THRESHOLD: '0.15',
    MAX_DEDUP_LLM_CALLS_PER_SESSION: '10',
    MEMORY_FACTS_DEDUP_ROLLOUT_PCT: '0',
    MATCHER_ENABLED: 'false',
    CHALLENGE_ROUND_RUNTIME_ENABLED: 'false',
    ALLOW_MISSING_IDEMPOTENCY_KV: 'false',
    ADULT_OWNER_GATE_ENABLED: 'true',
  });

  it('returns empty array for development environment', () => {
    expect(
      validateProductionKeys({ ...BASE_ENV, ENVIRONMENT: 'development' }),
    ).toEqual([]);
  });

  // [SEC-1 / BUG-717] Auth keys (CLERK_AUDIENCE, CLERK_JWKS_URL,
  // CLERK_SECRET_KEY) are required in staging too — not just production.
  it('returns missing Clerk auth keys for staging when absent', () => {
    const missing = validateProductionKeys({
      ...BASE_ENV,
      ENVIRONMENT: 'staging',
    });
    expect(missing).toContain('CLERK_SECRET_KEY');
    expect(missing).toContain('CLERK_JWKS_URL');
    expect(missing).toContain('CLERK_AUDIENCE');
    // Production-only keys not required in staging
    expect(missing).not.toContain('GEMINI_API_KEY');
    expect(missing).not.toContain('VOYAGE_API_KEY');
  });

  it('returns empty array for staging with all required Clerk keys present', () => {
    expect(
      validateProductionKeys({
        ...BASE_ENV,
        ENVIRONMENT: 'staging',
        CLERK_SECRET_KEY: 'sk_test_xxx',
        CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
        CLERK_AUDIENCE: 'eduagent-api-staging',
        // [BUG-242] Inngest signing + event keys are required in staging too
        // — wrong-env keys would either accept unsigned webhook POSTs or
        // silently drop outbound dispatches.
        INNGEST_SIGNING_KEY: 'signkey_stg_xxx',
        INNGEST_EVENT_KEY: 'evtkey_stg_xxx',
      }),
    ).toEqual([]);
  });

  // [BUG-242] Staging must require Inngest signing + event keys (per-env).
  it('returns missing Inngest keys for staging when absent', () => {
    const missing = validateProductionKeys({
      ...BASE_ENV,
      ENVIRONMENT: 'staging',
      CLERK_SECRET_KEY: 'sk_test_xxx',
      CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
      CLERK_AUDIENCE: 'eduagent-api-staging',
    });
    expect(missing).toContain('INNGEST_SIGNING_KEY');
    expect(missing).toContain('INNGEST_EVENT_KEY');
  });

  it('returns missing keys for production with no secrets', () => {
    const missing = validateProductionKeys({
      ...BASE_ENV,
      ENVIRONMENT: 'production',
    });

    expect(missing).toContain('CLERK_SECRET_KEY');
    expect(missing).toContain('CLERK_JWKS_URL');
    expect(missing).toContain('CLERK_AUDIENCE');
    // [BUG-242] Inngest keys must be enforced in production too.
    expect(missing).toContain('INNGEST_SIGNING_KEY');
    expect(missing).toContain('INNGEST_EVENT_KEY');
    expect(missing).toContain('GEMINI_API_KEY');
    expect(missing).toContain('VOYAGE_API_KEY');
    expect(missing).toContain('RESEND_API_KEY');
    expect(missing).toContain('RESEND_WEBHOOK_SECRET');
    // API_ORIGIN is provided by BASE_ENV (non-optional in schema)
    expect(missing).not.toContain('API_ORIGIN');
    // Stripe secrets are optional — dormant until web client added
    expect(missing).not.toContain('STRIPE_SECRET_KEY');
    expect(missing).not.toContain('STRIPE_WEBHOOK_SECRET');
    // OPENAI_API_KEY is optional — alternative to GEMINI_API_KEY
    expect(missing).not.toContain('OPENAI_API_KEY');
    expect(missing).toContain('REVENUECAT_WEBHOOK_SECRET');
    // 8 originals + 2 new Inngest keys = 10
    expect(missing).toHaveLength(10);
  });

  it('returns empty array for production with all required secrets present', () => {
    const missing = validateProductionKeys({
      ...BASE_ENV,
      ENVIRONMENT: 'production',
      CLERK_SECRET_KEY: 'sk_live_xxx',
      CLERK_JWKS_URL: 'https://clerk.example.com/.well-known/jwks.json',
      CLERK_AUDIENCE: 'eduagent-api',
      // [BUG-242] Inngest keys part of the required set.
      INNGEST_SIGNING_KEY: 'signkey_prd_xxx',
      INNGEST_EVENT_KEY: 'evtkey_prd_xxx',
      GEMINI_API_KEY: 'gemini-key',
      VOYAGE_API_KEY: 'voyage-key',
      RESEND_API_KEY: 're_xxx',
      RESEND_WEBHOOK_SECRET: 'whsec_resend_xxx',
      API_ORIGIN: 'https://api.mentomate.com',
      REVENUECAT_WEBHOOK_SECRET: 'whsec_xxx',
      // Stripe secrets omitted — optional (dormant until web client)
    });

    expect(missing).toEqual([]);
  });

  it('includes CLERK_AUDIENCE when missing in production', () => {
    const missing = validateProductionKeys({
      ...BASE_ENV,
      ENVIRONMENT: 'production',
      CLERK_SECRET_KEY: 'sk_live_xxx',
      CLERK_JWKS_URL: 'https://clerk.example.com/.well-known/jwks.json',
      GEMINI_API_KEY: 'gemini-key',
      VOYAGE_API_KEY: 'voyage-key',
      RESEND_API_KEY: 're_xxx',
    });

    expect(missing).toContain('CLERK_AUDIENCE');
  });

  it('returns only the specific missing keys', () => {
    const missing = validateProductionKeys({
      ...BASE_ENV,
      ENVIRONMENT: 'production',
      CLERK_SECRET_KEY: 'sk_live_xxx',
      CLERK_JWKS_URL: 'https://clerk.example.com/.well-known/jwks.json',
      CLERK_AUDIENCE: 'eduagent-api',
      // Missing: INNGEST keys, VOYAGE_API_KEY, RESEND_API_KEY
      // API_ORIGIN is provided by BASE_ENV (non-optional in schema)
      GEMINI_API_KEY: 'gemini-key',
      // Stripe keys are optional — not in production required list
    });

    expect(missing).toEqual([
      // [BUG-242] Inngest keys come right after the Clerk auth block in the
      // STAGING_AND_PRODUCTION_REQUIRED_KEYS array, so they appear before
      // the production-only LLM/email/billing keys.
      'INNGEST_SIGNING_KEY',
      'INNGEST_EVENT_KEY',
      'VOYAGE_API_KEY',
      'RESEND_API_KEY',
      'RESEND_WEBHOOK_SECRET',
      'REVENUECAT_WEBHOOK_SECRET',
    ]);
  });
});

// ---------------------------------------------------------------------------
// validateEnv
// ---------------------------------------------------------------------------

describe('validateEnv', () => {
  it('parses valid development env', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
    });

    expect(env.ENVIRONMENT).toBe('development');
    expect(env.DATABASE_URL).toBe('postgresql://localhost/test');
  });

  it('throws on missing DATABASE_URL', () => {
    expect(() =>
      validateEnv({
        ENVIRONMENT: 'development',
      }),
    ).toThrow('Invalid environment');
  });

  // [SEC-1 / BUG-717] Staging now requires Clerk auth keys.
  // [BUG-242] Staging also requires Inngest signing + event keys per-env.
  it('parses valid staging env with required Clerk keys (API_ORIGIN optional)', () => {
    const env = validateEnv({
      ENVIRONMENT: 'staging',
      DATABASE_URL: 'postgresql://staging/db',
      CLERK_SECRET_KEY: 'sk_test_xxx',
      CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
      CLERK_AUDIENCE: 'eduagent-api-staging',
      INNGEST_SIGNING_KEY: 'signkey_stg_xxx',
      INNGEST_EVENT_KEY: 'evtkey_stg_xxx',
    });

    expect(env.ENVIRONMENT).toBe('staging');
    expect(env.API_ORIGIN).toBeUndefined();
  });

  it('throws when staging env is missing required Clerk keys', () => {
    expect(() =>
      validateEnv({
        ENVIRONMENT: 'staging',
        DATABASE_URL: 'postgresql://staging/db',
      }),
    ).toThrow('Production environment missing required keys');
  });

  it('throws when production env is missing required keys', () => {
    expect(() =>
      validateEnv({
        ENVIRONMENT: 'production',
        DATABASE_URL: 'postgresql://prod/db',
        API_ORIGIN: 'https://api.mentomate.com',
      }),
    ).toThrow('Production environment missing required keys');
  });

  it('succeeds for production env with all required keys (no Stripe needed)', () => {
    const env = validateEnv({
      ENVIRONMENT: 'production',
      DATABASE_URL: 'postgresql://prod/db',
      CLERK_SECRET_KEY: 'sk_live_xxx',
      CLERK_JWKS_URL: 'https://clerk.example.com/.well-known/jwks.json',
      CLERK_AUDIENCE: 'eduagent-api',
      // [BUG-242] Inngest keys required in production.
      INNGEST_SIGNING_KEY: 'signkey_prd_xxx',
      INNGEST_EVENT_KEY: 'evtkey_prd_xxx',
      GEMINI_API_KEY: 'gemini-key',
      OPENAI_API_KEY: 'openai-key',
      VOYAGE_API_KEY: 'voyage-key',
      RESEND_API_KEY: 're_xxx',
      RESEND_WEBHOOK_SECRET: 'whsec_resend_xxx',
      API_ORIGIN: 'https://api.mentomate.com',
      REVENUECAT_WEBHOOK_SECRET: 'whsec_xxx',
      // Stripe secrets omitted — optional (dormant until web client)
    });

    expect(env.ENVIRONMENT).toBe('production');
  });

  // [EMPTY-REPLY-GUARD-0] Kill-switch coverage — the flag must default ON
  // and parse both 'true' and 'false' verbatim. Any change to the default
  // needs to update both this test and the Doppler config.
  it('EMPTY_REPLY_GUARD_ENABLED defaults to "true" when unset', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
    });
    expect(env.EMPTY_REPLY_GUARD_ENABLED).toBe('true');
  });

  it('EMPTY_REPLY_GUARD_ENABLED parses "false" for the ops kill switch', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
      EMPTY_REPLY_GUARD_ENABLED: 'false',
    });
    expect(env.EMPTY_REPLY_GUARD_ENABLED).toBe('false');
  });

  it('rejects invalid EMPTY_REPLY_GUARD_ENABLED values', () => {
    expect(() =>
      validateEnv({
        ENVIRONMENT: 'development',
        DATABASE_URL: 'postgresql://localhost/test',
        EMPTY_REPLY_GUARD_ENABLED: 'yes',
      }),
    ).toThrow('Invalid environment');
  });

  it('RETENTION_PURGE_ENABLED defaults to "false" when unset', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
    });
    expect(env.RETENTION_PURGE_ENABLED).toBe('false');
  });

  it('RETENTION_PURGE_ENABLED parses "true" when the purge rollout is enabled', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
      RETENTION_PURGE_ENABLED: 'true',
    });
    expect(env.RETENTION_PURGE_ENABLED).toBe('true');
  });

  it('MEMORY_FACTS_READ_ENABLED defaults to "false" when unset', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
    });
    expect(env.MEMORY_FACTS_READ_ENABLED).toBe('false');
  });

  it('MEMORY_FACTS_READ_ENABLED parses "true" for the read-path rollout', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
      MEMORY_FACTS_READ_ENABLED: 'true',
    });
    expect(env.MEMORY_FACTS_READ_ENABLED).toBe('true');
  });

  it('MODE_NAV_V2_ENABLED defaults to "false" and parses "true"', () => {
    const defaultEnv = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
    });
    expect(defaultEnv.MODE_NAV_V2_ENABLED).toBe('false');

    const enabledEnv = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
      MODE_NAV_V2_ENABLED: 'true',
    });
    expect(enabledEnv.MODE_NAV_V2_ENABLED).toBe('true');
  });

  it('MANAGED_TIER_ACTIVE defaults to "false" and parses with strict helper semantics', () => {
    const defaultEnv = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
    });
    expect(defaultEnv.MANAGED_TIER_ACTIVE).toBe('false');
    expect(isManagedTierActive(defaultEnv.MANAGED_TIER_ACTIVE)).toBe(false);

    const enabledEnv = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
      MANAGED_TIER_ACTIVE: 'true',
    });
    expect(enabledEnv.MANAGED_TIER_ACTIVE).toBe('true');
    expect(isManagedTierActive('true')).toBe(true);
    expect(isManagedTierActive('false')).toBe(false);
    expect(isManagedTierActive(undefined)).toBe(false);
  });

  it('MEMORY_FACTS_RELEVANCE_RETRIEVAL defaults to "false" when unset', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
    });
    expect(env.MEMORY_FACTS_RELEVANCE_RETRIEVAL).toBe('false');
  });

  it('MEMORY_FACTS_RELEVANCE_RETRIEVAL parses "true"', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
      MEMORY_FACTS_RELEVANCE_RETRIEVAL: 'true',
    });
    expect(env.MEMORY_FACTS_RELEVANCE_RETRIEVAL).toBe('true');
  });

  it('isMemoryFactsRelevanceEnabled returns false when undefined', () => {
    expect(isMemoryFactsRelevanceEnabled(undefined)).toBe(false);
  });

  it('isMemoryFactsRelevanceEnabled returns true only for "true"', () => {
    expect(isMemoryFactsRelevanceEnabled('true')).toBe(true);
    expect(isMemoryFactsRelevanceEnabled('false')).toBe(false);
    expect(isMemoryFactsRelevanceEnabled('TRUE')).toBe(false);
  });

  it('MEMORY_FACTS_DEDUP_ENABLED defaults to "false" when unset', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
    });
    expect(env.MEMORY_FACTS_DEDUP_ENABLED).toBe('false');
    expect(isMemoryFactsDedupEnabled(env.MEMORY_FACTS_DEDUP_ENABLED)).toBe(
      false,
    );
  });

  it('MEMORY_FACTS_DEDUP_THRESHOLD defaults to 0.15', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
    });
    expect(env.MEMORY_FACTS_DEDUP_THRESHOLD).toBe(0.15);
  });

  it('MAX_DEDUP_LLM_CALLS_PER_SESSION defaults to 10', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
    });
    expect(env.MAX_DEDUP_LLM_CALLS_PER_SESSION).toBe(10);
  });

  it('MEMORY_FACTS_DEDUP_ROLLOUT_PCT defaults to 0', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
    });
    expect(env.MEMORY_FACTS_DEDUP_ROLLOUT_PCT).toBe(0);
  });

  it('parses memory-facts dedup env values', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
      MEMORY_FACTS_DEDUP_ENABLED: 'true',
      MEMORY_FACTS_DEDUP_THRESHOLD: '0.12',
      MAX_DEDUP_LLM_CALLS_PER_SESSION: '7',
      MEMORY_FACTS_DEDUP_ROLLOUT_PCT: '25',
    });
    expect(env.MEMORY_FACTS_DEDUP_ENABLED).toBe('true');
    expect(env.MEMORY_FACTS_DEDUP_THRESHOLD).toBe(0.12);
    expect(env.MAX_DEDUP_LLM_CALLS_PER_SESSION).toBe(7);
    expect(env.MEMORY_FACTS_DEDUP_ROLLOUT_PCT).toBe(25);
  });

  // Cloudflare Workers passes env values as raw strings — verify every
  // z.coerce.number() key actually coerces (not just accepts a JS number).
  // Catches a regression from z.coerce.number() → z.number() that would
  // otherwise reject valid string-typed env in production.
  describe('z.coerce.number() env keys parse raw strings', () => {
    const rawStringEnv: Record<string, string> = {
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
      MEMORY_FACTS_DEDUP_ENABLED: 'true',
      MEMORY_FACTS_DEDUP_THRESHOLD: '0.42',
      MAX_DEDUP_LLM_CALLS_PER_SESSION: '15',
      MEMORY_FACTS_DEDUP_ROLLOUT_PCT: '50',
    };

    it('coerces MEMORY_FACTS_DEDUP_THRESHOLD from string to float', () => {
      const env = validateEnv(rawStringEnv);
      expect(env.MEMORY_FACTS_DEDUP_THRESHOLD).toBe(0.42);
      expect(typeof env.MEMORY_FACTS_DEDUP_THRESHOLD).toBe('number');
    });

    it('coerces MAX_DEDUP_LLM_CALLS_PER_SESSION from string to integer', () => {
      const env = validateEnv(rawStringEnv);
      expect(env.MAX_DEDUP_LLM_CALLS_PER_SESSION).toBe(15);
      expect(typeof env.MAX_DEDUP_LLM_CALLS_PER_SESSION).toBe('number');
      expect(Number.isInteger(env.MAX_DEDUP_LLM_CALLS_PER_SESSION)).toBe(true);
    });

    it('coerces MEMORY_FACTS_DEDUP_ROLLOUT_PCT from string to integer', () => {
      const env = validateEnv(rawStringEnv);
      expect(env.MEMORY_FACTS_DEDUP_ROLLOUT_PCT).toBe(50);
      expect(typeof env.MEMORY_FACTS_DEDUP_ROLLOUT_PCT).toBe('number');
      expect(Number.isInteger(env.MEMORY_FACTS_DEDUP_ROLLOUT_PCT)).toBe(true);
    });

    it('enforces THRESHOLD min/max bounds on string inputs', () => {
      expect(() =>
        validateEnv({ ...rawStringEnv, MEMORY_FACTS_DEDUP_THRESHOLD: '-0.1' }),
      ).toThrow('Invalid environment');
      expect(() =>
        validateEnv({ ...rawStringEnv, MEMORY_FACTS_DEDUP_THRESHOLD: '2.5' }),
      ).toThrow('Invalid environment');
    });

    it('enforces MAX_DEDUP_LLM_CALLS_PER_SESSION min/max bounds on string inputs', () => {
      expect(() =>
        validateEnv({ ...rawStringEnv, MAX_DEDUP_LLM_CALLS_PER_SESSION: '-1' }),
      ).toThrow('Invalid environment');
      expect(() =>
        validateEnv({
          ...rawStringEnv,
          MAX_DEDUP_LLM_CALLS_PER_SESSION: '101',
        }),
      ).toThrow('Invalid environment');
    });

    it('enforces ROLLOUT_PCT 0-100 bounds on string inputs', () => {
      expect(() =>
        validateEnv({ ...rawStringEnv, MEMORY_FACTS_DEDUP_ROLLOUT_PCT: '-1' }),
      ).toThrow('Invalid environment');
      expect(() =>
        validateEnv({ ...rawStringEnv, MEMORY_FACTS_DEDUP_ROLLOUT_PCT: '101' }),
      ).toThrow('Invalid environment');
    });

    it('rejects non-numeric string for coerced number env keys', () => {
      expect(() =>
        validateEnv({
          ...rawStringEnv,
          MEMORY_FACTS_DEDUP_THRESHOLD: 'not-a-number',
        }),
      ).toThrow('Invalid environment');
    });
  });

  it('isMemoryFactsDedupEnabled returns true only for "true"', () => {
    expect(isMemoryFactsDedupEnabled('true')).toBe(true);
    expect(isMemoryFactsDedupEnabled('false')).toBe(false);
    expect(isMemoryFactsDedupEnabled(undefined)).toBe(false);
    expect(isMemoryFactsDedupEnabled('yes')).toBe(false);
  });

  it('MATCHER_ENABLED defaults to "false" when unset', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
    });
    expect(env.MATCHER_ENABLED).toBe('false');
    expect(isTopicIntentMatcherEnabled(env.MATCHER_ENABLED)).toBe(false);
  });

  it('isTopicIntentMatcherEnabled returns true only for "true"', () => {
    expect(isTopicIntentMatcherEnabled('true')).toBe(true);
    expect(isTopicIntentMatcherEnabled('false')).toBe(false);
    expect(isTopicIntentMatcherEnabled(undefined)).toBe(false);
    expect(isTopicIntentMatcherEnabled('yes')).toBe(false);
  });

  it('CHALLENGE_ROUND_RUNTIME_ENABLED defaults to "false" when unset', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
    });
    expect(env.CHALLENGE_ROUND_RUNTIME_ENABLED).toBe('false');
    expect(
      isChallengeRoundRuntimeEnabled(env.CHALLENGE_ROUND_RUNTIME_ENABLED),
    ).toBe(false);
  });

  it('isChallengeRoundRuntimeEnabled returns true only for "true"', () => {
    expect(isChallengeRoundRuntimeEnabled('true')).toBe(true);
    expect(isChallengeRoundRuntimeEnabled('false')).toBe(false);
    expect(isChallengeRoundRuntimeEnabled(undefined)).toBe(false);
    expect(isChallengeRoundRuntimeEnabled('yes')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ALLOW_MISSING_IDEMPOTENCY_KV — prelaunch override flag for the production
// IDEMPOTENCY_KV deploy gate.
// ---------------------------------------------------------------------------

describe('ALLOW_MISSING_IDEMPOTENCY_KV env flag', () => {
  it('defaults to "false" when unset', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
    });
    expect(env.ALLOW_MISSING_IDEMPOTENCY_KV).toBe('false');
  });

  it('parses "true" verbatim for the prelaunch override', () => {
    const env = validateEnv({
      ENVIRONMENT: 'development',
      DATABASE_URL: 'postgresql://localhost/test',
      ALLOW_MISSING_IDEMPOTENCY_KV: 'true',
    });
    expect(env.ALLOW_MISSING_IDEMPOTENCY_KV).toBe('true');
  });

  it('rejects invalid values', () => {
    expect(() =>
      validateEnv({
        ENVIRONMENT: 'development',
        DATABASE_URL: 'postgresql://localhost/test',
        ALLOW_MISSING_IDEMPOTENCY_KV: 'yes',
      }),
    ).toThrow('Invalid environment');
  });
});

// ---------------------------------------------------------------------------
// validateProductionBindings — production KV-binding gate.
//
// IDEMPOTENCY_KV gates the at-most-once replay dedup window for state-
// mutating idempotent routes. Without it, the middleware silently falls
// through to the downstream handler — leaving a real duplicate-side-effect
// window. Production must refuse to serve traffic in that posture unless
// the prelaunch override is explicitly opted into.
// ---------------------------------------------------------------------------

describe('validateProductionBindings', () => {
  const PROD_ENV: Env = {
    ENVIRONMENT: 'production',
    DATABASE_URL: 'postgresql://prod/db',
    APP_URL: 'https://www.mentomate.com',
    API_ORIGIN: 'https://api.mentomate.com',
    LOG_LEVEL: 'info',
    EMAIL_FROM: 'noreply@mentomate.com',
    CONSENT_POLICY_VERSION: '2026-05-31',
    EMPTY_REPLY_GUARD_ENABLED: 'true',
    RETENTION_PURGE_ENABLED: 'false',
    MEMORY_FACTS_READ_ENABLED: 'false',
    MEMORY_FACTS_RELEVANCE_RETRIEVAL: 'false',
    MEMORY_FACTS_DEDUP_ENABLED: 'false',
    MEMORY_FACTS_DEDUP_THRESHOLD: 0.15,
    MAX_DEDUP_LLM_CALLS_PER_SESSION: 10,
    MEMORY_FACTS_DEDUP_ROLLOUT_PCT: 0,
    MATCHER_ENABLED: 'false',
    CHALLENGE_ROUND_RUNTIME_ENABLED: 'false',
    ALLOW_MISSING_IDEMPOTENCY_KV: 'false',
    ADULT_OWNER_GATE_ENABLED: 'true',
    LLM_ROUTING_V2_ENABLED: 'false',
    MODE_NAV_V2_ENABLED: 'false',
    MANAGED_TIER_ACTIVE: 'false',
    IDENTITY_V2_ENABLED: 'false',
    MAINTENANCE_READONLY: 'false',
    MAINTENANCE_BLOCK_INNGEST: 'false',
  };

  const fakeKv = {} as unknown;

  it('returns no missing bindings in development', () => {
    const { missing, overrideApplied } = validateProductionBindings(
      { ...PROD_ENV, ENVIRONMENT: 'development' },
      {},
    );
    expect(missing).toEqual([]);
    expect(overrideApplied).toBe(false);
  });

  it('returns no missing bindings in staging (replay dedup is production-only)', () => {
    const { missing, overrideApplied } = validateProductionBindings(
      { ...PROD_ENV, ENVIRONMENT: 'staging' },
      {},
    );
    expect(missing).toEqual([]);
    expect(overrideApplied).toBe(false);
  });

  it('reports IDEMPOTENCY_KV missing in production without override', () => {
    const { missing, overrideApplied } = validateProductionBindings(
      PROD_ENV,
      {},
    );
    expect(missing).toContain('IDEMPOTENCY_KV');
    expect(overrideApplied).toBe(false);
  });

  it('returns no missing bindings when IDEMPOTENCY_KV and SUBSCRIPTION_KV are present in production', () => {
    const { missing, overrideApplied } = validateProductionBindings(PROD_ENV, {
      IDEMPOTENCY_KV: fakeKv,
      SUBSCRIPTION_KV: fakeKv,
    });
    expect(missing).toEqual([]);
    expect(overrideApplied).toBe(false);
  });

  it('honours ALLOW_MISSING_IDEMPOTENCY_KV=true override and flags overrideApplied (SUBSCRIPTION_KV still required)', () => {
    const { missing, overrideApplied } = validateProductionBindings(
      { ...PROD_ENV, ALLOW_MISSING_IDEMPOTENCY_KV: 'true' },
      { SUBSCRIPTION_KV: fakeKv },
    );
    // IDEMPOTENCY_KV is overridden; SUBSCRIPTION_KV is present — no missing
    expect(missing).toEqual([]);
    expect(overrideApplied).toBe(true);
  });

  it('does NOT flag overrideApplied when IDEMPOTENCY_KV is actually present (and SUBSCRIPTION_KV present)', () => {
    const { missing, overrideApplied } = validateProductionBindings(
      { ...PROD_ENV, ALLOW_MISSING_IDEMPOTENCY_KV: 'true' },
      { IDEMPOTENCY_KV: fakeKv, SUBSCRIPTION_KV: fakeKv },
    );
    expect(missing).toEqual([]);
    expect(overrideApplied).toBe(false);
  });

  it('ignores the override flag outside production', () => {
    const { missing, overrideApplied } = validateProductionBindings(
      {
        ...PROD_ENV,
        ENVIRONMENT: 'staging',
        ALLOW_MISSING_IDEMPOTENCY_KV: 'true',
      },
      {},
    );
    expect(missing).toEqual([]);
    expect(overrideApplied).toBe(false);
  });

  // [Issue-888] SUBSCRIPTION_KV — subscription-status cache binding.
  // Absent in production means safeRefreshKvCache skips every refresh and
  // emits a Sentry warning, creating a silent billing-cache drift. Production
  // must refuse to serve when the binding is missing (same hard-gate pattern
  // as IDEMPOTENCY_KV; wrangler.toml §env.production.kv_namespaces confirms
  // the binding is provisioned for prod).
  it('[Issue-888] reports SUBSCRIPTION_KV missing in production', () => {
    const { missing } = validateProductionBindings(PROD_ENV, {
      IDEMPOTENCY_KV: fakeKv,
      // SUBSCRIPTION_KV deliberately absent
    });
    expect(missing).toContain('SUBSCRIPTION_KV');
  });

  it('[Issue-888] does not report SUBSCRIPTION_KV when present in production', () => {
    const { missing } = validateProductionBindings(PROD_ENV, {
      IDEMPOTENCY_KV: fakeKv,
      SUBSCRIPTION_KV: fakeKv,
    });
    expect(missing).not.toContain('SUBSCRIPTION_KV');
  });

  it('[Issue-888] does not check SUBSCRIPTION_KV outside production', () => {
    const { missing } = validateProductionBindings(
      { ...PROD_ENV, ENVIRONMENT: 'staging' },
      {
        IDEMPOTENCY_KV: fakeKv,
        // SUBSCRIPTION_KV absent in staging — should not fail
      },
    );
    expect(missing).toEqual([]);
  });

  // [Issue-888] SENTRY_DSN warning check. SENTRY_DSN is intentionally optional
  // (the SDK no-ops gracefully when absent), but a missing DSN in production
  // means all Sentry events silently drop. The gate emits a non-blocking
  // warning (not a hard 500) so ops can detect misconfiguration in telemetry
  // without refusing traffic. The `warnings` field on BindingValidationResult
  // carries these non-fatal advisories.
  it('[Issue-888] warns when SENTRY_DSN is absent in production (non-blocking)', () => {
    const result = validateProductionBindings(PROD_ENV, {
      IDEMPOTENCY_KV: fakeKv,
      SUBSCRIPTION_KV: fakeKv,
      // SENTRY_DSN absent — should produce a warning, not a missing entry
    });
    expect(result.missing).not.toContain('SENTRY_DSN');
    expect(result.warnings).toContain('SENTRY_DSN');
  });

  it('[Issue-888] does not warn about SENTRY_DSN when it is present in production', () => {
    const result = validateProductionBindings(
      { ...PROD_ENV, SENTRY_DSN: 'https://abc@sentry.io/123' },
      { IDEMPOTENCY_KV: fakeKv, SUBSCRIPTION_KV: fakeKv },
    );
    expect(result.warnings ?? []).not.toContain('SENTRY_DSN');
  });

  it('[Issue-888] does not warn about SENTRY_DSN outside production', () => {
    const result = validateProductionBindings(
      { ...PROD_ENV, ENVIRONMENT: 'staging' },
      {},
    );
    expect(result.warnings ?? []).not.toContain('SENTRY_DSN');
  });
});

describe('isProfileInDedupRollout', () => {
  it('returns false at 0% and true at 100%', () => {
    expect(
      isProfileInDedupRollout('00000000-0000-0000-0000-000000000001', 0),
    ).toBe(false);
    expect(
      isProfileInDedupRollout('00000000-0000-0000-0000-000000000001', 100),
    ).toBe(true);
  });

  it('is deterministic and monotonic for the same profile', () => {
    const id = '12345678-1234-1234-1234-123456789012';
    expect(isProfileInDedupRollout(id, 50)).toBe(
      isProfileInDedupRollout(id, 50),
    );
    for (let pct = 0; pct < 100; pct++) {
      if (isProfileInDedupRollout(id, pct)) {
        expect(isProfileInDedupRollout(id, pct + 1)).toBe(true);
      }
    }
  });

  it('rolls out approximately the requested percentage', () => {
    let inRollout = 0;
    const count = 10_000;
    for (let i = 0; i < count; i++) {
      const id = `${i
        .toString(16)
        .padStart(8, '0')}-0000-0000-0000-000000000000`;
      if (isProfileInDedupRollout(id, 30)) inRollout++;
    }
    expect(inRollout / count).toBeGreaterThan(0.25);
    expect(inRollout / count).toBeLessThan(0.35);
  });
});
