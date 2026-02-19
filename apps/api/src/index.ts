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

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath(
  '/v1'
);

// Request logging — runs before auth so every request (including public) is logged
app.use('*', requestLogger);

// Auth middleware — runs before all routes; public paths are skipped internally
app.use('*', authMiddleware);

// Database middleware — creates per-request Database instance from env binding
app.use('*', databaseMiddleware);

// Account middleware — resolves Clerk user → local Account; skips public routes
app.use('*', accountMiddleware);

// Profile scope middleware — reads X-Profile-Id header, verifies ownership; skips when absent
app.use('*', profileScopeMiddleware);

// Metering middleware — enforces quota on LLM-consuming routes (session messages/stream)
app.use('*', meteringMiddleware);

// LLM middleware — lazy-registers the Gemini provider from env bindings on first request
app.use('*', llmMiddleware);

app.route('/', health);
app.route('/', auth);
app.route('/', profileRoutes);
app.route('/', consentRoutes);
app.route('/', accountRoutes);
app.route('/', inngestRoute);
app.route('/', subjectRoutes);
app.route('/', interviewRoutes);
app.route('/', curriculumRoutes);
app.route('/', sessionRoutes);
app.route('/', parkingLotRoutes);
app.route('/', homeworkRoutes);
app.route('/', assessmentRoutes);
app.route('/', retentionRoutes);
app.route('/', progressRoutes);
app.route('/', streakRoutes);
app.route('/', settingsRoutes);
app.route('/', coachingCardRoutes);
app.route('/', dashboardRoutes);
app.route('/', billingRoutes);
app.route('/', stripeWebhookRoute);

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

export type AppType = typeof app;

// Default export required by Cloudflare Workers
export default app;
