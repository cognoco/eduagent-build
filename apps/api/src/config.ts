import { z } from 'zod';

const envSchema = z.object({
  ENVIRONMENT: z
    .enum(['development', 'staging', 'production'])
    .default('development'),
  DATABASE_URL: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  CLERK_JWKS_URL: z.string().url().optional(),
  CLERK_AUDIENCE: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  APP_URL: z.string().url().default('https://app.eduagent.com'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Stripe — required in production, optional for dev/test
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
  EMAIL_FROM: z.string().email().default('noreply@eduagent.com'),

  // Sentry — error tracking
  SENTRY_DSN: z.string().url().optional(),

  // Test seed — shared secret for /__test/* routes (optional, dev/staging only)
  TEST_SEED_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

// ---------------------------------------------------------------------------
// Production-critical keys — must be present when ENVIRONMENT === 'production'
// ---------------------------------------------------------------------------

const PRODUCTION_REQUIRED_KEYS: readonly (keyof Env)[] = [
  'CLERK_SECRET_KEY',
  'CLERK_JWKS_URL',
  'GEMINI_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'VOYAGE_API_KEY',
  'RESEND_API_KEY',
] as const;

/**
 * Validates that all production-critical keys are present.
 * Returns an array of missing key names (empty if all present).
 */
export function validateProductionKeys(env: Env): string[] {
  if (env.ENVIRONMENT !== 'production') {
    return [];
  }

  const missing: string[] = [];
  for (const key of PRODUCTION_REQUIRED_KEYS) {
    if (!env[key]) {
      missing.push(key);
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
