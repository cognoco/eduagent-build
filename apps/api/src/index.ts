import { Hono } from 'hono';
import { authMiddleware } from './middleware/auth';
import { databaseMiddleware } from './middleware/database';
import { requestLogger } from './middleware/request-logger';
import type { AuthUser } from './middleware/auth';
import type { Database } from '@eduagent/database';
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
import { dashboardRoutes } from './routes/dashboard';
import { billingRoutes } from './routes/billing';
import { stripeWebhookRoute } from './routes/stripe-webhook';

type Bindings = {
  ENVIRONMENT: string;
  DATABASE_URL: string;
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_JWKS_URL?: string;
  LOG_LEVEL?: string;
};

type Variables = {
  user: AuthUser;
  db: Database;
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
app.route('/', dashboardRoutes);
app.route('/', billingRoutes);
app.route('/', stripeWebhookRoute);

export type AppType = typeof app;

// Default export required by Cloudflare Workers
export default app;
