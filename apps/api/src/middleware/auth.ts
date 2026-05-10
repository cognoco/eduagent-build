import { createMiddleware } from 'hono/factory';
import { ERROR_CODES } from '@eduagent/schemas';
import { decodeJWTHeader, fetchJWKS, verifyJWT } from './jwt';
import type { JWK } from './jwt';
import { captureException, addBreadcrumb } from '../services/sentry';
import { createLogger } from '../services/logger';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  userId: string;
  email?: string;
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
  '/v1/stripe/',
  '/v1/revenuecat/webhook',
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
): Promise<{ sub: string; email?: string }> {
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

  // Fetch JWKS and locate the matching key
  const jwks = await fetchJWKS(jwksUrl);
  const jwk: JWK | undefined = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new Error(`No matching JWK found for kid: ${header.kid}`);
  }

  // Verify signature and validate claims (issuer + audience)
  const issuer = deriveIssuerFromJwksUrl(jwksUrl);
  const payload = await verifyJWT(token, jwk, { issuer, audience });

  return {
    sub: payload.sub,
    email: payload.email as string | undefined,
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
    } else {
      addBreadcrumb('JWT validation failed', 'auth');
    }

    return c.json(
      { code: ERROR_CODES.UNAUTHORIZED, message: 'Invalid or expired token' },
      401,
    );
  }
});
