import { validateEnv, validateProductionKeys } from './config';
import type { Env } from './config';

// ---------------------------------------------------------------------------
// validateProductionKeys
// ---------------------------------------------------------------------------

describe('validateProductionKeys', () => {
  const BASE_ENV: Env = {
    ENVIRONMENT: 'development',
    DATABASE_URL: 'postgresql://localhost/test',
    APP_URL: 'https://app.eduagent.com',
    LOG_LEVEL: 'info',
    EMAIL_FROM: 'noreply@eduagent.com',
  };

  it('returns empty array for non-production environments', () => {
    expect(
      validateProductionKeys({ ...BASE_ENV, ENVIRONMENT: 'development' })
    ).toEqual([]);
    expect(
      validateProductionKeys({ ...BASE_ENV, ENVIRONMENT: 'staging' })
    ).toEqual([]);
  });

  it('returns missing keys for production with no secrets', () => {
    const missing = validateProductionKeys({
      ...BASE_ENV,
      ENVIRONMENT: 'production',
    });

    expect(missing).toContain('CLERK_SECRET_KEY');
    expect(missing).toContain('CLERK_JWKS_URL');
    expect(missing).toContain('GEMINI_API_KEY');
    expect(missing).toContain('VOYAGE_API_KEY');
    expect(missing).toContain('RESEND_API_KEY');
    expect(missing).toContain('REVENUECAT_WEBHOOK_SECRET');
    // Stripe secrets are optional — dormant until web client added
    expect(missing).not.toContain('STRIPE_SECRET_KEY');
    expect(missing).not.toContain('STRIPE_WEBHOOK_SECRET');
    expect(missing).toHaveLength(6);
  });

  it('returns empty array for production with all required secrets present', () => {
    const missing = validateProductionKeys({
      ...BASE_ENV,
      ENVIRONMENT: 'production',
      CLERK_SECRET_KEY: 'sk_live_xxx',
      CLERK_JWKS_URL: 'https://clerk.example.com/.well-known/jwks.json',
      GEMINI_API_KEY: 'gemini-key',
      VOYAGE_API_KEY: 'voyage-key',
      RESEND_API_KEY: 're_xxx',
      REVENUECAT_WEBHOOK_SECRET: 'rc_webhook_secret',
      // Stripe secrets omitted — optional (dormant until web client)
    });

    expect(missing).toEqual([]);
  });

  it('returns only the specific missing keys', () => {
    const missing = validateProductionKeys({
      ...BASE_ENV,
      ENVIRONMENT: 'production',
      CLERK_SECRET_KEY: 'sk_live_xxx',
      CLERK_JWKS_URL: 'https://clerk.example.com/.well-known/jwks.json',
      GEMINI_API_KEY: 'gemini-key',
      // Missing: VOYAGE_API_KEY, RESEND_API_KEY, REVENUECAT_WEBHOOK_SECRET
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
    expect(() => validateEnv({ ENVIRONMENT: 'development' })).toThrow(
      'Invalid environment'
    );
  });

  it('throws when production env is missing required keys', () => {
    expect(() =>
      validateEnv({
        ENVIRONMENT: 'production',
        DATABASE_URL: 'postgresql://prod/db',
      })
    ).toThrow('Production environment missing required keys');
  });

  it('succeeds for production env with all required keys (no Stripe needed)', () => {
    const env = validateEnv({
      ENVIRONMENT: 'production',
      DATABASE_URL: 'postgresql://prod/db',
      CLERK_SECRET_KEY: 'sk_live_xxx',
      CLERK_JWKS_URL: 'https://clerk.example.com/.well-known/jwks.json',
      GEMINI_API_KEY: 'gemini-key',
      VOYAGE_API_KEY: 'voyage-key',
      RESEND_API_KEY: 're_xxx',
      REVENUECAT_WEBHOOK_SECRET: 'rc_webhook_secret',
      // Stripe secrets omitted — optional (dormant until web client)
    });

    expect(env.ENVIRONMENT).toBe('production');
  });
});
