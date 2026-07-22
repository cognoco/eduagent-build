import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import * as Sentry from '@sentry/cloudflare';

import {
  ERROR_CODES,
  LlmStreamError,
  type SubscriptionTier,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';

import {
  captureException,
  scrubSentryEvent,
  dropConsoleBreadcrumb,
} from './services/sentry';
import { CircuitOpenError } from './services/llm';
import { isTransientDatabaseError } from './services/transient-db-retry';
import { ConsentWithdrawnError } from './services/session';
import {
  ForbiddenError,
  ConsentRequiredError,
  NotFoundError,
  ConflictError,
  RateLimitedError,
  UpstreamLlmError,
  BadRequestError,
  SchemaDriftError,
} from './errors';

import { envValidationMiddleware } from './middleware/env-validation';
import { maintenanceGateMiddleware } from './middleware/maintenance';
import { familyJoinGateMiddleware } from './middleware/family-join-gate';
import { authMiddleware } from './middleware/auth';
import { databaseMiddleware } from './middleware/database';
import {
  accountMiddleware,
  requireAccountMiddleware,
} from './middleware/account';
import { profileScopeMiddleware } from './middleware/profile-scope';
import type { ProfileMeta } from './middleware/profile-scope';
import type { LLMTier } from './services/subscription';
import { consentMiddleware } from './middleware/consent';
import { llmMiddleware } from './middleware/llm';
import { meteringMiddleware } from './middleware/metering';
import { requestLogger } from './middleware/request-logger';

import type { AuthUser } from './middleware/auth';
import type { Account } from './services/account';

import { health } from './routes/health';
import { profileRoutes } from './routes/profiles';
import { consentRoutes } from './routes/consent';
import { consentWebRoutes } from './routes/consent-web';
import { accountRoutes } from './routes/account';
import { inngestRoute } from './routes/inngest';
import { subjectRoutes } from './routes/subjects';
import { onboardingRoutes } from './routes/onboarding';
import { curriculumRoutes } from './routes/curriculum';
import { bookRoutes } from './routes/books';
import { noteRoutes } from './routes/notes';
import { sessionRoutes } from './routes/sessions';
import { mentorNoticeRoutes } from './routes/mentor-notices';
import { bookmarkRoutes } from './routes/bookmarks';
import { parkingLotRoutes } from './routes/parking-lot';
import { homeworkRoutes } from './routes/homework';
import { assessmentRoutes } from './routes/assessments';
import { retentionRoutes } from './routes/retention';
import { progressRoutes } from './routes/progress';
import { snapshotProgressRoutes } from './routes/snapshot-progress';
import { streakRoutes } from './routes/streaks';
import { settingsRoutes } from './routes/settings';
import { vocabularyRoutes } from './routes/vocabulary';
import { languageProgressRoutes } from './routes/language-progress';
import { coachingCardRoutes } from './routes/coaching-card';
import { celebrationRoutes } from './routes/celebrations';
import { dashboardRoutes } from './routes/dashboard';
import { recapsRoutes } from './routes/recaps';
import { noticesRoutes } from './routes/notices';
import { nudgeRoutes } from './routes/nudges';
import { notificationsRoutes } from './routes/notifications';
import { billingRoutes } from './routes/billing';
import { stripeWebhookRoute } from './routes/stripe-webhook';
import { testSeedRoutes } from './routes/test-seed';
import { revenuecatWebhookRoute } from './routes/revenuecat-webhook';
import { resendWebhookRoute } from './routes/resend-webhook';
import { filingRoutes } from './routes/filing';
import { bookSuggestionRoutes } from './routes/book-suggestions';
import { topicSuggestionRoutes } from './routes/topic-suggestions';
import { learnerProfileRoutes } from './routes/learner-profile';
import { dictationRoutes } from './routes/dictation';
import { speakingPracticeRoutes } from './routes/speaking-practice';
import { quizRoutes } from './routes/quiz';
import { feedbackRoutes } from './routes/feedback';
import { supportRoutes } from './routes/support';
import { activationEventsRoutes } from './routes/activation-events';
import { librarySearchRoutes } from './routes/library-search';
import { maintenanceRoutes } from './routes/maintenance';
import { challengeRoundRoutes } from './routes/challenge-round';
import { nowRoutes } from './routes/now';
import { scopesRoutes } from './routes/scopes';
import { visibilityRoutes } from './routes/visibility';
import { familyJoinRoutes } from './routes/family-join';
import { analyticsRoutes } from './routes/analytics';

// [Issue-888] Bindings must stay in sync with envSchema in config.ts.
// All string env vars that envSchema declares must appear here so c.env.X
// accesses are typed rather than implicit `any`. KV bindings (KVNamespace)
// are not part of envSchema (they are runtime objects, not strings) and are
// listed separately at the bottom of this type.
//
// MAINTENANCE_PRODUCTION_ENABLED is intentionally absent: maintenance.ts uses
// a local MaintenanceEnv type for deliberate domain separation — it is an
// operator-only flag, not a global app config key. This is the correct pattern.
type Bindings = {
  // Core
  ENVIRONMENT: string;
  DATABASE_URL: string;
  APP_URL?: string;
  API_ORIGIN?: string;
  LOG_LEVEL?: string;

  // Auth (Clerk)
  CLERK_SECRET_KEY?: string;
  CLERK_JWKS_URL?: string;
  CLERK_AUDIENCE?: string;

  // LLM providers
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  // Interactive-routing v2 vendors (MMT-ADR-0016 §1.5)
  CEREBRAS_API_KEY?: string;
  MISTRAL_API_KEY?: string;

  // Stripe — dormant until web client added
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PLUS_MONTHLY?: string;
  STRIPE_PRICE_PLUS_YEARLY?: string;
  STRIPE_PRICE_FAMILY_MONTHLY?: string;
  STRIPE_PRICE_FAMILY_YEARLY?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  STRIPE_PRICE_PRO_YEARLY?: string;
  STRIPE_CUSTOMER_PORTAL_URL?: string;

  // Voyage AI — embedding provider
  VOYAGE_API_KEY?: string;

  // Resend — transactional email
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  EMAIL_FROM?: string;

  // Inngest — background jobs
  INNGEST_SIGNING_KEY?: string;
  INNGEST_EVENT_KEY?: string;

  // RevenueCat — IAP webhook and REST API access
  REVENUECAT_WEBHOOK_SECRET?: string;
  REVENUECAT_REST_API_KEY?: string;

  // Observability
  SENTRY_DSN?: string;
  ANALYTICS_HASH_KEY?: string;

  // Consent policy versioning
  CONSENT_POLICY_VERSION?: string;

  // Testing & operator tooling
  TEST_SEED_SECRET?: string;
  MAINTENANCE_SECRET?: string;
  SUPPORT_EMAIL?: string;
  DEPLOY_SHA?: string;

  // Feature flags
  EMPTY_REPLY_GUARD_ENABLED?: string;
  RETENTION_PURGE_ENABLED?: string;
  FAMILY_JOIN_ENABLED?: string;
  MEMORY_FACTS_READ_ENABLED?: string;
  MEMORY_FACTS_RELEVANCE_RETRIEVAL?: string;
  MEMORY_FACTS_DEDUP_ENABLED?: string;
  // Note: these are string at the CF Workers boundary; envSchema uses z.coerce.number()
  MEMORY_FACTS_DEDUP_THRESHOLD?: string;
  MAX_DEDUP_LLM_CALLS_PER_SESSION?: string;
  MEMORY_FACTS_DEDUP_ROLLOUT_PCT?: string;
  MATCHER_ENABLED?: string;
  ALLOW_MISSING_IDEMPOTENCY_KV?: string;
  ADULT_OWNER_GATE_ENABLED?: string;
  CHALLENGE_ROUND_RUNTIME_ENABLED?: string;
  ANSWER_EVALUATION_RUNTIME_ENABLED?: string;
  MENTOR_NOTICE_ENABLED?: string;
  MENTOR_NOTICE_PUSH_POST_MVP_ENABLED?: string;
  CHALLENGE_ROUND_COHORT_PROFILE_IDS?: string;
  CHALLENGE_ROUND_GRADER_ENABLED?: string;
  JUDGE_FRAMEWORK_ENABLED?: string;
  JUDGE_ENFORCEMENT_ENABLED?: string;
  LLM_ROUTING_V2_ENABLED?: string;
  MODE_NAV_V2_ENABLED?: string;
  // Two-stage convergence freeze gate (maintenance.ts). Default 'false'.
  MAINTENANCE_READONLY?: string;
  MAINTENANCE_BLOCK_INNGEST?: string;
  // S5 managed visibility tier. Default 'false'.
  MANAGED_TIER_ACTIVE?: string;

  // KV Namespaces — runtime objects, not env strings; listed separately
  SUBSCRIPTION_KV?: KVNamespace;
  IDEMPOTENCY_KV?: KVNamespace;
};

type Variables = {
  user: AuthUser;
  db: Database;
  account: Account;
  profileId: string;
  profileMeta: ProfileMeta | undefined;
  callerPersonId: string | undefined;
  subscriptionId: string;
  subscriptionTier: SubscriptionTier | undefined;
  llmTier: LLMTier;
  quotaRemainingTurns: number | undefined;
  quotaFractionRemaining: number | undefined;
};

type Env = { Bindings: Bindings; Variables: Variables };

// ---------------------------------------------------------------------------
// Route definition — a plain Hono instance (no basePath) so that `AppType`
// gives the RPC client a flat namespace (`client.profiles`, not `client.v1.profiles`).
// ---------------------------------------------------------------------------
const api = new Hono<Env>();

// [BUG-244] CORS — explicit production allowlist. The previous policy allowed
// any `*.mentomate.com` subdomain with `credentials: true`. That's a subdomain
// takeover risk: if any dangling CNAME, abandoned preview deploy, or future
// vendor subdomain ends up under attacker control, the attacker can read
// cookies / authenticated responses for the whole API. We now enumerate every
// allowed production origin by exact match and keep localhost wildcards only
// because dev clients vary by port.
const ALLOWED_PRODUCTION_ORIGINS: ReadonlySet<string> = new Set([
  'https://mentomate.com',
  'https://www.mentomate.com',
  'https://app.mentomate.com',
  // Web staging — used by Playwright E2E and stakeholder previews.
  'https://stg.mentomate.com',
  'https://app-stg.mentomate.com',
]);

api.use(
  '*',
  cors({
    origin: (origin, c) => {
      if (!origin) return '';
      const env = (c as unknown as { env?: Bindings }).env;
      // Allow any localhost / 127.0.0.1 port in non-production only
      // (Metro, Expo web, Playwright dev tooling). Gating this on ENVIRONMENT
      // prevents a local-app running on a victim's machine from making
      // credentialed cross-origin requests against the production API.
      // When env is absent entirely (e.g. unit tests calling app.request()
      // without bindings), we treat it as non-production for ergonomic test
      // defaults. When env IS present but ENVIRONMENT is absent or unrecognised
      // (misconfigured deployed Worker), we fail-closed → production behaviour,
      // so localhost CORS is never open in a real deployment.
      const isNonProduction =
        env === undefined
          ? true // no bindings at all → unit-test path, keep non-prod default
          : env.ENVIRONMENT !== 'production' &&
            env.ENVIRONMENT !== undefined &&
            env.ENVIRONMENT !== '';
      if (isNonProduction) {
        if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return origin;
        if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return origin;
      }
      // Production: exact-match allowlist only. No subdomain wildcards.
      return ALLOWED_PRODUCTION_ORIGINS.has(origin) ? origin : '';
    },
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Profile-Id',
      'X-Proxy-Mode',
      'Idempotency-Key',
      'X-Maintenance-Secret',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: [
      'Content-Type',
      'X-Quota-Remaining',
      'X-Quota-Warning-Level',
      'Idempotency-Replay',
    ],
    credentials: true,
    maxAge: 3600,
  }),
);

// [BUG-245] Global security headers — JSON API needs the standard defensive
// set even though the typical client is a mobile/native app. The defaults
// emit `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
// `Referrer-Policy`, `Cross-Origin-Resource-Policy: same-origin`,
// `X-Frame-Options`, etc. We disable the default Content Security
// Policy because this is a JSON API (CSP applies to HTML responses) and the
// only HTML we serve is the consent-web flow which sets its own CSP on the
// page itself.
// contentSecurityPolicy omitted intentionally — this is a JSON API; CSP
// applies to HTML responses. The consent-web flow sets its own per-page CSP.
api.use(
  '*',
  secureHeaders({
    referrerPolicy: 'strict-origin-when-cross-origin',
    xFrameOptions: 'DENY',
  }),
);

// Request logging — runs before auth so every request (including public) is logged
api.use('*', requestLogger);

// Env validation — validates c.env bindings on first request only; skipped in tests
api.use('*', envValidationMiddleware);

// [WI-586 §4 step 1] Maintenance gate — the two-stage convergence freeze.
// Mounted BEFORE auth/account resolution so it 503s all user/API/webhook
// traffic and thereby kills the JIT legacy-account provisioning that
// accountMiddleware performs on any authed request (incl. GET). Inert in every
// normal deploy (both MAINTENANCE_* flags default 'false'); /v1/health and (in
// stage 1) the signed /v1/inngest endpoint stay exempt so the Inngest drain
// can complete.
api.use('*', maintenanceGateMiddleware);

// [WI-1753] Family-join launch gate — 404s /v1/family-join/* unless
// FAMILY_JOIN_ENABLED === 'true'. Mounted BEFORE auth/database/account (and
// therefore before the route's zValidator) so a disabled surface is genuinely
// dark: an unauthenticated probe gets 404 rather than 401, malformed JSON gets
// 404 rather than 400, and no DB/identity work runs for a switched-off feature.
// A handler-level check runs too late to close any of those. Inert once the
// flag is on.
api.use('*', familyJoinGateMiddleware);

// Auth middleware — runs before all routes; public paths are skipped internally
api.use('*', authMiddleware);

// Database middleware — creates per-request Database instance from env binding
api.use('*', databaseMiddleware);

// Account middleware — resolves Clerk user → local Account; skips public routes
api.use('*', accountMiddleware);

// [CR-353] Account-presence enforcement — centralized guard that returns 401
// (not 500) if an authenticated request reaches routes without a resolved account.
// Protects all 43+ c.get('account') call sites from middleware ordering regressions.
api.use('*', requireAccountMiddleware);

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
  .route('/', profileRoutes)
  .route('/', consentRoutes)
  .route('/', consentWebRoutes)
  .route('/', accountRoutes)
  .route('/', inngestRoute)
  .route('/', subjectRoutes)
  .route('/', onboardingRoutes)
  .route('/', curriculumRoutes)
  .route('/', bookRoutes)
  .route('/', noteRoutes)
  .route('/', sessionRoutes)
  .route('/', mentorNoticeRoutes)
  .route('/', bookmarkRoutes)
  .route('/', parkingLotRoutes)
  .route('/', homeworkRoutes)
  .route('/', assessmentRoutes)
  .route('/', retentionRoutes)
  .route('/', progressRoutes)
  .route('/', snapshotProgressRoutes)
  .route('/', streakRoutes)
  .route('/', settingsRoutes)
  .route('/', vocabularyRoutes)
  .route('/', languageProgressRoutes)
  .route('/', coachingCardRoutes)
  .route('/', celebrationRoutes)
  .route('/', dashboardRoutes)
  .route('/', recapsRoutes)
  .route('/', noticesRoutes)
  .route('/', nudgeRoutes)
  .route('/', notificationsRoutes)
  .route('/', billingRoutes)
  .route('/', stripeWebhookRoute)
  .route('/', revenuecatWebhookRoute)
  .route('/', resendWebhookRoute)
  .route('/', testSeedRoutes)
  .route('/', maintenanceRoutes)
  .route('/', filingRoutes)
  .route('/', bookSuggestionRoutes)
  .route('/', topicSuggestionRoutes)
  .route('/', learnerProfileRoutes)
  .route('/', dictationRoutes)
  .route('/', speakingPracticeRoutes)
  .route('/', quizRoutes)
  .route('/', feedbackRoutes)
  .route('/support', supportRoutes)
  .route('/', librarySearchRoutes)
  .route('/', scopesRoutes)
  .route('/', visibilityRoutes)
  .route('/', familyJoinRoutes)
  .route('/', analyticsRoutes)
  .route('/', nowRoutes)
  .route('/', challengeRoundRoutes)
  .route('/', activationEventsRoutes);

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
  // HTTPException is Hono's standard mechanism for non-500 errors thrown from
  // middleware/routes (e.g. requireProfileId → 401). Forward its response as-is.
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  // [EP15-I5] Typed-error classification at the boundary (per global
  // AGENTS.md "Typed Error Hierarchy" rule). Services throw
  // ForbiddenError/NotFoundError; this handler converts them to HTTP
  // status codes once, so individual route handlers don't need per-endpoint
  // try/catch. Important: we do NOT captureException for these — they are
  // expected domain outcomes, not server faults.
  if (err instanceof ForbiddenError) {
    // [OPT-C] apiCode threaded through so the mobile client can distinguish
    // ADULT_OWNER_REQUIRED (and future apiCodes) from a generic 403.
    return c.json(
      {
        code: ERROR_CODES.FORBIDDEN,
        apiCode: err.apiCode,
        message: err.message,
      },
      403,
    );
  }
  if (err instanceof ConsentRequiredError) {
    return c.json(
      { code: ERROR_CODES.CONSENT_REQUIRED, message: err.message },
      403,
    );
  }
  // [WI-2396] `assertLlmConsent` (consent-status-v2.ts) throws this from the
  // six request-time LLM routes outside the exchange pipeline. Centralizing
  // the mapping here (rather than a per-route try/catch) follows the same
  // EP15-I5 boundary-classification pattern as ConsentRequiredError above.
  // sessions.ts's two existing local catches for this error still work
  // unchanged — a local catch intercepts before the error reaches onError.
  if (err instanceof ConsentWithdrawnError) {
    return c.json(
      { code: ERROR_CODES.CONSENT_WITHDRAWN, message: err.message },
      403,
    );
  }
  if (err instanceof NotFoundError) {
    return c.json({ code: ERROR_CODES.NOT_FOUND, message: err.message }, 404);
  }
  if (err instanceof ConflictError) {
    return c.json({ code: ERROR_CODES.CONFLICT, message: err.message }, 409);
  }
  if (err instanceof RateLimitedError) {
    if (err.retryAfter != null) {
      c.header('Retry-After', String(err.retryAfter));
    }
    return c.json(
      { code: ERROR_CODES.RATE_LIMITED, message: err.message },
      429,
    );
  }
  // [BUG-STALE-OPTIONS] 400 for domain-level bad-request conditions (e.g.
  // MC answer not in question.options). Not a server fault — no Sentry.
  if (err instanceof BadRequestError) {
    return c.json(
      { code: ERROR_CODES.VALIDATION_ERROR, message: err.message },
      400,
    );
  }
  // [CCR PR #215] Schema-drift fault: a DB row exists but does not validate.
  // Surface 500 so the client renders a real error (not 404 "missing").
  // DO NOT call captureException here — the service layer (mapMonthlyReportRow /
  // mapWeeklyReportRow) already captured the ZodError with rich row-level
  // context (row PK, profileId, childProfileId, zod issues) before throwing.
  // A second capture here would create duplicate Sentry events per drift,
  // doubling noise and breaking Sentry issue grouping.
  // Sentry capture is verified in: services/monthly-report.test.ts and
  // services/weekly-report.test.ts (schema-drift break tests, CCR PR #215).
  if (err instanceof SchemaDriftError) {
    return c.json(
      {
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          c.env.ENVIRONMENT === 'production'
            ? 'Internal server error'
            : err.message,
      },
      500,
    );
  }

  if (err instanceof UpstreamLlmError) {
    // Track LLM-provider drift in Sentry; surface 502 so clients can retry.
    captureException(err, {
      userId: c.get('user')?.userId,
      profileId: c.get('profileId'),
      requestPath: c.req.path,
    });
    return c.json(
      { code: ERROR_CODES.UPSTREAM_ERROR, message: err.message },
      502,
    );
  }

  if (err instanceof CircuitOpenError) {
    captureException(err, {
      userId: c.get('user')?.userId,
      profileId: c.get('profileId'),
      requestPath: c.req.path,
      extra: { provider: err.provider, circuitKey: err.circuitKey },
    });
    return c.json(
      {
        code: ERROR_CODES.LLM_UNAVAILABLE,
        message: err.message,
      },
      503,
    );
  }

  // [BUG-950] LlmStreamError wraps the real cause — unwrap so typed errors
  // (UpstreamLlmError, RateLimitedError, etc.) are classified correctly
  // instead of falling through to the generic 500.
  if (err instanceof LlmStreamError && err.cause instanceof Error) {
    const cause = err.cause;
    if (cause instanceof UpstreamLlmError) {
      captureException(cause, {
        userId: c.get('user')?.userId,
        profileId: c.get('profileId'),
        requestPath: c.req.path,
        extra: { wrapper: err.message },
      });
      return c.json(
        { code: ERROR_CODES.UPSTREAM_ERROR, message: cause.message },
        502,
      );
    }
    if (cause instanceof CircuitOpenError) {
      captureException(cause, {
        userId: c.get('user')?.userId,
        profileId: c.get('profileId'),
        requestPath: c.req.path,
        extra: {
          wrapper: err.message,
          provider: cause.provider,
          circuitKey: cause.circuitKey,
        },
      });
      return c.json(
        { code: ERROR_CODES.LLM_UNAVAILABLE, message: cause.message },
        503,
      );
    }
    captureException(err, {
      userId: c.get('user')?.userId,
      profileId: c.get('profileId'),
      requestPath: c.req.path,
      extra: { cause: cause.message, causeName: cause.name },
    });
    return c.json(
      {
        code: ERROR_CODES.LLM_UNAVAILABLE,
        message:
          c.env.ENVIRONMENT === 'production'
            ? 'AI service temporarily unavailable'
            : `${err.message}: ${cause.message}`,
      },
      503,
    );
  }

  if (isTransientDatabaseError(err)) {
    captureException(err, {
      userId: c.get('user')?.userId,
      profileId: c.get('profileId'),
      requestPath: c.req.path,
      extra: { transient: true },
    });
    c.header('Retry-After', '1');
    return c.json(
      {
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: 'Database temporarily unavailable — please retry',
      },
      503,
    );
  }

  // Report to Sentry with user/request context (primary observability channel)
  captureException(err, {
    userId: c.get('user')?.userId,
    profileId: c.get('profileId'),
    requestPath: c.req.path,
  });

  // Only log to console in non-production (avoid leaking stack traces / internal paths)
  if (c.env.ENVIRONMENT !== 'production') {
    console.error('[unhandled]', err);
  }

  return c.json(
    {
      code: ERROR_CODES.INTERNAL_ERROR,
      message:
        c.env.ENVIRONMENT === 'production'
          ? 'Internal server error'
          : err.message || 'Internal server error',
    },
    500,
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
    // [WI-2339] @sentry/cloudflare's sdk.js already defaults
    // sendDefaultPii to false (verified: sdk.js:14, `options.sendDefaultPii
    // ?? false`) — this line changes no runtime behavior. Set explicitly so
    // the PII-attachment posture is asserted in code, not inherited from an
    // SDK default that could change on a future upgrade.
    sendDefaultPii: false,
    // [WI-1990] Defense-in-depth PII backstop — strips denylisted keys
    // (learner free-text, names, etc.) from extra/contexts before an event
    // leaves the API. Not a substitute for call-site discipline.
    beforeSend: scrubSentryEvent,
    // [WI-2353 rework] beforeSend only fires on error events — with
    // tracesSampleRate non-zero, requestDataIntegration attaches the same
    // event.request.headers (including Authorization) to sampled
    // TRANSACTION events too, and those bypass beforeSend entirely. Wire
    // the same scrub to beforeSendTransaction so the Authorization
    // redaction (and the pre-existing cookie exclusion) applies uniformly
    // to both event types. Mirrors the two-hook pattern already used by
    // apps/mobile/src/lib/sentry.ts.
    beforeSendTransaction: scrubSentryEvent,
    // [WI-1990 rework] The SDK's default consoleIntegration() turns every
    // console.* call into a breadcrumb with the raw args embedded in a
    // string (message / data.arguments) — content a key-based scrubber
    // can't reach. Drop console breadcrumbs entirely; see
    // dropConsoleBreadcrumb's doc comment in services/sentry.ts.
    beforeBreadcrumb: dropConsoleBreadcrumb,
  }),
  // Hono's app.fetch signature is compatible but not structurally identical
  // to ExportedHandler — cast via unknown to bridge the gap.
  { fetch: app.fetch } as unknown as ExportedHandler,
);
