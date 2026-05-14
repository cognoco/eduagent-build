import {
  isMemoryFactsDedupEnabled,
  isMemoryFactsRelevanceEnabled,
  isProfileInDedupRollout,
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
  const BASE_ENV: Env = {
    ENVIRONMENT: 'development',
    DATABASE_URL: 'postgresql://localhost/test',
    APP_URL: 'https://www.mentomate.com',
    API_ORIGIN: 'https://api.mentomate.com',
    LOG_LEVEL: 'info',
    EMAIL_FROM: 'noreply@mentomate.com',
    EMPTY_REPLY_GUARD_ENABLED: 'true',
    RETENTION_PURGE_ENABLED: 'false',
    MEMORY_FACTS_READ_ENABLED: 'false',
    MEMORY_FACTS_RELEVANCE_RETRIEVAL: 'false',
    MEMORY_FACTS_DEDUP_ENABLED: 'false',
    MEMORY_FACTS_DEDUP_THRESHOLD: 0.15,
    MAX_DEDUP_LLM_CALLS_PER_SESSION: 10,
    MEMORY_FACTS_DEDUP_ROLLOUT_PCT: 0,
    MATCHER_ENABLED: 'false',
    ALLOW_MISSING_IDEMPOTENCY_KV: 'false',
  };

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
      }),
    ).toEqual([]);
  });

  it('returns missing keys for production with no secrets', () => {
    const missing = validateProductionKeys({
      ...BASE_ENV,
      ENVIRONMENT: 'production',
    });

    expect(missing).toContain('CLERK_SECRET_KEY');
    expect(missing).toContain('CLERK_JWKS_URL');
    expect(missing).toContain('CLERK_AUDIENCE');
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
    expect(missing).toHaveLength(8);
  });

  it('returns empty array for production with all required secrets present', () => {
    const missing = validateProductionKeys({
      ...BASE_ENV,
      ENVIRONMENT: 'production',
      CLERK_SECRET_KEY: 'sk_live_xxx',
      CLERK_JWKS_URL: 'https://clerk.example.com/.well-known/jwks.json',
      CLERK_AUDIENCE: 'eduagent-api',
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
      // Missing: VOYAGE_API_KEY, RESEND_API_KEY
      // API_ORIGIN is provided by BASE_ENV (non-optional in schema)
      GEMINI_API_KEY: 'gemini-key',
      // Stripe keys are optional — not in production required list
    });

    expect(missing).toEqual([
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
  it('parses valid staging env with required Clerk keys (API_ORIGIN optional)', () => {
    const env = validateEnv({
      ENVIRONMENT: 'staging',
      DATABASE_URL: 'postgresql://staging/db',
      CLERK_SECRET_KEY: 'sk_test_xxx',
      CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
      CLERK_AUDIENCE: 'eduagent-api-staging',
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
    EMPTY_REPLY_GUARD_ENABLED: 'true',
    RETENTION_PURGE_ENABLED: 'false',
    MEMORY_FACTS_READ_ENABLED: 'false',
    MEMORY_FACTS_RELEVANCE_RETRIEVAL: 'false',
    MEMORY_FACTS_DEDUP_ENABLED: 'false',
    MEMORY_FACTS_DEDUP_THRESHOLD: 0.15,
    MAX_DEDUP_LLM_CALLS_PER_SESSION: 10,
    MEMORY_FACTS_DEDUP_ROLLOUT_PCT: 0,
    MATCHER_ENABLED: 'false',
    ALLOW_MISSING_IDEMPOTENCY_KV: 'false',
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

  it('returns no missing bindings when IDEMPOTENCY_KV is present in production', () => {
    const { missing, overrideApplied } = validateProductionBindings(PROD_ENV, {
      IDEMPOTENCY_KV: fakeKv,
    });
    expect(missing).toEqual([]);
    expect(overrideApplied).toBe(false);
  });

  it('honours ALLOW_MISSING_IDEMPOTENCY_KV=true override and flags overrideApplied', () => {
    const { missing, overrideApplied } = validateProductionBindings(
      { ...PROD_ENV, ALLOW_MISSING_IDEMPOTENCY_KV: 'true' },
      {},
    );
    expect(missing).toEqual([]);
    expect(overrideApplied).toBe(true);
  });

  it('does NOT flag overrideApplied when the binding is actually present', () => {
    const { missing, overrideApplied } = validateProductionBindings(
      { ...PROD_ENV, ALLOW_MISSING_IDEMPOTENCY_KV: 'true' },
      { IDEMPOTENCY_KV: fakeKv },
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
