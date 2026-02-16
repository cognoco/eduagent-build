import { Hono } from 'hono';
import { authMiddleware } from './middleware/auth';
import type { AuthUser } from './middleware/auth';
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

type Bindings = {
  ENVIRONMENT: string;
  DATABASE_URL: string;
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_JWKS_URL?: string;
};

type Variables = {
  user: AuthUser;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath(
  '/v1'
);

// Auth middleware — runs before all routes; public paths are skipped internally
app.use('*', authMiddleware);

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

export type AppType = typeof app;

// Default export required by Cloudflare Workers
export default app;
