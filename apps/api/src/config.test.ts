import { validateEnv, validateProductionKeys } from './config';
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
  };

  it('returns empty array for development environment', () => {
    expect(
      validateProductionKeys({ ...BASE_ENV, ENVIRONMENT: 'development' })
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
      })
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
    // API_ORIGIN is provided by BASE_ENV (non-optional in schema)
    expect(missing).not.toContain('API_ORIGIN');
    // Stripe secrets are optional — dormant until web client added
    expect(missing).not.toContain('STRIPE_SECRET_KEY');
    expect(missing).not.toContain('STRIPE_WEBHOOK_SECRET');
    // OPENAI_API_KEY is optional — alternative to GEMINI_API_KEY
    expect(missing).not.toContain('OPENAI_API_KEY');
    expect(missing).toContain('REVENUECAT_WEBHOOK_SECRET');
    expect(missing).toHaveLength(7);
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
      })
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
      })
    ).toThrow('Production environment missing required keys');
  });

  it('throws when production env is missing required keys', () => {
    expect(() =>
      validateEnv({
        ENVIRONMENT: 'production',
        DATABASE_URL: 'postgresql://prod/db',
        API_ORIGIN: 'https://api.mentomate.com',
      })
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
      })
    ).toThrow('Invalid environment');
  });
});
