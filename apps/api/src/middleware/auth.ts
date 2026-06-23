import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import { ERROR_CODES } from '@eduagent/schemas';
import { decodeJWTHeader, lookupJWKByKid, verifyJWT } from './jwt';
import type { JWK } from './jwt';
import { captureException, addBreadcrumb } from '../services/sentry';
import { createLogger } from '../services/logger';

const logger = createLogger();

// [BUG-902] Max age (seconds) accepted for a Clerk session token, measured from
// its `iat`. Clerk rotates session tokens every ~1 min; this 10-minute ceiling
// gives generous headroom over that TTL (clock skew, refresh races) while
// bounding how long a leaked-but-unexpired token can be replayed. Passed
// explicitly to verifyJWT so the generic 24h default (for arbitrary IdPs) does
// not apply to the Clerk auth path.
const CLERK_TOKEN_MAX_AGE_SEC = 10 * 60; // 10 minutes

// ---------------------------------------------------------------------------
// JWT claims schema
// ---------------------------------------------------------------------------

// [F-021] Validate JWT payload claims at the trust boundary.
// `verifyJWT` returns a JSON.parse cast — sub/email are not guaranteed to be
// present or the right type. Parse with Zod before trusting any value.
const clerkJWTClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  // Clerk factor-verification-age claim: minutes since primary/secondary
  // factor verification. -1 means that factor was not applicable.
  fva: z.tuple([z.number(), z.number()]).optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  userId: string;
  email?: string;
  /** True only when Clerk's email_verified claim is explicitly true in the JWT. */
  emailVerified?: boolean;
  factorVerificationAge?: [number, number];
}

export type AuthEnv = {
  Bindings: {
    CLERK_JWKS_URL?: string;
    CLERK_AUDIENCE?: string;
  };
  Variables: {
    user: AuthUser;
  };
};

// ---------------------------------------------------------------------------
// Public routes that skip auth
// ---------------------------------------------------------------------------

const PUBLIC_PATHS = [
  '/v1/health',
  '/v1/inngest',
  // [BUG-647 / FCR-2026-05-23-L2.M2.4] Pin to the exact known Stripe webhook
  // path. The previous '/v1/stripe/' prefix entry auth-bypassed every future
  // route added under /v1/stripe/* without explicit opt-in. Only the webhook
  // route (POST /v1/stripe/webhook in routes/stripe-webhook.ts) is intentionally
  // public — it verifies signatures via Stripe-Signature header.
  '/v1/stripe/webhook',
  '/v1/revenuecat/webhook',
  // [WI-85] Resend (Svix) delivery webhook. Carries no Clerk token; the route
  // handler verifies the Svix HMAC signature itself (RESEND_WEBHOOK_SECRET).
  // Without this entry the global Clerk authMiddleware 401s the request before
  // signature verification can run. Bare entry (no sub-paths), like revenuecat.
  '/v1/webhooks/resend',
  '/v1/consent/respond',
  '/v1/consent-page',
  '/v1/__test/',
  '/v1/maintenance/',
  // Stripe post-checkout landing pages [UX-DE-M10] — must be reachable by
  // anyone holding the redirect URL, including users who let their session
  // lapse during checkout. Body contains only static HTML + deep links.
  '/v1/billing/success',
  '/v1/billing/cancel',
];

function isPublicPath(path: string): boolean {
  // Exact-prefix match: trailing-slash entries match any sub-path;
  // bare entries (no trailing slash) require exact equality or a sub-path
  // separator so /v1/health never accidentally matches /v1/healthz.
  return PUBLIC_PATHS.some((p) =>
    p.endsWith('/')
      ? path.startsWith(p)
      : path === p || path.startsWith(p + '/'),
  );
}

// ---------------------------------------------------------------------------
// Clerk JWT verification helper
// ---------------------------------------------------------------------------

/**
 * Derives the expected Clerk issuer URL from the JWKS URL.
 * Example: "https://clerk.example.com/.well-known/jwks.json" → "https://clerk.example.com"
 */
function deriveIssuerFromJwksUrl(jwksUrl: string): string {
  return jwksUrl.replace(/\/\.well-known\/jwks\.json$/, '');
}

