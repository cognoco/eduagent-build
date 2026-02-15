import { Hono } from 'hono';
import { authMiddleware } from './middleware/auth';
import type { AuthUser } from './middleware/auth';
import { health } from './routes/health';
import { auth } from './routes/auth';
import { profileRoutes } from './routes/profiles';
import { consentRoutes } from './routes/consent';
import { accountRoutes } from './routes/account';
import { inngestRoute } from './routes/inngest';

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

export type AppType = typeof app;

// Default export required by Cloudflare Workers
export default app;
