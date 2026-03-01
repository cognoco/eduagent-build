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
    expect(missing).toContain('STRIPE_SECRET_KEY');
    expect(missing).toContain('STRIPE_WEBHOOK_SECRET');
    expect(missing).toContain('VOYAGE_API_KEY');
    expect(missing).toContain('RESEND_API_KEY');
    expect(missing).toHaveLength(7);
  });

  it('returns empty array for production with all secrets present', () => {
    const missing = validateProductionKeys({
      ...BASE_ENV,
      ENVIRONMENT: 'production',
      CLERK_SECRET_KEY: 'sk_live_xxx',
      CLERK_JWKS_URL: 'https://clerk.example.com/.well-known/jwks.json',
      GEMINI_API_KEY: 'gemini-key',
      STRIPE_SECRET_KEY: 'sk_live_xxx',
      STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
      VOYAGE_API_KEY: 'voyage-key',
      RESEND_API_KEY: 're_xxx',
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
      // Missing: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, VOYAGE_API_KEY, RESEND_API_KEY
    });

    expect(missing).toEqual([
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'VOYAGE_API_KEY',
      'RESEND_API_KEY',
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

  it('succeeds for production env with all required keys', () => {
    const env = validateEnv({
      ENVIRONMENT: 'production',
      DATABASE_URL: 'postgresql://prod/db',
      CLERK_SECRET_KEY: 'sk_live_xxx',
      CLERK_JWKS_URL: 'https://clerk.example.com/.well-known/jwks.json',
      GEMINI_API_KEY: 'gemini-key',
      STRIPE_SECRET_KEY: 'sk_live_xxx',
      STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
      VOYAGE_API_KEY: 'voyage-key',
      RESEND_API_KEY: 're_xxx',
    });

    expect(env.ENVIRONMENT).toBe('production');
  });
});
