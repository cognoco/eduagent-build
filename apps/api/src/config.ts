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

  // Sentry — error tracking
  SENTRY_DSN: z.string().url().optional(),

  // Test seed — shared secret for /__test/* routes (optional, dev/staging only)
  TEST_SEED_SECRET: z.string().min(1).optional(),

  // RevenueCat — webhook authentication
  REVENUECAT_WEBHOOK_SECRET: z.string().min(1).optional(),

  // Empty-reply stream guard — per-request kill switch for the
  // [EMPTY-REPLY-GUARD] classifier in streamMessage.onComplete and
  // streamInterviewExchange.onComplete. When 'false', the service skips
  // classification and falls through to the legacy parse-and-persist path
  // (same behavior as before [EMPTY-REPLY-GUARD-1]). Flip to 'false' in
  // Doppler to disable the feature without redeploying if the classifier
  // misfires in production. Default: 'true'.
  EMPTY_REPLY_GUARD_ENABLED: z.enum(['true', 'false']).default('true'),
});

export type Env = z.infer<typeof envSchema>;

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

export function validateEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const formatted = result.error.flatten();
    throw new Error(
      `Invalid environment: ${JSON.stringify(formatted.fieldErrors)}`
    );
  }

  const env = result.data;
  const missingKeys = validateProductionKeys(env);
  if (missingKeys.length > 0) {
    throw new Error(
      `Production environment missing required keys: ${missingKeys.join(', ')}`
    );
  }

  return env;
}