async function verifyClerkJWT(
  token: string,
  jwksUrl: string | undefined,
  audience: string | undefined,
): Promise<{
  sub: string;
  email?: string;
  emailVerified: boolean;
  factorVerificationAge?: [number, number];
}> {
  if (!jwksUrl) {
    throw new Error('CLERK_JWKS_URL is not configured');
  }

  // [SEC-1 / BUG-717] Audience validation MUST be enforced. When audience is
  // undefined the underlying verifyJWT() silently skips the aud claim check —
  // allowing a token minted for app-A to authenticate to app-B if both share
  // the same Clerk instance (shared JWKS). Reject the token immediately here
  // so misconfiguration is visible as a 401 rather than a silent bypass.
  // Note: env-validation (config.ts STAGING_AND_PRODUCTION_REQUIRED_KEYS)
  // also hard-fails at startup for staging+production to catch this earlier.
  if (!audience) {
    throw new Error(
      'CLERK_AUDIENCE is not configured — JWT audience validation is disabled',
    );
  }

  // Decode header to find the signing key ID
  const header = decodeJWTHeader(token);
  if (!header.kid) {
    throw new Error('JWT header missing kid');
  }

  // [BUG-492] lookupJWKByKid handles key-rotation: if kid is absent from the
  // cached JWKS, it forces a single re-fetch (deduped across concurrent
  // requests) before throwing. This prevents up to 10-minute auth failures
  // after Clerk key rotation.
  const jwk: JWK = await lookupJWKByKid(jwksUrl, header.kid);

  // Verify signature and validate claims (issuer + audience)
  const issuer = deriveIssuerFromJwksUrl(jwksUrl);
  // [BUG-902] Tighten the iat max-age ceiling for Clerk tokens. The generic
  // verifyJWT default is 24h (a conservative bound for arbitrary IdPs), but
  // Clerk rotates session tokens every ~1 min, so a leaked-but-unexpired token
  // should never be accepted for anywhere near 24h. 10 minutes leaves ample
  // headroom over the ~1 min TTL (clock skew, refresh races) while shrinking the
  // leaked-token acceptance window ~144x. This is defense-in-depth on top of the
  // exp check — a legitimate Clerk token (iat ≈ now) always passes.
  const rawPayload = await verifyJWT(token, jwk, {
    issuer,
    audience,
    maxAgeSec: CLERK_TOKEN_MAX_AGE_SEC,
  });

  // [F-021] Runtime validation at the JWT trust boundary. verifyJWT returns a
  // JSON.parse cast; sub/email may be absent or wrong type in a malformed token.
  const claims = clerkJWTClaimsSchema.safeParse(rawPayload);
  if (!claims.success) {
    throw new Error(
      'Invalid JWT: missing or invalid required claims (sub must be a non-empty string)',
    );
  }

  return {
    sub: claims.data.sub,
    email: claims.data.email,
    emailVerified: claims.data.email_verified === true,
    ...(claims.data.fva !== undefined
      ? { factorVerificationAge: claims.data.fva }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Hono middleware
// ---------------------------------------------------------------------------

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  if (isPublicPath(c.req.path)) {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json(
      {
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Missing or invalid authorization header',
      },
      401,
    );
  }

  const token = authHeader.slice(7);

  try {
    const result = await verifyClerkJWT(
      token,
      c.env.CLERK_JWKS_URL,
      c.env.CLERK_AUDIENCE,
    );
    c.set('user', {
      userId: result.sub,
      email: result.email,
      emailVerified: result.emailVerified,
      ...(result.factorVerificationAge !== undefined
        ? { factorVerificationAge: result.factorVerificationAge }
        : {}),
    });
    return next();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isInfraFailure =
      /fetch|JWKS|network|abort/i.test(message) ||
      (err instanceof Error && err.name === 'AbortError');

    if (isInfraFailure) {
      logger.warn('JWKS/network failure during JWT verification', {
        error: message,
        path: c.req.path,
      });
      captureException(err, { requestPath: c.req.path });

      // [BUG — JWKS infra outage → mass forced sign-out] A JWKS/network fetch
      // failure is NOT a token-validation failure: the user's token may be
      // perfectly valid; we simply could not reach Clerk to fetch the signing
      // key. Returning 401 here makes the mobile client treat the session as
      // expired (api-client.ts signs out on res.status === 401), so a Clerk
      // JWKS outage would force-sign-out every active user simultaneously.
      // Return 503 with Retry-After so the client retries the request rather
      // than nuking the session. A genuinely invalid/expired token still falls
      // through to the 401 below.
      c.header('Retry-After', '30');
      return c.json(
        {
          code: ERROR_CODES.SERVICE_UNAVAILABLE,
          message: 'Authentication service temporarily unavailable',
        },
        503,
      );
    } else {
      // [BUG-1] Non-infra (token-validation) failures were previously only
      // recorded via Sentry breadcrumb — dropped when no exception fires —
      // so a sustained spike of bad/expired/forged tokens was invisible to
      // alerting. Emit a structured warn log instead; ops alerts run off
      // 24h log-aggregation volume. We deliberately do NOT fire a Sentry
      // `captureMessage` here: under a token-flood (bad clients, brute
      // force) this path runs on every request and would burn Sentry quota
      // / bury real signal. `captureException` is reserved for infra.
      const errorName = err instanceof Error ? err.name : 'Unknown';
      logger.warn('JWT validation failed', {
        error: message,
        errorName,
        path: c.req.path,
      });
      addBreadcrumb('JWT validation failed', 'auth');
    }

    return c.json(
      { code: ERROR_CODES.UNAUTHORIZED, message: 'Invalid or expired token' },
      401,
    );
  }
});
