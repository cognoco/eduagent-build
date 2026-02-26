import { Hono } from 'hono';
import { cors } from 'hono/cors';
import * as Sentry from '@sentry/cloudflare';

import { ERROR_CODES } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';

import { captureException } from './services/sentry';

import { envValidationMiddleware } from './middleware/env-validation';
import { authMiddleware } from './middleware/auth';
import { databaseMiddleware } from './middleware/database';
import { accountMiddleware } from './middleware/account';
import { profileScopeMiddleware } from './middleware/profile-scope';
import type { ProfileMeta } from './middleware/profile-scope';
import { consentMiddleware } from './middleware/consent';
import { llmMiddleware } from './middleware/llm';
import { meteringMiddleware } from './middleware/metering';
import { requestLogger } from './middleware/request-logger';

import type { AuthUser } from './middleware/auth';
import type { Account } from './services/account';

import { health } from './routes/health';
import { auth } from './routes/auth';
import { profileRoutes } from './routes/profiles';
import { consentRoutes } from './routes/consent';
import { consentWebRoutes } from './routes/consent-web';
import { accountRoutes } from './routes/account';
import { inngestRoute } from './routes/inngest';
import { subjectRoutes } from './routes/subjects';
import { interviewRoutes } from './routes/interview';
import { curriculumRoutes } from './routes/curriculum';
import { sessionRoutes } from './routes/sessions';
import { parkingLotRoutes } from './routes/parking-lot';
import { homeworkRoutes } from './routes/homework';
import { assessmentRoutes } from './routes/assessments';
import { retentionRoutes } from './routes/retention';
import { progressRoutes } from './routes/progress';
import { streakRoutes } from './routes/streaks';
import { settingsRoutes } from './routes/settings';
import { coachingCardRoutes } from './routes/coaching-card';
import { dashboardRoutes } from './routes/dashboard';
import { billingRoutes } from './routes/billing';
import { stripeWebhookRoute } from './routes/stripe-webhook';
import { testSeedRoutes } from './routes/test-seed';

type Bindings = {
  ENVIRONMENT: string;
  DATABASE_URL: string;
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_JWKS_URL?: string;
  GEMINI_API_KEY?: string;
  LOG_LEVEL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PLUS_MONTHLY?: string;
  STRIPE_PRICE_PLUS_YEARLY?: string;
  STRIPE_PRICE_FAMILY_MONTHLY?: string;
  STRIPE_PRICE_FAMILY_YEARLY?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  STRIPE_PRICE_PRO_YEARLY?: string;
  STRIPE_CUSTOMER_PORTAL_URL?: string;
  SUBSCRIPTION_KV?: KVNamespace;
  VOYAGE_API_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  SENTRY_DSN?: string;
  COACHING_KV?: KVNamespace;
};

type Variables = {
  user: AuthUser;
  db: Database;
  account: Account;
  profileId: string;
  profileMeta: ProfileMeta;
  subscriptionId: string;
};

type Env = { Bindings: Bindings; Variables: Variables };

// ---------------------------------------------------------------------------
// Route definition — a plain Hono instance (no basePath) so that `AppType`
// gives the RPC client a flat namespace (`client.profiles`, not `client.v1.profiles`).
// ---------------------------------------------------------------------------
const api = new Hono<Env>();

// CORS — allow local dev and production origins; must run before auth so OPTIONS preflight succeeds
api.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return '*';
      // Allow any localhost port (Metro, Expo web, etc.)
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return origin;
      if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return origin;
      // Production origins
      if (origin.endsWith('.eduagent.app') || origin === 'https://eduagent.app')
        return origin;
      return '';
    },
    allowHeaders: ['Content-Type', 'Authorization', 'X-Profile-Id'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Type'],
    credentials: true,
    maxAge: 3600,
  })
);

// Request logging — runs before auth so every request (including public) is logged
api.use('*', requestLogger);

// Env validation — validates c.env bindings on first request only; skipped in tests
api.use('*', envValidationMiddleware);

// Auth middleware — runs before all routes; public paths are skipped internally
api.use('*', authMiddleware);

// Database middleware — creates per-request Database instance from env binding
api.use('*', databaseMiddleware);

// Account middleware — resolves Clerk user → local Account; skips public routes
api.use('*', accountMiddleware);

// Profile scope middleware — reads X-Profile-Id header, verifies ownership; skips when absent
api.use('*', profileScopeMiddleware);

// Consent middleware — blocks data-collecting routes for profiles with pending consent (AUDIT-001)
api.use('*', consentMiddleware);

// Metering middleware — enforces quota on LLM-consuming routes (session messages/stream)
api.use('*', meteringMiddleware);

// LLM middleware — lazy-registers the Gemini provider from env bindings on first request
api.use('*', llmMiddleware);

// Route registration — chained so TypeScript preserves the full route schema
// in the inferred type. This is required for Hono RPC (`hc<AppType>`) to work
// across project-reference boundaries where declaration emit is used.
const routes = api
  .route('/', health)
  .route('/', auth)
  .route('/', profileRoutes)
  .route('/', consentRoutes)
  .route('/', consentWebRoutes)
  .route('/', accountRoutes)
  .route('/', inngestRoute)
  .route('/', subjectRoutes)
  .route('/', interviewRoutes)
  .route('/', curriculumRoutes)
  .route('/', sessionRoutes)
  .route('/', parkingLotRoutes)
  .route('/', homeworkRoutes)
  .route('/', assessmentRoutes)
  .route('/', retentionRoutes)
  .route('/', progressRoutes)
  .route('/', streakRoutes)
  .route('/', settingsRoutes)
  .route('/', coachingCardRoutes)
  .route('/', dashboardRoutes)
  .route('/', billingRoutes)
  .route('/', stripeWebhookRoute)
  .route('/', testSeedRoutes);

// ---------------------------------------------------------------------------
// App — mounts routes under /v1 for the actual Cloudflare Worker runtime.
// AppType is derived from `routes` (no basePath) so the RPC client accesses
// `client.health`, `client.profiles`, etc. without a `v1` segment.
// The mobile client sets the base URL to include `/v1`.
// ---------------------------------------------------------------------------
const app = new Hono<Env>().basePath('/v1');
app.route('/', routes);

// Global error handler — catches unhandled exceptions and returns ApiErrorSchema envelope
app.onError((err, c) => {
  console.error('[unhandled]', err);

  // Report to Sentry with user/request context
  captureException(err, {
    userId: c.get('user')?.userId,
    profileId: c.get('profileId'),
    requestPath: c.req.path,
  });

  return c.json(
    {
      code: ERROR_CODES.INTERNAL_ERROR,
      message:
        c.env.ENVIRONMENT === 'production'
          ? 'Internal server error'
          : err.message || 'Internal server error',
    },
    500
  );
});

export type AppType = typeof routes;

// Named export for tests — the raw Hono app with `.request()` method.
export { app };

// Default export — wrapped with Sentry for error tracking on Cloudflare Workers.
// withSentry() initializes the SDK per-request using env bindings.
// When SENTRY_DSN is not set, the SDK no-ops gracefully.
export default Sentry.withSentry(
  (env) => ({
    dsn: (env as unknown as Bindings).SENTRY_DSN,
    tracesSampleRate:
      (env as unknown as Bindings).ENVIRONMENT === 'production' ? 0.1 : 1.0,
  }),
  // Hono's app.fetch signature is compatible but not structurally identical
  // to ExportedHandler — cast via unknown to bridge the gap.
  { fetch: app.fetch } as unknown as ExportedHandler
);
