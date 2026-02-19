import { Hono } from 'hono';

import { ERROR_CODES } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';

import { authMiddleware } from './middleware/auth';
import { databaseMiddleware } from './middleware/database';
import { accountMiddleware } from './middleware/account';
import { profileScopeMiddleware } from './middleware/profile-scope';
import { llmMiddleware } from './middleware/llm';
import { meteringMiddleware } from './middleware/metering';
import { requestLogger } from './middleware/request-logger';

import type { AuthUser } from './middleware/auth';
import type { Account } from './services/account';

import { health } from './routes/health';
import { auth } from './routes/auth';
import { profileRoutes } from './routes/profiles';
import { consentRoutes } from './routes/consent';
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
};

type Variables = {
  user: AuthUser;
  db: Database;
  account: Account;
  profileId: string;
  subscriptionId: string;
};

type Env = { Bindings: Bindings; Variables: Variables };

// ---------------------------------------------------------------------------
// Route definition — a plain Hono instance (no basePath) so that `AppType`
// gives the RPC client a flat namespace (`client.profiles`, not `client.v1.profiles`).
// ---------------------------------------------------------------------------
const api = new Hono<Env>();

// Request logging — runs before auth so every request (including public) is logged
api.use('*', requestLogger);

// Auth middleware — runs before all routes; public paths are skipped internally
api.use('*', authMiddleware);

// Database middleware — creates per-request Database instance from env binding
api.use('*', databaseMiddleware);

// Account middleware — resolves Clerk user → local Account; skips public routes
api.use('*', accountMiddleware);

// Profile scope middleware — reads X-Profile-Id header, verifies ownership; skips when absent
api.use('*', profileScopeMiddleware);

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
  .route('/', stripeWebhookRoute);

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

// Default export required by Cloudflare Workers
export default app;
